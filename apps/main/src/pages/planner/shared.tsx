/**
 * Shared types, constants and helpers for the Planner page.
 *
 * Extracted from the original monolithic `PlannerPage.tsx` during the
 * tabs/panels split. Consumed by files under `./tabs/` and `./panels/`
 * and by `PlannerPage.tsx` itself.
 */
import { CalendarRange, ListTodo, AlertTriangle, BarChart3, Calendar, Wrench, HardHat, Gauge, Shield, Drill, Eye, GanttChart, FlaskConical, TrendingUp, LayoutDashboard } from 'lucide-react'
import type { TimeScale } from '@/components/shared/gantt/ganttEngine'
import { cn } from '@/lib/utils'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'

// ── Tab definitions ───────────────────────────────────────────

export type PlannerTab = 'dashboard' | 'gantt' | 'activities' | 'conflicts' | 'capacity' | 'scenarios' | 'forecast'

// Tab definitions use i18n keys — the labels are resolved at render time
// inside PlannerPage via useMemo + useTranslation.
// Activités comes before Plan: most users land on the planner to
// triage activities, not to scroll the Gantt — keep the most-used
// view first. Dashboard stays leftmost as the project-wide overview.
export const TAB_DEFS: { id: PlannerTab; labelKey: string; icon: typeof CalendarRange }[] = [
  { id: 'dashboard', labelKey: 'common.tab_dashboard', icon: LayoutDashboard },
  { id: 'activities', labelKey: 'planner.tabs.activities', icon: ListTodo },
  { id: 'gantt', labelKey: 'planner.tabs.timeline', icon: GanttChart },
  { id: 'conflicts', labelKey: 'planner.tabs.conflicts', icon: AlertTriangle },
  { id: 'capacity', labelKey: 'planner.tabs.capacity', icon: BarChart3 },
  { id: 'scenarios', labelKey: 'planner.tabs.scenarios', icon: FlaskConical },
  { id: 'forecast', labelKey: 'planner.tabs.forecast', icon: TrendingUp },
]

export const VALID_PLANNER_TABS = new Set<PlannerTab>(['dashboard', 'gantt', 'activities', 'conflicts', 'capacity', 'scenarios', 'forecast'])

// ── Constants ─────────────────────────────────────────────────

export const PLANNER_ACTIVITY_STATUS_VALUES = ['draft', 'submitted', 'validated', 'in_progress', 'completed', 'rejected', 'cancelled'] as const
export const PLANNER_ACTIVITY_TYPE_VALUES = ['project', 'workover', 'drilling', 'integrity', 'maintenance', 'permanent_ops', 'inspection', 'event'] as const
export const PLANNER_PRIORITY_VALUES = ['low', 'medium', 'high', 'critical'] as const
export const PLANNER_CONFLICT_STATUS_VALUES = ['open', 'resolved', 'deferred'] as const
export const PLANNER_RESOLUTION_VALUES = ['approve_both', 'reschedule', 'reduce_pax', 'cancel', 'deferred'] as const
export const PLANNER_DEP_TYPE_VALUES = ['FS', 'SS', 'FF', 'SF'] as const

/** Extract a human error message from an axios error (FastAPI detail). */
export function extractApiError(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string }
  const detail = e.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    // Pydantic validation errors
    return detail.map((d) => (typeof d === 'object' && d && 'msg' in d ? (d as { msg: string }).msg : String(d))).join(' · ')
  }
  return e.message
}

export const ACTIVITY_STATUS_LABELS_FALLBACK: Record<string, string> = {
  draft: 'Brouillon',
  submitted: 'Soumis',
  validated: 'Validé',
  in_progress: 'En cours',
  completed: 'Terminé',
  rejected: 'Rejeté',
  cancelled: 'Annulé',
}

export const ACTIVITY_STATUS_BADGES: Record<string, string> = {
  draft: 'gl-badge-neutral',
  submitted: 'gl-badge-info',
  validated: 'gl-badge-success',
  rejected: 'gl-badge-danger',
  in_progress: 'gl-badge-warning',
  completed: 'gl-badge-success',
  cancelled: 'gl-badge-neutral',
}

