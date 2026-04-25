"""Module lifecycle routes — list and toggle entity-scoped module activation."""

from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.models.common import User
from app.services.core.module_lifecycle_service import list_modules_for_entity, set_module_enabled_for_entity

router = APIRouter(prefix="/api/v1/modules", tags=["modules"])


class ModuleStateRead(BaseModel):
    slug: str
    name: str
    version: str
    depends_on: list[str]
    enabled: bool
    is_protected: bool
    missing_dependencies: list[str]
    active_dependents: list[str]
    can_enable: bool
    can_disable: bool


class ModuleStateUpdate(BaseModel):
    enabled: bool


@router.get("", response_model=list[ModuleStateRead])
async def list_modules(
    _: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    return await list_modules_for_entity(db, entity_id)


@router.put(
    "/{module_slug}",
    response_model=ModuleStateRead,
    dependencies=[require_permission("core.settings.manage")],
)
async def update_module_state(
    module_slug: str,
    body: ModuleStateUpdate,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    return await set_module_enabled_for_entity(
        db,
        entity_id=entity_id,
        slug=module_slug,
        enabled=body.enabled,
    )
