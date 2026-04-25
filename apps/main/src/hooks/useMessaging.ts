/**
 * React Query hooks for the Messaging module (announcements, login events, security rules).
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { messagingService } from '@/services/messagingService'
import type {
  AnnouncementCreate, AnnouncementUpdate,
  SecurityRuleCreate, SecurityRuleUpdate,
} from '@/services/messagingService'
import type { PaginationParams } from '@/types/api'

// ── Announcements ──

export function useAnnouncements(params: PaginationParams & {
  priority?: string
  display_location?: string
  active_only?: boolean
} = {}) {
  return useQuery({
    queryKey: ['messaging', 'announcements', params],
    queryFn: () => messagingService.listAnnouncements(params),
    placeholderData: keepPreviousData,
  })
}

export function usePublicAnnouncements(displayLocation = 'login') {
  return useQuery({
    queryKey: ['messaging', 'announcements', 'public', displayLocation],
    queryFn: () => messagingService.listPublicAnnouncements(displayLocation),
    staleTime: 60_000, // 1 min cache
  })
}

export function useCreateAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: AnnouncementCreate) => messagingService.createAnnouncement(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['messaging', 'announcements'] }) },
  })
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AnnouncementUpdate }) =>
      messagingService.updateAnnouncement(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['messaging', 'announcements'] }) },
  })
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => messagingService.deleteAnnouncement(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['messaging', 'announcements'] }) },
  })
}

export function useDismissAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => messagingService.dismissAnnouncement(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['messaging', 'announcements'] }) },
  })
}

// ── Login Events ──

export function useLoginEvents(params: PaginationParams & {
  user_id?: string
  email?: string
  ip_address?: string
  success?: boolean
  suspicious?: boolean
  blocked?: boolean
  date_from?: string
  date_to?: string
} = {}) {
  return useQuery({
    queryKey: ['messaging', 'login-events', params],
    queryFn: () => messagingService.listLoginEvents(params),
    placeholderData: keepPreviousData,
  })
}

export function useLoginEventStats(days = 7) {
  return useQuery({
    queryKey: ['messaging', 'login-events', 'stats', days],
    queryFn: () => messagingService.getLoginEventStats(days),
    staleTime: 30_000,
  })
}

export function useMyLoginEvents(params: PaginationParams = {}) {
  return useQuery({
    queryKey: ['messaging', 'login-events', 'my', params],
    queryFn: () => messagingService.listMyLoginEvents(params),
    placeholderData: keepPreviousData,
  })
}

// ── Security Rules ──

export function useSecurityRules() {
  return useQuery({
    queryKey: ['messaging', 'security-rules'],
    queryFn: () => messagingService.listSecurityRules(),
  })
}

export function useCreateSecurityRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: SecurityRuleCreate) => messagingService.createSecurityRule(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['messaging', 'security-rules'] }) },
  })
}

export function useUpdateSecurityRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SecurityRuleUpdate }) =>
      messagingService.updateSecurityRule(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['messaging', 'security-rules'] }) },
  })
}

export function useDeleteSecurityRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => messagingService.deleteSecurityRule(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['messaging', 'security-rules'] }) },
  })
}
