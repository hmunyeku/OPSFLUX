"""Mobile QR pairing — WhatsApp-Web style login for the mobile app.

Flow:
  1. Web (authenticated user) → POST /auth/mobile-pair/generate
     Server creates a token, stores SHA-256 hash, returns the plaintext
     token once + QR payload (JSON with api URL + token).
  2. Web displays QR, polls /status every ~2s.
  3. Mobile scans QR → POST /auth/mobile-pair/consume {token, device_info}
     Server validates hash, marks consumed, issues JWT access/refresh.
  4. Web sees status=consumed → confirms "mobile connected".

Security:
  - Plaintext token never persisted.
  - 2-minute TTL.
  - Single-use.
  - Rate limit: max 5 active pending tokens per user at any time.
  - Audit log on both generate and consume.
"""

from __future__ import annotations

import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token
from app.core.audit import record_audit
from app.models.common import (
    MobilePairingToken,
    RefreshToken,
    User,
    UserGroup,
    UserGroupMember,
    UserGroupRole,
    UserSession,
)
from app.schemas.common import (
    MobilePairingConsumeRequest,
    MobilePairingConsumeResponse,
    MobilePairingGenerateResponse,
    MobilePairingStatusResponse,
)
from app.core.errors import StructuredHTTPException

router = APIRouter(prefix="/api/v1/auth/mobile-pair", tags=["auth", "mobile-pairing"])


# Configuration
PAIRING_TTL_SECONDS = 120  # 2 minutes
MAX_PENDING_PER_USER = 5
TOKEN_PREFIX = "opspair_"  # easy identification, not secret


def _generate_raw_token() -> str:
    """Cryptographically-secure random 32-byte token, url-safe."""
    return TOKEN_PREFIX + secrets.token_urlsafe(32)


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _get_user_roles(db: AsyncSession, user_id: UUID) -> list[str]:
    result = await db.execute(
        select(UserGroupRole.role_code)
        .join(UserGroup, UserGroup.id == UserGroupRole.group_id)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(UserGroupMember.user_id == user_id, UserGroup.active == True)  # noqa: E712
        .distinct()
    )
    return [row[0] for row in result.all()]


# ── GENERATE (web → create token) ─────────────────────────────────────

