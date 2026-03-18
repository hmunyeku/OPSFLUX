"""Asset Registry routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.models.common import Asset, User
from app.schemas.common import AssetCreate, AssetRead, AssetUpdate, PaginatedResponse

router = APIRouter(prefix="/api/v1/assets", tags=["assets"])


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
