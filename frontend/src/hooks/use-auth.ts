/**
 * Authentication hook for client components
 */

import { useState, useEffect } from 'react'
import { api, User, Token2FARequired, is2FARequired } from '@/lib/api'
import { auth } from '@/lib/auth'

interface UseAuthReturn {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  isLoggingOut: boolean
  twoFactorRequired: Token2FARequired | null
  login: (email: string, password: string) => Promise<void>
  verify2FA: (code: string, method: string) => Promise<void>
  cancel2FA: () => void
  logout: () => void
  refreshUser: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [twoFactorRequired, setTwoFactorRequired] = useState<Token2FARequired | null>(null)

  useEffect(() => {
    const loadUser = async () => {
      const token = auth.getToken()
      if (token) {
        try {
          const userData = await api.getMe(token)
          setUser(userData)
        } catch {
          auth.removeToken()
        }
      }
      setIsLoading(false)
    }

    loadUser()
  }, [])

  const login = async (email: string, password: string) => {
    try {
      const response = await api.login({ username: email, password })

      // Vérifier si le 2FA est requis
      if (is2FARequired(response)) {
        setTwoFactorRequired(response)
        return
      }

      // Pas de 2FA - login direct
      auth.setToken(response.access_token)

      // Fetch user data
      const userData = await api.getMe(response.access_token)
      setUser(userData)

      // Force immediate redirect using window.location
      window.location.href = '/'
    } catch (error) {
      throw error
    }
  }

  const verify2FA = async (code: string, method: string) => {
    if (!twoFactorRequired) {
      throw new Error('No 2FA verification in progress')
    }

    try {
      const response = await api.verify2FA({
        temp_token: twoFactorRequired.temp_token,
        code,
        method,
      })

      auth.setToken(response.access_token)

      // Fetch user data
      const userData = await api.getMe(response.access_token)
      setUser(userData)

      // Clear 2FA state
      setTwoFactorRequired(null)

      // Force immediate redirect using window.location
      window.location.href = '/'
    } catch (error) {
      throw error
    }
  }

  const cancel2FA = () => {
    setTwoFactorRequired(null)
  }

  const logout = () => {
    setIsLoggingOut(true)
    auth.removeToken()
    setUser(null)
    setTwoFactorRequired(null)
    // Force hard reload to clear all cache and state
    window.location.href = '/login'
  }

  const refreshUser = async () => {
    const token = auth.getToken()
    if (token) {
      try {
        const userData = await api.getMe(token)
        setUser(userData)
      } catch (error) {
        console.error('Failed to refresh user:', error)
        throw error
      }
    }
  }

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isLoggingOut,
    twoFactorRequired,
    login,
    verify2FA,
    cancel2FA,
    logout,
    refreshUser,
  }
}
