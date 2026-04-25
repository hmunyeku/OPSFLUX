/**
 * RBAC API service — roles, permissions, groups, members.
 */
import api from '@/lib/api'

// ── Types ────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface PermissionRead {
  code: string
  name: string
  description: string | null
  module: string | null
}

export interface GroupBrief {
  id: string
  name: string
  entity_id: string
  asset_scope_name: string | null
  member_count: number
  active: boolean
}

export interface RoleRead {
  code: string
  name: string
  description: string | null
  module: string | null
  permission_count: number
  group_count: number
  user_count: number
  created_at: string | null
  updated_at: string | null
}

export interface RoleWithPermissions extends RoleRead {
  permissions: PermissionRead[]
  groups: GroupBrief[]
}

export interface RoleCreate {
  code: string
  name: string
  description?: string | null
  module?: string | null
}

export interface RoleUpdate {
  name?: string
  description?: string | null
  module?: string | null
}

export interface GroupMemberRead {
  user_id: string
  first_name: string
  last_name: string
  email: string
  joined_at: string | null
}

export interface GroupRead {
  id: string
  entity_id: string
  entity_name: string | null
  name: string
  role_codes: string[]
  role_names: string[]
  asset_scope: string | null
  asset_scope_name: string | null
  active: boolean
  member_count: number
  created_at: string | null
  updated_at: string | null
}

export interface PermissionOverride {
  permission_code: string
  granted: boolean
}

export interface EffectivePermission {
  permission_code: string
  source: 'user' | 'role' | 'group'
}

export interface GroupDetail extends Omit<GroupRead, 'member_count'> {
  members: GroupMemberRead[]
  member_count: number
  permission_overrides: PermissionOverride[]
}

export interface GroupCreate {
  name: string
  role_codes: string[]
  asset_scope?: string | null
}

export interface GroupUpdate {
  name?: string
  role_codes?: string[]
  asset_scope?: string | null
  active?: boolean
}

export interface ModulePermissions {
  module: string
  permissions: PermissionRead[]
}

// ── Query params ────────────────────────────────────────────

export interface RolesFilter {
  search?: string
  module?: string
}

export interface GroupsFilter {
  search?: string
  role_code?: string  // filter groups that include this role
  active?: boolean
  page?: number
  page_size?: number
}

export interface PermissionsFilter {
  search?: string
  module?: string
}

// ── Service ──────────────────────────────────────────────────

