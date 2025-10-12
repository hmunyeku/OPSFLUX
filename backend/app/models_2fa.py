"""
Modèles pour l'authentification à deux facteurs (2FA).
Support TOTP (Google Authenticator) et SMS comme backup.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel

from app.core.models import AbstractBaseModel


# ==================== 2FA CONFIGURATION MODELS ====================

class TwoFactorMethod(str):
    """Méthodes 2FA disponibles."""
    TOTP = "totp"  # Google Authenticator, Authy, etc.
    SMS = "sms"    # SMS backup
    EMAIL = "email"  # Email backup (optionnel)


class TwoFactorConfig(AbstractBaseModel, table=True):
    """
    Configuration 2FA par utilisateur.
    Chaque user peut activer/désactiver 2FA et choisir sa méthode préférée.
    """
    __tablename__ = "two_factor_config"

    user_id: uuid.UUID = Field(
        foreign_key="user.id",
        nullable=False,
        unique=True,
        ondelete="CASCADE",
        description="Utilisateur propriétaire"
    )

    # 2FA activé ou non
    is_enabled: bool = Field(default=False, description="2FA activé")

    # Méthode principale (totp ou sms)
    primary_method: str = Field(default="totp", max_length=20, description="Méthode principale: totp ou sms")

    # TOTP secret (base32 encoded)
    totp_secret: Optional[str] = Field(default=None, max_length=255, description="Secret TOTP (base32)")
    totp_verified_at: Optional[datetime] = Field(default=None, description="Date vérification TOTP")

    # Backup codes (liste de 10 codes à usage unique)
    backup_codes: Optional[list[str]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
        description="10 codes backup à usage unique"
    )
    backup_codes_generated_at: Optional[datetime] = Field(
        default=None,
        description="Date génération codes backup"
    )

    # SMS backup
    phone_number: Optional[str] = Field(default=None, max_length=50, description="Numéro téléphone pour SMS")
    phone_verified_at: Optional[datetime] = Field(default=None, description="Date vérification téléphone")

    # Statistiques
    last_used_at: Optional[datetime] = Field(default=None, description="Dernière utilisation 2FA")
    failed_attempts: int = Field(default=0, description="Tentatives échouées")


class TwoFactorConfigPublic(SQLModel):
    """Configuration 2FA publique (sans secrets)."""
    id: uuid.UUID
    user_id: uuid.UUID
    is_enabled: bool
    primary_method: str
    totp_verified_at: Optional[datetime]
    phone_number: Optional[str]  # Masqué : +33 6 ** ** ** 12
    phone_verified_at: Optional[datetime]
    backup_codes_count: int = 0  # Nombre de codes backup restants
    last_used_at: Optional[datetime]


class TwoFactorSetup(SQLModel):
    """Données pour setup initial TOTP."""
    totp_secret: str
    totp_uri: str  # otpauth://totp/...
    qr_code_data_url: str  # Base64 data URL du QR code


class TwoFactorVerify(SQLModel):
    """Vérification code 2FA."""
    code: str = Field(min_length=6, max_length=6, description="Code 2FA (6 chiffres)")


class TwoFactorVerifyWithMethod(SQLModel):
    """Vérification code 2FA avec choix de méthode."""
    code: str = Field(min_length=6, max_length=8, description="Code 2FA ou backup")
    method: str = Field(default="totp", max_length=20, description="Méthode: totp, sms ou backup")


class TwoFactorEnable(SQLModel):
    """Activation 2FA."""
    method: str = Field(default="totp", max_length=20, description="Méthode principale: totp ou sms")
    phone_number: Optional[str] = Field(default=None, max_length=50, description="Numéro téléphone si méthode SMS")
    verification_code: str = Field(min_length=6, max_length=6, description="Code vérification")


class TwoFactorBackupCodes(SQLModel):
    """Codes backup pour 2FA."""
    codes: list[str]
    generated_at: datetime


class SMSVerification(AbstractBaseModel, table=True):
    """
    Codes SMS envoyés pour vérification.
    Rate limiting intégré.
    """
    __tablename__ = "sms_verification"

    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, ondelete="CASCADE")
    phone_number: str = Field(max_length=50, index=True)
    code: str = Field(max_length=10, description="Code SMS envoyé")
    purpose: str = Field(max_length=50, description="login, verify_phone, password_reset")

    is_used: bool = Field(default=False, description="Code déjà utilisé")
    used_at: Optional[datetime] = Field(default=None)

    expires_at: datetime = Field(description="Expiration (10 min)")
    ip_address: Optional[str] = Field(default=None, max_length=50)


class SMSVerificationRequest(SQLModel):
    """Demande d'envoi SMS."""
    phone_number: str = Field(max_length=50)
    purpose: str = Field(default="verify_phone", max_length=50)
