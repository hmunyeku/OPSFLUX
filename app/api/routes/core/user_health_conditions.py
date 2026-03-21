"""User health conditions routes — toggle health flags from dictionary."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.common import UserHealthCondition, User
from app.schemas.common import UserHealthConditionCreate, UserHealthConditionRead

router = APIRouter(prefix="/api/v1/users/{user_id}/health-conditions", tags=["user-health-conditions"])


@router.get("", response_model=list[UserHealthConditionRead])
async def list_health_conditions(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserHealthCondition)
        .where(UserHealthCondition.user_id == user_id)
        .order_by(UserHealthCondition.condition_code)
    )
    return result.scalars().all()


@router.post("", response_model=UserHealthConditionRead, status_code=201)
async def add_health_condition(
    user_id: UUID,
    body: UserHealthConditionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check uniqueness
    existing = await db.execute(
        select(UserHealthCondition).where(
            UserHealthCondition.user_id == user_id,
            UserHealthCondition.condition_code == body.condition_code,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Condition already assigned")

    hc = UserHealthCondition(user_id=user_id, condition_code=body.condition_code)
    db.add(hc)
    await db.commit()
    await db.refresh(hc)
    return hc


@router.delete("/{condition_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_health_condition(
    user_id: UUID,
    condition_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserHealthCondition).where(
            UserHealthCondition.id == condition_id,
            UserHealthCondition.user_id == user_id,
        )
    )
    hc = result.scalar_one_or_none()
    if not hc:
        raise HTTPException(status_code=404, detail="Health condition not found")
    await db.delete(hc)
    await db.commit()
