"""
OpsFlux Dashboard System Models
Système de dashboards personnalisables avec widgets dynamiques
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from sqlmodel import Column, Field, JSON, Relationship, SQLModel
from app.models import AbstractBaseModel


# ============================================================================
# ENUMS
# ============================================================================

class MenuParentEnum(str, Enum):
    """Menus parents OpsFlux disponibles"""
    PILOTAGE = "pilotage"
    TIERS = "tiers"
    PROJECTS = "projects"
    ORGANIZER = "organizer"
    REDACTEUR = "redacteur"
    POBVUE = "pobvue"
    TRAVELWIZ = "travelwiz"
    MOCVUE = "mocvue"
    CLEANVUE = "cleanvue"
    POWERTRACE = "powertrace"


class WidgetTypeEnum(str, Enum):
    """Types de widgets disponibles"""
    STATS_CARD = "stats_card"
    LINE_CHART = "line_chart"
    BAR_CHART = "bar_chart"
    PIE_CHART = "pie_chart"
    AREA_CHART = "area_chart"
    TABLE = "table"
    LIST = "list"
    PROGRESS_CARD = "progress_card"
    GAUGE = "gauge"
    MAP = "map"
    CALENDAR = "calendar"
    TIMELINE = "timeline"
    KANBAN = "kanban"
    HEATMAP = "heatmap"
    METRIC = "metric"
    CUSTOM = "custom"


class DataSourceTypeEnum(str, Enum):
    """Types de sources de données"""
    API = "api"
    SQL = "sql"
    STATIC = "static"
    REALTIME = "realtime"
    WEBSOCKET = "websocket"


class RefreshIntervalEnum(str, Enum):
    """Intervalles de rafraîchissement"""
    REALTIME = "realtime"
    FIVE_SECONDS = "5s"
    TEN_SECONDS = "10s"
    THIRTY_SECONDS = "30s"
    ONE_MINUTE = "1m"
    FIVE_MINUTES = "5m"
    TEN_MINUTES = "10m"
    THIRTY_MINUTES = "30m"
    ONE_HOUR = "1h"
    MANUAL = "manual"


class LayoutBreakpointEnum(str, Enum):
    """Breakpoints responsive"""
    MOBILE = "mobile"
    TABLET = "tablet"
    DESKTOP = "desktop"


# ============================================================================
# MODELS
# ============================================================================

class Dashboard(AbstractBaseModel, table=True):
    """Dashboard personnalisable"""
    __tablename__ = "dashboards"

    # Métadonnées de base
    name: str = Field(max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    version: str = Field(default="1.0", max_length=20)

    # Navigation
    menu_parent: MenuParentEnum
    menu_label: str = Field(max_length=100)
    menu_icon: str = Field(default="LayoutDashboard", max_length=50)  # Icône Lucide React
    menu_order: int = Field(default=999)
    show_in_sidebar: bool = Field(default=True)
    is_home_page: bool = Field(default=False)

    # Permissions
    is_public: bool = Field(default=False)
    required_roles: Optional[list] = Field(default=None, sa_column=Column(JSON))  # ["admin", "manager"]
    required_permissions: Optional[list] = Field(default=None, sa_column=Column(JSON))  # ["dashboard.view"]
    restricted_to_users: Optional[list] = Field(default=None, sa_column=Column(JSON))  # [user_id, ...]
    restricted_to_organizations: Optional[list] = Field(default=None, sa_column=Column(JSON))  # [org_id, ...]
    inherit_from_parent: bool = Field(default=True)
    allow_anonymous: bool = Field(default=False)

    # Layout responsive (JSON pour chaque breakpoint)
    layout_mobile: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    layout_tablet: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    layout_desktop: Optional[dict] = Field(default=None, sa_column=Column(JSON))

    # Configuration
    auto_refresh: bool = Field(default=False)
    refresh_interval: RefreshIntervalEnum = Field(default=RefreshIntervalEnum.MANUAL)
    enable_filters: bool = Field(default=True)
    enable_export: bool = Field(default=True)
    enable_fullscreen: bool = Field(default=True)

    # Style & Thème
    theme: Optional[str] = Field(default=None, max_length=50)  # "light", "dark", "auto"
    custom_css: Optional[str] = Field(default=None, max_length=5000)

    # Métadonnées
    is_template: bool = Field(default=False)
    is_archived: bool = Field(default=False)
    tags: Optional[list] = Field(default=None, sa_column=Column(JSON))

    # Relations
    widgets: list["DashboardSystemWidget"] = Relationship(back_populates="dashboard", cascade_delete=True)
    author_id: Optional[UUID] = Field(default=None, foreign_key="users.id")


class DashboardSystemWidget(AbstractBaseModel, table=True):
    """Widget dans un dashboard"""
    __tablename__ = "dashboard_widgets"

    # Référence dashboard
    dashboard_id: UUID = Field(foreign_key="dashboards.id")

    # Métadonnées
    name: str = Field(max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    widget_type: WidgetTypeEnum

    # Position et taille (grid layout)
    position_x: int = Field(default=0, ge=0)
    position_y: int = Field(default=0, ge=0)
    width: int = Field(default=1, ge=1, le=12)  # Grille 12 colonnes
    height: int = Field(default=1, ge=1)
    min_width: int = Field(default=1, ge=1)
    min_height: int = Field(default=1, ge=1)
    max_width: Optional[int] = Field(default=None)
    max_height: Optional[int] = Field(default=None)

    # Ordre d'affichage
    z_index: int = Field(default=0)
    order: int = Field(default=0)

    # Source de données
    data_source_type: DataSourceTypeEnum
    data_source_config: dict = Field(sa_column=Column(JSON))  # Config spécifique à la source

    # Configuration du widget
    widget_config: dict = Field(default={}, sa_column=Column(JSON))  # Props spécifiques au widget

    # Style
    background_color: Optional[str] = Field(default=None, max_length=50)
    border_color: Optional[str] = Field(default=None, max_length=50)
    custom_css: Optional[str] = Field(default=None, max_length=2000)

    # Comportement
    is_visible: bool = Field(default=True)
    is_resizable: bool = Field(default=True)
    is_draggable: bool = Field(default=True)
    is_removable: bool = Field(default=True)

    # Rafraîchissement
    auto_refresh: bool = Field(default=False)
    refresh_interval: RefreshIntervalEnum = Field(default=RefreshIntervalEnum.MANUAL)

    # Cache
    enable_cache: bool = Field(default=True)
    cache_ttl: Optional[int] = Field(default=300)  # secondes

    # Relations
    dashboard: Dashboard = Relationship(back_populates="widgets")


class WidgetTemplate(AbstractBaseModel, table=True):
    """Template de widget réutilisable"""
    __tablename__ = "widget_templates"

    name: str = Field(max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    widget_type: WidgetTypeEnum
    category: Optional[str] = Field(default=None, max_length=100)  # "Analytics", "Operations", etc.

    # Configuration par défaut
    default_config: dict = Field(sa_column=Column(JSON))
    default_data_source: dict = Field(sa_column=Column(JSON))

    # Dimensions recommandées
    recommended_width: int = Field(default=4)
    recommended_height: int = Field(default=3)

    # Métadonnées
    icon: str = Field(default="LayoutDashboard", max_length=50)
    preview_image: Optional[str] = Field(default=None, max_length=500)
    is_public: bool = Field(default=True)
    tags: Optional[list] = Field(default=None, sa_column=Column(JSON))

    author_id: Optional[UUID] = Field(default=None, foreign_key="users.id")


class DashboardShare(AbstractBaseModel, table=True):
    """Partage de dashboard"""
    __tablename__ = "dashboard_shares"

    dashboard_id: UUID = Field(foreign_key="dashboards.id")
    shared_with_user_id: Optional[UUID] = Field(default=None, foreign_key="users.id")
    shared_with_role: Optional[str] = Field(default=None, max_length=100)
    shared_with_organization_id: Optional[UUID] = Field(default=None)

    # Permissions
    can_view: bool = Field(default=True)
    can_edit: bool = Field(default=False)
    can_delete: bool = Field(default=False)
    can_share: bool = Field(default=False)

    # Expiration
    expires_at: Optional[datetime] = None

    shared_by_user_id: UUID = Field(foreign_key="users.id")


class DashboardFavorite(AbstractBaseModel, table=True):
    """Dashboards favoris par utilisateur"""
    __tablename__ = "dashboard_favorites"

    dashboard_id: UUID = Field(foreign_key="dashboards.id")
    user_id: UUID = Field(foreign_key="users.id")
    order: int = Field(default=0)


class DashboardView(AbstractBaseModel, table=True):
    """Vues/Visites de dashboard (analytics)"""
    __tablename__ = "dashboard_views"

    dashboard_id: UUID = Field(foreign_key="dashboards.id")
    user_id: Optional[UUID] = Field(default=None, foreign_key="users.id")
    viewed_at: datetime
    duration_seconds: Optional[int] = Field(default=None)
    device_type: Optional[str] = Field(default=None, max_length=50)  # "mobile", "tablet", "desktop"
    ip_address: Optional[str] = Field(default=None, max_length=45)
