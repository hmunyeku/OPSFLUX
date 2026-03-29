/**
 * Settings API service — all settings-related API calls.
 *
 * Endpoints map to backend routes under /api/v1/.
 * Each method returns typed data matching schemas in types/api.ts.
 */
import api from '@/lib/api'

// ── Social Network types ──────────────────────────────────────────
export interface SocialNetworkRead {
  id: string
  owner_type: string
  owner_id: string
  network: string
  url: string
  label: string | null
  sort_order: number
  created_at: string
}

export interface SocialNetworkCreate {
  owner_type: string
  owner_id: string
  network: string
  url: string
  label?: string | null
  sort_order?: number
}

// ── Opening Hour types ────────────────────────────────────────────
export interface OpeningHourRead {
  id: string
  owner_type: string
  owner_id: string
  day_of_week: number
  open_time: string | null
  close_time: string | null
  is_closed: boolean
  label: string | null
  created_at: string
}

export interface OpeningHourCreate {
  owner_type: string
  owner_id: string
  day_of_week: number
  open_time?: string | null
  close_time?: string | null
  is_closed?: boolean
  label?: string | null
}

import type {
  UserRead,
  ProfileUpdate,
  ChangePasswordRequest,
  AccessToken,
  AccessTokenCreate,
  AccessTokenCreated,
  UserSession,
  UserEmail,
  OAuthApp,
  OAuthAppCreate,
  OAuthAppCreated,
  OAuthAuthorization,
  Address,
  AddressCreate,
  AddressUpdate,
  Tag,
  TagTree,
  TagCreate,
  TagUpdate,
  Phone,
  PhoneCreate,
  PhoneUpdate,
  ContactEmail,
  ContactEmailCreate,
  ContactEmailUpdate,
  Note,
  NoteCreate,
  NoteUpdate,
  FileAttachment,
  NotificationPreference,
  NotificationPreferenceUpdate,
  AuditLogEntry,
  PaginatedResponse,
  RoleRead,
  UserGroupRead,
  PermissionMatrix,
  MFASetupResponse,
  MFABackupCodesResponse,
  MFAStatus,
  SearchResponse,
} from '@/types/api'

// ── Profile ────────────────────────────────────────────────
export const profileService = {
  /** Update current user profile (name, language). */
  update: async (payload: ProfileUpdate): Promise<UserRead> => {
    const { data } = await api.patch('/api/v1/profile', payload)
    return data
  },

  /** Change password. */
  changePassword: async (payload: ChangePasswordRequest): Promise<void> => {
    await api.post('/api/v1/profile/change-password', payload)
  },

  /** Upload avatar image. Returns updated user with avatar_url. */
  uploadAvatar: async (file: File): Promise<UserRead> => {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post('/api/v1/profile/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
}

// ── Personal Access Tokens ─────────────────────────────────
export const tokensService = {
  /** List all personal access tokens for current user. */
  list: async (params: { page?: number; page_size?: number; status?: string } = {}): Promise<PaginatedResponse<AccessToken>> => {
    const { data } = await api.get('/api/v1/tokens', { params })
    return data
  },

  /** Create a new personal access token. Returns the full token value (once). */
  create: async (payload: AccessTokenCreate): Promise<AccessTokenCreated> => {
    const { data } = await api.post('/api/v1/tokens', payload)
    return data
  },

  /** Revoke a personal access token. */
  revoke: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/tokens/${id}`)
  },
}

// ── Sessions ───────────────────────────────────────────────
export const sessionsService = {
  /** List all active sessions for current user. */
  list: async (): Promise<UserSession[]> => {
    const { data } = await api.get('/api/v1/sessions')
    return data
  },

  /** Revoke a specific session. */
  revoke: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/sessions/${id}`)
  },

  /** Revoke all sessions except the current one. */
  revokeAll: async (): Promise<{ revoked_count: number }> => {
    const { data } = await api.post('/api/v1/sessions/revoke-all')
    return data
  },
}

