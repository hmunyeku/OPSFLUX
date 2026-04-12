"""MFA routes — TOTP setup, verification, backup codes, disable."""

import secrets
from hashlib import sha256

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.audit import record_audit
from app.core.database import get_db
from app.core.security import verify_password
from app.models.common import User

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

    if not current_user.hashed_password or not verify_password(body.password, current_user.hashed_password):
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

    if not current_user.hashed_password or not verify_password(body.password, current_user.hashed_password):
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
