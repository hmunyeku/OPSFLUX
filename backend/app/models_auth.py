"""
Modèles d'authentification et de sécurité.
Session management, refresh tokens, password policy.
"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import field_validator
from sqlmodel import Field, Relationship, SQLModel

from app.core.models import AbstractBaseModel


# ==================== SESSION MODELS ====================

class SessionBase(SQLModel):
    """Propriétés de base d'une session utilisateur."""
    user_agent: Optional[str] = Field(default=None, max_length=500, description="User agent du navigateur")
    ip_address: Optional[str] = Field(default=None, max_length=50, description="Adresse IP")
    device_type: Optional[str] = Field(default=None, max_length=50, description="Type d'appareil (web, mobile, etc.)")
    device_name: Optional[str] = Field(default=None, max_length=100, description="Nom de l'appareil")
    location: Optional[str] = Field(default=None, max_length=200, description="Localisation géographique")
    is_active: bool = Field(default=True, description="Session active ou révoquée")
    last_activity_at: datetime = Field(default_factory=datetime.utcnow, description="Dernière activité")
    expires_at: datetime = Field(description="Date d'expiration de la session")


class Session(AbstractBaseModel, SessionBase, table=True):
    """
    Modèle de session utilisateur.
    Track les sessions actives pour session management et révocation.
    """
    __tablename__ = "session"

    user_id: uuid.UUID = Field(
        foreign_key="user.id",
        nullable=False,
        ondelete="CASCADE",
        description="Utilisateur propriétaire de la session"
    )

    refresh_token: str = Field(
        max_length=500,
        unique=True,
        index=True,
        description="Refresh token unique pour cette session"
    )


class SessionPublic(SessionBase):
    """Propriétés de session retournées par l'API."""
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    last_activity_at: datetime
    expires_at: datetime
    is_active: bool


class SessionsPublic(SQLModel):
    """Liste de sessions."""
    data: list[SessionPublic]
    count: int


# ==================== TOKEN MODELS ====================

class TokenPair(SQLModel):
    """Paire de tokens (access + refresh)."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # Secondes avant expiration de l'access token


class RefreshTokenRequest(SQLModel):
    """Request body pour refresh token."""
    refresh_token: str


# ==================== PASSWORD POLICY MODELS ====================

class PasswordPolicy(SQLModel):
    """Politique de mot de passe."""
    min_length: int = Field(default=8, ge=6, le=128)
    require_uppercase: bool = Field(default=True)
    require_lowercase: bool = Field(default=True)
    require_digit: bool = Field(default=True)
    require_special: bool = Field(default=False)
    special_chars: str = Field(default="!@#$%^&*()_+-=[]{}|;:,.<>?")


class PasswordValidation(SQLModel):
    """Résultat de validation d'un mot de passe."""
    is_valid: bool
    errors: list[str] = []


class PasswordStrength(SQLModel):
    """Force d'un mot de passe."""
    score: int = Field(ge=0, le=4, description="Score de 0 (faible) à 4 (très fort)")
    label: str = Field(description="Libellé: weak, fair, good, strong, very_strong")
    suggestions: list[str] = []


class ValidatedPassword(SQLModel):
    """Mot de passe avec validation."""
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Valide la force du mot de passe."""
        errors = []

        if len(v) < 8:
            errors.append("Le mot de passe doit contenir au moins 8 caractères")

        if not any(c.isupper() for c in v):
            errors.append("Le mot de passe doit contenir au moins une majuscule")

        if not any(c.islower() for c in v):
            errors.append("Le mot de passe doit contenir au moins une minuscule")

        if not any(c.isdigit() for c in v):
            errors.append("Le mot de passe doit contenir au moins un chiffre")

        # Mots de passe communs interdits
        common_passwords = ["password", "123456", "12345678", "qwerty", "admin", "letmein"]
        if v.lower() in common_passwords:
            errors.append("Ce mot de passe est trop commun")

        if errors:
            raise ValueError("; ".join(errors))

        return v


# ==================== LOGIN ATTEMPT TRACKING ====================

class LoginAttempt(AbstractBaseModel, table=True):
    """
    Historique des tentatives de connexion.
    Utilisé pour rate limiting et détection d'attaques.
    """
    __tablename__ = "login_attempt"

    email: str = Field(max_length=255, index=True, description="Email utilisé pour la tentative")
    ip_address: str = Field(max_length=50, index=True, description="Adresse IP")
    user_agent: Optional[str] = Field(default=None, max_length=500)
    success: bool = Field(description="Tentative réussie ou non")
    failure_reason: Optional[str] = Field(default=None, max_length=200, description="Raison de l'échec")


class LoginAttemptPublic(SQLModel):
    """Tentative de login publique."""
    id: uuid.UUID
    email: str
    ip_address: str
    success: bool
    failure_reason: Optional[str]
    created_at: datetime
