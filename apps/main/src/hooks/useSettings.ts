/**
 * React Query hooks for all settings-related data.
 *
 * Pattern:
 * - useX() for queries (fetching data)
 * - useCreateX / useUpdateX / useDeleteX for mutations
 * - Mutations invalidate related queries on success
 * - Auth store is refreshed when profile changes affect the cached user
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import {
  profileService,
  tokensService,
  sessionsService,
  emailsService,
  oauthAppsService,
  addressesService,
  tagsService,
  notesService,
  attachmentsService,
  phonesService,
  contactEmailsService,
  notificationPrefsService,
  auditLogService,
  rolesService,
  mfaService,
  socialNetworkService,
  openingHourService,
  costImputationsService,
  costCentersService,
  businessUnitsService,
  imputationAssignmentService,
  imputationOtpTemplateService,
  imputationReferenceService,
  scopedSettingsService,
} from '@/services/settingsService'
import type {
  ProfileUpdate,
  ChangePasswordRequest,
  AccessTokenCreate,
  AddressCreate,
  AddressUpdate,
  TagCreate,
  TagUpdate,
  PhoneCreate,
  PhoneUpdate,
  ContactEmailCreate,
  ContactEmailUpdate,
  NoteCreate,
  NoteUpdate,
  OAuthAppCreate,
  NotificationPreferenceUpdate,
} from '@/types/api'
import type {
  CostImputationCreate,
  CostImputationUpdate,
  ImputationAssignmentCreate,
  ImputationAssignmentUpdate,
  ImputationOtpTemplateCreate,
  ImputationOtpTemplateUpdate,
  ImputationReferenceCreate,
  ImputationReferenceUpdate,
  OpeningHourCreate,
  SocialNetworkCreate,
} from '@/services/settingsService'

// ═════════════════════════════════════════════════════════════
// PROFILE
// ═════════════════════════════════════════════════════════════

/** Update the current user's profile (name, language). */
export function useUpdateProfile() {
  const qc = useQueryClient()
  const fetchUser = useAuthStore((s) => s.fetchUser)

  return useMutation({
    mutationFn: (payload: ProfileUpdate) => profileService.update(payload),
    onSuccess: () => {
      // Refresh authStore so the rest of the app sees updated user data
      fetchUser()
      qc.invalidateQueries({ queryKey: ['profile'] })
      // Invalidate compliance check in case job_position_id changed
      qc.invalidateQueries({ queryKey: ['compliance-check'] })
      qc.invalidateQueries({ queryKey: ['compliance-records'] })
    },
  })
}

/** Change the current user's password. */
export function useChangePassword() {
  return useMutation({
    mutationFn: (payload: ChangePasswordRequest) => profileService.changePassword(payload),
  })
}

/** Upload a new avatar image. */
export function useUploadAvatar() {
  const fetchUser = useAuthStore((s) => s.fetchUser)

  return useMutation({
    mutationFn: (file: File) => profileService.uploadAvatar(file),
    onSuccess: () => {
      fetchUser()
    },
  })
}

// ═════════════════════════════════════════════════════════════
// PERSONAL ACCESS TOKENS
// ═════════════════════════════════════════════════════════════

/** Fetch paginated list of personal access tokens. */
export function useAccessTokens(params: { page?: number; page_size?: number; status?: string } = {}) {
  return useQuery({
    queryKey: ['tokens', params],
    queryFn: () => tokensService.list(params),
  })
}

/** Create a new personal access token. */
export function useCreateToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: AccessTokenCreate) => tokensService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tokens'] })
    },
  })
}

/** Revoke a personal access token. */
export function useRevokeToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tokensService.revoke(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tokens'] })
    },
  })
}

// ═════════════════════════════════════════════════════════════
// SESSIONS
// ═════════════════════════════════════════════════════════════

/** Fetch all active sessions. */
export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionsService.list(),
  })
}

