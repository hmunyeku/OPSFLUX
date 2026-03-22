/**
 * React Query hooks for generic external references (polymorphic).
 * Uses /api/v1/references/external/{owner_type}/{owner_id} endpoints.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { ExternalReference, ExternalReferenceCreate } from '@/types/api'

const externalRefService = {
  list: async (ownerType: string, ownerId: string): Promise<ExternalReference[]> => {
    const { data } = await api.get(`/api/v1/references/external/${ownerType}/${ownerId}`)
    return data
  },
  create: async (ownerType: string, ownerId: string, payload: ExternalReferenceCreate): Promise<ExternalReference> => {
    const { data } = await api.post(`/api/v1/references/external/${ownerType}/${ownerId}`, payload)
    return data
  },
  remove: async (refId: string): Promise<void> => {
    await api.delete(`/api/v1/references/external/${refId}`)
  },
}

export function useExternalRefs(ownerType: string, ownerId: string | undefined) {
  return useQuery({
    queryKey: ['external-refs', ownerType, ownerId],
    queryFn: () => externalRefService.list(ownerType, ownerId!),
    enabled: !!ownerId,
  })
}

export function useCreateExternalRef() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ownerType, ownerId, payload }: { ownerType: string; ownerId: string; payload: ExternalReferenceCreate }) =>
      externalRefService.create(ownerType, ownerId, payload),
    onSuccess: (_, { ownerType, ownerId }) => {
      qc.invalidateQueries({ queryKey: ['external-refs', ownerType, ownerId] })
    },
  })
}

export function useDeleteExternalRef() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { ownerType: string; ownerId: string; refId: string }) =>
      externalRefService.remove(vars.refId),
    onSuccess: (_, { ownerType, ownerId }) => {
      qc.invalidateQueries({ queryKey: ['external-refs', ownerType, ownerId] })
    },
  })
}
