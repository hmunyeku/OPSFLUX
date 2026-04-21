/**
 * TravelWiz — small UI primitives shared by tabs and panels.
 */
import { Component, type ReactNode, type ErrorInfo } from 'react'
import { cn } from '@/lib/utils'
import type { Plane } from 'lucide-react'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'

export function StatusBadge({ status, labels, badges }: { status: string; labels: Record<string, string>; badges: Record<string, string> }) {
  return (
    <span className={cn('gl-badge', badges[status] || 'gl-badge-neutral')}>
      {labels[status] || status.replace(/_/g, ' ')}
    </span>
  )
}

export function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: typeof Plane; accent?: string }) {
  return (
    <div className="group relative rounded-xl border border-border/70 bg-gradient-to-br from-background to-background/60 p-3 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-border">
      {/* Accent strip — see planner/shared.tsx for the full palette. */}
      <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-gradient-to-r from-primary/80 to-highlight/40" />
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon size={13} className={accent} />
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground tabular-nums font-display tracking-tight">
        {typeof value === 'number' ? <AnimatedCounter value={value} /> : value}
      </p>
    </div>
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
