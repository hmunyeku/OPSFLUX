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
from app.core.errors import StructuredHTTPException

router = APIRouter(prefix="/api/v1/dictionary", tags=["dictionary"])


@router.get("", response_model=list[DictionaryEntryRead])
async def list_entries(
    category: str | None = Query(None, description="Filter by category"),
    active_only: bool = Query(False, description="Only active entries"),
    language: str | None = Query(
        None,
        description="Override the display language. Defaults to the user's profile language.",
        pattern="^[a-z]{2}(-[A-Z]{2})?$",
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List dictionary entries with `label` localised to the user's
    language when a translation exists in `translations` JSONB.

    Resolution order:
      1. explicit `language` query param
      2. `current_user.language`
      3. fallback: stored `label` (historically FR)
    """
    query = select(DictionaryEntry).order_by(DictionaryEntry.category, DictionaryEntry.sort_order, DictionaryEntry.label)
    if category:
        query = query.where(DictionaryEntry.category == category)
    if active_only:
        query = query.where(DictionaryEntry.active == True)  # noqa: E712
    result = await db.execute(query)
    entries = result.scalars().all()

    # Localise labels. Mutates the ORM objects in-memory (they are not
    # flushed — read-only transaction) so the Pydantic serialiser picks
    # up the translated label automatically.
    target_lang = (language or getattr(current_user, "language", None) or "fr").split("-")[0].lower()
    if target_lang != "fr":  # fr is the stored default — skip work.
        for e in entries:
            if isinstance(e.translations, dict):
                translated = e.translations.get(target_lang) or e.translations.get(target_lang.split("-")[0])
                if isinstance(translated, str) and translated.strip():
                    e.label = translated
    return entries


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
        raise StructuredHTTPException(
            404,
            code="ENTRY_NOT_FOUND",
            message="Entry not found",
        )
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise StructuredHTTPException(
            400,
            code="NO_FIELDS_UPDATE",
            message="No fields to update",
        )
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
        raise StructuredHTTPException(
            404,
            code="ENTRY_NOT_FOUND",
            message="Entry not found",
        )
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
