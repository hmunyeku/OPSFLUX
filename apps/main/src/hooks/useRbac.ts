/**
 * React Query hooks for RBAC — roles, permissions, groups.
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  rbacService,
  type RoleCreate,
  type RoleUpdate,
  type GroupCreate,
  type GroupUpdate,
  type RolesFilter,
  type GroupsFilter,
  type PermissionsFilter,
  type PermissionOverride,
} from '@/services/rbacService'

// ── Roles ────────────────────────────────────────────────────

export function useRoles(filter?: RolesFilter) {
  return useQuery({
    queryKey: ['rbac', 'roles', filter],
    queryFn: () => rbacService.listRoles(filter),
  })
}

export function useRole(code: string) {
  return useQuery({
    queryKey: ['rbac', 'roles', code],
    queryFn: () => rbacService.getRole(code),
    enabled: !!code,
  })
}

export function useCreateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: RoleCreate) => rbacService.createRole(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac', 'roles'] })
    },
  })
}

export function useUpdateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, payload }: { code: string; payload: RoleUpdate }) =>
      rbacService.updateRole(code, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac', 'roles'] })
    },
  })
}

export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => rbacService.deleteRole(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac', 'roles'] })
    },
  })
}

export function useSetRolePermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, permissionCodes }: { code: string; permissionCodes: string[] }) =>
      rbacService.setRolePermissions(code, permissionCodes),
    onSuccess: (_, { code }) => {
      qc.invalidateQueries({ queryKey: ['rbac', 'roles', code] })
      qc.invalidateQueries({ queryKey: ['rbac', 'roles'] })
    },
  })
}

// ── Permissions ──────────────────────────────────────────────

export function usePermissions(filter?: PermissionsFilter) {
  return useQuery({
    queryKey: ['rbac', 'permissions', filter],
    queryFn: () => rbacService.listPermissions(filter),
  })
}

export function useModules() {
  return useQuery({
    queryKey: ['rbac', 'modules'],
    queryFn: () => rbacService.listModules(),
  })
}

// ── Groups ───────────────────────────────────────────────────

export function useGroups(filter?: GroupsFilter) {
  return useQuery({
    queryKey: ['rbac', 'groups', filter],
    queryFn: () => rbacService.listGroups(filter),
    placeholderData: keepPreviousData,
  })
}

export function useGroup(id: string) {
  return useQuery({
    queryKey: ['rbac', 'groups', id],
    queryFn: () => rbacService.getGroup(id),
    enabled: !!id,
  })
}

export function useCreateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: GroupCreate) => rbacService.createGroup(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac', 'groups'] })
    },
  })
}

export function useUpdateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: GroupUpdate }) =>
      rbacService.updateGroup(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac', 'groups'] })
    },
  })
}

export function useDeleteGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => rbacService.deleteGroup(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac', 'groups'] })
    },
  })
}

export function useAddGroupMembers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, userIds }: { groupId: string; userIds: string[] }) =>
      rbacService.addMembers(groupId, userIds),
    onSuccess: (_, { groupId }) => {
      qc.invalidateQueries({ queryKey: ['rbac', 'groups', groupId] })
      qc.invalidateQueries({ queryKey: ['rbac', 'groups'] })
    },
  })
}

export function useRemoveGroupMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      rbacService.removeMember(groupId, userId),
    onSuccess: (_, { groupId }) => {
      qc.invalidateQueries({ queryKey: ['rbac', 'groups', groupId] })
      qc.invalidateQueries({ queryKey: ['rbac', 'groups'] })
    },
  })
}

// ── Group permission overrides ──────────────────────────────

export function useSetGroupPermissionOverrides() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, overrides }: { groupId: string; overrides: PermissionOverride[] }) =>
      rbacService.setGroupPermissionOverrides(groupId, overrides),
    onSuccess: (_, { groupId }) => {
      qc.invalidateQueries({ queryKey: ['rbac', 'groups', groupId] })
      qc.invalidateQueries({ queryKey: ['rbac', 'groups'] })
    },
  })
}

export function useCopyGroupPermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, sourceGroupId }: { groupId: string; sourceGroupId: string }) =>
      rbacService.copyGroupPermissions(groupId, sourceGroupId),
    onSuccess: (_, { groupId }) => {
      qc.invalidateQueries({ queryKey: ['rbac', 'groups', groupId] })
    },
  })
}

// ── User permission overrides ───────────────────────────────

export function useUserPermissionOverrides(userId: string) {
  return useQuery({
    queryKey: ['rbac', 'user-overrides', userId],
    queryFn: () => rbacService.getUserPermissionOverrides(userId),
    enabled: !!userId,
  })
}

export function useSetUserPermissionOverrides() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, overrides }: { userId: string; overrides: PermissionOverride[] }) =>
      rbacService.setUserPermissionOverrides(userId, overrides),
    onSuccess: (_, { userId }) => {
      qc.invalidateQueries({ queryKey: ['rbac', 'user-overrides', userId] })
      qc.invalidateQueries({ queryKey: ['rbac', 'user-effective', userId] })
    },
  })
}

export function useUserEffectivePermissions(userId: string) {
  return useQuery({
    queryKey: ['rbac', 'user-effective', userId],
    queryFn: () => rbacService.getUserEffectivePermissions(userId),
    enabled: !!userId,
  })
}

// ── Permission mode ─────────────────────────────────────────

export function usePermissionMode() {
  return useQuery({
    queryKey: ['rbac', 'permission-mode'],
    queryFn: () => rbacService.getPermissionMode(),
  })
}

export function useSetPermissionMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mode: 'additive' | 'restrictive') =>
      rbacService.setPermissionMode(mode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac', 'permission-mode'] })
      qc.invalidateQueries({ queryKey: ['rbac'] })
    },
  })
}
