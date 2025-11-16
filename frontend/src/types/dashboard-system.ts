/**
 * OpsFlux Dashboard System Types
 * Types TypeScript pour le nouveau système de dashboards personnalisables
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum MenuParentEnum {
  PILOTAGE = "pilotage",
  TIERS = "tiers",
  PROJECTS = "projects",
  ORGANIZER = "organizer",
  REDACTEUR = "redacteur",
  POBVUE = "pobvue",
  TRAVELWIZ = "travelwiz",
  MOCVUE = "mocvue",
  CLEANVUE = "cleanvue",
  POWERTRACE = "powertrace",
}

export enum WidgetTypeEnum {
  STATS_CARD = "stats_card",
  LINE_CHART = "line_chart",
  BAR_CHART = "bar_chart",
  PIE_CHART = "pie_chart",
  AREA_CHART = "area_chart",
  TABLE = "table",
  LIST = "list",
  PROGRESS_CARD = "progress_card",
  GAUGE = "gauge",
  MAP = "map",
  CALENDAR = "calendar",
  TIMELINE = "timeline",
  KANBAN = "kanban",
  HEATMAP = "heatmap",
  METRIC = "metric",
  CUSTOM = "custom",
}

export enum DataSourceTypeEnum {
  API = "api",
  SQL = "sql",
  STATIC = "static",
  REALTIME = "realtime",
  WEBSOCKET = "websocket",
}

export enum RefreshIntervalEnum {
  REALTIME = "realtime",
  FIVE_SECONDS = "5s",
  TEN_SECONDS = "10s",
  THIRTY_SECONDS = "30s",
  ONE_MINUTE = "1m",
  FIVE_MINUTES = "5m",
  TEN_MINUTES = "10m",
  THIRTY_MINUTES = "30m",
  ONE_HOUR = "1h",
  MANUAL = "manual",
}

export enum LayoutBreakpointEnum {
  MOBILE = "mobile",
  TABLET = "tablet",
  DESKTOP = "desktop",
}

// ============================================================================
// WIDGET TYPES
// ============================================================================

export interface WidgetBase {
  name: string;
  description?: string;
  widget_type: WidgetTypeEnum;
  position_x: number;
  position_y: number;
  width: number; // 1-12 colonnes
  height: number;
  min_width?: number;
  min_height?: number;
  max_width?: number;
  max_height?: number;
  z_index?: number;
  order?: number;
  data_source_type: DataSourceTypeEnum;
  data_source_config: Record<string, any>;
  widget_config?: Record<string, any>;
  background_color?: string;
  border_color?: string;
  custom_css?: string;
  is_visible?: boolean;
  is_resizable?: boolean;
  is_draggable?: boolean;
  is_removable?: boolean;
  auto_refresh?: boolean;
  refresh_interval?: RefreshIntervalEnum;
  enable_cache?: boolean;
  cache_ttl?: number;
}

export interface WidgetCreate extends WidgetBase {
  dashboard_id: string;
}

export interface WidgetUpdate extends Partial<Omit<WidgetBase, "widget_type" | "data_source_type">> {
  widget_type?: WidgetTypeEnum;
  data_source_type?: DataSourceTypeEnum;
}

export interface WidgetPublic extends WidgetBase {
  id: string;
  dashboard_id: string;
  created_at: string;
  updated_at: string;
}

export interface WidgetsPublic {
  data: WidgetPublic[];
  count: number;
}

// ============================================================================
// DASHBOARD TYPES
// ============================================================================

export interface DashboardBase {
  name: string;
  description?: string;
  version?: string;
  menu_parent: MenuParentEnum;
  menu_label: string;
  menu_icon?: string; // Icône Lucide React
  menu_order?: number;
  show_in_sidebar?: boolean;
  is_home_page?: boolean;
  is_public?: boolean;
  required_roles?: string[];
  required_permissions?: string[];
  restricted_to_users?: string[];
  restricted_to_organizations?: string[];
  inherit_from_parent?: boolean;
  allow_anonymous?: boolean;
  layout_mobile?: Record<string, any>;
  layout_tablet?: Record<string, any>;
  layout_desktop?: Record<string, any>;
  auto_refresh?: boolean;
  refresh_interval?: RefreshIntervalEnum;
  enable_filters?: boolean;
  enable_export?: boolean;
  enable_fullscreen?: boolean;
  theme?: string;
  custom_css?: string;
  is_template?: boolean;
  is_archived?: boolean;
  tags?: string[];
}

export interface DashboardCreate extends DashboardBase {}

export interface DashboardUpdate extends Partial<DashboardBase> {}

export interface DashboardPublic extends DashboardBase {
  id: string;
  author_id?: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardWithWidgets extends DashboardPublic {
  widgets: WidgetPublic[];
}

export interface DashboardsPublic {
  data: DashboardPublic[];
  count: number;
}

// ============================================================================
// WIDGET TEMPLATE TYPES
// ============================================================================

export interface WidgetTemplateBase {
  name: string;
  description?: string;
  widget_type: WidgetTypeEnum;
  category?: string;
  default_config: Record<string, any>;
  default_data_source: Record<string, any>;
  recommended_width?: number;
  recommended_height?: number;
  icon?: string;
  preview_image?: string;
  is_public?: boolean;
  tags?: string[];
}

export interface WidgetTemplateCreate extends WidgetTemplateBase {}

export interface WidgetTemplateUpdate extends Partial<Omit<WidgetTemplateBase, "widget_type">> {
  widget_type?: WidgetTypeEnum;
}

export interface WidgetTemplatePublic extends WidgetTemplateBase {
  id: string;
  author_id?: string;
  created_at: string;
  updated_at: string;
}

export interface WidgetTemplatesPublic {
  data: WidgetTemplatePublic[];
  count: number;
}

// ============================================================================
// DASHBOARD SHARE TYPES
// ============================================================================

export interface DashboardShareBase {
  dashboard_id: string;
  shared_with_user_id?: string;
  shared_with_role?: string;
  shared_with_organization_id?: string;
  can_view?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
  can_share?: boolean;
  expires_at?: string;
}

export interface DashboardShareCreate extends DashboardShareBase {}

export interface DashboardShareUpdate extends Partial<Omit<DashboardShareBase, "dashboard_id">> {}

export interface DashboardSharePublic extends DashboardShareBase {
  id: string;
  shared_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardSharesPublic {
  data: DashboardSharePublic[];
  count: number;
}

// ============================================================================
// NAVIGATION & MENU TYPES
// ============================================================================

export interface MenuInfo {
  id: string;
  label: string;
  icon: string;
  description: string;
}

export interface DashboardMenuItem {
  id: string;
  label: string;
  icon: string;
  order: number;
  is_home_page: boolean;
}

export interface MenuWithDashboards extends MenuInfo {
  dashboards: DashboardMenuItem[];
}

export interface NavigationStructure {
  menus: MenuWithDashboards[];
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

export interface DashboardStats {
  total_views: number;
  unique_viewers: number;
  avg_duration_seconds: number;
  last_viewed_at?: string;
  favorite_count: number;
}

export interface DashboardViewCreate {
  dashboard_id: string;
  duration_seconds?: number;
  device_type?: string;
}

// ============================================================================
// CLONE TYPES
// ============================================================================

export interface DashboardClone {
  source_dashboard_id: string;
  new_name: string;
  copy_widgets?: boolean;
  menu_parent?: MenuParentEnum;
}

// ============================================================================
// GRID LAYOUT TYPES
// ============================================================================

export interface GridLayout {
  i: string; // widget ID
  x: number;
  y: number;
  w: number; // width in grid units
  h: number; // height in grid units
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  static?: boolean; // non-draggable, non-resizable
}

export interface ResponsiveLayouts {
  mobile?: GridLayout[];
  tablet?: GridLayout[];
  desktop?: GridLayout[];
}