/** Revoke a specific session. */
export function useRevokeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sessionsService.revoke(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

/** Revoke all sessions except the current one. */
export function useRevokeAllSessions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => sessionsService.revokeAll(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

// ═════════════════════════════════════════════════════════════
// USER EMAILS
// ═════════════════════════════════════════════════════════════

/** Fetch all email addresses for current user. */
export function useUserEmails() {
  return useQuery({
    queryKey: ['emails'],
    queryFn: () => emailsService.list(),
  })
}

/** Add a new email address. */
export function useAddEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (email: string) => emailsService.add(email),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] })
    },
  })
}

/** Remove an email address. */
export function useRemoveEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => emailsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] })
    },
  })
}

/** Set an email as primary. */
export function useSetPrimaryEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => emailsService.setPrimary(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] })
    },
  })
}

/** Resend verification email. */
export function useResendVerification() {
  return useMutation({
    mutationFn: (id: string) => emailsService.resendVerification(id),
  })
}

// ═════════════════════════════════════════════════════════════
// OAUTH APPLICATIONS
// ═════════════════════════════════════════════════════════════

/** Fetch user's OAuth applications. */
export function useOAuthApps() {
  return useQuery({
    queryKey: ['oauth-apps'],
    queryFn: () => oauthAppsService.list(),
  })
}

/** Create a new OAuth application. */
export function useCreateOAuthApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: OAuthAppCreate) => oauthAppsService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oauth-apps'] })
    },
  })
}

/** Deactivate an OAuth application. */
export function useDeactivateOAuthApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => oauthAppsService.deactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oauth-apps'] })
    },
  })
}

/** Fetch third-party apps authorized by user. */
export function useOAuthAuthorizations() {
  return useQuery({
    queryKey: ['oauth-authorizations'],
    queryFn: () => oauthAppsService.listAuthorizations(),
  })
}

/** Revoke a third-party authorization. */
export function useRevokeOAuthAuthorization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => oauthAppsService.revokeAuthorization(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oauth-authorizations'] })
    },
  })
}

// ═════════════════════════════════════════════════════════════
// ADDRESSES (polymorphic — reusable for any object type)
// ═════════════════════════════════════════════════════════════

/** Fetch addresses for a given owner (owner_type + owner_id). */
export function useAddresses(ownerType: string, ownerId: string | undefined) {
  return useQuery({
    queryKey: ['addresses', ownerType, ownerId],
    queryFn: () => addressesService.list(ownerType, ownerId!),
    enabled: !!ownerId,
  })
}

/** Convenience: fetch addresses for the current user. */
export function useUserAddresses() {
  const userId = useAuthStore((s) => s.user?.id)
  return useAddresses('user', userId)
}

/** Create a new address. */
export function useCreateAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: AddressCreate) => addressesService.create(payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['addresses', variables.owner_type, variables.owner_id] })
    },
  })
}

/** Update an address. */
export function useUpdateAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AddressUpdate }) =>
      addressesService.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] })
    },
  })
}

/** Delete an address. */
export function useDeleteAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => addressesService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] })
    },
  })
}

// ═════════════════════════════════════════════════════════════
// NOTIFICATION PREFERENCES
// ═════════════════════════════════════════════════════════════

/** Fetch notification preferences. */
export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => notificationPrefsService.get(),
  })
}

/** Update notification preferences. */
export function useUpdateNotificationPreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: NotificationPreferenceUpdate) => notificationPrefsService.update(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-preferences'] })
    },
  })
}

// ═════════════════════════════════════════════════════════════
// AUDIT LOG
// ═════════════════════════════════════════════════════════════

/** Fetch paginated audit log entries with optional filters. */
export function useAuditLog(params: {
  page?: number
  page_size?: number
  action?: string
  resource_type?: string
  date_from?: string
  date_to?: string
} = {}) {
  return useQuery({
    queryKey: ['audit-log', params],
    queryFn: () => auditLogService.list(params),
  })
}

// ═════════════════════════════════════════════════════════════
// ROLES & PERMISSIONS (read-only for current user)
// ═════════════════════════════════════════════════════════════

/** Fetch current user's roles. */
export function useUserRoles() {
  return useQuery({
    queryKey: ['user-roles'],
    queryFn: () => rolesService.getUserRoles(),
    staleTime: 5 * 60_000, // roles rarely change, cache 5min
  })
}

