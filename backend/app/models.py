import uuid
from typing import Optional, TYPE_CHECKING

from pydantic import BaseModel, EmailStr
from sqlalchemy import Column, JSON
from sqlmodel import Field, Relationship, SQLModel

from app.core.models import AbstractBaseModel

if TYPE_CHECKING:
    from app.models_rbac import Role, Group, UserRoleLink, UserGroupLink
    from app.models_api_keys import UserApiKey


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
    # Nouveaux champs demandés
    civility: str | None = Field(default=None, max_length=10, description="M., Mme, Dr., etc.")
    birth_date: str | None = Field(default=None, description="Date de naissance (ISO format)")
    extension: str | None = Field(default=None, max_length=20, description="Extension téléphonique")
    signature: str | None = Field(default=None, max_length=500, description="Signature de l'utilisateur")


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
    civility: str | None = Field(default=None, max_length=10)
    birth_date: str | None = Field(default=None)
    extension: str | None = Field(default=None, max_length=20)
    signature: str | None = Field(default=None, max_length=500)


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
    api_keys: list["ApiKey"] = Relationship(back_populates="user", cascade_delete=True)
    webhooks: list["Webhook"] = Relationship(back_populates="user", cascade_delete=True)
    tasks: list["Task"] = Relationship(back_populates="assigned_user")
    user_api_keys: list["UserApiKey"] = Relationship(back_populates="user", cascade_delete=True)

    # RBAC relationships are managed via RBAC routes, not directly here
    # to avoid circular import issues. The relationships are defined in models_rbac.


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    phone_numbers: list[str] | None = None
    intranet_identifier: str | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# RBAC assignment schemas
class UserRoleAssignment(SQLModel):
    """Schéma pour assigner des rôles à un utilisateur"""
    role_ids: list[uuid.UUID]


class UserGroupAssignment(SQLModel):
    """Schéma pour assigner des groupes à un utilisateur"""
    group_ids: list[uuid.UUID]


# User Invitation models
class UserInvitationBase(SQLModel):
    email: EmailStr = Field(max_length=255, index=True)
    role_id: uuid.UUID | None = Field(default=None, description="Rôle à assigner à l'utilisateur après acceptation")
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)


class UserInvitationCreate(UserInvitationBase):
    """Schéma pour créer une invitation"""
    pass


class UserInvitation(AbstractBaseModel, UserInvitationBase, table=True):
    """
    Modèle pour les invitations d'utilisateurs.
    Stocke les invitations en attente avec un token unique et une date d'expiration.
    """
    token: str = Field(unique=True, index=True, max_length=255, description="Token unique pour l'invitation")
    invited_by_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, description="Utilisateur qui a envoyé l'invitation")
    expires_at: str = Field(description="Date d'expiration de l'invitation (ISO format)")
    accepted_at: str | None = Field(default=None, description="Date d'acceptation de l'invitation (ISO format)")

    # Relationships
    invited_by: User | None = Relationship()


class UserInvitationPublic(UserInvitationBase):
    """Schéma public pour les invitations (sans le token complet)"""
    id: uuid.UUID
    invited_by_id: uuid.UUID
    expires_at: str
    accepted_at: str | None = None
    created_at: str
    is_active: bool


class UserInvitationsPublic(SQLModel):
    """Liste paginée d'invitations"""
    data: list[UserInvitationPublic]
    count: int


