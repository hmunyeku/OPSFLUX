"""
OpsFlux Dashboard System Schemas
Schémas Pydantic pour validation API
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models_dashboards import (
    DataSourceTypeEnum,
    LayoutBreakpointEnum,
    MenuParentEnum,
    RefreshIntervalEnum,
    WidgetTypeEnum,
)


# ============================================================================
# WIDGET SCHEMAS
# ============================================================================

class WidgetBase(BaseModel):
    """Base widget schema"""
    name: str = Field(max_length=200)
    description: Optional[str] = None
    widget_type: WidgetTypeEnum
    position_x: int = Field(ge=0)
    position_y: int = Field(ge=0)
    width: int = Field(ge=1, le=12)
    height: int = Field(ge=1)
    min_width: int = Field(default=1, ge=1)
    min_height: int = Field(default=1, ge=1)
    max_width: Optional[int] = None
    max_height: Optional[int] = None
    z_index: int = Field(default=0)
    order: int = Field(default=0)
    data_source_type: DataSourceTypeEnum
    data_source_config: dict
    widget_config: dict = Field(default={})
    background_color: Optional[str] = None
    border_color: Optional[str] = None
    custom_css: Optional[str] = None
    is_visible: bool = Field(default=True)
    is_resizable: bool = Field(default=True)
    is_draggable: bool = Field(default=True)
    is_removable: bool = Field(default=True)
    auto_refresh: bool = Field(default=False)
    refresh_interval: RefreshIntervalEnum = Field(default=RefreshIntervalEnum.MANUAL)
    enable_cache: bool = Field(default=True)
    cache_ttl: Optional[int] = Field(default=300)


class WidgetCreate(WidgetBase):
    """Schema for creating a widget"""
    dashboard_id: UUID


class WidgetUpdate(BaseModel):
    """Schema for updating a widget"""
    name: Optional[str] = None
    description: Optional[str] = None
    widget_type: Optional[WidgetTypeEnum] = None
    position_x: Optional[int] = None
    position_y: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    min_width: Optional[int] = None
    min_height: Optional[int] = None
    max_width: Optional[int] = None
    max_height: Optional[int] = None
    z_index: Optional[int] = None
    order: Optional[int] = None
    data_source_type: Optional[DataSourceTypeEnum] = None
    data_source_config: Optional[dict] = None
    widget_config: Optional[dict] = None
    background_color: Optional[str] = None
    border_color: Optional[str] = None
    custom_css: Optional[str] = None
    is_visible: Optional[bool] = None
    is_resizable: Optional[bool] = None
    is_draggable: Optional[bool] = None
    is_removable: Optional[bool] = None
    auto_refresh: Optional[bool] = None
    refresh_interval: Optional[RefreshIntervalEnum] = None
    enable_cache: Optional[bool] = None
    cache_ttl: Optional[int] = None


class WidgetPublic(WidgetBase):
    """Public widget schema"""
    id: UUID
    dashboard_id: UUID
    created_at: datetime
    updated_at: datetime


class WidgetsPublic(BaseModel):
    """List of widgets"""
    data: list[WidgetPublic]
    count: int


# ============================================================================
# DASHBOARD SCHEMAS
# ============================================================================

class DashboardBase(BaseModel):
    """Base dashboard schema"""
    name: str = Field(max_length=200)
    description: Optional[str] = None
    version: str = Field(default="1.0", max_length=20)
    menu_parent: MenuParentEnum
    menu_label: str = Field(max_length=100)
    menu_icon: str = Field(default="LayoutDashboard", max_length=50)
    menu_order: int = Field(default=999)
    show_in_sidebar: bool = Field(default=True)
    is_home_page: bool = Field(default=False)
    is_public: bool = Field(default=False)
    required_roles: Optional[list[str]] = None
    required_permissions: Optional[list[str]] = None
    restricted_to_users: Optional[list[str]] = None
    restricted_to_organizations: Optional[list[str]] = None
    inherit_from_parent: bool = Field(default=True)
    allow_anonymous: bool = Field(default=False)
    layout_mobile: Optional[dict] = None
    layout_tablet: Optional[dict] = None
    layout_desktop: Optional[dict] = None
    auto_refresh: bool = Field(default=False)
    refresh_interval: RefreshIntervalEnum = Field(default=RefreshIntervalEnum.MANUAL)
    enable_filters: bool = Field(default=True)
    enable_export: bool = Field(default=True)
    enable_fullscreen: bool = Field(default=True)
    theme: Optional[str] = None
    custom_css: Optional[str] = None
    is_template: bool = Field(default=False)
    is_archived: bool = Field(default=False)
    tags: Optional[list[str]] = None


class DashboardCreate(DashboardBase):
    """Schema for creating a dashboard"""
    pass


class DashboardUpdate(BaseModel):
    """Schema for updating a dashboard"""
    name: Optional[str] = None
    description: Optional[str] = None
    version: Optional[str] = None
    menu_parent: Optional[MenuParentEnum] = None
    menu_label: Optional[str] = None
    menu_icon: Optional[str] = None
    menu_order: Optional[int] = None
    show_in_sidebar: Optional[bool] = None
    is_home_page: Optional[bool] = None
    is_public: Optional[bool] = None
    required_roles: Optional[list[str]] = None
    required_permissions: Optional[list[str]] = None
    restricted_to_users: Optional[list[str]] = None
    restricted_to_organizations: Optional[list[str]] = None
    inherit_from_parent: Optional[bool] = None
    allow_anonymous: Optional[bool] = None
    layout_mobile: Optional[dict] = None
    layout_tablet: Optional[dict] = None
    layout_desktop: Optional[dict] = None
    auto_refresh: Optional[bool] = None
    refresh_interval: Optional[RefreshIntervalEnum] = None
    enable_filters: Optional[bool] = None
    enable_export: Optional[bool] = None
    enable_fullscreen: Optional[bool] = None
    theme: Optional[str] = None
    custom_css: Optional[str] = None
    is_template: Optional[bool] = None
    is_archived: Optional[bool] = None
    tags: Optional[list[str]] = None


class DashboardPublic(DashboardBase):
    """Public dashboard schema"""
    id: UUID
    author_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime


class DashboardWithWidgets(DashboardPublic):
    """Dashboard with its widgets"""
    widgets: list[WidgetPublic] = []


class DashboardsPublic(BaseModel):
    """List of dashboards"""
    data: list[DashboardPublic]
    count: int


# ============================================================================
# WIDGET TEMPLATE SCHEMAS
# ============================================================================

class WidgetTemplateBase(BaseModel):
    """Base widget template schema"""
    name: str = Field(max_length=200)
    description: Optional[str] = None
    widget_type: WidgetTypeEnum
    category: Optional[str] = None
    default_config: dict
    default_data_source: dict
    recommended_width: int = Field(default=4)
    recommended_height: int = Field(default=3)
    icon: str = Field(default="LayoutDashboard", max_length=50)
    preview_image: Optional[str] = None
    is_public: bool = Field(default=True)
    tags: Optional[list[str]] = None


class WidgetTemplateCreate(WidgetTemplateBase):
    """Schema for creating a widget template"""
    pass


class WidgetTemplateUpdate(BaseModel):
    """Schema for updating a widget template"""
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    default_config: Optional[dict] = None
    default_data_source: Optional[dict] = None
    recommended_width: Optional[int] = None
    recommended_height: Optional[int] = None
    icon: Optional[str] = None
    preview_image: Optional[str] = None
    is_public: Optional[bool] = None
    tags: Optional[list[str]] = None


class WidgetTemplatePublic(WidgetTemplateBase):
    """Public widget template schema"""
    id: UUID
    author_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime


class WidgetTemplatesPublic(BaseModel):
    """List of widget templates"""
    data: list[WidgetTemplatePublic]
    count: int


# ============================================================================
# DASHBOARD SHARE SCHEMAS
# ============================================================================

class DashboardShareBase(BaseModel):
    """Base dashboard share schema"""
    dashboard_id: UUID
    shared_with_user_id: Optional[UUID] = None
    shared_with_role: Optional[str] = None
    shared_with_organization_id: Optional[UUID] = None
    can_view: bool = Field(default=True)
    can_edit: bool = Field(default=False)
    can_delete: bool = Field(default=False)
    can_share: bool = Field(default=False)
    expires_at: Optional[datetime] = None


class DashboardShareCreate(DashboardShareBase):
    """Schema for creating a dashboard share"""
    pass


class DashboardShareUpdate(BaseModel):
    """Schema for updating a dashboard share"""
    can_view: Optional[bool] = None
    can_edit: Optional[bool] = None
    can_delete: Optional[bool] = None
    can_share: Optional[bool] = None
    expires_at: Optional[datetime] = None


class DashboardSharePublic(DashboardShareBase):
    """Public dashboard share schema"""
    id: UUID
    shared_by_user_id: UUID
    created_at: datetime
    updated_at: datetime


class DashboardSharesPublic(BaseModel):
    """List of dashboard shares"""
    data: list[DashboardSharePublic]
    count: int


# ============================================================================
# NAVIGATION & MENU SCHEMAS
# ============================================================================

class MenuInfo(BaseModel):
    """Information about an OpsFlux menu"""
    id: str
    label: str
    icon: str
    description: str


class DashboardMenuItem(BaseModel):
    """Dashboard item in menu"""
    id: UUID
    label: str
    icon: str
    order: int
    is_home_page: bool


class MenuWithDashboards(MenuInfo):
    """Menu with its dashboards"""
    dashboards: list[DashboardMenuItem] = []


class NavigationStructure(BaseModel):
    """Complete navigation structure"""
    menus: list[MenuWithDashboards]


# ============================================================================
# DASHBOARD ANALYTICS SCHEMAS
# ============================================================================

class DashboardStats(BaseModel):
    """Dashboard statistics"""
    total_views: int
    unique_viewers: int
    avg_duration_seconds: float
    last_viewed_at: Optional[datetime] = None
    favorite_count: int


class DashboardViewCreate(BaseModel):
    """Create a dashboard view"""
    dashboard_id: UUID
    duration_seconds: Optional[int] = None
    device_type: Optional[str] = None


# ============================================================================
# DASHBOARD CLONE SCHEMAS
# ============================================================================

class DashboardClone(BaseModel):
    """Clone a dashboard"""
    source_dashboard_id: UUID
    new_name: str
    copy_widgets: bool = Field(default=True)
    menu_parent: Optional[MenuParentEnum] = None
