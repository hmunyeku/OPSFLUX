"""Storage service — abstracts local disk vs S3/MinIO.

Reads STORAGE_BACKEND from settings to decide where to store files.
- "local": stores in /opt/opsflux/static/attachments/
- "s3" or "minio": stores in S3-compatible bucket via s3_client.py

All functions are async-safe. The S3 client uses boto3 synchronous calls
wrapped in the existing s3_client.py module.
"""

import logging
import os
from uuid import uuid4

from app.core.config import settings

logger = logging.getLogger(__name__)

# Local storage base directory
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "static")
ATTACHMENTS_DIR = os.path.join(STATIC_DIR, "attachments")


def _is_s3() -> bool:
    """Check if storage backend is S3/MinIO."""
    return getattr(settings, "STORAGE_BACKEND", "local") in ("s3", "minio")


async def store_file(
    content: bytes,
    owner_type: str,
    owner_id: str,
    original_filename: str,
    content_type: str = "application/octet-stream",
) -> tuple[str, str]:
    """Store a file and return (storage_path, filename).

    storage_path is the relative path (for DB) or S3 key.
    filename is the unique generated name.
    """
    ext = os.path.splitext(original_filename)[1]
    unique_name = f"{uuid4().hex}{ext}"

    if _is_s3():
        from app.core.s3_client import upload_file
        # Store in S3 with structured path: {owner_type}/{owner_id}/{filename}
        folder = f"attachments/{owner_type}/{owner_id}"
        object_key = await upload_file(content, unique_name, content_type, folder)
        return object_key, unique_name
    else:
        # Local: {owner_type}/{owner_id}/
        type_dir = os.path.join(ATTACHMENTS_DIR, owner_type, owner_id)
        os.makedirs(type_dir, exist_ok=True)
        file_path = os.path.join(type_dir, unique_name)
        with open(file_path, "wb") as f:
            f.write(content)
        storage_path = f"attachments/{owner_type}/{owner_id}/{unique_name}"
        return storage_path, unique_name


async def get_file_path(storage_path: str) -> str | None:
    """Get the absolute local file path, or None if using S3."""
    if _is_s3():
        return None  # Use presigned URL instead
    full_path = os.path.abspath(os.path.join(STATIC_DIR, storage_path))
    # Prevent path traversal: resolved path must stay within STATIC_DIR
    if not full_path.startswith(os.path.abspath(STATIC_DIR)):
        logger.warning("Path traversal attempt blocked: %s", storage_path)
        return None
    return full_path if os.path.exists(full_path) else None


async def get_download_url(storage_path: str) -> str | None:
    """Get a presigned download URL for S3, or None if local."""
    if not _is_s3():
        return None
    from app.core.s3_client import get_presigned_url
    return await get_presigned_url(storage_path, expires_in=3600)


async def delete_stored_file(storage_path: str) -> None:
    """Delete a file from storage (local or S3)."""
    if _is_s3():
        from app.core.s3_client import delete_file
        await delete_file(storage_path)
    else:
        full_path = os.path.join(STATIC_DIR, storage_path)
        if os.path.exists(full_path):
            os.remove(full_path)
            logger.info("Local: deleted %s", storage_path)