class AcceptInvitation(SQLModel):
    """Schéma pour accepter une invitation"""
    token: str = Field(description="Token d'invitation")
    password: str = Field(min_length=8, max_length=40, description="Mot de passe choisi par l'utilisateur")
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)


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

    # === Backup Configuration ===
    backup_storage_type: str = Field(default="local", max_length=50, description="Type de stockage: local, s3, ftp, sftp")
    backup_local_path: str | None = Field(default="/backups", max_length=500, description="Chemin local pour les backups")
    backup_s3_bucket: str | None = Field(default=None, max_length=255, description="Nom du bucket S3 pour backups")
    backup_s3_endpoint: str | None = Field(default=None, max_length=500, description="Endpoint S3 personnalisé (MinIO, etc.)")
    backup_s3_access_key: str | None = Field(default=None, max_length=255, description="Clé d'accès S3")
    backup_s3_secret_key: str | None = Field(default=None, max_length=255, description="Clé secrète S3")
    backup_s3_region: str | None = Field(default=None, max_length=100, description="Région S3")
    backup_ftp_host: str | None = Field(default=None, max_length=255, description="Hôte FTP/SFTP")
    backup_ftp_port: int | None = Field(default=21, description="Port FTP/SFTP")
    backup_ftp_username: str | None = Field(default=None, max_length=255, description="Utilisateur FTP/SFTP")
    backup_ftp_password: str | None = Field(default=None, max_length=255, description="Mot de passe FTP/SFTP")
    backup_ftp_path: str | None = Field(default="/backups", max_length=500, description="Chemin distant pour backups")
    backup_retention_days: int = Field(default=30, description="Nombre de jours de rétention des backups")
    backup_auto_cleanup: bool = Field(default=True, description="Nettoyage automatique des anciens backups")

    # === CORE Services Configuration ===

    # Cache (Redis)
    redis_host: str = Field(default="localhost", max_length=255, description="Redis host")
    redis_port: int = Field(default=6379, description="Redis port")
    redis_db: int = Field(default=0, description="Redis database number")
    redis_password: str | None = Field(default=None, max_length=255, description="Redis password")

    # Storage (S3/MinIO)
    storage_backend: str = Field(default="local", max_length=50, description="Storage backend: local, s3, minio")
    s3_endpoint: str | None = Field(default=None, max_length=500, description="S3/MinIO endpoint URL")
    s3_access_key: str | None = Field(default=None, max_length=255, description="S3/MinIO access key")
    s3_secret_key: str | None = Field(default=None, max_length=255, description="S3/MinIO secret key")
    s3_bucket: str | None = Field(default=None, max_length=255, description="S3/MinIO bucket name")
    s3_region: str = Field(default="us-east-1", max_length=100, description="S3 region")

    # Search (PostgreSQL/Elasticsearch/Typesense)
    search_backend: str = Field(default="postgresql", max_length=50, description="Search backend: postgresql, elasticsearch, typesense")
    search_language: str = Field(default="french", max_length=50, description="Search language for text analysis")
    elasticsearch_url: str | None = Field(default=None, max_length=500, description="Elasticsearch URL")
    typesense_api_key: str | None = Field(default=None, max_length=255, description="Typesense API key")
    typesense_host: str | None = Field(default=None, max_length=255, description="Typesense host")

    # Audit Logs
    audit_retention_days: int = Field(default=90, description="Nombre de jours de rétention des logs d'audit")
    audit_log_level: str = Field(default="INFO", max_length=50, description="Niveau de log: DEBUG, INFO, WARNING, ERROR")
    audit_enabled: bool = Field(default=True, description="Activer/désactiver les logs d'audit")

    # User Invitations
    invitation_expiry_days: int = Field(default=7, description="Nombre de jours de validité d'une invitation utilisateur")


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

    # === Backup Configuration ===
    backup_storage_type: str | None = Field(default=None, max_length=50, description="Type de stockage: local, s3, ftp, sftp")
    backup_local_path: str | None = Field(default=None, max_length=500, description="Chemin local pour les backups")
    backup_s3_bucket: str | None = Field(default=None, max_length=255, description="Nom du bucket S3 pour backups")
    backup_s3_endpoint: str | None = Field(default=None, max_length=500, description="Endpoint S3 personnalisé (MinIO, etc.)")
    backup_s3_access_key: str | None = Field(default=None, max_length=255, description="Clé d'accès S3")
    backup_s3_secret_key: str | None = Field(default=None, max_length=255, description="Clé secrète S3")
    backup_s3_region: str | None = Field(default=None, max_length=100, description="Région S3")
    backup_ftp_host: str | None = Field(default=None, max_length=255, description="Hôte FTP/SFTP")
    backup_ftp_port: int | None = Field(default=None, description="Port FTP/SFTP")
    backup_ftp_username: str | None = Field(default=None, max_length=255, description="Utilisateur FTP/SFTP")
    backup_ftp_password: str | None = Field(default=None, max_length=255, description="Mot de passe FTP/SFTP")
    backup_ftp_path: str | None = Field(default=None, max_length=500, description="Chemin distant pour backups")
    backup_retention_days: int | None = Field(default=None, description="Nombre de jours de rétention des backups")
    backup_auto_cleanup: bool | None = Field(default=None, description="Nettoyage automatique des anciens backups")

    # === CORE Services Configuration ===

    # Cache (Redis)
    redis_host: str | None = Field(default=None, max_length=255, description="Redis host")
    redis_port: int | None = Field(default=None, description="Redis port")
    redis_db: int | None = Field(default=None, description="Redis database number")
    redis_password: str | None = Field(default=None, max_length=255, description="Redis password")

    # Storage (S3/MinIO)
    storage_backend: str | None = Field(default=None, max_length=50, description="Storage backend: local, s3, minio")
    s3_endpoint: str | None = Field(default=None, max_length=500, description="S3/MinIO endpoint URL")
    s3_access_key: str | None = Field(default=None, max_length=255, description="S3/MinIO access key")
    s3_secret_key: str | None = Field(default=None, max_length=255, description="S3/MinIO secret key")
    s3_bucket: str | None = Field(default=None, max_length=255, description="S3/MinIO bucket name")
    s3_region: str | None = Field(default=None, max_length=100, description="S3 region")

    # Search (PostgreSQL/Elasticsearch/Typesense)
    search_backend: str | None = Field(default=None, max_length=50, description="Search backend: postgresql, elasticsearch, typesense")
    search_language: str | None = Field(default=None, max_length=50, description="Search language for text analysis")
    elasticsearch_url: str | None = Field(default=None, max_length=500, description="Elasticsearch URL")
    typesense_api_key: str | None = Field(default=None, max_length=255, description="Typesense API key")
    typesense_host: str | None = Field(default=None, max_length=255, description="Typesense host")

    # Audit Logs
    audit_retention_days: int | None = Field(default=None, description="Nombre de jours de rétention des logs d'audit")
    audit_log_level: str | None = Field(default=None, max_length=50, description="Niveau de log: DEBUG, INFO, WARNING, ERROR")
    audit_enabled: bool | None = Field(default=None, description="Activer/désactiver les logs d'audit")

    # User Invitations
    invitation_expiry_days: int | None = Field(default=None, description="Nombre de jours de validité d'une invitation utilisateur")


