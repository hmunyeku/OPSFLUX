"""Profile routes — update profile, change password, upload avatar."""

import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_entity, get_current_user
from app.core.audit import record_audit
from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_password, verify_password
from app.models.common import User
from app.schemas.common import ChangePasswordRequest, ProfileUpdate, UserRead

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}
AVATAR_DIR = os.path.join("static", "avatars")


@router.patch("", response_model=UserRead)
async def update_profile(
    body: ProfileUpdate,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's profile (first_name, last_name, language)."""
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    # ── Identity lock: block changes to identity fields when verified ──
    IDENTITY_FIELDS = {"first_name", "last_name", "gender", "nationality", "birth_country", "birth_date", "birth_city", "passport_name"}
    if current_user.identity_verified:
        locked_fields = IDENTITY_FIELDS & set(update_data.keys())
        if locked_fields:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Identité vérifiée — les champs suivants sont verrouillés : {', '.join(sorted(locked_fields))}. Contactez un administrateur.",
            )

    for field, value in update_data.items():
        setattr(current_user, field, value)

    await db.commit()
    await db.refresh(current_user)

    await record_audit(
        db,
        action="update",
        resource_type="profile",
        resource_id=str(current_user.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    # Re-fetch with eager-loaded relationships for response
    result = await db.execute(
        select(User).options(selectinload(User.job_position)).where(User.id == current_user.id)
    )
    return result.scalar_one()


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change current user's password."""
    if not current_user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account does not have a password set",
        )

    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    current_user.hashed_password = hash_password(body.new_password)
    await db.commit()

    await record_audit(
        db,
        action="change_password",
        resource_type="profile",
        resource_id=str(current_user.id),
        user_id=current_user.id,
        entity_id=entity_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {"message": "Password changed"}


@router.post("/avatar", response_model=UserRead)
async def upload_avatar(
    file: UploadFile,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a profile avatar image (png, jpg, webp)."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image type. Allowed: png, jpg, webp",
        )

    # Determine file extension from content type
    ext_map = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
    ext = ext_map[file.content_type]
    filename = f"{current_user.id}.{ext}"

    # Ensure avatar directory exists
    os.makedirs(AVATAR_DIR, exist_ok=True)

    # Remove any existing avatar files for this user
    for old_ext in ("png", "jpg", "webp"):
        old_path = os.path.join(AVATAR_DIR, f"{current_user.id}.{old_ext}")
        if os.path.exists(old_path):
            os.remove(old_path)

    # Save file
    file_path = os.path.join(AVATAR_DIR, filename)
    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    # Update user avatar_url — use API base URL for cross-domain access
    api_url = getattr(settings, 'API_URL', '') or ''
    avatar_url = f"{api_url}/static/avatars/{filename}" if api_url else f"/static/avatars/{filename}"
    current_user.avatar_url = avatar_url
    await db.commit()
    await db.refresh(current_user)

    await record_audit(
        db,
        action="upload_avatar",
        resource_type="profile",
        resource_id=str(current_user.id),
        user_id=current_user.id,
        entity_id=entity_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return current_user
