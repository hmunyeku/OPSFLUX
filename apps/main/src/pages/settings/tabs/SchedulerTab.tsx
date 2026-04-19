/**
 * Scheduler Admin Tab — job manager with inline execution history (nested rows).
 *
 * Each job row expands to show its last N executions inline.
 * Features: pause/resume/run now, status badges, auto-refresh 30s.
 */
import { useState, useMemo, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, Play, Pause, RotateCcw, Clock, RefreshCw,
  ChevronRight, ChevronDown,
} from 'lucide-react'
import api from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { usePageSize } from '@/hooks/usePageSize'

// ── Types ────────────────────────────────────────────────────

interface ScheduledJob {
  id: string
  name: string
  trigger: string
  next_run_at: string | null
  pending: boolean
  paused: boolean
  last_run_at: string | null
  last_status: string | null
  last_duration_ms: number | null
  last_error: string | null
}

interface JobExecutionItem {
  id: string
  job_id: string
  job_name: string
  status: string
  started_at: string | null
  finished_at: string | null
  duration_ms: number | null
  error_message: string | null
  triggered_by: string
}

// ── Helpers ──────────────────────────────────────────────────

function formatTrigger(trigger: string): string {
  if (trigger.includes('interval')) {
    const match = trigger.match(/interval\[.*?(\d+:\d+:\d+)/)
    if (match) return `Toutes les ${match[1]}`
  }
  if (trigger.includes('cron')) {
    const match = trigger.match(/cron\[(.*?)\]/)
    if (match) return `Cron: ${match[1]}`
  }
  return trigger
}

function formatNextRun(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = d.getTime() - Date.now()
  if (diff < 0) return 'En cours...'
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Imminent'
  if (minutes < 60) return `Dans ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Dans ${hours}h${minutes % 60 > 0 ? `${minutes % 60}m` : ''}`
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  try {
    const date = new Date(d)
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  success: { cls: 'gl-badge-success', label: 'OK' },
  error: { cls: 'gl-badge-danger', label: 'Erreur' },
  missed: { cls: 'gl-badge-warning', label: 'Manqué' },
  running: { cls: 'gl-badge-info', label: 'En cours' },
}

// ── Nested History Row ───────────────────────────────────────

function JobHistoryRows({ jobId }: { jobId: string }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize: histPageSize } = usePageSize()
  const [histSearch, setHistSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-scheduler-history', jobId, page, histPageSize],
    queryFn: async () => {
      const { data } = await api.get<{ items: JobExecutionItem[]; total: number; page: number; page_size: number }>('/api/v1/admin/scheduler/history', {
        params: { job_id: jobId, page, page_size: histPageSize },
      })
      return data
    },
  })

  if (isLoading && page === 1) {
    return (
      <tr>
        <td colSpan={7} className="py-3 text-center">
          <Loader2 size={14} className="animate-spin text-muted-foreground inline-block" />
        </td>
      </tr>
    )
  }

  const allItems = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / histPageSize)

  // Client-side search filter within loaded page
  const items = histSearch.trim()
    ? allItems.filter(i =>
      i.status.toLowerCase().includes(histSearch.toLowerCase()) ||
      i.triggered_by.toLowerCase().includes(histSearch.toLowerCase()) ||
      (i.error_message || '').toLowerCase().includes(histSearch.toLowerCase()) ||
      (i.id || '').toLowerCase().includes(histSearch.toLowerCase())
    )
    : allItems

  if (items.length === 0 && page === 1) {
    return (
      <tr>
        <td colSpan={7} className="py-3 text-center text-xs text-muted-foreground">
          Aucune exécution enregistrée
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td colSpan={7} className="p-0">
        <div className="ml-8 mr-3 mb-3 border border-border/50 rounded-md overflow-hidden">
          {/* History search */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-accent/20 border-b border-border/30">
            <input
              className="gl-form-input text-[10px] h-6 flex-1"
              placeholder="Filtrer l'historique..."
              value={histSearch}
              onChange={(e) => setHistSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="text-[9px] text-muted-foreground tabular-nums">{items.length}/{allItems.length}</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-accent/40 border-b border-border/30">
                <th className="text-left px-3 py-1.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider w-[100px]">{t('settings.execution')}</th>
                <th className="text-left px-2 py-1.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider w-[70px]">Statut</th>
                <th className="text-left px-2 py-1.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{t('conformite.columns.start_date')}</th>
                <th className="text-left px-2 py-1.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider w-[70px]">{t('common.duration')}</th>
                <th className="text-left px-2 py-1.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider w-[70px]">Source</th>
                <th className="text-left px-2 py-1.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Erreur</th>
              </tr>
            </thead>
            <tbody>
              {items.map((exec) => {
                const badge = STATUS_BADGE[exec.status]
                return (
                  <tr key={exec.id} className="border-b border-border/10 hover:bg-accent/10 transition-colors">
                    <td className="px-3 py-1.5 text-[10px] text-muted-foreground font-mono">#{exec.id.slice(0, 8)}</td>
                    <td className="px-2 py-1.5">
                      {badge
                        ? <span className={cn('gl-badge text-[8px]', badge.cls)}>{badge.label}</span>
                        : <span className="text-[10px]">{exec.status}</span>
                      }
                    </td>
                    <td className="px-2 py-1.5 text-[10px] tabular-nums text-muted-foreground">{fmtDate(exec.started_at)}</td>
                    <td className="px-2 py-1.5 text-[10px] tabular-nums font-mono text-muted-foreground">{formatDuration(exec.duration_ms)}</td>
                    <td className="px-2 py-1.5">
                      <span className={cn('gl-badge text-[8px]', exec.triggered_by === 'manual' ? 'gl-badge-info' : 'gl-badge-neutral')}>
                        {exec.triggered_by === 'manual' ? 'Manuel' : 'Auto'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-[10px] text-red-500 truncate max-w-[200px]" title={exec.error_message || undefined}>
                      {exec.error_message || <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {/* Pagination footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-accent/20 border-t border-border/30 text-[10px] text-muted-foreground">
              <span>{total} exécution(s) · {histPageSize}/page</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoading}
                  className="px-1.5 py-0.5 rounded hover:bg-accent disabled:opacity-30"
                >
                  ‹
                </button>
                <span className="tabular-nums">{page}/{totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isLoading}
                  className="px-1.5 py-0.5 rounded hover:bg-accent disabled:opacity-30"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Main Component ──────────────────────────────────────────

export function SchedulerTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  // ── Fetch jobs ──
  const { data: jobsData, isLoading } = useQuery({
    queryKey: ['admin-scheduler-jobs'],
    queryFn: async () => {
      const { data } = await api.get<{ jobs: ScheduledJob[]; total: number }>('/api/v1/admin/scheduler/jobs')
      return data
    },
    refetchInterval: 30000,
  })

  // ── Mutations ──
  const runJob = useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await api.post('/api/v1/admin/scheduler/run', { job_id: jobId })
      return data
    },
    onSuccess: (_, jobId) => {
      toast({ title: t('settings.toast.scheduler.job_executed', { jobId }), variant: 'success' })
      qc.invalidateQueries({ queryKey: ['admin-scheduler-jobs'] })
      qc.invalidateQueries({ queryKey: ['admin-scheduler-history'] })
    },
    onError: (err: any) => {
      toast({ title: t('settings.toast.error'), description: err?.response?.data?.detail || t('settings.toast.scheduler.job_error'), variant: 'error' })
      qc.invalidateQueries({ queryKey: ['admin-scheduler-history'] })
    },
  })

  const pauseJob = useMutation({
    mutationFn: async (jobId: string) => { await api.post('/api/v1/admin/scheduler/pause', { job_id: jobId }) },
    onSuccess: () => { toast({ title: t('settings.toast.scheduler.job_paused'), variant: 'success' }); qc.invalidateQueries({ queryKey: ['admin-scheduler-jobs'] }) },
  })

  const resumeJob = useMutation({
    mutationFn: async (jobId: string) => { await api.post('/api/v1/admin/scheduler/resume', { job_id: jobId }) },
    onSuccess: () => { toast({ title: t('settings.toast.scheduler.job_resumed'), variant: 'success' }); qc.invalidateQueries({ queryKey: ['admin-scheduler-jobs'] }) },
  })

  const toggleExpand = (jobId: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  const jobs = useMemo(() => {
    const all = jobsData?.jobs ?? []
    if (!search.trim()) return all
    const q = search.toLowerCase()
    return all.filter((j) => j.name.toLowerCase().includes(q) || j.id.toLowerCase().includes(q))
  }, [jobsData, search])

  return (
    <CollapsibleSection
      id="scheduler-jobs"
      title={t('settings.taches_planifiees')}
      description="Jobs de fond exécutés automatiquement par le serveur. Cliquez sur une ligne pour voir l'historique d'exécution."
      storageKey="settings.scheduler.collapse"
    >
      <div className="mt-3 space-y-3">
        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              className="gl-form-input text-xs pl-3 w-full h-8"
              placeholder={t('settings.rechercher_un_job')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['admin-scheduler-jobs'] })}
            className="gl-button-sm gl-button-default"
          >
            <RefreshCw size={12} /> Rafraîchir
          </button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={18} className="animate-spin text-muted-foreground" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground">
            <Clock size={24} className="mb-2 text-muted-foreground/40" />
            <span>{t('settings.aucun_job_planifie')}</span>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-accent/30 border-b border-border">
                  <th className="w-8 px-2 py-2" />
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Job</th>
                  <th className="text-left px-2 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">{t('assets.spec.frequency')}</th>
                  <th className="text-left px-2 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Statut</th>
                  <th className="text-left px-2 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">{t('settings.derniere_exec')}</th>
                  <th className="text-left px-2 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Prochaine</th>
                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const isExpanded = expandedJobs.has(job.id)
                  const badge = job.paused ? null : (job.last_status ? STATUS_BADGE[job.last_status] : null)
                  const isRunning = runJob.isPending && runJob.variables === job.id

                  return (
                    <Fragment key={job.id}>
                      {/* Job row */}
                      <tr
                        className={cn(
                          'border-b border-border/50 hover:bg-accent/10 transition-colors cursor-pointer',
                          isExpanded && 'bg-accent/10',
                        )}
                        onClick={() => toggleExpand(job.id)}
                      >
                        <td className="px-2 py-2.5 text-center">
                          {isExpanded
                            ? <ChevronDown size={13} className="text-muted-foreground" />
                            : <ChevronRight size={13} className="text-muted-foreground" />
                          }
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-medium text-foreground">{job.name}</span>
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{job.id}</p>
                        </td>
                        <td className="px-2 py-2.5 text-muted-foreground">{formatTrigger(job.trigger)}</td>
                        <td className="px-2 py-2.5">
                          {job.paused
                            ? <span className="gl-badge gl-badge-neutral text-[9px]">En pause</span>
                            : badge
                              ? <span className={cn('gl-badge text-[9px]', badge.cls)}>{badge.label}</span>
                              : <span className="text-muted-foreground text-[10px]">—</span>
                          }
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="tabular-nums text-muted-foreground">{fmtDate(job.last_run_at)}</span>
                          {job.last_duration_ms != null && (
                            <span className="text-muted-foreground/60 ml-1 font-mono">({formatDuration(job.last_duration_ms)})</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 tabular-nums">
                          {job.paused ? <span className="text-muted-foreground/50">—</span> : formatNextRun(job.next_run_at)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => runJob.mutate(job.id)}
                              disabled={isRunning}
                              className="gl-button-sm gl-button-confirm"
                              title={t('settings.executer_maintenant')}
                            >
                              {isRunning ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                            </button>
                            {job.paused ? (
                              <button onClick={() => resumeJob.mutate(job.id)} className="gl-button-sm gl-button-default" title="Reprendre">
                                <RotateCcw size={11} />
                              </button>
                            ) : (
                              <button onClick={() => pauseJob.mutate(job.id)} className="gl-button-sm gl-button-default" title="Mettre en pause">
                                <Pause size={11} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Nested execution history */}
                      {isExpanded && <JobHistoryRows jobId={job.id} />}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        <div className="text-[11px] text-muted-foreground">
          {jobs.length} tâche(s) planifiée(s)
        </div>
      </div>
    </CollapsibleSection>
  )
}
