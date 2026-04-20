/**
 * useViewTransitionNavigate — wraps react-router's navigate() in the
 * browser's View Transitions API when available. Under the hood calls
 * `document.startViewTransition(() => navigate(path))`, which triggers
 * the `::view-transition-old/new(root)` keyframes defined in
 * index.css.
 *
 * Falls back to plain navigate on unsupported browsers (Firefox ≤
 * 133, older Safari) and under prefers-reduced-motion.
 *
 * Usage:
 *   const nav = useViewTransitionNavigate()
 *   nav('/projets/123')
 *
 * Progressive enhancement: swap an existing `navigate()` call for
 * `nav()` anywhere cross-page transitions feel abrupt. Not applied
 * globally to avoid surprise behaviour on hot paths.
 */

import { useCallback } from 'react'
import { useNavigate, type NavigateOptions, type To } from 'react-router-dom'

type StartViewTransition = (cb: () => void) => unknown

function canViewTransition(): boolean {
  if (typeof document === 'undefined') return false
  if (!(document as unknown as { startViewTransition?: StartViewTransition }).startViewTransition) return false
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
  return true
}

export function useViewTransitionNavigate() {
  const navigate = useNavigate()
  return useCallback(
    (to: To, options?: NavigateOptions) => {
      const doNav = () => navigate(to, options)
      if (canViewTransition()) {
        ;(document as unknown as { startViewTransition: StartViewTransition }).startViewTransition(doNav)
      } else {
        doNav()
      }
    },
    [navigate],
  )
}
