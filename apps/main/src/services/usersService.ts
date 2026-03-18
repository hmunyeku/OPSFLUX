/**
 * Users API service.
 */
import api from '@/lib/api'
import type { UserRead, UserCreate, PaginatedResponse, PaginationParams } from '@/types/api'

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
}
