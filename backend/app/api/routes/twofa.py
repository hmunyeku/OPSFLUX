"""
Routes API pour la gestion 2FA (Two-Factor Authentication).
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.core.twofa_service import TwoFactorService
from app.models_2fa import (
    SMSVerificationRequest,
    TwoFactorBackupCodes,
    TwoFactorConfigPublic,
    TwoFactorEnable,
    TwoFactorEnableResponse,
    TwoFactorSetup,
    TwoFactorVerify,
    TwoFactorVerifyWithMethod,
)

router = APIRouter()


@router.get("/config", response_model=TwoFactorConfigPublic)
def get_2fa_config(
    *,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Récupérer la configuration 2FA de l'utilisateur connecté.
    """
    config = TwoFactorService.get_config(session=session, user=current_user)

    if not config:
        # Pas encore de config, retourner valeurs par défaut
        return TwoFactorConfigPublic(
            id="00000000-0000-0000-0000-000000000000",  # type: ignore
            user_id=current_user.id,
            is_enabled=False,
            primary_method="totp",
            totp_verified_at=None,
            phone_number=None,
            phone_verified_at=None,
            backup_codes_count=0,
            last_used_at=None,
        )

    # Masquer le numéro de téléphone
    phone_masked = None
    if config.phone_number:
        phone_masked = TwoFactorService.mask_phone_number(config.phone_number)

    backup_codes_count = len(config.backup_codes) if config.backup_codes else 0

    return TwoFactorConfigPublic(
        id=config.id,
        user_id=config.user_id,
        is_enabled=config.is_enabled,
        primary_method=config.primary_method,
        totp_verified_at=config.totp_verified_at,
        phone_number=phone_masked,
        phone_verified_at=config.phone_verified_at,
        backup_codes_count=backup_codes_count,
        last_used_at=config.last_used_at,
    )


@router.post("/setup-totp", response_model=TwoFactorSetup)
def setup_totp(
    *,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Préparer la configuration TOTP.
    Génère secret, URI et QR code.
    """
    try:
        setup_data = TwoFactorService.setup_totp(session=session, user=current_user)
        return setup_data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/enable", response_model=TwoFactorEnableResponse)
def enable_2fa(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    request: TwoFactorEnable,
) -> Any:
    """
    Activer 2FA après vérification du code.
    Retourne la config + les backup codes (affichés une seule fois).
    """
    try:
        if request.method == "totp":
            config = TwoFactorService.enable_totp(
                session=session,
                user=current_user,
                verification_code=request.verification_code,
            )
        elif request.method == "sms":
            # TODO: Implémenter activation SMS
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="SMS 2FA pas encore implémenté",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Méthode 2FA invalide",
            )

        # Retourner config publique + backup codes
        phone_masked = None
        if config.phone_number:
            phone_masked = TwoFactorService.mask_phone_number(config.phone_number)

        backup_codes_count = len(config.backup_codes) if config.backup_codes else 0

        config_public = TwoFactorConfigPublic(
            id=config.id,
            user_id=config.user_id,
            is_enabled=config.is_enabled,
            primary_method=config.primary_method,
            totp_verified_at=config.totp_verified_at,
            phone_number=phone_masked,
            phone_verified_at=config.phone_verified_at,
            backup_codes_count=backup_codes_count,
            last_used_at=config.last_used_at,
        )

        backup_codes = TwoFactorBackupCodes(
            codes=config.backup_codes or [],
            generated_at=config.backup_codes_generated_at or config.updated_at,  # type: ignore
        )

        return TwoFactorEnableResponse(
            config=config_public,
            backup_codes=backup_codes,
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/disable")
def disable_2fa(
    *,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Désactiver 2FA.
    """
    TwoFactorService.disable_2fa(session=session, user=current_user)
    return {"message": "2FA désactivé avec succès"}


@router.post("/verify", response_model=dict)
def verify_2fa_code(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    request: TwoFactorVerifyWithMethod,
) -> Any:
    """
    Vérifier un code 2FA (TOTP, SMS ou backup).
    """
    config = TwoFactorService.get_config(session=session, user=current_user)

    if not config or not config.is_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA pas activé",
        )

    is_valid = False

    if request.method == "totp" and config.totp_secret:
        is_valid = TwoFactorService.verify_totp_code(
            config.totp_secret, request.code
        )
    elif request.method == "sms":
        is_valid = TwoFactorService.verify_sms_code(
            session=session, user=current_user, code=request.code
        )
    elif request.method == "backup":
        is_valid = TwoFactorService.verify_backup_code(
            session=session, user=current_user, code=request.code
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Méthode 2FA invalide",
        )

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Code 2FA invalide",
        )

    return {"message": "Code 2FA valide", "verified": True}


@router.post("/regenerate-backup-codes", response_model=TwoFactorBackupCodes)
def regenerate_backup_codes(
    *,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Régénérer les codes backup (invalide les anciens).
    """
    try:
        backup_codes = TwoFactorService.regenerate_backup_codes(
            session=session, user=current_user
        )
        return backup_codes
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/send-sms")
def send_sms_code(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    request: SMSVerificationRequest,
) -> Any:
    """
    Envoyer un code SMS pour vérification.
    """
    try:
        TwoFactorService.send_sms_code(
            session=session,
            user=current_user,
            phone_number=request.phone_number,
            purpose=request.purpose,
        )
        return {"message": "Code SMS envoyé"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e),
        )


@router.post("/verify-sms")
def verify_sms_code(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    request: TwoFactorVerify,
) -> Any:
    """
    Vérifier un code SMS.
    """
    is_valid = TwoFactorService.verify_sms_code(
        session=session, user=current_user, code=request.code
    )

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Code SMS invalide ou expiré",
        )

    return {"message": "Code SMS valide", "verified": True}
