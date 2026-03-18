"""Conformite (compliance) module routes — types, rules, records."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func as sqla_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.models.common import ComplianceType, ComplianceRule, ComplianceRecord, User
from app.schemas.common import (
    PaginatedResponse,
    ComplianceTypeCreate, ComplianceTypeRead, ComplianceTypeUpdate,
    ComplianceRuleCreate, ComplianceRuleRead,
    ComplianceRecordCreate, ComplianceRecordRead, ComplianceRecordUpdate,
    ComplianceCheckResult,
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


# ── Compliance Check ──────────────────────────────────────────────────────


@router.get("/check/{owner_type}/{owner_id}", response_model=ComplianceCheckResult)
async def check_compliance(
    owner_type: str,
    owner_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check compliance status for an object — returns required, valid, expired, missing counts."""
    now = datetime.now(timezone.utc)

    # Get all mandatory types via rules that apply to this owner
    # For simplicity V1: get all rules with target_type='all' + entity-level rules
    rules_result = await db.execute(
        select(ComplianceRule.compliance_type_id)
        .where(ComplianceRule.entity_id == entity_id, ComplianceRule.active == True)
        .where(ComplianceRule.target_type == "all")
    )
    required_type_ids = set(r[0] for r in rules_result.all())

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
    details = []

    for rec in records:
        is_expired = rec.expires_at and rec.expires_at < now
        if is_expired:
            expired_count += 1
            rec.status = "expired"  # auto-update status
        elif rec.status == "valid":
            valid_type_ids.add(rec.compliance_type_id)

    missing_type_ids = required_type_ids - valid_type_ids
    await db.commit()  # persist any status updates

    return ComplianceCheckResult(
        owner_type=owner_type,
        owner_id=owner_id,
        total_required=len(required_type_ids),
        total_valid=len(valid_type_ids & required_type_ids),
        total_expired=expired_count,
        total_missing=len(missing_type_ids),
        is_compliant=len(missing_type_ids) == 0 and expired_count == 0,
        details=[],
    )
