"""Cost imputation routes — polymorphic cost splits linked to any object.

Query by owner_type + owner_id to get imputations for any entity.
Validates that percentage sum per owner does not exceed 100%.
"""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.deps import check_polymorphic_owner_access, get_current_entity, get_current_user
from app.core.database import get_db
from app.models.common import CostCenter, CostImputation, ImputationReference, Project, User
from app.schemas.common import CostImputationCreate, CostImputationRead, CostImputationUpdate

router = APIRouter(prefix="/api/v1/cost-imputations", tags=["cost-imputations"])

OWNER_TYPE_IMPUTATION_RULES: dict[str, dict[str, object]] = {
    "ads": {
        "allowed_types": {"OPEX", "SOPEX", "OTHER"},
        "allow_otp": False,
    }
}


async def _sync_owner_project_snapshot(
    *,
    owner_type: str,
    owner_id: UUID,
    db: AsyncSession,
) -> None:
    """Keep owner-side project snapshot aligned with project imputations.

    For AdS, `project_id` is only a mono-project summary:
    - 0 project imputations  -> null
    - 1 distinct project     -> that project
    - >1 distinct projects   -> null
    """
    if owner_type != "ads":
        return

    from app.models.paxlog import Ads

    ads = await db.scalar(select(Ads).where(Ads.id == owner_id))
    if ads is None:
        return

    project_rows = (
        await db.execute(
            select(CostImputation.project_id)
            .where(
                CostImputation.owner_type == owner_type,
                CostImputation.owner_id == owner_id,
                CostImputation.project_id.isnot(None),
            )
            .distinct()
        )
    ).all()
    project_ids = [row[0] for row in project_rows if row[0] is not None]
    ads.project_id = project_ids[0] if len(project_ids) == 1 else None


async def _validate_imputation_references(
    *,
    entity_id: UUID,
    imputation_reference_id: UUID | None,
    project_id: UUID | None,
    cost_center_id: UUID | None,
    db: AsyncSession,
) -> tuple[UUID | None, UUID | None, ImputationReference | None]:
    reference: ImputationReference | None = None
    resolved_project_id = project_id
    resolved_cost_center_id = cost_center_id

    if imputation_reference_id is not None:
        reference = await db.scalar(
            select(ImputationReference).where(
                ImputationReference.id == imputation_reference_id,
                ImputationReference.entity_id == entity_id,
                ImputationReference.active.is_(True),
            )
        )
        if reference is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La référence d'imputation est invalide ou hors entité.",
            )

        today = date.today()
        if reference.valid_from and reference.valid_from > today:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La référence d'imputation n'est pas encore valide.",
            )
        if reference.valid_to and reference.valid_to < today:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La référence d'imputation a expiré.",
            )

        if resolved_project_id is None:
            resolved_project_id = reference.default_project_id
        if resolved_cost_center_id is None:
            resolved_cost_center_id = reference.default_cost_center_id

    if resolved_project_id is None and resolved_cost_center_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Une imputation doit référencer au moins un projet ou un centre de coût, "
                "directement ou via sa référence."
            ),
        )

    if resolved_project_id is not None:
        project = await db.scalar(
            select(Project).where(
                Project.id == resolved_project_id,
                Project.entity_id == entity_id,
                Project.active.is_(True),
                Project.archived.is_(False),
            )
        )
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Le projet d'imputation est invalide ou hors entité.",
            )

    if resolved_cost_center_id is not None:
        cost_center = await db.scalar(
            select(CostCenter).where(
                CostCenter.id == resolved_cost_center_id,
                CostCenter.entity_id == entity_id,
                CostCenter.active.is_(True),
            )
        )
        if cost_center is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Le centre de coût d'imputation est invalide ou hors entité.",
            )

    return resolved_project_id, resolved_cost_center_id, reference


def _serialize_imputation(row: CostImputation) -> CostImputationRead:
    data = CostImputationRead.model_validate(row).model_dump()
    data["imputation_reference_code"] = row.imputation_reference.code if row.imputation_reference else None
    data["imputation_reference_name"] = row.imputation_reference.name if row.imputation_reference else None
    data["imputation_type"] = row.imputation_reference.imputation_type if row.imputation_reference else None
    data["otp_policy"] = row.imputation_reference.otp_policy if row.imputation_reference else None
    data["project_name"] = f"{row.project.code} — {row.project.name}" if row.project else None
    data["cost_center_name"] = row.cost_center.name if row.cost_center else None
    data["author_name"] = row.author.full_name if row.author else None
    return CostImputationRead(**data)


def _validate_owner_type_imputation_rules(
    *,
    owner_type: str,
    reference: ImputationReference | None,
) -> None:
    if reference is None:
        return

    rules = OWNER_TYPE_IMPUTATION_RULES.get(owner_type)
    if not rules:
        return

    allowed_types = rules.get("allowed_types")
    if isinstance(allowed_types, set) and reference.imputation_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(f"L'objet {owner_type} ne peut pas utiliser une imputation de type {reference.imputation_type}."),
        )

    allow_otp = bool(rules.get("allow_otp", True))
    if not allow_otp and reference.otp_policy != "forbidden":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(f"L'objet {owner_type} ne peut pas utiliser une imputation qui exige ou autorise un OTP."),
        )


