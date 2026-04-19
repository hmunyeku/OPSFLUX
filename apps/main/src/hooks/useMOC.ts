/**
 * React Query hooks for the MOC module.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  mocService,
  type MOCCreatePayload,
  type MOCExecutionAccordPayload,
  type MOCListFilters,
  type MOCSiteAssignmentCreatePayload,
  type MOCTransitionPayload,
  type MOCUpdatePayload,
  type MOCValidationUpsertPayload,
} from '@/services/mocService'

const keys = {
  all: ['moc'] as const,
  list: (filters: MOCListFilters) => [...keys.all, 'list', filters] as const,
  detail: (id: string) => [...keys.all, 'detail', id] as const,
  stats: () => [...keys.all, 'stats'] as const,
  fsm: () => [...keys.all, 'fsm'] as const,
}

export function useMOCList(filters: MOCListFilters = {}) {
  return useQuery({
    queryKey: keys.list(filters),
    queryFn: () => mocService.list(filters),
    placeholderData: (prev) => prev,
  })
}

export function useMOC(id: string | null | undefined) {
  return useQuery({
    queryKey: keys.detail(id ?? 'none'),
    queryFn: () => mocService.get(id as string),
    enabled: !!id,
  })
}

export function useMOCStats() {
  return useQuery({
    queryKey: keys.stats(),
    queryFn: () => mocService.stats(),
    staleTime: 30_000,
  })
}

export function useMOCFsm() {
  return useQuery({
    queryKey: keys.fsm(),
    queryFn: () => mocService.fsm(),
    staleTime: 5 * 60_000,
  })
}

export function useCreateMOC() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: MOCCreatePayload) => mocService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all })
    },
  })
}

export function useUpdateMOC() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; payload: MOCUpdatePayload }) =>
      mocService.update(args.id, args.payload),
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: keys.detail(args.id) })
      qc.invalidateQueries({ queryKey: [...keys.all, 'list'] })
      qc.invalidateQueries({ queryKey: keys.stats() })
    },
  })
}

export function useDeleteMOC() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => mocService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all })
    },
  })
}

export function useTransitionMOC() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; payload: MOCTransitionPayload }) =>
      mocService.transition(args.id, args.payload),
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: keys.detail(args.id) })
      qc.invalidateQueries({ queryKey: [...keys.all, 'list'] })
      qc.invalidateQueries({ queryKey: keys.stats() })
    },
  })
}

export function useUpsertMOCValidation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; payload: MOCValidationUpsertPayload }) =>
      mocService.upsertValidation(args.id, args.payload),
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: keys.detail(args.id) })
    },
  })
}

export function useMOCExecutionAccord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; payload: MOCExecutionAccordPayload }) =>
      mocService.executionAccord(args.id, args.payload),
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: keys.detail(args.id) })
      qc.invalidateQueries({ queryKey: [...keys.all, 'list'] })
    },
  })
}

export function useMOCSiteAssignments(site_label?: string) {
  return useQuery({
    queryKey: [...keys.all, 'site_assignments', site_label ?? ''],
    queryFn: () => mocService.listSiteAssignments(site_label),
  })
}

export function useCreateMOCSiteAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: MOCSiteAssignmentCreatePayload) =>
      mocService.createSiteAssignment(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...keys.all, 'site_assignments'] })
    },
  })
}

export function useDeleteMOCSiteAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => mocService.deleteSiteAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...keys.all, 'site_assignments'] })
    },
  })
}
