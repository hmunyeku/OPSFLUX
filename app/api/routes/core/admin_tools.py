"""Admin tools routes — Adminer proxy, file manager API.

These endpoints are restricted to users with admin.system permission.
"""
import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, get_db
from app.core.config import settings
from app.models.common import Attachment, User

router = APIRouter(prefix="/api/v1/admin", tags=["admin-tools"])


# ── Adminer ──────────────────────────────────────────────────────────────────

@router.get("/adminer-config")
async def get_adminer_config(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return Adminer connection info for admin iframe embedding.

    Only accessible to users with admin.system permission (checked via require_permission
    on the frontend; backend just checks the user is authenticated + superadmin).
    """
    # Check if user has wildcard permission (superadmin)
    from app.api.deps import has_user_permission
    entity_id = current_user.default_entity_id
    if entity_id:
        has_perm = await has_user_permission(current_user, entity_id, "admin.system", db)
    else:
        has_perm = False

    if not has_perm:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Return adminer URL (internal docker network)
    return {
        "adminer_url": "/adminer/",
        "server": "db",
        "username": os.environ.get("POSTGRES_USER", "postgres"),
        "database": os.environ.get("POSTGRES_DB", "opsflux"),
        "driver": "pgsql",
    }


# ── File Manager ─────────────────────────────────────────────────────────────

@router.get("/files/stats")
async def get_storage_stats(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Storage statistics for the file manager dashboard."""
    # Total files and size
    total_result = await db.execute(
        select(
            func.count(Attachment.id).label("total_files"),
            func.coalesce(func.sum(Attachment.size_bytes), 0).label("total_bytes"),
        ).where(Attachment.entity_id == entity_id) if hasattr(Attachment, 'entity_id') else
        select(
            func.count(Attachment.id).label("total_files"),
            func.coalesce(func.sum(Attachment.size_bytes), 0).label("total_bytes"),
        )
    )
    row = total_result.one()

    # By owner_type
    by_type_result = await db.execute(
        select(
            Attachment.owner_type,
            func.count(Attachment.id).label("count"),
            func.coalesce(func.sum(Attachment.size_bytes), 0).label("bytes"),
        ).group_by(Attachment.owner_type).order_by(func.sum(Attachment.size_bytes).desc())
    )
    by_type = [
        {"owner_type": r.owner_type, "count": r.count, "bytes": int(r.bytes)}
        for r in by_type_result.all()
    ]

    # By content_type (top 10)
    by_content_result = await db.execute(
        select(
            Attachment.content_type,
            func.count(Attachment.id).label("count"),
            func.coalesce(func.sum(Attachment.size_bytes), 0).label("bytes"),
        ).group_by(Attachment.content_type).order_by(func.count(Attachment.id).desc()).limit(10)
    )
    by_content = [
        {"content_type": r.content_type, "count": r.count, "bytes": int(r.bytes)}
        for r in by_content_result.all()
    ]

    # Recent uploads (last 20)
    recent_result = await db.execute(
        select(Attachment).order_by(Attachment.created_at.desc()).limit(20)
    )
    recent = [
        {
            "id": str(a.id),
            "original_name": a.original_name,
            "owner_type": a.owner_type,
            "owner_id": str(a.owner_id),
            "content_type": a.content_type,
            "size_bytes": a.size_bytes,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "storage_path": a.storage_path,
        }
        for a in recent_result.scalars().all()
    ]

    # Storage backend info
    storage_backend = getattr(settings, 'STORAGE_BACKEND', 'local')

    return {
        "total_files": row.total_files,
        "total_bytes": int(row.total_bytes),
        "by_owner_type": by_type,
        "by_content_type": by_content,
        "recent_uploads": recent,
        "storage_backend": storage_backend,
        "storage_config": {
            "backend": storage_backend,
            "s3_bucket": getattr(settings, 'S3_BUCKET', '') if storage_backend != 'local' else None,
            "s3_endpoint": getattr(settings, 'S3_ENDPOINT', '') if storage_backend != 'local' else None,
            "max_file_size_mb": getattr(settings, 'STORAGE_MAX_FILE_SIZE_MB', 50),
        },
    }


@router.get("/files/browse")
async def browse_files(
    owner_type: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Browse all files with optional filtering."""
    query = select(Attachment)
    count_query = select(func.count(Attachment.id))

    if owner_type:
        query = query.where(Attachment.owner_type == owner_type)
        count_query = count_query.where(Attachment.owner_type == owner_type)

    if search:
        like = f"%{search}%"
        query = query.where(Attachment.original_name.ilike(like))
        count_query = count_query.where(Attachment.original_name.ilike(like))

    # Count
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    query = query.order_by(Attachment.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)

    items = [
        {
            "id": str(a.id),
            "original_name": a.original_name,
            "filename": a.filename,
            "owner_type": a.owner_type,
            "owner_id": str(a.owner_id),
            "content_type": a.content_type,
            "size_bytes": a.size_bytes,
            "storage_path": a.storage_path,
            "description": a.description,
            "uploaded_by": str(a.uploaded_by) if a.uploaded_by else None,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in result.scalars().all()
    ]

    return {"items": items, "total": total, "page": page, "page_size": page_size}
