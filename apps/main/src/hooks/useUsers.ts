/**
 * React Query hooks for users.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersService } from '@/services/usersService'
import type { UserCreate, UserUpdate } from '@/types/api'
import { useAuthStore } from '@/stores/authStore'

export function useUsers(params: { page?: number; page_size?: number; search?: string; active?: boolean; user_type?: string; mfa_enabled?: boolean } = {}) {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['users', currentEntityId, params],
    queryFn: () => usersService.list(params),
    enabled: Boolean(currentEntityId),
  })
}

export function useUser(id: string) {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['users', currentEntityId, id],
    queryFn: () => usersService.get(id),
    enabled: Boolean(currentEntityId) && !!id,
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
      qc.invalidateQueries({ queryKey: ['compliance-check'] })
      qc.invalidateQueries({ queryKey: ['compliance-records'] })
    },
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => usersService.delete(id),
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
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['users', currentEntityId, userId, 'entities'],
    queryFn: () => usersService.getUserEntities(userId),
    enabled: Boolean(currentEntityId) && !!userId,
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
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['users', currentEntityId, 'stats'],
    queryFn: () => usersService.getStats(),
    enabled: Boolean(currentEntityId),
  })
}

export function useRecentActivity(limit = 5) {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['users', currentEntityId, 'recent-activity', limit],
    queryFn: () => usersService.getRecentActivity(limit),
    enabled: Boolean(currentEntityId),
  })
}

// ── Tier Links (external company linking) ──

export function useUserTierLinks(userId: string) {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['users', currentEntityId, userId, 'tier-links'],
    queryFn: () => usersService.getUserTierLinks(userId),
    enabled: Boolean(currentEntityId) && !!userId,
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
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['users', currentEntityId, userId, 'profile-completeness'],
    queryFn: () => usersService.getProfileCompleteness(userId),
    enabled: Boolean(currentEntityId) && !!userId,
  })
}

// ── Admin Avatar Upload ──

export function useAdminUploadAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, file }: { userId: string; file: File }) =>
      usersService.uploadUserAvatar(userId, file),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['users', variables.userId] })
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useAdminSetAvatarFromURL() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, url }: { userId: string; url: string }) =>
      usersService.setUserAvatarFromURL(userId, url),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['users', variables.userId] })
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
