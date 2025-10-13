/**
 * Authentication hook for client components
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api, User } from '@/lib/api'
import { auth } from '@/lib/auth'

interface UseAuthReturn {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

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
      auth.setToken(response.access_token)

      // Fetch user data
      const userData = await api.getMe(response.access_token)
      setUser(userData)

      router.push('/')
    } catch (error) {
      throw error
    }
  }

  const logout = () => {
    auth.removeToken()
    setUser(null)
    router.push('/login')
  }

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  }
}
