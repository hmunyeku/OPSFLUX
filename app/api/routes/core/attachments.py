"""Attachment routes — polymorphic file attachments linked to any object.

Query by owner_type + owner_id to list files for any entity.
Upload via multipart/form-data, download via GET /:id/download.
Storage backend (local/S3) is determined by STORAGE_BACKEND setting.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.api.deps import get_current_entity, get_current_user, check_polymorphic_owner_access
from app.core.config import settings
from app.core.database import get_db
from app.core.storage_service import store_file, get_file_path, get_download_url, delete_stored_file
from app.models.common import Attachment, User
from app.schemas.common import AttachmentRead
from app.services.core.delete_service import delete_entity

router = APIRouter(prefix="/api/v1/attachments", tags=["attachments"])


@router.get("", response_model=list[AttachmentRead])
async def list_attachments(
    owner_type: str = Query(..., description="Object type: user, tier, asset, entity"),
    owner_id: UUID = Query(..., description="UUID of the owning object"),
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List file attachments for a given owner."""
    await check_polymorphic_owner_access(owner_type, owner_id, current_user, db, request, write=False)
    result = await db.execute(
        select(Attachment)
        .where(
            Attachment.owner_type == owner_type,
            Attachment.owner_id == owner_id,
            Attachment.entity_id == entity_id,
        )
        .order_by(Attachment.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=AttachmentRead, status_code=201)
async def upload_attachment(
    request: Request,
    file: UploadFile = File(...),
    owner_type: str = Form(...),
    owner_id: str = Form(...),
    description: str | None = Form(None),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file attachment linked to any object."""
    parsed_owner_id = UUID(owner_id)
    await check_polymorphic_owner_access(owner_type, parsed_owner_id, current_user, db, request, write=True)

    content = await file.read()

    # Validate file size
    max_size = getattr(settings, 'STORAGE_MAX_FILE_SIZE_MB', 50) * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(status_code=413, detail=f"File too large. Maximum: {getattr(settings, 'STORAGE_MAX_FILE_SIZE_MB', 50)} MB")

    # Store via abstracted storage service (local or S3)
    storage_path, unique_name = await store_file(
        content=content,
        owner_type=owner_type,
        owner_id=owner_id,
        original_filename=file.filename or "file",
        content_type=file.content_type or "application/octet-stream",
    )

    attachment = Attachment(
        owner_type=owner_type,
        owner_id=parsed_owner_id,
        filename=unique_name,
        original_name=file.filename or "file",
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        storage_path=storage_path,
        description=description,
        uploaded_by=current_user.id,
        entity_id=entity_id,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return attachment


@router.get("/{attachment_id}/download")
async def download_attachment(
    attachment_id: UUID,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download a file attachment."""
    result = await db.execute(
        select(Attachment).where(Attachment.id == attachment_id, Attachment.entity_id == entity_id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    await check_polymorphic_owner_access(attachment.owner_type, attachment.owner_id, current_user, db, request, write=False)

    # S3: redirect to presigned URL
    presigned = await get_download_url(attachment.storage_path)
    if presigned:
        return RedirectResponse(presigned)

    # Local: serve file directly
    local_path = await get_file_path(attachment.storage_path)
    if not local_path:
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        local_path,
        media_type=attachment.content_type,
        filename=attachment.original_name,
    )


@router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    attachment_id: UUID,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a file attachment."""
    result = await db.execute(
        select(Attachment).where(Attachment.id == attachment_id, Attachment.entity_id == entity_id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    await check_polymorphic_owner_access(attachment.owner_type, attachment.owner_id, current_user, db, request, write=True)

    # Delete from storage (local or S3)
    await delete_stored_file(attachment.storage_path)

    await delete_entity(attachment, db, "attachment", entity_id=attachment_id, user_id=current_user.id)
    await db.commit()
