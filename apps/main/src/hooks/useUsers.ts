/**
 * React Query hooks for users.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersService } from '@/services/usersService'
import type { UserCreate, UserUpdate } from '@/types/api'

export function useUsers(params: { page?: number; page_size?: number; search?: string; active?: boolean; user_type?: string; mfa_enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => usersService.list(params),
  })
}

export function useUser(id: string) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: () => usersService.get(id),
    enabled: !!id,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UserCreate) => usersService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UserUpdate }) =>
      usersService.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useRevokeAllSessions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => usersService.revokeAllSessions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export function useUserEntities(userId: string) {
  return useQuery({
    queryKey: ['users', userId, 'entities'],
    queryFn: () => usersService.getUserEntities(userId),
    enabled: !!userId,
  })
}

export function useAssignUserToEntity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, entityId }: { userId: string; entityId: string }) =>
      usersService.assignUserToEntity(userId, entityId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['users', variables.userId, 'entities'] })
    },
  })
}

export function useRemoveUserFromEntity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, entityId }: { userId: string; entityId: string }) =>
      usersService.removeUserFromEntity(userId, entityId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['users', variables.userId, 'entities'] })
    },
  })
}

export function useSendPasswordReset() {
  return useMutation({
    mutationFn: (email: string) => usersService.sendPasswordReset(email),
  })
}

export function useUsersStats() {
  return useQuery({
    queryKey: ['users', 'stats'],
    queryFn: () => usersService.getStats(),
  })
}

export function useRecentActivity(limit = 5) {
  return useQuery({
    queryKey: ['users', 'recent-activity', limit],
    queryFn: () => usersService.getRecentActivity(limit),
  })
}

// ── Tier Links (external company linking) ──

export function useUserTierLinks(userId: string) {
  return useQuery({
    queryKey: ['users', userId, 'tier-links'],
    queryFn: () => usersService.getUserTierLinks(userId),
    enabled: !!userId,
  })
}

export function useLinkUserToTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, tierId, role }: { userId: string; tierId: string; role?: string }) =>
      usersService.linkUserToTier(userId, tierId, role),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['users', variables.userId, 'tier-links'] })
    },
  })
}

export function useUnlinkUserFromTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, linkId }: { userId: string; linkId: string }) =>
      usersService.unlinkUserFromTier(userId, linkId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['users', variables.userId, 'tier-links'] })
    },
  })
}

// ── Profile Completeness ──

export function useProfileCompleteness(userId: string) {
  return useQuery({
    queryKey: ['users', userId, 'profile-completeness'],
    queryFn: () => usersService.getProfileCompleteness(userId),
    enabled: !!userId,
  })
}
