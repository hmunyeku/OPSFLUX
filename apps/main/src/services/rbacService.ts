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
  source: 'user' | 'role' | 'group' | 'delegation'
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

// ════════════════════════════════════════════════════════════
// DELEGATIONS (PR-A)
// ════════════════════════════════════════════════════════════

export type DelegationStatus = 'active' | 'programmed' | 'expired' | 'revoked'

export interface DelegationCreatePayload {
  delegate_id: string
  permissions: string[]
  start_date: string  // ISO datetime
  end_date: string
  reason: string
}

export interface DelegationUpdatePayload {
  reason?: string
  end_date?: string  // can only be shortened
}

export interface DelegationRead {
  id: string
  delegator_id: string
  delegate_id: string
  entity_id: string
  permissions: string[]
  start_date: string
  end_date: string
  active: boolean
  reason: string | null
  created_at: string
  delegator_name?: string | null
  delegate_name?: string | null
  status: DelegationStatus
  duration_days: number
}

export interface DelegationListItem {
  id: string
  delegator_name: string
  delegate_name: string
  permissions_count: number
  start_date: string
  end_date: string
  status: DelegationStatus
  reason: string | null
}

export interface DelegationListFilters {
  status?: DelegationStatus
  delegator_id?: string
  delegate_id?: string
  direction?: 'received' | 'given'
}

export async function listDelegations(filters: DelegationListFilters = {}): Promise<DelegationListItem[]> {
  const params: Record<string, string> = {}
  if (filters.status) params.status = filters.status
  if (filters.delegator_id) params.delegator_id = filters.delegator_id
  if (filters.delegate_id) params.delegate_id = filters.delegate_id
  const { data } = await api.get('/api/v1/rbac/delegations/', { params })
  return data
}

export async function listMyDelegations(direction?: 'received' | 'given'): Promise<DelegationListItem[]> {
  const params: Record<string, string> = {}
  if (direction) params.direction = direction
  const { data } = await api.get('/api/v1/rbac/delegations/mine', { params })
  return data
}

export async function getDelegation(id: string): Promise<DelegationRead> {
  const { data } = await api.get(`/api/v1/rbac/delegations/${id}`)
  return data
}

export async function createDelegation(payload: DelegationCreatePayload): Promise<DelegationRead> {
  const { data } = await api.post('/api/v1/rbac/delegations/', payload)
  return data
}

export async function updateDelegation(id: string, payload: DelegationUpdatePayload): Promise<DelegationRead> {
  const { data } = await api.patch(`/api/v1/rbac/delegations/${id}`, payload)
  return data
}

export async function revokeDelegation(id: string, reason: string): Promise<DelegationRead> {
  const { data } = await api.post(`/api/v1/rbac/delegations/${id}/revoke`, { reason })
  return data
}

export function delegationCertificateUrl(id: string): string {
  return `/api/v1/rbac/delegations/${id}/certificate.pdf`
}

// ════════════════════════════════════════════════════════════
// DEFAULTS (rbac.default_role.* per user_type)
// ════════════════════════════════════════════════════════════

export interface RbacDefaults {
  internal: string  // role code
  external: string
  tier_contact: string
}

export async function getRbacDefaults(): Promise<RbacDefaults> {
  const { data } = await api.get('/api/v1/rbac/defaults')
  return data
}

export async function setRbacDefaults(payload: RbacDefaults): Promise<RbacDefaults> {
  const { data } = await api.put('/api/v1/rbac/defaults', payload)
  return data
}

// ════════════════════════════════════════════════════════════
// AUDIT EVENTS
// ════════════════════════════════════════════════════════════

export interface RbacAuditEventRead {
  id: string
  tenant_id: string
  event_type: string
  target: string | null
  params: Record<string, unknown> | null
  result_summary: Record<string, unknown> | null
  file_hash_sha256: string | null
  actor_user_id: string
  occurred_at: string
  completed_at: string | null
  duration_ms: number | null
  status: 'success' | 'failure' | 'pending' | 'partial'
  error_code: string | null
}

export interface RbacAuditEventsListResponse {
  items: RbacAuditEventRead[]
  total: number
  page: number
  page_size: number
}

export interface AuditEventFilters {
  event_type?: string
  event_type_prefix?: string
  actor_user_id?: string
  status?: string
  start_date?: string
  end_date?: string
  page?: number
  page_size?: number
}