export const rbacService = {
  // ── Roles ──
  listRoles: async (filter?: RolesFilter): Promise<RoleRead[]> => {
    const params: Record<string, string> = {}
    if (filter?.search) params.search = filter.search
    if (filter?.module) params.module = filter.module
    const { data } = await api.get('/api/v1/rbac/roles', { params })
    return data
  },

  getRole: async (code: string): Promise<RoleWithPermissions> => {
    const { data } = await api.get(`/api/v1/rbac/roles/${code}`)
    return data
  },

  createRole: async (payload: RoleCreate): Promise<RoleRead> => {
    const { data } = await api.post('/api/v1/rbac/roles', payload)
    return data
  },

  updateRole: async (code: string, payload: RoleUpdate): Promise<RoleRead> => {
    const { data } = await api.patch(`/api/v1/rbac/roles/${code}`, payload)
    return data
  },

  deleteRole: async (code: string): Promise<void> => {
    await api.delete(`/api/v1/rbac/roles/${code}`)
  },

  setRolePermissions: async (code: string, permissionCodes: string[]): Promise<RoleWithPermissions> => {
    const { data } = await api.put(`/api/v1/rbac/roles/${code}/permissions`, {
      permission_codes: permissionCodes,
    })
    return data
  },

  // ── Permissions ──
  listPermissions: async (filter?: PermissionsFilter): Promise<PermissionRead[]> => {
    const params: Record<string, string> = {}
    if (filter?.search) params.search = filter.search
    if (filter?.module) params.module = filter.module
    const { data } = await api.get('/api/v1/rbac/permissions', { params })
    return data
  },

  listModules: async (): Promise<ModulePermissions[]> => {
    const { data } = await api.get('/api/v1/rbac/modules')
    return data
  },

  // ── Groups ──
  listGroups: async (filter?: GroupsFilter): Promise<PaginatedResponse<GroupRead>> => {
    const params: Record<string, string | number | boolean> = {}
    if (filter?.search) params.search = filter.search
    if (filter?.role_code) params.role_code = filter.role_code
    if (filter?.active !== undefined) params.active = filter.active
    if (filter?.page) params.page = filter.page
    if (filter?.page_size) params.page_size = filter.page_size
    const { data } = await api.get('/api/v1/rbac/groups', { params })
    return data
  },

  getGroup: async (id: string): Promise<GroupDetail> => {
    const { data } = await api.get(`/api/v1/rbac/groups/${id}`)
    return data
  },

  createGroup: async (payload: GroupCreate): Promise<GroupRead> => {
    const { data } = await api.post('/api/v1/rbac/groups', payload)
    return data
  },

  updateGroup: async (id: string, payload: GroupUpdate): Promise<GroupRead> => {
    const { data } = await api.patch(`/api/v1/rbac/groups/${id}`, payload)
    return data
  },

  deleteGroup: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/rbac/groups/${id}`)
  },

  addMembers: async (groupId: string, userIds: string[]): Promise<GroupDetail> => {
    const { data } = await api.post(`/api/v1/rbac/groups/${groupId}/members`, {
      user_ids: userIds,
    })
    return data
  },

  removeMember: async (groupId: string, userId: string): Promise<void> => {
    await api.delete(`/api/v1/rbac/groups/${groupId}/members/${userId}`)
  },

  // ── Group permission overrides ──
  getGroupPermissionOverrides: async (groupId: string): Promise<PermissionOverride[]> => {
    const { data } = await api.get(`/api/v1/rbac/groups/${groupId}/permissions`)
    return data
  },

  setGroupPermissionOverrides: async (groupId: string, overrides: PermissionOverride[]): Promise<PermissionOverride[]> => {
    const { data } = await api.put(`/api/v1/rbac/groups/${groupId}/permissions`, { overrides })
    return data
  },

  copyGroupPermissions: async (groupId: string, sourceGroupId: string): Promise<PermissionOverride[]> => {
    const { data } = await api.post(`/api/v1/rbac/groups/${groupId}/copy-permissions`, null, {
      params: { source_group_id: sourceGroupId },
    })
    return data
  },

  // ── User permission overrides ──
  getUserPermissionOverrides: async (userId: string): Promise<PermissionOverride[]> => {
    const { data } = await api.get(`/api/v1/users/${userId}/permission-overrides`)
    return data
  },

  setUserPermissionOverrides: async (userId: string, overrides: PermissionOverride[]): Promise<PermissionOverride[]> => {
    const { data } = await api.put(`/api/v1/users/${userId}/permission-overrides`, { overrides })
    return data
  },

  getUserEffectivePermissions: async (userId: string): Promise<EffectivePermission[]> => {
    const { data } = await api.get(`/api/v1/users/${userId}/effective-permissions`)
    return data
  },

  // ── Permission mode ──
  getPermissionMode: async (): Promise<{ mode: 'additive' | 'restrictive' }> => {
    const { data } = await api.get('/api/v1/rbac/permission-mode')
    return data
  },

  setPermissionMode: async (mode: 'additive' | 'restrictive'): Promise<{ mode: string }> => {
    const { data } = await api.put('/api/v1/rbac/permission-mode', { mode })
    return data
  },

  // ── Current user permissions ──
  getMyPermissions: async (): Promise<string[]> => {
    const { data } = await api.get('/api/v1/auth/me/permissions')
    return data
  },
}
