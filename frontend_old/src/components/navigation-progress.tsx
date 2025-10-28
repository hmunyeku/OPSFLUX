"use client"

import { useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"

/**
 * NavigationProgress - Barre de progression linéaire en haut de la page
 * Affichée lors de la navigation entre les pages
 * Conforme FRONTEND_RULES.md: Pas de spinner, uniquement des indicateurs visuels non-rotatifs
 */
export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNavigating, setIsNavigating] = useState(false)

  useEffect(() => {
    // Reset navigation state when route changes
    setIsNavigating(false)
  }, [pathname, searchParams])

  useEffect(() => {
    // Listen for route changes
    const handleStart = () => setIsNavigating(true)
    const handleComplete = () => setIsNavigating(false)

    // Use MutationObserver to detect when Next.js updates the DOM
    const observer = new MutationObserver(() => {
      // Check if there's a navigation in progress
      const isLoading = document.querySelector('[data-nextjs-router-loading]')
      if (isLoading) {
        handleStart()
      } else {
        handleComplete()
      }
    })

    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
    }
  }, [])

  if (!isNavigating) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50 animate-pulse">
      <div className="h-full w-full bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-shimmer" />
    </div>
  )
}

/**
 * NavigationSpinner - SUPPRIMÉ
 * Ancienne version avec spinner Loader2 (violation FRONTEND_RULES.md)
 * La barre de progression NavigationProgress suffit pour indiquer la navigation
 */
