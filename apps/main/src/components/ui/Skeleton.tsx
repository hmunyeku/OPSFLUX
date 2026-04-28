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

/**
 * Shape that matches a DynamicPanel detail surface: header bar,
 * 2-column field grid, body paragraph. Replaces the centered
 * Loader2 spinner that flashed across every detail-panel route
 * (planner activity, project, MOC, paxlog ADS, packlog cargo, …)
 * with a layout-stable skeleton — fewer reflows when the data
 * lands.
 */
export function SkeletonDetailPanel({ className }: { className?: string }) {
  return (
    <div className={cn('p-4 space-y-4', className)}>
      {/* Header (title + meta) */}
      <div className="flex items-start gap-3">
        <Skeleton className="h-6 w-6 rounded-md shrink-0" />
        <div className="flex-1 space-y-2 min-w-0">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      {/* 2-col field grid */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-1/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
      {/* Body paragraph */}
      <div className="space-y-2 pt-2 border-t border-border/40">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  )
}
