"""
Modèles pour le système de gestion multilingue (i18n - Internationalization).

Ce système permet de gérer les traductions de l'application et des modules.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlmodel import Field, SQLModel, Column, JSON
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from app.core.models.base import AbstractBaseModel


class Language(AbstractBaseModel, table=True):
    """
    Langue disponible dans le système.

    Une langue représente un idiome supporté par l'application.
    """
    __tablename__ = "language"

    # Identification
    code: str = Field(max_length=10, unique=True, index=True)  # "fr", "en", "es", "pt"
    name: str = Field(max_length=100)  # "Français", "English", "Español"
    native_name: str = Field(max_length=100)  # "Français", "English", "Español"

    # Métadonnées
    flag_emoji: Optional[str] = Field(default=None, max_length=10)  # "🇫🇷", "🇬🇧", "🇪🇸"
    direction: str = Field(default="ltr", max_length=3)  # "ltr" (left-to-right) ou "rtl" (right-to-left)

    # Statut
    is_active: bool = Field(default=True)  # Langue activée pour l'utilisation
    is_default: bool = Field(default=False)  # Langue par défaut du système

    # Ordre d'affichage
    display_order: int = Field(default=0)

    # Statistiques
    translation_progress: float = Field(default=0.0)  # Pourcentage de traduction (0-100)


class TranslationNamespace(AbstractBaseModel, table=True):
    """
    Namespace de traduction (CORE ou module spécifique).

    Un namespace regroupe les traductions par domaine fonctionnel.
    Exemples: "core.common", "core.auth", "module.hse"
    """
    __tablename__ = "translation_namespace"

    # Identification
    code: str = Field(max_length=100, unique=True, index=True)  # "core.common", "module.hse"
    name: str = Field(max_length=255)  # "Common Core", "HSE Module"
    description: Optional[str] = Field(default=None, max_length=500)

    # Type
    namespace_type: str = Field(max_length=50, index=True)  # "core", "module"

    # Module associé (si namespace de module)
    module_id: Optional[UUID] = Field(default=None, foreign_key="module.id", index=True)


class Translation(AbstractBaseModel, table=True):
    """
    Traduction d'une clé pour une langue donnée.

    Une traduction associe une clé (ex: "auth.login.title")
    à sa traduction dans une langue spécifique.
    """
    __tablename__ = "translation"

    # Relations
    namespace_id: UUID = Field(foreign_key="translation_namespace.id", index=True)
    language_id: UUID = Field(foreign_key="language.id", index=True)

    # Clé de traduction
    key: str = Field(max_length=255, index=True)  # "auth.login.title"

    # Traduction
    value: str = Field(sa_column=Column(sa.Text))  # "Se connecter"

    # Métadonnées
    context: Optional[str] = Field(default=None, sa_column=Column(sa.Text))  # Contexte d'utilisation
    pluralized: Optional[dict] = Field(default=None, sa_column=Column(JSONB))  # Formes plurielles

    # Validation
    is_verified: bool = Field(default=False)  # Traduction vérifiée par un traducteur
    verified_at: Optional[datetime] = Field(default=None)
    verified_by_id: Optional[UUID] = Field(default=None, foreign_key="user.id")

    # Contrainte d'unicité
    __table_args__ = (
        sa.UniqueConstraint('namespace_id', 'language_id', 'key', name='uq_translation_namespace_language_key'),
    )


class UserLanguagePreference(AbstractBaseModel, table=True):
    """
    Préférence de langue d'un utilisateur.

    Définit la langue préférée pour l'interface et les communications.
    """
    __tablename__ = "user_language_preference"

    # Utilisateur
    user_id: UUID = Field(foreign_key="user.id", unique=True, index=True)

    # Langue préférée
    language_id: UUID = Field(foreign_key="language.id", index=True)

    # Préférences supplémentaires
    fallback_language_id: Optional[UUID] = Field(default=None, foreign_key="language.id")  # Langue de secours


# --- Pydantic Schemas pour l'API ---

class LanguageBase(SQLModel):
    """Base schema pour Language"""
    code: str
    name: str
    native_name: str
    flag_emoji: Optional[str] = None
    direction: str = "ltr"
    is_active: bool = True
    is_default: bool = False
    display_order: int = 0


class LanguageCreate(LanguageBase):
    """Schema pour créer une langue"""
    pass


class LanguageUpdate(SQLModel):
    """Schema pour mettre à jour une langue"""
    name: Optional[str] = None
    native_name: Optional[str] = None
    flag_emoji: Optional[str] = None
    direction: Optional[str] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    display_order: Optional[int] = None


class LanguagePublic(LanguageBase):
    """Schema public pour Language"""
    id: UUID
    translation_progress: float
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class LanguagesPublic(SQLModel):
    """Liste paginée de langues"""
    data: list[LanguagePublic]
    count: int


class TranslationNamespaceBase(SQLModel):
    """Base schema pour TranslationNamespace"""
    code: str
    name: str
    description: Optional[str] = None
    namespace_type: str
    module_id: Optional[UUID] = None


class TranslationNamespaceCreate(TranslationNamespaceBase):
    """Schema pour créer un namespace"""
    pass


class TranslationNamespacePublic(TranslationNamespaceBase):
    """Schema public pour TranslationNamespace"""
    id: UUID
    created_at: Optional[datetime] = None


class TranslationBase(SQLModel):
    """Base schema pour Translation"""
    namespace_id: UUID
    language_id: UUID
    key: str
    value: str
    context: Optional[str] = None
    pluralized: Optional[dict] = None


class TranslationCreate(TranslationBase):
    """Schema pour créer une traduction"""
    pass


class TranslationUpdate(SQLModel):
    """Schema pour mettre à jour une traduction"""
    value: Optional[str] = None
    context: Optional[str] = None
    pluralized: Optional[dict] = None
    is_verified: Optional[bool] = None


class TranslationPublic(TranslationBase):
    """Schema public pour Translation"""
    id: UUID
    is_verified: bool
    verified_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TranslationsPublic(SQLModel):
    """Liste paginée de traductions"""
    data: list[TranslationPublic]
    count: int


class TranslationImportRequest(SQLModel):
    """Requête pour importer des traductions"""
    namespace_id: UUID
    language_id: UUID
    translations: dict[str, str]  # {key: value}
    overwrite_existing: bool = False


class TranslationExportResponse(SQLModel):
    """Réponse pour l'export de traductions"""
    namespace_code: str
    language_code: str
    translations: dict[str, str]
    total_keys: int
    verified_keys: int


class UserLanguagePreferencePublic(SQLModel):
    """Schema public pour UserLanguagePreference"""
    id: UUID
    user_id: UUID
    language_id: UUID
    fallback_language_id: Optional[UUID] = None
