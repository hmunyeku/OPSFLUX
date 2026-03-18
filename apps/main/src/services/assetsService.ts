/**
 * Assets API service.
 */
import api from '@/lib/api'
import type { Asset, AssetCreate, AssetTreeNode, PaginatedResponse, PaginationParams } from '@/types/api'

interface AssetListParams extends PaginationParams {
  type?: string
  parent_id?: string
  search?: string
  active_only?: boolean
}

export const assetsService = {
  list: async (params: AssetListParams = {}): Promise<PaginatedResponse<Asset>> => {
    const { data } = await api.get('/api/v1/assets', { params })
    return data
  },

  tree: async (): Promise<AssetTreeNode[]> => {
    const { data } = await api.get('/api/v1/assets/tree')
    return data
  },

  get: async (id: string): Promise<Asset> => {
    const { data } = await api.get(`/api/v1/assets/${id}`)
    return data
  },

  create: async (payload: AssetCreate): Promise<Asset> => {
    const { data } = await api.post('/api/v1/assets', payload)
    return data
  },

  update: async (id: string, payload: Partial<AssetCreate>): Promise<Asset> => {
    const { data } = await api.patch(`/api/v1/assets/${id}`, payload)
    return data
  },

  archive: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/assets/${id}`)
  },
}
