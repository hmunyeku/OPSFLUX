/**
 * React Query hooks for tiers (companies) + contacts + identifiers + blocks + refs.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { tiersService } from '@/services/tiersService'
import type {
  TierCreate, TierContactCreate, TierContactUpdate,
  TierBlockCreate, ExternalReferenceCreate, TierContactPromoteUserRequest,
} from '@/types/api'

// ── Tiers ──

export function useTiers(params: {
  page?: number
  page_size?: number
  search?: string
  type?: string
  active?: boolean
  country?: string
  legal_form?: string
  industry?: string
  registration_number?: string
  city?: string
  is_blocked?: boolean
} = {}) {
  return useQuery({
    queryKey: ['tiers', params],
    queryFn: () => tiersService.list(params),
  })
}

export function useTier(id: string) {
  return useQuery({
    queryKey: ['tiers', id],
    queryFn: () => tiersService.get(id),
    enabled: !!id,
  })
}

export function useCreateTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TierCreate) => tiersService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tiers'] })
    },
  })
}

export function useUpdateTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<TierCreate> }) =>
      tiersService.update(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['tiers'] })
      qc.invalidateQueries({ queryKey: ['tiers', id] })
    },
  })
}

export function useArchiveTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tiersService.archive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tiers'] })
    },
  })
}

export interface BulkArchiveSkipped {
  id: string
  reason: 'not_found' | 'forbidden' | 'already_archived'
}

export interface BulkArchiveResult {
  archived: number
  skipped: BulkArchiveSkipped[]
}

export function useBulkArchiveTiers() {
  const qc = useQueryClient()
  return useMutation<BulkArchiveResult, unknown, string[]>({
    mutationFn: (ids: string[]) => tiersService.bulkArchive(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tiers'] })
    },
  })
}

export interface TierAuditLogFilters {
  actions?: string[]
  since?: string
  until?: string
}

export function useTierAuditLog(
  tierId: string | undefined,
  limit = 50,
  filters: TierAuditLogFilters = {},
) {
  return useQuery({
    queryKey: ['tier-audit-log', tierId, limit, filters],
    queryFn: () => tiersService.listAuditLog(tierId!, limit, filters),
    enabled: !!tierId,
  })
}

// ── Contacts ──

function invalidateTierContactCompliance(qc: QueryClient, contactId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['compliance-check', 'tier_contact', contactId] }),
    qc.invalidateQueries({ queryKey: ['compliance-records'] }),
    qc.invalidateQueries({ queryKey: ['compliance-matrix'] }),
    qc.invalidateQueries({ queryKey: ['compliance-kpis'] }),
  ])
}

function refetchActiveTierContactCompliance(qc: QueryClient, contactId: string) {
  return Promise.all([
    qc.refetchQueries({ queryKey: ['compliance-check', 'tier_contact', contactId], type: 'active' }),
    qc.refetchQueries({ queryKey: ['compliance-records'], type: 'active' }),
  ])
}

export function useTierContact(tierId: string | undefined, contactId: string | undefined) {
  return useQuery({
    queryKey: ['tier-contacts', tierId, contactId],
    queryFn: () => tiersService.getContact(tierId!, contactId!),
    enabled: !!tierId && !!contactId,
  })
}

export function useGlobalTierContact(contactId: string | undefined) {
  return useQuery({
    queryKey: ['global-tier-contact', contactId],
    queryFn: () => tiersService.getGlobalContact(contactId!),
    enabled: !!contactId,
  })
}

export function useTierContacts(tierId: string | undefined) {
  return useQuery({
    queryKey: ['tier-contacts', tierId],
    queryFn: () => tiersService.listContacts(tierId!),
    enabled: !!tierId,
  })
}

export function useTierContactCount(tierId: string | undefined) {
  return useQuery({
    queryKey: ['tier-contacts', tierId, 'count'],
    queryFn: () => tiersService.countContacts(tierId!),
    enabled: !!tierId,
  })
}

export function useCreateTierContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tierId, payload }: { tierId: string; payload: TierContactCreate }) =>
      tiersService.createContact(tierId, payload),
    onSuccess: async (contact, { tierId }) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['tier-contacts', tierId] }),
        qc.invalidateQueries({ queryKey: ['all-tier-contacts'] }),
      ])
      if (contact.job_position_id) {
        await invalidateTierContactCompliance(qc, contact.id)
      }
    },
  })
}

export function useUpdateTierContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tierId, contactId, payload }: { tierId: string; contactId: string; payload: TierContactUpdate }) =>
      tiersService.updateContact(tierId, contactId, payload),
    onSuccess: async (contact, { tierId, contactId, payload }) => {
      qc.setQueryData(['tier-contacts', tierId, contactId], contact)
      qc.setQueryData(['global-tier-contact', contactId], (current: unknown) => {
        if (!current || typeof current !== 'object') return current
        return { ...current, ...contact }
      })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['tier-contacts', tierId] }),
        qc.invalidateQueries({ queryKey: ['tier-contacts', tierId, contactId] }),
        qc.invalidateQueries({ queryKey: ['all-tier-contacts'] }),
      ])
      if ('job_position_id' in payload) {
        await invalidateTierContactCompliance(qc, contactId)
        await refetchActiveTierContactCompliance(qc, contactId)
      }
    },
  })
}

export function useDeleteTierContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tierId, contactId }: { tierId: string; contactId: string }) =>
      tiersService.deleteContact(tierId, contactId),
    onSuccess: (_, { tierId }) => {
      qc.invalidateQueries({ queryKey: ['tier-contacts', tierId] })
    },
  })
}

export function usePromoteTierContactToUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tierId, contactId, payload }: { tierId: string; contactId: string; payload?: TierContactPromoteUserRequest }) =>
      tiersService.promoteContactToUser(tierId, contactId, payload),
    onSuccess: (_, { tierId, contactId }) => {
      qc.invalidateQueries({ queryKey: ['tier-contacts', tierId] })
      qc.invalidateQueries({ queryKey: ['tier-contacts', tierId, contactId] })
      qc.invalidateQueries({ queryKey: ['all-tier-contacts'] })
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

// ── All contacts (cross-company) ──

export function useAllTierContacts(params: {
  page?: number
  page_size?: number
  search?: string
  tier_id?: string
  tier?: string
  department?: string
  position?: string
  job_position?: string
  email?: string
  phone?: string
  is_primary?: boolean
  linked_user?: boolean
} = {}) {
  return useQuery({
    queryKey: ['all-tier-contacts', params],
    queryFn: () => tiersService.listAllContacts(params),
  })
}

// ── Identifiers — now in useUserSubModels.ts (useLegalIdentifiers, polymorphic) ──

// ── Blocks (blocking/unblocking) ──

export function useTierBlocks(tierId: string | undefined) {
  return useQuery({
    queryKey: ['tier-blocks', tierId],
    queryFn: () => tiersService.listBlocks(tierId!),
    enabled: !!tierId,
  })
}

export function useBlockTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tierId, payload }: { tierId: string; payload: TierBlockCreate }) =>
      tiersService.blockTier(tierId, payload),
    onSuccess: (_, { tierId }) => {
      qc.invalidateQueries({ queryKey: ['tier-blocks', tierId] })
      qc.invalidateQueries({ queryKey: ['tiers'] })
      qc.invalidateQueries({ queryKey: ['tiers', tierId] })
    },
  })
}

export function useUnblockTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tierId, payload }: { tierId: string; payload: TierBlockCreate }) =>
      tiersService.unblockTier(tierId, payload),
    onSuccess: (_, { tierId }) => {
      qc.invalidateQueries({ queryKey: ['tier-blocks', tierId] })
      qc.invalidateQueries({ queryKey: ['tiers'] })
      qc.invalidateQueries({ queryKey: ['tiers', tierId] })
    },
  })
}

// ── External References ──

export function useTierExternalRefs(tierId: string | undefined) {
  return useQuery({
    queryKey: ['tier-external-refs', tierId],
    queryFn: () => tiersService.listExternalRefs(tierId!),
    enabled: !!tierId,
  })
}

export function useCreateTierExternalRef() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tierId, payload }: { tierId: string; payload: ExternalReferenceCreate }) =>
      tiersService.createExternalRef(tierId, payload),
    onSuccess: (_, { tierId }) => {
      qc.invalidateQueries({ queryKey: ['tier-external-refs', tierId] })
      qc.invalidateQueries({ queryKey: ['tiers', tierId] })
    },
  })
}

export function useDeleteTierExternalRef() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tierId, refId }: { tierId: string; refId: string }) =>
      tiersService.deleteExternalRef(tierId, refId),
    onSuccess: (_, { tierId }) => {
      qc.invalidateQueries({ queryKey: ['tier-external-refs', tierId] })
      qc.invalidateQueries({ queryKey: ['tiers', tierId] })
    },
  })
}
