"""S3-compatible storage client (MinIO / AWS S3)."""

import logging
from io import BytesIO
from uuid import uuid4

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)

_s3_client = None


def get_s3_client():
    """Get or create the S3 client."""
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT if settings.STORAGE_BACKEND != "s3" else None,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
            config=BotoConfig(signature_version="s3v4"),
        )
    return _s3_client


async def upload_file(
    file_data: bytes,
    filename: str,
    content_type: str = "application/octet-stream",
    folder: str = "uploads",
) -> str:
    """Upload a file to S3 and return the object key."""
    ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
    object_key = f"{folder}/{uuid4().hex}.{ext}" if ext else f"{folder}/{uuid4().hex}"

    client = get_s3_client()
    client.put_object(
        Bucket=settings.S3_BUCKET,
        Key=object_key,
        Body=BytesIO(file_data),
        ContentType=content_type,
    )
    logger.info("S3: uploaded %s -> %s", filename, object_key)
    return object_key


async def get_presigned_url(object_key: str, expires_in: int = 3600) -> str:
    """Generate a presigned URL for downloading a file."""
    client = get_s3_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": object_key},
        ExpiresIn=expires_in,
    )


async def delete_file(object_key: str) -> None:
    """Delete a file from S3."""
    client = get_s3_client()
    client.delete_object(Bucket=settings.S3_BUCKET, Key=object_key)
    logger.info("S3: deleted %s", object_key)


async def ensure_bucket() -> None:
    """Create the bucket if it doesn't exist."""
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=settings.S3_BUCKET)
    except ClientError:
        client.create_bucket(Bucket=settings.S3_BUCKET)
        logger.info("S3: created bucket %s", settings.S3_BUCKET)
