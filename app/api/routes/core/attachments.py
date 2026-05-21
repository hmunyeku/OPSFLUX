"""Attachment routes — polymorphic file attachments linked to any object.

Query by owner_type + owner_id to list files for any entity.
Upload via multipart/form-data, download via GET /:id/download.
Storage backend (local/S3) is determined by STORAGE_BACKEND setting.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.api.deps import get_current_entity, get_current_user, check_polymorphic_owner_access
from app.core.config import settings
from app.core.database import get_db
from app.core.storage_service import store_file, get_file_path, get_download_url, delete_stored_file
from app.models.common import Attachment, User
from app.schemas.common import AttachmentRead
from app.services.core.delete_service import delete_entity
from app.core.errors import StructuredHTTPException

router = APIRouter(prefix="/api/v1/attachments", tags=["attachments"])


# Bug #126 (QA v3 round 8) : ANY file extension was accepted (including
# malware.exe, script.sh, safe.pdf.exe with double extension). Vraie
# vulnerabilite : un user peut hoster du contenu malveillant sur notre
# domaine (S3/local), avec URL signee partageable. Blacklist explicite
# des extensions dangereuses + check du **dernier** segment apres dot
# pour attraper les double-extensions (safe.pdf.exe -> .exe).
_BLOCKED_EXTENSIONS = {
    # Executables Windows
    "exe", "msi", "bat", "cmd", "com", "scr", "pif", "dll", "sys", "drv",
    # Scripts
    "sh", "bash", "zsh", "ksh", "csh", "ps1", "psm1", "vbs", "vbe", "wsf", "wsh",
    # macOS / Linux executables
    "app", "dmg", "pkg", "deb", "rpm", "run", "bin",
    # Java / cross-platform
    "jar", "class",
    # Web shells / server-side scripts
    "php", "phtml", "php3", "php4", "php5", "php7", "asp", "aspx", "jsp", "jspx", "cgi", "pl", "py",
    # Office macros (Word/Excel) — dangerous template files
    "xlm", "docm", "dotm", "xlsm", "xltm", "pptm", "potm", "ppsm",
    # Misc
    "reg", "lnk", "url", "iso", "img", "vhd", "vhdx",
}


def _validate_extension(filename: str) -> None:
    """Bug #126 : raise HTTPException 415 if filename has a blocked extension.

    Checks ALL extensions (e.g. `safe.pdf.exe` -> blocked on `.exe`).
    """
    if not filename:
        return  # caller already defaults to "file"
    parts = filename.lower().rsplit(".", 4)  # check up to 4 dotted segments
    extensions = parts[1:] if len(parts) > 1 else []
    for ext in extensions:
        if ext in _BLOCKED_EXTENSIONS:
            raise HTTPException(
                status_code=415,
                detail=(
                    f"Extension de fichier '.{ext}' interdite pour des raisons "
                    "de securite. Extensions bloquees : executables, scripts, "
                    "fichiers d'installation."
                ),
            )


@router.get("", response_model=list[AttachmentRead])
async def list_attachments(
    owner_type: str = Query(..., description="Object type: user, tier, asset, entity"),
    owner_id: UUID = Query(..., description="UUID of the owning object"),
    category: str | None = Query(
        None,
        description="Optional category filter (e.g. pid_initial, photo, study).",
        max_length=40,
    ),
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List file attachments for a given owner (optionally filtered by category)."""
    await check_polymorphic_owner_access(owner_type, owner_id, current_user, db, request, write=False)
    stmt = (
        select(Attachment)
        .where(
            Attachment.owner_type == owner_type,
            Attachment.owner_id == owner_id,
            Attachment.entity_id == entity_id,
            Attachment.archived.is_(False),
            Attachment.deleted_at.is_(None),
        )
        .order_by(Attachment.created_at.desc())
    )
    if category:
        stmt = stmt.where(Attachment.category == category)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=AttachmentRead, status_code=201)
