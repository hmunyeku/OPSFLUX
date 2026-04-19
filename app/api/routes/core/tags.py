"""Tag routes — polymorphic tags/categories linked to any object.

Query by owner_type + owner_id to get tags for any entity.
Supports public (visible to all) and private (creator-only) tags.
Supports hierarchical nesting via parent_id.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.common import Tag, User
from app.schemas.common import TagCreate, TagRead, TagTreeRead, TagUpdate
from app.services.core.delete_service import delete_entity
from app.core.errors import StructuredHTTPException

router = APIRouter(prefix="/api/v1/tags", tags=["tags"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _build_tree(tags: list[Tag]) -> list[dict]:
    """Build a nested tree from a flat list of tags."""
    by_id: dict[str, dict] = {}
    roots: list[dict] = []

    for tag in tags:
        node = {
            "id": tag.id,
            "owner_type": tag.owner_type,
            "owner_id": tag.owner_id,
            "name": tag.name,
            "color": tag.color,
            "visibility": tag.visibility,
            "created_by": tag.created_by,
            "parent_id": tag.parent_id,
            "created_at": tag.created_at,
            "children": [],
        }
        by_id[str(tag.id)] = node

    for tag in tags:
        node = by_id[str(tag.id)]
        if tag.parent_id and str(tag.parent_id) in by_id:
            by_id[str(tag.parent_id)]["children"].append(node)
        else:
            roots.append(node)

    return roots


# ── List ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TagRead])
async def list_tags(
    owner_type: str = Query(..., description="Object type: user, tier, asset, entity"),
    owner_id: UUID = Query(..., description="UUID of the owning object"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List tags for a given owner. Shows public + user's own private tags."""
    result = await db.execute(
        select(Tag)
        .where(
            Tag.owner_type == owner_type,
            Tag.owner_id == owner_id,
        )
        .where(
            (Tag.visibility == "public") | (Tag.created_by == current_user.id)
        )
        .order_by(Tag.name)
    )
    return result.scalars().all()


@router.get("/tree", response_model=list[TagTreeRead])
async def list_tags_tree(
    owner_type: str = Query(..., description="Object type"),
    owner_id: UUID = Query(..., description="UUID of the owning object"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List tags as a nested tree for a given owner."""
    result = await db.execute(
        select(Tag)
        .where(
            Tag.owner_type == owner_type,
            Tag.owner_id == owner_id,
        )
        .where(
            (Tag.visibility == "public") | (Tag.created_by == current_user.id)
        )
        .order_by(Tag.name)
    )
    tags = result.scalars().all()
    return _build_tree(tags)


# ── Search / Autocomplete ────────────────────────────────────────────────────

@router.get("/search", response_model=list[TagRead])
async def search_tags(
    q: str = Query(..., min_length=1, max_length=100, description="Search query"),
    owner_type: str | None = Query(None, description="Filter by object type"),
    owner_id: UUID | None = Query(None, description="Filter by specific owner"),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Search tags by name (trigram similarity). Used for autocomplete."""
    query = (
        select(Tag)
        .where(
            or_(Tag.visibility == "public", Tag.created_by == current_user.id)
        )
        .where(
            or_(
                Tag.name.ilike(f"%{q}%"),
                func.similarity(Tag.name, q) > 0.2,
            )
        )
        .order_by(func.similarity(Tag.name, q).desc())
        .limit(limit)
    )

    if owner_type:
        query = query.where(Tag.owner_type == owner_type)
    if owner_id:
        query = query.where(Tag.owner_id == owner_id)

    result = await db.execute(query)
    return result.scalars().all()


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=TagRead, status_code=201)
async def create_tag(
    body: TagCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new tag linked to any object."""
    # Validate parent_id if provided
    if body.parent_id:
        parent_result = await db.execute(select(Tag).where(Tag.id == body.parent_id))
        parent = parent_result.scalar_one_or_none()
        if not parent:
            raise StructuredHTTPException(
                404,
                code="PARENT_TAG_NOT_FOUND",
                message="Parent tag not found",
            )
        if parent.owner_type != body.owner_type or parent.owner_id != body.owner_id:
            raise StructuredHTTPException(
                400,
                code="PARENT_TAG_MUST_BELONG_SAME_OWNER",
                message="Parent tag must belong to the same owner",
            )

    tag = Tag(
        owner_type=body.owner_type,
        owner_id=body.owner_id,
        name=body.name,
        color=body.color,
        visibility=body.visibility,
        parent_id=body.parent_id,
        created_by=current_user.id,
    )
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.patch("/{tag_id}", response_model=TagRead)
async def update_tag(
    tag_id: UUID,
    body: TagUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a tag. Only the creator can update."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise StructuredHTTPException(
            404,
            code="TAG_NOT_FOUND",
            message="Tag not found",
        )

    if tag.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the creator can modify this tag",
        )

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    # Validate parent_id if changing it
    if "parent_id" in update_data and update_data["parent_id"] is not None:
        if update_data["parent_id"] == tag_id:
            raise StructuredHTTPException(
                400,
                code="TAG_CANNOT_OWN_PARENT",
                message="A tag cannot be its own parent",
            )
        parent_result = await db.execute(
            select(Tag).where(Tag.id == update_data["parent_id"])
        )
        parent = parent_result.scalar_one_or_none()
        if not parent:
            raise StructuredHTTPException(
                404,
                code="PARENT_TAG_NOT_FOUND",
                message="Parent tag not found",
            )

    for field, value in update_data.items():
        setattr(tag, field, value)

    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a tag. Only the creator can delete."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise StructuredHTTPException(
            404,
            code="TAG_NOT_FOUND",
            message="Tag not found",
        )

    if tag.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the creator can delete this tag",
        )

    await delete_entity(tag, db, "tag", entity_id=tag_id, user_id=current_user.id)
    await db.commit()
