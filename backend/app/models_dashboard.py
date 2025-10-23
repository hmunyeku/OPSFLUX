"""
Modèles pour le système de Dashboards & Widgets personnalisables.
Gestion complète des dashboards utilisateur, widgets modulaires, et layouts personnalisables.
"""

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any, TYPE_CHECKING
from enum import Enum

from sqlmodel import Field, Relationship, SQLModel, Column, JSON
from sqlalchemy import Index, UniqueConstraint

from app.core.models import AbstractBaseModel

if TYPE_CHECKING:
    from app.models import User


class DashboardScope(str, Enum):
    """Scope d'un dashboard obligatoire"""
    GLOBAL = "global"  # Visible par tous
    GROUP = "group"  # Visible par un groupe spécifique
    ROLE = "role"  # Visible par un rôle spécifique
    USER = "user"  # Visible par un utilisateur spécifique


class WidgetCategory(str, Enum):
    """Catégories de widgets"""
    ANALYTICS = "analytics"
    MONITORING = "monitoring"
    CHARTS = "charts"
    LISTS = "lists"
    STATS = "stats"
    NOTIFICATIONS = "notifications"
    CUSTOM = "custom"


# ==================== WIDGET ====================

class WidgetBase(SQLModel):
    """Propriétés de base pour Widget"""
    widget_type: str = Field(max_length=100, index=True, description="Type de widget (ex: stats_card, chart_line)")
    name: str = Field(max_length=255, description="Nom du widget")
    description: Optional[str] = Field(default=None, description="Description du widget")
    module_name: str = Field(max_length=100, description="Module source (core, hse, warehouse, etc.)")
    category: Optional[str] = Field(default=None, max_length=50, description="Catégorie du widget")
    icon: Optional[str] = Field(default=None, max_length=50, description="Icône du widget")
    required_permission: Optional[str] = Field(default=None, max_length=100, description="Permission requise pour utiliser le widget")
    is_active: bool = Field(default=True, description="Widget actif")


class WidgetCreate(WidgetBase):
    """Schéma pour créer un widget"""
    default_config: Dict[str, Any] = Field(default_factory=dict, description="Configuration par défaut")
    default_size: Dict[str, int] = Field(
        default_factory=lambda: {"w": 3, "h": 2, "minW": 2, "minH": 1, "maxW": 12, "maxH": 6},
        description="Taille par défaut (w, h, minW, minH, maxW, maxH)"
    )


class WidgetUpdate(SQLModel):
    """Schéma pour mettre à jour un widget"""
    name: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    category: Optional[str] = Field(default=None, max_length=50)
    icon: Optional[str] = Field(default=None, max_length=50)
    required_permission: Optional[str] = Field(default=None, max_length=100)
    is_active: Optional[bool] = None
    default_config: Optional[Dict[str, Any]] = None
    default_size: Optional[Dict[str, int]] = None


class Widget(AbstractBaseModel, WidgetBase, table=True):
    """
    Modèle pour les widgets du système.
    Les widgets sont des composants réutilisables affichables dans les dashboards.
    """
    __tablename__ = "widget"
    __table_args__ = (
        UniqueConstraint("widget_type", name="uq_widget_type"),
        Index("ix_widget_type", "widget_type"),
        Index("ix_widget_module_name", "module_name"),
        Index("ix_widget_category", "category"),
    )

    # Configuration par défaut (JSON)
    default_config: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default="{}")
    )

    # Taille par défaut (JSON: {w, h, minW, minH, maxW, maxH})
    default_size: Dict[str, int] = Field(
        default_factory=lambda: {"w": 3, "h": 2, "minW": 2, "minH": 1, "maxW": 12, "maxH": 6},
        sa_column=Column(JSON, nullable=False)
    )

    # Relations
    dashboard_widgets: List["DashboardWidget"] = Relationship(
        back_populates="widget",
        cascade_delete=True
    )


class WidgetPublic(WidgetBase):
    """Schéma public pour Widget"""
    id: uuid.UUID
    default_config: Dict[str, Any]
    default_size: Dict[str, int]
    created_at: datetime
    updated_at: datetime


class WidgetsPublic(SQLModel):
    """Liste de widgets"""
    data: List[WidgetPublic]
    count: int


# ==================== DASHBOARD ====================

