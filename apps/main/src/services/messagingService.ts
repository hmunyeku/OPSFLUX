/**
 * Messaging API service — announcements, login events, security rules.
 */
import api from '@/lib/api'
import type { PaginatedResponse, PaginationParams } from '@/types/api'

// ── Types ──────────────────────────────────────────────────────

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
  is_read: boolean
}

export interface AnnouncementCreate {
  title: string
  body: string
  body_html?: string
  priority?: string
  target_type?: string
  target_value?: string
  display_location?: string
  published_at?: string
  expires_at?: string
  send_email?: boolean
  pinned?: boolean
}

export interface AnnouncementUpdate {
  title?: string
  body?: string
  body_html?: string
  priority?: string
  target_type?: string
  target_value?: string
  display_location?: string
  published_at?: string
  expires_at?: string
  send_email?: boolean
  pinned?: boolean
  active?: boolean
}

export interface LoginEvent {
  id: string
  user_id: string | null
  email: string
  ip_address: string
  user_agent: string | null
  browser: string | null
  os: string | null
  device_type: string
  country: string | null
  country_code: string | null
  city: string | null
  success: boolean
  failure_reason: string | null
  suspicious: boolean
  suspicious_reasons: Record<string, unknown> | null
  blocked: boolean
  blocked_reason: string | null
  mfa_used: boolean
  created_at: string
}

export interface LoginEventStats {
  total: number
  successful: number
  failed: number
  blocked: number
  suspicious: number
  unique_ips: number
  top_failure_reasons: Array<{ reason: string; count: number }>
  attempts_by_hour: Array<{ hour: string; count: number }>
}

export interface SecurityRule {
  id: string
  entity_id: string | null
  rule_type: string
  name: string
  description: string | null
  config: Record<string, unknown>
  enabled: boolean
  priority: number
  created_by: string
  created_at: string
  updated_at: string
}

export interface SecurityRuleCreate {
  rule_type: string
  name: string
  description?: string
  config: Record<string, unknown>
  enabled?: boolean
  priority?: number
}

export interface SecurityRuleUpdate {
  name?: string
  description?: string
  config?: Record<string, unknown>
  enabled?: boolean
  priority?: number
}

// ── Service ────────────────────────────────────────────────────

export const messagingService = {
  // ── Announcements ──

  listAnnouncements: async (params: PaginationParams & {
    priority?: string
    display_location?: string
    active_only?: boolean
  } = {}): Promise<PaginatedResponse<Announcement>> => {
    const { data } = await api.get('/api/v1/messaging/announcements', { params })
    return data
  },

  listPublicAnnouncements: async (display_location = 'login'): Promise<Announcement[]> => {
    const { data } = await api.get('/api/v1/messaging/announcements/public', {
      params: { display_location },
    })
    return data
  },

  createAnnouncement: async (payload: AnnouncementCreate): Promise<Announcement> => {
    const { data } = await api.post('/api/v1/messaging/announcements', payload)
    return data
  },

  updateAnnouncement: async (id: string, payload: AnnouncementUpdate): Promise<Announcement> => {
    const { data } = await api.patch(`/api/v1/messaging/announcements/${id}`, payload)
    return data
  },

  deleteAnnouncement: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/messaging/announcements/${id}`)
  },

  dismissAnnouncement: async (id: string): Promise<void> => {
    await api.post(`/api/v1/messaging/announcements/${id}/dismiss`)
  },

  // ── Login Events ──

  listLoginEvents: async (params: PaginationParams & {
    user_id?: string
    email?: string
    ip_address?: string
    success?: boolean
    suspicious?: boolean
    blocked?: boolean
    date_from?: string
    date_to?: string
  } = {}): Promise<PaginatedResponse<LoginEvent>> => {
    const { data } = await api.get('/api/v1/messaging/login-events', { params })
    return data
  },

  getLoginEventStats: async (days = 7): Promise<LoginEventStats> => {
    const { data } = await api.get('/api/v1/messaging/login-events/stats', {
      params: { days },
    })
    return data
  },

  listMyLoginEvents: async (params: PaginationParams = {}): Promise<PaginatedResponse<LoginEvent>> => {
    const { data } = await api.get('/api/v1/messaging/login-events/my', { params })
    return data
  },

  // ── Security Rules ──

  listSecurityRules: async (): Promise<SecurityRule[]> => {
    const { data } = await api.get('/api/v1/messaging/security-rules')
    return data
  },

  createSecurityRule: async (payload: SecurityRuleCreate): Promise<SecurityRule> => {
    const { data } = await api.post('/api/v1/messaging/security-rules', payload)
    return data
  },

  updateSecurityRule: async (id: string, payload: SecurityRuleUpdate): Promise<SecurityRule> => {
    const { data } = await api.patch(`/api/v1/messaging/security-rules/${id}`, payload)
    return data
  },

  deleteSecurityRule: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/messaging/security-rules/${id}`)
  },
}
