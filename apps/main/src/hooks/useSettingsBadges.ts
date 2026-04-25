/**
 * useSettingsBadges — Fetches lightweight badge counts for settings sidebar items.
 *
 * Returns a Record<string, number | undefined> mapping section IDs to counts.
 * Uses the same service functions as the settings tabs themselves, with a long
 * staleTime so badges don't cause excessive network requests.
 *
 * Only sections where a count is meaningful get a badge:
 *  - tokens, applications, sessions, emails (user settings)
 *  - roles (user roles + groups)
 *  - users, assets, email-templates (general/admin settings)
 */
import { useQuery } from '@tanstack/react-query'
import { tokensService, sessionsService, emailsService, oauthAppsService, rolesService } from '@/services/settingsService'
import { usersService } from '@/services/usersService'
import { assetsService } from '@/services/assetsService'
import api from '@/lib/api'
import type { EmailTemplateSummary } from '@/hooks/useEmailTemplates'

const BADGE_STALE_TIME = 60_000 // 1 minute

export function useSettingsBadges(): Record<string, number | undefined> {
  // ── User settings badges ──

  const tokens = useQuery({
    queryKey: ['settings-badge', 'tokens'],
    queryFn: async () => {
      const data = await tokensService.list({ page: 1, page_size: 1 })
      return data.total
    },
    staleTime: BADGE_STALE_TIME,
  })

  const apps = useQuery({
    queryKey: ['settings-badge', 'applications'],
    queryFn: async () => {
      const data = await oauthAppsService.list()
      return data.length
    },
    staleTime: BADGE_STALE_TIME,
  })

  const sessions = useQuery({
    queryKey: ['settings-badge', 'sessions'],
    queryFn: async () => {
      const data = await sessionsService.list()
      return data.length
    },
    staleTime: BADGE_STALE_TIME,
  })

  const emails = useQuery({
    queryKey: ['settings-badge', 'emails'],
    queryFn: async () => {
      const data = await emailsService.list()
      return data.length
    },
    staleTime: BADGE_STALE_TIME,
  })

  const roles = useQuery({
    queryKey: ['settings-badge', 'roles'],
    queryFn: async () => {
      const data = await rolesService.getUserRoles()
      return data.length
    },
    staleTime: BADGE_STALE_TIME,
  })

  // ── General/admin settings badges ──

  const users = useQuery({
    queryKey: ['settings-badge', 'users'],
    queryFn: async () => {
      const data = await usersService.list({ page: 1, page_size: 1 })
      return data.total
    },
    staleTime: BADGE_STALE_TIME,
  })

  const assets = useQuery({
    queryKey: ['settings-badge', 'assets'],
    queryFn: async () => {
      const data = await assetsService.list({ page: 1, page_size: 1 })
      return data.total
    },
    staleTime: BADGE_STALE_TIME,
  })

  const templates = useQuery({
    queryKey: ['settings-badge', 'email-templates'],
    queryFn: async () => {
      const { data } = await api.get<EmailTemplateSummary[]>('/api/v1/email-templates')
      return data.length
    },
    staleTime: BADGE_STALE_TIME,
  })

  return {
    tokens: tokens.data,
    applications: apps.data,
    sessions: sessions.data,
    emails: emails.data,
    roles: roles.data,
    users: users.data,
    assets: assets.data,
    'email-templates': templates.data,
  }
}
