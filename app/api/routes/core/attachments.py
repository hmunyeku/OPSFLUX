"""Attachment routes — polymorphic file attachments linked to any object.

Query by owner_type + owner_id to list files for any entity.
Upload via multipart/form-data, download via GET /:id/download.
"""

import os
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.api.deps import get_current_user, check_polymorphic_owner_access
from app.core.database import get_db
from app.models.common import Attachment, User
from app.schemas.common import AttachmentRead
from app.services.core.delete_service import delete_entity

router = APIRouter(prefix="/api/v1/attachments", tags=["attachments"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "static", "attachments")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("", response_model=list[AttachmentRead])
async def list_attachments(
    owner_type: str = Query(..., description="Object type: user, tier, asset, entity"),
    owner_id: UUID = Query(..., description="UUID of the owning object"),
    request: Request = None,
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file attachment linked to any object."""
    parsed_owner_id = UUID(owner_id)
    await check_polymorphic_owner_access(owner_type, parsed_owner_id, current_user, db, request, write=True)

    # Generate unique filename
    ext = os.path.splitext(file.filename or "file")[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"

    # Organize by owner_type subdirectory
    type_dir = os.path.join(UPLOAD_DIR, owner_type)
    os.makedirs(type_dir, exist_ok=True)
    file_path = os.path.join(type_dir, unique_name)

    # Read and save file
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    storage_path = f"attachments/{owner_type}/{unique_name}"

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
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return attachment


@router.get("/{attachment_id}/download")
async def download_attachment(
    attachment_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download a file attachment."""
    result = await db.execute(
        select(Attachment).where(Attachment.id == attachment_id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    await check_polymorphic_owner_access(attachment.owner_type, attachment.owner_id, current_user, db, request, write=False)

    base_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "static")
    file_path = os.path.join(base_dir, attachment.storage_path)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        file_path,
        media_type=attachment.content_type,
        filename=attachment.original_name,
    )


@router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    attachment_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a file attachment."""
    result = await db.execute(
        select(Attachment).where(Attachment.id == attachment_id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    await check_polymorphic_owner_access(attachment.owner_type, attachment.owner_id, current_user, db, request, write=True)

    # Delete file from disk
    base_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "static")
    file_path = os.path.join(base_dir, attachment.storage_path)
    if os.path.exists(file_path):
        os.remove(file_path)

    await delete_entity(attachment, db, "attachment", entity_id=attachment_id, user_id=current_user.id)
    await db.commit()
