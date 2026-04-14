"""User verification routes — phone, email, GPS location, ID document.

Each successful verification creates a UserVerification row (append-only
audit trail), and may also update the underlying resource (Phone.verified,
UserEmail.verified, etc).

Endpoints are mobile-first (the mobile app is considered a "trusted device"
once paired via QR) but also work from the web for users without a phone.

Workflow per type:
  phone       : POST /start (sends OTP) -> POST /confirm {otp}
  email       : POST /start (sends OTP) -> POST /confirm {otp}
  location    : POST /declare {lat, lng, accuracy}   (no separate confirm)
  id_document : POST /submit {front, back, selfie}   (enters operator queue)
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.core.redis_client import get_redis
from app.models.common import (
    Phone,
    User,
    UserEmail,
    UserVerification,
)
from app.schemas.common import (
    UserVerificationRead,
    VerificationConfirmOtpRequest,
    VerificationIdDocumentRequest,
    VerificationLocationRequest,
    VerificationStartEmailRequest,
    VerificationStartPhoneRequest,
)

router = APIRouter(prefix="/api/v1/verifications", tags=["verifications"])


OTP_TTL_MINUTES = 10
LOCATION_VERIFICATION_TTL_DAYS = 30


def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode("utf-8")).hexdigest()


def _gen_otp() -> str:
    return f"{secrets.randbelow(1000000):06d}"


# ── Read user's verifications ─────────────────────────────────────────

@router.get("", response_model=list[UserVerificationRead])
async def list_my_verifications(
    type: str | None = Query(None, description="Filter by type"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """All verification attempts for the current user, most recent first."""
    query = (
        select(UserVerification)
        .where(UserVerification.user_id == current_user.id)
        .order_by(UserVerification.created_at.desc())
    )
    if type:
        query = query.where(UserVerification.type == type)
    return (await db.execute(query)).scalars().all()


# ── OTP rate limit ────────────────────────────────────────────────────
#
# Protects against SMS billing DoS. An authenticated user could
# otherwise loop `/phone/start` and drain the OVH SMS credit. We gate:
#   1. per (user, phone_id): one OTP at most every 60s + max 5 per 24h
#   2. per (user): max 20 OTP attempts per hour across all verification
#      flows (email/phone combined)
#
# Redis-backed so the counters survive a backend restart and are shared
# across the 4 uvicorn workers.

_OTP_COOLDOWN_SECONDS = 60
_OTP_DAILY_CAP = 5
_OTP_HOURLY_USER_CAP = 20


async def _check_otp_rate_limit(user_id: UUID, target_key: str) -> None:
    """Raise 429 when the user exceeds any configured OTP limit.

    ``target_key`` is a phone id / email id / ... — uniquely identifies
    the destination so different phones don't share a cooldown.
    """
    try:
        redis = get_redis()
    except RuntimeError:
        return  # redis down → fail-open, log only (don't break UX)

    cooldown_key = f"otp:cooldown:{user_id}:{target_key}"
    daily_key = f"otp:daily:{user_id}:{target_key}"
    hourly_key = f"otp:hourly:{user_id}"

    # 1. Per-target cooldown
    if await redis.exists(cooldown_key):
        ttl = await redis.ttl(cooldown_key)
        raise HTTPException(
            status_code=429,
            detail={
                "code": "OTP_COOLDOWN",
                "message": f"Veuillez patienter {ttl}s avant une nouvelle tentative.",
                "retry_after": ttl,
            },
            headers={"Retry-After": str(max(1, ttl))},
        )

    # 2. Per-target daily cap
    daily_count = await redis.get(daily_key)
    if daily_count and int(daily_count) >= _OTP_DAILY_CAP:
        ttl = await redis.ttl(daily_key)
        raise HTTPException(
            status_code=429,
            detail={
                "code": "OTP_DAILY_CAP",
                "message": "Limite quotidienne d'OTP atteinte.",
                "retry_after": ttl,
            },
            headers={"Retry-After": str(max(1, ttl))},
        )

    # 3. Per-user hourly cap (all flows combined)
    hourly_count = await redis.get(hourly_key)
    if hourly_count and int(hourly_count) >= _OTP_HOURLY_USER_CAP:
        ttl = await redis.ttl(hourly_key)
        raise HTTPException(
            status_code=429,
            detail={
                "code": "OTP_USER_HOURLY_CAP",
                "message": "Trop de demandes de vérification. Réessayez plus tard.",
                "retry_after": ttl,
            },
            headers={"Retry-After": str(max(1, ttl))},
        )

    # All checks pass — commit the counters.
    await redis.setex(cooldown_key, _OTP_COOLDOWN_SECONDS, "1")
    new_daily = await redis.incr(daily_key)
    if new_daily == 1:
        await redis.expire(daily_key, 24 * 3600)
    new_hourly = await redis.incr(hourly_key)
    if new_hourly == 1:
        await redis.expire(hourly_key, 3600)


# ── Phone verification ────────────────────────────────────────────────

@router.post("/phone/start", response_model=UserVerificationRead)
async def start_phone_verification(
    body: VerificationStartPhoneRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send an OTP to the user's phone via WhatsApp / SMS."""
    phone = (
        await db.execute(select(Phone).where(Phone.id == body.phone_id))
    ).scalar_one_or_none()
    if not phone:
        raise HTTPException(status_code=404, detail="Phone not found")
    if phone.owner_type == "user" and str(phone.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Phone does not belong to you")

    # Enforce OTP rate-limits (SMS billing DoS protection).
    await _check_otp_rate_limit(current_user.id, f"phone:{phone.id}")

    otp = _gen_otp()
    otp_hash = _hash_otp(otp)

    verification = UserVerification(
        user_id=current_user.id,
        type="phone",
        method="otp_whatsapp",  # may become otp_sms after send
        status="pending",
        evidence={"otp_hash": otp_hash, "phone_id": str(phone.id)},
        expires_at=datetime.now(UTC) + timedelta(minutes=OTP_TTL_MINUTES),
        target_phone_id=phone.id,
    )
    db.add(verification)
    await db.flush()

    # Also update the Phone row for backwards compatibility with /phones endpoint
    phone.verification_code = otp
    phone.verification_expires_at = verification.expires_at
    await db.commit()

    # Send OTP
    full_number = f"{phone.country_code or ''}{phone.number}".strip()
    from app.core.sms_service import send_whatsapp_otp

    sent, channel = await send_whatsapp_otp(
        db, to=full_number, otp_code=otp, user_id=str(current_user.id)
    )

    # Update method to reflect actual channel
    if sent and channel and channel != "whatsapp":
        verification.method = f"otp_{channel}"
        await db.commit()

    if not sent:
        # Dev fallback — include code in response when no provider configured
        verification.method = "otp_manual"
        await db.commit()
        result = await db.execute(
            select(UserVerification).where(UserVerification.id == verification.id)
        )
        return result.scalar_one()

    return verification


@router.post("/phone/confirm", response_model=UserVerificationRead)
async def confirm_phone_verification(
    body: VerificationConfirmOtpRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    verification = (
        await db.execute(
            select(UserVerification).where(UserVerification.id == body.verification_id)
        )
    ).scalar_one_or_none()
    if not verification or verification.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Verification not found")
    if verification.type != "phone":
        raise HTTPException(status_code=400, detail="Not a phone verification")
    if verification.status != "pending":
        raise HTTPException(status_code=400, detail=f"Verification is {verification.status}")
    if verification.expires_at and verification.expires_at < datetime.now(UTC):
        verification.status = "expired"
        await db.commit()
        raise HTTPException(status_code=410, detail="Code has expired")

    expected_hash = (verification.evidence or {}).get("otp_hash")
    if not expected_hash or _hash_otp(body.otp) != expected_hash:
        raise HTTPException(status_code=400, detail="Invalid code")

    verification.status = "verified"
    verification.verified_at = datetime.now(UTC)

    # Mark the Phone as verified too
    if verification.target_phone_id:
        await db.execute(
            update(Phone)
            .where(Phone.id == verification.target_phone_id)
            .values(
                verified=True,
                verified_at=verification.verified_at,
                verification_code=None,
                verification_expires_at=None,
            )
        )

    await db.commit()
    await db.refresh(verification)
    return verification


# ── Email verification ────────────────────────────────────────────────

@router.post("/email/start", response_model=UserVerificationRead)
async def start_email_verification(
    body: VerificationStartEmailRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    email = (
        await db.execute(
            select(UserEmail).where(UserEmail.id == body.email_id)
        )
    ).scalar_one_or_none()
    if not email or email.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Email not found")

    # Same rate-limit regime as phone OTP (no per-email SMS billing
    # concern, but we don't want to become a mailer-loop gateway).
    await _check_otp_rate_limit(current_user.id, f"email:{email.id}")

    otp = _gen_otp()
    otp_hash = _hash_otp(otp)

    verification = UserVerification(
        user_id=current_user.id,
        type="email",
        method="otp_email",
        status="pending",
        evidence={"otp_hash": otp_hash, "email_id": str(email.id)},
        expires_at=datetime.now(UTC) + timedelta(minutes=OTP_TTL_MINUTES),
        target_email_id=email.id,
    )
    db.add(verification)
    await db.commit()
    await db.refresh(verification)

    # Send email — best effort
    try:
        from app.core.notifications import send_email
        await send_email(
            to=email.email,
            subject="Code de vérification OpsFlux",
            body_html=(
                f"<p>Votre code de vérification OpsFlux est :</p>"
                f"<p style='font-size:24px;font-weight:bold;letter-spacing:4px'>{otp}</p>"
                f"<p>Ce code expire dans {OTP_TTL_MINUTES} minutes.</p>"
            ),
            db=db,
            user_id=current_user.id,
            category="verification",
        )
    except Exception:
        # No email infrastructure? Keep the verification pending — operator can manually verify.
        pass

    return verification


@router.post("/email/confirm", response_model=UserVerificationRead)
async def confirm_email_verification(
    body: VerificationConfirmOtpRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    verification = (
        await db.execute(
            select(UserVerification).where(UserVerification.id == body.verification_id)
        )
    ).scalar_one_or_none()
    if not verification or verification.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Verification not found")
    if verification.type != "email":
        raise HTTPException(status_code=400, detail="Not an email verification")
    if verification.status != "pending":
        raise HTTPException(status_code=400, detail=f"Verification is {verification.status}")
    if verification.expires_at and verification.expires_at < datetime.now(UTC):
        verification.status = "expired"
        await db.commit()
        raise HTTPException(status_code=410, detail="Code has expired")

    expected_hash = (verification.evidence or {}).get("otp_hash")
    if not expected_hash or _hash_otp(body.otp) != expected_hash:
        raise HTTPException(status_code=400, detail="Invalid code")

    verification.status = "verified"
    verification.verified_at = datetime.now(UTC)

    # Mark the UserEmail as verified
    if verification.target_email_id:
        await db.execute(
            update(UserEmail)
            .where(UserEmail.id == verification.target_email_id)
            .values(verified=True, verified_at=verification.verified_at)
        )

    await db.commit()
    await db.refresh(verification)
    return verification


# ── Location verification (GPS) ───────────────────────────────────────

@router.post("/location", response_model=UserVerificationRead)
async def declare_location(
    body: VerificationLocationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Declare the user's current GPS position from the mobile. No separate
    confirm step — the position itself is the evidence. Trust level is
    derived from accuracy_m.
    """
    captured_at = body.captured_at or datetime.now(UTC)

    # Trust heuristic: GPS within 50m = high, 50-500m = medium, >500m = low
    if body.accuracy_m is None:
        trust = "unknown"
    elif body.accuracy_m <= 50:
        trust = "high"
    elif body.accuracy_m <= 500:
        trust = "medium"
    else:
        trust = "low"

    verification = UserVerification(
        user_id=current_user.id,
        type="location",
        method=body.source,  # gps | network | fused
        status="verified",  # GPS is self-attested, no challenge
        evidence={
            "latitude": body.latitude,
            "longitude": body.longitude,
            "accuracy_m": body.accuracy_m,
            "altitude_m": body.altitude_m,
            "captured_at": captured_at.isoformat(),
            "trust": trust,
        },
        verified_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(days=LOCATION_VERIFICATION_TTL_DAYS),
    )
    db.add(verification)
    await db.commit()
    await db.refresh(verification)
    return verification


# ── ID document verification (manual operator review) ────────────────

@router.post("/id-document", response_model=UserVerificationRead)
async def submit_id_document(
    body: VerificationIdDocumentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit ID document photos for review. Enters the operator compliance
    queue — status stays 'pending' until a reviewer with
    `core.settings.manage` approves or rejects via the admin endpoints.
    """
    verification = UserVerification(
        user_id=current_user.id,
        type="id_document",
        method="operator_review",
        status="pending",
        evidence={
            "id_document_type": body.id_document_type,
            "front_attachment_id": str(body.front_attachment_id),
            "back_attachment_id": str(body.back_attachment_id) if body.back_attachment_id else None,
            "selfie_attachment_id": str(body.selfie_attachment_id),
            "document_number": body.document_number,
            "issuing_country": body.issuing_country,
        },
    )
    db.add(verification)
    await db.commit()
    await db.refresh(verification)
    return verification


# ── Operator review (approve/reject ID) ───────────────────────────────

@router.post(
    "/{verification_id}/approve",
    response_model=UserVerificationRead,
    dependencies=[require_permission("core.settings.manage")],
)
async def operator_approve(
    verification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    verification = (
        await db.execute(
            select(UserVerification).where(UserVerification.id == verification_id)
        )
    ).scalar_one_or_none()
    if not verification:
        raise HTTPException(status_code=404, detail="Verification not found")
    if verification.status != "pending":
        raise HTTPException(status_code=400, detail=f"Verification is {verification.status}")

    verification.status = "verified"
    verification.verified_at = datetime.now(UTC)
    verification.verified_by_user_id = current_user.id

    # For id_document, also update User.identity_verified_*
    if verification.type == "id_document":
        await db.execute(
            update(User)
            .where(User.id == verification.user_id)
            .values(
                identity_verified=True,
                identity_verified_by=current_user.id,
                identity_verified_at=verification.verified_at,
            )
        )

    await db.commit()
    await db.refresh(verification)
    return verification


@router.post(
    "/{verification_id}/reject",
    response_model=UserVerificationRead,
    dependencies=[require_permission("core.settings.manage")],
)
async def operator_reject(
    verification_id: UUID,
    reason: str = Query(..., min_length=3, max_length=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    verification = (
        await db.execute(
            select(UserVerification).where(UserVerification.id == verification_id)
        )
    ).scalar_one_or_none()
    if not verification:
        raise HTTPException(status_code=404, detail="Verification not found")
    if verification.status != "pending":
        raise HTTPException(status_code=400, detail=f"Verification is {verification.status}")

    verification.status = "rejected"
    verification.rejection_reason = reason
    verification.verified_by_user_id = current_user.id

    await db.commit()
    await db.refresh(verification)
    return verification


# ── Admin queue ───────────────────────────────────────────────────────

@router.get(
    "/admin/queue",
    response_model=list[UserVerificationRead],
    dependencies=[require_permission("core.settings.manage")],
)
async def admin_pending_queue(
    type: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List verifications awaiting operator action (default: id_document)."""
    query = (
        select(UserVerification)
        .where(UserVerification.status == "pending")
        .where(UserVerification.method == "operator_review")
        .order_by(UserVerification.created_at.asc())
        .limit(limit)
    )
    if type:
        query = query.where(UserVerification.type == type)
    return (await db.execute(query)).scalars().all()
