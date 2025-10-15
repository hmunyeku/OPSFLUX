import uuid
from typing import Optional

from pydantic import BaseModel, EmailStr
from sqlalchemy import Column, JSON
from sqlmodel import Field, Relationship, SQLModel

from app.core.models import AbstractBaseModel


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    initials: str | None = Field(default=None, max_length=10)
    recovery_email: EmailStr | None = Field(default=None, max_length=255)
    avatar_url: str | None = Field(default=None)
    intranet_identifier: str | None = Field(default=None, max_length=255)


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=40)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=40)
    full_name: str | None = Field(default=None, max_length=255)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)


# Properties to receive via API on update, all are optional
class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore
    password: str | None = Field(default=None, min_length=8, max_length=40)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    initials: str | None = Field(default=None, max_length=10)
    email: EmailStr | None = Field(default=None, max_length=255)
    recovery_email: EmailStr | None = Field(default=None, max_length=255)
    avatar_url: str | None = Field(default=None)
    phone_numbers: list[str] | None = Field(default=None)
    intranet_identifier: str | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=40)
    new_password: str = Field(min_length=8, max_length=40)


# Database model, database table inferred from class name
class User(AbstractBaseModel, UserBase, table=True):
    """
    Modèle User avec audit trail complet et soft delete.
    Hérite de AbstractBaseModel pour les fonctionnalités communes.

    password_history: Historique des 5 derniers mots de passe hashés
    phone_numbers: Liste des numéros de téléphone de l'utilisateur
    """
    hashed_password: str
    password_history: Optional[list[str]] = Field(default=None, sa_column=Column(JSON, nullable=True))
    phone_numbers: Optional[list[str]] = Field(default=None, sa_column=Column(JSON, nullable=True))
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    phone_numbers: list[str] | None = None
    intranet_identifier: str | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# Shared properties
class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    pass


# Properties to receive on item update
class ItemUpdate(ItemBase):
    title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore


# Database model, database table inferred from class name
class Item(AbstractBaseModel, ItemBase, table=True):
    """
    Modèle Item avec audit trail complet et soft delete.
    Hérite de AbstractBaseModel pour les fonctionnalités communes.
    """
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="items")


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Response when 2FA is required during login
class Token2FARequired(SQLModel):
    requires_2fa: bool = True
    temp_token: str
    available_methods: list[str]  # ["totp", "sms", "backup"]
    masked_phone: str | None = None


# Request to verify 2FA code during login
class TwoFactorLoginRequest(SQLModel):
    temp_token: str
    code: str
    method: str  # "totp", "sms", or "backup"


# Contents of JWT token (not a database model, just Pydantic for validation)
class TokenPayload(BaseModel):
    sub: str | None = None
    exp: int | None = None  # Expiration timestamp
    type: str | None = None  # "access" or "refresh" or "2fa_temp"
    sid: str | None = None  # session_id (optionnel)


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=40)


