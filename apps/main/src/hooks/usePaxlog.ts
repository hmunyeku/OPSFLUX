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
  AdsStayChangeRequest,
  AdsUpdate,
  AdsImputationCreate,
  AdsExternalLinkCreate,
  PaxIncidentCreate,
  PaxIncidentResolve,
  RotationCycleCreate,
  RotationCycleUpdate,
  StayProgramCreate,
  ProfileTypeCreate,
  MissionNoticeCreate,
  MissionNoticeModifyRequest,
  MissionPreparationTaskUpdate,
  MissionVisaFollowupUpdate,
  MissionAllowanceRequestUpdate,
  MissionNoticeUpdate,
  AddPaxBody,
  AdsPaxDecision,
  AdsWaitlistPriorityUpdate,
  AdsBoardingPassengerUpdate,
} from '@/services/paxlogService'

// ── PAX Profiles ──

export function usePaxProfiles(params: { page?: number; page_size?: number; search?: string; status?: string; type?: string; company_id?: string } = {}) {
  return useQuery({
    queryKey: ['paxlog', 'profiles', params],
    queryFn: () => paxlogService.listProfiles(params),
  })
}

export function usePaxGroups(params: { page?: number; page_size?: number; search?: string; company_id?: string } = {}) {
  return useQuery({
    queryKey: ['paxlog', 'pax-groups', params],
    queryFn: () => paxlogService.listPaxGroups(params),
  })
}

export function usePaxProfile(id: string, paxSource: 'user' | 'contact' | undefined) {
  return useQuery({
    queryKey: ['paxlog', 'profiles', id, paxSource],
    queryFn: () => paxlogService.getProfile(id, paxSource as 'user' | 'contact'),
    enabled: !!id && !!paxSource,
  })
}

export function usePaxProfileSitePresenceHistory(id: string, paxSource: 'user' | 'contact' | undefined) {
  return useQuery({
    queryKey: ['paxlog', 'profiles', id, 'site-presence-history', paxSource],
    queryFn: () => paxlogService.getProfileSitePresenceHistory(id, paxSource as 'user' | 'contact'),
    enabled: !!id && !!paxSource,
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

export function useComplianceStats() {
  return useQuery({
    queryKey: ['paxlog', 'compliance-stats'],
    queryFn: () => paxlogService.getComplianceStats(),
  })
}

export function useExpiringCredentials(daysAhead?: number) {
  return useQuery({
    queryKey: ['paxlog', 'expiring-credentials', daysAhead],
    queryFn: () => paxlogService.getExpiringCredentials(daysAhead),
  })
}

// ── Avis de Sejour (AdS) ──

export function useAdsList(params: { page?: number; page_size?: number; status?: string; visit_category?: string; site_entry_asset_id?: string; search?: string; requester_id?: string; scope?: 'my' | 'all'; date_from?: string; date_to?: string } = {}) {
  return useQuery({
    queryKey: ['paxlog', 'ads', params],
    queryFn: () => paxlogService.listAds(params),
  })
}

export function useAdsValidationQueue(params: { page?: number; page_size?: number } = {}) {
  return useQuery({
    queryKey: ['paxlog', 'ads-validation-queue', params],
    queryFn: () => paxlogService.listAdsValidationQueue(params),
  })
}

export function useAdsWaitlist(params: { page?: number; page_size?: number; search?: string; planner_activity_id?: string; site_entry_asset_id?: string } = {}) {
  return useQuery({
    queryKey: ['paxlog', 'ads-waitlist', params],
    queryFn: () => paxlogService.listAdsWaitlist(params),
  })
}

export function useAds(id: string) {
  return useQuery({
    queryKey: ['paxlog', 'ads', id],
    queryFn: () => paxlogService.getAds(id),
    enabled: !!id,
  })
}

export function useAdsBoardingContext(token: string | undefined) {
  return useQuery({
    queryKey: ['paxlog', 'ads-boarding-scan', token],
    queryFn: () => paxlogService.getAdsBoardingContext(token as string),
    enabled: !!token,
    refetchInterval: 30_000,
  })
}

export function useUpdateAdsBoardingPassenger(token: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ passengerId, payload }: { passengerId: string; payload: AdsBoardingPassengerUpdate }) =>
      paxlogService.updateAdsBoardingPassenger(token as string, passengerId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads-boarding-scan', token] })
    },
  })
}

export function useUpdateAdsWaitlistPriority() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ entryId, payload }: { entryId: string; payload: AdsWaitlistPriorityUpdate }) =>
      paxlogService.updateAdsWaitlistPriority(entryId, payload),
    onSuccess: (_data) => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads-waitlist'] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
    },
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
      // Cascade: ADS modification may change forecast (spec §5.1)
      qc.invalidateQueries({ queryKey: ['planner', 'capacity-heatmap'] })
      qc.invalidateQueries({ queryKey: ['planner', 'capacity'] })
    },
  })
}

export function useSubmitAds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paxlogService.submitAds(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads-waitlist'] })
    },
  })
}

