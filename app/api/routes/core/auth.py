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
from app.core.login_security import check_login_rate_limit, verify_captcha, get_login_config
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
from app.models.common import Entity, RefreshToken, Setting, User, UserGroup, UserGroupMember, UserSession
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


def _validate_password_strength(password: str) -> None:
    """Validate password against configurable policy (AUTH.md §7).

    Raises HTTPException 400 with specific detail if validation fails.
    """
    import re

    errors: list[str] = []
    min_len = settings.AUTH_PASSWORD_MIN_LENGTH

    if len(password) < min_len:
        errors.append(f"Password must be at least {min_len} characters")
    if settings.AUTH_PASSWORD_REQUIRE_UPPERCASE and not re.search(r"[A-Z]", password):
        errors.append("Password must contain at least one uppercase letter")
    if settings.AUTH_PASSWORD_REQUIRE_DIGIT and not re.search(r"\d", password):
        errors.append("Password must contain at least one digit")
    if settings.AUTH_PASSWORD_REQUIRE_SPECIAL and not re.search(r"[^A-Za-z0-9]", password):
        errors.append("Password must contain at least one special character")

    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))


class EntityBrief(BaseModel):
    id: UUID
    code: str
    name: str
    country: str | None = None
    timezone: str


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

    Account lockout: after 5 failed attempts, account is locked for 15 min (AUTH.md §7).
    """
    # Bot protection: rate limiting
    await check_login_rate_limit(request, body.email)

    # Bot protection: CAPTCHA verification
    await verify_captcha(body.captcha_token)

    # Configurable lockout settings (AUTH.md §7-8)
    MAX_FAILED_ATTEMPTS = settings.AUTH_MAX_FAILED_ATTEMPTS
    LOCKOUT_DURATION_MIN = settings.AUTH_LOCKOUT_DURATION_MIN

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    # ── Account lockout check (AUTH.md §7) ──────────────────────
    if user.locked_until:
        if user.locked_until > datetime.now(UTC):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Account temporarily locked. Try again later.",
            )
        else:
            # Lockout expired — reset counters
            user.locked_until = None
            user.failed_login_count = 0

    # ── Account expiration check ──────────────────────────────
    if user.account_expires_at and user.account_expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has expired",
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
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
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
async def login_config():
    """Return public login configuration (CAPTCHA settings, etc.)."""
    return get_login_config()


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
    _validate_password_strength(body.new_password)

    user.hashed_password = hash_password(body.new_password)
    user.password_changed_at = datetime.now(UTC)
    # Reset lockout on password change
    user.failed_login_count = 0
    user.locked_until = None
    await db.commit()

    logger.info("Password reset successful for user %s", user.email)
    return {"detail": "Password has been reset successfully"}


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


async def _get_sso_settings(db: AsyncSession, prefix: str) -> dict[str, str]:
    """Fetch all settings for a provider prefix from entity scope."""
    result = await db.execute(
        select(Setting).where(Setting.key.startswith(prefix), Setting.scope == "entity")
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
        cfg = await _get_sso_settings(db, provider_def["settings_prefix"])
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
    cfg = await _get_sso_settings(db, provider_def["settings_prefix"])

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
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Handle OAuth2 callback: exchange code for tokens, find/create user, redirect to frontend."""
    import httpx

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
    cfg = await _get_sso_settings(db, provider_def["settings_prefix"])
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

    # ── Step 4: Find or create user ──
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        # Auto-provision new SSO user (JIT provisioning per AUTH.md §2.2)
        # Find default entity for this tenant
        default_entity_result = await db.execute(
            select(Entity).where(Entity.active == True).order_by(Entity.created_at).limit(1)  # noqa: E712
        )
        default_entity = default_entity_result.scalar_one_or_none()

        user = User(
            email=email,
            first_name=first_name,
            last_name=last_name,
            intranet_id=str(sso_id),
            sso_subject=str(sso_id),
            auth_type="sso",
            active=True,
            language="fr",
            default_entity_id=default_entity.id if default_entity else None,
        )
        db.add(user)
        await db.flush()  # get the user.id
        logger.info("SSO auto-provisioned new user: %s (provider: %s, entity: %s)",
                     email, provider_id, default_entity.code if default_entity else "none")
    else:
        # Update intranet_id if not set
        if not user.intranet_id:
            user.intranet_id = str(sso_id)

        if not user.active:
            return RedirectResponse(f"{settings.APP_URL}/login?sso_error=account_inactive")

    # ── Step 5: Issue OpsFlux tokens ──
    login_response = await _issue_tokens(user, request, db)

    # Redirect to frontend with tokens
    import urllib.parse
    params = urllib.parse.urlencode({
        "sso_access_token": login_response.access_token,
        "sso_refresh_token": login_response.refresh_token,
    })
    return RedirectResponse(f"{settings.APP_URL}/login?{params}")