class AppSettings(AbstractBaseModel, AppSettingsBase, table=True):
    """
    Database model for application settings.
    There should only be one record in this table.
    """
    __tablename__ = "app_settings"


class AppSettingsPublic(AppSettingsBase):
    """Public model for application settings"""
    id: uuid.UUID


# API Keys Models
class ApiKeyBase(SQLModel):
    """Base model for API keys"""
    name: str = Field(max_length=255)
    key: str = Field(max_length=500, index=True)  # The actual API key (hashed in production)
    environment: str = Field(default="production", max_length=50)  # production, test, development
    key_type: str = Field(default="secret", max_length=50)  # secret, publishable
    is_active: bool = True
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, ondelete="CASCADE")


class ApiKeyCreate(SQLModel):
    """Model for creating API keys"""
    name: str = Field(max_length=255)
    environment: str = Field(default="production", max_length=50)
    key_type: str = Field(default="secret", max_length=50)


class ApiKeyUpdate(SQLModel):
    """Model for updating API keys"""
    name: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None


class ApiKey(AbstractBaseModel, ApiKeyBase, table=True):
    """
    API Key model with audit trail and soft delete.
    Inherits from AbstractBaseModel for common functionality.
    """
    __tablename__ = "api_key"
    user: User | None = Relationship(back_populates="api_keys")


class ApiKeyPublic(SQLModel):
    """Public model for API keys (without sensitive data)"""
    id: uuid.UUID
    name: str
    key_preview: str  # Only first/last few characters
    environment: str
    key_type: str
    is_active: bool
    user_id: uuid.UUID
    created_at: str | None = None


class ApiKeysPublic(SQLModel):
    """Model for list of API keys"""
    data: list[ApiKeyPublic]
    count: int


# Webhooks Models
class WebhookBase(SQLModel):
    """Base model for webhooks"""
    url: str = Field(max_length=500)
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    auth_type: str = Field(default="none", max_length=50)  # none, application, platform
    status: str = Field(default="enabled", max_length=50)  # enabled, disabled
    events: Optional[list[str]] = Field(default=None, sa_column=Column(JSON, nullable=True))
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, ondelete="CASCADE")


class WebhookCreate(SQLModel):
    """Model for creating webhooks"""
    url: str = Field(max_length=500)
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    auth_type: str = Field(default="none", max_length=50)
    events: list[str] | None = None


class WebhookUpdate(SQLModel):
    """Model for updating webhooks"""
    url: str | None = Field(default=None, max_length=500)
    name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    auth_type: str | None = Field(default=None, max_length=50)
    status: str | None = Field(default=None, max_length=50)
    events: list[str] | None = None


