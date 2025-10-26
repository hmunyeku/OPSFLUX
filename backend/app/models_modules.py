"""
Modèles pour le système de gestion de modules OpsFlux.

Un module est un ensemble de fonctionnalités isolées avec son propre backend/frontend
qui s'intègre au système CORE en enregistrant ses permissions, menus, hooks, etc.
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from sqlmodel import Field, SQLModel, Column, JSON, Relationship
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from app.core.models.base import AbstractBaseModel


class ModuleStatus(str, Enum):
    """Statut d'un module"""
    AVAILABLE = "available"  # Disponible pour installation
    INSTALLED = "installed"  # Installé mais pas activé
    ACTIVE = "active"  # Actif et fonctionnel
    DISABLED = "disabled"  # Désactivé temporairement
    ERROR = "error"  # Erreur lors installation/activation
    UPDATING = "updating"  # En cours de mise à jour


class ModuleDependency(SQLModel, table=True):
    """
    Dépendances entre modules.
    Permet de gérer l'ordre d'installation et les contraintes.
    """
    __tablename__ = "module_dependency"

    id: UUID = Field(default=None, sa_column=Column(sa.dialects.postgresql.UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")))

    # Module qui dépend
    module_id: UUID = Field(foreign_key="module.id", index=True)

    # Module requis
    required_module_id: UUID = Field(foreign_key="module.id", index=True)

    # Version minimale requise
    min_version: Optional[str] = Field(default=None, max_length=20)

    # Dépendance optionnelle ou obligatoire
    is_optional: bool = Field(default=False)


class Module(AbstractBaseModel, table=True):
    """
    Module OpsFlux.

    Un module encapsule des fonctionnalités métier complètes (HSE, Logistics, etc.)
    avec son propre backend, frontend, permissions, menus, hooks, etc.
    """
    __tablename__ = "module"

    # Identification
    name: str = Field(max_length=255, index=True)  # "HSE Reports"
    code: str = Field(max_length=100, unique=True, index=True)  # "hse"
    slug: str = Field(max_length=100, unique=True, index=True)  # "hse-reports"
    version: str = Field(max_length=20)  # "1.2.3"

    # Description
    description: Optional[str] = Field(default=None, max_length=500)
    long_description: Optional[str] = Field(default=None, sa_column=Column(sa.Text))

    # Métadonnées
    author: Optional[str] = Field(default=None, max_length=255)
    author_email: Optional[str] = Field(default=None, max_length=255)
    license: Optional[str] = Field(default=None, max_length=100)  # "MIT", "Proprietary"
    homepage_url: Optional[str] = Field(default=None, max_length=500)
    documentation_url: Optional[str] = Field(default=None, max_length=500)
    repository_url: Optional[str] = Field(default=None, max_length=500)

    # Icône du module (nom Lucide Icon ou URL)
    icon: Optional[str] = Field(default="Package", max_length=100)

    # Couleur d'accent (hex)
    color: Optional[str] = Field(default="#3B82F6", max_length=7)

    # Catégorie
    category: Optional[str] = Field(default="other", max_length=50)
    # "core", "business", "integration", "reporting", "other"

    # Ordre d'affichage dans la sidebar
    display_order: int = Field(default=1000)  # Plus petit = plus haut dans la liste

    # Statut du module
    status: ModuleStatus = Field(default=ModuleStatus.AVAILABLE, index=True)

    # Installation
    installed_at: Optional[datetime] = Field(default=None)
    installed_by_id: Optional[UUID] = Field(default=None, foreign_key="user.id")

    # Activation/Désactivation
    activated_at: Optional[datetime] = Field(default=None)
    deactivated_at: Optional[datetime] = Field(default=None)

    # Erreurs d'installation/activation
    error_message: Optional[str] = Field(default=None, sa_column=Column(sa.Text))

    # Manifest complet (JSON)
    manifest: dict = Field(default={}, sa_column=Column(JSONB))
    # Contient: permissions, menu_items, hooks, settings, dependencies, etc.

    # Configuration du module (paramètres utilisateur)
    config: dict = Field(default={}, sa_column=Column(JSONB))

    # Métriques d'utilisation
    usage_count: int = Field(default=0)  # Nombre d'utilisations
    last_used_at: Optional[datetime] = Field(default=None)

    # Flags
    is_system: bool = Field(default=False)  # Module système (ne peut être désinstallé)
    is_required: bool = Field(default=False)  # Module requis (ne peut être désactivé)
    requires_license: bool = Field(default=False)  # Nécessite une licence payante

    # Taille et ressources
    size_bytes: Optional[int] = Field(default=None)  # Taille sur disque
    frontend_path: Optional[str] = Field(default=None, max_length=500)
    backend_path: Optional[str] = Field(default=None, max_length=500)

    # Relations
    dependencies: list["Module"] = Relationship(
        back_populates="dependent_modules",
        link_model=ModuleDependency,
        sa_relationship_kwargs={
            "primaryjoin": "Module.id==ModuleDependency.module_id",
            "secondaryjoin": "Module.id==ModuleDependency.required_module_id",
        }
    )

    dependent_modules: list["Module"] = Relationship(
        back_populates="dependencies",
        link_model=ModuleDependency,
        sa_relationship_kwargs={
            "primaryjoin": "Module.id==ModuleDependency.required_module_id",
            "secondaryjoin": "Module.id==ModuleDependency.module_id",
        }
    )


class ModulePermission(AbstractBaseModel, table=True):
    """
    Permission définie par un module.
    Enregistrée automatiquement lors de l'installation du module.
    """
    __tablename__ = "module_permission"

    module_id: UUID = Field(foreign_key="module.id", index=True)
    code: str = Field(max_length=255, unique=True, index=True)  # "hse.create.incident"
    name: str = Field(max_length=255)  # "Créer un incident"
    description: Optional[str] = Field(default=None, max_length=500)
    category: Optional[str] = Field(default="general", max_length=100)  # "incident", "report"


class ModuleMenuItem(AbstractBaseModel, table=True):
    """
    Item de menu défini par un module.
    Enregistré automatiquement lors de l'installation du module.
    """
    __tablename__ = "module_menu_item"

    module_id: UUID = Field(foreign_key="module.id", index=True)

    # Identité
    label: str = Field(max_length=255)  # "Incidents"
    route: str = Field(max_length=500)  # "/hse/incidents"
    icon: Optional[str] = Field(default=None, max_length=100)  # "AlertTriangle"

    # Hiérarchie
    parent_id: Optional[UUID] = Field(default=None, foreign_key="module_menu_item.id")
    order: int = Field(default=0)  # Pour le tri

    # Permission requise pour voir ce menu
    permission_code: Optional[str] = Field(default=None, max_length=255)

    # Badge (pour afficher un compteur)
    badge_source: Optional[str] = Field(default=None, max_length=255)
    # Ex: "incident_count" → affiche nombre d'incidents en attente

    # Actif/inactif
    is_active: bool = Field(default=True)


class ModuleHook(AbstractBaseModel, table=True):
    """
    Hook défini par un module.
    Enregistré automatiquement lors de l'installation du module.
    """
    __tablename__ = "module_hook"

    module_id: UUID = Field(foreign_key="module.id", index=True)

    # Configuration du hook
    name: str = Field(max_length=255)
    event: str = Field(max_length=255, index=True)  # "incident.created"
    is_active: bool = Field(default=True)
    priority: int = Field(default=0)

    # Conditions et actions (JSON)
    conditions: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    actions: list[dict] = Field(default=[], sa_column=Column(JSONB))


class ModuleRegistry(AbstractBaseModel, table=True):
    """
    Registre des modules disponibles (marketplace).
    Catalogue de tous les modules installables.
    """
    __tablename__ = "module_registry"

    # Identité (correspond au module une fois installé)
    code: str = Field(max_length=100, unique=True, index=True)
    name: str = Field(max_length=255)
    version: str = Field(max_length=20)

    # Description
    description: Optional[str] = Field(default=None, max_length=500)
    long_description: Optional[str] = Field(default=None, sa_column=Column(sa.Text))

    # Métadonnées
    author: Optional[str] = Field(default=None, max_length=255)
    category: Optional[str] = Field(default="other", max_length=50)
    icon: Optional[str] = Field(default="Package", max_length=100)
    color: Optional[str] = Field(default="#3B82F6", max_length=7)

    # Download
    download_url: str = Field(max_length=500)  # URL du fichier ZIP
    download_count: int = Field(default=0)
    size_bytes: Optional[int] = Field(default=None)

    # Requirements
    requires_license: bool = Field(default=False)
    min_opsflux_version: Optional[str] = Field(default=None, max_length=20)

    # Popularité et ratings
    rating: Optional[float] = Field(default=None)  # 0-5 étoiles
    rating_count: int = Field(default=0)
    install_count: int = Field(default=0)

    # Statut
    is_featured: bool = Field(default=False)  # Mis en avant
    is_verified: bool = Field(default=False)  # Vérifié par OpsFlux
    is_deprecated: bool = Field(default=False)  # Obsolète

    # Dates
    published_at: Optional[datetime] = Field(default=None)
    last_updated_at: Optional[datetime] = Field(default=None)

    # Screenshots et médias
    screenshots: list[str] = Field(default=[], sa_column=Column(JSONB))
    # URLs des screenshots

    # Changelog
    changelog: Optional[str] = Field(default=None, sa_column=Column(sa.Text))


# --- Pydantic Schemas pour l'API ---

class ModuleBase(SQLModel):
    """Base schema pour Module"""
    name: str
    code: str
    version: str
    description: Optional[str] = None
    category: Optional[str] = "other"
    icon: Optional[str] = "Package"
    color: Optional[str] = "#3B82F6"
    display_order: int = 1000


class ModuleCreate(ModuleBase):
    """Schema pour créer un module"""
    manifest: dict
    config: Optional[dict] = {}


class ModuleUpdate(SQLModel):
    """Schema pour mettre à jour un module"""
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ModuleStatus] = None
    config: Optional[dict] = None
    is_active: Optional[bool] = None


class ModulePublic(ModuleBase):
    """Schema public pour Module"""
    id: UUID
    slug: str
    status: ModuleStatus
    installed_at: Optional[datetime] = None
    activated_at: Optional[datetime] = None
    is_system: bool
    is_required: bool
    requires_license: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    manifest: Optional[dict] = None


class ModulesPublic(SQLModel):
    """Liste paginée de modules"""
    data: list[ModulePublic]
    count: int


class ModuleRegistryPublic(SQLModel):
    """Schema public pour ModuleRegistry"""
    id: UUID
    code: str
    name: str
    version: str
    description: Optional[str] = None
    author: Optional[str] = None
    category: Optional[str] = None
    icon: Optional[str] = None
    download_url: str
    download_count: int
    rating: Optional[float] = None
    install_count: int
    is_featured: bool
    is_verified: bool
    published_at: Optional[datetime] = None


class ModuleInstallRequest(SQLModel):
    """Requête pour installer un module"""
    code: str  # Code du module depuis le registry
    config: Optional[dict] = {}  # Configuration initiale


class ModuleInstallResponse(SQLModel):
    """Réponse après installation"""
    success: bool
    message: str
    module: Optional[ModulePublic] = None
    errors: Optional[list[str]] = None


class MenuItemPublic(SQLModel):
    """Schema public pour un item de menu"""
    id: str
    label: str
    route: str
    icon: Optional[str] = None
    permission: Optional[str] = None
    order: int
    badge_source: Optional[str] = None


class ModuleMenuPublic(SQLModel):
    """Schema public pour les menus d'un module"""
    module_code: str
    module_name: str
    module_icon: Optional[str] = None
    module_color: Optional[str] = None
    display_order: int = 1000
    menu_items: list[MenuItemPublic]


class ModuleMenusResponse(SQLModel):
    """Réponse pour les menus des modules"""
    data: list[ModuleMenuPublic]
    count: int
