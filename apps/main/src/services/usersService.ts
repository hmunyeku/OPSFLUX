/**
 * Users API service.
 */
import api from '@/lib/api'
import type { UserRead, UserCreate, UserUpdate, UserEntity, UserTierLinkRead, PaginatedResponse, PaginationParams } from '@/types/api'

interface UserListParams extends PaginationParams {
  search?: string
  active?: boolean
  user_type?: string
  mfa_enabled?: boolean
}

export const usersService = {
  list: async (params: UserListParams = {}): Promise<PaginatedResponse<UserRead>> => {
    const { data } = await api.get('/api/v1/users', { params })
    return data
  },

  get: async (id: string): Promise<UserRead> => {
    const { data } = await api.get(`/api/v1/users/${id}`)
    return data
  },

  create: async (payload: UserCreate): Promise<UserRead> => {
    const { data } = await api.post('/api/v1/users', payload)
    return data
  },

  update: async (id: string, payload: UserUpdate): Promise<UserRead> => {
    const { data } = await api.patch(`/api/v1/users/${id}`, payload)
    return data
  },

  /** Revoke all sessions for the current user (except current). */
  revokeAllSessions: async (): Promise<{ revoked_count: number }> => {
    const { data } = await api.post('/api/v1/sessions/revoke-all')
    return data
  },

  /** Get all entities the user belongs to, with groups and roles. */
  getUserEntities: async (userId: string): Promise<UserEntity[]> => {
    const { data } = await api.get(`/api/v1/users/${userId}/entities`)
    return data
  },

  /** Assign a user to an entity (creates membership in default group). */
  assignUserToEntity: async (userId: string, entityId: string): Promise<void> => {
    await api.post(`/api/v1/users/${userId}/entities`, { entity_id: entityId })
  },

  /** Remove a user from an entity (removes all group memberships). */
  removeUserFromEntity: async (userId: string, entityId: string): Promise<void> => {
    await api.delete(`/api/v1/users/${userId}/entities/${entityId}`)
  },

  /** Send a password reset email to a user. */
  sendPasswordReset: async (email: string): Promise<void> => {
    await api.post('/api/v1/auth/forgot-password', { email })
  },

  /** Get users statistics (total, active, online, etc.) */
  getStats: async (): Promise<{ total: number; active: number; inactive: number; online: number; mfa_count: number; locked_count: number }> => {
    const { data } = await api.get('/api/v1/users/stats/overview')
    return data
  },

  /** Get recent activity (latest created/modified users, groups, roles) */
  getRecentActivity: async (limit = 5): Promise<RecentActivityResponse> => {
    const { data } = await api.get('/api/v1/users/stats/recent', { params: { limit } })
    return data
  },

  // ── Tier Links (external company linking) ──

  /** Get all tier (company) links for a user. */
  getUserTierLinks: async (userId: string): Promise<UserTierLinkRead[]> => {
    const { data } = await api.get(`/api/v1/users/${userId}/tier-links`)
    return data
  },

  /** Link a user to a tier (company). */
  linkUserToTier: async (userId: string, tierId: string, role = 'viewer'): Promise<UserTierLinkRead> => {
    const { data } = await api.post(`/api/v1/users/${userId}/tier-links`, { tier_id: tierId, role })
    return data
  },

  /** Remove a user-tier link. */
  unlinkUserFromTier: async (userId: string, linkId: string): Promise<void> => {
    await api.delete(`/api/v1/users/${userId}/tier-links/${linkId}`)
  },

  /** Get profile completeness for a user. */
  getProfileCompleteness: async (userId: string): Promise<ProfileCompleteness> => {
    const { data } = await api.get(`/api/v1/users/${userId}/profile-completeness`)
    return data
  },

  /** Admin: upload avatar file for a specific user. */
  uploadUserAvatar: async (userId: string, file: File): Promise<UserRead> => {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post(`/api/v1/users/${userId}/avatar`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  /** Admin: set avatar from URL for a specific user. */
  setUserAvatarFromURL: async (userId: string, url: string): Promise<UserRead> => {
    const { data } = await api.post(`/api/v1/users/${userId}/avatar-url`, { url })
    return data
  },
}

export interface ProfileCompleteness {
  percentage: number
  filled: number
  total: number
  missing: { field: string; label: string }[]
}

// ── Types for recent activity ──────────────────────────────────
export interface RecentUserItem {
  id: string
  first_name: string
  last_name: string
  email: string
  avatar_url: string | null
  created_at: string
  updated_at: string
  action: 'created' | 'modified'
}

export interface RecentGroupItem {
  id: string
  name: string
  role_codes: string[]
  role_names: string[]
  member_count: number
  created_at: string
  updated_at: string
  action: 'created' | 'modified'
}

export interface RecentRoleItem {
  code: string
  name: string
  module: string | null
  created_at: string
  updated_at: string
  action: 'created' | 'modified'
}

export interface RecentActivityResponse {
  users: RecentUserItem[]
  groups: RecentGroupItem[]
  roles: RecentRoleItem[]
}
