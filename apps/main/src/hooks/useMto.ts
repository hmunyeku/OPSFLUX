/**
 * React Query hooks for the MTO module (rapprochement MTO <-> stock/catalogue SAP).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '@/lib/api'

export interface MtoBatch {
  id: string
  project_id: string | null
  filename: string | null
  label: string | null
  status: string
  created_at: string | null
}

export interface MtoChild {
  line_num?: string
  row?: number
  mark?: string
  tag?: string
  diameter?: string
  description?: string
  qte?: number
  length?: number
}

export interface MtoGroup {
  id: string
  batch_id: string
  mto_key: string
  article_code: string | null
  designation_sap: string | null
  famille: string | null
  diameter: string | null
  besoin: number
  unite: string | null
  unit_check: boolean
  unit_detail: string | null
  dispo: number
  emplacements: string | null
  statut: string | null
  confidence: string | null
  found: boolean
  verification_status: string
  nb_lignes: number
  children: MtoChild[]
}

export interface CatalogItem {
  id: string
  code: string
  designation: string
  famille: string | null
}

export function useMtoBatches() {
  return useQuery({
    queryKey: ['mto-batches'],
    queryFn: async () => (await api.get<MtoBatch[]>('/api/v1/mto/batches')).data,
  })
}

export function useMtoGroups(batchId: string | null) {
  return useQuery({
    queryKey: ['mto-groups', batchId],
    queryFn: async () => (await api.get<MtoGroup[]>(`/api/v1/mto/batches/${batchId}/groups`)).data,
    enabled: !!batchId,
  })
}

export function useConsolidate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (batchId: string) =>
      (await api.post(`/api/v1/mto/batches/${batchId}/consolidate`)).data,
    onSuccess: (_data, batchId) => {
      qc.invalidateQueries({ queryKey: ['mto-groups', batchId] })
    },
  })
}

export function useValidateGroup(batchId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (groupId: string) =>
      (await api.post<MtoGroup>(`/api/v1/mto/groups/${groupId}/validate`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mto-groups', batchId] }),
  })
}

export function useCorrectGroup(batchId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ groupId, articleCode }: { groupId: string; articleCode: string }) =>
      (await api.post<MtoGroup>(`/api/v1/mto/groups/${groupId}/correct`, { article_code: articleCode })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mto-groups', batchId] }),
  })
}

export function useCatalogSearch(q: string) {
  return useQuery({
    queryKey: ['mto-catalogue', q],
    queryFn: async () =>
      (await api.get<CatalogItem[]>('/api/v1/mto/catalogue', { params: { q } })).data,
    enabled: q.trim().length >= 2,
  })
}
