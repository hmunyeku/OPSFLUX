/**
 * Types TypeScript pour le système de dashboards et widgets
 */

// ==================== WIDGET ====================

export type WidgetCategory =
  | "analytics"
  | "monitoring"
  | "charts"
  | "lists"
  | "stats"
  | "notifications"
  | "custom"

export interface Widget {
  id: string
  widget_type: string
  name: string
  description?: string
  module_name: string
  category?: WidgetCategory
  icon?: string
  required_permission?: string
  is_active: boolean
  default_config: Record<string, any>
  default_size: {
    w: number
    h: number
    minW?: number
    minH?: number
    maxW?: number
    maxH?: number
  }
  created_at: string
  updated_at: string
}

export interface WidgetCreate {
  widget_type: string
  name: string
  description?: string
  module_name: string
  category?: string
  icon?: string
  required_permission?: string
  is_active?: boolean
  default_config?: Record<string, any>
  default_size?: {
    w: number
    h: number
    minW?: number
    minH?: number
    maxW?: number
    maxH?: number
  }
}

// ==================== DASHBOARD ====================

export type DashboardScope = "global" | "group" | "role" | "user"

export interface Dashboard {
  id: string
  name: string
  description?: string
  is_default: boolean
  is_mandatory: boolean
  scope?: DashboardScope
  scope_id?: string
  is_active: boolean
  is_public: boolean
  order: number
  menu_key?: string
  is_default_in_menu: boolean
  layout_config: {
    column: number
    cellHeight: number
    margin?: number
    [key: string]: any
  }
  created_at: string
  updated_at: string
  created_by_id?: string
  widgets?: DashboardWidgetWithWidget[]
}

export interface DashboardCreate {
  name: string
  description?: string
  is_default?: boolean
  is_mandatory?: boolean
  scope?: DashboardScope
  scope_id?: string
  is_active?: boolean
  is_public?: boolean
  order?: number
  menu_key?: string
  is_default_in_menu?: boolean
  layout_config?: {
    column?: number
    cellHeight?: number
    margin?: number
  }
  widgets?: Array<{
    widget_id: string
    x?: number
    y?: number
    w?: number
    h?: number
    config?: Record<string, any>
  }>
}

export interface DashboardUpdate {
  name?: string
  description?: string
  is_default?: boolean
  is_active?: boolean
  is_public?: boolean
  order?: number
  menu_key?: string
  is_default_in_menu?: boolean
  layout_config?: {
    column?: number
    cellHeight?: number
    margin?: number
  }
}

// ==================== DASHBOARD WIDGET ====================

export interface DashboardWidget {
  id: string
  dashboard_id: string
  widget_id: string
  x: number
  y: number
  w: number
  h: number
  is_visible: boolean
  order: number
  config: Record<string, any>
}

export interface DashboardWidgetWithWidget extends DashboardWidget {
  widget?: Widget
}

export interface DashboardWidgetCreate {
  widget_id: string
  x?: number
  y?: number
  w?: number
  h?: number
  config?: Record<string, any>
  order?: number
}

export interface DashboardLayoutUpdate {
  widgets: Array<{
    id: string
    x: number
    y: number
    w: number
    h: number
  }>
}

// ==================== USER DASHBOARD ====================

export interface UserDashboard {
  id: string
  user_id: string
  dashboard_id: string
  is_pinned: boolean
  is_favorite: boolean
  is_default: boolean
  order: number
  custom_layout?: Record<string, any>
  last_viewed_at?: string
  dashboard?: Dashboard
}

// ==================== API RESPONSES ====================

export interface UserDashboardsResponse {
  my_dashboards: Dashboard[]
  mandatory_dashboards: Dashboard[]
  shared_dashboards: Dashboard[]
  total_count: number
}

export interface WidgetsResponse {
  data: Widget[]
  count: number
}

export interface DashboardsResponse {
  data: Dashboard[]
  count: number
}

// ==================== GRIDSTACK TYPES ====================

export interface GridStackItem {
  id: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
}

export interface GridStackOptions {
  column?: number
  cellHeight?: number | string
  margin?: number | string
  float?: boolean
  resizable?: {
    handles?: string
  }
  acceptWidgets?: boolean
  removable?: boolean
  staticGrid?: boolean
  disableOneColumnMode?: boolean
}
