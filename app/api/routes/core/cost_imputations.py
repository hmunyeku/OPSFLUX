"""Cost imputation routes — polymorphic cost splits linked to any object.

Query by owner_type + owner_id to get imputations for any entity.
Validates that percentage sum per owner does not exceed 100%.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.common import CostCenter, CostImputation, Project, User
from app.schemas.common import CostImputationCreate, CostImputationRead, CostImputationUpdate

router = APIRouter(prefix="/api/v1/cost-imputations", tags=["cost-imputations"])


@router.get("", response_model=list[CostImputationRead])
async def list_cost_imputations(
    owner_type: str = Query(..., description="Object type: ads, voyage, mission, purchase_order"),
    owner_id: UUID = Query(..., description="UUID of the owning object"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List cost imputations for a given owner."""
    result = await db.execute(
        select(CostImputation)
        .options(
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
        d = CostImputationRead.model_validate(row).model_dump()
        d["project_name"] = (
            f"{row.project.code} — {row.project.name}" if row.project else None
        )
        d["cost_center_name"] = row.cost_center.name if row.cost_center else None
        d["author_name"] = row.author.full_name if row.author else None
        response.append(CostImputationRead(**d))
    return response


@router.post("", response_model=CostImputationRead, status_code=201)
async def create_cost_imputation(
    body: CostImputationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a cost imputation line. Validates sum <= 100 per owner."""
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
        project_id=body.project_id,
        wbs_id=body.wbs_id,
        cost_center_id=body.cost_center_id,
        percentage=body.percentage,
        cross_imputation=body.cross_imputation,
        notes=body.notes,
        created_by=current_user.id,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj, attribute_names=["project", "cost_center", "author"])

    d = CostImputationRead.model_validate(obj).model_dump()
    d["project_name"] = (
        f"{obj.project.code} — {obj.project.name}" if obj.project else None
    )
    d["cost_center_name"] = obj.cost_center.name if obj.cost_center else None
    d["author_name"] = obj.author.full_name if obj.author else None
    return CostImputationRead(**d)


@router.patch("/{imputation_id}", response_model=CostImputationRead)
async def update_cost_imputation(
    imputation_id: UUID,
    body: CostImputationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a cost imputation line."""
    result = await db.execute(
        select(CostImputation)
        .options(
            joinedload(CostImputation.project),
            joinedload(CostImputation.cost_center),
            joinedload(CostImputation.author),
        )
        .where(CostImputation.id == imputation_id)
    )
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Imputation not found")

    update_data = body.model_dump(exclude_unset=True)

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
                detail=f"Total des imputations dépasserait 100%.",
            )

    for key, val in update_data.items():
        setattr(obj, key, val)

    await db.commit()
    await db.refresh(obj, attribute_names=["project", "cost_center", "author"])

    d = CostImputationRead.model_validate(obj).model_dump()
    d["project_name"] = (
        f"{obj.project.code} — {obj.project.name}" if obj.project else None
    )
    d["cost_center_name"] = obj.cost_center.name if obj.cost_center else None
    d["author_name"] = obj.author.full_name if obj.author else None
    return CostImputationRead(**d)


@router.delete("/{imputation_id}", status_code=204)
async def delete_cost_imputation(
    imputation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a cost imputation line (physical delete)."""
    result = await db.execute(
        select(CostImputation).where(CostImputation.id == imputation_id)
    )
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Imputation not found")

    await db.delete(obj)
    await db.commit()
    return None
