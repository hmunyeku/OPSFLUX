"""Auth routes — login, refresh, SSO, password reset, me.

MFA flow:
  1. POST /login → password check
     • If mfa_enabled=False → return tokens immediately (LoginResponse)
     • If mfa_enabled=True  → return {mfa_required: true, mfa_token: "..."} (LoginResponse)
  2. POST /mfa-verify → verify TOTP/backup code with mfa_token → return full tokens

Password reset:
  1. POST /forgot-password → sends reset email with JWT token (1h expiry)
  2. POST /reset-password → validates token + sets new password

SSO:
  1. GET  /sso/providers   → returns list of configured OAuth2 providers
  2. GET  /sso/authorize   → builds OAuth2 authorize URL, returns it
  3. GET  /sso/callback     → exchanges code for tokens, finds/creates user, redirects to frontend
"""

import logging
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import UUID

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user
from app.core.audit import record_audit
from app.core.config import settings
from app.core.auth_settings import get_security_settings
from app.core.login_security import check_login_rate_limit, verify_captcha
from app.core.database import get_db
from app.core.security import (
    JWTError,
    create_access_token,
    create_mfa_token,
    create_password_reset_token,
    create_refresh_token,
    create_sso_state_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.common import Entity, RefreshToken, Setting, User, UserGroup, UserGroupMember, UserGroupRole, UserSession, UserSSOProvider
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


def _validate_password_strength(password: str, *, config: dict | None = None) -> None:
    """Validate password against configurable policy (AUTH.md §7).

    If *config* is provided (DB-driven settings), those values are used.
    Otherwise falls back to env var defaults.
    Raises HTTPException 400 with specific detail if validation fails.
    """
    import re

    cfg = config or {}
    errors: list[str] = []
    min_len = cfg.get("password_min_length", settings.AUTH_PASSWORD_MIN_LENGTH)

    if len(password) < min_len:
        errors.append(f"Le mot de passe doit contenir au moins {min_len} caractères")
    if cfg.get("password_require_uppercase", settings.AUTH_PASSWORD_REQUIRE_UPPERCASE) and not re.search(r"[A-Z]", password):
        errors.append("Le mot de passe doit contenir au moins une majuscule")
    if cfg.get("password_require_digit", settings.AUTH_PASSWORD_REQUIRE_DIGIT) and not re.search(r"\d", password):
        errors.append("Le mot de passe doit contenir au moins un chiffre")
    if cfg.get("password_require_special", settings.AUTH_PASSWORD_REQUIRE_SPECIAL) and not re.search(r"[^A-Za-z0-9]", password):
        errors.append("Le mot de passe doit contenir au moins un caractère spécial")

    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))


class EntityBrief(BaseModel):
    id: UUID
    code: str
    name: str
    country: str | None = None
    timezone: str
    logo_url: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────


def _parse_browser(ua: str) -> str:
    """Extract browser name from User-Agent string."""
    ua_lower = ua.lower()
    if "edg/" in ua_lower:
        return "Edge"
    if "chrome/" in ua_lower and "chromium" not in ua_lower:
        return "Chrome"
    if "firefox/" in ua_lower:
        return "Firefox"
    if "safari/" in ua_lower and "chrome" not in ua_lower:
        return "Safari"
    if "opera" in ua_lower or "opr/" in ua_lower:
        return "Opera"
    return "Unknown"


def _parse_os(ua: str) -> str:
    """Extract OS name from User-Agent string."""
    ua_lower = ua.lower()
    if "windows" in ua_lower:
        return "Windows"
    if "mac os" in ua_lower or "macintosh" in ua_lower:
        return "macOS"
    if "linux" in ua_lower:
        return "Linux"
    if "android" in ua_lower:
        return "Android"
    if "iphone" in ua_lower or "ipad" in ua_lower:
        return "iOS"
    return "Unknown"


def _parse_device_type(ua: str) -> str:
    """Determine device type from User-Agent string."""
    ua_lower = ua.lower()
    if any(k in ua_lower for k in ("mobile", "android", "iphone")):
        return "mobile"
    if any(k in ua_lower for k in ("tablet", "ipad")):
        return "tablet"
    return "desktop"


