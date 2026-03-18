"""Settings routes — tenant/user preferences."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.models.common import Setting, User
from app.schemas.common import SettingRead, SettingWrite

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


@router.get("", response_model=list[SettingRead])
async def list_settings(
    scope: str = "tenant",
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List settings for the current scope."""
    query = select(Setting).where(Setting.scope == scope)
    if scope == "user":
        query = query.where(Setting.scope_id == str(current_user.id))
    result = await db.execute(query)
    return result.scalars().all()


@router.put("")
async def upsert_setting(
    body: SettingWrite,
    scope: str = "tenant",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update a setting."""
    scope_id = str(current_user.id) if scope == "user" else None

    result = await db.execute(
        select(Setting).where(Setting.key == body.key, Setting.scope == scope)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.value = body.value
    else:
        db.add(Setting(
            key=body.key,
            value=body.value,
            scope=scope,
            scope_id=scope_id,
        ))

    await db.commit()
    return {"detail": "Setting saved"}
