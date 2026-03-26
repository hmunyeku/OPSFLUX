/**
 * React Query hooks for assets (compatibility layer over ar_installations).
 */
import { useQuery } from '@tanstack/react-query'
import { assetsService } from '@/services/assetsService'

export function useAssets(params: { page?: number; page_size?: number; search?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ['assets', params],
    queryFn: () => assetsService.list(params),
  })
}

export function useAssetTree() {
  return useQuery({
    queryKey: ['assets', 'tree'],
    queryFn: () => assetsService.tree(),
  })
}

export function useAsset(id: string) {
  return useQuery({
    queryKey: ['assets', id],
    queryFn: () => assetsService.get(id),
    enabled: !!id,
  })
}
