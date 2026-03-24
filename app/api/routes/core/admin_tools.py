"""Admin tools routes — Adminer proxy, file manager API.

All endpoints require admin-level permissions.
"""
import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, get_db, require_permission
from app.core.config import settings
from app.models.common import Attachment, User

router = APIRouter(prefix="/api/v1/admin", tags=["admin-tools"])


# ── Adminer ──────────────────────────────────────────────────────────────────

@router.get("/adminer-config")
async def get_adminer_config(
    current_user: User = Depends(get_current_user),
    _: None = require_permission("admin.system"),
    db: AsyncSession = Depends(get_db),
):
    """Return Adminer connection info and internal proxy URL."""
    return {
        "adminer_url": "/api/v1/admin/adminer-proxy/",
        "database": os.environ.get("POSTGRES_DB", "opsflux"),
        "driver": "pgsql",
    }


@router.api_route("/adminer-proxy/{path:path}", methods=["GET", "POST"])
async def adminer_proxy(
    path: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Reverse proxy to Adminer container — admin.system only.

    Accepts JWT via Authorization header OR ?token= query param (for iframes).
    Proxies all requests to http://adminer:8080/.
    """
    import httpx
    from starlette.responses import Response
    from app.core.security import decode_token, JWTError

    # Auth: check header first, then query param (for iframe)
    token = None
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    else:
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Verify user exists and has admin.system permission
    user = await db.get(User, UUID(user_id))
    if not user or not user.active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    from app.api.deps import has_user_permission
    entity_id = user.default_entity_id
    if not entity_id or not await has_user_permission(user, entity_id, "admin.system", db):
        raise HTTPException(status_code=403, detail="Admin access required")

    # Strip token from query params before proxying
    query_parts = [f"{k}={v}" for k, v in request.query_params.items() if k != "token"]
    query_string = "&".join(query_parts)

    target = f"http://adminer:8080/{path}"
    if query_string:
        target += f"?{query_string}"

    async with httpx.AsyncClient(timeout=30) as client:
        body = await request.body()
        resp = await client.request(
            method=request.method,
            url=target,
            content=body,
            headers={
                k: v for k, v in request.headers.items()
                if k.lower() not in ("host", "authorization", "cookie")
            },
        )

    # Forward response, adjusting content for proxy path
    content = resp.content
    content_type = resp.headers.get("content-type", "")

    # Rewrite Adminer's internal links to go through proxy
    if "text/html" in content_type:
        content = content.replace(b'action="/"', b'action="/api/v1/admin/adminer-proxy/"')
        content = content.replace(b"action='/'", b"action='/api/v1/admin/adminer-proxy/'")

    return Response(
        content=content,
        status_code=resp.status_code,
        headers={
            k: v for k, v in resp.headers.items()
            if k.lower() not in ("transfer-encoding", "content-encoding", "content-length")
        },
    )


# ── File Manager ─────────────────────────────────────────────────────────────

@router.get("/files/stats")
async def get_storage_stats(
    current_user: User = Depends(get_current_user),
    _: None = require_permission("core.settings.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Storage statistics for the file manager dashboard."""
    # Total files and size (global — admin sees all)
    total_result = await db.execute(
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
    _: None = require_permission("core.settings.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Browse all files with optional filtering. Admin only."""
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


# ── Filesystem API (for jfvilas/react-file-manager) ──────────────────────────

import mimetypes
from datetime import datetime, timezone
from fastapi import UploadFile, File as FastAPIFile
from fastapi.responses import FileResponse
from pathlib import Path

STATIC_ROOT = Path(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))).resolve() / "static"


def _safe_resolve(relative_path: str) -> Path | None:
    """Resolve a relative path within STATIC_ROOT, preventing traversal."""
    target = (STATIC_ROOT / relative_path).resolve()
    if not str(target).startswith(str(STATIC_ROOT)):
        return None
    return target


@router.get("/fs/list")
async def fs_list(
    path: str = Query("/", description="Directory path relative to static root"),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("core.settings.manage"),
):
    """List files and directories for the file manager UI."""
    rel_path = path.lstrip("/")
    target = _safe_resolve(rel_path)
    if not target or not target.exists():
        target = STATIC_ROOT

    items = []
    try:
        for entry in sorted(target.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
            item_path = "/" + str(entry.relative_to(STATIC_ROOT)).replace("\\", "/")
            stat = entry.stat()
            items.append({
                "name": entry.name,
                "isDirectory": entry.is_dir(),
                "path": item_path,
                "updatedAt": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                "size": stat.st_size if entry.is_file() else 0,
            })
    except PermissionError:
        pass

    return items


@router.post("/fs/upload")
async def fs_upload(
    file: UploadFile = FastAPIFile(...),
    path: str = Query("/", description="Directory to upload into"),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("core.settings.manage"),
):
    """Upload a file to a specific directory."""
    rel_path = path.lstrip("/")
    target_dir = _safe_resolve(rel_path)
    if not target_dir:
        raise HTTPException(400, "Invalid path")
    target_dir.mkdir(parents=True, exist_ok=True)

    file_path = target_dir / (file.filename or "upload")
    content = await file.read()
    file_path.write_bytes(content)
    return {"message": "Uploaded", "path": "/" + str(file_path.relative_to(STATIC_ROOT)).replace("\\", "/")}


@router.get("/fs/download")
async def fs_download(
    path: str = Query(..., description="File path relative to static root"),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("core.settings.manage"),
):
    """Download a file from the filesystem."""
    rel_path = path.lstrip("/")
    target = _safe_resolve(rel_path)
    if not target or not target.is_file():
        raise HTTPException(404, "File not found")

    content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    return FileResponse(str(target), media_type=content_type, filename=target.name)


@router.delete("/fs/delete")
async def fs_delete(
    path: str = Query(..., description="File or directory path"),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("core.settings.manage"),
):
    """Delete a file or empty directory."""
    import shutil
    rel_path = path.lstrip("/")
    target = _safe_resolve(rel_path)
    if not target or not target.exists():
        raise HTTPException(404, "Not found")
    if target == STATIC_ROOT:
        raise HTTPException(400, "Cannot delete root")

    if target.is_dir():
        shutil.rmtree(str(target))
    else:
        target.unlink()
    return {"message": "Deleted"}


@router.post("/fs/mkdir")
async def fs_mkdir(
    path: str = Query(..., description="New directory path"),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("core.settings.manage"),
):
    """Create a new directory."""
    rel_path = path.lstrip("/")
    target = _safe_resolve(rel_path)
    if not target:
        raise HTTPException(400, "Invalid path")
    target.mkdir(parents=True, exist_ok=True)
    return {"message": "Created", "path": "/" + str(target.relative_to(STATIC_ROOT)).replace("\\", "/")}


@router.post("/fs/rename")
async def fs_rename(
    path: str = Query(..., description="Current path"),
    new_name: str = Query(..., description="New name"),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("core.settings.manage"),
):
    """Rename a file or directory."""
    rel_path = path.lstrip("/")
    target = _safe_resolve(rel_path)
    if not target or not target.exists():
        raise HTTPException(404, "Not found")

    new_target = target.parent / new_name
    if new_target.exists():
        raise HTTPException(400, "Name already exists")
    target.rename(new_target)
    return {"message": "Renamed", "path": "/" + str(new_target.relative_to(STATIC_ROOT)).replace("\\", "/")}