export const ACTIVITY_TYPE_LABELS_FALLBACK: Record<string, string> = {
  project: 'Projet',
  workover: 'Workover',
  drilling: 'Forage',
  integrity: 'Intégrité',
  maintenance: 'Maintenance',
  permanent_ops: 'Ops permanentes',
  inspection: 'Inspection',
  event: 'Événement',
}

export const ACTIVITY_TYPE_META: Record<string, { badge: string; icon: typeof Wrench }> = {
  project: { badge: 'gl-badge-info', icon: ListTodo },
  workover: { badge: 'gl-badge-warning', icon: Wrench },
  drilling: { badge: 'gl-badge-danger', icon: Drill },
  integrity: { badge: 'gl-badge-success', icon: Shield },
  maintenance: { badge: 'gl-badge-warning', icon: HardHat },
  permanent_ops: { badge: 'gl-badge-neutral', icon: Gauge },
  inspection: { badge: 'gl-badge-info', icon: Eye },
  event: { badge: 'gl-badge-neutral', icon: Calendar },
}

export const PRIORITY_LABELS_FALLBACK: Record<string, string> = {
  low: 'Basse',
  medium: 'Moyenne',
  high: 'Haute',
  critical: 'Critique',
}

export const PRIORITY_CLASS_MAP: Record<string, string> = {
  low: 'text-muted-foreground',
  medium: 'text-foreground',
  high: 'text-amber-600 dark:text-amber-400',
  critical: 'text-destructive font-semibold',
}

export const CONFLICT_STATUS_LABELS_FALLBACK: Record<string, string> = {
  open: 'Ouvert',
  resolved: 'Résolu',
  deferred: 'Différé',
}

export const CONFLICT_STATUS_BADGES: Record<string, string> = {
  open: 'gl-badge-danger',
  resolved: 'gl-badge-success',
  deferred: 'gl-badge-warning',
}

export const RESOLUTION_LABELS_FALLBACK: Record<string, string> = {
  approve_both: 'Approuver les deux',
  reschedule: 'Replanifier',
  reduce_pax: 'Réduire PAX',
  cancel: 'Annuler une activité',
  deferred: 'Reporter la décision',
}

export const DEP_TYPE_LABELS_FALLBACK: Record<string, string> = {
  FS: 'Fin-Début (FS)',
  SS: 'Début-Début (SS)',
  FF: 'Fin-Fin (FF)',
  SF: 'Début-Fin (SF)',
}

export const VALID_SCALES: ReadonlySet<TimeScale> = new Set<TimeScale>(['day', 'week', 'month', 'quarter', 'semester'])

export interface PlannerTimelinePref {
  scale: TimeScale
  start: string
  end: string
}

// ── Helpers ───────────────────────────────────────────────────

export function buildDictionaryOptions(labels: Record<string, string>, values: readonly string[], allLabel?: string) {
  return [
    ...(allLabel ? [{ value: '', label: allLabel }] : []),
    ...values.map((value) => ({ value, label: labels[value] ?? value })),
  ]
}

