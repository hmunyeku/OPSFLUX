"""Dictionary routes — configurable dropdown lists."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.models.common import DictionaryEntry, User
from app.schemas.common import DictionaryEntryCreate, DictionaryEntryRead, DictionaryEntryUpdate

router = APIRouter(prefix="/api/v1/dictionary", tags=["dictionary"])


@router.get("", response_model=list[DictionaryEntryRead])
async def list_entries(
    category: str | None = Query(None, description="Filter by category"),
    active_only: bool = Query(False, description="Only active entries"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(DictionaryEntry).order_by(DictionaryEntry.category, DictionaryEntry.sort_order, DictionaryEntry.label)
    if category:
        query = query.where(DictionaryEntry.category == category)
    if active_only:
        query = query.where(DictionaryEntry.active == True)  # noqa: E712
    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "",
    response_model=DictionaryEntryRead,
    status_code=201,
    dependencies=[require_permission("core.settings.manage")],
)
async def create_entry(
    body: DictionaryEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entry = DictionaryEntry(**body.model_dump())
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.patch(
    "/{entry_id}",
    response_model=DictionaryEntryRead,
    dependencies=[require_permission("core.settings.manage")],
)
async def update_entry(
    entry_id: UUID,
    body: DictionaryEntryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(DictionaryEntry).where(DictionaryEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    for field, value in update_data.items():
        setattr(entry, field, value)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete(
    "/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[require_permission("core.settings.manage")],
)
async def delete_entry(
    entry_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(DictionaryEntry).where(DictionaryEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    await delete_entity(entry, db, "dictionary_entry", entity_id=entry.id, user_id=current_user.id)
    await db.commit()


@router.get("/categories", response_model=list[str])
async def list_categories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all distinct categories."""
    from sqlalchemy import distinct
    result = await db.execute(select(distinct(DictionaryEntry.category)).order_by(DictionaryEntry.category))
    return result.scalars().all()
