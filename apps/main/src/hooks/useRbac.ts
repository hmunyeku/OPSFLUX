/**
 * React Query hooks for RBAC — roles, permissions, groups.
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  rbacService,
  listDelegations,
  listMyDelegations,
  getDelegation,
  createDelegation,
  updateDelegation,
  revokeDelegation,
  getRbacDefaults,
  setRbacDefaults,
  listAuditEvents,
  getMatrixRolePermissions,
  getSodMatrix,
  type RoleCreate,
  type RoleUpdate,
  type GroupCreate,
  type GroupUpdate,
  type RolesFilter,
  type GroupsFilter,
  type PermissionsFilter,
  type PermissionOverride,
  type DelegationCreatePayload,
  type DelegationUpdatePayload,
  type DelegationListFilters,
  type AuditEventFilters,
} from '@/services/rbacService'
import { useAuthStore } from '@/stores/authStore'

// ── Roles ────────────────────────────────────────────────────

export function useRoles(filter?: RolesFilter) {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['rbac', currentEntityId, 'roles', filter],
    queryFn: () => rbacService.listRoles(filter),
    enabled: Boolean(currentEntityId),
  })
}

export function useRole(code: string) {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['rbac', currentEntityId, 'roles', code],
    queryFn: () => rbacService.getRole(code),
    enabled: !!code && Boolean(currentEntityId),
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
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['rbac', currentEntityId, 'permissions', filter],
    queryFn: () => rbacService.listPermissions(filter),
    enabled: Boolean(currentEntityId),
  })
}

export function useModules() {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['rbac', currentEntityId, 'modules'],
    queryFn: () => rbacService.listModules(),
    enabled: Boolean(currentEntityId),
  })
}

// ── Groups ───────────────────────────────────────────────────

export function useGroups(filter?: GroupsFilter) {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['rbac', currentEntityId, 'groups', filter],
    queryFn: () => rbacService.listGroups(filter),
    enabled: Boolean(currentEntityId),
    placeholderData: keepPreviousData,
  })
}

export function useGroup(id: string) {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['rbac', currentEntityId, 'groups', id],
    queryFn: () => rbacService.getGroup(id),
    enabled: !!id && Boolean(currentEntityId),
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
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['rbac', currentEntityId, 'user-overrides', userId],
    queryFn: () => rbacService.getUserPermissionOverrides(userId),
    enabled: !!userId && Boolean(currentEntityId),
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
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['rbac', currentEntityId, 'user-effective', userId],
    queryFn: () => rbacService.getUserEffectivePermissions(userId),
    enabled: !!userId && Boolean(currentEntityId),
  })
}

// ── Permission mode ─────────────────────────────────────────

export function usePermissionMode() {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['rbac', currentEntityId, 'permission-mode'],
    queryFn: () => rbacService.getPermissionMode(),
    enabled: Boolean(currentEntityId),
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

// ════════════════════════════════════════════════════════════
// DELEGATIONS
// ════════════════════════════════════════════════════════════

export function useDelegations(filters: DelegationListFilters = {}) {
  return useQuery({
    queryKey: ['rbac', 'delegations', filters],
    queryFn: () => listDelegations(filters),
    staleTime: 30_000,
  })
}

export function useMyDelegations(direction?: 'received' | 'given') {
  return useQuery({
    queryKey: ['rbac', 'delegations', 'mine', direction],
    queryFn: () => listMyDelegations(direction),
    staleTime: 30_000,
  })
}

export function useDelegation(id: string | null) {
  return useQuery({
    queryKey: ['rbac', 'delegation', id],
    queryFn: () => getDelegation(id!),
    enabled: !!id,
  })
}

export function useCreateDelegation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: DelegationCreatePayload) => createDelegation(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac', 'delegations'] })
    },
  })
}

export function useUpdateDelegation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DelegationUpdatePayload }) =>
      updateDelegation(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac', 'delegations'] })
    },
  })
}

export function useRevokeDelegation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => revokeDelegation(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac', 'delegations'] })
    },
  })
}

// ════════════════════════════════════════════════════════════
// DEFAULTS
// ════════════════════════════════════════════════════════════

export function useRbacDefaults() {
  return useQuery({
    queryKey: ['rbac', 'defaults'],
    queryFn: getRbacDefaults,
    staleTime: 60_000,
  })
}

export function useSetRbacDefaults() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: setRbacDefaults,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rbac', 'defaults'] })
    },
  })
}

// ════════════════════════════════════════════════════════════
// AUDIT EVENTS
// ════════════════════════════════════════════════════════════

export function useAuditEvents(filters: AuditEventFilters = {}) {
  return useQuery({
    queryKey: ['rbac', 'audit-events', filters],
    queryFn: () => listAuditEvents(filters),
    staleTime: 15_000,
  })
}

// ════════════════════════════════════════════════════════════
// MATRIX JSON (for in-app views)
// ════════════════════════════════════════════════════════════

export function useMatrixRolePermissions(includeDisabledModules = false) {
  return useQuery({
    queryKey: ['rbac', 'matrix', 'role-permissions', includeDisabledModules],
    queryFn: () => getMatrixRolePermissions(includeDisabledModules),
    staleTime: 30_000,
  })
}

export function useSodMatrix() {
  return useQuery({
    queryKey: ['rbac', 'matrix', 'sod'],
    queryFn: getSodMatrix,
    staleTime: 60_000,
  })
}
