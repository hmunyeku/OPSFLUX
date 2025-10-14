"use client"

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'

const publicPaths = ['/login', '/register', '/forgot-password', '/401', '/403', '/404', '/503', '/error']

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const pathname = usePathname()

  useEffect(() => {
    if (isLoading) return

    const isPublicPath = publicPaths.some((path) => pathname.startsWith(path))

    // Si pas authentifié et sur une page protégée, rediriger vers login
    if (!isAuthenticated && !isPublicPath) {
      // Force hard reload to clear all cached state
      window.location.href = '/login'
      return
    }

    // Si authentifié et sur une page d'auth, rediriger vers dashboard
    if (isAuthenticated && (pathname === '/login' || pathname === '/register')) {
      window.location.href = '/'
    }
  }, [isAuthenticated, isLoading, pathname])

  // Afficher un loader pendant la vérification
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return <>{children}</>
}
