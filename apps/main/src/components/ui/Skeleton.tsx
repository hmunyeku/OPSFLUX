/**
 * Skeleton — shimmering placeholder for loading UIs.
 *
 * Usage:
 *   <Skeleton className="h-4 w-24" />
 *   <SkeletonText lines={3} />
 *   <SkeletonCircle size={32} />
 *
 * Animation is driven by a CSS keyframe (`skeleton-shimmer`) defined
 * in index.css. Falls back to a plain pulsing block under
 * `prefers-reduced-motion`.
 */

import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
  /** If true, no shimmer (useful inside already-animated containers). */
  noShimmer?: boolean
}

export function Skeleton({ className, noShimmer }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="loading"
      className={cn(
        'rounded-md bg-muted/50 dark:bg-muted/30',
        !noShimmer && 'relative overflow-hidden motion-safe:skeleton-shimmer',
        // Reduce-motion fallback — simple opacity pulse
        'motion-reduce:animate-pulse',
        className,
      )}
    />
  )
}

export function SkeletonText({
  lines = 3,
  className,
  lastLineWidth = 'w-3/4',
}: {
  lines?: number
  className?: string
  /** Tailwind width class for the last line — mimics a paragraph tail. */
  lastLineWidth?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3', i === lines - 1 ? lastLineWidth : 'w-full')}
        />
      ))}
    </div>
  )
}

export function SkeletonCircle({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <div
      role="status"
      aria-label="loading"
      style={{ width: size, height: size }}
      className={cn(
        'rounded-full bg-muted/50 dark:bg-muted/30 relative overflow-hidden motion-safe:skeleton-shimmer motion-reduce:animate-pulse',
        className,
      )}
    />
  )
}

/** Convenience card placeholder used on list views. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border p-4 space-y-3', className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  )
}
