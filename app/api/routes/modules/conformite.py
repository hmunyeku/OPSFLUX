"""Conformite (compliance) module routes — types, rules, records."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import and_, case, select, func as sqla_func, literal, any_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import check_verified_lock, get_current_entity, get_current_user, require_module_enabled, require_permission
from app.core.database import get_db
from app.core.references import generate_reference
from app.services.core.delete_service import delete_entity, get_delete_policy
from app.services.modules import compliance_service
from app.core.events import emit_event
from app.core.pagination import PaginationParams, paginate
from app.models.common import (
    ComplianceType, ComplianceRule, ComplianceRuleHistory, ComplianceRecord, ComplianceExemption,
    Entity, JobPosition, TierContactTransfer, TierContact, Tier, Attachment,
    User, UserEmail, Phone, Setting,
)
from app.schemas.common import (
    PaginatedResponse,
    ComplianceTypeCreate, ComplianceTypeRead, ComplianceTypeUpdate,
    ComplianceRuleCreate, ComplianceRuleRead, ComplianceRuleUpdate, ComplianceRuleHistoryRead,
    ComplianceRecordCreate, ComplianceRecordRead, ComplianceRecordUpdate,
    ComplianceCheckResult,
    ComplianceExemptionCreate, ComplianceExemptionRead, ComplianceExemptionUpdate,
    JobPositionCreate, JobPositionRead, JobPositionUpdate,
    TierContactTransferCreate, TierContactTransferRead,
)
router = APIRouter(
    prefix="/api/v1/conformite",
    tags=["conformite"],
    dependencies=[require_module_enabled("conformite")],
)
def _snapshot_rule(rule: ComplianceRule) -> dict:
    """Create a JSON snapshot of a rule's current state for history."""
    return {
        "compliance_type_id": str(rule.compliance_type_id),
        "target_type": rule.target_type,
        "target_value": rule.target_value,
        "description": rule.description,
        "active": rule.active,
        "version": rule.version,
        "priority": rule.priority,
        "override_validity_days": rule.override_validity_days,
        "grace_period_days": rule.grace_period_days,
        "renewal_reminder_days": rule.renewal_reminder_days,
        "effective_from": str(rule.effective_from) if rule.effective_from else None,
        "effective_to": str(rule.effective_to) if rule.effective_to else None,
        "condition_json": rule.condition_json,
    }

async def _count_record_proof(
    db: AsyncSession,
    *,
    record_type: str,
    record: object,
) -> int:
    """Count supporting proof for a verifiable record.

    Proof can come from polymorphic attachments or from legacy document_url fields
    still used by several compliance-related sub-models.
    """
    attachment_count = 0
    record_id = getattr(record, "id", None)
    if record_id is not None:
        attachment_count = int(
            (
                await db.scalar(
                    select(sqla_func.count()).select_from(Attachment).where(
                        Attachment.owner_type == record_type,
                        Attachment.owner_id == record_id,
                        Attachment.archived == False,
                    )
                )
            )
            or 0
        )
    legacy_document_count = 1 if getattr(record, "document_url", None) else 0
    return attachment_count + legacy_document_count


async def _get_external_user_tier_ids(
    db: AsyncSession,
    current_user: User,
    entity_id: UUID,
) -> set[UUID] | None:
    if current_user.user_type != "external":
        return None
    from app.models.common import UserTierLink

    linked = await db.execute(
        select(UserTierLink.tier_id)
        .join(Tier, Tier.id == UserTierLink.tier_id)
        .where(
            UserTierLink.user_id == current_user.id,
            Tier.entity_id == entity_id,
            Tier.archived == False,
        )
    )
    return {row[0] for row in linked.all()}


