"""Note routes — polymorphic notes/comments linked to any object.

Query by owner_type + owner_id to get notes for any entity.
Supports public (visible to all) and private (creator-only) notes.
Notes are historizable — each entry is timestamped and attributed.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.common import Note, User
from app.schemas.common import NoteCreate, NoteRead, NoteUpdate
from app.services.core.delete_service import delete_entity

router = APIRouter(prefix="/api/v1/notes", tags=["notes"])


@router.get("", response_model=list[NoteRead])
async def list_notes(
    owner_type: str = Query(..., description="Object type: user, tier, asset, entity"),
    owner_id: UUID = Query(..., description="UUID of the owning object"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List notes for a given owner. Shows public + user's own private notes."""
    result = await db.execute(
        select(Note)
        .options(joinedload(Note.author))
        .where(
            Note.owner_type == owner_type,
            Note.owner_id == owner_id,
        )
        .where((Note.visibility == "public") | (Note.created_by == current_user.id))
        .order_by(Note.pinned.desc(), Note.created_at.desc())
    )
    notes = result.scalars().unique().all()

    # Enrich with author name
    response = []
    for note in notes:
        note_dict = NoteRead.model_validate(note).model_dump()
        note_dict["author_name"] = note.author.full_name if note.author else None
        response.append(NoteRead(**note_dict))

    return response


@router.post("", response_model=NoteRead, status_code=201)
async def create_note(
    body: NoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new note linked to any object."""
    note = Note(
        owner_type=body.owner_type,
        owner_id=body.owner_id,
        content=body.content,
        visibility=body.visibility,
        pinned=body.pinned,
        created_by=current_user.id,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note, attribute_names=["author"])
    return NoteRead(
        **NoteRead.model_validate(note).model_dump(),
        author_name=current_user.full_name,
    )


@router.patch("/{note_id}", response_model=NoteRead)
async def update_note(
    note_id: UUID,
    body: NoteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a note. Only the creator can update."""
    result = await db.execute(select(Note).options(joinedload(Note.author)).where(Note.id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if note.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the creator can modify this note",
        )

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    for field, value in update_data.items():
        setattr(note, field, value)

    await db.commit()
    await db.refresh(note, attribute_names=["author"])

    note_dict = NoteRead.model_validate(note).model_dump()
    note_dict["author_name"] = note.author.full_name if note.author else None
    return NoteRead(**note_dict)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a note. Only the creator can delete."""
    result = await db.execute(select(Note).where(Note.id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if note.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the creator can delete this note",
        )

    await delete_entity(note, db, "note", entity_id=note_id, user_id=current_user.id)
    await db.commit()
