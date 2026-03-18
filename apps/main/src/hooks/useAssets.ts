/**
 * React Query hooks for assets.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assetsService } from '@/services/assetsService'
import type { AssetCreate } from '@/types/api'

export function useAssets(params: { page?: number; page_size?: number; type?: string; parent_id?: string; search?: string } = {}) {
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

export function useCreateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: AssetCreate) => assetsService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
    },
  })
}

export function useUpdateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<AssetCreate> }) =>
      assetsService.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
    },
  })
}

export function useArchiveAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => assetsService.archive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] })
    },
  })
}
