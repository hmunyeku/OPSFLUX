import { cn } from '@/lib/utils'

interface LoaderFallbackProps {
  /** Inline = shows in the current container; full-screen otherwise. */
  variant?: 'full' | 'inline'
  className?: string
}

/**
 * LoaderFallback — shown while route bundles download or a Suspense
 * boundary resolves.
 *
 * The default ("full") variant paints a subtle gradient orb with a
 * brand-tinted ring that rotates. Feels intentional, not "something
 * is broken". The inline variant keeps the classic small spinner so
 * it doesn't dominate embed contexts.
 *
 * Both respect prefers-reduced-motion.
 */
export function LoaderFallback({ variant = 'full', className }: LoaderFallbackProps) {
  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center justify-center p-4', className)}>
        <LoaderOrb size="small" />
      </div>
    )
  }
  return (
    <div className={cn('flex items-center justify-center h-dvh bg-background', className)}>
      <LoaderOrb size="large" />
    </div>
  )
}

function LoaderOrb({ size }: { size: 'small' | 'large' }) {
  const dim = size === 'large' ? 'h-16 w-16' : 'h-6 w-6'
  return (
    <div className={cn('relative', dim)} role="status" aria-label="Loading">
      {/* Soft primary → highlight halo behind the orb */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-highlight/20 blur-md motion-safe:animate-pulse" />
      {/* Orbital ring — rotates slowly. Top-arc darker for a heartbeat feel. */}
      <div
        className="absolute inset-0 rounded-full border-2 border-transparent motion-safe:animate-spin motion-reduce:animate-pulse"
        style={{
          borderTopColor: 'hsl(var(--primary))',
          borderRightColor: 'hsl(var(--primary) / 0.25)',
          animationDuration: '1.2s',
        }}
      />
      {/* Core dot — gradient, no spin, for visual anchor */}
      <div className={cn(
        'absolute inset-0 m-auto rounded-full bg-gradient-to-br from-primary to-highlight shadow-md shadow-primary/30',
        size === 'large' ? 'h-4 w-4' : 'h-2 w-2',
      )} />
    </div>
  )
}
