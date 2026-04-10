"""Imputation reference routes — rich imputation catalog, OTP templates, and assignment rules."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, require_permission
from app.core.database import get_db
from app.models.common import (
    BusinessUnit,
    CostCenter,
    ImputationAssignment,
    ImputationOtpTemplate,
    ImputationReference,
    Project,
    User,
    UserGroup,
)
from app.schemas.common import (
    ImputationAssignmentCreate,
    ImputationAssignmentRead,
    ImputationAssignmentUpdate,
    ImputationOtpTemplateCreate,
    ImputationOtpTemplateRead,
    ImputationOtpTemplateUpdate,
    ImputationReferenceCreate,
    ImputationReferenceRead,
    ImputationReferenceUpdate,
)

router = APIRouter(prefix="/api/v1/imputations", tags=["imputations"])


def _serialize_imputation_reference(obj: ImputationReference) -> ImputationReferenceRead:
    return ImputationReferenceRead.model_validate(
        {
            "id": obj.id,
            "entity_id": obj.entity_id,
            "code": obj.code,
            "name": obj.name,
            "description": obj.description,
            "imputation_type": obj.imputation_type,
            "otp_policy": obj.otp_policy,
            "otp_template_id": obj.otp_template_id,
            "default_project_id": obj.default_project_id,
            "default_cost_center_id": obj.default_cost_center_id,
            "valid_from": obj.valid_from,
            "valid_to": obj.valid_to,
            "active": obj.active,
            "metadata": obj.metadata_,
            "created_at": obj.created_at,
        }
    )


def _validate_validity_window(valid_from: date | None, valid_to: date | None) -> None:
    if valid_from and valid_to and valid_to < valid_from:
        raise HTTPException(status_code=400, detail="valid_to cannot be earlier than valid_from")


def _validate_otp_policy(imputation_type: str, otp_policy: str, otp_template_id: UUID | None) -> None:
    if imputation_type != "CAPEX":
        if otp_policy != "forbidden":
            raise HTTPException(status_code=400, detail="Only CAPEX imputations may define an OTP policy")
        if otp_template_id is not None:
            raise HTTPException(status_code=400, detail="Only CAPEX imputations may reference an OTP template")


async def _ensure_active_project(project_id: UUID | None, entity_id: UUID, db: AsyncSession) -> None:
    if project_id is None:
        return
    project = await db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.entity_id == entity_id,
            Project.active.is_(True),
            Project.archived.is_(False),
        )
    )
    if project is None:
        raise HTTPException(status_code=400, detail="Invalid default_project_id")


async def _ensure_active_cost_center(cost_center_id: UUID | None, entity_id: UUID, db: AsyncSession) -> None:
    if cost_center_id is None:
        return
    cost_center = await db.scalar(
        select(CostCenter).where(
            CostCenter.id == cost_center_id,
            CostCenter.entity_id == entity_id,
            CostCenter.active.is_(True),
        )
    )
    if cost_center is None:
        raise HTTPException(status_code=400, detail="Invalid default_cost_center_id")


async def _ensure_otp_template(otp_template_id: UUID | None, entity_id: UUID, db: AsyncSession) -> None:
    if otp_template_id is None:
        return
    template = await db.scalar(
        select(ImputationOtpTemplate).where(
            ImputationOtpTemplate.id == otp_template_id,
            ImputationOtpTemplate.entity_id == entity_id,
            ImputationOtpTemplate.active.is_(True),
        )
    )
    if template is None:
        raise HTTPException(status_code=400, detail="Invalid otp_template_id")


async def _validate_reference_payload(
    *,
    entity_id: UUID,
    imputation_type: str,
    otp_policy: str,
    otp_template_id: UUID | None,
    default_project_id: UUID | None,
    default_cost_center_id: UUID | None,
    valid_from: date | None,
    valid_to: date | None,
    db: AsyncSession,
) -> None:
    _validate_validity_window(valid_from, valid_to)
    _validate_otp_policy(imputation_type, otp_policy, otp_template_id)
    await _ensure_otp_template(otp_template_id, entity_id, db)
    await _ensure_active_project(default_project_id, entity_id, db)
    await _ensure_active_cost_center(default_cost_center_id, entity_id, db)


async def _validate_assignment_target(target_type: str, target_id: UUID, entity_id: UUID, db: AsyncSession) -> None:
    if target_type == "user":
        row = await db.scalar(
            select(User).where(
                User.id == target_id,
                User.default_entity_id == entity_id,
                User.active.is_(True),
            )
        )
        if row is None:
            raise HTTPException(status_code=400, detail="Invalid target for user")
        return

    model_map: dict[str, type] = {
        "user_group": UserGroup,
        "business_unit": BusinessUnit,
        "project": Project,
    }
    model = model_map[target_type]
    row = await db.scalar(select(model).where(model.id == target_id, model.entity_id == entity_id))
    if row is None:
        raise HTTPException(status_code=400, detail=f"Invalid target for {target_type}")


@router.get("/references", response_model=list[ImputationReferenceRead])
async def list_imputation_references(
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("imputation.read"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ImputationReference)
        .where(ImputationReference.entity_id == entity_id)
        .order_by(ImputationReference.code)
    )
    return [_serialize_imputation_reference(obj) for obj in result.scalars().all()]


@router.post("/references", response_model=ImputationReferenceRead, status_code=201)
async def create_imputation_reference(
    body: ImputationReferenceCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("imputation.create"),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.scalar(
        select(ImputationReference).where(
            ImputationReference.entity_id == entity_id,
            ImputationReference.code == body.code,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Imputation code already exists")

    await _validate_reference_payload(
        entity_id=entity_id,
        imputation_type=body.imputation_type,
        otp_policy=body.otp_policy,
        otp_template_id=body.otp_template_id,
        default_project_id=body.default_project_id,
        default_cost_center_id=body.default_cost_center_id,
        valid_from=body.valid_from,
        valid_to=body.valid_to,
        db=db,
    )

    obj = ImputationReference(
        entity_id=entity_id,
        code=body.code,
        name=body.name,
        description=body.description,
        imputation_type=body.imputation_type,
        otp_policy=body.otp_policy,
        otp_template_id=body.otp_template_id,
        default_project_id=body.default_project_id,
        default_cost_center_id=body.default_cost_center_id,
        valid_from=body.valid_from,
        valid_to=body.valid_to,
        active=body.active,
        metadata_=body.metadata,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return _serialize_imputation_reference(obj)


@router.patch("/references/{reference_id}", response_model=ImputationReferenceRead)
async def update_imputation_reference(
    reference_id: UUID,
    body: ImputationReferenceUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("imputation.update"),
    db: AsyncSession = Depends(get_db),
):
    obj = await db.scalar(
        select(ImputationReference).where(
            ImputationReference.id == reference_id,
            ImputationReference.entity_id == entity_id,
        )
    )
    if obj is None:
        raise HTTPException(status_code=404, detail="Imputation reference not found")

    if body.code and body.code != obj.code:
        existing = await db.scalar(
            select(ImputationReference).where(
                ImputationReference.entity_id == entity_id,
                ImputationReference.code == body.code,
                ImputationReference.id != reference_id,
            )
        )
        if existing:
            raise HTTPException(status_code=409, detail="Imputation code already exists")

    imputation_type = body.imputation_type or obj.imputation_type
    otp_policy = body.otp_policy or obj.otp_policy
    otp_template_id = body.otp_template_id if body.otp_template_id is not None else obj.otp_template_id
    default_project_id = body.default_project_id if body.default_project_id is not None else obj.default_project_id
    default_cost_center_id = body.default_cost_center_id if body.default_cost_center_id is not None else obj.default_cost_center_id
    valid_from = body.valid_from if body.valid_from is not None else obj.valid_from
    valid_to = body.valid_to if body.valid_to is not None else obj.valid_to

    await _validate_reference_payload(
        entity_id=entity_id,
        imputation_type=imputation_type,
        otp_policy=otp_policy,
        otp_template_id=otp_template_id,
        default_project_id=default_project_id,
        default_cost_center_id=default_cost_center_id,
        valid_from=valid_from,
        valid_to=valid_to,
        db=db,
    )

    update_data = body.model_dump(exclude_unset=True)
    if "metadata" in update_data:
        update_data["metadata_"] = update_data.pop("metadata")
    for key, value in update_data.items():
        setattr(obj, key, value)

    await db.commit()
    await db.refresh(obj)
    return _serialize_imputation_reference(obj)


@router.delete("/references/{reference_id}", status_code=204)
async def delete_imputation_reference(
    reference_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("imputation.delete"),
    db: AsyncSession = Depends(get_db),
):
    obj = await db.scalar(
        select(ImputationReference).where(
            ImputationReference.id == reference_id,
            ImputationReference.entity_id == entity_id,
        )
    )
    if obj is None:
        raise HTTPException(status_code=404, detail="Imputation reference not found")
    await db.delete(obj)
    await db.commit()
    return None


@router.get("/otp-templates", response_model=list[ImputationOtpTemplateRead])
async def list_imputation_otp_templates(
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("imputation.read"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ImputationOtpTemplate)
        .where(ImputationOtpTemplate.entity_id == entity_id)
        .order_by(ImputationOtpTemplate.code)
    )
    return result.scalars().all()


@router.post("/otp-templates", response_model=ImputationOtpTemplateRead, status_code=201)
async def create_imputation_otp_template(
    body: ImputationOtpTemplateCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("imputation.template.manage"),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.scalar(
        select(ImputationOtpTemplate).where(
            ImputationOtpTemplate.entity_id == entity_id,
            ImputationOtpTemplate.code == body.code,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="OTP template code already exists")
    obj = ImputationOtpTemplate(entity_id=entity_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/otp-templates/{template_id}", response_model=ImputationOtpTemplateRead)
async def update_imputation_otp_template(
    template_id: UUID,
    body: ImputationOtpTemplateUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("imputation.template.manage"),
    db: AsyncSession = Depends(get_db),
):
    obj = await db.scalar(
        select(ImputationOtpTemplate).where(
            ImputationOtpTemplate.id == template_id,
            ImputationOtpTemplate.entity_id == entity_id,
        )
    )
    if obj is None:
        raise HTTPException(status_code=404, detail="OTP template not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/otp-templates/{template_id}", status_code=204)
async def delete_imputation_otp_template(
    template_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("imputation.template.manage"),
    db: AsyncSession = Depends(get_db),
):
    obj = await db.scalar(
        select(ImputationOtpTemplate).where(
            ImputationOtpTemplate.id == template_id,
            ImputationOtpTemplate.entity_id == entity_id,
        )
    )
    if obj is None:
        raise HTTPException(status_code=404, detail="OTP template not found")
    await db.delete(obj)
    await db.commit()
    return None


@router.get("/assignments", response_model=list[ImputationAssignmentRead])
async def list_imputation_assignments(
    target_type: str | None = None,
    target_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("imputation.read"),
    db: AsyncSession = Depends(get_db),
):
    query: Select = select(ImputationAssignment).where(ImputationAssignment.entity_id == entity_id)
    if target_type:
        query = query.where(ImputationAssignment.target_type == target_type)
    if target_id:
        query = query.where(ImputationAssignment.target_id == target_id)
    query = query.order_by(ImputationAssignment.priority, ImputationAssignment.created_at)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/assignments", response_model=ImputationAssignmentRead, status_code=201)
async def create_imputation_assignment(
    body: ImputationAssignmentCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("imputation.assignment.manage"),
    db: AsyncSession = Depends(get_db),
):
    _validate_validity_window(body.valid_from, body.valid_to)
    reference = await db.scalar(
        select(ImputationReference).where(
            ImputationReference.id == body.imputation_reference_id,
            ImputationReference.entity_id == entity_id,
            ImputationReference.active.is_(True),
        )
    )
    if reference is None:
        raise HTTPException(status_code=400, detail="Invalid imputation_reference_id")
    await _validate_assignment_target(body.target_type, body.target_id, entity_id, db)
    obj = ImputationAssignment(entity_id=entity_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/assignments/{assignment_id}", response_model=ImputationAssignmentRead)
async def update_imputation_assignment(
    assignment_id: UUID,
    body: ImputationAssignmentUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("imputation.assignment.manage"),
    db: AsyncSession = Depends(get_db),
):
    obj = await db.scalar(
        select(ImputationAssignment).where(
            ImputationAssignment.id == assignment_id,
            ImputationAssignment.entity_id == entity_id,
        )
    )
    if obj is None:
        raise HTTPException(status_code=404, detail="Imputation assignment not found")

    next_valid_from = body.valid_from if body.valid_from is not None else obj.valid_from
    next_valid_to = body.valid_to if body.valid_to is not None else obj.valid_to
    _validate_validity_window(next_valid_from, next_valid_to)

    next_reference_id = body.imputation_reference_id if body.imputation_reference_id is not None else obj.imputation_reference_id
    next_target_type = body.target_type if body.target_type is not None else obj.target_type
    next_target_id = body.target_id if body.target_id is not None else obj.target_id

    reference = await db.scalar(
        select(ImputationReference).where(
            ImputationReference.id == next_reference_id,
            ImputationReference.entity_id == entity_id,
            ImputationReference.active.is_(True),
        )
    )
    if reference is None:
        raise HTTPException(status_code=400, detail="Invalid imputation_reference_id")
    await _validate_assignment_target(next_target_type, next_target_id, entity_id, db)

    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/assignments/{assignment_id}", status_code=204)
async def delete_imputation_assignment(
    assignment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("imputation.assignment.manage"),
    db: AsyncSession = Depends(get_db),
):
    obj = await db.scalar(
        select(ImputationAssignment).where(
            ImputationAssignment.id == assignment_id,
            ImputationAssignment.entity_id == entity_id,
        )
    )
    if obj is None:
        raise HTTPException(status_code=404, detail="Imputation assignment not found")
    await db.delete(obj)
    await db.commit()
    return None