async def _issue_tokens(
    user: User,
    request: Request,
    db: AsyncSession,
) -> LoginResponse:
    """Issue access + refresh tokens and persist refresh hash."""
    # Get user roles (via junction table)
    roles_result = await db.execute(
        select(UserGroupRole.role_code)
        .join(UserGroup, UserGroup.id == UserGroupRole.group_id)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(UserGroupMember.user_id == user.id, UserGroup.active == True)  # noqa: E712
        .distinct()
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

    # Create session record for security tracking
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    ua_string = user_agent or ""
    session = UserSession(
        user_id=user.id,
        token_hash=sha256(refresh_token.encode()).hexdigest(),
        ip_address=ip_address,
        user_agent=ua_string,
        browser=_parse_browser(ua_string),
        os=_parse_os(ua_string),
        device_type=_parse_device_type(ua_string),
        last_active_at=datetime.now(UTC),
    )
    db.add(session)

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
        entity_id=user.default_entity_id,
        ip_address=ip_address,
        user_agent=user_agent,
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

    Account lockout: configurable via admin settings (AUTH.md §7).
    """
    # Load DB-driven security settings (with env fallback)
    auth_cfg = await get_security_settings(db)

    # Bot protection: rate limiting
    await check_login_rate_limit(request, body.email, config=auth_cfg)

    # Bot protection: CAPTCHA verification
    await verify_captcha(body.captcha_token, config=auth_cfg)

    # Configurable lockout settings
    MAX_FAILED_ATTEMPTS = auth_cfg["max_failed_attempts"]
    LOCKOUT_DURATION_MIN = auth_cfg["lockout_duration_min"]

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": "Email ou mot de passe incorrect."},
        )

    if not user.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCOUNT_INACTIVE", "message": "Ce compte est désactivé. Contactez un administrateur."},
        )

    # ── Account lockout check (AUTH.md §7) ──────────────────────
    if user.locked_until:
        if user.locked_until > datetime.now(UTC):
            remaining = user.locked_until - datetime.now(UTC)
            remaining_min = max(1, int(remaining.total_seconds() / 60))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "ACCOUNT_LOCKED",
                    "message": f"Compte verrouillé suite à trop de tentatives. Réessayez dans {remaining_min} minute(s).",
                    "remaining_minutes": remaining_min,
                    "locked_until": user.locked_until.isoformat(),
                },
                headers={"Retry-After": str(int(remaining.total_seconds()))},
            )
        else:
            # Lockout expired — reset counters
            user.locked_until = None
            user.failed_login_count = 0

    # ── Account expiration check ──────────────────────────────
    if user.account_expires_at and user.account_expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCOUNT_EXPIRED", "message": "Ce compte a expiré. Contactez un administrateur."},
        )

    # ── Password verification ────────────────────────────────────
    if not verify_password(body.password, user.hashed_password):
        user.failed_login_count = (user.failed_login_count or 0) + 1

        await record_audit(
            db,
            action="login_failed",
            resource_type="user",
            resource_id=str(user.id),
            user_id=user.id,
            entity_id=user.default_entity_id,
            details={"reason": "invalid_password", "failed_count": user.failed_login_count},
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )

        if user.failed_login_count >= MAX_FAILED_ATTEMPTS:
            user.locked_until = datetime.now(UTC) + timedelta(minutes=LOCKOUT_DURATION_MIN)
            logger.warning("Account locked for user %s after %d failed attempts", body.email, user.failed_login_count)
            await record_audit(
                db,
                action="account_locked",
                resource_type="user",
                resource_id=str(user.id),
                user_id=user.id,
                entity_id=user.default_entity_id,
                details={"failed_count": user.failed_login_count, "locked_until": str(user.locked_until)},
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "ACCOUNT_JUST_LOCKED",
                    "message": f"Trop de tentatives échouées. Compte verrouillé pour {LOCKOUT_DURATION_MIN} minute(s).",
                    "lockout_duration_minutes": LOCKOUT_DURATION_MIN,
                    "locked_until": user.locked_until.isoformat(),
                },
            )

        remaining_attempts = MAX_FAILED_ATTEMPTS - user.failed_login_count
        await db.commit()

        detail: dict = {
            "code": "INVALID_CREDENTIALS",
            "message": "Email ou mot de passe incorrect.",
            "remaining_attempts": remaining_attempts,
        }
        if remaining_attempts <= 2:
            detail["warning"] = f"Attention : {remaining_attempts} tentative(s) restante(s) avant verrouillage du compte."

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
        )

    # ── Successful auth — reset failed count + record IP ─────
    if user.failed_login_count:
        user.failed_login_count = 0
        user.locked_until = None
    user.last_login_ip = request.client.host if request.client else None

    # ── MFA gate ─────────────────────────────────────────────────
    if user.mfa_enabled and user.totp_secret:
        mfa_token = create_mfa_token(user_id=user.id)
        logger.info("MFA challenge issued for user %s", user.email)
        return LoginResponse(mfa_required=True, mfa_token=mfa_token)

    # No MFA → issue tokens directly
    return await _issue_tokens(user, request, db)


@router.get("/login/config")
async def login_config(db: AsyncSession = Depends(get_db)):
    """Return public login configuration (CAPTCHA settings, etc.)."""
    auth_cfg = await get_security_settings(db)
    return {
        "captcha_enabled": auth_cfg["captcha_enabled"],
        "captcha_provider": auth_cfg["captcha_provider"] if auth_cfg["captcha_enabled"] else None,
        "captcha_site_key": auth_cfg["captcha_site_key"] if auth_cfg["captcha_enabled"] else None,
        "max_failed_attempts": auth_cfg["max_failed_attempts"],
        "lockout_duration_min": auth_cfg["lockout_duration_min"],
    }


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

    # Get roles (via junction table)
    roles_result = await db.execute(
        select(UserGroupRole.role_code)
        .join(UserGroup, UserGroup.id == UserGroupRole.group_id)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(UserGroupMember.user_id == user.id, UserGroup.active == True)
        .distinct()
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

    return [EntityBrief(id=e.id, code=e.code, name=e.name, country=e.country, timezone=e.timezone, logo_url=e.logo_url) for e in entities]


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


# ══════════════════════════════════════════════════════════════════════════════
# PASSWORD RESET
# ══════════════════════════════════════════════════════════════════════════════


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Send a password reset email. Always returns 200 to prevent email enumeration."""
    result = await db.execute(select(User).where(User.email == body.email, User.active == True))  # noqa: E712
    user = result.scalar_one_or_none()

    if user:
        token = create_password_reset_token(user_id=user.id, email=user.email)
        reset_url = f"{settings.APP_URL}/reset-password?token={token}"

        # Try to send via email template engine
        try:
            from app.core.email_templates import render_and_send_email

            entity_id = user.default_entity_id
            if entity_id:
                sent = await render_and_send_email(
                    db,
                    slug="password_reset",
                    entity_id=entity_id,
                    language=user.language or "fr",
                    to=user.email,
                    variables={
                        "reset_url": reset_url,
                        "user": {"first_name": user.first_name, "email": user.email},
                        "entity": {"name": "OpsFlux"},
                    },
                )
                if not sent:
                    # Fallback: direct email send if template not configured
                    from app.core.notifications import send_email
                    await send_email(
                        to=user.email,
                        subject="OpsFlux — Réinitialisation de votre mot de passe",
                        body_html=(
                            f"<p>Bonjour {user.first_name},</p>"
                            f"<p>Cliquez sur le lien suivant pour réinitialiser votre mot de passe :</p>"
                            f'<p><a href="{reset_url}">Réinitialiser mon mot de passe</a></p>'
                            f"<p>Ce lien expire dans 1 heure.</p>"
                            f"<p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>"
                        ),
                    )
            else:
                # No entity — fallback direct send
                from app.core.notifications import send_email
                await send_email(
                    to=user.email,
                    subject="OpsFlux — Réinitialisation de votre mot de passe",
                    body_html=(
                        f"<p>Bonjour {user.first_name},</p>"
                        f'<p><a href="{reset_url}">Réinitialiser mon mot de passe</a></p>'
                        f"<p>Ce lien expire dans 1 heure.</p>"
                    ),
                )

            logger.info("Password reset email sent to %s", body.email)
        except Exception:
            logger.exception("Failed to send password reset email to %s", body.email)

    # Always return success (prevent email enumeration)
    return {"detail": "If the email exists, a password reset link has been sent."}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Reset the user's password using a valid reset token."""
    try:
        payload = decode_token(body.token)
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    if payload.get("type") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid token type")

    user_id = UUID(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id, User.active == True))  # noqa: E712
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid reset token")

    # Validate password strength (AUTH.md §7 configurable policy)
    auth_cfg = await get_security_settings(db)
    _validate_password_strength(body.new_password, config=auth_cfg)

    user.hashed_password = hash_password(body.new_password)
    user.password_changed_at = datetime.now(UTC)
    # Reset lockout on password change
    user.failed_login_count = 0
    user.locked_until = None
    await db.commit()

    logger.info("Password reset successful for user %s", user.email)
    return {"detail": "Password has been reset successfully"}