async def upload_attachment(
    request: Request,
    file: UploadFile = File(...),
    owner_type: str = Form(...),
    owner_id: str = Form(...),
    description: str | None = Form(None),
    category: str | None = Form(None),
    overwrite_existing: bool = Form(False),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file attachment linked to any object."""
    parsed_owner_id = UUID(owner_id)
    await check_polymorphic_owner_access(owner_type, parsed_owner_id, current_user, db, request, write=True)

    # Bug #126 : valider l'extension avant tout (early reject sans I/O).
    _validate_extension(file.filename or "")

    content = await file.read()

    # Validate file size
    max_size = getattr(settings, 'STORAGE_MAX_FILE_SIZE_MB', 50) * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(status_code=413, detail=f"File too large. Maximum: {getattr(settings, 'STORAGE_MAX_FILE_SIZE_MB', 50)} MB")

    original_name = file.filename or "file"
    normalized_category = (category or None) if category else None
    duplicate_result = await db.execute(
        select(Attachment)
        .where(
            Attachment.owner_type == owner_type,
            Attachment.owner_id == parsed_owner_id,
            Attachment.entity_id == entity_id,
            Attachment.uploaded_by == current_user.id,
            Attachment.archived.is_(False),
            Attachment.deleted_at.is_(None),
            func.lower(Attachment.original_name) == original_name.lower(),
            Attachment.category.is_(None) if normalized_category is None else Attachment.category == normalized_category,
        )
        .order_by(Attachment.created_at.desc())
    )
    duplicate = duplicate_result.scalars().first()
    if duplicate and not overwrite_existing:
        raise StructuredHTTPException(
            status.HTTP_409_CONFLICT,
            code="ATTACHMENT_DUPLICATE",
            message="A file with the same name is already attached to this object.",
            params={
                "attachment_id": str(duplicate.id),
                "filename": duplicate.original_name,
                "owner_type": owner_type,
                "owner_id": owner_id,
                "category": duplicate.category,
            },
        )

    # Store via abstracted storage service (local or S3)
    storage_path, unique_name = await store_file(
        content=content,
        owner_type=owner_type,
        owner_id=owner_id,
        original_filename=original_name,
        content_type=file.content_type or "application/octet-stream",
    )

    if duplicate and overwrite_existing:
        await delete_stored_file(duplicate.storage_path)
        await delete_entity(duplicate, db, "attachment", entity_id=duplicate.id, user_id=current_user.id)

    attachment = Attachment(
        owner_type=owner_type,
        owner_id=parsed_owner_id,
        filename=unique_name,
        original_name=original_name,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        storage_path=storage_path,
        description=description,
        category=normalized_category,
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
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.entity_id == entity_id,
            Attachment.archived.is_(False),
            Attachment.deleted_at.is_(None),
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise StructuredHTTPException(
            404,
            code="ATTACHMENT_NOT_FOUND",
            message="Attachment not found",
        )

    await check_polymorphic_owner_access(attachment.owner_type, attachment.owner_id, current_user, db, request, write=False)

    # S3: redirect to presigned URL
    presigned = await get_download_url(attachment.storage_path)
    if presigned:
        return RedirectResponse(presigned)

    # Local: serve file directly
    local_path = await get_file_path(attachment.storage_path)
    if not local_path:
        raise StructuredHTTPException(
            404,
            code="FILE_NOT_FOUND_DISK",
            message="File not found on disk",
        )

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
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.entity_id == entity_id,
            Attachment.archived.is_(False),
            Attachment.deleted_at.is_(None),
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise StructuredHTTPException(
            404,
            code="ATTACHMENT_NOT_FOUND",
            message="Attachment not found",
        )

    await check_polymorphic_owner_access(attachment.owner_type, attachment.owner_id, current_user, db, request, write=True)

    # Delete from storage (local or S3)
    await delete_stored_file(attachment.storage_path)

    await delete_entity(attachment, db, "attachment", entity_id=attachment_id, user_id=current_user.id)
    await db.commit()