export function formatDateShort(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateOnly(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

/** Display 'min–max' for a variable POB schedule, or the constant if all equal */
export function formatVariablePaxRange(daily: Record<string, number> | null | undefined, fallback: number): string {
  if (!daily || Object.keys(daily).length === 0) return String(fallback)
  const values = Object.values(daily).filter((v): v is number => typeof v === 'number')
  if (values.length === 0) return String(fallback)
  const min = Math.min(...values)
  const max = Math.max(...values)
  return min === max ? String(min) : `${min}–${max}`
}

export function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

export function shiftTimelineRange(scale: TimeScale, start: string, end: string, direction: -1 | 1): { start: string; end: string } {
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (scale === 'day') {
    startDate.setDate(startDate.getDate() + direction)
    endDate.setDate(endDate.getDate() + direction)
  } else if (scale === 'week') {
    startDate.setDate(startDate.getDate() + 7 * direction)
    endDate.setDate(endDate.getDate() + 7 * direction)
  } else if (scale === 'month') {
    startDate.setMonth(startDate.getMonth() + direction)
    endDate.setMonth(endDate.getMonth() + direction)
  } else if (scale === 'quarter') {
    startDate.setMonth(startDate.getMonth() + 3 * direction)
    endDate.setMonth(endDate.getMonth() + 3 * direction)
  } else {
    startDate.setMonth(startDate.getMonth() + 6 * direction)
    endDate.setMonth(endDate.getMonth() + 6 * direction)
  }
  return { start: toISODate(startDate), end: toISODate(endDate) }
}

/**
 * Repair an old persisted timeline range that was bitten by the pre-fix
 * `toISO` UTC-drift bug. See original PlannerPage.tsx for full context.
 */
export function repairTimelineRange(
  scale: TimeScale,
  start: string,
  end: string,
): { start: string; end: string } {
  if (scale !== 'month' && scale !== 'quarter' && scale !== 'semester') {
    return { start, end }
  }
  const parseLocal = (iso: string): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    if (!m) return null
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }
  const sDate = parseLocal(start)
  const eDate = parseLocal(end)
  if (!sDate || !eDate) return { start, end }

  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  let startFixed = sDate
  if (sDate.getDate() > 25) {
    startFixed = new Date(sDate.getFullYear(), sDate.getMonth() + 1, 1)
  } else if (sDate.getDate() !== 1) {
    startFixed = new Date(sDate.getFullYear(), sDate.getMonth(), 1)
  }

  let endFixed = eDate
  const lastOfMonth = new Date(eDate.getFullYear(), eDate.getMonth() + 1, 0)
  if (eDate.getDate() !== lastOfMonth.getDate()) {
    endFixed = lastOfMonth
  }

  return { start: fmt(startFixed), end: fmt(endFixed) }
}

// ── Shared UI atoms ───────────────────────────────────────────

export function StatusBadge({ status, labels, badges }: { status: string; labels: Record<string, string>; badges: Record<string, string> }) {
  return (
    <span className={cn('gl-badge', badges[status] || 'gl-badge-neutral')}>
      {labels[status] || status.replace(/_/g, ' ')}
    </span>
  )
}

export function StatCard({ label, value, icon: Icon, accent, sparkline, onClick, active }: {
  label: string
  value: string | number
  icon: typeof CalendarRange
  accent?: string
  /** Optional sparkline values (≥2 numbers) plotted as a tiny inline
   *  area chart between the label and the value. Skipped when not
   *  provided or when all values are zero. */
  sparkline?: number[]
  /** Click handler — when provided the card becomes a button that
   *  activates the associated filter on the table. */
  onClick?: () => void
  /** Highlight the card when the associated filter is currently
   *  active (set by the parent based on filter state). */
  active?: boolean
}) {
  // Single-line layout: [icon] LABEL ── sparkline ── VALUE.
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-2 rounded-lg border bg-gradient-to-br from-background to-background/60 px-3 py-1.5 overflow-hidden transition-all w-full text-left',
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
        : 'from-primary/80 to-highlight/40',
      )} />
      <Icon size={13} className="text-muted-foreground shrink-0 ml-0.5" />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{label}</span>
      {/* Spacer pushes sparkline + value to the right edge */}
      <span className="flex-1" />
      {sparkline && sparkline.length >= 2 && sparkline.some(v => v > 0) && (
        <Sparkline values={sparkline} accent={accent} />
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

// Tiny inline sparkline — renders an area chart in ~60×18 px. Stroke
// inherits the StatCard accent (defaults to primary) so the spark
// reads as the "trend of this metric".
function Sparkline({ values, accent }: { values: number[]; accent?: string }) {
  const W = 64, H = 18
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(1, max - min)
  const step = W / Math.max(1, values.length - 1)
  const pts = values.map((v, i) => [i * step, H - 2 - ((v - min) / range) * (H - 4)] as const)
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  const tone = accent?.includes('red') || accent?.includes('destructive') ? '#ef4444'
    : accent?.includes('amber') || accent?.includes('yellow') ? '#f59e0b'
    : accent?.includes('emerald') || accent?.includes('green') ? '#10b981'
    : accent?.includes('blue') ? '#3b82f6'
    : accent?.includes('violet') || accent?.includes('purple') ? '#8b5cf6'
    : 'hsl(var(--primary))'
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 ml-auto">
      <path d={area} fill={tone} fillOpacity={0.15} />
      <path d={line} fill="none" stroke={tone} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