export function useCancelAds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paxlogService.cancelAds(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads-waitlist'] })
      // Cascade: cancelled AdS changes Planner forecast (spec §5.1)
      qc.invalidateQueries({ queryKey: ['planner', 'capacity-heatmap'] })
      qc.invalidateQueries({ queryKey: ['planner', 'capacity'] })
      qc.invalidateQueries({ queryKey: ['planner', 'gantt'] })
    },
  })
}

export function useStartAdsProgress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paxlogService.startAdsProgress(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
    },
  })
}

export function useApproveAds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paxlogService.approveAds(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
      // Cascade: approved AdS affects Planner forecast (spec §5.1)
      qc.invalidateQueries({ queryKey: ['planner', 'capacity-heatmap'] })
      qc.invalidateQueries({ queryKey: ['planner', 'capacity'] })
    },
  })
}

export function useDecideAdsPax() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ adsId, entryId, payload }: { adsId: string; entryId: string; payload: AdsPaxDecision }) =>
      paxlogService.decideAdsPax(adsId, entryId, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads-waitlist'] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads', vars.adsId] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads-pax', vars.adsId] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads-events', vars.adsId] })
    },
  })
}

export function useRejectAds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => paxlogService.rejectAds(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads-waitlist'] })
    },
  })
}

export function useRequestReviewAds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => paxlogService.requestReviewAds(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
    },
  })
}

export function useRequestAdsStayChange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AdsStayChangeRequest }) =>
      paxlogService.requestAdsStayChange(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
    },
  })
}

export function useResubmitAds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => paxlogService.resubmitAds(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
    },
  })
}

export function useCompleteAds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paxlogService.completeAds(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
    },
  })
}

export function useManualDepartureAds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => paxlogService.manualDepartureAds(id, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
    },
  })
}

export function useAdsEvents(adsId: string) {
  return useQuery({
    queryKey: ['paxlog', 'ads', adsId, 'events'],
    queryFn: () => paxlogService.listAdsEvents(adsId),
    enabled: !!adsId,
  })
}

export function useAdsPdf() {
  return useMutation({
    mutationFn: async (id: string) => {
      const popup = window.open('', '_blank')
      if (popup) {
        popup.document.write('<html><body style="font-family: sans-serif; padding: 16px;">Chargement du PDF...</body></html>')
        popup.document.close()
      }
      const blob = await paxlogService.getAdsPdf(id)
      const url = URL.createObjectURL(blob)
      if (popup && !popup.closed) popup.location.href = url
      else window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    },
  })
}

export function useAvmPdf() {
  return useMutation({
    mutationFn: async (id: string) => {
      const popup = window.open('', '_blank')
      if (popup) {
        popup.document.write('<html><body style="font-family: sans-serif; padding: 16px;">Chargement du PDF...</body></html>')
        popup.document.close()
      }
      const blob = await paxlogService.getAvmPdf(id)
      const url = URL.createObjectURL(blob)
      if (popup && !popup.closed) popup.location.href = url
      else window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
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
    mutationFn: ({ adsId, entryId }: { adsId: string; entryId: string }) =>
      paxlogService.removePaxFromAds(adsId, entryId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads', vars.adsId, 'pax'] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads-waitlist'] })
    },
  })
}

/** Add a PAX by user_id or contact_id */
export function useAddPaxToAdsV2() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ adsId, body }: { adsId: string; body: AddPaxBody }) =>
      paxlogService.addPaxToAdsV2(adsId, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads', vars.adsId, 'pax'] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads'] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'profiles'] })
    },
  })
}

/** Search PAX candidates (profiles + users + contacts) */
export function usePaxCandidates(search: string) {
  return useQuery({
    queryKey: ['paxlog', 'candidates', search],
    queryFn: () => paxlogService.searchPaxCandidates(search),
    enabled: search.length >= 1,
    staleTime: 10_000,
  })
}

// ── AdS Imputations ──

export function useAdsImputations(adsId: string) {
  return useQuery({
    queryKey: ['paxlog', 'ads', adsId, 'imputations'],
    queryFn: () => paxlogService.getAdsImputations(adsId),
    enabled: !!adsId,
  })
}

export function useAdsImputationSuggestion(adsId: string) {
  return useQuery({
    queryKey: ['paxlog', 'ads', adsId, 'imputation-suggestion'],
    queryFn: () => paxlogService.getAdsImputationSuggestion(adsId),
    enabled: !!adsId,
  })
}

export function useAddImputation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ adsId, payload }: { adsId: string; payload: AdsImputationCreate }) =>
      paxlogService.addImputation(adsId, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads', vars.adsId, 'imputations'] })
    },
  })
}

export function useDeleteImputation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ adsId, imputationId }: { adsId: string; imputationId: string }) =>
      paxlogService.deleteImputation(adsId, imputationId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads', vars.adsId, 'imputations'] })
    },
  })
}

// ── AdS External Links ──

export function useCreateExternalLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ adsId, payload }: { adsId: string; payload: AdsExternalLinkCreate }) =>
      paxlogService.createExternalLink(adsId, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads', vars.adsId] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'ads', vars.adsId, 'external-links'] })
    },
  })
}

