"""Auth routes — login, refresh, SSO callback, me.

MFA flow:
  1. POST /login → password check
     • If mfa_enabled=False → return tokens immediately (LoginResponse)
     • If mfa_enabled=True  → return {mfa_required: true, mfa_token: "..."} (LoginResponse)
  2. POST /mfa-verify → verify TOTP/backup code with mfa_token → return full tokens
"""

import logging
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import UUID

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user
from app.core.audit import record_audit
from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    JWTError,
    create_access_token,
    create_mfa_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.models.common import Entity, RefreshToken, User, UserGroup, UserGroupMember
from app.schemas.common import (
    LoginRequest,
    LoginResponse,
    MFALoginRequest,
    RefreshRequest,
    TokenResponse,
    UserRead,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
logger = logging.getLogger(__name__)


class EntityBrief(BaseModel):
    id: UUID
    code: str
    name: str
    country: str | None = None
    timezone: str


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _issue_tokens(
    user: User,
    request: Request,
    db: AsyncSession,
) -> LoginResponse:
    """Issue access + refresh tokens and persist refresh hash."""
    # Get user roles
    roles_result = await db.execute(
        select(UserGroup.role_code)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(UserGroupMember.user_id == user.id, UserGroup.active == True)  # noqa: E712
    )
    roles = [row[0] for row in roles_result.all()]

    access_token = create_access_token(
        user_id=user.id,
        tenant_schema=getattr(request.state, "tenant_schema", "public"),
        entity_id=user.default_entity_id,
        roles=roles,
        extra={"name": user.full_name, "email": user.email},
    )
    refresh_token = create_refresh_token(user_id=user.id)

    token_hash = sha256(refresh_token.encode()).hexdigest()
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.now(UTC) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
    ))

    await db.execute(
        update(User).where(User.id == user.id).values(last_login_at=datetime.now(UTC))
    )
    await db.commit()

    await record_audit(
        db,
        action="login",
        resource_type="user",
        resource_id=str(user.id),
        user_id=user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ── Login ────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Authenticate with email + password.

    If MFA is enabled, returns ``{mfa_required: true, mfa_token: "..."}``
    instead of full tokens.  The client must then call ``/mfa-verify``.
    """
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    # ── MFA gate ─────────────────────────────────────────────────
    if user.mfa_enabled and user.totp_secret:
        mfa_token = create_mfa_token(user_id=user.id)
        logger.info("MFA challenge issued for user %s", user.email)
        return LoginResponse(mfa_required=True, mfa_token=mfa_token)

    # No MFA → issue tokens directly
    return await _issue_tokens(user, request, db)


# ── MFA verification (second login step) ─────────────────────────────────────

@router.post("/mfa-verify", response_model=LoginResponse)
async def mfa_verify_login(
    body: MFALoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Second step of login: verify TOTP or backup code and return full tokens."""
    # Decode MFA token
    try:
        payload = decode_token(body.mfa_token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired MFA token")

    if payload.get("type") != "mfa_challenge":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = UUID(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.active or not user.mfa_enabled or not user.totp_secret:
        raise HTTPException(status_code=401, detail="Invalid MFA session")

    # Try TOTP
    totp = pyotp.TOTP(user.totp_secret)
    if totp.verify(body.code, valid_window=1):
        await record_audit(
            db,
            action="mfa_verify_totp",
            resource_type="user",
            resource_id=str(user.id),
            user_id=user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        await db.commit()
        return await _issue_tokens(user, request, db)

    # Try backup codes
    stored_codes: list[str] = user.mfa_backup_codes or []
    code_hash = sha256(body.code.encode()).hexdigest()
    for idx, stored_hash in enumerate(stored_codes):
        if code_hash == stored_hash:
            updated_codes = stored_codes.copy()
            updated_codes.pop(idx)
            user.mfa_backup_codes = updated_codes
            await db.commit()

            await record_audit(
                db,
                action="mfa_verify_backup",
                resource_type="user",
                resource_id=str(user.id),
                user_id=user.id,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
                details={"remaining_backup_codes": len(updated_codes)},
            )
            await db.commit()
            return await _issue_tokens(user, request, db)

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid MFA code",
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Refresh access token using a valid refresh token."""
    try:
        payload = decode_token(body.refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = UUID(payload["sub"])
    token_hash = sha256(body.refresh_token.encode()).hexdigest()

    # Verify token exists and is not revoked
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.user_id == user_id,
            RefreshToken.revoked == False,
        )
    )
    stored_token = result.scalar_one_or_none()
    if not stored_token:
        raise HTTPException(status_code=401, detail="Refresh token revoked or not found")

    # Revoke old token
    stored_token.revoked = True

    # Get user
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user or not user.active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Get roles
    roles_result = await db.execute(
        select(UserGroup.role_code)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(UserGroupMember.user_id == user.id, UserGroup.active == True)
    )
    roles = [row[0] for row in roles_result.all()]

    # Issue new tokens
    new_access = create_access_token(
        user_id=user.id,
        tenant_schema="public",
        entity_id=user.default_entity_id,
        roles=roles,
        extra={"name": user.full_name, "email": user.email},
    )
    new_refresh = create_refresh_token(user_id=user.id)

    new_hash = sha256(new_refresh.encode()).hexdigest()
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=new_hash,
        expires_at=datetime.now(UTC) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
    ))

    await db.commit()

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me", response_model=UserRead)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user profile."""
    return current_user


@router.get("/me/permissions", response_model=list[str])
async def get_my_permissions(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Get all permission codes for the current user in the current entity."""
    from app.core.rbac import get_user_permissions

    perms = await get_user_permissions(current_user.id, entity_id, db)
    return sorted(perms)


# ── Entity management ────────────────────────────────────────────────────────

@router.get("/me/entities", response_model=list[EntityBrief])
async def get_my_entities(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all entities the current user has access to (via group membership)."""
    # Find all entity_ids from groups the user belongs to
    stmt = (
        select(Entity)
        .where(
            Entity.id.in_(
                select(UserGroup.entity_id)
                .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
                .where(UserGroupMember.user_id == current_user.id, UserGroup.active == True)  # noqa: E712
            ),
            Entity.active == True,  # noqa: E712
        )
        .order_by(Entity.name)
    )
    result = await db.execute(stmt)
    entities = result.scalars().all()

    # If user has a default_entity_id but no groups yet (e.g., super admin), include it
    entity_ids = {e.id for e in entities}
    if current_user.default_entity_id and current_user.default_entity_id not in entity_ids:
        default_result = await db.execute(
            select(Entity).where(Entity.id == current_user.default_entity_id)
        )
        default_entity = default_result.scalar_one_or_none()
        if default_entity:
            entities.insert(0, default_entity)

    return [EntityBrief(id=e.id, code=e.code, name=e.name, country=e.country, timezone=e.timezone) for e in entities]


class EntitySwitch(BaseModel):
    entity_id: UUID


@router.patch("/me/entity")
async def switch_entity(
    body: EntitySwitch,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Switch the user's active entity."""
    # Verify entity exists and user has access
    access_check = await db.execute(
        select(UserGroup.id)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(
            UserGroupMember.user_id == current_user.id,
            UserGroup.entity_id == body.entity_id,
            UserGroup.active == True,  # noqa: E712
        )
        .limit(1)
    )
    has_access = access_check.scalar_one_or_none()

    # Also allow if it's the user's default entity
    if not has_access and current_user.default_entity_id != body.entity_id:
        raise HTTPException(status_code=403, detail="No access to this entity")

    # Update user's default entity
    current_user.default_entity_id = body.entity_id
    await db.commit()

    # Invalidate RBAC cache for this user
    from app.core.rbac import invalidate_rbac_cache
    await invalidate_rbac_cache(current_user.id)

    return {"detail": "Entity switched", "entity_id": str(body.entity_id)}


@router.post("/logout")
async def logout(
    body: RefreshRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke the refresh token (logout)."""
    token_hash = sha256(body.refresh_token.encode()).hexdigest()
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == token_hash, RefreshToken.user_id == current_user.id)
        .values(revoked=True)
    )
    await db.commit()
    return {"detail": "Logged out"}