/** Fetch groups the user belongs to. */
export function useUserGroups() {
  return useQuery({
    queryKey: ['user-groups'],
    queryFn: () => rolesService.getUserGroups(),
    staleTime: 5 * 60_000,
  })
}

/** Fetch effective permissions matrix. */
export function useUserPermissions() {
  return useQuery({
    queryKey: ['user-permissions'],
    queryFn: () => rolesService.getUserPermissions(),
    staleTime: 5 * 60_000,
  })
}

// ═════════════════════════════════════════════════════════════
// MFA (Two-Factor Authentication)
// ═════════════════════════════════════════════════════════════

/** Fetch MFA status (enabled, has_totp). */
export function useMFAStatus() {
  return useQuery({
    queryKey: ['mfa-status'],
    queryFn: () => mfaService.getStatus(),
  })
}

/** Start MFA setup — returns secret + provisioning URI. */
export function useMFASetup() {
  return useMutation({
    mutationFn: () => mfaService.setup(),
  })
}

/** Verify TOTP code to complete setup — enables MFA + returns backup codes. */
export function useMFAVerifySetup() {
  const qc = useQueryClient()
  const fetchUser = useAuthStore((s) => s.fetchUser)

  return useMutation({
    mutationFn: (code: string) => mfaService.verifySetup(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mfa-status'] })
      fetchUser()
    },
  })
}

/** Disable MFA (requires password). */
export function useMFADisable() {
  const qc = useQueryClient()
  const fetchUser = useAuthStore((s) => s.fetchUser)

  return useMutation({
    mutationFn: (password: string) => mfaService.disable(password),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mfa-status'] })
      fetchUser()
    },
  })
}

/** Regenerate backup codes (requires password). */
export function useMFARegenerateCodes() {
  return useMutation({
    mutationFn: (password: string) => mfaService.regenerateCodes(password),
  })
}

// ═════════════════════════════════════════════════════════════
// TAGS (polymorphic — reusable for any object type)
// ═════════════════════════════════════════════════════════════

/** Fetch tags for a given owner (owner_type + owner_id). */
export function useTags(ownerType: string, ownerId: string | undefined) {
  return useQuery({
    queryKey: ['tags', ownerType, ownerId],
    queryFn: () => tagsService.list(ownerType, ownerId!),
    enabled: !!ownerId,
  })
}

/** Fetch tags as a nested tree. */
export function useTagTree(ownerType: string, ownerId: string | undefined) {
  return useQuery({
    queryKey: ['tags', 'tree', ownerType, ownerId],
    queryFn: () => tagsService.tree(ownerType, ownerId!),
    enabled: !!ownerId,
  })
}

/** Search tags by name (autocomplete). Only fires when query ≥ 1 char. */
export function useTagSearch(query: string, ownerType?: string, ownerId?: string) {
  return useQuery({
    queryKey: ['tags', 'search', query, ownerType, ownerId],
    queryFn: () => tagsService.search(query, ownerType, ownerId),
    enabled: query.length >= 1,
    staleTime: 30_000,
  })
}

/** Create a new tag. */
export function useCreateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TagCreate) => tagsService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

/** Update a tag. */
export function useUpdateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TagUpdate }) =>
      tagsService.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

/** Delete a tag. */
export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tagsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

// ═════════════════════════════════════════════════════════════
// PHONES (polymorphic — reusable for any object type)
// ═════════════════════════════════════════════════════════════

export function usePhones(ownerType: string, ownerId: string | undefined) {
  return useQuery({
    queryKey: ['phones', ownerType, ownerId],
    queryFn: () => phonesService.list(ownerType, ownerId!),
    enabled: !!ownerId,
  })
}

export function useCreatePhone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: PhoneCreate) => phonesService.create(payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['phones', variables.owner_type, variables.owner_id] })
    },
  })
}

export function useUpdatePhone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PhoneUpdate }) =>
      phonesService.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['phones'] })
    },
  })
}

export function useDeletePhone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => phonesService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['phones'] })
    },
  })
}

// ═════════════════════════════════════════════════════════════
// CONTACT EMAILS (polymorphic — reusable for any object type)
// ═════════════════════════════════════════════════════════════

