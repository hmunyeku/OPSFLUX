/**
 * React Query hooks for tiers (companies) + contacts + identifiers + blocks + refs + SAP import.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tiersService } from '@/services/tiersService'
import type {
  TierCreate, TierContactCreate, TierContactUpdate,
  TierIdentifierCreate, TierIdentifierUpdate,
  TierBlockCreate, ExternalReferenceCreate,
} from '@/types/api'

// ── Tiers ──

export function useTiers(params: { page?: number; page_size?: number; search?: string; type?: string } = {}) {
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tiers'] })
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

// ── Contacts ──

export function useTierContact(tierId: string | undefined, contactId: string | undefined) {
  return useQuery({
    queryKey: ['tier-contacts', tierId, contactId],
    queryFn: () => tiersService.getContact(tierId!, contactId!),
    enabled: !!tierId && !!contactId,
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
    onSuccess: (_, { tierId }) => {
      qc.invalidateQueries({ queryKey: ['tier-contacts', tierId] })
    },
  })
}

export function useUpdateTierContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tierId, contactId, payload }: { tierId: string; contactId: string; payload: TierContactUpdate }) =>
      tiersService.updateContact(tierId, contactId, payload),
    onSuccess: (_, { tierId }) => {
      qc.invalidateQueries({ queryKey: ['tier-contacts', tierId] })
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

// ── All contacts (cross-company) ──

export function useAllTierContacts(params: { page?: number; page_size?: number; search?: string; tier_id?: string; department?: string; is_primary?: boolean } = {}) {
  return useQuery({
    queryKey: ['all-tier-contacts', params],
    queryFn: () => tiersService.listAllContacts(params),
  })
}

// ── Identifiers (legal/fiscal IDs) ──

export function useTierIdentifiers(tierId: string | undefined) {
  return useQuery({
    queryKey: ['tier-identifiers', tierId],
    queryFn: () => tiersService.listIdentifiers(tierId!),
    enabled: !!tierId,
  })
}

export function useCreateTierIdentifier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tierId, payload }: { tierId: string; payload: TierIdentifierCreate }) =>
      tiersService.createIdentifier(tierId, payload),
    onSuccess: (_, { tierId }) => {
      qc.invalidateQueries({ queryKey: ['tier-identifiers', tierId] })
    },
  })
}

export function useUpdateTierIdentifier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tierId, identId, payload }: { tierId: string; identId: string; payload: TierIdentifierUpdate }) =>
      tiersService.updateIdentifier(tierId, identId, payload),
    onSuccess: (_, { tierId }) => {
      qc.invalidateQueries({ queryKey: ['tier-identifiers', tierId] })
    },
  })
}

export function useDeleteTierIdentifier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tierId, identId }: { tierId: string; identId: string }) =>
      tiersService.deleteIdentifier(tierId, identId),
    onSuccess: (_, { tierId }) => {
      qc.invalidateQueries({ queryKey: ['tier-identifiers', tierId] })
    },
  })
}

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
    },
  })
}

// ── SAP Import ──

export function useImportSap() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => tiersService.importSap(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tiers'] })
    },
  })
}
