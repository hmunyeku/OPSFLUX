"use client"

import { useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"

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

export function NavigationSpinner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNavigating, setIsNavigating] = useState(false)

  useEffect(() => {
    // Reset navigation state when route changes
    setIsNavigating(false)
  }, [pathname, searchParams])

  useEffect(() => {
    // Intercept all link clicks to show loading state
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest('a')

      if (link && link.href && !link.target && link.href.startsWith(window.location.origin)) {
        // Internal navigation
        const url = new URL(link.href)
        if (url.pathname !== pathname) {
          setIsNavigating(true)
        }
      }
    }

    document.addEventListener('click', handleClick)

    return () => {
      document.removeEventListener('click', handleClick)
    }
  }, [pathname])

  if (!isNavigating) return null

  return (
    <div className="flex items-center justify-center">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  )
}