@router.get("", response_model=list[CostImputationRead])
async def list_cost_imputations(
    owner_type: str = Query(..., description="Object type: ads, voyage, mission, purchase_order"),
    owner_id: UUID = Query(..., description="UUID of the owning object"),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List cost imputations for a given owner."""
    await check_polymorphic_owner_access(
        owner_type,
        owner_id,
        current_user,
        db,
        request,
        write=False,
    )
    result = await db.execute(
        select(CostImputation)
        .options(
            joinedload(CostImputation.imputation_reference),
            joinedload(CostImputation.project),
            joinedload(CostImputation.cost_center),
            joinedload(CostImputation.author),
        )
        .where(
            CostImputation.owner_type == owner_type,
            CostImputation.owner_id == owner_id,
        )
        .order_by(CostImputation.created_at)
    )
    rows = result.scalars().unique().all()

    response = []
    for row in rows:
        response.append(_serialize_imputation(row))
    return response


@router.post("", response_model=CostImputationRead, status_code=201)
async def create_cost_imputation(
    body: CostImputationCreate,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a cost imputation line. Validates sum <= 100 per owner."""
    await check_polymorphic_owner_access(
        body.owner_type,
        body.owner_id,
        current_user,
        db,
        request,
        write=True,
    )
    resolved_project_id, resolved_cost_center_id, reference = await _validate_imputation_references(
        entity_id=entity_id,
        imputation_reference_id=body.imputation_reference_id,
        project_id=body.project_id,
        cost_center_id=body.cost_center_id,
        db=db,
    )
    _validate_owner_type_imputation_rules(owner_type=body.owner_type, reference=reference)

    # Check current total
    total_result = await db.execute(
        select(func.coalesce(func.sum(CostImputation.percentage), 0)).where(
            CostImputation.owner_type == body.owner_type,
            CostImputation.owner_id == body.owner_id,
        )
    )
    current_total = float(total_result.scalar() or 0)

    if current_total + body.percentage > 100.0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Total des imputations dépasserait 100% "
                f"({current_total}% + {body.percentage}% = {current_total + body.percentage}%)."
            ),
        )

    obj = CostImputation(
        owner_type=body.owner_type,
        owner_id=body.owner_id,
        imputation_reference_id=body.imputation_reference_id,
        project_id=resolved_project_id,
        wbs_id=body.wbs_id,
        cost_center_id=resolved_cost_center_id,
        percentage=body.percentage,
        cross_imputation=body.cross_imputation,
        notes=body.notes,
        created_by=current_user.id,
    )
    db.add(obj)
    await db.commit()
    await _sync_owner_project_snapshot(
        owner_type=body.owner_type,
        owner_id=body.owner_id,
        db=db,
    )
    await db.commit()
    await db.refresh(
        obj,
        attribute_names=["imputation_reference", "project", "cost_center", "author"],
    )

    return _serialize_imputation(obj)


@router.patch("/{imputation_id}", response_model=CostImputationRead)
async def update_cost_imputation(
    imputation_id: UUID,
    body: CostImputationUpdate,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a cost imputation line."""
    result = await db.execute(
        select(CostImputation)
        .options(
            joinedload(CostImputation.imputation_reference),
            joinedload(CostImputation.project),
            joinedload(CostImputation.cost_center),
            joinedload(CostImputation.author),
        )
        .where(CostImputation.id == imputation_id)
    )
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Imputation not found")

    await check_polymorphic_owner_access(
        obj.owner_type,
        obj.owner_id,
        current_user,
        db,
        request,
        write=True,
    )

    update_data = body.model_dump(exclude_unset=True)
    next_reference_id = update_data.get("imputation_reference_id", obj.imputation_reference_id)
    next_project_id = update_data.get("project_id", obj.project_id)
    next_cost_center_id = update_data.get("cost_center_id", obj.cost_center_id)
    resolved_project_id, resolved_cost_center_id, reference = await _validate_imputation_references(
        entity_id=entity_id,
        imputation_reference_id=next_reference_id,
        project_id=next_project_id,
        cost_center_id=next_cost_center_id,
        db=db,
    )
    _validate_owner_type_imputation_rules(owner_type=obj.owner_type, reference=reference)

    # Validate new percentage total if changed
    if "percentage" in update_data:
        total_result = await db.execute(
            select(func.coalesce(func.sum(CostImputation.percentage), 0)).where(
                CostImputation.owner_type == obj.owner_type,
                CostImputation.owner_id == obj.owner_id,
                CostImputation.id != imputation_id,
            )
        )
        others_total = float(total_result.scalar() or 0)
        if others_total + update_data["percentage"] > 100.0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Total des imputations dépasserait 100%.",
            )

    for key, val in update_data.items():
        setattr(obj, key, val)
    obj.project_id = resolved_project_id
    obj.cost_center_id = resolved_cost_center_id

    await db.commit()
    await _sync_owner_project_snapshot(
        owner_type=obj.owner_type,
        owner_id=obj.owner_id,
        db=db,
    )
    await db.commit()
    await db.refresh(
        obj,
        attribute_names=["imputation_reference", "project", "cost_center", "author"],
    )

    return _serialize_imputation(obj)


@router.delete("/{imputation_id}", status_code=204)
async def delete_cost_imputation(
    imputation_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a cost imputation line (physical delete)."""
    result = await db.execute(select(CostImputation).where(CostImputation.id == imputation_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Imputation not found")

    await check_polymorphic_owner_access(
        obj.owner_type,
        obj.owner_id,
        current_user,
        db,
        request,
        write=True,
    )

    owner_type = obj.owner_type
    owner_id = obj.owner_id
    await db.delete(obj)
    await db.commit()
    await _sync_owner_project_snapshot(
        owner_type=owner_type,
        owner_id=owner_id,
        db=db,
    )
    await db.commit()
    return None