@router.post("/generate", response_model=MobilePairingGenerateResponse)
async def generate_pairing_token(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a short-lived pairing token tied to the current user.
    Plaintext is returned ONCE; only the hash is stored.
    """
    # Rate limit: clean expired + count pending
    now = datetime.now(UTC)
    await db.execute(
        update(MobilePairingToken)
        .where(
            and_(
                MobilePairingToken.status == "pending",
                MobilePairingToken.expires_at < now,
            )
        )
        .values(status="expired")
    )
    pending_count = (
        await db.execute(
            select(func.count())
            .select_from(MobilePairingToken)
            .where(
                and_(
                    MobilePairingToken.user_id == current_user.id,
                    MobilePairingToken.status == "pending",
                )
            )
        )
    ).scalar_one()
    if pending_count >= MAX_PENDING_PER_USER:
        raise StructuredHTTPException(
            429,
            code="TOO_MANY_PENDING_PAIRING_TOKENS_MAX",
            message="Too many pending pairing tokens (max {MAX_PENDING_PER_USER}). Revoke unused tokens first.",
            params={
                "MAX_PENDING_PER_USER": MAX_PENDING_PER_USER,
            },
        )

    raw = _generate_raw_token()
    token_hash = _hash_token(raw)
    expires_at = now + timedelta(seconds=PAIRING_TTL_SECONDS)

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    pair = MobilePairingToken(
        token_hash=token_hash,
        user_id=current_user.id,
        entity_id=current_user.default_entity_id,
        expires_at=expires_at,
        created_ip=ip,
        created_user_agent=ua[:500] if ua else None,
        status="pending",
    )
    db.add(pair)
    await db.commit()

    await record_audit(
        db,
        action="mobile_pair_generate",
        resource_type="mobile_pairing_token",
        resource_id=str(pair.id),
        user_id=current_user.id,
        ip_address=ip,
        user_agent=ua,
    )
    await db.commit()

    # Build the QR payload — mobile decodes this JSON
    qr_payload_obj = {
        "v": 1,
        "api": settings.API_BASE_URL.rstrip("/"),
        "token": raw,
    }
    qr_payload = json.dumps(qr_payload_obj, separators=(",", ":"))

    return MobilePairingGenerateResponse(
        token=raw,
        qr_payload=qr_payload,
        expires_at=expires_at,
        ttl_seconds=PAIRING_TTL_SECONDS,
    )


# ── STATUS (web polls to detect scan) ─────────────────────────────────

@router.get("/status", response_model=MobilePairingStatusResponse)
async def get_pairing_status(
    token: str = Query(..., description="The plaintext token the web is holding"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Poll to know if the mobile has scanned/consumed the QR."""
    token_hash = _hash_token(token)
    pair = (
        await db.execute(
            select(MobilePairingToken).where(MobilePairingToken.token_hash == token_hash)
        )
    ).scalar_one_or_none()
    if not pair:
        raise StructuredHTTPException(
            404,
            code="PAIRING_TOKEN_NOT_FOUND",
            message="Pairing token not found",
        )
    if pair.user_id != current_user.id:
        # Another user's token — deny
        raise StructuredHTTPException(
            403,
            code="PAIRING_TOKEN_DOES_NOT_BELONG_YOU",
            message="This pairing token does not belong to you",
        )

    # Auto-expire if past TTL
    if pair.status == "pending" and pair.expires_at < datetime.now(UTC):
        pair.status = "expired"
        await db.commit()

    return MobilePairingStatusResponse(
        status=pair.status,
        consumed_at=pair.consumed_at,
        consumed_device_info=pair.consumed_device_info,
    )


# ── REVOKE (web cancels) ──────────────────────────────────────────────

@router.post("/revoke", status_code=204)
async def revoke_pairing_token(
    token: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    token_hash = _hash_token(token)
    pair = (
        await db.execute(
            select(MobilePairingToken).where(MobilePairingToken.token_hash == token_hash)
        )
    ).scalar_one_or_none()
    if not pair or pair.user_id != current_user.id:
        raise StructuredHTTPException(
            404,
            code="PAIRING_TOKEN_NOT_FOUND",
            message="Pairing token not found",
        )
    if pair.status != "pending":
        return  # already settled, no-op
    pair.status = "revoked"
    await db.commit()


# ── CONSUME (mobile exchanges token for JWT) ──────────────────────────

@router.post("/consume", response_model=MobilePairingConsumeResponse)
async def consume_pairing_token(
    body: MobilePairingConsumeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Called by the mobile after scanning the QR. Exchanges the single-use
    token for JWT tokens. Does NOT require prior authentication — the
    token itself is the credential.
    """
    token_hash = _hash_token(body.token)

    pair = (
        await db.execute(
            select(MobilePairingToken).where(MobilePairingToken.token_hash == token_hash)
        )
    ).scalar_one_or_none()
    if not pair:
        raise StructuredHTTPException(
            404,
            code="INVALID_PAIRING_TOKEN",
            message="Invalid pairing token",
        )

    now = datetime.now(UTC)
    if pair.status != "pending":
        raise StructuredHTTPException(
            400,
            code="PAIRING_TOKEN",
            message="Pairing token is {status}",
            params={
                "status": pair.status,
            },
        )
    if pair.expires_at < now:
        pair.status = "expired"
        await db.commit()
        raise StructuredHTTPException(
            410,
            code="PAIRING_TOKEN_HAS_EXPIRED",
            message="Pairing token has expired",
        )

    # Load user (must still be active)
    user = (
        await db.execute(select(User).where(User.id == pair.user_id))
    ).scalar_one_or_none()
    if not user or not getattr(user, "active", True):
        raise StructuredHTTPException(
            403,
            code="USER_ACCOUNT_NOT_ACTIVE",
            message="User account is not active",
        )

    # Mark consumed
    ip = request.client.host if request.client else None
    pair.status = "consumed"
    pair.consumed_at = now
    pair.consumed_ip = ip
    pair.consumed_device_info = dict(body.device_info) if body.device_info else None

    # Issue JWT
    roles = await _get_user_roles(db, user.id)
    access_token = create_access_token(
        user_id=user.id,
        tenant_schema=getattr(request.state, "tenant_schema", "public"),
        entity_id=user.default_entity_id,
        roles=roles,
        extra={"name": user.full_name, "email": user.email},
    )
    refresh_token = create_refresh_token(user_id=user.id)

    db.add(RefreshToken(
        user_id=user.id,
        token_hash=sha256(refresh_token.encode()).hexdigest(),
        expires_at=now + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
    ))

    # Session entry — labels this as "mobile paired"
    ua = request.headers.get("user-agent") or ""
    device_os = (body.device_info or {}).get("os") if body.device_info else None
    device_model = (body.device_info or {}).get("model") if body.device_info else None
    db.add(UserSession(
        user_id=user.id,
        token_hash=sha256(refresh_token.encode()).hexdigest(),
        ip_address=ip,
        user_agent=ua,
        browser="OpsFlux Mobile",
        os=device_os or "",
        device_type=f"mobile:{device_model}" if device_model else "mobile",
        last_active_at=now,
    ))

    await db.execute(
        update(User).where(User.id == user.id).values(last_login_at=now)
    )
    await db.commit()

    await record_audit(
        db,
        action="mobile_pair_consume",
        resource_type="mobile_pairing_token",
        resource_id=str(pair.id),
        user_id=user.id,
        entity_id=user.default_entity_id,
        ip_address=ip,
        user_agent=ua,
    )
    await db.commit()

    return MobilePairingConsumeResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user={
            "id": str(user.id),
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "display_name": f"{user.first_name} {user.last_name}".strip() or user.email,
            "language": user.language or "fr",
            "default_entity_id": str(user.default_entity_id) if user.default_entity_id else None,
            "mfa_enabled": bool(getattr(user, "mfa_enabled", False)),
        },
        entity_id=str(user.default_entity_id) if user.default_entity_id else None,
    )