# App Settings Models
class AppSettingsBase(SQLModel):
    """Base model for application settings"""
    # Application générale
    app_name: str = Field(default="OpsFlux", max_length=255)
    app_logo: str | None = Field(default=None, max_length=500)
    default_theme: str = Field(default="amethyst-haze", max_length=100)
    default_language: str = Field(default="fr", max_length=10)
    font: str = Field(default="inter", max_length=100)
    company_name: str | None = Field(default=None, max_length=255)
    company_logo: str | None = Field(default=None, max_length=500)
    company_tax_id: str | None = Field(default=None, max_length=100)
    company_address: str | None = Field(default=None, max_length=500)

    # Paramètres UI
    auto_save_delay_seconds: int = Field(default=3, description="Délai en secondes avant auto-save (affichage tag Modifié)")

    # Paramètres de sécurité 2FA
    twofa_max_attempts: int = Field(default=5, description="Nombre maximum de tentatives 2FA avant blocage")
    twofa_sms_timeout_minutes: int = Field(default=10, description="Durée de validité du code SMS en minutes")
    twofa_sms_rate_limit: int = Field(default=5, description="Nombre maximum de SMS par heure")

    # Configuration SMS Provider (twilio, bulksms, ovh, messagebird, vonage)
    sms_provider: str = Field(default="twilio", max_length=50, description="Fournisseur SMS")
    sms_provider_account_sid: str | None = Field(default=None, max_length=255, description="Account SID / API Key")
    sms_provider_auth_token: str | None = Field(default=None, max_length=255, description="Auth Token / API Secret")
    sms_provider_phone_number: str | None = Field(default=None, max_length=50, description="Numéro de téléphone émetteur")

    # Configuration Email
    email_host: str | None = Field(default=None, max_length=255, description="Serveur SMTP")
    email_port: int | None = Field(default=None, description="Port SMTP")
    email_username: str | None = Field(default=None, max_length=255, description="Nom d'utilisateur SMTP")
    email_password: str | None = Field(default=None, max_length=255, description="Mot de passe SMTP")
    email_from: str | None = Field(default=None, max_length=255, description="Email expéditeur")
    email_from_name: str | None = Field(default=None, max_length=255, description="Nom de l'expéditeur")
    email_use_tls: bool = Field(default=True, description="Utiliser TLS")
    email_use_ssl: bool = Field(default=False, description="Utiliser SSL")

    # Configuration Intranet
    intranet_url: str | None = Field(default=None, max_length=500, description="URL de l'intranet avec placeholder {user_id}")


class AppSettingsUpdate(SQLModel):
    """Model for updating application settings"""
    # Application générale
    app_name: str | None = Field(default=None, max_length=255)
    app_logo: str | None = Field(default=None, max_length=500)
    default_theme: str | None = Field(default=None, max_length=100)
    default_language: str | None = Field(default=None, max_length=10)
    font: str | None = Field(default=None, max_length=100)
    company_name: str | None = Field(default=None, max_length=255)
    company_logo: str | None = Field(default=None, max_length=500)
    company_tax_id: str | None = Field(default=None, max_length=100)
    company_address: str | None = Field(default=None, max_length=500)

    # Paramètres UI
    auto_save_delay_seconds: int | None = Field(default=None, description="Délai en secondes avant auto-save")

    # Paramètres de sécurité 2FA
    twofa_max_attempts: int | None = Field(default=None, description="Nombre maximum de tentatives 2FA avant blocage")
    twofa_sms_timeout_minutes: int | None = Field(default=None, description="Durée de validité du code SMS en minutes")
    twofa_sms_rate_limit: int | None = Field(default=None, description="Nombre maximum de SMS par heure")

    # Configuration SMS Provider
    sms_provider: str | None = Field(default=None, max_length=50, description="Fournisseur SMS")
    sms_provider_account_sid: str | None = Field(default=None, max_length=255, description="Account SID / API Key")
    sms_provider_auth_token: str | None = Field(default=None, max_length=255, description="Auth Token / API Secret")
    sms_provider_phone_number: str | None = Field(default=None, max_length=50, description="Numéro de téléphone émetteur")

    # Configuration Email
    email_host: str | None = Field(default=None, max_length=255, description="Serveur SMTP")
    email_port: int | None = Field(default=None, description="Port SMTP")
    email_username: str | None = Field(default=None, max_length=255, description="Nom d'utilisateur SMTP")
    email_password: str | None = Field(default=None, max_length=255, description="Mot de passe SMTP")
    email_from: str | None = Field(default=None, max_length=255, description="Email expéditeur")
    email_from_name: str | None = Field(default=None, max_length=255, description="Nom de l'expéditeur")
    email_use_tls: bool | None = Field(default=None, description="Utiliser TLS")
    email_use_ssl: bool | None = Field(default=None, description="Utiliser SSL")

    # Configuration Intranet
    intranet_url: str | None = Field(default=None, max_length=500, description="URL de l'intranet avec placeholder {user_id}")


class AppSettings(AbstractBaseModel, AppSettingsBase, table=True):
    """
    Database model for application settings.
    There should only be one record in this table.
    """
    __tablename__ = "app_settings"


class AppSettingsPublic(AppSettingsBase):
    """Public model for application settings"""
    id: uuid.UUID