class DashboardBase(SQLModel):
    """Propriétés de base pour Dashboard"""
    name: str = Field(max_length=255, description="Nom du dashboard")
    description: Optional[str] = Field(default=None, description="Description du dashboard")
    is_default: bool = Field(default=False, description="Dashboard par défaut pour nouveaux utilisateurs")
    is_mandatory: bool = Field(default=False, description="Dashboard obligatoire, non supprimable par l'utilisateur")
    scope: Optional[str] = Field(default=None, max_length=50, description="Scope si mandatory (global, group, role, user)")
    scope_id: Optional[uuid.UUID] = Field(default=None, description="ID du groupe/rôle/utilisateur si scope applicable")
    is_active: bool = Field(default=True, description="Dashboard actif")
    is_public: bool = Field(default=False, description="Dashboard partageable avec autres utilisateurs")
    order: int = Field(default=0, description="Ordre d'affichage")


class DashboardCreate(DashboardBase):
    """Schéma pour créer un dashboard"""
    layout_config: Dict[str, Any] = Field(
        default_factory=lambda: {"column": 12, "cellHeight": 70, "margin": 10},
        description="Configuration de la grille (column, cellHeight, margin, etc.)"
    )
    widgets: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Liste de widgets à ajouter (widget_id, x, y, w, h, config)"
    )


class DashboardUpdate(SQLModel):
    """Schéma pour mettre à jour un dashboard"""
    name: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None
    is_public: Optional[bool] = None
    order: Optional[int] = None
    layout_config: Optional[Dict[str, Any]] = None


class Dashboard(AbstractBaseModel, DashboardBase, table=True):
    """
    Modèle pour les dashboards du système.
    Un dashboard est une collection de widgets organisés dans une grille personnalisable.
    """
    __tablename__ = "dashboard"
    __table_args__ = (
        Index("ix_dashboard_created_by_id", "created_by_id"),
        Index("ix_dashboard_is_mandatory", "is_mandatory"),
        Index("ix_dashboard_scope", "scope"),
        Index("ix_dashboard_scope_id", "scope_id"),
    )

    # Configuration du layout de la grille (JSON)
    layout_config: Dict[str, Any] = Field(
        default_factory=lambda: {"column": 12, "cellHeight": 70, "margin": 10},
        sa_column=Column(JSON, nullable=False)
    )

    # Relations
    widgets: List["DashboardWidget"] = Relationship(
        back_populates="dashboard",
        cascade_delete=True
    )
    user_dashboards: List["UserDashboard"] = Relationship(
        back_populates="dashboard",
        cascade_delete=True
    )


class DashboardPublic(DashboardBase):
    """Schéma public pour Dashboard"""
    id: uuid.UUID
    layout_config: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    created_by_id: Optional[uuid.UUID]
    widgets: Optional[List["DashboardWidgetPublic"]] = None


class DashboardsPublic(SQLModel):
    """Liste de dashboards"""
    data: List[DashboardPublic]
    count: int


class DashboardWithWidgets(DashboardPublic):
    """Dashboard avec ses widgets complets"""
    widgets: List["DashboardWidgetPublic"]


# ==================== DASHBOARD WIDGET (Association) ====================

class DashboardWidgetBase(SQLModel):
    """Propriétés de base pour DashboardWidget"""
    x: int = Field(default=0, description="Position X dans la grille")
    y: int = Field(default=0, description="Position Y dans la grille")
    w: int = Field(default=3, description="Largeur en colonnes")
    h: int = Field(default=2, description="Hauteur en lignes")
    is_visible: bool = Field(default=True, description="Widget visible")
    order: int = Field(default=0, description="Ordre d'affichage")


class DashboardWidgetCreate(DashboardWidgetBase):
    """Schéma pour ajouter un widget à un dashboard"""
    widget_id: uuid.UUID = Field(description="ID du widget")
    config: Dict[str, Any] = Field(default_factory=dict, description="Configuration spécifique")


class DashboardWidgetUpdate(SQLModel):
    """Schéma pour mettre à jour un widget dans un dashboard"""
    x: Optional[int] = None
    y: Optional[int] = None
    w: Optional[int] = None
    h: Optional[int] = None
    is_visible: Optional[bool] = None
    order: Optional[int] = None
    config: Optional[Dict[str, Any]] = None


