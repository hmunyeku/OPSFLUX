"use client"

import { Suspense, useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"

function NavigationProgressInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Start loading animation when route changes
    setIsLoading(true)
    setProgress(20)

    // Simulate progress
    const timer1 = setTimeout(() => setProgress(40), 100)
    const timer2 = setTimeout(() => setProgress(60), 200)
    const timer3 = setTimeout(() => setProgress(80), 400)

    // Complete after route change is done
    const completeTimer = setTimeout(() => {
      setProgress(100)
      setTimeout(() => {
        setIsLoading(false)
        setProgress(0)
      }, 200)
    }, 600)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
      clearTimeout(completeTimer)
    }
  }, [pathname, searchParams])

  if (!isLoading && progress === 0) {
    return null
  }

  return (
    <div
      className="relative w-full h-1 bg-primary/10 overflow-hidden"
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-primary/90 to-primary shadow-lg shadow-primary/30"
        style={{
          width: `${progress}%`,
          transition: progress === 100 ? "width 0.2s ease-out" : "width 0.3s ease-out",
        }}
      />
    </div>
  )
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  )
}
