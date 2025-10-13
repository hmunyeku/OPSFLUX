"use client"

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'

const publicPaths = ['/login', '/register', '/forgot-password', '/401', '/403', '/404', '/503', '/error']

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (isLoading) return

    const isPublicPath = publicPaths.some((path) => pathname.startsWith(path))

    // Si pas authentifié et sur une page protégée, rediriger vers login
    if (!isAuthenticated && !isPublicPath) {
      router.push('/login')
    }

    // Si authentifié et sur une page d'auth, rediriger vers dashboard
    if (isAuthenticated && (pathname === '/login' || pathname === '/register')) {
      router.push('/')
    }
  }, [isAuthenticated, isLoading, pathname, router])

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
