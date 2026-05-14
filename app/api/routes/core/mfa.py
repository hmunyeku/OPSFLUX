"""MFA routes — TOTP setup, verification, backup codes, disable."""

import secrets
from datetime import datetime, UTC
from hashlib import sha256
from uuid import UUID

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.audit import record_audit
from app.core.database import get_db
from app.core.security import verify_password
from app.models.common import MFATrustedDevice, User

router = APIRouter(prefix="/api/v1/mfa", tags=["mfa"])

# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class MFACodeRequest(BaseModel):
    code: str


class MFAPasswordRequest(BaseModel):
    password: str


class MFASetupResponse(BaseModel):
    secret: str
    provisioning_uri: str


class MFAVerifySetupResponse(BaseModel):
    backup_codes: list[str]


class MFAVerifyResponse(BaseModel):
    verified: bool


class MFARegenerateResponse(BaseModel):
    backup_codes: list[str]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_backup_codes(count: int = 10) -> tuple[list[str], list[str]]:
    """Generate plain-text backup codes and their SHA-256 hashes.

    Returns (plain_codes, hashed_codes).
    """
    plain_codes: list[str] = []
    hashed_codes: list[str] = []
    for _ in range(count):
        code = secrets.token_hex(4)  # 8-char hex string
        plain_codes.append(code)
        hashed_codes.append(sha256(code.encode()).hexdigest())
    return plain_codes, hashed_codes


def _verify_backup_code(code: str, hashed_codes: list[str]) -> int | None:
    """Check if *code* matches any hashed backup code.

    Returns the index of the matched code, or None.
    """
    code_hash = sha256(code.encode()).hexdigest()
    for idx, stored_hash in enumerate(hashed_codes):
        if secrets.compare_digest(code_hash, stored_hash):
            return idx
    return None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


class MFAStatusResponse(BaseModel):
    mfa_enabled: bool
    has_totp: bool


@router.get("/status", response_model=MFAStatusResponse)
async def mfa_status(
    current_user: User = Depends(get_current_user),
):
    """Retourne l'état MFA de l'utilisateur courant."""
    return MFAStatusResponse(
        mfa_enabled=current_user.mfa_enabled,
        has_totp=current_user.totp_secret is not None,
    )