// ── User Emails ────────────────────────────────────────────
export const emailsService = {
  /** List all email addresses for current user. */
  list: async (): Promise<UserEmail[]> => {
    const { data } = await api.get('/api/v1/emails')
    return data
  },

  /** Add a new email address. Sends verification email. */
  add: async (email: string): Promise<UserEmail> => {
    const { data } = await api.post('/api/v1/emails', { email })
    return data
  },

  /** Remove an email address. Cannot remove primary. */
  remove: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/emails/${id}`)
  },

  /** Set an email as primary. Must be verified. */
  setPrimary: async (id: string): Promise<UserEmail> => {
    const { data } = await api.post(`/api/v1/emails/${id}/primary`)
    return data
  },

  /** Resend verification email. */
  resendVerification: async (id: string): Promise<void> => {
    await api.post(`/api/v1/emails/${id}/verify`)
  },
}

// ── OAuth Applications ─────────────────────────────────────
export const oauthAppsService = {
  /** List current user's OAuth applications. */
  list: async (): Promise<OAuthApp[]> => {
    const { data } = await api.get('/api/v1/oauth/applications')
    return data
  },

  /** Create a new OAuth application. Returns credentials (once). */
  create: async (payload: OAuthAppCreate): Promise<OAuthAppCreated> => {
    const { data } = await api.post('/api/v1/oauth/applications', payload)
    return data
  },

  /** Deactivate an OAuth application. */
  deactivate: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/oauth/applications/${id}`)
  },

  /** List third-party apps authorized by user. */
  listAuthorizations: async (): Promise<OAuthAuthorization[]> => {
    const { data } = await api.get('/api/v1/oauth/authorizations')
    return data
  },

  /** Revoke a third-party app authorization. */
  revokeAuthorization: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/oauth/authorizations/${id}`)
  },
}

// ── Addresses (polymorphic) ────────────────────────────────
export const addressesService = {
  /** List addresses for a given owner. */
  list: async (ownerType: string, ownerId: string): Promise<Address[]> => {
    const { data } = await api.get('/api/v1/addresses', {
      params: { owner_type: ownerType, owner_id: ownerId },
    })
    return data
  },

  /** Create a new address. */
  create: async (payload: AddressCreate): Promise<Address> => {
    const { data } = await api.post('/api/v1/addresses', payload)
    return data
  },

  /** Update an address. */
  update: async (id: string, payload: AddressUpdate): Promise<Address> => {
    const { data } = await api.patch(`/api/v1/addresses/${id}`, payload)
    return data
  },

  /** Delete an address. */
  remove: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/addresses/${id}`)
  },
}

// ── Tags (polymorphic) ────────────────────────────────────
export const tagsService = {
  /** List tags for a given owner. */
  list: async (ownerType: string, ownerId: string): Promise<Tag[]> => {
    const { data } = await api.get('/api/v1/tags', {
      params: { owner_type: ownerType, owner_id: ownerId },
    })
    return data
  },

  /** List tags as a nested tree. */
  tree: async (ownerType: string, ownerId: string): Promise<TagTree[]> => {
    const { data } = await api.get('/api/v1/tags/tree', {
      params: { owner_type: ownerType, owner_id: ownerId },
    })
    return data
  },

  /** Search tags by name (autocomplete). */
  search: async (q: string, ownerType?: string, ownerId?: string): Promise<Tag[]> => {
    const { data } = await api.get('/api/v1/tags/search', {
      params: { q, owner_type: ownerType, owner_id: ownerId },
    })
    return data
  },

  /** Create a new tag. */
  create: async (payload: TagCreate): Promise<Tag> => {
    const { data } = await api.post('/api/v1/tags', payload)
    return data
  },

  /** Update a tag. */
  update: async (id: string, payload: TagUpdate): Promise<Tag> => {
    const { data } = await api.patch(`/api/v1/tags/${id}`, payload)
    return data
  },

  /** Delete a tag. */
  remove: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/tags/${id}`)
  },
}

// ── Phones (polymorphic) ─────────────────────────────────
export const phonesService = {
  list: async (ownerType: string, ownerId: string): Promise<Phone[]> => {
    const { data } = await api.get('/api/v1/phones', {
      params: { owner_type: ownerType, owner_id: ownerId },
    })
    return data
  },
  create: async (payload: PhoneCreate): Promise<Phone> => {
    const { data } = await api.post('/api/v1/phones', payload)
    return data
  },
  update: async (id: string, payload: PhoneUpdate): Promise<Phone> => {
    const { data } = await api.patch(`/api/v1/phones/${id}`, payload)
    return data
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/phones/${id}`)
  },
}

