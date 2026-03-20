"""Asset Registry routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.core.pagination import PaginationParams, paginate
from app.models.common import Asset, AssetTypeConfig, User
from app.schemas.common import (
    AssetCreate,
    AssetRead,
    AssetTypeConfigCreate,
    AssetTypeConfigRead,
    AssetTypeConfigUpdate,
    AssetUpdate,
    PaginatedResponse,
)

router = APIRouter(prefix="/api/v1/assets", tags=["assets"])


async def _check_circular_parent(db: AsyncSession, asset_id: UUID | None, new_parent_id: UUID | None) -> None:
    """Raise 400 if new_parent_id would create a circular reference."""
    if not new_parent_id:
        return
    if asset_id and new_parent_id == asset_id:
        raise HTTPException(status_code=400, detail="An asset cannot be its own parent")
    visited = set()
    current_id = new_parent_id
    while current_id:
        if current_id in visited:
            raise HTTPException(status_code=400, detail="Circular parent reference detected")
        if asset_id and current_id == asset_id:
            raise HTTPException(status_code=400, detail="Circular parent reference detected")
        visited.add(current_id)
        result = await db.execute(select(Asset.parent_id).where(Asset.id == current_id))
        row = result.first()
        current_id = row[0] if row else None


@router.get("", response_model=PaginatedResponse[AssetRead])
async def list_assets(
    type: str | None = None,
    parent_id: UUID | None = None,
    search: str | None = None,
    active_only: bool = True,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List assets with optional type/parent/search filter."""
    query = select(Asset).where(Asset.entity_id == entity_id)
    if active_only:
        query = query.where(Asset.active == True, Asset.archived == False)
    if type:
        query = query.where(Asset.type == type)
    if parent_id:
        query = query.where(Asset.parent_id == parent_id)
    if search:
        like = f"%{search}%"
        query = query.where(Asset.name.ilike(like) | Asset.code.ilike(like))
    query = query.order_by(Asset.name)
    return await paginate(db, query, pagination)


@router.get("/tree")
async def get_asset_tree(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get full asset hierarchy as a tree structure."""
    result = await db.execute(
        select(Asset)
        .where(Asset.entity_id == entity_id, Asset.active == True, Asset.archived == False)
        .order_by(Asset.path)
    )
    assets = result.scalars().all()

    def build_tree(items, parent_id=None):
        nodes = []
        for item in items:
            if item.parent_id == parent_id:
                node = {
                    "id": str(item.id),
                    "code": item.code,
                    "name": item.name,
                    "type": item.type,
                    "children": build_tree(items, item.id),
                }
                nodes.append(node)
        return nodes

    return build_tree(assets)


@router.post("", response_model=AssetRead, status_code=201)
async def create_asset(
    body: AssetCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("asset.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new asset."""
    # Build ltree path
    path = body.code.lower().replace("-", "_").replace(" ", "_")
    if body.parent_id:
        parent_result = await db.execute(select(Asset).where(Asset.id == body.parent_id))
        parent = parent_result.scalar_one_or_none()
        if parent and parent.path:
            path = f"{parent.path}.{path}"

    # Prevent circular parent reference
    await _check_circular_parent(db, asset_id=None, new_parent_id=body.parent_id)

    asset = Asset(
        entity_id=entity_id,
        parent_id=body.parent_id,
        type=body.type,
        code=body.code,
        name=body.name,
        path=path,
        latitude=body.latitude,
        longitude=body.longitude,
        allow_overlap=body.allow_overlap,
        metadata_=body.metadata,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.get("/{asset_id}", response_model=AssetRead)
async def get_asset(
    asset_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single asset."""
    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.entity_id == entity_id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.patch("/{asset_id}", response_model=AssetRead)
async def update_asset(
    asset_id: UUID,
    body: AssetUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("asset.update"),
    db: AsyncSession = Depends(get_db),
):
    """Update an asset."""
    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.entity_id == entity_id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    update_data = body.model_dump(exclude_unset=True)
    if "parent_id" in update_data:
        await _check_circular_parent(db, asset_id=asset_id, new_parent_id=update_data["parent_id"])
    if "metadata" in update_data:
        update_data["metadata_"] = update_data.pop("metadata")
    for field, value in update_data.items():
        setattr(asset, field, value)

    await db.commit()
    await db.refresh(asset)
    return asset


@router.delete("/{asset_id}", status_code=204)
async def delete_asset(
    asset_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("asset.delete"),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete (archive) an asset."""
    result = await db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.entity_id == entity_id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    asset.active = False
    asset.archived = True
    await db.commit()


# ─── Asset Type Configs ──────────────────────────────────────────────────────


@router.get("/type-configs", response_model=list[AssetTypeConfigRead])
async def list_type_configs(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all asset type configs for the current entity."""
    result = await db.execute(
        select(AssetTypeConfig)
        .where(AssetTypeConfig.entity_id == entity_id)
        .order_by(AssetTypeConfig.sort_order, AssetTypeConfig.label)
    )
    return result.scalars().all()


@router.post("/type-configs", response_model=AssetTypeConfigRead, status_code=201)
async def create_type_config(
    body: AssetTypeConfigCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("asset.admin"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new asset type config (admin only)."""
    config = AssetTypeConfig(
        entity_id=entity_id,
        asset_type=body.asset_type,
        label=body.label,
        icon_name=body.icon_name,
        icon_url=body.icon_url,
        color=body.color,
        map_marker_shape=body.map_marker_shape,
        is_fixed_installation=body.is_fixed_installation,
        show_on_map=body.show_on_map,
        sort_order=body.sort_order,
        active=body.active,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config


@router.put("/type-configs/{config_id}", response_model=AssetTypeConfigRead)
async def update_type_config(
    config_id: UUID,
    body: AssetTypeConfigUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("asset.admin"),
    db: AsyncSession = Depends(get_db),
):
    """Update an asset type config (admin only)."""
    result = await db.execute(
        select(AssetTypeConfig).where(
            AssetTypeConfig.id == config_id,
            AssetTypeConfig.entity_id == entity_id,
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Asset type config not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(config, field, value)

    await db.commit()
    await db.refresh(config)
    return config


@router.delete("/type-configs/{config_id}", status_code=204)
async def delete_type_config(
    config_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("asset.admin"),
    db: AsyncSession = Depends(get_db),
):
    """Delete an asset type config (admin only)."""
    result = await db.execute(
        select(AssetTypeConfig).where(
            AssetTypeConfig.id == config_id,
            AssetTypeConfig.entity_id == entity_id,
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Asset type config not found")

    await delete_entity(config, db, "asset_type_config", entity_id=config_id, user_id=current_user.id)
    await db.commit()
