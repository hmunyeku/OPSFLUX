"""
Modèles pour les préférences utilisateur.

Les préférences permettent de stocker les paramètres UI et les préférences
spécifiques aux modules pour chaque utilisateur.
"""

from typing import Optional
from uuid import UUID

from sqlmodel import Field, SQLModel, Column
from sqlalchemy.dialects.postgresql import JSONB

from app.core.models.base import AbstractBaseModel


class UserPreference(AbstractBaseModel, table=True):
    """
    Préférences utilisateur.

    Stocke les préférences UI (theme, sidebar, etc.) et les préférences
    spécifiques aux modules pour chaque utilisateur.
    """
    __tablename__ = "user_preference"

    # Utilisateur
    user_id: UUID = Field(foreign_key="user.id", index=True)

    # Module (None = préférences CORE UI)
    module_id: Optional[UUID] = Field(default=None, foreign_key="module.id", index=True)

    # Clé de la préférence
    # Ex: "colorTheme", "darkMode", "sidebarCollapsed" (CORE)
    # Ex: "hse.default_view", "hse.notifications_enabled" (module)
    preference_key: str = Field(max_length=255, index=True)

    # Valeur (JSON pour supporter différents types)
    preference_value: dict = Field(default={}, sa_column=Column(JSONB))

    # Type de donnée pour validation frontend
    # "string", "number", "boolean", "json", "array"
    preference_type: str = Field(default="json", max_length=50)

    # Description (optionnel)
    description: Optional[str] = Field(default=None, max_length=500)

    # Index unique: un user ne peut avoir qu'une seule valeur par clé par module
    __table_args__ = (
        # Unique constraint: (user_id, module_id, preference_key)
        # Permet NULL dans module_id pour les préférences CORE
    )


# --- Pydantic Schemas pour l'API ---

class UserPreferenceBase(SQLModel):
    """Base schema pour UserPreference"""
    preference_key: str
    preference_value: dict
    preference_type: str = "json"
    description: Optional[str] = None
    module_id: Optional[UUID] = None


class UserPreferenceCreate(UserPreferenceBase):
    """Schema pour créer une préférence"""
    pass


class UserPreferenceUpdate(SQLModel):
    """Schema pour mettre à jour une préférence"""
    preference_value: dict
    preference_type: Optional[str] = None
    description: Optional[str] = None


class UserPreferencePublic(UserPreferenceBase):
    """Schema public pour UserPreference"""
    id: UUID
    user_id: UUID


class UserPreferencesPublic(SQLModel):
    """Liste de préférences"""
    data: list[UserPreferencePublic]
    count: int


class UserPreferencesBulkUpdate(SQLModel):
    """Schema pour mise à jour en masse des préférences"""
    preferences: dict[str, dict]  # {key: {value, type}}
    module_id: Optional[UUID] = None
