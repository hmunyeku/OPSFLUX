/**
 * Announcement service — CRUD + dismiss for announcements.
 */
import api from '@/lib/api'
import type { PaginatedResponse } from '@/types/api'

export interface Announcement {
  id: string
  entity_id: string | null
  title: string
  body: string
  body_html: string | null
  priority: 'info' | 'warning' | 'critical' | 'maintenance'
  target_type: 'all' | 'entity' | 'role' | 'module' | 'user'
  target_value: string | null
  display_location: 'dashboard' | 'login' | 'banner' | 'modal' | 'logout' | 'all'
  published_at: string | null
  expires_at: string | null
  send_email: boolean
  email_sent_at: string | null
  sender_id: string
  active: boolean
  pinned: boolean
  created_at: string
  updated_at: string
  sender_name: string | null
  is_read?: boolean
}

export interface AnnouncementCreate {
  title: string
  body: string
  body_html?: string | null
  priority?: string
  target_type?: string
  target_value?: string | null
  display_location?: string
  published_at?: string | null
  expires_at?: string | null
  send_email?: boolean
  pinned?: boolean
}

export interface AnnouncementUpdate {
  title?: string
  body?: string
  priority?: string
  active?: boolean
  pinned?: boolean
  expires_at?: string | null
}

export const announcementService = {
  list: async (params: { page?: number; page_size?: number; active_only?: boolean } = {}): Promise<PaginatedResponse<Announcement>> => {
    const { data } = await api.get('/api/v1/messaging/announcements', { params })
    return data
  },

  create: async (body: AnnouncementCreate): Promise<Announcement> => {
    const { data } = await api.post('/api/v1/messaging/announcements', body)
    return data
  },

  update: async (id: string, body: AnnouncementUpdate): Promise<Announcement> => {
    const { data } = await api.patch(`/api/v1/messaging/announcements/${id}`, body)
    return data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/messaging/announcements/${id}`)
  },

  dismiss: async (id: string): Promise<void> => {
    await api.post(`/api/v1/messaging/announcements/${id}/dismiss`)
  },
}