async def _assert_external_owner_access(
    db: AsyncSession,
    current_user: User,
    entity_id: UUID,
    *,
    owner_type: str,
    owner_id: UUID,
) -> None:
    if current_user.user_type != "external":
        return
    if owner_type == "user":
        if owner_id != current_user.id:
            raise HTTPException(status_code=404, detail="Owner not found")
        return
    if owner_type != "tier_contact":
        raise HTTPException(status_code=403, detail="External users cannot access this owner type")

    linked_tier_ids = await _get_external_user_tier_ids(db, current_user, entity_id)
    if not linked_tier_ids:
        raise HTTPException(status_code=404, detail="Owner not found")
    result = await db.execute(
        select(TierContact.id).where(
            TierContact.id == owner_id,
            TierContact.tier_id.in_(linked_tier_ids),
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Owner not found")


def _apply_external_record_scope(query, current_user: User, entity_id: UUID):
    if current_user.user_type != "external":
        return query

    from app.models.common import UserTierLink

    linked_contact_ids = (
        select(TierContact.id)
        .join(Tier, Tier.id == TierContact.tier_id)
        .join(UserTierLink, UserTierLink.tier_id == Tier.id)
        .where(
            UserTierLink.user_id == current_user.id,
            Tier.entity_id == entity_id,
            Tier.archived == False,
        )
    )
    return query.where(
        or_(
            and_(ComplianceRecord.owner_type == "user", ComplianceRecord.owner_id == current_user.id),
            and_(ComplianceRecord.owner_type == "tier_contact", ComplianceRecord.owner_id.in_(linked_contact_ids)),
        )
    )


# ── Dashboard KPIs ─────────────────────────────────────────────────────────


@router.get("/dashboard-kpis", dependencies=[require_permission("conformite.record.read")])
async def get_compliance_dashboard_kpis(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Return aggregated compliance KPIs for the entity dashboard."""
    now = datetime.now(timezone.utc)
    soon = now + timedelta(days=30)

    # ── Aggregate counts by status ──
    status_q = (
        select(
            ComplianceRecord.status,
            sqla_func.count().label("cnt"),
        )
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,
        )
        .group_by(ComplianceRecord.status)
    )
    status_rows = (await db.execute(status_q)).all()
    counts = {row.status: row.cnt for row in status_rows}

    total_records = sum(counts.values())
    valid_count = counts.get("valid", 0)
    expired_count = counts.get("expired", 0)
    pending_count = counts.get("pending", 0)

    # Compliance rate: valid / (valid + expired), avoid div-by-zero
    denom = valid_count + expired_count
    compliance_rate = round((valid_count / denom) * 100, 1) if denom > 0 else 0.0

    # ── Expiring soon (valid records with expires_at in next 30 days) ──
    expiring_soon_q = (
        select(sqla_func.count())
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,
            ComplianceRecord.status == "valid",
            ComplianceRecord.expires_at != None,  # noqa: E711
            ComplianceRecord.expires_at >= now,
            ComplianceRecord.expires_at <= soon,
        )
    )
    expiring_soon_count = (await db.execute(expiring_soon_q)).scalar() or 0

    # ── Breakdown by category ──
    cat_q = (
        select(
            ComplianceType.category,
            sqla_func.count().label("total"),
            sqla_func.sum(case((ComplianceRecord.status == "valid", 1), else_=0)).label("valid"),
            sqla_func.sum(case((ComplianceRecord.status == "expired", 1), else_=0)).label("expired"),
            sqla_func.sum(case((ComplianceRecord.status == "pending", 1), else_=0)).label("pending"),
        )
        .join(ComplianceType, ComplianceRecord.compliance_type_id == ComplianceType.id)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,
        )
        .group_by(ComplianceType.category)
        .order_by(ComplianceType.category)
    )
    cat_rows = (await db.execute(cat_q)).all()
    by_category = [
        {
            "category": r.category,
            "total": r.total,
            "valid": r.valid or 0,
            "expired": r.expired or 0,
            "pending": r.pending or 0,
        }
        for r in cat_rows
    ]

    by_status = [
        {"status": s, "count": counts.get(s, 0)}
        for s in ("valid", "expired", "pending", "rejected")
    ]

    # ── Recent expirations (last 10 expired records) ──
    recent_q = (
        select(
            ComplianceRecord.id,
            ComplianceType.name.label("type_name"),
            ComplianceRecord.owner_type,
            ComplianceRecord.expires_at,
        )
        .join(ComplianceType, ComplianceRecord.compliance_type_id == ComplianceType.id)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,
            ComplianceRecord.status == "expired",
        )
        .order_by(ComplianceRecord.expires_at.desc())
        .limit(10)
    )
    recent_rows = (await db.execute(recent_q)).all()
    recent_expirations = [
        {
            "id": str(r.id),
            "type_name": r.type_name,
            "owner_type": r.owner_type,
            "expired_at": r.expires_at.isoformat() if r.expires_at else None,
            "days_overdue": (now - r.expires_at).days if r.expires_at else 0,
        }
        for r in recent_rows
    ]

    # ── Upcoming expirations (next 10 to expire) ──
    upcoming_q = (
        select(
            ComplianceRecord.id,
            ComplianceType.name.label("type_name"),
            ComplianceRecord.owner_type,
            ComplianceRecord.expires_at,
        )
        .join(ComplianceType, ComplianceRecord.compliance_type_id == ComplianceType.id)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,
            ComplianceRecord.status == "valid",
            ComplianceRecord.expires_at != None,  # noqa: E711
            ComplianceRecord.expires_at >= now,
        )
        .order_by(ComplianceRecord.expires_at.asc())
        .limit(10)
    )
    upcoming_rows = (await db.execute(upcoming_q)).all()
    upcoming_expirations = [
        {
            "id": str(r.id),
            "type_name": r.type_name,
            "owner_type": r.owner_type,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "days_remaining": (r.expires_at - now).days if r.expires_at else 0,
        }
        for r in upcoming_rows
    ]

    return {
        "total_records": total_records,
        "valid_count": valid_count,
        "expired_count": expired_count,
        "pending_count": pending_count,
        "expiring_soon_count": expiring_soon_count,
        "compliance_rate": compliance_rate,
        "by_category": by_category,
        "by_status": by_status,
        "recent_expirations": recent_expirations,
        "upcoming_expirations": upcoming_expirations,
    }


# ── Compliance Types (referentiel) ────────────────────────────────────────


@router.get("/types", response_model=PaginatedResponse[ComplianceTypeRead], dependencies=[require_permission("conformite.type.read")])
async def list_compliance_types(
    category: str | None = None,
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ComplianceType).where(
        ComplianceType.entity_id == entity_id,
        ComplianceType.active == True,
    )
    if category:
        query = query.where(ComplianceType.category == category)
    if search:
        like = f"%{search}%"
        query = query.where(ComplianceType.name.ilike(like) | ComplianceType.code.ilike(like))
    query = query.order_by(ComplianceType.category, ComplianceType.name)
    return await paginate(db, query, pagination)


@router.post("/types", response_model=ComplianceTypeRead, status_code=201)
async def create_compliance_type(
    body: ComplianceTypeCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("conformite.type.create"),
    db: AsyncSession = Depends(get_db),
):
    ct = ComplianceType(entity_id=entity_id, **body.model_dump())
    db.add(ct)
    await db.commit()
    await db.refresh(ct)
    return ct


@router.patch("/types/{type_id}", response_model=ComplianceTypeRead)
async def update_compliance_type(
    type_id: UUID,
    body: ComplianceTypeUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("conformite.type.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceType).where(ComplianceType.id == type_id, ComplianceType.entity_id == entity_id)
    )
    ct = result.scalars().first()
    if not ct:
        raise HTTPException(404, "Compliance type not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ct, field, value)
    await db.commit()
    await db.refresh(ct)
    return ct


@router.delete("/types/{type_id}")
async def delete_compliance_type(
    type_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.type.delete"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceType).where(ComplianceType.id == type_id, ComplianceType.entity_id == entity_id)
    )
    ct = result.scalars().first()
    if not ct:
        raise HTTPException(404, "Compliance type not found")
    await delete_entity(ct, db, "compliance_type", entity_id=ct.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Compliance type archived"}


# ── Compliance Rules ──────────────────────────────────────────────────────


@router.get("/rules", response_model=list[ComplianceRuleRead], dependencies=[require_permission("conformite.rule.read")])
async def list_compliance_rules(
    compliance_type_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ComplianceRule).where(
        ComplianceRule.entity_id == entity_id,
        ComplianceRule.active == True,
    )
    if compliance_type_id:
        query = query.where(ComplianceRule.compliance_type_id == compliance_type_id)
    result = await db.execute(query.order_by(ComplianceRule.created_at))
    return result.scalars().all()


@router.post("/rules", response_model=ComplianceRuleRead, status_code=201)
async def create_compliance_rule(
    body: ComplianceRuleCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.rule.create"),
    db: AsyncSession = Depends(get_db),
):
    rule = ComplianceRule(entity_id=entity_id, changed_by=current_user.id, **body.model_dump())
    db.add(rule)
    await db.flush()
    # Log creation in history
    db.add(ComplianceRuleHistory(
        rule_id=rule.id, version=1, action="created",
        snapshot=_snapshot_rule(rule),
        changed_by=current_user.id,
    ))
    await db.commit()
    await db.refresh(rule)

    # Emit event for notification handlers (after commit)
    await emit_event("conformite.rule.created", {
        "rule_id": str(rule.id),
        "entity_id": str(entity_id),
        "target_type": rule.target_type,
        "target_value": rule.target_value,
        "description": rule.description or "",
        "created_by": str(current_user.id),
    })

    return rule


@router.patch("/rules/{rule_id}", response_model=ComplianceRuleRead)
async def update_compliance_rule(
    rule_id: UUID,
    body: ComplianceRuleUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.rule.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceRule).where(ComplianceRule.id == rule_id, ComplianceRule.entity_id == entity_id)
    )
    rule = result.scalars().first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    # Snapshot before update
    db.add(ComplianceRuleHistory(
        rule_id=rule.id, version=rule.version, action="updated",
        snapshot=_snapshot_rule(rule),
        change_reason=body.change_reason,
        changed_by=current_user.id,
    ))
    # Apply changes
    update_data = body.model_dump(exclude_unset=True, exclude={"change_reason"})
    for field, value in update_data.items():
        setattr(rule, field, value)
    rule.version += 1
    rule.changed_by = current_user.id
    rule.change_reason = body.change_reason
    await db.commit()
    await db.refresh(rule)

    # Emit event for notification handlers (after commit)
    await emit_event("conformite.rule.updated", {
        "rule_id": str(rule.id),
        "entity_id": str(entity_id),
        "target_type": rule.target_type,
        "target_value": rule.target_value,
        "description": rule.description or "",
        "updated_by": str(current_user.id),
    })

    return rule


@router.delete("/rules/{rule_id}")
async def delete_compliance_rule(
    rule_id: UUID,
    force: bool = False,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.rule.delete"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceRule).where(ComplianceRule.id == rule_id, ComplianceRule.entity_id == entity_id)
    )
    rule = result.scalars().first()
    if not rule:
        raise HTTPException(404, "Rule not found")

    # Determine if this is a draft (v1, never modified, no children) — can always be hard-deleted
    is_draft = rule.version <= 1 and not rule.change_reason

    if is_draft or force:
        # Draft/force: hard delete — no history needed for unused errors/drafts
        await delete_entity(rule, db, "compliance_rule", entity_id=rule.id, user_id=current_user.id)
        await db.commit()
        return {"detail": "Rule deleted"}

    # Published rule: respect configurable delete policy
    policy = await get_delete_policy("compliance_rule", db, entity_id=entity_id)
    mode = policy.get("mode", "soft")

    if mode == "hard":
        # Policy says hard delete even for published rules
        db.add(ComplianceRuleHistory(
            rule_id=rule.id, version=rule.version, action="archived",
            snapshot=_snapshot_rule(rule), changed_by=current_user.id,
        ))
        await db.flush()
        await delete_entity(rule, db, "compliance_rule", entity_id=rule.id, user_id=current_user.id)
        await db.commit()
        return {"detail": "Rule deleted (with history snapshot)"}
    else:
        # soft / soft_purge: archive with history snapshot
        db.add(ComplianceRuleHistory(
            rule_id=rule.id, version=rule.version, action="archived",
            snapshot=_snapshot_rule(rule), changed_by=current_user.id,
        ))
        rule.active = False
        rule.effective_to = datetime.now(timezone.utc).date()
        rule.changed_by = current_user.id
        rule.change_reason = "Archived"
        await db.commit()
        return {"detail": "Rule archived"}


@router.get("/rules/{rule_id}/history", response_model=list[ComplianceRuleHistoryRead], dependencies=[require_permission("conformite.rule.read")])
async def get_rule_history(
    rule_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the change history for a specific compliance rule."""
    # Verify the rule belongs to this entity
    rule_check = await db.execute(
        select(ComplianceRule.id).where(ComplianceRule.id == rule_id, ComplianceRule.entity_id == entity_id)
    )
    if not rule_check.scalar_one_or_none():
        raise HTTPException(404, "Rule not found")
    result = await db.execute(
        select(ComplianceRuleHistory)
        .where(ComplianceRuleHistory.rule_id == rule_id)
        .order_by(ComplianceRuleHistory.changed_at.desc())
    )
    return result.scalars().all()


# ── Compliance Records ────────────────────────────────────────────────────


@router.get("/records", response_model=PaginatedResponse[ComplianceRecordRead], dependencies=[require_permission("conformite.record.read")])
async def list_compliance_records(
    owner_type: str | None = None,
    owner_id: UUID | None = None,
    compliance_type_id: UUID | None = None,
    status: str | None = None,
    category: str | None = None,
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    attachment_sq = (
        select(
            Attachment.owner_id.label("record_id"),
            sqla_func.count(Attachment.id).label("attachment_count"),
        )
        .where(
            Attachment.owner_type == "compliance_record",
            Attachment.archived == False,
        )
        .group_by(Attachment.owner_id)
        .subquery()
    )
    query = (
        select(
            ComplianceRecord,
            ComplianceType.name.label("type_name"),
            ComplianceType.category.label("type_category"),
            sqla_func.coalesce(attachment_sq.c.attachment_count, 0).label("attachment_count"),
        )
        .join(ComplianceType, ComplianceRecord.compliance_type_id == ComplianceType.id)
        .outerjoin(attachment_sq, attachment_sq.c.record_id == ComplianceRecord.id)
        .where(ComplianceRecord.entity_id == entity_id, ComplianceRecord.active == True)
    )
    query = _apply_external_record_scope(query, current_user, entity_id)
    # Exclude rejected records by default (unless explicitly filtered)
    if status:
        query = query.where(ComplianceRecord.status == status)
    else:
        query = query.where(ComplianceRecord.status != "rejected")
    if owner_type:
        query = query.where(ComplianceRecord.owner_type == owner_type)
    if owner_id:
        query = query.where(ComplianceRecord.owner_id == owner_id)
    if compliance_type_id:
        query = query.where(ComplianceRecord.compliance_type_id == compliance_type_id)
    if category:
        query = query.where(ComplianceType.category == category)
    if search:
        like = f"%{search}%"
        query = query.where(ComplianceType.name.ilike(like) | ComplianceRecord.reference_number.ilike(like))
    query = query.order_by(ComplianceRecord.created_at.desc())

    # Auto-expire records that are past their expiry date
    now = datetime.now(timezone.utc)
    expire_stmt = (
        select(ComplianceRecord)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,  # noqa: E712
            ComplianceRecord.status == "valid",
            ComplianceRecord.expires_at != None,  # noqa: E711
            ComplianceRecord.expires_at < now,
        )
    )
    expired_result = await db.execute(expire_stmt)
    expired_ids: list[UUID] = []
    for rec in expired_result.scalars().all():
        rec.status = "expired"
        expired_ids.append(rec.id)
    await db.flush()

    # Emit events for newly expired records
    if expired_ids:
        for eid in expired_ids:
            await emit_event("conformite.record.expired", {"record_id": str(eid), "entity_id": str(entity_id)})

    def _transform(row):
        try:
            rec = row[0] if hasattr(row, '__getitem__') else getattr(row, 'ComplianceRecord', row)
            d = {c.key: getattr(rec, c.key) for c in rec.__table__.columns}
            d["type_name"] = row[1] if hasattr(row, '__getitem__') else getattr(row, 'type_name', None)
            d["type_category"] = row[2] if hasattr(row, '__getitem__') else getattr(row, 'type_category', None)
            d["attachment_count"] = int((row[3] if hasattr(row, '__getitem__') else getattr(row, 'attachment_count', 0)) or 0)
            return d
        except (IndexError, AttributeError):
            # Fallback: return the record as-is if row format is unexpected
            if hasattr(row, '__table__'):
                return {c.key: getattr(row, c.key) for c in row.__table__.columns}
            return row

    return await paginate(db, query, pagination, transform=_transform)


@router.post("/records", response_model=ComplianceRecordRead, status_code=201)
async def create_compliance_record(
    body: ComplianceRecordCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.record.create"),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump()
    await _assert_external_owner_access(
        db,
        current_user,
        entity_id,
        owner_type=data["owner_type"],
        owner_id=data["owner_id"],
    )

    # ── Pre-submission validation against ComplianceType + ComplianceRule ──
    ct = await db.get(ComplianceType, data["compliance_type_id"])
    if not ct:
        raise HTTPException(400, "Type de conformité introuvable")

    now = datetime.now(timezone.utc)
    errors: list[str] = []

    # 1. Already expired at submission?
    if data.get("expires_at"):
        expires = data["expires_at"]
        if hasattr(expires, 'tzinfo') and expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < now:
            errors.append("Le document est déjà expiré à la date de soumission.")

    # 2. Check validity_days from type (or rule override): issued_at + validity_days < now?
    issued_at = data.get("issued_at")
    if issued_at and ct.validity_days:
        if hasattr(issued_at, 'tzinfo') and issued_at.tzinfo is None:
            issued_at = issued_at.replace(tzinfo=timezone.utc)
        # Find applicable rule for potential override
        rule_q = await db.execute(
            select(ComplianceRule).where(
                ComplianceRule.compliance_type_id == ct.id,
                ComplianceRule.entity_id == entity_id,
                ComplianceRule.active == True,
            ).limit(1)
        )
        rule = rule_q.scalar_one_or_none()
        effective_validity = (rule.override_validity_days if rule and rule.override_validity_days else ct.validity_days)
        grace_days = (rule.grace_period_days if rule and rule.grace_period_days else 0) or 0

        from datetime import timedelta
        max_expiry = issued_at + timedelta(days=effective_validity + grace_days)
        if max_expiry < now:
            errors.append(
                f"Le document a dépassé la validité maximale ({effective_validity}j"
                + (f" + {grace_days}j de grâce" if grace_days else "")
                + f") depuis la date d'émission."
            )

        # 3. Auto-compute expires_at if not provided
        if not data.get("expires_at") and effective_validity:
            data["expires_at"] = issued_at + timedelta(days=effective_validity)

    if errors:
        raise HTTPException(422, detail={"message": "Validation échouée", "errors": errors})

    # Security: force status to pending at creation — only verification promotes to valid
    data["status"] = "pending"
    data["verification_status"] = "pending"
    rec = ComplianceRecord(
        entity_id=entity_id,
        created_by=current_user.id,
        **data,
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    # Enrich with type info
    ct = await db.get(ComplianceType, rec.compliance_type_id)
    d = {c.key: getattr(rec, c.key) for c in rec.__table__.columns}
    d["type_name"] = ct.name if ct else None
    d["type_category"] = ct.category if ct else None
    d["attachment_count"] = 0
    return d


@router.patch("/records/{record_id}", response_model=ComplianceRecordRead)
async def update_compliance_record(
    record_id: UUID,
    body: ComplianceRecordUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.record.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceRecord).where(ComplianceRecord.id == record_id, ComplianceRecord.entity_id == entity_id)
    )
    rec = result.scalars().first()
    if not rec:
        raise HTTPException(404, "Record not found")
    await _assert_external_owner_access(
        db,
        current_user,
        entity_id,
        owner_type=rec.owner_type,
        owner_id=rec.owner_id,
    )
    # Block updates on verified records unless user has conformite.verify permission
    await check_verified_lock(rec, current_user, entity_id=entity_id, db=db)
    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(rec, field, value)
    # Auto-fix status when expiry date is corrected
    if "expires_at" in updates and rec.status == "expired":
        new_expires = updates["expires_at"]
        now = datetime.now(timezone.utc)
        if new_expires is None or new_expires > now:
            # Date corrected to future — restore to valid (if verified) or pending
            rec.status = "valid" if rec.verification_status == "verified" else "pending"
    await db.commit()
    await db.refresh(rec)
    ct = await db.get(ComplianceType, rec.compliance_type_id)
    d = {c.key: getattr(rec, c.key) for c in rec.__table__.columns}
    d["type_name"] = ct.name if ct else None
    d["type_category"] = ct.category if ct else None
    d["attachment_count"] = 0
    return d


@router.delete("/records/{record_id}")
async def delete_compliance_record(
    record_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.record.delete"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceRecord).where(ComplianceRecord.id == record_id, ComplianceRecord.entity_id == entity_id)
    )
    rec = result.scalars().first()
    if not rec:
        raise HTTPException(404, "Record not found")
    await _assert_external_owner_access(
        db,
        current_user,
        entity_id,
        owner_type=rec.owner_type,
        owner_id=rec.owner_id,
    )
    await delete_entity(rec, db, "compliance_record", entity_id=rec.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Record archived"}


# ── Expiring & Non-Compliant ─────────────────────────────────────────────


from datetime import timedelta


class ExpiringRecordRead(BaseModel):
    id: UUID
    compliance_type_id: UUID
    type_name: str | None = None
    type_category: str | None = None
    owner_type: str
    owner_id: UUID
    status: str
    expires_at: datetime | None = None
    days_remaining: int | None = None


@router.get("/expiring", response_model=list[ExpiringRecordRead], dependencies=[require_permission("conformite.record.read")])
async def list_expiring_records(
    days: int = 30,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List compliance records expiring within N days (default 30)."""
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=days)

    # First auto-expire overdue records
    expire_stmt = (
        select(ComplianceRecord)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,  # noqa: E712
            ComplianceRecord.status == "valid",
            ComplianceRecord.expires_at != None,  # noqa: E711
            ComplianceRecord.expires_at < now,
        )
    )
    for rec in (await db.execute(expire_stmt)).scalars().all():
        rec.status = "expired"
    await db.flush()

    # Then fetch expiring-soon + already-expired
    query = (
        select(ComplianceRecord, ComplianceType.name.label("type_name"), ComplianceType.category.label("type_category"))
        .join(ComplianceType, ComplianceRecord.compliance_type_id == ComplianceType.id)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,  # noqa: E712
            ComplianceRecord.expires_at != None,  # noqa: E711
            ComplianceRecord.expires_at <= cutoff,
        )
        .order_by(ComplianceRecord.expires_at)
        .limit(100)
    )
    query = _apply_external_record_scope(query, current_user, entity_id)
    result = await db.execute(query)
    await db.commit()

    items = []
    for row in result.all():
        rec = row[0]
        remaining = (rec.expires_at - now).days if rec.expires_at and rec.expires_at > now else 0
        items.append(ExpiringRecordRead(
            id=rec.id,
            compliance_type_id=rec.compliance_type_id,
            type_name=row[1],
            type_category=row[2],
            owner_type=rec.owner_type,
            owner_id=rec.owner_id,
            status=rec.status,
            expires_at=rec.expires_at,
            days_remaining=remaining,
        ))

    # Emit events for records expiring within 30 days
    for item in items:
        if item.days_remaining is not None and 0 < item.days_remaining <= 30:
            await emit_event("pax.credential.expiring", {
                "record_id": str(item.id),
                "entity_id": str(entity_id),
                "owner_type": item.owner_type,
                "owner_id": str(item.owner_id),
                "days_remaining": item.days_remaining,
                "type_name": item.type_name,
            })

    return items


@router.get("/non-compliant", response_model=list[ExpiringRecordRead], dependencies=[require_permission("conformite.record.read")])
async def list_non_compliant_records(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all compliance records that are expired (most overdue first)."""
    now = datetime.now(timezone.utc)

    # Auto-expire overdue records
    expire_stmt = (
        select(ComplianceRecord)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,  # noqa: E712
            ComplianceRecord.status == "valid",
            ComplianceRecord.expires_at != None,  # noqa: E711
            ComplianceRecord.expires_at < now,
        )
    )
    for rec in (await db.execute(expire_stmt)).scalars().all():
        rec.status = "expired"
    await db.flush()

    # Fetch expired records
    query = (
        select(
            ComplianceRecord,
            ComplianceType.name.label("type_name"),
            ComplianceType.category.label("type_category"),
        )
        .join(ComplianceType, ComplianceRecord.compliance_type_id == ComplianceType.id)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,  # noqa: E712
            ComplianceRecord.status == "expired",
        )
        .order_by(ComplianceRecord.expires_at.asc())
        .limit(100)
    )
    query = _apply_external_record_scope(query, current_user, entity_id)
    result = await db.execute(query)
    await db.commit()

    items = []
    for row in result.all():
        rec = row[0]
        remaining = (rec.expires_at - now).days if rec.expires_at and rec.expires_at > now else 0
        items.append(ExpiringRecordRead(
            id=rec.id,
            compliance_type_id=rec.compliance_type_id,
            type_name=row[1],
            type_category=row[2],
            owner_type=rec.owner_type,
            owner_id=rec.owner_id,
            status=rec.status,
            expires_at=rec.expires_at,
            days_remaining=remaining,
        ))
    return items


# ── Compliance Check ──────────────────────────────────────────────────────


@router.get("/check/{owner_type}/{owner_id}", response_model=ComplianceCheckResult, dependencies=[require_permission("conformite.check")])
async def check_compliance(
    owner_type: str,
    owner_id: UUID,
    include_contextual: bool = False,
    asset_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check compliance status for an object.

    Compliance hierarchy:
    1. Account must be verified (at least one verified email or phone)
    2. Permanent rules must be satisfied (records with verification_status='verified')
    3. Contextual rules checked only when include_contextual=true
    4. is_compliant = account_verified AND no missing AND no expired AND no unverified records

    Records with verification_status != 'verified' count as unverified — they don't
    contribute to compliance even if their status is 'valid'.
    """
    await _assert_external_owner_access(
        db,
        current_user,
        entity_id,
        owner_type=owner_type,
        owner_id=owner_id,
    )
    verdict = await compliance_service.check_owner_compliance(
        db,
        owner_type=owner_type,
        owner_id=owner_id,
        entity_id=entity_id,
        include_contextual=include_contextual,
        asset_id=asset_id,
    )

    return ComplianceCheckResult(**verdict)


# ── Job Positions (fiches de poste) ─────────────────────────────────────


@router.get("/job-positions", response_model=PaginatedResponse[JobPositionRead], dependencies=[require_permission("conformite.jobposition.read")])
async def list_job_positions(
    department: str | None = None,
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(JobPosition).where(
        JobPosition.entity_id == entity_id,
        JobPosition.active == True,
    )
    if department:
        query = query.where(JobPosition.department == department)
    if search:
        like = f"%{search}%"
        query = query.where(JobPosition.name.ilike(like) | JobPosition.code.ilike(like))
    query = query.order_by(JobPosition.department, JobPosition.name)
    return await paginate(db, query, pagination)


@router.post("/job-positions", response_model=JobPositionRead, status_code=201)
async def create_job_position(
    body: JobPositionCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("conformite.jobposition.create"),
    db: AsyncSession = Depends(get_db),
):
    payload = body.model_dump()
    payload["code"] = (payload.get("code") or "").strip() or await generate_reference("JBP", db, entity_id=entity_id)
    jp = JobPosition(entity_id=entity_id, **payload)
    db.add(jp)
    await db.commit()
    await db.refresh(jp)
    return jp


@router.patch("/job-positions/{jp_id}", response_model=JobPositionRead)
async def update_job_position(
    jp_id: UUID,
    body: JobPositionUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("conformite.jobposition.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(JobPosition).where(JobPosition.id == jp_id, JobPosition.entity_id == entity_id)
    )
    jp = result.scalars().first()
    if not jp:
        raise HTTPException(404, "Job position not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(jp, field, value)
    await db.commit()
    await db.refresh(jp)
    return jp


@router.delete("/job-positions/{jp_id}")
async def delete_job_position(
    jp_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.jobposition.delete"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(JobPosition).where(JobPosition.id == jp_id, JobPosition.entity_id == entity_id)
    )
    jp = result.scalars().first()
    if not jp:
        raise HTTPException(404, "Job position not found")
    await delete_entity(jp, db, "job_position", entity_id=jp.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Job position archived"}


# ── Employee Transfers ───────────────────────────────────────────────────


@router.get("/transfers", response_model=PaginatedResponse[TierContactTransferRead], dependencies=[require_permission("conformite.transfer.read")])
async def list_transfers(
    contact_id: UUID | None = None,
    from_tier_id: UUID | None = None,
    to_tier_id: UUID | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List employee transfers with enriched names."""
    linked_tier_ids = await _get_external_user_tier_ids(db, current_user, entity_id)
    from_tier = Tier.__table__.alias("from_tier")
    to_tier = Tier.__table__.alias("to_tier")

    query = (
        select(
            TierContactTransfer,
            (TierContact.first_name + " " + TierContact.last_name).label("contact_name"),
            from_tier.c.name.label("from_tier_name"),
            to_tier.c.name.label("to_tier_name"),
        )
        .join(TierContact, TierContactTransfer.contact_id == TierContact.id)
        .join(from_tier, TierContactTransfer.from_tier_id == from_tier.c.id)
        .join(to_tier, TierContactTransfer.to_tier_id == to_tier.c.id)
        # Filter by entity via the contact's tier
        .where(TierContact.tier_id.in_(
            select(Tier.id).where(Tier.entity_id == entity_id)
        ))
    )
    if linked_tier_ids is not None:
        query = query.where(
            or_(
                TierContactTransfer.from_tier_id.in_(linked_tier_ids),
                TierContactTransfer.to_tier_id.in_(linked_tier_ids),
                TierContact.tier_id.in_(linked_tier_ids),
            )
        )
    if contact_id:
        query = query.where(TierContactTransfer.contact_id == contact_id)
    if from_tier_id:
        query = query.where(TierContactTransfer.from_tier_id == from_tier_id)
    if to_tier_id:
        query = query.where(TierContactTransfer.to_tier_id == to_tier_id)
    query = query.order_by(TierContactTransfer.transfer_date.desc())

    def _transform(row):
        transfer = row[0]
        d = {c.key: getattr(transfer, c.key) for c in transfer.__table__.columns}
        d["contact_name"] = row[1]
        d["from_tier_name"] = row[2]
        d["to_tier_name"] = row[3]
        return d

    return await paginate(db, query, pagination, transform=_transform)


@router.post("/transfers", response_model=TierContactTransferRead, status_code=201)
async def create_transfer(
    body: TierContactTransferCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.transfer.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a transfer record and update the contact's tier_id."""
    # Validate contact exists
    contact = await db.get(TierContact, body.contact_id)
    if not contact:
        raise HTTPException(404, "Contact not found")
    await _assert_external_owner_access(
        db,
        current_user,
        entity_id,
        owner_type="tier_contact",
        owner_id=body.contact_id,
    )
    if current_user.user_type == "external":
        linked_tier_ids = await _get_external_user_tier_ids(db, current_user, entity_id)
        if not linked_tier_ids or body.from_tier_id not in linked_tier_ids or body.to_tier_id not in linked_tier_ids:
            raise HTTPException(status_code=403, detail="External users cannot transfer contacts outside their company scope")

    # Create transfer log
    transfer = TierContactTransfer(
        transferred_by=current_user.id,
        **body.model_dump(),
    )
    db.add(transfer)

    # Actually move the contact to the new tier
    contact.tier_id = body.to_tier_id

    await db.commit()
    await db.refresh(transfer)

    # Enrich response
    from_tier = await db.get(Tier, transfer.from_tier_id)
    to_tier = await db.get(Tier, transfer.to_tier_id)
    d = {c.key: getattr(transfer, c.key) for c in transfer.__table__.columns}
    d["contact_name"] = f"{contact.first_name} {contact.last_name}"
    d["from_tier_name"] = from_tier.name if from_tier else None
    d["to_tier_name"] = to_tier.name if to_tier else None
    return d


# ── Compliance Exemptions ────────────────────────────────────────────────


async def _enrich_exemption(db: AsyncSession, exemption) -> dict:
    """Build enriched dict for a ComplianceExemption row."""
    d = {c.key: getattr(exemption, c.key) for c in exemption.__table__.columns}
    # Record type info
    record = await db.get(ComplianceRecord, exemption.compliance_record_id)
    if record:
        ct = await db.get(ComplianceType, record.compliance_type_id)
        d["record_type_name"] = ct.name if ct else None
        d["record_type_category"] = ct.category if ct else None
        # Owner name
        if record.owner_type == "tier_contact":
            contact = await db.get(TierContact, record.owner_id)
            d["owner_name"] = f"{contact.first_name} {contact.last_name}" if contact else None
        elif record.owner_type == "tier":
            tier = await db.get(Tier, record.owner_id)
            d["owner_name"] = tier.name if tier else None
        elif record.owner_type == "user":
            user = await db.get(User, record.owner_id)
            d["owner_name"] = f"{user.first_name} {user.last_name}" if user else None
        else:
            d["owner_name"] = None
    else:
        d["record_type_name"] = None
        d["record_type_category"] = None
        d["owner_name"] = None
    # Approver / creator names
    if exemption.approved_by:
        approver = await db.get(User, exemption.approved_by)
        d["approver_name"] = f"{approver.first_name} {approver.last_name}" if approver else None
    else:
        d["approver_name"] = None
    creator = await db.get(User, exemption.created_by)
    d["creator_name"] = f"{creator.first_name} {creator.last_name}" if creator else None
    return d


@router.get("/exemptions", response_model=PaginatedResponse[ComplianceExemptionRead], dependencies=[require_permission("conformite.exemption.read")])
async def list_exemptions(
    status: str | None = None,
    compliance_type_id: UUID | None = None,
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List compliance exemptions with filters and pagination."""
    from datetime import date as date_type

    # Auto-expire exemptions past their end date
    today = date_type.today()
    expire_stmt = (
        select(ComplianceExemption)
        .where(
            ComplianceExemption.entity_id == entity_id,
            ComplianceExemption.active == True,  # noqa: E712
            ComplianceExemption.status == "approved",
            ComplianceExemption.end_date < today,
        )
    )
    for ex in (await db.execute(expire_stmt)).scalars().all():
        ex.status = "expired"
    await db.flush()

    query = (
        select(ComplianceExemption)
        .where(ComplianceExemption.entity_id == entity_id, ComplianceExemption.active == True)  # noqa: E712
    )
    if status:
        query = query.where(ComplianceExemption.status == status)
    if compliance_type_id:
        query = query.where(
            ComplianceExemption.compliance_record_id.in_(
                select(ComplianceRecord.id).where(ComplianceRecord.compliance_type_id == compliance_type_id)
            )
        )
    if search:
        like = f"%{search}%"
        query = query.where(ComplianceExemption.reason.ilike(like))
    query = query.order_by(ComplianceExemption.created_at.desc())

    # Count total
    count_query = select(sqla_func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0
    pages = (total + pagination.page_size - 1) // pagination.page_size if total > 0 else 0

    # Fetch page
    paginated = query.offset(pagination.offset).limit(pagination.page_size)
    result = await db.execute(paginated)
    exemptions = result.scalars().all()

    # Enrich each item (async)
    items = [await _enrich_exemption(db, ex) for ex in exemptions]

    return {
        "items": items,
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": pages,
    }


@router.post("/exemptions", response_model=ComplianceExemptionRead, status_code=201)
async def create_exemption(
    body: ComplianceExemptionCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.exemption.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new compliance exemption (status=pending)."""
    # Validate the compliance record exists and belongs to entity
    rec = await db.get(ComplianceRecord, body.compliance_record_id)
    if not rec or rec.entity_id != entity_id:
        raise HTTPException(404, "Compliance record not found")

    if body.end_date <= body.start_date:
        raise HTTPException(400, "end_date must be after start_date")

    exemption = ComplianceExemption(
        entity_id=entity_id,
        created_by=current_user.id,
        status="pending",
        **body.model_dump(),
    )
    db.add(exemption)
    await db.commit()
    await db.refresh(exemption)
    return await _enrich_exemption(db, exemption)


@router.patch("/exemptions/{exemption_id}", response_model=ComplianceExemptionRead)
async def update_exemption(
    exemption_id: UUID,
    body: ComplianceExemptionUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("conformite.exemption.update"),
    db: AsyncSession = Depends(get_db),
):
    """Update an exemption (change status, extend end_date, update conditions)."""
    result = await db.execute(
        select(ComplianceExemption).where(
            ComplianceExemption.id == exemption_id,
            ComplianceExemption.entity_id == entity_id,
        )
    )
    exemption = result.scalars().first()
    if not exemption:
        raise HTTPException(404, "Exemption not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(exemption, field, value)
    await db.commit()
    await db.refresh(exemption)
    return await _enrich_exemption(db, exemption)


@router.post("/exemptions/{exemption_id}/approve", response_model=ComplianceExemptionRead)
async def approve_exemption(
    exemption_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.exemption.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Approve a pending exemption."""
    result = await db.execute(
        select(ComplianceExemption).where(
            ComplianceExemption.id == exemption_id,
            ComplianceExemption.entity_id == entity_id,
        )
    )
    exemption = result.scalars().first()
    if not exemption:
        raise HTTPException(404, "Exemption not found")
    if exemption.status != "pending":
        raise HTTPException(400, f"Cannot approve exemption with status '{exemption.status}'")
    exemption.status = "approved"
    exemption.approved_by = current_user.id
    await db.commit()
    await db.refresh(exemption)

    await emit_event("conformite.exemption.approved", {
        "exemption_id": str(exemption.id),
        "entity_id": str(entity_id),
        "record_id": str(exemption.compliance_record_id),
        "approved_by": str(current_user.id),
    })

    return await _enrich_exemption(db, exemption)


class RejectExemptionBody(BaseModel):
    reason: str = Field(..., min_length=1)


@router.post("/exemptions/{exemption_id}/reject", response_model=ComplianceExemptionRead)
async def reject_exemption(
    exemption_id: UUID,
    body: RejectExemptionBody,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.exemption.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Reject a pending exemption (requires reason)."""
    result = await db.execute(
        select(ComplianceExemption).where(
            ComplianceExemption.id == exemption_id,
            ComplianceExemption.entity_id == entity_id,
        )
    )
    exemption = result.scalars().first()
    if not exemption:
        raise HTTPException(404, "Exemption not found")
    if exemption.status != "pending":
        raise HTTPException(400, f"Cannot reject exemption with status '{exemption.status}'")
    exemption.status = "rejected"
    exemption.approved_by = current_user.id
    exemption.rejection_reason = body.reason
    await db.commit()
    await db.refresh(exemption)

    await emit_event("conformite.exemption.rejected", {
        "exemption_id": str(exemption.id),
        "entity_id": str(entity_id),
        "record_id": str(exemption.compliance_record_id),
        "rejected_by": str(current_user.id),
    })

    return await _enrich_exemption(db, exemption)


@router.delete("/exemptions/{exemption_id}")
async def delete_exemption(
    exemption_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.exemption.delete"),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete an exemption."""
    result = await db.execute(
        select(ComplianceExemption).where(
            ComplianceExemption.id == exemption_id,
            ComplianceExemption.entity_id == entity_id,
        )
    )
    exemption = result.scalars().first()
    if not exemption:
        raise HTTPException(404, "Exemption not found")
    await delete_entity(exemption, db, "compliance_exemption", entity_id=exemption.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Exemption archived"}


# ── Verification / Validation workflow ───────────────────────────────────


class PendingVerificationItem(BaseModel):
    id: str
    record_type: str  # passport, visa, medical_check, compliance_record, etc.
    owner_type: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    description: str
    submitted_at: str
    verification_status: str


class VerifyAction(BaseModel):
    action: str = Field(..., pattern="^(verify|reject)$")
    rejection_reason: str | None = None


@router.get("/pending-verifications")
async def list_pending_verifications(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.verify"),
    db: AsyncSession = Depends(get_db),
):
    """List all records across verifiable models that are pending verification.

    Scoped to current entity: ComplianceRecords by entity_id,
    user sub-models by users belonging to the entity via group membership.
    """
    from app.models.common import (
        UserPassport, UserVisa, SocialSecurity, UserVaccine,
        MedicalCheck, DrivingLicense, UserGroup, UserGroupMember,
    )

    items: list[dict] = []

    # Subquery: user IDs belonging to the current entity
    entity_user_ids = (
        select(UserGroupMember.user_id)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(UserGroup.entity_id == entity_id, UserGroup.active == True)
        .distinct()
    )

    # ComplianceRecords (entity-scoped directly)
    cr_result = await db.execute(
        select(ComplianceRecord).where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,
            ComplianceRecord.verification_status == "pending",
        ).order_by(ComplianceRecord.created_at.desc())
    )
    for rec in cr_result.scalars().all():
        ct = await db.get(ComplianceType, rec.compliance_type_id)
        pj_required = True
        rule_q = await db.execute(
            select(ComplianceRule).where(
                ComplianceRule.compliance_type_id == rec.compliance_type_id,
                ComplianceRule.entity_id == entity_id,
                ComplianceRule.active == True,
            ).limit(1)
        )
        rule = rule_q.scalar_one_or_none()
        if rule:
            pj_required = rule.attachment_required
        items.append({
            "id": str(rec.id),
            "record_type": "compliance_record",
            "owner_type": rec.owner_type,
            "owner_id": str(rec.owner_id),
            "owner_name": None,
            "description": f"{ct.name if ct else rec.compliance_type_id} — {rec.issuer or 'N/A'}",
            "submitted_at": rec.created_at.isoformat(),
            "verification_status": rec.verification_status,
            "issued_at": rec.issued_at.isoformat() if rec.issued_at else None,
            "expires_at": rec.expires_at.isoformat() if rec.expires_at else None,
            "issuer": rec.issuer or None,
            "reference_number": rec.reference_number or None,
            "category": ct.category if ct else None,
            "type_name": ct.name if ct else None,
            "attachment_count": await _count_record_proof(db, record_type="compliance_record", record=rec),
            "attachment_required": pj_required,
        })

    # User sub-models — scoped to users in current entity
    # Each entry: (Model, record_type, desc_fn, extra_fields_fn)
    sub_models = [
        (
            UserPassport, "passport",
            lambda r: f"Passeport {r.number} — {r.country}",
            lambda r: {
                "issued_at": r.issue_date.isoformat() if r.issue_date else None,
                "expires_at": r.expiry_date.isoformat() if r.expiry_date else None,
                "issuer": r.country,
                "reference_number": r.number,
            },
        ),
        (
            UserVisa, "visa",
            lambda r: f"Visa {r.visa_type} — {r.country}",
            lambda r: {
                "issued_at": r.issue_date.isoformat() if r.issue_date else None,
                "expires_at": r.expiry_date.isoformat() if r.expiry_date else None,
                "issuer": r.country,
                "reference_number": r.number or None,
            },
        ),
        (
            SocialSecurity, "social_security",
            lambda r: f"Sécu sociale {r.country} — {r.number}",
            lambda r: {
                "issued_at": None,
                "expires_at": None,
                "issuer": r.country,
                "reference_number": r.number,
            },
        ),
        (
            UserVaccine, "vaccine",
            lambda r: f"Vaccin {r.vaccine_type}",
            lambda r: {
                "issued_at": r.date_administered.isoformat() if r.date_administered else None,
                "expires_at": r.expiry_date.isoformat() if r.expiry_date else None,
                "issuer": None,
                "reference_number": r.batch_number or None,
            },
        ),
        (
            DrivingLicense, "driving_license",
            lambda r: f"Permis {r.license_type} — {r.country}",
            lambda r: {
                "issued_at": None,
                "expires_at": r.expiry_date.isoformat() if r.expiry_date else None,
                "issuer": r.country,
                "reference_number": None,
            },
        ),
    ]

    for Model, rtype, desc_fn, extra_fn in sub_models:
        result = await db.execute(
            select(Model).where(
                Model.verification_status == "pending",
                Model.user_id.in_(entity_user_ids),
            ).order_by(Model.created_at.desc())
        )
        for rec in result.scalars().all():
            item = {
                "id": str(rec.id),
                "record_type": rtype,
                "owner_type": "user",
                "owner_id": str(rec.user_id),
                "owner_name": None,
                "description": desc_fn(rec),
                "submitted_at": rec.created_at.isoformat(),
                "verification_status": rec.verification_status,
                "category": None,
                "type_name": None,
                "attachment_count": await _count_record_proof(db, record_type=rtype, record=rec),
                "attachment_required": True,
            }
            item.update(extra_fn(rec))
            items.append(item)

    # MedicalChecks (polymorphic) — scope owner to entity users
    mc_result = await db.execute(
        select(MedicalCheck).where(
            MedicalCheck.verification_status == "pending",
            MedicalCheck.owner_id.in_(entity_user_ids),
        ).order_by(MedicalCheck.created_at.desc())
    )
    for rec in mc_result.scalars().all():
        items.append({
            "id": str(rec.id),
            "record_type": "medical_check",
            "owner_type": rec.owner_type,
            "owner_id": str(rec.owner_id),
            "owner_name": None,
            "description": f"Visite {rec.check_type} — {rec.provider or 'N/A'}",
            "submitted_at": rec.created_at.isoformat(),
            "verification_status": rec.verification_status,
            "issued_at": rec.check_date.isoformat() if rec.check_date else None,
            "expires_at": rec.expiry_date.isoformat() if rec.expiry_date else None,
            "issuer": rec.provider or None,
            "reference_number": None,
            "category": None,
            "type_name": None,
            "attachment_count": await _count_record_proof(db, record_type="medical_check", record=rec),
            "attachment_required": True,
        })

    # Enrich owner names
    user_ids = set()
    for item in items:
        if item["owner_type"] == "user" and item["owner_id"]:
            user_ids.add(item["owner_id"])
    if user_ids:
        users_result = await db.execute(
            select(User.id, User.first_name, User.last_name).where(
                User.id.in_([UUID(uid) for uid in user_ids])
            )
        )
        user_names = {str(r[0]): f"{r[1]} {r[2]}" for r in users_result.all()}
        for item in items:
            if item["owner_type"] == "user":
                item["owner_name"] = user_names.get(item["owner_id"])

    # Sort by submitted_at desc
    items.sort(key=lambda x: x["submitted_at"], reverse=True)

    return {"items": items, "total": len(items)}


@router.get("/verification-history", dependencies=[require_permission("conformite.verify")])
async def list_verification_history(
    page: int = 1,
    page_size: int = 50,
    owner_id: UUID | None = None,
    record_type: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return recently verified/rejected records across all verifiable models.

    Shows the last N actions with verifier name, date, and action taken.
    """
    from app.models.common import (
        UserPassport, UserVisa, SocialSecurity, UserVaccine,
        MedicalCheck, DrivingLicense, UserGroup, UserGroupMember,
    )

    items: list[dict] = []

    # Entity user IDs
    entity_user_ids = (
        select(UserGroupMember.user_id)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(UserGroup.entity_id == entity_id, UserGroup.active == True)
        .distinct()
    )

    # ComplianceRecords — verified or rejected
    cr_q = (
        select(ComplianceRecord)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,
            ComplianceRecord.verification_status.in_(["verified", "rejected"]),
        )
        .order_by(ComplianceRecord.verified_at.desc().nullslast())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    cr_q = _apply_external_record_scope(cr_q, current_user, entity_id)
    if record_type and record_type != "compliance_record":
        # Skip compliance records if filtering for a sub-model type
        cr_q = cr_q.where(False)
    if owner_id:
        cr_q = cr_q.where(ComplianceRecord.owner_id == owner_id)
    for rec in (await db.execute(cr_q)).scalars().all():
        ct = await db.get(ComplianceType, rec.compliance_type_id)
        items.append({
            "id": str(rec.id),
            "record_type": "compliance_record",
            "owner_type": rec.owner_type,
            "owner_id": str(rec.owner_id),
            "owner_name": None,
            "description": f"{ct.name if ct else 'N/A'} — {rec.issuer or 'N/A'}",
            "verification_status": rec.verification_status,
            "verified_by": str(rec.verified_by) if rec.verified_by else None,
            "verified_by_name": None,
            "verified_at": rec.verified_at.isoformat() if rec.verified_at else None,
            "verification_notes": getattr(rec, "verification_notes", None) or getattr(rec, "notes", None),
            "issued_at": rec.issued_at.isoformat() if rec.issued_at else None,
            "expires_at": rec.expires_at.isoformat() if rec.expires_at else None,
            "reference_number": rec.reference_number,
        })

    # User sub-models
    sub_models = [
        (UserPassport, "passport", lambda r: f"Passeport {r.number} — {r.country}"),
        (UserVisa, "visa", lambda r: f"Visa {r.visa_type} — {r.country}"),
        (SocialSecurity, "social_security", lambda r: f"Sécu {r.country} — {r.number}"),
        (UserVaccine, "vaccine", lambda r: f"Vaccin {r.vaccine_type}"),
        (DrivingLicense, "driving_license", lambda r: f"Permis {r.license_type} — {r.country}"),
    ]
    if current_user.user_type == "external":
        entity_user_ids = select(literal(current_user.id))
    for Model, rtype, desc_fn in sub_models:
        if record_type and record_type != rtype:
            continue
        q = (
            select(Model)
            .where(
                Model.verification_status.in_(["verified", "rejected"]),
                Model.user_id.in_(entity_user_ids),
            )
            .order_by(Model.verified_at.desc().nullslast())
            .limit(page_size)
        )
        if owner_id:
            q = q.where(Model.user_id == owner_id)
        for rec in (await db.execute(q)).scalars().all():
            items.append({
                "id": str(rec.id),
                "record_type": rtype,
                "owner_type": "user",
                "owner_id": str(rec.user_id),
                "owner_name": None,
                "description": desc_fn(rec),
                "verification_status": rec.verification_status,
                "verified_by": str(rec.verified_by) if rec.verified_by else None,
                "verified_by_name": None,
                "verified_at": rec.verified_at.isoformat() if rec.verified_at else None,
                "verification_notes": rec.verification_notes,
                "issued_at": None,
                "expires_at": None,
                "reference_number": None,
            })

    # MedicalChecks
    if not record_type or record_type == "medical_check":
        mc_q = (
            select(MedicalCheck)
            .where(
                MedicalCheck.verification_status.in_(["verified", "rejected"]),
                MedicalCheck.owner_id.in_(entity_user_ids),
            )
            .order_by(MedicalCheck.verified_at.desc().nullslast())
            .limit(page_size)
        )
        if owner_id:
            mc_q = mc_q.where(MedicalCheck.owner_id == owner_id)
    else:
        mc_q = None
    for rec in ((await db.execute(mc_q)).scalars().all() if mc_q is not None else []):
        items.append({
            "id": str(rec.id),
            "record_type": "medical_check",
            "owner_type": rec.owner_type,
            "owner_id": str(rec.owner_id),
            "owner_name": None,
            "description": f"Visite {rec.check_type} — {rec.provider or 'N/A'}",
            "verification_status": rec.verification_status,
            "verified_by": str(rec.verified_by) if rec.verified_by else None,
            "verified_by_name": None,
            "verified_at": rec.verified_at.isoformat() if rec.verified_at else None,
            "verification_notes": getattr(rec, "verification_notes", None) or getattr(rec, "notes", None),
            "issued_at": rec.check_date.isoformat() if hasattr(rec, 'check_date') and rec.check_date else None,
            "expires_at": rec.expiry_date.isoformat() if hasattr(rec, 'expiry_date') and rec.expiry_date else None,
            "reference_number": None,
        })

    # Enrich owner names
    user_ids = {i["owner_id"] for i in items if i["owner_type"] == "user" and i["owner_id"]}
    verifier_ids = {i["verified_by"] for i in items if i["verified_by"]}
    all_ids = user_ids | verifier_ids
    if all_ids:
        from sqlalchemy.dialects.postgresql import UUID as PgUUID
        users_q = select(User.id, User.first_name, User.last_name).where(
            User.id.in_([UUID(uid) for uid in all_ids])
        )
        user_map = {str(r.id): f"{r.first_name} {r.last_name}" for r in (await db.execute(users_q)).all()}
        for item in items:
            if item["owner_type"] == "user":
                item["owner_name"] = user_map.get(item["owner_id"], "Inconnu")
            if item["verified_by"]:
                item["verified_by_name"] = user_map.get(item["verified_by"], "Inconnu")

    # Sort by verified_at desc
    items.sort(key=lambda x: x["verified_at"] or "", reverse=True)

    # Paginate
    total = len(items)
    items = items[:page_size]

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/verify/{record_type}/{record_id}")
async def verify_record(
    record_type: str,
    record_id: UUID,
    body: VerifyAction,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.verify"),
    db: AsyncSession = Depends(get_db),
):
    """Verify or reject a pending record."""
    from app.models.common import (
        UserPassport, UserVisa, SocialSecurity, UserVaccine,
        MedicalCheck, DrivingLicense,
    )

    MODEL_MAP = {
        "compliance_record": ComplianceRecord,
        "passport": UserPassport,
        "visa": UserVisa,
        "social_security": SocialSecurity,
        "vaccine": UserVaccine,
        "driving_license": DrivingLicense,
        "medical_check": MedicalCheck,
    }

    Model = MODEL_MAP.get(record_type)
    if not Model:
        raise HTTPException(400, f"Unknown record type: {record_type}")

    result = await db.execute(select(Model).where(Model.id == record_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(404, "Record not found")

    if record.verification_status != "pending":
        raise HTTPException(400, f"Record is already {record.verification_status}")

    # ── Check attachment_required rule before allowing verification ──
    if body.action == "verify":
        # Find applicable rule to check attachment_required
        pj_required = True  # default: PJ required
        if record_type == "compliance_record" and hasattr(record, "compliance_type_id"):
            rule_q = await db.execute(
                select(ComplianceRule).where(
                    ComplianceRule.compliance_type_id == record.compliance_type_id,
                    ComplianceRule.entity_id == entity_id,
                    ComplianceRule.active == True,
                ).limit(1)
            )
            rule = rule_q.scalar_one_or_none()
            if rule:
                pj_required = rule.attachment_required

        if pj_required:
            proof_count = await _count_record_proof(db, record_type=record_type, record=record)
            if proof_count <= 0:
                raise HTTPException(
                    422,
                    "Impossible de vérifier : aucune pièce jointe. La règle exige au moins un document attaché."
                )

    now = datetime.now(timezone.utc)

    if body.action == "verify":
        record.verification_status = "verified"
        record.verified_by = current_user.id
        record.verified_at = now
        record.rejection_reason = None
        # For ComplianceRecord: promote status from pending to valid
        if record_type == "compliance_record" and hasattr(record, 'status') and record.status == "pending":
            record.status = "valid"
        await emit_event("conformite.record.verified", {
            "record_type": record_type, "record_id": str(record_id),
            "verified_by": str(current_user.id), "entity_id": str(entity_id),
        })
    else:
        if not body.rejection_reason:
            raise HTTPException(400, "rejection_reason is required when rejecting")
        record.verification_status = "rejected"
        record.verified_by = current_user.id
        record.verified_at = now
        record.rejection_reason = body.rejection_reason
        # For ComplianceRecord: mark status as rejected too
        if record_type == "compliance_record" and hasattr(record, 'status'):
            record.status = "rejected"
        await emit_event("conformite.record.rejected", {
            "record_type": record_type, "record_id": str(record_id),
            "rejected_by": str(current_user.id), "reason": body.rejection_reason,
            "entity_id": str(entity_id),
        })

    await db.commit()

    # ── Send email notification to record owner ──────────────────────────────
    try:
        from app.core.email_templates import render_and_send_email

        # Determine owner user
        owner_user = None
        if record_type == "compliance_record":
            if record.owner_type == "user" and record.owner_id:
                owner_user = await db.get(User, record.owner_id)
        elif record_type == "medical_check":
            if hasattr(record, "owner_id") and record.owner_id:
                owner_user = await db.get(User, record.owner_id)
        else:
            # User sub-models (passport, visa, social_security, vaccine, driving_license)
            if hasattr(record, "user_id") and record.user_id:
                owner_user = await db.get(User, record.user_id)

        if owner_user and owner_user.email:
            # Build human-readable description
            DESCRIPTION_MAP = {
                "compliance_record": lambda r: f"{r.issuer or 'N/A'}",
                "passport": lambda r: f"Passeport {getattr(r, 'number', '')} — {getattr(r, 'country', '')}",
                "visa": lambda r: f"Visa {getattr(r, 'visa_type', '')} — {getattr(r, 'country', '')}",
                "social_security": lambda r: f"Sécu sociale {getattr(r, 'country', '')} — {getattr(r, 'number', '')}",
                "vaccine": lambda r: f"Vaccin {getattr(r, 'vaccine_type', '')}",
                "driving_license": lambda r: f"Permis {getattr(r, 'license_type', '')} — {getattr(r, 'country', '')}",
                "medical_check": lambda r: f"Visite {getattr(r, 'check_type', '')} — {getattr(r, 'provider', 'N/A')}",
            }
            desc_fn = DESCRIPTION_MAP.get(record_type, lambda r: "")
            record_description = desc_fn(record)

            # For compliance_record, fetch the type name
            record_type_label = record_type.replace("_", " ").title()
            if record_type == "compliance_record" and hasattr(record, "compliance_type_id"):
                ct = await db.get(ComplianceType, record.compliance_type_id)
                if ct:
                    record_type_label = ct.name

            # Get entity name
            entity = await db.get(Entity, entity_id)
            entity_name = entity.name if entity else "OpsFlux"

            # Determine action labels (localized for FR, English for EN)
            language = getattr(owner_user, "language", None) or "fr"
            if language == "en":
                action_label = "verified" if body.action == "verify" else "rejected"
            else:
                action_label = "vérifié" if body.action == "verify" else "rejeté"

            await render_and_send_email(
                db,
                slug="record_verified",
                entity_id=entity_id,
                language=language,
                to=owner_user.email,
                variables={
                    "user": {"first_name": owner_user.first_name, "email": owner_user.email},
                    "record_type": record_type_label,
                    "record_description": record_description,
                    "action": action_label,
                    "verifier_name": f"{current_user.first_name} {current_user.last_name}",
                    "rejection_reason": body.rejection_reason or "",
                    "entity": {"name": entity_name},
                },
            )
    except Exception:
        import logging
        logging.getLogger(__name__).warning("Failed to send verification email", exc_info=True)

    return {
        "detail": f"Record {body.action}d",
        "verification_status": record.verification_status,
    }
