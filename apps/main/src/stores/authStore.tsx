/**
 * Auth store (Zustand) + AuthProvider wrapper.
 *
 * MFA flow:
 *   1. login(email, password) → if server returns mfa_required=true,
 *      store mfa_token in state and throw MFARequiredError
 *   2. LoginPage catches it and switches to MFA challenge view
 *   3. verifyMfa(code) → sends mfa_token + code → gets real tokens
 */
import React, { createContext, useEffect } from 'react'
import { create } from 'zustand'
import api from '@/lib/api'
import { safeLocal } from '@/lib/safeStorage'

interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  language: string
  avatar_url: string | null
  default_entity_id: string | null
  // HR Identity
  passport_name: string | null
  gender: string | null
  nationality: string | null
  birth_country: string | null
  birth_date: string | null
  birth_city: string | null
  // Travel
  contractual_airport: string | null
  nearest_airport: string | null
  nearest_station: string | null
  loyalty_program: string | null
  // Health / Medical
  last_medical_check: string | null
  last_international_medical_check: string | null
  last_subsidiary_medical_check: string | null
  // Body measurements / PPE
  height: number | null
  weight: number | null
  ppe_clothing_size: string | null
  ppe_clothing_size_bottom: string | null
  ppe_shoe_size: string | null
  // Misc
  retirement_date: string | null
  vantage_number: string | null
  extension_number: string | null
  // Job position (conformité)
  job_position_id: string | null
  job_position_name: string | null
  // Organization
  business_unit_id: string | null
  business_unit_name: string | null
  // Messaging preference
  preferred_messaging_channel: string
}

interface AccessibleEntity {
  id: string
}

/** Custom error thrown when MFA is required after password step. */
export class MFARequiredError extends Error {
  constructor() {
    super('MFA_REQUIRED')
    this.name = 'MFARequiredError'
  }
}

function resolveCurrentEntityId(user: User): string | null {
  const storedEntityId = safeLocal.getItem('entity_id')
  if (storedEntityId) {
    return storedEntityId
  }
  if (user.default_entity_id) {
    safeLocal.setItem('entity_id', user.default_entity_id)
    return user.default_entity_id
  }
  return null
}

async function resolveAccessibleCurrentEntityId(user: User): Promise<string | null> {
  try {
    const { data } = await api.get<AccessibleEntity[]>('/api/v1/auth/me/entities')
    const accessibleIds = new Set((Array.isArray(data) ? data : []).map((entity) => entity.id))
    const storedEntityId = safeLocal.getItem('entity_id')
    if (storedEntityId && accessibleIds.has(storedEntityId)) {
      return storedEntityId
    }
    if (user.default_entity_id && accessibleIds.has(user.default_entity_id)) {
      safeLocal.setItem('entity_id', user.default_entity_id)
      return user.default_entity_id
    }
    const fallbackEntityId = (Array.isArray(data) ? data[0]?.id : null) || null
    if (fallbackEntityId) {
      safeLocal.setItem('entity_id', fallbackEntityId)
      return fallbackEntityId
    }
    safeLocal.removeItem('entity_id')
    return null
  } catch {
    return resolveCurrentEntityId(user)
  }
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  currentEntityId: string | null
  actingContext: string

  // MFA challenge state
  mfaToken: string | null
  mfaPending: boolean

  login: (email: string, password: string) => Promise<void>
  verifyMfa: (code: string) => Promise<void>
  clearMfa: () => void
  logout: () => void
  fetchUser: () => Promise<void>
  setCurrentEntity: (entityId: string) => void
  setActingContext: (contextKey: string) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: !!safeLocal.getItem('access_token'),
  isLoading: false,
  currentEntityId: safeLocal.getItem('entity_id'),
  actingContext: safeLocal.getItem('acting_context') || 'own',
  mfaToken: null,
  mfaPending: false,

  login: async (email: string, password: string) => {
    const res = await api.post('/api/v1/auth/login', { email, password })
    const data = res.data

    // MFA required — store token and signal caller
    if (data.mfa_required && data.mfa_token) {
      set({ mfaToken: data.mfa_token, mfaPending: true })
      throw new MFARequiredError()
    }

    // No MFA — store tokens and fetch user
    const { access_token, refresh_token } = data
    safeLocal.setItem('access_token', access_token)
    safeLocal.setItem('refresh_token', refresh_token)
    set({ isAuthenticated: true, mfaToken: null, mfaPending: false })

    // Reload i18n from server now that we have a token
    import('@/lib/i18n').then(({ reloadTranslationsAfterAuth }) => reloadTranslationsAfterAuth()).catch(() => {})

    const userRes = await api.get('/api/v1/auth/me')
    const user = userRes.data
    set({ user, currentEntityId: await resolveAccessibleCurrentEntityId(user) })
  },

  verifyMfa: async (code: string) => {
    const mfaToken = get().mfaToken
    if (!mfaToken) throw new Error('No MFA session')

    const res = await api.post('/api/v1/auth/mfa-verify', {
      mfa_token: mfaToken,
      code,
    })
    const { access_token, refresh_token } = res.data
    safeLocal.setItem('access_token', access_token)
    safeLocal.setItem('refresh_token', refresh_token)
    set({ isAuthenticated: true, mfaToken: null, mfaPending: false })

    const userRes = await api.get('/api/v1/auth/me')
    const user = userRes.data
    set({ user, currentEntityId: await resolveAccessibleCurrentEntityId(user) })
  },

  clearMfa: () => set({ mfaToken: null, mfaPending: false }),

  setCurrentEntity: (entityId: string) => {
    safeLocal.setItem('entity_id', entityId)
    set({ currentEntityId: entityId })
  },

  setActingContext: (contextKey: string) => {
    const value = contextKey || 'own'
    safeLocal.setItem('acting_context', value)
    set({ actingContext: value })
  },

  logout: () => {
    const refreshToken = safeLocal.getItem('refresh_token')
    if (refreshToken) {
      api.post('/api/v1/auth/logout', { refresh_token: refreshToken }).catch(() => {})
    }
    safeLocal.removeItem('access_token')
    safeLocal.removeItem('refresh_token')
    safeLocal.removeItem('entity_id')
    safeLocal.removeItem('acting_context')
    set({ user: null, isAuthenticated: false, currentEntityId: null, actingContext: 'own', mfaToken: null, mfaPending: false })
  },

  fetchUser: async () => {
    try {
      set({ isLoading: true })
      const res = await api.get('/api/v1/auth/me')
      const user = res.data
      set({ user, isAuthenticated: true, currentEntityId: await resolveAccessibleCurrentEntityId(user) })
    } catch (err: unknown) {
      // Only logout on explicit 401 (unauthorized) — NOT on network errors or 500s
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401) {
        set({ user: null, isAuthenticated: false, currentEntityId: null, actingContext: 'own' })
        safeLocal.removeItem('access_token')
        safeLocal.removeItem('refresh_token')
        safeLocal.removeItem('acting_context')
      }
      // For other errors (500, network), keep current auth state — don't force logout
    } finally {
      set({ isLoading: false })
    }
  },
}))

// AuthProvider — fetch user on mount if token exists
const AuthContext = createContext<null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, fetchUser } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated) {
      fetchUser()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <AuthContext.Provider value={null}>{children}</AuthContext.Provider>
}
