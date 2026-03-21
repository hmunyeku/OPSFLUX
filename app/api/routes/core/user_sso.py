"""User SSO provider routes — link/unlink external identity providers."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.common import UserSSOProvider, User
from app.schemas.common import UserSSOProviderCreate, UserSSOProviderRead

router = APIRouter(prefix="/api/v1/users/{user_id}/sso-providers", tags=["user-sso"])


@router.get("", response_model=list[UserSSOProviderRead])
async def list_sso_providers(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List SSO providers linked to a user."""
    result = await db.execute(
        select(UserSSOProvider).where(UserSSOProvider.user_id == user_id).order_by(UserSSOProvider.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=UserSSOProviderRead, status_code=201)
async def create_sso_provider(
    user_id: UUID,
    body: UserSSOProviderCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Link an SSO provider to a user."""
    obj = UserSSOProvider(**body.model_dump(), user_id=user_id)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sso_provider(
    provider_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Unlink an SSO provider from a user."""
    result = await db.execute(select(UserSSOProvider).where(UserSSOProvider.id == provider_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="SSO provider link not found")
    await db.delete(obj)
    await db.commit()