// ── Contact Emails (polymorphic) ─────────────────────────
export const contactEmailsService = {
  list: async (ownerType: string, ownerId: string): Promise<ContactEmail[]> => {
    const { data } = await api.get('/api/v1/contact-emails', {
      params: { owner_type: ownerType, owner_id: ownerId },
    })
    return data
  },
  create: async (payload: ContactEmailCreate): Promise<ContactEmail> => {
    const { data } = await api.post('/api/v1/contact-emails', payload)
    return data
  },
  update: async (id: string, payload: ContactEmailUpdate): Promise<ContactEmail> => {
    const { data } = await api.patch(`/api/v1/contact-emails/${id}`, payload)
    return data
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/contact-emails/${id}`)
  },
}

// ── Notes (polymorphic) ──────────────────────────────────
export const notesService = {
  /** List notes for a given owner. */
  list: async (ownerType: string, ownerId: string): Promise<Note[]> => {
    const { data } = await api.get('/api/v1/notes', {
      params: { owner_type: ownerType, owner_id: ownerId },
    })
    return data
  },

  /** Create a new note. */
  create: async (payload: NoteCreate): Promise<Note> => {
    const { data } = await api.post('/api/v1/notes', payload)
    return data
  },

  /** Update a note. */
  update: async (id: string, payload: NoteUpdate): Promise<Note> => {
    const { data } = await api.patch(`/api/v1/notes/${id}`, payload)
    return data
  },

  /** Delete a note. */
  remove: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/notes/${id}`)
  },
}

