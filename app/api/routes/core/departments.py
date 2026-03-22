"""Department and Cost Center management routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.core.pagination import PaginationParams, paginate
from app.models.common import Department, CostCenter, User
from app.schemas.common import (
    PaginatedResponse,
    DepartmentCreate, DepartmentRead, DepartmentUpdate,
    CostCenterCreate, CostCenterRead, CostCenterUpdate,
)

router = APIRouter(prefix="/api/v1", tags=["organization"])


# ── Departments ──

@router.get("/departments", response_model=PaginatedResponse[DepartmentRead])
async def list_departments(
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Department).where(Department.entity_id == entity_id, Department.active == True)
    if search:
        query = query.where(Department.name.ilike(f"%{search}%") | Department.code.ilike(f"%{search}%"))
    query = query.order_by(Department.name)
    return await paginate(db, query, pagination)


@router.post("/departments", response_model=DepartmentRead, status_code=201)
async def create_department(
    body: DepartmentCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("department.create"),
    db: AsyncSession = Depends(get_db),
):
    # Check code uniqueness within entity
    existing = await db.execute(
        select(Department).where(Department.entity_id == entity_id, Department.code == body.code)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Department code already exists")

    dept = Department(entity_id=entity_id, **body.model_dump())
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return dept


@router.patch("/departments/{dept_id}", response_model=DepartmentRead)
async def update_department(
    dept_id: UUID,
    body: DepartmentUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("department.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Department).where(Department.id == dept_id, Department.entity_id == entity_id)
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(dept, field, value)
    await db.commit()
    await db.refresh(dept)
    return dept


@router.delete("/departments/{dept_id}", status_code=204)
async def delete_department(
    dept_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("department.delete"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Department).where(Department.id == dept_id, Department.entity_id == entity_id)
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    await delete_entity(dept, db, "department", entity_id=dept.id, user_id=current_user.id)
    await db.commit()


# ── Cost Centers ──

@router.get("/cost-centers", response_model=PaginatedResponse[CostCenterRead])
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
        raise HTTPException(status_code=409, detail="Cost center code already exists")

    cc = CostCenter(entity_id=entity_id, **body.model_dump())
    db.add(cc)
    await db.commit()
    await db.refresh(cc)
    return cc


@router.patch("/cost-centers/{cc_id}", response_model=CostCenterRead)
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
        raise HTTPException(status_code=404, detail="Cost center not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cc, field, value)
    await db.commit()
    await db.refresh(cc)
    return cc


@router.delete("/cost-centers/{cc_id}", status_code=204)
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
        raise HTTPException(status_code=404, detail="Cost center not found")
    await delete_entity(cc, db, "cost_center", entity_id=cc.id, user_id=current_user.id)
    await db.commit()
