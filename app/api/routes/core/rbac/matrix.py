"""JSON matrix routes -- used by the frontend to render the matrix views in-app
(distinct from PDF exports which go through /exports/*)."""
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.models.common import User
from app.services.core.rbac_export_service import (
    build_matrix_role_permissions_variables,
    build_matrix_group_permissions_variables,
    build_sod_matrix_variables,
)

router = APIRouter(prefix="/api/v1/rbac/matrix", tags=["rbac"])


@router.get("/role-permissions")
async def matrix_role_permissions_json(
    include_disabled_modules: bool = Query(False),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    return await build_matrix_role_permissions_variables(
        db, entity_id, current_user, lang="fr", include_disabled=include_disabled_modules
    )


@router.get("/group-permissions")
async def matrix_group_permissions_json(
    include_disabled_modules: bool = Query(False),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    return await build_matrix_group_permissions_variables(
        db, entity_id, current_user, lang="fr", include_disabled=include_disabled_modules
    )


@router.get("/sod")
async def matrix_sod_json(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    return await build_sod_matrix_variables(db, entity_id, current_user, lang="fr")