// ── Attachments (polymorphic) ────────────────────────────
export const attachmentsService = {
  /** List file attachments for a given owner. */
  list: async (ownerType: string, ownerId: string): Promise<FileAttachment[]> => {
    const { data } = await api.get('/api/v1/attachments', {
      params: { owner_type: ownerType, owner_id: ownerId },
    })
    return data
  },

  /** Upload a file attachment. */
  upload: async (ownerType: string, ownerId: string, file: File, description?: string): Promise<FileAttachment> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('owner_type', ownerType)
    formData.append('owner_id', ownerId)
    if (description) formData.append('description', description)
    const { data } = await api.post('/api/v1/attachments', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  /** Get download URL for an attachment. */
  downloadUrl: (id: string): string => `/api/v1/attachments/${id}/download`,

  /** Delete a file attachment. */
  remove: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/attachments/${id}`)
  },
}

// ── Notification Preferences ───────────────────────────────
export const notificationPrefsService = {
  /** Get current notification preferences. */
  get: async (): Promise<NotificationPreference> => {
    const { data } = await api.get('/api/v1/preferences/notifications')
    return data
  },

  /** Update notification preferences. */
  update: async (payload: NotificationPreferenceUpdate): Promise<NotificationPreference> => {
    const { data } = await api.patch('/api/v1/preferences/notifications', payload)
    return data
  },
}

// ── Audit Log ──────────────────────────────────────────────
export const auditLogService = {
  /** Fetch paginated audit log entries. */
  list: async (params: {
    page?: number
    page_size?: number
    action?: string
    resource_type?: string
    date_from?: string
    date_to?: string
  } = {}): Promise<PaginatedResponse<AuditLogEntry>> => {
    const { data } = await api.get('/api/v1/audit-log', { params })
    return data
  },
}

// ── Roles & Permissions ────────────────────────────────────
export const rolesService = {
  /** Get current user's roles. */
  getUserRoles: async (): Promise<RoleRead[]> => {
    const { data } = await api.get('/api/v1/users/me/roles')
    return data
  },

  /** Get groups the current user belongs to. */
  getUserGroups: async (): Promise<UserGroupRead[]> => {
    const { data } = await api.get('/api/v1/users/me/groups')
    return data
  },

  /** Get effective permissions matrix. */
  getUserPermissions: async (): Promise<PermissionMatrix[]> => {
    const { data } = await api.get('/api/v1/users/me/permissions')
    return data
  },
}

// ── MFA (Two-Factor Authentication) ──────────────────────
export const mfaService = {
  /** Get MFA status for current user. */
  getStatus: async (): Promise<MFAStatus> => {
    const { data } = await api.get('/api/v1/mfa/status')
    return data
  },

  /** Start MFA setup — returns secret + provisioning URI for QR code. */
  setup: async (): Promise<MFASetupResponse> => {
    const { data } = await api.post('/api/v1/mfa/setup')
    return data
  },

  /** Verify TOTP code during setup — enables MFA + returns backup codes (once). */
  verifySetup: async (code: string): Promise<MFABackupCodesResponse> => {
    const { data } = await api.post('/api/v1/mfa/verify-setup', { code })
    return data
  },

  /** Verify TOTP code during login. */
  verify: async (code: string): Promise<{ verified: boolean }> => {
    const { data } = await api.post('/api/v1/mfa/verify', { code })
    return data
  },

  /** Disable MFA (requires password). */
  disable: async (password: string): Promise<void> => {
    await api.post('/api/v1/mfa/disable', { password })
  },

  /** Regenerate backup codes (requires password). */
  regenerateCodes: async (password: string): Promise<MFABackupCodesResponse> => {
    const { data } = await api.post('/api/v1/mfa/regenerate-codes', { password })
    return data
  },
}

// ── Global Search ────────────────────────────────────────
export const searchService = {
  /** Search across assets, tiers, users. */
  search: async (q: string): Promise<SearchResponse> => {
    const { data } = await api.get('/api/v1/search', { params: { q } })
    return data
  },
}

// ── Social Networks (polymorphic) ────────────────────────
export const socialNetworkService = {
  list: async (ownerType: string, ownerId: string) => {
    const { data } = await api.get('/api/v1/social-networks', {
      params: { owner_type: ownerType, owner_id: ownerId },
    })
    return data as SocialNetworkRead[]
  },
  create: async (payload: SocialNetworkCreate) => {
    const { data } = await api.post('/api/v1/social-networks', payload)
    return data as SocialNetworkRead
  },
  update: async (id: string, payload: Partial<SocialNetworkCreate>) => {
    const { data } = await api.patch(`/api/v1/social-networks/${id}`, payload)
    return data as SocialNetworkRead
  },
  remove: async (id: string) => {
    await api.delete(`/api/v1/social-networks/${id}`)
  },
}

// ── Opening Hours (polymorphic) ──────────────────────────
export const openingHourService = {
  list: async (ownerType: string, ownerId: string) => {
    const { data } = await api.get('/api/v1/opening-hours', {
      params: { owner_type: ownerType, owner_id: ownerId },
    })
    return data as OpeningHourRead[]
  },
  create: async (payload: OpeningHourCreate) => {
    const { data } = await api.post('/api/v1/opening-hours', payload)
    return data as OpeningHourRead
  },
  update: async (id: string, payload: Partial<OpeningHourCreate>) => {
    const { data } = await api.patch(`/api/v1/opening-hours/${id}`, payload)
    return data as OpeningHourRead
  },
  remove: async (id: string) => {
    await api.delete(`/api/v1/opening-hours/${id}`)
  },
}

// ── Cost Imputations (polymorphic) ────────────────────────

export interface CostImputation {
  id: string
  owner_type: string
  owner_id: string
  project_id: string | null
  wbs_id: string | null
  cost_center_id: string | null
  percentage: number
  cross_imputation: boolean
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  project_name: string | null
  cost_center_name: string | null
  author_name: string | null
}

export interface CostImputationCreate {
  owner_type: string
  owner_id: string
  project_id?: string | null
  wbs_id?: string | null
  cost_center_id?: string | null
  percentage: number
  cross_imputation?: boolean
  notes?: string | null
}

export const costImputationsService = {
  list: async (ownerType: string, ownerId: string): Promise<CostImputation[]> => {
    const { data } = await api.get('/api/v1/cost-imputations', {
      params: { owner_type: ownerType, owner_id: ownerId },
    })
    return data
  },
  create: async (payload: CostImputationCreate): Promise<CostImputation> => {
    const { data } = await api.post('/api/v1/cost-imputations', payload)
    return data
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/api/v1/cost-imputations/${id}`)
  },
}
