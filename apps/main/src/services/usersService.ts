/**
 * Users API service.
 */
import api from '@/lib/api'
import type { UserRead, UserCreate, UserEntity, PaginatedResponse, PaginationParams } from '@/types/api'

interface UserListParams extends PaginationParams {
  search?: string
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

  update: async (id: string, payload: Partial<UserCreate & { active?: boolean }>): Promise<UserRead> => {
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
}
