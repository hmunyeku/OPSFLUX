/**
 * Admin supervision dashboard for the autonomous maintenance agent.
 *
 * Shows aggregated metrics (volume, success rate, cost), a daily
 * timeseries sparkline, circuit-breaker state, and the 10 most
 * recent failed/rejected runs with a click-through to the ticket.
 *
 * Data source: GET /api/v1/support/agent/supervision?window_days=N
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useUIStore } from '@/stores/uiStore'
import {
  Activity, AlertTriangle, CheckCircle2, XCircle, Clock, DollarSign,
  TrendingUp, Zap, Shield, Loader2, RotateCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SupervisionSummary {
  window_days: number
  total_runs: number
  runs_by_status: Record<string, number>
  success_rate: number
  active_runs: number
  total_cost_usd: number
  total_tokens: number
  avg_wall_time_seconds: number | null
  avg_cost_usd: number | null
  monthly_budget_usd: number
  monthly_spent_usd: number
  budget_used_ratio: number
  circuit_breaker_tripped_at: string | null
  consecutive_failures: number
  daily_timeseries: { date: string; total: number; success: number; failed: number }[]
  recent_failures: {
    id: string
    ticket_id: string
    status: string
    current_phase: string
    error_message: string
    created_at: string
    ended_at: string | null
    cost_usd: number
  }[]
}

function useSupervision(windowDays: number) {
  return useQuery({
    queryKey: ['agent-supervision', windowDays],
    queryFn: async () => {
      const { data } = await api.get<SupervisionSummary>(
        '/api/v1/support/agent/supervision',
        { params: { window_days: windowDays } },
      )
      return data
    },
    refetchInterval: 30_000,
  })
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

function StatCard({
  icon: Icon, label, value, sublabel, tone = 'default',
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sublabel?: string
  tone?: 'default' | 'success' | 'warning' | 'danger'
}) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
  }[tone]
  const bgClass = {
    default: 'bg-muted/40',
    success: 'bg-emerald-500/10',
    warning: 'bg-amber-500/10',
    danger: 'bg-red-500/10',
  }[tone]
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <div className={cn('h-7 w-7 rounded-md flex items-center justify-center', bgClass)}>
          <Icon size={14} className={toneClass} />
        </div>
      </div>
      <div className={cn('mt-2 text-2xl font-bold tabular-nums', toneClass)}>{value}</div>
      {sublabel && <div className="mt-0.5 text-[11px] text-muted-foreground">{sublabel}</div>}
    </div>
  )
}

function Sparkline({ data }: { data: { date: string; total: number; success: number; failed: number }[] }) {
  if (data.length === 0) return null
  const max = Math.max(1, ...data.map(d => d.total))
  return (
    <div className="flex items-end gap-0.5 h-16">
      {data.map((d) => {
        const h = Math.round((d.total / max) * 100)
        return (
          <div
            key={d.date}
            className="flex-1 min-w-[4px] relative group"
            title={`${d.date}: ${d.total} runs (${d.success} ok, ${d.failed} failed)`}
          >
            {d.total > 0 && (
              <div className="absolute bottom-0 left-0 right-0 flex flex-col">
                {d.failed > 0 && (
                  <div
                    className="bg-red-500/70"
                    style={{ height: `${Math.round((d.failed / d.total) * h)}%` }}
                  />
                )}
                {d.success > 0 && (
                  <div
                    className="bg-emerald-500/70"
                    style={{ height: `${Math.round((d.success / d.total) * h)}%` }}
                  />
                )}
                {d.total - d.success - d.failed > 0 && (
                  <div
                    className="bg-muted-foreground/40"
                    style={{ height: `${Math.round(((d.total - d.success - d.failed) / d.total) * h)}%` }}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function AgentSupervisionPanel() {
  const [windowDays, setWindowDays] = useState(7)
  const { data, isLoading, refetch } = useSupervision(windowDays)
  const qc = useQueryClient()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  if (isLoading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  const cbTone: 'danger' | 'success' = data.circuit_breaker_tripped_at ? 'danger' : 'success'
  const budgetTone: 'default' | 'warning' | 'danger' =
    data.budget_used_ratio > 1 ? 'danger' : data.budget_used_ratio > 0.8 ? 'warning' : 'default'
  const successTone: 'success' | 'warning' | 'danger' =
    data.success_rate >= 0.8 ? 'success' : data.success_rate >= 0.5 ? 'warning' : 'danger'

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {/* Window selector + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              className={cn(
                'gl-button-sm',
                windowDays === d ? 'gl-button-primary' : 'gl-button-default',
              )}
            >
              {d}j
            </button>
          ))}
        </div>
        <button
          onClick={() => { void qc.invalidateQueries({ queryKey: ['agent-supervision'] }); void refetch() }}
          className="gl-button-sm gl-button-default"
          title="Rafraîchir"
        >
          <RotateCw size={12} />
        </button>
      </div>

      {/* Circuit-breaker banner */}
      {data.circuit_breaker_tripped_at && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-600 dark:text-red-400 shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-semibold text-red-700 dark:text-red-400">Circuit breaker actif</span>
            <span className="text-muted-foreground"> — déclenché le {new Date(data.circuit_breaker_tripped_at).toLocaleString('fr-FR')} après {data.consecutive_failures} échecs consécutifs.</span>
          </div>
        </div>
      )}

      {/* Stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Activity} label="Runs total" value={data.total_runs} sublabel={`${data.active_runs} actifs`} />
        <StatCard
          icon={CheckCircle2}
          label="Taux de succès"
          value={`${Math.round(data.success_rate * 100)}%`}
          sublabel={`${data.runs_by_status.completed ?? 0} complétés`}
          tone={successTone}
        />
        <StatCard
          icon={DollarSign}
          label="Coût période"
          value={`$${data.total_cost_usd.toFixed(2)}`}
          sublabel={data.avg_cost_usd ? `moy. $${data.avg_cost_usd.toFixed(3)}/run` : undefined}
        />
        <StatCard
          icon={Clock}
          label="Temps moyen"
          value={formatDuration(data.avg_wall_time_seconds)}
          sublabel={`${data.total_tokens.toLocaleString()} tokens`}
        />
      </div>

      {/* Second row: budget + status breakdown + circuit breaker */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Budget mensuel</span>
            <TrendingUp size={12} className={cn('text-muted-foreground', budgetTone === 'danger' && 'text-red-500', budgetTone === 'warning' && 'text-amber-500')} />
          </div>
          <div className="text-2xl font-bold tabular-nums">${data.monthly_spent_usd.toFixed(2)}</div>
          <div className="text-[11px] text-muted-foreground">sur ${data.monthly_budget_usd.toFixed(2)}</div>
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all',
                budgetTone === 'danger' ? 'bg-red-500' : budgetTone === 'warning' ? 'bg-amber-500' : 'bg-emerald-500',
              )}
              style={{ width: `${Math.min(100, data.budget_used_ratio * 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Répartition statuts</div>
          <div className="space-y-1">
            {Object.entries(data.runs_by_status).sort(([, a], [, b]) => b - a).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-xs">
                <span className="text-foreground">{status}</span>
                <span className="font-semibold tabular-nums text-muted-foreground">{count}</span>
              </div>
            ))}
            {Object.keys(data.runs_by_status).length === 0 && (
              <div className="text-xs text-muted-foreground">Aucun run sur la période</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Circuit breaker</span>
            <Shield size={12} className={cbTone === 'danger' ? 'text-red-500' : 'text-emerald-500'} />
          </div>
          <div className={cn('text-lg font-bold', cbTone === 'danger' ? 'text-red-600' : 'text-emerald-600')}>
            {data.circuit_breaker_tripped_at ? 'Activé' : 'OK'}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {data.consecutive_failures > 0
              ? `${data.consecutive_failures} échec${data.consecutive_failures > 1 ? 's' : ''} consécutif${data.consecutive_failures > 1 ? 's' : ''}`
              : 'Aucun échec récent'}
          </div>
        </div>
      </div>

      {/* Timeseries */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Zap size={11} /> Activité quotidienne
          </span>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500/70" /> succès</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-500/70" /> échec</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted-foreground/40" /> autre</span>
          </div>
        </div>
        <Sparkline data={data.daily_timeseries} />
      </div>

      {/* Recent failures */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <XCircle size={11} /> Échecs récents
        </div>
        {data.recent_failures.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">Aucun échec — excellent !</div>
        ) : (
          <div className="space-y-1">
            {data.recent_failures.map((f) => (
              <button
                key={f.id}
                onClick={() => openDynamicPanel({ type: 'detail', module: 'support', id: f.ticket_id })}
                className="w-full text-left p-2 rounded-md hover:bg-accent/50 transition-colors flex items-center gap-3 group"
              >
                <div className="h-7 w-7 rounded-md bg-red-500/10 flex items-center justify-center shrink-0">
                  <XCircle size={12} className="text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-foreground">{f.status}</span>
                    <span className="text-muted-foreground">· phase {f.current_phase}</span>
                    <span className="text-muted-foreground">· ${f.cost_usd.toFixed(3)}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {f.error_message || '(aucun message)'}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(f.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