export async function listAuditEvents(filters: AuditEventFilters = {}): Promise<RbacAuditEventsListResponse> {
  const params: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') params[k] = v as string | number
  }
  const { data } = await api.get('/api/v1/rbac/audit-events', { params })
  return data
}

// ════════════════════════════════════════════════════════════
// MATRIX JSON HELPERS (for in-app views, distinct from PDF exports)
// ════════════════════════════════════════════════════════════

export interface MatrixRolePermissionsJson {
  tenant: { id: string; name: string; logo_url: string | null }
  roles: Array<{ code: string; name: string; description: string | null; module: string | null }>
  permissions: Array<{
    code: string
    name: string
    module: string | null
    namespace: string | null
    resource: string | null
    action: string | null
    sensitive: boolean
    deprecated: boolean
    module_disabled: boolean
  }>
  grants: Array<[string, string]>  // [role_code, perm_code]
  modules: Array<{ namespace: string; label: string; permission_count: number; disabled_in_tenant: boolean }>
}

export async function getMatrixRolePermissions(includeDisabledModules = false): Promise<MatrixRolePermissionsJson> {
  const params: Record<string, string> = {}
  if (includeDisabledModules) params.include_disabled_modules = 'true'
  const { data } = await api.get('/api/v1/rbac/matrix/role-permissions', { params })
  return data
}

export interface SodViolation {
  role_code: string
  rule_id: string
  rule_label: string
  perms: string[]
}

export interface SodMatrixJson {
  tenant: { id: string; name: string }
  sod_rules: Array<{ id: string; label: string; perms: string[] }>
  violations: SodViolation[]
  violation_count: number
}

export async function getSodMatrix(): Promise<SodMatrixJson> {
  const { data } = await api.get('/api/v1/rbac/matrix/sod')
  return data
}

// ════════════════════════════════════════════════════════════
// PDF EXPORT URLs (return URLs to construct download links / iframe previews)
// ════════════════════════════════════════════════════════════

export interface PdfExportOptions {
  lang?: 'fr' | 'en'
  include_disabled_modules?: boolean
}

function buildExportUrl(path: string, options: PdfExportOptions = {}, extraParams: Record<string, string> = {}): string {
  const params = new URLSearchParams()
  if (options.lang) params.set('lang', options.lang)
  if (options.include_disabled_modules) params.set('include_disabled_modules', 'true')
  for (const [k, v] of Object.entries(extraParams)) {
    if (v) params.set(k, v)
  }
  const qs = params.toString() ? `?${params.toString()}` : ''
  return `/api/v1/rbac/exports${path}${qs}`
}

export function exportMatrixRolePermissionsUrl(o: PdfExportOptions = {}): string {
  return buildExportUrl('/matrix/role-permissions.pdf', o)
}
export function exportMatrixGroupPermissionsUrl(o: PdfExportOptions = {}): string {
  return buildExportUrl('/matrix/group-permissions.pdf', o)
}
export function exportMatrixUserPermissionsUrl(o: PdfExportOptions = {}): string {
  return buildExportUrl('/matrix/user-permissions.pdf', o)
}
export function exportRoleDetailUrl(roleCode: string, o: PdfExportOptions = {}): string {
  return buildExportUrl(`/role/${encodeURIComponent(roleCode)}.pdf`, o)
}
export function exportGroupDetailUrl(groupId: string, o: PdfExportOptions = {}): string {
  return buildExportUrl(`/group/${encodeURIComponent(groupId)}.pdf`, o)
}
export function exportUserDetailUrl(userId: string, o: PdfExportOptions = {}, includeDelegations = true): string {
  return buildExportUrl(`/user/${encodeURIComponent(userId)}.pdf`, o, { include_delegations: includeDelegations ? 'true' : 'false' })
}
export function exportRoleModulesUrl(o: PdfExportOptions = {}): string {
  return buildExportUrl('/matrix/role-modules.pdf', o)
}
export function exportPermissionCatalogUrl(o: PdfExportOptions = {}, groupBy: 'module' | 'action' = 'module'): string {
  return buildExportUrl('/catalog/permissions.pdf', o, { group_by: groupBy })
}
export function exportSodMatrixUrl(o: PdfExportOptions = {}): string {
  return buildExportUrl('/matrix/sod.pdf', o)
}
export function exportDelegationRegistryUrl(o: PdfExportOptions = {}, status?: DelegationStatus): string {
  return buildExportUrl('/delegations/registry.pdf', o, { status: status ?? '' })
}
