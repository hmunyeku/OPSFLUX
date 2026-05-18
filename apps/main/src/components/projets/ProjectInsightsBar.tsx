import type { ReactNode } from 'react'
import { CalendarDays, CircleDollarSign, Clock3, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Project } from '@/types/api'

interface Props {
  project: Project
  forecastEndDate?: string | null
  committedAmount?: number | null
  forecastAmount?: number | null
  width?: number
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n))
}

function asDateOnly(iso: string | null | undefined): string | null {
  return iso?.split('T')[0] || null
}

function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
}

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return '0%'
  const rounded = Math.round(n * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`
}

function fmtMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency || 'EUR',
      notation: 'compact',
      maximumFractionDigits: Math.abs(n) >= 10_000_000 ? 0 : 1,
    }).format(n)
  } catch {
    const abs = Math.abs(n)
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} M`
    if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)} k`
    return `${Math.round(n)}`
  }
}

function fmtDurationFromDays(days: number): string {
  const abs = Math.abs(days)
  const prefix = days > 0 ? '+' : days < 0 ? '-' : ''
  if (abs < 1) return '0 j'
  if (abs < 28) return `${prefix}${Math.round(abs)} j`
  if (abs < 365) return `${prefix}${Math.round(abs / 30.44)} mois`
  const years = Math.round((abs / 365.25) * 10) / 10
  return `${prefix}${years} an${years > 1 ? 's' : ''}`
}

function daysBetween(a: number, b: number): number {
  return Math.round((b - a) / 86_400_000)
}

function Track({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('relative h-2.5 overflow-hidden rounded-full bg-muted/70 ring-1 ring-border/70', className)}>
      {children}
    </div>
  )
}

function SummaryPill({
  label,
  value,
  tone = 'muted',
}: {
  label: string
  value: string
  tone?: 'muted' | 'primary' | 'good' | 'bad'
}) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
        tone === 'primary' && 'bg-primary/10 text-primary',
        tone === 'good' && 'bg-green-500/10 text-green-700 dark:text-green-400',
        tone === 'bad' && 'bg-red-500/10 text-red-700 dark:text-red-400',
        tone === 'muted' && 'bg-muted/70 text-muted-foreground',
      )}
    >
      <span className="text-muted-foreground/80">{label}</span>
      <span className="truncate text-foreground/90">{value}</span>
    </span>
  )
}

function RowShell({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-center">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
          <Icon size={14} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-foreground">{title}</div>
          <div className="truncate text-[10px] text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function ProjectInsightsBar({
  project,
  forecastEndDate,
  committedAmount,
  forecastAmount,
}: Props) {
  const budget = project.budget ?? 0
  const progress = clamp(project.progress ?? 0)
  const committed = committedAmount ?? (budget > 0 ? budget * (progress / 100) : 0)
  const forecast = forecastAmount ?? budget
  const hasBudget = budget > 0 || committed > 0 || forecast > 0
  const budgetBase = Math.max(budget, forecast, committed, 1)
  const committedPct = budget > 0 ? (committed / budget) * 100 : 0
  const committedWidth = clamp((committed / budgetBase) * 100)
  const budgetWidth = clamp((budget / budgetBase) * 100)
  const forecastWidth = clamp((forecast / budgetBase) * 100)
  const isOverBudget = budget > 0 && forecast > budget

  const startISO = asDateOnly(project.start_date)
  const plannedEndISO = asDateOnly(project.end_date)
  const forecastEndISO = asDateOnly(forecastEndDate ?? project.actual_end_date) ?? plannedEndISO
  const hasPlanning = !!(startISO && plannedEndISO)

  const startMs = startISO ? new Date(startISO).getTime() : 0
  const plannedEndMs = plannedEndISO ? new Date(plannedEndISO).getTime() : 0
  const forecastEndMs = forecastEndISO ? new Date(forecastEndISO).getTime() : plannedEndMs
  const nowMs = Date.now()
  const isComplete = progress >= 100
  const scaleEndMs = Math.max(plannedEndMs, forecastEndMs, isComplete ? plannedEndMs : nowMs)
  const totalScaleMs = Math.max(1, scaleEndMs - startMs)
  const plannedDurationMs = Math.max(1, plannedEndMs - startMs)
  const elapsedMs = nowMs - startMs
  const timePct = clamp((elapsedMs / plannedDurationMs) * 100, 0, 999)
  const todayPos = clamp((Math.max(0, elapsedMs) / totalScaleMs) * 100)
  const plannedEndPos = clamp((plannedDurationMs / totalScaleMs) * 100)
  const progressWidth = clamp((progress / 100) * plannedEndPos)
  const overrunDays = Math.max(0, daysBetween(plannedEndMs, forecastEndMs))
  const isFuture = hasPlanning && elapsedMs < 0
  const elapsedLabel = isFuture ? 'À venir' : `${fmtPct(timePct)} du temps`

  if (!hasBudget && !hasPlanning) {
    return (
      <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-center text-[11px] text-muted-foreground">
        Définissez un budget ou des dates de début/fin pour afficher les indicateurs.
      </div>
    )
  }

  return (
    <div className="space-y-4 py-1">
      {hasBudget && (
        <RowShell
          icon={CircleDollarSign}
          title="Budget"
          subtitle={fmtMoney(budget, project.currency)}
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex flex-wrap gap-1.5">
                <SummaryPill label="Engagé" value={`${fmtMoney(committed, project.currency)} · ${fmtPct(committedPct)}`} tone="primary" />
                <SummaryPill
                  label="Prévision"
                  value={fmtMoney(forecast, project.currency)}
                  tone={isOverBudget ? 'bad' : 'good'}
                />
              </div>
              {isOverBudget && (
                <span className="text-[10px] font-medium text-red-600 dark:text-red-400">
                  Dépassement {fmtPct(((forecast - budget) / budget) * 100)}
                </span>
              )}
            </div>
            <Track>
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary/15"
                style={{ width: `${budgetWidth}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                style={{ width: `${committedWidth}%` }}
              />
              {isOverBudget && (
                <div
                  className="absolute inset-y-0 bg-red-500"
                  style={{
                    left: `${budgetWidth}%`,
                    width: `${Math.max(0, forecastWidth - budgetWidth)}%`,
                  }}
                />
              )}
            </Track>
          </div>
        </RowShell>
      )}

      {hasPlanning && (
        <RowShell
          icon={CalendarDays}
          title="Planning"
          subtitle={`${fmtShortDate(startISO)} → ${fmtShortDate(plannedEndISO)}`}
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex flex-wrap gap-1.5">
                <SummaryPill label="Avancement" value={fmtPct(progress)} tone="primary" />
                <SummaryPill label="Temps" value={elapsedLabel} tone={isFuture ? 'muted' : timePct > progress + 15 ? 'bad' : 'good'} />
                {overrunDays > 0 && <SummaryPill label="Glissement" value={fmtDurationFromDays(overrunDays)} tone="bad" />}
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock3 size={11} />
                {fmtShortDate(forecastEndISO)}
              </span>
            </div>
            <div className="space-y-1.5">
              <Track>
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary/15"
                  style={{ width: `${plannedEndPos}%` }}
                />
                {overrunDays > 0 && (
                  <div
                    className="absolute inset-y-0 bg-red-500/80"
                    style={{ left: `${plannedEndPos}%`, width: `${100 - plannedEndPos}%` }}
                  />
                )}
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary"
                  style={{ width: `${progressWidth}%` }}
                />
                {!isComplete && !isFuture && (
                  <span
                    className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-foreground/70"
                    style={{ left: `${todayPos}%` }}
                  />
                )}
              </Track>
              <div className="grid grid-cols-3 text-[10px] text-muted-foreground">
                <span className="truncate text-left">{fmtShortDate(startISO)}</span>
                <span className="truncate text-center">{isFuture ? 'Démarrage futur' : "Aujourd'hui"}</span>
                <span className="truncate text-right">{fmtShortDate(forecastEndISO)}</span>
              </div>
            </div>
          </div>
        </RowShell>
      )}
    </div>
  )
}
