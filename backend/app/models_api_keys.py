"""
User API Keys Model
Permet aux utilisateurs de generer/revoquer leurs propres cles API pour acceder a la documentation et aux endpoints.
"""

import uuid
from datetime import datetime
from typing import Optional, TYPE_CHECKING

from sqlmodel import Field, Relationship, SQLModel

from app.core.models import AbstractBaseModel

if TYPE_CHECKING:
    from app.models import User


class UserApiKeyBase(SQLModel):
    """Base schema for UserApiKey"""
    name: str = Field(max_length=100, description="Nom de la cle pour identification")
    expires_at: datetime | None = Field(default=None, description="Date d'expiration optionnelle")


class UserApiKeyCreate(UserApiKeyBase):
    """Schema for creating a UserApiKey"""
    name: str = Field(default="My API Key", max_length=100)


class UserApiKeyPublic(SQLModel):
    """Public schema for UserApiKey (sans le secret complet)"""
    id: uuid.UUID
    name: str
    key_prefix: str
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime | None
    is_active: bool


class UserApiKeyResponse(SQLModel):
    """Response lors de la creation d'une cle - inclut la cle complete UNE SEULE FOIS"""
    id: uuid.UUID
    name: str
    key: str  # Cle complete affichee une seule fois!
    key_prefix: str
    created_at: datetime
    expires_at: datetime | None


class UserApiKey(AbstractBaseModel, table=True):
    """
    Modele UserApiKey avec audit trail complet et soft delete.
    Herite de AbstractBaseModel pour les fonctionnalites communes.

    Chaque utilisateur peut avoir UNE cle API active a la fois.
    La cle est hashee en SHA256 pour la securite.
    """
    __tablename__ = "user_api_key"

    # Relations
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True, nullable=False)

    # API Key (hashee pour securite)
    key_hash: str = Field(max_length=64, unique=True, index=True, nullable=False, description="Hash SHA256 de la cle")
    key_prefix: str = Field(max_length=16, nullable=False, description="Prefixe pour affichage (ex: 'ofs_xxxxx...')")

    # Metadonnees
    name: str = Field(max_length=100, nullable=False, description="Nom de la cle pour identification")
    last_used_at: datetime | None = Field(default=None, nullable=True, description="Derniere utilisation")
    expires_at: datetime | None = Field(default=None, nullable=True, description="Date d'expiration")
    is_active: bool = Field(default=True, nullable=False, description="Cle active ou revoquee")

    # Permissions (optionnel pour evolution future)
    scopes: str | None = Field(default=None, max_length=1000, nullable=True, description="JSON array of scopes")

    # Relationship
    user: "User" = Relationship(back_populates="user_api_keys")


class UserApiKeysPublic(SQLModel):
    """Liste publique de cles API"""
    data: list[UserApiKeyPublic]
    count: int
