import { cn } from '@/lib/utils'

/**
 * Helper to build a style object for a loader square. CSS custom
 * properties (--dx/--dy/--rot) must go through a Record<string, string>
 * cast to avoid the TypeScript "multiple properties with the same
 * name" error that fires when using `['--x' as 'width']` patterns.
 */
function makeSquareStyle(
  origin: readonly [number, number],
  s: number,
  dx: string,
  dy: string,
  rot: string,
  delay: string,
): React.CSSProperties {
  return {
    transformOrigin: `${origin[0] + s / 2}px ${origin[1] + s / 2}px`,
    animationDelay: delay,
    ...({ '--dx': dx, '--dy': dy, '--rot': rot } as Record<string, string>),
  } as React.CSSProperties
}

interface LoaderFallbackProps {
  /** Inline = shows in the current container; full-screen otherwise. */
  variant?: 'full' | 'inline'
  className?: string
}

/**
 * LoaderFallback — shown while route bundles download or a Suspense
 * boundary resolves.
 *
 * Visual metaphor for OpsFlux: four squares start scattered + rotated
 * (chaos) and animate into a clean 2×2 grid (order). Loops forever
 * while the content is pending. Reads as "the system is getting
 * organised" rather than a generic spinner — matches the product's
 * promise.
 *
 * Respects prefers-reduced-motion: under reduce-motion we swap the
 * animation for a gentle brightness pulse on the already-aligned
 * grid.
 */
export function LoaderFallback({ variant = 'full', className }: LoaderFallbackProps) {
  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center justify-center p-4', className)}>
        <OrderLoader size="small" />
      </div>
    )
  }
  return (
    <div className={cn('flex flex-col items-center justify-center h-dvh bg-background gap-4', className)}>
      <OrderLoader size="large" />
      <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase motion-safe:animate-pulse">
        Chargement
      </p>
    </div>
  )
}

/**
 * OrderLoader — 4 squares scattering + snapping back into a 2×2
 * grid. Each square is a CSS-animated rect with its own keyframe,
 * offset in delay so the motion reads as "things falling into
 * place" rather than a synchronized ballet.
 */
function OrderLoader({ size }: { size: 'small' | 'large' }) {
  const dim = size === 'large' ? 64 : 24
  // Square side. Gap between the 2 cells of the aligned grid.
  const s = size === 'large' ? 22 : 9
  const gap = size === 'large' ? 4 : 2
  // Grid cell centres (aligned state). Origin at (0,0) of 64/24 box.
  const half = dim / 2
  const offset = s / 2 + gap / 2
  const tl: [number, number] = [half - offset - s / 2, half - offset - s / 2]
  const tr: [number, number] = [half + offset - s / 2, half - offset - s / 2]
  const bl: [number, number] = [half - offset - s / 2, half + offset - s / 2]
  const br: [number, number] = [half + offset - s / 2, half + offset - s / 2]

  const radius = size === 'large' ? 4 : 2
  // Unique animation names keep the keyframes scoped to the component
  const id = size
  return (
    <div className="relative" style={{ width: dim, height: dim }} role="status" aria-label="Chargement en cours">
      {/* Soft primary→highlight halo behind the grid. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/20 to-highlight/15 blur-md motion-safe:animate-pulse"
      />
      <svg
        width={dim}
        height={dim}
        viewBox={`0 0 ${dim} ${dim}`}
        className="relative overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`opsflux-loader-${id}-a`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--primary-hover))" />
          </linearGradient>
          <linearGradient id={`opsflux-loader-${id}-b`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--highlight))" />
          </linearGradient>
        </defs>
        {/* Four squares — each has its own scatter→align loop with a
            delay so the group reads as four independent agents
            finding their slot, not one synchronized animation. */}
        <rect
          className="opsflux-loader-square"
          x={tl[0]}
          y={tl[1]}
          width={s}
          height={s}
          rx={radius}
          fill={`url(#opsflux-loader-${id}-a)`}
          style={makeSquareStyle(tl, s, `-${s * 0.7}px`, `-${s * 0.5}px`, '-22deg', '0ms')}
        />
        <rect
          className="opsflux-loader-square"
          x={tr[0]}
          y={tr[1]}
          width={s}
          height={s}
          rx={radius}
          fill={`url(#opsflux-loader-${id}-b)`}
          style={makeSquareStyle(tr, s, `${s * 0.6}px`, `-${s * 0.6}px`, '18deg', '150ms')}
        />
        <rect
          className="opsflux-loader-square"
          x={bl[0]}
          y={bl[1]}
          width={s}
          height={s}
          rx={radius}
          fill={`url(#opsflux-loader-${id}-a)`}
          style={makeSquareStyle(bl, s, `-${s * 0.5}px`, `${s * 0.7}px`, '12deg', '300ms')}
        />
        <rect
          className="opsflux-loader-square"
          x={br[0]}
          y={br[1]}
          width={s}
          height={s}
          rx={radius}
          fill={`url(#opsflux-loader-${id}-b)`}
          style={makeSquareStyle(br, s, `${s * 0.7}px`, `${s * 0.5}px`, '-20deg', '450ms')}
        />
      </svg>
    </div>
  )
}