# ── Change Password (authenticated) ──────────────────────────────────────────


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change password for the authenticated user. Requires current password."""
    if not current_user.hashed_password or not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")

    auth_cfg = await get_security_settings(db)
    _validate_password_strength(body.new_password, config=auth_cfg)

    current_user.hashed_password = hash_password(body.new_password)
    current_user.password_changed_at = datetime.now(UTC)
    await db.commit()

    logger.info("Password changed for user %s", current_user.email)
    return {"detail": "Password changed successfully"}


# ══════════════════════════════════════════════════════════════════════════════
# SSO — OAuth2 / OpenID Connect
# ══════════════════════════════════════════════════════════════════════════════

# Provider definitions: authorize_url, token_url, userinfo_url builders
SSO_PROVIDERS = {
    "google_oauth": {
        "name": "Google",
        "settings_prefix": "integration.google_oauth",
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://www.googleapis.com/oauth2/v3/userinfo",
        "default_scopes": "openid email profile",
        "icon": "google",
    },
    "azure_ad": {
        "name": "Microsoft",
        "settings_prefix": "integration.azure",
        "authorize_url_tpl": "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize",
        "token_url_tpl": "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
        "userinfo_url": "https://graph.microsoft.com/v1.0/me",
        "default_scopes": "openid email profile User.Read",
        "icon": "microsoft",
    },
    "okta": {
        "name": "Okta",
        "settings_prefix": "integration.okta",
        "authorize_url_tpl": "https://{domain}/oauth2/default/v1/authorize",
        "token_url_tpl": "https://{domain}/oauth2/default/v1/token",
        "userinfo_url_tpl": "https://{domain}/oauth2/default/v1/userinfo",
        "default_scopes": "openid email profile",
        "icon": "okta",
    },
    "keycloak": {
        "name": "Keycloak",
        "settings_prefix": "integration.keycloak",
        "authorize_url_tpl": "{server_url}/realms/{realm}/protocol/openid-connect/auth",
        "token_url_tpl": "{server_url}/realms/{realm}/protocol/openid-connect/token",
        "userinfo_url_tpl": "{server_url}/realms/{realm}/protocol/openid-connect/userinfo",
        "default_scopes": "openid email profile",
        "icon": "keycloak",
    },
}


async def _get_sso_settings(db: AsyncSession, entity_id: UUID, prefix: str) -> dict[str, str]:
    """Fetch all settings for a provider prefix from entity scope."""
    result = await db.execute(
        select(Setting).where(
            Setting.key.startswith(prefix),
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    cfg: dict[str, str] = {}
    for s in result.scalars().all():
        field = s.key.replace(prefix + ".", "")
        val = s.value.get("v", "") if isinstance(s.value, dict) else str(s.value)
        cfg[field] = str(val) if val else ""
    return cfg


def _build_provider_urls(provider_id: str, cfg: dict[str, str]) -> dict[str, str] | None:
    """Build authorize/token/userinfo URLs for a provider from its config."""
    provider = SSO_PROVIDERS.get(provider_id)
    if not provider:
        return None

    urls: dict[str, str] = {}

    # Authorize URL
    if "authorize_url" in provider:
        urls["authorize_url"] = provider["authorize_url"]
    elif "authorize_url_tpl" in provider:
        try:
            urls["authorize_url"] = provider["authorize_url_tpl"].format(**cfg)
        except KeyError:
            return None

    # Token URL
    if "token_url" in provider:
        urls["token_url"] = provider["token_url"]
    elif "token_url_tpl" in provider:
        try:
            urls["token_url"] = provider["token_url_tpl"].format(**cfg)
        except KeyError:
            return None

    # Userinfo URL
    if "userinfo_url" in provider:
        urls["userinfo_url"] = provider["userinfo_url"]
    elif "userinfo_url_tpl" in provider:
        try:
            urls["userinfo_url"] = provider["userinfo_url_tpl"].format(**cfg)
        except KeyError:
            return None

    return urls


@router.get("/sso/providers")
async def list_sso_providers(db: AsyncSession = Depends(get_db)):
    """Return list of configured SSO providers (those with client_id set)."""
    providers = []
    for provider_id, provider_def in SSO_PROVIDERS.items():
        cfg = await _get_sso_settings(db, entity_id, provider_def["settings_prefix"])
        if cfg.get("client_id"):
            providers.append({
                "id": provider_id,
                "name": provider_def["name"],
                "icon": provider_def.get("icon", provider_id),
            })
    return providers


@router.get("/sso/authorize")
async def sso_authorize(
    provider: str = Query(..., description="Provider ID: google_oauth, azure_ad, okta, keycloak"),
    db: AsyncSession = Depends(get_db),
):
    """Build OAuth2 authorization URL and return it. Frontend redirects the user."""
    if provider not in SSO_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown SSO provider: {provider}")

    provider_def = SSO_PROVIDERS[provider]
    cfg = await _get_sso_settings(db, entity_id, provider_def["settings_prefix"])

    client_id = cfg.get("client_id", "")
    if not client_id:
        raise HTTPException(status_code=400, detail=f"SSO provider '{provider}' is not configured")

    urls = _build_provider_urls(provider, cfg)
    if not urls:
        raise HTTPException(status_code=400, detail=f"Cannot build URLs for provider '{provider}' — missing config fields")

    # Build callback URL
    callback_url = f"{settings.API_URL}/api/v1/auth/sso/callback"

    # State token (CSRF protection + provider identification)
    state = create_sso_state_token(provider)

    # Scopes
    scopes = cfg.get("scopes", "") or provider_def.get("default_scopes", "openid email profile")

    # Build authorization URL
    import urllib.parse
    params = {
        "client_id": client_id,
        "redirect_uri": callback_url,
        "response_type": "code",
        "scope": scopes,
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    }
    authorize_url = f"{urls['authorize_url']}?{urllib.parse.urlencode(params)}"

    return {"authorize_url": authorize_url, "provider": provider}


@router.get("/sso/callback")
async def sso_callback(
    request: Request,
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
    error_description: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Handle OAuth2 callback: exchange code for tokens, find/create user, redirect to frontend."""
    import httpx

    # Handle OAuth2 error response (e.g. user denied, PKCE required)
    if error:
        logger.warning("SSO callback error: %s — %s", error, error_description or "")
        return RedirectResponse(f"{settings.APP_URL}/login?sso_error={error}")

    if not code or not state:
        return RedirectResponse(f"{settings.APP_URL}/login?sso_error=missing_code")

    # Validate state token
    try:
        state_payload = decode_token(state)
    except JWTError:
        return RedirectResponse(f"{settings.APP_URL}/login?sso_error=invalid_state")

    if state_payload.get("type") != "sso_state":
        return RedirectResponse(f"{settings.APP_URL}/login?sso_error=invalid_state")

    provider_id = state_payload.get("provider", "")
    if provider_id not in SSO_PROVIDERS:
        return RedirectResponse(f"{settings.APP_URL}/login?sso_error=unknown_provider")

    provider_def = SSO_PROVIDERS[provider_id]
    cfg = await _get_sso_settings(db, entity_id, provider_def["settings_prefix"])
    urls = _build_provider_urls(provider_id, cfg)
    if not urls:
        return RedirectResponse(f"{settings.APP_URL}/login?sso_error=provider_config")

    client_id = cfg.get("client_id", "")
    client_secret = cfg.get("client_secret", "")
    callback_url = f"{settings.API_URL}/api/v1/auth/sso/callback"

    # ── Step 1: Exchange authorization code for tokens ──
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token_resp = await client.post(
                urls["token_url"],
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": callback_url,
                    "client_id": client_id,
                    "client_secret": client_secret,
                },
                headers={"Accept": "application/json"},
            )
            if token_resp.status_code != 200:
                logger.error("SSO token exchange failed: %s %s", token_resp.status_code, token_resp.text[:500])
                return RedirectResponse(f"{settings.APP_URL}/login?sso_error=token_exchange")

            token_data = token_resp.json()
    except Exception:
        logger.exception("SSO token exchange error for provider %s", provider_id)
        return RedirectResponse(f"{settings.APP_URL}/login?sso_error=token_exchange")

    # ── Step 2: Get user info ──
    access_token_sso = token_data.get("access_token", "")
    if not access_token_sso:
        return RedirectResponse(f"{settings.APP_URL}/login?sso_error=no_access_token")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            userinfo_resp = await client.get(
                urls["userinfo_url"],
                headers={"Authorization": f"Bearer {access_token_sso}"},
            )
            if userinfo_resp.status_code != 200:
                logger.error("SSO userinfo failed: %s", userinfo_resp.text[:500])
                return RedirectResponse(f"{settings.APP_URL}/login?sso_error=userinfo")

            userinfo = userinfo_resp.json()
    except Exception:
        logger.exception("SSO userinfo error for provider %s", provider_id)
        return RedirectResponse(f"{settings.APP_URL}/login?sso_error=userinfo")

    # ── Step 3: Extract user identity ──
    # Different providers use different field names
    email = (
        userinfo.get("email")
        or userinfo.get("mail")  # Azure AD
        or userinfo.get("userPrincipalName")  # Azure AD fallback
    )
    if not email:
        return RedirectResponse(f"{settings.APP_URL}/login?sso_error=no_email")

    email = email.lower().strip()
    first_name = (
        userinfo.get("given_name")
        or userinfo.get("givenName")  # Azure AD
        or userinfo.get("first_name")
        or email.split("@")[0].title()
    )
    last_name = (
        userinfo.get("family_name")
        or userinfo.get("surname")  # Azure AD
        or userinfo.get("last_name")
        or ""
    )
    sso_id = (
        userinfo.get("sub")  # OIDC standard
        or userinfo.get("id")  # Azure AD
        or userinfo.get("uid")
        or email
    )

    # ── Step 4: Mode-dependent logic ──
    link_mode = state_payload.get("mode", "login")

    if link_mode == "link":
        # ── LINK MODE: Associate SSO identity to an existing logged-in user ──
        link_user_id = state_payload.get("user_id")
        if not link_user_id:
            return RedirectResponse(f"{settings.APP_URL}/settings#securite?sso_link=error&reason=missing_user")

        from uuid import UUID as PyUUID
        user = await db.get(User, PyUUID(link_user_id))
        if not user:
            return RedirectResponse(f"{settings.APP_URL}/settings#securite?sso_link=error&reason=user_not_found")

        # Check if this provider is already linked to this user
        existing = await db.execute(
            select(UserSSOProvider).where(
                UserSSOProvider.user_id == user.id,
                UserSSOProvider.provider == provider_id,
            )
        )
        if existing.scalar_one_or_none():
            return RedirectResponse(f"{settings.APP_URL}/settings#securite?sso_link=already_linked&provider={provider_id}")

        # Create the SSO link
        sso_link = UserSSOProvider(
            user_id=user.id,
            provider=provider_id,
            sso_subject=str(sso_id),
            email=email,
            display_name=f"{first_name} {last_name}".strip() or email,
        )
        db.add(sso_link)
        await db.commit()
        logger.info("SSO linked: user %s → provider %s (%s)", user.email, provider_id, email)
        return RedirectResponse(f"{settings.APP_URL}/settings#securite?sso_link=success&provider={provider_id}")

    # ── LOGIN MODE: Find user by email OR linked SSO provider ──
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    # Also check if this SSO identity is already linked to a user (different email)
    if not user:
        linked = await db.execute(
            select(UserSSOProvider).where(
                UserSSOProvider.provider == provider_id,
                UserSSOProvider.sso_subject == str(sso_id),
            )
        )
        linked_provider = linked.scalar_one_or_none()
        if linked_provider:
            user = await db.get(User, linked_provider.user_id)

    if not user:
        # No auto-provisioning — users must be created manually or via API
        logger.warning("SSO login rejected: no OpsFlux account found for email %s (provider: %s)", email, provider_id)
        return RedirectResponse(f"{settings.APP_URL}/login?sso_error=no_account")
    else:
        if not user.intranet_id:
            user.intranet_id = str(sso_id)
        if not user.active:
            return RedirectResponse(f"{settings.APP_URL}/login?sso_error=account_inactive")

    # Auto-link SSO provider on login if not already linked
    existing_link = await db.execute(
        select(UserSSOProvider).where(
            UserSSOProvider.user_id == user.id,
            UserSSOProvider.provider == provider_id,
        )
    )
    if not existing_link.scalar_one_or_none():
        db.add(UserSSOProvider(
            user_id=user.id,
            provider=provider_id,
            sso_subject=str(sso_id),
            email=email,
            display_name=f"{first_name} {last_name}".strip() or email,
        ))

    # ── Step 5: Issue OpsFlux tokens ──
    login_response = await _issue_tokens(user, request, db)

    import urllib.parse
    params = urllib.parse.urlencode({
        "sso_access_token": login_response.access_token,
        "sso_refresh_token": login_response.refresh_token,
    })
    return RedirectResponse(f"{settings.APP_URL}/login?{params}")