class DashboardWidget(AbstractBaseModel, DashboardWidgetBase, table=True):
    """
    Table d'association Dashboard <-> Widget avec position et configuration.
    Représente une instance d'un widget dans un dashboard spécifique.
    """
    __tablename__ = "dashboard_widget"
    __table_args__ = (
        UniqueConstraint("dashboard_id", "widget_id", name="uq_dashboard_widget"),
        Index("ix_dashboard_widget_dashboard_id", "dashboard_id"),
        Index("ix_dashboard_widget_widget_id", "widget_id"),
    )

    # Foreign keys
    dashboard_id: uuid.UUID = Field(foreign_key="dashboard.id", description="ID du dashboard")
    widget_id: uuid.UUID = Field(foreign_key="widget.id", description="ID du widget")

    # Configuration spécifique à cette instance (override default_config)
    config: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default="{}")
    )

    # Relations
    dashboard: Dashboard = Relationship(back_populates="widgets")
    widget: Widget = Relationship(back_populates="dashboard_widgets")


class DashboardWidgetPublic(DashboardWidgetBase):
    """Schéma public pour DashboardWidget"""
    id: uuid.UUID
    dashboard_id: uuid.UUID
    widget_id: uuid.UUID
    config: Dict[str, Any]
    widget: Optional[WidgetPublic] = None


class DashboardWidgetsPublic(SQLModel):
    """Liste de widgets dans un dashboard"""
    data: List[DashboardWidgetPublic]
    count: int


# ==================== USER DASHBOARD (Préférences Utilisateur) ====================

class UserDashboardBase(SQLModel):
    """Propriétés de base pour UserDashboard"""
    is_pinned: bool = Field(default=False, description="Dashboard épinglé")
    is_favorite: bool = Field(default=False, description="Dashboard favori")
    is_default: bool = Field(default=False, description="Dashboard par défaut de l'utilisateur")
    order: int = Field(default=0, description="Ordre d'affichage pour cet utilisateur")


class UserDashboardCreate(UserDashboardBase):
    """Schéma pour ajouter un dashboard aux préférences utilisateur"""
    dashboard_id: uuid.UUID = Field(description="ID du dashboard")
    custom_layout: Optional[Dict[str, Any]] = Field(default=None, description="Layout personnalisé")


class UserDashboardUpdate(SQLModel):
    """Schéma pour mettre à jour les préférences dashboard utilisateur"""
    is_pinned: Optional[bool] = None
    is_favorite: Optional[bool] = None
    is_default: Optional[bool] = None
    order: Optional[int] = None
    custom_layout: Optional[Dict[str, Any]] = None


class UserDashboard(AbstractBaseModel, UserDashboardBase, table=True):
    """
    Table pour les préférences utilisateur des dashboards.
    Permet à chaque utilisateur de personnaliser l'affichage et le layout des dashboards.
    """
    __tablename__ = "user_dashboard"
    __table_args__ = (
        UniqueConstraint("user_id", "dashboard_id", name="uq_user_dashboard"),
        Index("ix_user_dashboard_user_id", "user_id"),
        Index("ix_user_dashboard_dashboard_id", "dashboard_id"),
        Index("ix_user_dashboard_is_default", "is_default"),
    )

    # Foreign keys
    user_id: uuid.UUID = Field(foreign_key="user.id", description="ID de l'utilisateur")
    dashboard_id: uuid.UUID = Field(foreign_key="dashboard.id", description="ID du dashboard")

    # Layout personnalisé (override du layout du dashboard)
    custom_layout: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True)
    )

    # Dernière consultation
    last_viewed_at: Optional[datetime] = Field(default=None, description="Dernière consultation du dashboard")

    # Relations
    dashboard: Dashboard = Relationship(back_populates="user_dashboards")


class UserDashboardPublic(UserDashboardBase):
    """Schéma public pour UserDashboard"""
    id: uuid.UUID
    user_id: uuid.UUID
    dashboard_id: uuid.UUID
    custom_layout: Optional[Dict[str, Any]]
    last_viewed_at: Optional[datetime]
    dashboard: Optional[DashboardPublic] = None


class UserDashboardsPublic(SQLModel):
    """Liste des dashboards d'un utilisateur"""
    data: List[UserDashboardPublic]
    count: int


# ==================== SCHÉMAS DE RÉPONSE SPÉCIAUX ====================

class DashboardLayoutUpdate(SQLModel):
    """Schéma pour mettre à jour uniquement le layout d'un dashboard"""
    widgets: List[Dict[str, Any]] = Field(
        description="Liste des widgets avec positions (id, x, y, w, h)"
    )


class UserDashboardsResponse(SQLModel):
    """Réponse complète pour les dashboards d'un utilisateur"""
    my_dashboards: List[DashboardPublic]
    mandatory_dashboards: List[DashboardPublic]
    shared_dashboards: List[DashboardPublic]
    total_count: int
