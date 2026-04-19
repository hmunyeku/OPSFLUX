"""Business Unit (formerly Department) and Cost Center management routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.core.pagination import PaginationParams, paginate
from app.models.common import BusinessUnit, CostCenter, User
from app.schemas.common import (
    PaginatedResponse,
    BusinessUnitCreate, BusinessUnitRead, BusinessUnitUpdate,
    CostCenterCreate, CostCenterRead, CostCenterUpdate,
)
from app.core.errors import StructuredHTTPException

router = APIRouter(prefix="/api/v1", tags=["organization"])

Department = BusinessUnit  # backward compat


def _enrich_bu(bu: BusinessUnit) -> dict:
    """Enrich a BusinessUnit with manager_name for API response."""
    data = {c.key: getattr(bu, c.key) for c in bu.__table__.columns}
    manager = getattr(bu, 'manager', None)
    data['manager_name'] = f"{manager.first_name} {manager.last_name}" if manager else None
    return data


# ── Business Units (aliased as /departments for backward compat) ──

@router.get("/business-units", response_model=PaginatedResponse[BusinessUnitRead])
@router.get("/departments", response_model=PaginatedResponse[BusinessUnitRead], include_in_schema=False)
async def list_business_units(
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(BusinessUnit)
        .options(selectinload(BusinessUnit.manager))
        .where(BusinessUnit.entity_id == entity_id, BusinessUnit.active == True)
    )
    if search:
        query = query.where(BusinessUnit.name.ilike(f"%{search}%") | BusinessUnit.code.ilike(f"%{search}%"))
    query = query.order_by(BusinessUnit.name)
    return await paginate(db, query, pagination)


@router.post("/business-units", response_model=BusinessUnitRead, status_code=201)
@router.post("/departments", response_model=BusinessUnitRead, status_code=201, include_in_schema=False)
async def create_business_unit(
    body: BusinessUnitCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("department.create"),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(BusinessUnit).where(BusinessUnit.entity_id == entity_id, BusinessUnit.code == body.code)
    )
    if existing.scalar_one_or_none():
        raise StructuredHTTPException(
            409,
            code="BUSINESS_UNIT_CODE_ALREADY_EXISTS",
            message="Business unit code already exists",
        )

    bu = BusinessUnit(entity_id=entity_id, **body.model_dump())
    db.add(bu)
    await db.commit()
    await db.refresh(bu, attribute_names=["manager"])
    return _enrich_bu(bu)


@router.patch("/business-units/{bu_id}", response_model=BusinessUnitRead)
@router.patch("/departments/{bu_id}", response_model=BusinessUnitRead, include_in_schema=False)
async def update_business_unit(
    bu_id: UUID,
    body: BusinessUnitUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("department.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BusinessUnit).options(selectinload(BusinessUnit.manager)).where(BusinessUnit.id == bu_id, BusinessUnit.entity_id == entity_id)
    )
    bu = result.scalar_one_or_none()
    if not bu:
        raise StructuredHTTPException(
            404,
            code="BUSINESS_UNIT_NOT_FOUND",
            message="Business unit not found",
        )
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(bu, field, value)
    await db.commit()
    await db.refresh(bu, attribute_names=["manager"])
    return _enrich_bu(bu)


@router.delete("/business-units/{bu_id}", status_code=204)
@router.delete("/departments/{bu_id}", status_code=204, include_in_schema=False)
async def delete_business_unit(
    bu_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("department.delete"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BusinessUnit).where(BusinessUnit.id == bu_id, BusinessUnit.entity_id == entity_id)
    )
    bu = result.scalar_one_or_none()
    if not bu:
        raise StructuredHTTPException(
            404,
            code="BUSINESS_UNIT_NOT_FOUND",
            message="Business unit not found",
        )
    await delete_entity(bu, db, "business_unit", entity_id=bu.id, user_id=current_user.id)
    await db.commit()


# ── Cost Centers ──

@router.get("/cost-centers", response_model=PaginatedResponse[CostCenterRead])
@router.get("/departments/cost-centers", response_model=PaginatedResponse[CostCenterRead], include_in_schema=False)
async def list_cost_centers(
    department_id: UUID | None = None,
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(CostCenter).where(CostCenter.entity_id == entity_id, CostCenter.active == True)
    if department_id:
        query = query.where(CostCenter.department_id == department_id)
    if search:
        query = query.where(CostCenter.name.ilike(f"%{search}%") | CostCenter.code.ilike(f"%{search}%"))
    query = query.order_by(CostCenter.name)
    return await paginate(db, query, pagination)


@router.post("/cost-centers", response_model=CostCenterRead, status_code=201)
@router.post("/departments/cost-centers", response_model=CostCenterRead, status_code=201, include_in_schema=False)
async def create_cost_center(
    body: CostCenterCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("cost_center.create"),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(CostCenter).where(CostCenter.entity_id == entity_id, CostCenter.code == body.code)
    )
    if existing.scalar_one_or_none():
        raise StructuredHTTPException(
            409,
            code="COST_CENTER_CODE_ALREADY_EXISTS",
            message="Cost center code already exists",
        )

    cc = CostCenter(entity_id=entity_id, **body.model_dump())
    db.add(cc)
    await db.commit()
    await db.refresh(cc)
    return cc


@router.patch("/cost-centers/{cc_id}", response_model=CostCenterRead)
@router.patch("/departments/cost-centers/{cc_id}", response_model=CostCenterRead, include_in_schema=False)
async def update_cost_center(
    cc_id: UUID,
    body: CostCenterUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("cost_center.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CostCenter).where(CostCenter.id == cc_id, CostCenter.entity_id == entity_id)
    )
    cc = result.scalar_one_or_none()
    if not cc:
        raise StructuredHTTPException(
            404,
            code="COST_CENTER_NOT_FOUND",
            message="Cost center not found",
        )
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cc, field, value)
    await db.commit()
    await db.refresh(cc)
    return cc


@router.delete("/cost-centers/{cc_id}", status_code=204)
@router.delete("/departments/cost-centers/{cc_id}", status_code=204, include_in_schema=False)
async def delete_cost_center(
    cc_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("cost_center.delete"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CostCenter).where(CostCenter.id == cc_id, CostCenter.entity_id == entity_id)
    )
    cc = result.scalar_one_or_none()
    if not cc:
        raise StructuredHTTPException(
            404,
            code="COST_CENTER_NOT_FOUND",
            message="Cost center not found",
        )
    await delete_entity(cc, db, "cost_center", entity_id=cc.id, user_id=current_user.id)
    await db.commit()
