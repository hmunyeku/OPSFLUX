"""Settings routes — scoped settings with explicit permissions."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, has_user_permission
from app.core.database import get_db
from app.models.common import Setting, User
from app.schemas.common import SettingRead, SettingWrite

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


def _validate_scope(scope: str) -> str:
    if scope not in {"tenant", "entity", "user"}:
        raise HTTPException(status_code=400, detail="Invalid settings scope")
    return scope


async def _require_settings_manage(current_user: User, entity_id: UUID, db: AsyncSession) -> None:
    if not await has_user_permission(current_user, entity_id, "core.settings.manage", db):
        raise HTTPException(status_code=403, detail="Permission denied: core.settings.manage")


@router.get("", response_model=list[SettingRead])
async def list_settings(
    scope: str = "tenant",
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List settings for the current scope."""
    scope = _validate_scope(scope)
    query = select(Setting).where(Setting.scope == scope)

    if scope == "user":
        query = query.where(Setting.scope_id == str(current_user.id))
    elif scope == "entity":
        await _require_settings_manage(current_user, entity_id, db)
        query = query.where(Setting.scope_id == str(entity_id))
    else:
        await _require_settings_manage(current_user, entity_id, db)

    result = await db.execute(query)
    return result.scalars().all()


@router.put("")
async def upsert_setting(
    body: SettingWrite,
    scope: str = "tenant",
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Create or update a setting."""
    scope = _validate_scope(scope)

    if scope == "user":
        scope_id = str(current_user.id)
    elif scope == "entity":
        await _require_settings_manage(current_user, entity_id, db)
        scope_id = str(entity_id)
    else:
        await _require_settings_manage(current_user, entity_id, db)
        scope_id = None

    result = await db.execute(
        select(Setting).where(
            Setting.key == body.key,
            Setting.scope == scope,
            Setting.scope_id == scope_id if scope_id is not None else Setting.scope_id.is_(None),
        )
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
