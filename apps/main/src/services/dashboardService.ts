/**
 * Dashboard API service.
 * Stats fetched from list endpoints (page_size=1 for efficiency) + dashboard-specific endpoints.
 */
import api from '@/lib/api'
import type { DashboardStats } from '@/types/api'

// ── Extended types ──

export interface DashboardWidget {
  type: string
  title: string
  config: Record<string, unknown>
  position: { x: number; y: number; w: number; h: number }
}

export interface DashboardTab {
  id: string
  entity_id: string
  name: string
  is_mandatory: boolean
  target_role: string | null
  tab_order: number
  widgets: DashboardWidget[]
  created_by: string | null
  created_at: string
}

export interface UserDashboardTab {
  id: string
  user_id: string
  entity_id: string
  name: string
  tab_order: number
  widgets: DashboardWidget[]
  created_at: string
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

// ── Service ──

export const dashboardService = {
  getStats: async (): Promise<DashboardStats> => {
    // Fetch from dedicated endpoint if available, fallback to individual counts
    try {
      const { data } = await api.get('/api/v1/dashboard/widgets/stats')
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
      }
    }
  },

  // ── Tabs ──

  getTabs: async (): Promise<{ mandatory: DashboardTab[]; personal: UserDashboardTab[] }> => {
    const { data } = await api.get('/api/v1/dashboard/tabs')
    return data
  },

  createPersonalTab: async (payload: { name: string; widgets?: DashboardWidget[] }): Promise<UserDashboardTab> => {
    const { data } = await api.post('/api/v1/dashboard/tabs', payload)
    return data
  },

  updatePersonalTab: async (id: string, payload: Partial<{ name: string; widgets: DashboardWidget[]; tab_order: number }>): Promise<UserDashboardTab> => {
    const { data } = await api.put(`/api/v1/dashboard/tabs/${id}`, payload)
    return data
  },

  deletePersonalTab: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/dashboard/tabs/${id}`)
  },

  // ── Widget data ──

  getActivity: async (): Promise<ActivityEntry[]> => {
    const { data } = await api.get('/api/v1/dashboard/widgets/activity')
    return data
  },

  getPending: async (): Promise<PendingItem[]> => {
    const { data } = await api.get('/api/v1/dashboard/widgets/pending')
    return data
  },
}