export function useContactEmails(ownerType: string, ownerId: string | undefined) {
  return useQuery({
    queryKey: ['contact-emails', ownerType, ownerId],
    queryFn: () => contactEmailsService.list(ownerType, ownerId!),
    enabled: !!ownerId,
  })
}

export function useCreateContactEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ContactEmailCreate) => contactEmailsService.create(payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['contact-emails', variables.owner_type, variables.owner_id] })
    },
  })
}

export function useUpdateContactEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ContactEmailUpdate }) =>
      contactEmailsService.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-emails'] })
    },
  })
}

export function useDeleteContactEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => contactEmailsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-emails'] })
    },
  })
}

// ═════════════════════════════════════════════════════════════
// NOTES (polymorphic — reusable for any object type)
// ═════════════════════════════════════════════════════════════

/** Fetch notes for a given owner (owner_type + owner_id). */
export function useNotes(ownerType: string, ownerId: string | undefined) {
  return useQuery({
    queryKey: ['notes', ownerType, ownerId],
    queryFn: () => notesService.list(ownerType, ownerId!),
    enabled: !!ownerId,
  })
}

/** Create a new note. */
export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: NoteCreate) => notesService.create(payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['notes', variables.owner_type, variables.owner_id] })
    },
  })
}

/** Update a note. */
export function useUpdateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: NoteUpdate }) =>
      notesService.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

/** Delete a note. */
export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => notesService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

// ═════════════════════════════════════════════════════════════
// ATTACHMENTS (polymorphic — reusable for any object type)
// ═════════════════════════════════════════════════════════════

/** Fetch attachments for a given owner (owner_type + owner_id). */
export function useAttachments(ownerType: string, ownerId: string | undefined) {
  return useQuery({
    queryKey: ['attachments', ownerType, ownerId],
    queryFn: () => attachmentsService.list(ownerType, ownerId!),
    enabled: !!ownerId,
  })
}

/** Upload a file attachment. */
export function useUploadAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ownerType, ownerId, file, description }: {
      ownerType: string; ownerId: string; file: File; description?: string
    }) => attachmentsService.upload(ownerType, ownerId, file, description),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['attachments', variables.ownerType, variables.ownerId] })
    },
  })
}

/** Delete a file attachment. */
export function useDeleteAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => attachmentsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attachments'] })
    },
  })
}

// ═════════════════════════════════════════════════════════════
// SOCIAL NETWORKS (polymorphic — reusable for any object type)
// ═════════════════════════════════════════════════════════════

export function useSocialNetworks(ownerType: string, ownerId: string | undefined) {
  return useQuery({
    queryKey: ['social-networks', ownerType, ownerId],
    queryFn: () => socialNetworkService.list(ownerType, ownerId!),
    enabled: !!ownerId,
  })
}

export function useCreateSocialNetwork() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: SocialNetworkCreate) => socialNetworkService.create(payload),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['social-networks', v.owner_type, v.owner_id] }) },
  })
}

export function useUpdateSocialNetwork() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<SocialNetworkCreate> }) =>
      socialNetworkService.update(id, payload),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['social-networks', data.owner_type, data.owner_id] }) },
  })
}

export function useDeleteSocialNetwork() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; ownerType: string; ownerId: string }) =>
      socialNetworkService.remove(vars.id),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['social-networks', v.ownerType, v.ownerId] }) },
  })
}

// ═════════════════════════════════════════════════════════════
// OPENING HOURS (polymorphic — reusable for any object type)
// ═════════════════════════════════════════════════════════════

export function useOpeningHours(ownerType: string, ownerId: string | undefined) {
  return useQuery({
    queryKey: ['opening-hours', ownerType, ownerId],
    queryFn: () => openingHourService.list(ownerType, ownerId!),
    enabled: !!ownerId,
  })
}

export function useCreateOpeningHour() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: OpeningHourCreate) => openingHourService.create(payload),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['opening-hours', v.owner_type, v.owner_id] }) },
  })
}

export function useUpdateOpeningHour() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<OpeningHourCreate> }) =>
      openingHourService.update(id, payload),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['opening-hours', data.owner_type, data.owner_id] }) },
  })
}