export function useAdsExternalLinks(adsId: string) {
  return useQuery({
    queryKey: ['paxlog', 'ads', adsId, 'external-links'],
    queryFn: () => paxlogService.listExternalLinks(adsId),
    enabled: !!adsId,
  })
}

// ── PAX Incidents / Signalements ──

export function usePaxIncidents(params: { page?: number; page_size?: number; user_id?: string; contact_id?: string; company_id?: string; pax_group_id?: string; asset_id?: string; severity?: string; active_only?: boolean } = {}) {
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

// ── Rotation Cycles ──

export function useRotationCycles(params: { page?: number; page_size?: number; user_id?: string; contact_id?: string; site_asset_id?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ['paxlog', 'rotation-cycles', params],
    queryFn: () => paxlogService.listRotationCycles(params),
  })
}

export function useCreateRotationCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: RotationCycleCreate) => paxlogService.createRotationCycle(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'rotation-cycles'] })
    },
  })
}

export function useUpdateRotationCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RotationCycleUpdate }) =>
      paxlogService.updateRotationCycle(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'rotation-cycles'] })
    },
  })
}

export function useEndRotationCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paxlogService.endRotationCycle(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'rotation-cycles'] })
    },
  })
}

// ── Stay Programs ──

export function useStayPrograms(params: { page?: number; page_size?: number; ads_id?: string; user_id?: string; contact_id?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ['paxlog', 'stay-programs', params],
    queryFn: () => paxlogService.listStayPrograms(params),
  })
}

export function useCreateStayProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: StayProgramCreate) => paxlogService.createStayProgram(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'stay-programs'] })
    },
  })
}

export function useSubmitStayProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paxlogService.submitStayProgram(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'stay-programs'] })
    },
  })
}

export function useApproveStayProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paxlogService.approveStayProgram(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'stay-programs'] })
    },
  })
}

// ── Profile Types ──

export function useProfileTypes() {
  return useQuery({
    queryKey: ['paxlog', 'profile-types'],
    queryFn: () => paxlogService.listProfileTypes(),
  })
}

export function useCreateProfileType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ProfileTypeCreate) => paxlogService.createProfileType(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'profile-types'] })
    },
  })
}

export function usePaxProfileTypes(paxId: string) {
  return useQuery({
    queryKey: ['paxlog', 'profiles', paxId, 'profile-types'],
    queryFn: () => paxlogService.getPaxProfileTypes(paxId),
    enabled: !!paxId,
  })
}

export function useAssignProfileType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ paxId, profileTypeId }: { paxId: string; profileTypeId: string }) =>
      paxlogService.assignProfileType(paxId, profileTypeId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'profiles', vars.paxId, 'profile-types'] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'profiles'] })
    },
  })
}

export function useHabilitationMatrix(profileTypeId?: string) {
  return useQuery({
    queryKey: ['paxlog', 'habilitation-matrix', profileTypeId],
    queryFn: () => paxlogService.getHabilitationMatrix(profileTypeId),
  })
}

// ── Avis de Mission (AVM) ──

export function useAvmList(params: { page?: number; page_size?: number; search?: string; status?: string; mission_type?: string; scope?: 'my' | 'all' } = {}) {
  return useQuery({
    queryKey: ['paxlog', 'avm', params],
    queryFn: () => paxlogService.listAvm(params),
  })
}

export function useAvm(id: string) {
  return useQuery({
    queryKey: ['paxlog', 'avm', id],
    queryFn: () => paxlogService.getAvm(id),
    enabled: !!id,
  })
}

export function useCreateAvm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: MissionNoticeCreate) => paxlogService.createAvm(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'avm'] })
    },
  })
}

export function useUpdateAvm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: MissionNoticeUpdate }) =>
      paxlogService.updateAvm(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'avm'] })
    },
  })
}

export function useModifyAvm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: MissionNoticeModifyRequest }) =>
      paxlogService.modifyAvm(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'avm'] })
    },
  })
}

export function useSubmitAvm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paxlogService.submitAvm(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'avm'] })
    },
  })
}

export function useApproveAvm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paxlogService.approveAvm(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'avm'] })
    },
  })
}

export function useCompleteAvm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paxlogService.completeAvm(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'avm'] })
    },
  })
}

export function useCancelAvm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => paxlogService.cancelAvm(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'avm'] })
    },
  })
}

export function useUpdateAvmPreparationTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ avmId, taskId, payload }: { avmId: string; taskId: string; payload: MissionPreparationTaskUpdate }) =>
      paxlogService.updateAvmPreparationTask(avmId, taskId, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'avm'] })
      qc.invalidateQueries({ queryKey: ['paxlog', 'avm', vars.avmId] })
    },
  })
}

export function useUpdateAvmVisaFollowup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ avmId, followupId, payload }: { avmId: string; followupId: string; payload: MissionVisaFollowupUpdate }) =>
      paxlogService.updateAvmVisaFollowup(avmId, followupId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'avm'] })
    },
  })
}

export function useUpdateAvmAllowanceRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ avmId, requestId, payload }: { avmId: string; requestId: string; payload: MissionAllowanceRequestUpdate }) =>
      paxlogService.updateAvmAllowanceRequest(avmId, requestId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paxlog', 'avm'] })
    },
  })
}
