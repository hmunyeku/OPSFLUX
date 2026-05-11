/**
 * TravelWiz — small UI primitives shared by tabs and panels.
 */
import { Component, type ReactNode, type ErrorInfo } from 'react'
import { cn } from '@/lib/utils'
import type { Plane } from 'lucide-react'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'

export function StatusBadge({ status, labels, badges }: { status: string; labels: Record<string, string>; badges: Record<string, string> }) {
  return (
    <span className={cn('chip', badges[status] || '')}>
      {labels[status] || status.replace(/_/g, ' ')}
    </span>
  )
}

/**
 * StatCard — version compacte single-line alignée sur Planner/PaxLog.
 *
 * Bastien feedback: les stats du haut (Voyages tab) prenaient trop de
 * place sur mobile et même desktop. L'ancienne version 2-lignes
 * (icone+label en haut, valeur en bas, p-3 rounded-xl) faisait ~80px
 * de hauteur par card. La nouvelle version single-line: [accent rail]
 * [icon] LABEL ── sparkline ── VALUE, ~32px de hauteur, sparkline
 * conditionnelle qui se cache via container queries quand la card
 * est étroite.
 */
export function StatCard({ label, value, icon: Icon, accent, sparkline, onClick, active }: {
  label: string
  value: string | number
  icon: typeof Plane
  accent?: string
  /** Sparkline values (≥2) plotted as inline area chart. Hidden when narrow or all-zero. */
  sparkline?: number[]
  /** Click handler — fait de la card un bouton-filtre cliquable. */
  onClick?: () => void
  /** Highlight quand le filtre associé est actif. */
  active?: boolean
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        '@container/kpi group relative flex items-center gap-2 rounded-lg border bg-gradient-to-br from-background to-background/60 px-3 py-1.5 overflow-hidden transition-all text-left shrink-0 snap-start w-[160px] @md/stats:w-full',
        onClick && 'cursor-pointer hover:border-primary/50 hover:shadow-sm',
        active ? 'border-primary/60 ring-1 ring-primary/30 bg-primary/5' : 'border-border/70 hover:border-border',
      )}
    >
      <div className={cn(
        'absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b',
        accent?.includes('red') || accent?.includes('destructive') ? 'from-red-500/80 to-red-400/40'
        : accent?.includes('amber') || accent?.includes('yellow')  ? 'from-amber-500/80 to-amber-400/40'
        : accent?.includes('emerald') || accent?.includes('green') ? 'from-emerald-500/80 to-emerald-400/40'
        : accent?.includes('violet') || accent?.includes('purple') ? 'from-violet-500/80 to-violet-400/40'
        : accent?.includes('blue') ? 'from-blue-500/80 to-blue-400/40'
        : 'from-primary/80 to-primary/40',
      )} />
      <Icon size={13} className="text-muted-foreground shrink-0 ml-0.5" />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{label}</span>
      <span className="flex-1" />
      {sparkline && sparkline.length >= 2 && sparkline.some(v => v > 0) && (
        <span className="hidden @[180px]/kpi:inline-flex shrink-0">
          <Sparkline values={sparkline} accent={accent} />
        </span>
      )}
      <span className={cn(
        'text-lg font-bold tabular-nums font-display tracking-tight leading-none',
        accent || 'text-foreground',
      )}>
        {typeof value === 'number' ? <AnimatedCounter value={value} /> : value}
      </span>
    </Tag>
  )
}

/** Tiny inline sparkline — area chart 64×18 px aligned on Planner Sparkline. */
function Sparkline({ values, accent }: { values: number[]; accent?: string }) {
  const W = 64, H = 18
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W
    const y = H - ((v - min) / range) * (H - 2) - 1
    return [x, y]
  })
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${path} L${W},${H} L0,${H} Z`
  const stroke = accent?.includes('red') ? '#ef4444'
    : accent?.includes('amber') ? '#f59e0b'
    : accent?.includes('emerald') || accent?.includes('green') ? '#10b981'
    : accent?.includes('blue') ? '#3b82f6'
    : 'currentColor'
  return (
    <svg width={W} height={H} className="text-primary/60" aria-hidden="true">
      <path d={area} fill={stroke} fillOpacity={0.12} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** Simple error boundary to prevent FleetMap Leaflet crashes from breaking the whole page. */
export class MapErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError(_: Error) { return { hasError: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.warn('[MapErrorBoundary]', error.message, info.componentStack?.slice(0, 200)) }
  render() {
    if (this.state.hasError) {
      return <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">Carte indisponible</div>
    }
    return this.props.children
  }
}
