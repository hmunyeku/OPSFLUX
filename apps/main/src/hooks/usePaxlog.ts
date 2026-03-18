/**
 * React Query hooks for PaxLog module.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { paxlogService } from '@/services/paxlogService'
import type {
  PaxProfileCreate,
  PaxProfileUpdate,
  PaxCredentialCreate,
  PaxCredentialValidate,
  CredentialTypeCreate,
  ComplianceMatrixCreate,
  AdsCreate,
  AdsUpdate,
  PaxIncidentCreate,
  PaxIncidentResolve,
} from '@/services/paxlogService'

// ── PAX Profiles ──

export function usePaxProfiles(params: { page?: number; page_size?: number; search?: string; status?: string; type?: string; company_id?: string } = {}) {
  return useQuery({
    queryKey: ['paxlog', 'profiles', params],
    queryFn: () => paxlogService.listProfiles(params),
  })
}

export function usePaxProfile(id: string) {
  return useQuery({
    queryKey: ['paxlog', 'profiles', id],
    queryFn: () => paxlogService.getProfile(id),
    enabled: !!id,
  })
}

export function useCreatePaxProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: PaxProfileCreate) => paxlogService.createProfile(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'profiles'] })
    },
  })
}

export function useUpdatePaxProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PaxProfileUpdate }) =>
      paxlogService.updateProfile(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'profiles'] })
    },
  })
}

// ── Credential Types ──

export function useCredentialTypes(category?: string) {
  return useQuery({
    queryKey: ['paxlog', 'credential-types', category],
    queryFn: () => paxlogService.listCredentialTypes(category),
  })
}

export function useCreateCredentialType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CredentialTypeCreate) => paxlogService.createCredentialType(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'credential-types'] })
    },
  })
}

// ── PAX Credentials ──

export function usePaxCredentials(profileId: string) {
  return useQuery({
    queryKey: ['paxlog', 'credentials', profileId],
    queryFn: () => paxlogService.listCredentials(profileId),
    enabled: !!profileId,
  })
}

export function useCreatePaxCredential() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ profileId, payload }: { profileId: string; payload: PaxCredentialCreate }) =>
      paxlogService.createCredential(profileId, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'credentials', vars.profileId] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'profiles'] })
    },
  })
}

export function useValidatePaxCredential() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ profileId, credentialId, payload }: { profileId: string; credentialId: string; payload: PaxCredentialValidate }) =>
      paxlogService.validateCredential(profileId, credentialId, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'credentials', vars.profileId] })
    },
  })
}

// ── Compliance ──

export function useComplianceMatrix(assetId?: string) {
  return useQuery({
    queryKey: ['paxlog', 'compliance-matrix', assetId],
    queryFn: () => paxlogService.listComplianceMatrix(assetId),
  })
}

export function useCreateComplianceEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ComplianceMatrixCreate) => paxlogService.createComplianceEntry(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'compliance-matrix'] })
    },
  })
}

export function useDeleteComplianceEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paxlogService.deleteComplianceEntry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'compliance-matrix'] })
    },
  })
}

export function useComplianceCheck(profileId: string, assetId: string) {
  return useQuery({
    queryKey: ['paxlog', 'compliance-check', profileId, assetId],
    queryFn: () => paxlogService.checkCompliance(profileId, assetId),
    enabled: !!profileId && !!assetId,
  })
}

// ── Avis de Séjour (AdS) ──

export function useAdsList(params: { page?: number; page_size?: number; status?: string; visit_category?: string; site_entry_asset_id?: string } = {}) {
  return useQuery({
    queryKey: ['paxlog', 'ads', params],
    queryFn: () => paxlogService.listAds(params),
  })
}

export function useAds(id: string) {
  return useQuery({
    queryKey: ['paxlog', 'ads', id],
    queryFn: () => paxlogService.getAds(id),
    enabled: !!id,
  })
}

export function useCreateAds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: AdsCreate) => paxlogService.createAds(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
    },
  })
}

export function useUpdateAds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AdsUpdate }) =>
      paxlogService.updateAds(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
    },
  })
}

export function useSubmitAds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paxlogService.submitAds(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
    },
  })
}

export function useCancelAds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paxlogService.cancelAds(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
    },
  })
}

export function useAdsPax(adsId: string) {
  return useQuery({
    queryKey: ['paxlog', 'ads', adsId, 'pax'],
    queryFn: () => paxlogService.listAdsPax(adsId),
    enabled: !!adsId,
  })
}

export function useAddPaxToAds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ adsId, paxId }: { adsId: string; paxId: string }) =>
      paxlogService.addPaxToAds(adsId, paxId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads', vars.adsId, 'pax'] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
    },
  })
}

export function useRemovePaxFromAds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ adsId, paxId }: { adsId: string; paxId: string }) =>
      paxlogService.removePaxFromAds(adsId, paxId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads', vars.adsId, 'pax'] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
    },
  })
}

// ── PAX Incidents ──

export function usePaxIncidents(params: { page?: number; page_size?: number; pax_id?: string; active_only?: boolean } = {}) {
  return useQuery({
    queryKey: ['paxlog', 'incidents', params],
    queryFn: () => paxlogService.listIncidents(params),
  })
}

export function useCreatePaxIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: PaxIncidentCreate) => paxlogService.createIncident(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'incidents'] })
    },
  })
}

export function useResolvePaxIncident() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PaxIncidentResolve }) =>
      paxlogService.resolveIncident(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'incidents'] })
    },
  })
}
