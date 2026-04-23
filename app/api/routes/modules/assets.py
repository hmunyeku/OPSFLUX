"""Asset routes — compatibility layer over ar_installations.

The legacy `assets` table has been migrated to ar_installations.
These endpoints provide backwards-compatible access for modules
(AssetPicker, Planner, ADS, Voyages, etc.) that still reference /api/v1/assets.

Full CRUD is handled via the Asset Registry routes (/api/v1/asset-registry).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_module_enabled, require_permission
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.models.asset_registry import Installation
from app.models.common import User
from app.core.errors import StructuredHTTPException

# Legacy /api/v1/assets prefix — kept for backwards compatibility with
# older clients that don't know the asset_registry namespace. Same
# module-enabled gate as the canonical /api/v1/asset-registry router
# so a tenant that disables the module can't reach data through this
# back-door.
router = APIRouter(
    prefix="/api/v1/assets",
    tags=["assets"],
    dependencies=[require_module_enabled("asset_registry")],
)


@router.get("", dependencies=[require_permission("asset.read")])
async def list_assets(
    search: str | None = None,
    status: str | None = None,
    installation_type: str | None = None,
    site_id: UUID | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List installations (backwards-compatible /assets endpoint)."""
    query = select(Installation).where(
        Installation.entity_id == entity_id,
        Installation.archived == False,
    )
    if search:
        like = f"%{search}%"
        query = query.where(or_(Installation.name.ilike(like), Installation.code.ilike(like)))
    if status:
        query = query.where(Installation.status == status)
    if installation_type:
        query = query.where(Installation.installation_type == installation_type)
    if site_id:
        query = query.where(Installation.site_id == site_id)
    query = query.order_by(Installation.code)
    return await paginate(db, query, pagination)


@router.get("/tree", dependencies=[require_permission("asset.read")])
async def get_asset_tree(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get installations as a flat list (tree compat endpoint)."""
    result = await db.execute(
        select(Installation).where(
            Installation.entity_id == entity_id,
            Installation.archived == False,
        ).order_by(Installation.code)
    )
    installations = result.scalars().all()
    return [
        {
            "id": str(i.id),
            "code": i.code,
            "name": i.name,
            "type": i.installation_type,
            "status": i.status,
            "children": [],
        }
        for i in installations
    ]


@router.get("/{asset_id}", dependencies=[require_permission("asset.read")])
async def get_asset(
    asset_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single installation by ID (backwards-compatible)."""
    result = await db.execute(
        select(Installation).where(
            Installation.id == asset_id,
            Installation.entity_id == entity_id,
            Installation.archived == False,
        )
    )
    obj = result.scalars().first()
    if not obj:
        raise StructuredHTTPException(
            404,
            code="INSTALLATION_NOT_FOUND",
            message="Installation not found",
        )
    return obj
