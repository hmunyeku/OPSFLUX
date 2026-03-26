/**
 * Assets API service — compatibility layer over ar_installations.
 *
 * The legacy /api/v1/assets endpoints now query ar_installations.
 * Full CRUD is via the Asset Registry service (/api/v1/asset-registry).
 */
import api from '@/lib/api'
import type { Asset, AssetTreeNode, PaginatedResponse, PaginationParams } from '@/types/api'

interface AssetListParams extends PaginationParams {
  search?: string
  status?: string
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
}
