"""Conformite (compliance) module routes — types, rules, records."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func as sqla_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.models.common import (
    ComplianceType, ComplianceRule, ComplianceRecord,
    JobPosition, TierContactTransfer, TierContact, Tier,
    User,
)
from app.schemas.common import (
    PaginatedResponse,
    ComplianceTypeCreate, ComplianceTypeRead, ComplianceTypeUpdate,
    ComplianceRuleCreate, ComplianceRuleRead,
    ComplianceRecordCreate, ComplianceRecordRead, ComplianceRecordUpdate,
    ComplianceCheckResult,
    JobPositionCreate, JobPositionRead, JobPositionUpdate,
    TierContactTransferCreate, TierContactTransferRead,
)

router = APIRouter(prefix="/api/v1/conformite", tags=["conformite"])


# ── Compliance Types (referentiel) ────────────────────────────────────────


@router.get("/types", response_model=PaginatedResponse[ComplianceTypeRead])
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
    _: None = require_permission("conformite.type.delete"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceType).where(ComplianceType.id == type_id, ComplianceType.entity_id == entity_id)
    )
    ct = result.scalars().first()
    if not ct:
        raise HTTPException(404, "Compliance type not found")
    ct.active = False
    await db.commit()
    return {"detail": "Compliance type archived"}


# ── Compliance Rules ──────────────────────────────────────────────────────


@router.get("/rules", response_model=list[ComplianceRuleRead])
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
    _: None = require_permission("conformite.rule.create"),
    db: AsyncSession = Depends(get_db),
):
    rule = ComplianceRule(entity_id=entity_id, **body.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}")
async def delete_compliance_rule(
    rule_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("conformite.rule.delete"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceRule).where(ComplianceRule.id == rule_id, ComplianceRule.entity_id == entity_id)
    )
    rule = result.scalars().first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    rule.active = False
    await db.commit()
    return {"detail": "Rule deleted"}


# ── Compliance Records ────────────────────────────────────────────────────


@router.get("/records", response_model=PaginatedResponse[ComplianceRecordRead])
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
    query = (
        select(
            ComplianceRecord,
            ComplianceType.name.label("type_name"),
            ComplianceType.category.label("type_category"),
        )
        .join(ComplianceType, ComplianceRecord.compliance_type_id == ComplianceType.id)
        .where(ComplianceRecord.entity_id == entity_id, ComplianceRecord.active == True)
    )
    if owner_type:
        query = query.where(ComplianceRecord.owner_type == owner_type)
    if owner_id:
        query = query.where(ComplianceRecord.owner_id == owner_id)
    if compliance_type_id:
        query = query.where(ComplianceRecord.compliance_type_id == compliance_type_id)
    if status:
        query = query.where(ComplianceRecord.status == status)
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
    for rec in expired_result.scalars().all():
        rec.status = "expired"
    await db.flush()

    def _transform(row):
        rec = row[0] if hasattr(row, '__getitem__') else row.ComplianceRecord
        d = {c.key: getattr(rec, c.key) for c in rec.__table__.columns}
        d["type_name"] = row[1] if hasattr(row, '__getitem__') else row.type_name
        d["type_category"] = row[2] if hasattr(row, '__getitem__') else row.type_category
        return d

    return await paginate(db, query, pagination, transform=_transform)


@router.post("/records", response_model=ComplianceRecordRead, status_code=201)
async def create_compliance_record(
    body: ComplianceRecordCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.record.create"),
    db: AsyncSession = Depends(get_db),
):
    rec = ComplianceRecord(
        entity_id=entity_id,
        created_by=current_user.id,
        **body.model_dump(),
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    # Enrich with type info
    ct = await db.get(ComplianceType, rec.compliance_type_id)
    d = {c.key: getattr(rec, c.key) for c in rec.__table__.columns}
    d["type_name"] = ct.name if ct else None
    d["type_category"] = ct.category if ct else None
    return d


@router.patch("/records/{record_id}", response_model=ComplianceRecordRead)
async def update_compliance_record(
    record_id: UUID,
    body: ComplianceRecordUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("conformite.record.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceRecord).where(ComplianceRecord.id == record_id, ComplianceRecord.entity_id == entity_id)
    )
    rec = result.scalars().first()
    if not rec:
        raise HTTPException(404, "Record not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rec, field, value)
    await db.commit()
    await db.refresh(rec)
    ct = await db.get(ComplianceType, rec.compliance_type_id)
    d = {c.key: getattr(rec, c.key) for c in rec.__table__.columns}
    d["type_name"] = ct.name if ct else None
    d["type_category"] = ct.category if ct else None
    return d


@router.delete("/records/{record_id}")
async def delete_compliance_record(
    record_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("conformite.record.delete"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceRecord).where(ComplianceRecord.id == record_id, ComplianceRecord.entity_id == entity_id)
    )
    rec = result.scalars().first()
    if not rec:
        raise HTTPException(404, "Record not found")
    rec.active = False
    await db.commit()
    return {"detail": "Record archived"}


# ── Expiring & Non-Compliant ─────────────────────────────────────────────


from pydantic import BaseModel as _BaseModel
from datetime import timedelta


class ExpiringRecordRead(_BaseModel):
    id: UUID
    compliance_type_id: UUID
    type_name: str | None = None
    type_category: str | None = None
    owner_type: str
    owner_id: UUID
    status: str
    expires_at: datetime | None = None
    days_remaining: int | None = None


@router.get("/expiring", response_model=list[ExpiringRecordRead])
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


@router.get("/non-compliant", response_model=list[ExpiringRecordRead])
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


@router.get("/check/{owner_type}/{owner_id}", response_model=ComplianceCheckResult)
async def check_compliance(
    owner_type: str,
    owner_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check compliance status for an object — returns required, valid, expired, missing counts.

    Resolves rules by target_type:
    - 'all': applies to everyone
    - 'job_position': applies to contacts with a specific job_position_id
    """
    now = datetime.now(timezone.utc)

    # 1) Rules with target_type='all' — applies to everyone
    all_rules = await db.execute(
        select(ComplianceRule.compliance_type_id)
        .where(ComplianceRule.entity_id == entity_id, ComplianceRule.active == True)
        .where(ComplianceRule.target_type == "all")
    )
    required_type_ids = set(r[0] for r in all_rules.all())

    # 2) Rules with target_type='job_position' — resolve via contact's job_position_id
    if owner_type == "tier_contact":
        contact_result = await db.execute(
            select(TierContact.job_position_id).where(TierContact.id == owner_id)
        )
        job_position_id = contact_result.scalar()
        if job_position_id:
            jp_rules = await db.execute(
                select(ComplianceRule.compliance_type_id)
                .where(
                    ComplianceRule.entity_id == entity_id,
                    ComplianceRule.active == True,
                    ComplianceRule.target_type == "job_position",
                    ComplianceRule.target_value == str(job_position_id),
                )
            )
            required_type_ids |= set(r[0] for r in jp_rules.all())

    # Get existing records for this owner
    records_result = await db.execute(
        select(ComplianceRecord)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.owner_type == owner_type,
            ComplianceRecord.owner_id == owner_id,
            ComplianceRecord.active == True,
        )
    )
    records = records_result.scalars().all()

    valid_type_ids = set()
    expired_count = 0
    details: list[dict] = []

    for rec in records:
        is_expired = rec.expires_at and rec.expires_at < now
        if is_expired:
            expired_count += 1
            rec.status = "expired"
        elif rec.status == "valid":
            valid_type_ids.add(rec.compliance_type_id)

    # Build details for each required type
    for type_id in required_type_ids:
        type_obj = await db.get(ComplianceType, type_id)
        matching = [r for r in records if r.compliance_type_id == type_id]
        valid_match = any(r.compliance_type_id == type_id for r in records if r.status == "valid" and not (r.expires_at and r.expires_at < now))
        details.append({
            "compliance_type_id": str(type_id),
            "type_name": type_obj.name if type_obj else None,
            "type_category": type_obj.category if type_obj else None,
            "status": "valid" if valid_match else ("expired" if any(r.expires_at and r.expires_at < now for r in matching) else "missing"),
            "record_count": len(matching),
        })

    missing_type_ids = required_type_ids - valid_type_ids
    await db.commit()

    return ComplianceCheckResult(
        owner_type=owner_type,
        owner_id=owner_id,
        total_required=len(required_type_ids),
        total_valid=len(valid_type_ids & required_type_ids),
        total_expired=expired_count,
        total_missing=len(missing_type_ids),
        is_compliant=len(missing_type_ids) == 0 and expired_count == 0,
        details=details,
    )


# ── Job Positions (fiches de poste) ─────────────────────────────────────


@router.get("/job-positions", response_model=PaginatedResponse[JobPositionRead])
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
    jp = JobPosition(entity_id=entity_id, **body.model_dump())
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
    _: None = require_permission("conformite.jobposition.delete"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(JobPosition).where(JobPosition.id == jp_id, JobPosition.entity_id == entity_id)
    )
    jp = result.scalars().first()
    if not jp:
        raise HTTPException(404, "Job position not found")
    jp.active = False
    await db.commit()
    return {"detail": "Job position archived"}


# ── Employee Transfers ───────────────────────────────────────────────────


@router.get("/transfers", response_model=PaginatedResponse[TierContactTransferRead])
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
