/**
 * AnimatedCounter — counts up from 0 (or the previous value) to the
 * target over ~600ms. Pure JS rAF, no dependency. Used on KPI /
 * StatCard / dashboard widget values to make fresh numbers feel
 * alive instead of snapping in.
 *
 * Respects prefers-reduced-motion by snapping directly to the target
 * without animation.
 *
 * Usage:
 *   <AnimatedCounter value={total_tasks} />
 *   <AnimatedCounter value={0.94} format={v => `${Math.round(v*100)}%`} />
 *
 * When the component re-receives a new `value` prop, it animates
 * from the last displayed value to the new one — smooth updates on
 * polling data (dashboard KPIs that refresh every minute).
 */

import { useEffect, useRef, useState } from 'react'

interface AnimatedCounterProps {
  value: number
  /** Duration in ms. Default 600ms. */
  duration?: number
  /** Formats the rendered value. Default: integer toLocaleString. */
  format?: (v: number) => string
  className?: string
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

export function AnimatedCounter({
  value,
  duration = 600,
  format,
  className,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState<number>(value)
  const fromRef = useRef<number>(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    // If reduced-motion: snap
    if (prefersReducedMotion()) {
      fromRef.current = value
      setDisplay(value)
      return
    }

    const start = performance.now()
    const from = fromRef.current
    const to = value

    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(1, elapsed / duration)
      const eased = easeOutCubic(progress)
      const current = from + (to - from) * eased
      setDisplay(current)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
        rafRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [value, duration])

  const formatted = format
    ? format(display)
    : Math.round(display).toLocaleString()

  return <span className={className}>{formatted}</span>
}
