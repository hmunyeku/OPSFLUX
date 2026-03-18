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