@router.post("/setup", response_model=MFASetupResponse)
async def mfa_setup(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Génère un secret TOTP et retourne l'URI de provisionnement.

    Le MFA n'est pas encore activé — l'utilisateur doit d'abord vérifier
    un code via /verify-setup.
    """
    if current_user.mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'authentification à deux facteurs est déjà activée.",
        )

    secret = pyotp.random_base32()

    # Store the secret temporarily — MFA is not enabled until verify-setup
    current_user.totp_secret = secret
    await db.commit()

    provisioning_uri = pyotp.TOTP(secret).provisioning_uri(
        name=current_user.email,
        issuer_name="OpsFlux",
    )

    await record_audit(
        db,
        action="setup_mfa",
        resource_type="user",
        resource_id=str(current_user.id),
        user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return MFASetupResponse(secret=secret, provisioning_uri=provisioning_uri)


@router.post("/verify-setup", response_model=MFAVerifySetupResponse)
async def mfa_verify_setup(
    body: MFACodeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Vérifie le code TOTP et active le MFA si le code est correct.

    Génère 10 codes de secours affichés une seule fois.
    """
    if current_user.mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'authentification à deux facteurs est déjà activée.",
        )

    if not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun secret TOTP trouvé. Veuillez d'abord appeler /setup.",
        )

    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Code TOTP invalide. Veuillez réessayer.",
        )

    # Generate backup codes
    plain_codes, hashed_codes = _generate_backup_codes(10)

    current_user.mfa_enabled = True
    current_user.mfa_backup_codes = hashed_codes
    await db.commit()

    await record_audit(
        db,
        action="enable_mfa",
        resource_type="user",
        resource_id=str(current_user.id),
        user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return MFAVerifySetupResponse(backup_codes=plain_codes)


@router.post("/verify", response_model=MFAVerifyResponse)
async def mfa_verify(
    body: MFACodeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Vérifie un code TOTP ou un code de secours pendant le flux de connexion."""
    if not current_user.mfa_enabled or not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'authentification à deux facteurs n'est pas activée.",
        )

    # Try TOTP first
    totp = pyotp.TOTP(current_user.totp_secret)
    if totp.verify(body.code, valid_window=1):
        await record_audit(
            db,
            action="verify_mfa_totp",
            resource_type="user",
            resource_id=str(current_user.id),
            user_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        await db.commit()
        return MFAVerifyResponse(verified=True)

    # Try backup codes
    stored_codes: list[str] = current_user.mfa_backup_codes or []
    matched_idx = _verify_backup_code(body.code, stored_codes)

    if matched_idx is not None:
        # Remove the used backup code (one-time use)
        updated_codes = stored_codes.copy()
        updated_codes.pop(matched_idx)
        current_user.mfa_backup_codes = updated_codes
        await db.commit()

        await record_audit(
            db,
            action="verify_mfa_backup_code",
            resource_type="user",
            resource_id=str(current_user.id),
            user_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            details={"remaining_backup_codes": len(updated_codes)},
        )
        await db.commit()

        return MFAVerifyResponse(verified=True)

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Code invalide. Veuillez réessayer.",
    )


@router.post("/disable")
async def mfa_disable(
    body: MFAPasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Désactive le MFA après vérification du mot de passe."""
    if not current_user.mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'authentification à deux facteurs n'est pas activée.",
        )

    if not current_user.hashed_password or not verify_password(
        body.password, current_user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Mot de passe incorrect.",
        )

    current_user.mfa_enabled = False
    current_user.totp_secret = None
    current_user.mfa_backup_codes = None
    await db.commit()

    await record_audit(
        db,
        action="disable_mfa",
        resource_type="user",
        resource_id=str(current_user.id),
        user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {"detail": "Authentification à deux facteurs désactivée."}


class MFATrustedDeviceRead(BaseModel):
    """Vue d'un appareil de confiance MFA pour l'UI Settings > Security."""
    id: UUID
    created_at: datetime
    expires_at: datetime
    last_used_at: datetime | None = None
    ip_address: str | None = None
    browser: str | None = None
    os: str | None = None
    label: str | None = None
    is_current: bool = False  # device utilise pour la session courante


@router.get("/trusted-devices", response_model=list[MFATrustedDeviceRead])
async def list_trusted_devices(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Liste les appareils de confiance MFA du user (non révoqués, non expirés)."""
    now = datetime.now(UTC)
    result = await db.execute(
        select(MFATrustedDevice)
        .where(
            MFATrustedDevice.user_id == current_user.id,
            MFATrustedDevice.revoked == False,  # noqa: E712
            MFATrustedDevice.expires_at > now,
        )
        .order_by(MFATrustedDevice.last_used_at.desc().nullslast(), MFATrustedDevice.created_at.desc())
    )
    devices = result.scalars().all()

    # Detecte le device courant via le cookie (sans le déclasser/exposer)
    current_hash = None
    cookie = request.cookies.get("opsflux_mfa_trust")
    if cookie:
        current_hash = sha256(cookie.encode()).hexdigest()

    items: list[MFATrustedDeviceRead] = []
    for d in devices:
        items.append(MFATrustedDeviceRead(
            id=d.id,
            created_at=d.created_at,
            expires_at=d.expires_at,
            last_used_at=d.last_used_at,
            ip_address=d.ip_address,
            browser=d.browser,
            os=d.os,
            label=d.label,
            is_current=(current_hash is not None and d.token_hash == current_hash),
        ))
    return items


@router.post("/trusted-devices/{device_id}/revoke")
async def revoke_trusted_device(
    device_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke un appareil de confiance MFA spécifique du user courant."""
    result = await db.execute(
        select(MFATrustedDevice).where(
            MFATrustedDevice.id == device_id,
            MFATrustedDevice.user_id == current_user.id,
        )
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appareil non trouvé.",
        )

    if device.revoked:
        return {"detail": "Déjà révoqué."}

    device.revoked = True
    device.revoked_at = datetime.now(UTC)

    await record_audit(
        db,
        action="mfa_trust_device_revoked",
        resource_type="user",
        resource_id=str(current_user.id),
        user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        details={"device_id": str(device_id)},
    )
    await db.commit()

    return {"detail": "Appareil révoqué."}


@router.post("/trusted-devices/revoke-all")
async def revoke_all_trusted_devices(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke tous les appareils de confiance MFA du user courant."""
    from sqlalchemy import update
    now = datetime.now(UTC)
    result = await db.execute(
        update(MFATrustedDevice)
        .where(
            MFATrustedDevice.user_id == current_user.id,
            MFATrustedDevice.revoked == False,  # noqa: E712
        )
        .values(revoked=True, revoked_at=now)
        .returning(MFATrustedDevice.id)
    )
    revoked_count = len(result.all())

    await record_audit(
        db,
        action="mfa_trust_devices_revoked_all",
        resource_type="user",
        resource_id=str(current_user.id),
        user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        details={"count": revoked_count},
    )
    await db.commit()

    return {"detail": f"{revoked_count} appareil(s) révoqué(s).", "count": revoked_count}


@router.post("/regenerate-codes", response_model=MFARegenerateResponse)
async def mfa_regenerate_codes(
    body: MFAPasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Régénère les codes de secours après vérification du mot de passe."""
    if not current_user.mfa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'authentification à deux facteurs n'est pas activée.",
        )

    if not current_user.hashed_password or not verify_password(
        body.password, current_user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Mot de passe incorrect.",
        )

    plain_codes, hashed_codes = _generate_backup_codes(10)
    current_user.mfa_backup_codes = hashed_codes
    await db.commit()

    await record_audit(
        db,
        action="regenerate_mfa_backup_codes",
        resource_type="user",
        resource_id=str(current_user.id),
        user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return MFARegenerateResponse(backup_codes=plain_codes)
