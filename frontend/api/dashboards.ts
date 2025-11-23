/**
 * Dashboard API - Real API integration (no mock data)
 */

import { apiClient } from "@/lib/api-client"

// Types based on backend models
export interface Dashboard {
  id: string
  name: string
  description: string | null
  version: string
  menu_parent: string
  menu_label: string
  menu_icon: string
  menu_order: number
  show_in_sidebar: boolean
  is_home_page: boolean
  is_public: boolean
  required_roles: string[] | null
  required_permissions: string[] | null
  auto_refresh: boolean
  refresh_interval: string
  enable_filters: boolean
  enable_export: boolean
  enable_fullscreen: boolean
  is_template: boolean
  is_archived: boolean
  tags: string[] | null
  author_id: string | null
  created_at: string
  updated_at: string
}

export interface DashboardWidget {
  id: string
  dashboard_id: string
  name: string
  description: string | null
  widget_type: string
  position_x: number
  position_y: number
  width: number
  height: number
  min_width: number
  min_height: number
  max_width: number | null
  max_height: number | null
  z_index: number
  order: number
  data_source_type: string
  data_source_config: Record<string, unknown>
  widget_config: Record<string, unknown>
  background_color: string | null
  border_color: string | null
  custom_css: string | null
  is_visible: boolean
  is_resizable: boolean
  is_draggable: boolean
  is_removable: boolean
  auto_refresh: boolean
  refresh_interval: string
  enable_cache: boolean
  cache_ttl: number | null
  created_at: string
  updated_at: string
}

export interface DashboardWithWidgets extends Dashboard {
  widgets: DashboardWidget[]
}

export interface DashboardsResponse {
  data: Dashboard[]
  count: number
}

export interface DashboardCreate {
  name: string
  description?: string
  menu_parent: string
  menu_label: string
  menu_icon?: string
  menu_order?: number
  show_in_sidebar?: boolean
  is_home_page?: boolean
  is_public?: boolean
  auto_refresh?: boolean
  refresh_interval?: string
  enable_filters?: boolean
  enable_export?: boolean
  enable_fullscreen?: boolean
  is_template?: boolean
  tags?: string[]
}

export interface DashboardUpdate {
  name?: string
  description?: string
  menu_parent?: string
  menu_label?: string
  menu_icon?: string
  menu_order?: number
  show_in_sidebar?: boolean
  is_home_page?: boolean
  is_public?: boolean
  auto_refresh?: boolean
  refresh_interval?: string
  enable_filters?: boolean
  enable_export?: boolean
  enable_fullscreen?: boolean
  is_template?: boolean
  is_archived?: boolean
  tags?: string[]
}

export interface WidgetCreate {
  dashboard_id: string
  name: string
  description?: string
  widget_type: string
  position_x?: number
  position_y?: number
  width?: number
  height?: number
  data_source_type: string
  data_source_config: Record<string, unknown>
  widget_config?: Record<string, unknown>
}

// API Functions
const API_BASE = "/api/v1/dashboards-system"

export const dashboardsApi = {
  // List all dashboards
  list: async (params?: {
    skip?: number
    limit?: number
    include_archived?: boolean
    menu_parent?: string
    search?: string
  }): Promise<DashboardsResponse> => {
    const searchParams = new URLSearchParams()
    if (params?.skip) searchParams.set("skip", String(params.skip))
    if (params?.limit) searchParams.set("limit", String(params.limit))
    if (params?.include_archived) searchParams.set("include_archived", "true")
    if (params?.menu_parent) searchParams.set("menu_parent", params.menu_parent)
    if (params?.search) searchParams.set("search", params.search)

    const query = searchParams.toString()
    return apiClient.get<DashboardsResponse>(`${API_BASE}/${query ? `?${query}` : ""}`)
  },

  // Get single dashboard with widgets
  get: async (id: string): Promise<DashboardWithWidgets> => {
    return apiClient.get<DashboardWithWidgets>(`${API_BASE}/${id}`)
  },

  // Create dashboard
  create: async (data: DashboardCreate): Promise<Dashboard> => {
    return apiClient.post<Dashboard>(`${API_BASE}/`, data)
  },

  // Update dashboard
  update: async (id: string, data: DashboardUpdate): Promise<Dashboard> => {
    return apiClient.patch<Dashboard>(`${API_BASE}/${id}`, data)
  },

  // Delete dashboard
  delete: async (id: string): Promise<void> => {
    return apiClient.delete<void>(`${API_BASE}/${id}`)
  },

  // Clone dashboard
  clone: async (id: string, name: string): Promise<Dashboard> => {
    return apiClient.post<Dashboard>(`${API_BASE}/clone`, {
      dashboard_id: id,
      new_name: name,
    })
  },

  // Toggle favorite
  toggleFavorite: async (id: string): Promise<{ is_favorite: boolean }> => {
    return apiClient.post<{ is_favorite: boolean }>(`${API_BASE}/${id}/favorite`)
  },

  // Get favorites
  getFavorites: async (): Promise<DashboardsResponse> => {
    return apiClient.get<DashboardsResponse>(`${API_BASE}/favorites`)
  },

  // Widgets
  widgets: {
    list: async (dashboardId: string): Promise<{ data: DashboardWidget[]; count: number }> => {
      return apiClient.get(`${API_BASE}/${dashboardId}/widgets`)
    },

    create: async (data: WidgetCreate): Promise<DashboardWidget> => {
      return apiClient.post<DashboardWidget>(`${API_BASE}/widgets`, data)
    },

    update: async (
      widgetId: string,
      data: Partial<DashboardWidget>
    ): Promise<DashboardWidget> => {
      return apiClient.patch<DashboardWidget>(`${API_BASE}/widgets/${widgetId}`, data)
    },

    delete: async (widgetId: string): Promise<void> => {
      return apiClient.delete<void>(`${API_BASE}/widgets/${widgetId}`)
    },
  },
}