# ─── SSO Account Linking (from profile) ──────────────────────────────────────

@router.get("/sso/link")
async def sso_link_authorize(
    provider: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Initiate OAuth2 flow to link an SSO provider to the current user's account."""
    if provider not in SSO_PROVIDERS:
        raise HTTPException(400, f"Unknown SSO provider: {provider}")

    provider_def = SSO_PROVIDERS[provider]
    cfg = await _get_sso_settings(db, entity_id, provider_def["settings_prefix"])
    client_id = cfg.get("client_id", "")
    if not client_id:
        raise HTTPException(400, f"SSO provider '{provider}' is not configured")

    urls = _build_provider_urls(provider, cfg)
    if not urls:
        raise HTTPException(400, f"Cannot build URLs for provider '{provider}'")

    callback_url = f"{settings.API_URL}/api/v1/auth/sso/callback"
    state = create_sso_state_token(provider, mode="link", user_id=str(current_user.id))
    scopes = cfg.get("scopes", "") or provider_def.get("default_scopes", "openid email profile")

    import urllib.parse
    params = {
        "client_id": client_id,
        "redirect_uri": callback_url,
        "response_type": "code",
        "scope": scopes,
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    }
    authorize_url = f"{urls['authorize_url']}?{urllib.parse.urlencode(params)}"
    return {"authorize_url": authorize_url, "provider": provider}


@router.get("/sso/linked-providers")
async def list_linked_providers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return SSO providers linked to the current user."""
    result = await db.execute(
        select(UserSSOProvider).where(UserSSOProvider.user_id == current_user.id)
    )
    providers = result.scalars().all()
    return [
        {
            "id": str(p.id),
            "provider": p.provider,
            "email": p.email,
            "display_name": p.display_name,
            "linked_at": p.linked_at.isoformat() if p.linked_at else None,
            "last_used_at": p.last_used_at.isoformat() if p.last_used_at else None,
        }
        for p in providers
    ]


@router.delete("/sso/linked-providers/{provider_id}")
async def unlink_sso_provider(
    provider_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Unlink an SSO provider from the current user."""
    from uuid import UUID as PyUUID
    result = await db.execute(
        select(UserSSOProvider).where(
            UserSSOProvider.id == PyUUID(provider_id),
            UserSSOProvider.user_id == current_user.id,
        )
    )
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(404, "Linked provider not found")
    await db.delete(provider)
    await db.commit()
    return {"detail": "Provider unlinked"}
