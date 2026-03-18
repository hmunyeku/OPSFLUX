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

interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  language: string
  avatar_url: string | null
  default_entity_id: string | null
}

/** Custom error thrown when MFA is required after password step. */
export class MFARequiredError extends Error {
  constructor() {
    super('MFA_REQUIRED')
    this.name = 'MFARequiredError'
  }
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  currentEntityId: string | null

  // MFA challenge state
  mfaToken: string | null
  mfaPending: boolean

  login: (email: string, password: string) => Promise<void>
  verifyMfa: (code: string) => Promise<void>
  clearMfa: () => void
  logout: () => void
  fetchUser: () => Promise<void>
  setCurrentEntity: (entityId: string) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('access_token'),
  isLoading: false,
  currentEntityId: localStorage.getItem('entity_id'),
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
    localStorage.setItem('access_token', access_token)
    localStorage.setItem('refresh_token', refresh_token)
    set({ isAuthenticated: true, mfaToken: null, mfaPending: false })

    const userRes = await api.get('/api/v1/auth/me')
    const user = userRes.data
    if (user.default_entity_id) {
      localStorage.setItem('entity_id', user.default_entity_id)
    }
    set({ user, currentEntityId: localStorage.getItem('entity_id') })
  },

  verifyMfa: async (code: string) => {
    const mfaToken = get().mfaToken
    if (!mfaToken) throw new Error('No MFA session')

    const res = await api.post('/api/v1/auth/mfa-verify', {
      mfa_token: mfaToken,
      code,
    })
    const { access_token, refresh_token } = res.data
    localStorage.setItem('access_token', access_token)
    localStorage.setItem('refresh_token', refresh_token)
    set({ isAuthenticated: true, mfaToken: null, mfaPending: false })

    const userRes = await api.get('/api/v1/auth/me')
    const user = userRes.data
    if (user.default_entity_id) {
      localStorage.setItem('entity_id', user.default_entity_id)
    }
    set({ user, currentEntityId: localStorage.getItem('entity_id') })
  },

  clearMfa: () => set({ mfaToken: null, mfaPending: false }),

  setCurrentEntity: (entityId: string) => {
    localStorage.setItem('entity_id', entityId)
    set({ currentEntityId: entityId })
  },

  logout: () => {
    const refreshToken = localStorage.getItem('refresh_token')
    if (refreshToken) {
      api.post('/api/v1/auth/logout', { refresh_token: refreshToken }).catch(() => {})
    }
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('entity_id')
    set({ user: null, isAuthenticated: false, currentEntityId: null, mfaToken: null, mfaPending: false })
  },

  fetchUser: async () => {
    try {
      set({ isLoading: true })
      const res = await api.get('/api/v1/auth/me')
      const user = res.data
      // Ensure entity_id is always set from user profile
      if (user.default_entity_id && localStorage.getItem('entity_id') !== user.default_entity_id) {
        localStorage.setItem('entity_id', user.default_entity_id)
      }
      set({ user, isAuthenticated: true, currentEntityId: localStorage.getItem('entity_id') })
    } catch {
      set({ user: null, isAuthenticated: false, currentEntityId: null })
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
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
