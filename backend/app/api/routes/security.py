"""
Routes API pour la sécurité et les politiques de mot de passe.
"""

from typing import Any

from fastapi import APIRouter

from app.core.password_service import PasswordService
from app.models_auth import PasswordPolicy

router = APIRouter(prefix="/security", tags=["security"])


@router.get("/password-policy", response_model=PasswordPolicy)
def get_password_policy() -> Any:
    """
    Récupère la politique de mot de passe configurée.

    Returns:
        PasswordPolicy: Configuration de la politique de mot de passe
    """
    return PasswordPolicy(
        min_length=PasswordService.MIN_LENGTH,
        require_uppercase=PasswordService.MIN_UPPERCASE > 0,
        require_lowercase=PasswordService.MIN_LOWERCASE > 0,
        require_digit=PasswordService.MIN_DIGITS > 0,
        require_special=PasswordService.MIN_SPECIAL > 0,
        special_chars=PasswordService.SPECIAL_CHARS,
    )
