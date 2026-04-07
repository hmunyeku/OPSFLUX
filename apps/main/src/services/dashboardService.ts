/**
 * Dashboard API service.
 * Tabs, widgets, widget catalog, widget data, import/export.
 */
import api from '@/lib/api'
import type { DashboardStats } from '@/types/api'

// ── Types ──────────────────────────────────────────────────────

export interface WidgetPosition {
  x: number
  y: number
  w: number
  h: number
}

export interface DashboardWidget {
  id: string
  type: string
  title: string
  description?: string | null
  config: Record<string, unknown>
  position: WidgetPosition
  permissions?: string[] | null
  options?: Record<string, unknown> | null
}

export interface DashboardTab {
  id: string
  entity_id?: string
  name: string
  tab_order: number
  widgets: DashboardWidget[]
  is_mandatory: boolean
  is_closable: boolean
  target_role: string | null
  target_module: string | null
  icon: string | null
  created_by?: string | null
  created_at?: string
}

export interface UserDashboardTab {
  id: string
  user_id?: string
  entity_id?: string
  name: string
  tab_order: number
  widgets: DashboardWidget[]
  created_at?: string
}

export interface Dashboard {
  id: string
  name: string
  description: string | null
  is_public: boolean
  widgets: DashboardWidget[]
  layout_desktop: Record<string, unknown> | null
  layout_tablet: Record<string, unknown> | null
  layout_mobile: Record<string, unknown> | null
  global_filters: Record<string, unknown> | null
  owner_id: string | null
  nav_menu_label: string | null
  nav_menu_icon: string | null
  created_at: string
  updated_at: string
}

export interface WidgetCatalogEntry {
  id: string
  type: string
  title: string
  description: string
  permissions: string[]
  default_config: Record<string, unknown>
  source_module: string
  roles: string[]
}

export interface WidgetDataRequest {
  widget_id: string
  widget_type: string
  config: Record<string, unknown>
  filters?: Record<string, unknown>
}

export interface WidgetDataResponse {
  data: unknown[]
  meta?: Record<string, unknown>
}

export interface ActivityEntry {
  id: string
  action: string
  resource_type: string
  resource_id: string
  details: Record<string, unknown>
  actor_id: string
  actor_name?: string
  created_at: string
}

export interface PendingItem {
  id: string
  type: string
  title: string
  definition_name?: string
  current_state: string
  created_at: string
  link?: string
}

// ── Service ────────────────────────────────────────────────────

const BASE = '/api/v1/dashboard'

export const dashboardService = {
  // ── Stats ──

  getStats: async (): Promise<DashboardStats> => {
    try {
      const { data } = await api.get(`${BASE}/widgets/stats`)
      return data
    } catch {
      // Fallback: fetch page_size=1 from each endpoint
      const [assets, users, tiers] = await Promise.all([
        api.get('/api/v1/assets', { params: { page: 1, page_size: 1 } }),
        api.get('/api/v1/users', { params: { page: 1, page_size: 1 } }),
        api.get('/api/v1/tiers', { params: { page: 1, page_size: 1 } }),
      ])
      return {
        assets_count: assets.data.total ?? 0,
        users_count: users.data.total ?? 0,
        tiers_count: tiers.data.total ?? 0,
        active_workflows: 0,
        recent_activity_count: 0,
      }
    }
  },

  // ── Tabs ──

  getTabs: async (module?: string): Promise<{ mandatory: DashboardTab[]; personal: UserDashboardTab[] }> => {
    const { data } = await api.get(`${BASE}/tabs`, {
      params: module ? { module } : undefined,
    })
    // Backend returns a flat array with is_mandatory flag — split into mandatory/personal
    if (Array.isArray(data)) {
      const mandatory = data.filter((t: Record<string, unknown>) => t.is_mandatory)
      const personal = data.filter((t: Record<string, unknown>) => !t.is_mandatory)
      return { mandatory, personal }
    }
    return data
  },

  createPersonalTab: async (payload: {
    name: string
    widgets?: DashboardWidget[]
    icon?: string
  }): Promise<UserDashboardTab> => {
    const { data } = await api.post(`${BASE}/tabs`, payload)
    return data
  },

  updatePersonalTab: async (
    id: string,
    payload: Partial<{ name: string; widgets: DashboardWidget[]; tab_order: number; icon: string }>,
  ): Promise<UserDashboardTab> => {
    const { data } = await api.put(`${BASE}/tabs/${id}`, payload)
    return data
  },

  deletePersonalTab: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/tabs/${id}`)
  },

  // ── Widget Catalog ──

  getWidgetCatalog: async (): Promise<WidgetCatalogEntry[]> => {
    try {
      const { data } = await api.get('/api/v1/dashboards/widget-catalog')
      return data
    } catch {
      // Return empty catalog if endpoint not ready
      return []
    }
  },

  // ── Widget Data ──

  getWidgetData: async (request: WidgetDataRequest): Promise<WidgetDataResponse> => {
    const { data } = await api.post('/api/v1/dashboards/widget-data', request)
    return data
  },

  executeWidgetSQL: async (query: string, params?: Record<string, unknown>): Promise<unknown> => {
    const { data } = await api.post('/api/v1/dashboards/widget-sql', { query, params })
    return data
  },

  // ── Activity / Pending ──

  getActivity: async (): Promise<ActivityEntry[]> => {
    const { data } = await api.get(`${BASE}/widgets/activity`)
    return data
  },

  getPending: async (): Promise<PendingItem[]> => {
    const { data } = await api.get(`${BASE}/widgets/pending`)
    return data
  },

  // ── Dashboard CRUD ──

  listDashboards: async (params?: { page?: number; page_size?: number }): Promise<Dashboard[]> => {
    const { data } = await api.get(`${BASE}/dashboards`, { params })
    return data
  },

  getDashboard: async (id: string): Promise<Dashboard> => {
    const { data } = await api.get(`${BASE}/dashboards/${id}`)
    return data
  },

  createDashboard: async (payload: Partial<Dashboard>): Promise<Dashboard> => {
    const { data } = await api.post(`${BASE}/dashboards`, payload)
    return data
  },

  updateDashboard: async (id: string, payload: Partial<Dashboard>): Promise<Dashboard> => {
    const { data } = await api.put(`${BASE}/dashboards/${id}`, payload)
    return data
  },

  deleteDashboard: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/dashboards/${id}`)
  },

  // ── Home Dashboard ──

  getHomeDashboard: async (): Promise<Dashboard | null> => {
    try {
      const { data } = await api.get(`${BASE}/home`)
      return data
    } catch {
      return null
    }
  },

  setHomeDashboard: async (
    dashboard_id: string,
    scope_type: string,
    scope_value?: string,
  ): Promise<void> => {
    await api.put(`${BASE}/home`, { dashboard_id, scope_type, scope_value })
  },

  // ── Import / Export ──

  exportDashboard: async (id: string): Promise<object> => {
    const { data } = await api.get(`${BASE}/dashboards/${id}/export`)
    return data
  },

  importDashboard: async (payload: object): Promise<Dashboard> => {
    const { data } = await api.post(`${BASE}/dashboards/import`, payload)
    return data
  },
}