export function useDeleteOpeningHour() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; ownerType: string; ownerId: string }) =>
      openingHourService.remove(vars.id),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['opening-hours', v.ownerType, v.ownerId] }) },
  })
}

// ═════════════════════════════════════════════════════════════
// COST IMPUTATIONS (polymorphic)
// ═════════════════════════════════════════════════════════════

export function useCostImputations(ownerType: string, ownerId: string | undefined) {
  return useQuery({
    queryKey: ['cost-imputations', ownerType, ownerId],
    queryFn: () => costImputationsService.list(ownerType, ownerId!),
    enabled: !!ownerId,
  })
}

export function useCreateCostImputation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CostImputationCreate) => costImputationsService.create(payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['cost-imputations', variables.owner_type, variables.owner_id] })
    },
  })
}

export function useDeleteCostImputation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; ownerType: string; ownerId: string }) =>
      costImputationsService.remove(vars.id),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['cost-imputations', v.ownerType, v.ownerId] }) },
  })
}

export function useUpdateCostImputation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; ownerType: string; ownerId: string; payload: CostImputationUpdate }) =>
      costImputationsService.update(id, payload),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['cost-imputations', v.ownerType, v.ownerId] })
    },
  })
}

export function useCostCenters(params: { page?: number; page_size?: number; search?: string } = {}) {
  return useQuery({
    queryKey: ['cost-centers', params],
    queryFn: () => costCentersService.list(params),
  })
}

export function useBusinessUnits(params: { page?: number; page_size?: number; search?: string } = {}) {
  return useQuery({
    queryKey: ['business-units', params],
    queryFn: () => businessUnitsService.list(params),
  })
}

export function useScopedSettings(scope: string) {
  return useQuery({
    queryKey: ['settings', scope],
    queryFn: () => scopedSettingsService.list(scope),
  })
}

export function useScopedSettingsMap(scope: string) {
  return useQuery({
    queryKey: ['settings', scope, 'map'],
    queryFn: () => scopedSettingsService.map(scope),
  })
}

export function useImputationReferences() {
  return useQuery({
    queryKey: ['imputation-references'],
    queryFn: () => imputationReferenceService.list(),
  })
}

export function useCreateImputationReference() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ImputationReferenceCreate) => imputationReferenceService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imputation-references'] })
    },
  })
}

export function useUpdateImputationReference() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ImputationReferenceUpdate }) =>
      imputationReferenceService.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imputation-references'] })
    },
  })
}

export function useDeleteImputationReference() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => imputationReferenceService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imputation-references'] })
      qc.invalidateQueries({ queryKey: ['imputation-assignments'] })
    },
  })
}

export function useImputationOtpTemplates() {
  return useQuery({
    queryKey: ['imputation-otp-templates'],
    queryFn: () => imputationOtpTemplateService.list(),
  })
}

export function useCreateImputationOtpTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ImputationOtpTemplateCreate) => imputationOtpTemplateService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imputation-otp-templates'] })
    },
  })
}

export function useUpdateImputationOtpTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ImputationOtpTemplateUpdate }) =>
      imputationOtpTemplateService.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imputation-otp-templates'] })
      qc.invalidateQueries({ queryKey: ['imputation-references'] })
    },
  })
}

export function useDeleteImputationOtpTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => imputationOtpTemplateService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imputation-otp-templates'] })
      qc.invalidateQueries({ queryKey: ['imputation-references'] })
    },
  })
}

export function useImputationAssignments(params: { target_type?: string; target_id?: string } = {}) {
  return useQuery({
    queryKey: ['imputation-assignments', params],
    queryFn: () => imputationAssignmentService.list(params),
  })
}

export function useCreateImputationAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ImputationAssignmentCreate) => imputationAssignmentService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imputation-assignments'] })
    },
  })
}

export function useUpdateImputationAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ImputationAssignmentUpdate }) =>
      imputationAssignmentService.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imputation-assignments'] })
    },
  })
}

export function useDeleteImputationAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => imputationAssignmentService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imputation-assignments'] })
    },
  })
}

export function useSaveScopedSetting(scope: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      scopedSettingsService.put(scope, key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', scope] })
      qc.invalidateQueries({ queryKey: ['settings', scope, 'map'] })
    },
  })
}