class Webhook(AbstractBaseModel, WebhookBase, table=True):
    """
    Webhook model with audit trail and soft delete.
    Inherits from AbstractBaseModel for common functionality.
    """
    __tablename__ = "webhook"
    user: User | None = Relationship(back_populates="webhooks")
    logs: list["WebhookLog"] = Relationship(back_populates="webhook", cascade_delete=True)


class WebhookPublic(WebhookBase):
    """Public model for webhooks"""
    id: uuid.UUID
    created_at: str | None = None
    updated_at: str | None = None


class WebhooksPublic(SQLModel):
    """Model for list of webhooks"""
    data: list[WebhookPublic]
    count: int


# Webhook Logs Models
class WebhookLogBase(SQLModel):
    """Base model for webhook logs"""
    webhook_id: uuid.UUID = Field(foreign_key="webhook.id", nullable=False, ondelete="CASCADE")
    action: str = Field(max_length=255)  # The event that triggered the webhook
    succeeded: bool
    status_code: int | None = None
    response_body: str | None = Field(default=None, max_length=5000)
    error_message: str | None = Field(default=None, max_length=1000)


class WebhookLogCreate(SQLModel):
    """Model for creating webhook logs"""
    webhook_id: uuid.UUID
    action: str = Field(max_length=255)
    succeeded: bool
    status_code: int | None = None
    response_body: str | None = None
    error_message: str | None = None


class WebhookLog(AbstractBaseModel, WebhookLogBase, table=True):
    """
    Webhook Log model with audit trail.
    Inherits from AbstractBaseModel for common functionality.
    """
    __tablename__ = "webhook_log"
    webhook: Webhook | None = Relationship(back_populates="logs")


class WebhookLogPublic(WebhookLogBase):
    """Public model for webhook logs"""
    id: uuid.UUID
    datetime: str | None = None  # created_at alias


class WebhookLogsPublic(SQLModel):
    """Model for list of webhook logs"""
    data: list[WebhookLogPublic]
    count: int


# Task Models
class TaskBase(SQLModel):
    """Base model for tasks"""
    title: str = Field(max_length=500)
    status: str = Field(default="todo", max_length=50)  # in progress, backlog, todo, canceled, done
    label: str = Field(default="feature", max_length=50)  # documentation, bug, feature
    priority: str = Field(default="medium", max_length=50)  # high, medium, low
    due_date: str | None = Field(default=None)  # ISO format date string
    estimated_time: str | None = Field(default=None, max_length=50)  # e.g., "2h", "1d", "3w"
    sprint_cycle: str | None = Field(default=None, max_length=50)  # e.g., "Sprint 1", "Q1 2024"
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", nullable=True, ondelete="SET NULL")  # Assigned to


class TaskCreate(SQLModel):
    """Model for creating tasks"""
    title: str = Field(max_length=500)
    status: str = Field(default="todo", max_length=50)
    label: str = Field(default="feature", max_length=50)
    priority: str = Field(default="medium", max_length=50)
    due_date: str | None = None
    estimated_time: str | None = Field(default=None, max_length=50)
    sprint_cycle: str | None = Field(default=None, max_length=50)
    user_id: uuid.UUID | None = None


class TaskUpdate(SQLModel):
    """Model for updating tasks"""
    title: str | None = Field(default=None, max_length=500)
    status: str | None = Field(default=None, max_length=50)
    label: str | None = Field(default=None, max_length=50)
    priority: str | None = Field(default=None, max_length=50)
    due_date: str | None = None
    estimated_time: str | None = Field(default=None, max_length=50)
    sprint_cycle: str | None = Field(default=None, max_length=50)
    user_id: uuid.UUID | None = None


class Task(AbstractBaseModel, TaskBase, table=True):
    """
    Task model with audit trail and soft delete.
    Inherits from AbstractBaseModel for common functionality.
    """
    __tablename__ = "task"
    assigned_user: User | None = Relationship()


class TaskPublic(TaskBase):
    """Public model for tasks"""
    id: uuid.UUID
    created_at: str | None = None
    updated_at: str | None = None


class TasksPublic(SQLModel):
    """Model for list of tasks"""
    data: list[TaskPublic]
    count: int


# NOTE: Les modèles des modules sont chargés dynamiquement par le ModuleLoader au démarrage
# Voir: app/core/module_loader.py
# Ne PAS importer de modèles de modules ici.

# Import UserApiKey to ensure it's loaded before SQLAlchemy mapper initialization
# This prevents "UserApiKey failed to locate" error
from app import models_api_keys  # noqa: F401, E402
