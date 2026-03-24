/**
 * Scheduler Admin Tab — full job manager with execution history.
 *
 * Features:
 * - DataTable of registered jobs with status, schedule, last run, duration
 * - Pause / Resume / Run Now actions per job
 * - Execution history panel with error details
 * - Status badges (success, error, missed, running, paused)
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, Play, Pause, RotateCcw, Clock, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, History,
} from 'lucide-react'
import api from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { cn } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination } from '@/components/ui/DataTable/types'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

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
  const now = Date.now()
  const diff = d.getTime() - now
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

const STATUS_BADGE: Record<string, { cls: string; label: string; icon: React.ElementType }> = {
  success: { cls: 'gl-badge-success', label: 'OK', icon: CheckCircle2 },
  error: { cls: 'gl-badge-danger', label: 'Erreur', icon: XCircle },
  missed: { cls: 'gl-badge-warning', label: 'Manqué', icon: AlertTriangle },
  running: { cls: 'gl-badge-info', label: 'En cours', icon: Loader2 },
}

// ── Main Component ──────────────────────────────────────────

export function SchedulerTab() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [jobSearch, setJobSearch] = useState('')
  const [histPage, setHistPage] = useState(1)

  // ── Fetch jobs ──
  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['admin-scheduler-jobs'],
    queryFn: async () => {
      const { data } = await api.get<{ jobs: ScheduledJob[]; total: number }>('/api/v1/admin/scheduler/jobs')
      return data
    },
    refetchInterval: 30000, // auto-refresh every 30s
  })

  // ── Fetch execution history ──
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['admin-scheduler-history', selectedJobId, histPage],
    queryFn: async () => {
      const params: Record<string, string | number> = { page: histPage, page_size: 20 }
      if (selectedJobId) params.job_id = selectedJobId
      const { data } = await api.get<{ items: JobExecutionItem[]; total: number; page: number; page_size: number }>('/api/v1/admin/scheduler/history', { params })
      return data
    },
  })

  // ── Mutations ──
  const runJob = useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await api.post('/api/v1/admin/scheduler/run', { job_id: jobId })
      return data
    },
    onSuccess: (_, jobId) => {
      toast({ title: `Job "${jobId}" exécuté`, variant: 'success' })
      qc.invalidateQueries({ queryKey: ['admin-scheduler-jobs'] })
      qc.invalidateQueries({ queryKey: ['admin-scheduler-history'] })
    },
    onError: (err: any) => {
      toast({ title: 'Erreur', description: err?.response?.data?.detail || 'Échec', variant: 'error' })
      qc.invalidateQueries({ queryKey: ['admin-scheduler-history'] })
    },
  })

  const pauseJob = useMutation({
    mutationFn: async (jobId: string) => { await api.post('/api/v1/admin/scheduler/pause', { job_id: jobId }) },
    onSuccess: () => { toast({ title: 'Job mis en pause', variant: 'success' }); qc.invalidateQueries({ queryKey: ['admin-scheduler-jobs'] }) },
  })

  const resumeJob = useMutation({
    mutationFn: async (jobId: string) => { await api.post('/api/v1/admin/scheduler/resume', { job_id: jobId }) },
    onSuccess: () => { toast({ title: 'Job repris', variant: 'success' }); qc.invalidateQueries({ queryKey: ['admin-scheduler-jobs'] }) },
  })

  const jobs = jobsData?.jobs ?? []

  // ── Job columns ──
  const jobColumns: ColumnDef<ScheduledJob>[] = useMemo(() => [
    {
      accessorKey: 'name',
      header: 'Job',
      size: 250,
      cell: ({ row }) => (
        <div>
          <span className="font-medium text-foreground">{row.original.name}</span>
          <p className="text-[10px] text-muted-foreground font-mono">{row.original.id}</p>
        </div>
      ),
    },
    {
      accessorKey: 'trigger',
      header: 'Fréquence',
      size: 180,
      cell: ({ row }) => <span className="text-muted-foreground">{formatTrigger(row.original.trigger)}</span>,
    },
    {
      id: 'status',
      header: 'Statut',
      size: 100,
      cell: ({ row }) => {
        if (row.original.paused) return <span className="gl-badge gl-badge-neutral text-[9px]">En pause</span>
        const ls = row.original.last_status
        if (!ls) return <span className="text-muted-foreground text-[10px]">Jamais exécuté</span>
        const badge = STATUS_BADGE[ls]
        return badge ? <span className={cn('gl-badge text-[9px]', badge.cls)}>{badge.label}</span> : <span className="text-muted-foreground">{ls}</span>
      },
    },
    {
      accessorKey: 'last_run_at',
      header: 'Dernière exécution',
      size: 140,
      cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{fmtDate(row.original.last_run_at)}</span>,
    },
    {
      accessorKey: 'last_duration_ms',
      header: 'Durée',
      size: 80,
      cell: ({ row }) => <span className="tabular-nums font-mono text-muted-foreground">{formatDuration(row.original.last_duration_ms)}</span>,
    },
    {
      accessorKey: 'next_run_at',
      header: 'Prochaine',
      size: 120,
      cell: ({ row }) => row.original.paused
        ? <span className="text-muted-foreground/50">—</span>
        : <span className="tabular-nums">{formatNextRun(row.original.next_run_at)}</span>,
    },
    {
      id: 'actions',
      header: '',
      size: 140,
      cell: ({ row }) => {
        const job = row.original
        const isRunning = runJob.isPending && runJob.variables === job.id
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); runJob.mutate(job.id) }}
              disabled={isRunning}
              className="gl-button-sm gl-button-confirm"
              title="Exécuter maintenant"
            >
              {isRunning ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
            </button>
            {job.paused ? (
              <button
                onClick={(e) => { e.stopPropagation(); resumeJob.mutate(job.id) }}
                className="gl-button-sm gl-button-default"
                title="Reprendre"
              >
                <RotateCcw size={11} />
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); pauseJob.mutate(job.id) }}
                className="gl-button-sm gl-button-default"
                title="Mettre en pause"
              >
                <Pause size={11} />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedJobId(selectedJobId === job.id ? null : job.id); setHistPage(1) }}
              className={cn('gl-button-sm', selectedJobId === job.id ? 'gl-button-confirm' : 'gl-button-default')}
              title="Voir l'historique"
            >
              <History size={11} />
            </button>
          </div>
        )
      },
    },
  ], [selectedJobId, runJob.isPending, runJob.variables])

  const jobPagination: DataTablePagination = {
    page: 1, pageSize: jobs.length || 25, total: jobs.length, pages: 1,
  }

  // ── History columns ──
  const histColumns: ColumnDef<JobExecutionItem>[] = useMemo(() => [
    {
      accessorKey: 'job_name',
      header: 'Job',
      size: 200,
      cell: ({ row }) => <span className="font-medium">{row.original.job_name}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      size: 90,
      cell: ({ row }) => {
        const badge = STATUS_BADGE[row.original.status]
        return badge
          ? <span className={cn('gl-badge text-[9px]', badge.cls)}>{badge.label}</span>
          : <span>{row.original.status}</span>
      },
    },
    {
      accessorKey: 'started_at',
      header: 'Début',
      size: 140,
      cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{fmtDate(row.original.started_at)}</span>,
    },
    {
      accessorKey: 'duration_ms',
      header: 'Durée',
      size: 80,
      cell: ({ row }) => <span className="tabular-nums font-mono text-muted-foreground">{formatDuration(row.original.duration_ms)}</span>,
    },
    {
      accessorKey: 'triggered_by',
      header: 'Source',
      size: 80,
      cell: ({ row }) => (
        <span className={cn('gl-badge text-[9px]', row.original.triggered_by === 'manual' ? 'gl-badge-info' : 'gl-badge-neutral')}>
          {row.original.triggered_by === 'manual' ? 'Manuel' : 'Auto'}
        </span>
      ),
    },
    {
      accessorKey: 'error_message',
      header: 'Erreur',
      size: 250,
      cell: ({ row }) => row.original.error_message
        ? <span className="text-red-500 truncate max-w-[250px] block" title={row.original.error_message}>{row.original.error_message}</span>
        : <span className="text-muted-foreground">—</span>,
    },
  ], [])

  const histPagination: DataTablePagination = {
    page: histPage,
    pageSize: 20,
    total: historyData?.total ?? 0,
    pages: Math.ceil((historyData?.total ?? 0) / 20),
  }

  return (
    <CollapsibleSection
      id="scheduler-jobs"
      title="Tâches planifiées"
      description="Jobs de fond exécutés automatiquement par le serveur. Vous pouvez les exécuter manuellement, les mettre en pause ou consulter l'historique."
      storageKey="settings.scheduler.collapse"
    >
    <div className="mt-3 space-y-6">
      {/* ── Jobs DataTable ── */}
      <div>
        <div className="flex items-center justify-end mb-3">
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['admin-scheduler-jobs'] })}
            className="gl-button-sm gl-button-default"
          >
            <RefreshCw size={12} /> Rafraîchir
          </button>
        </div>
        <DataTable<ScheduledJob>
          columns={jobColumns}
          data={jobs}
          isLoading={jobsLoading}
          pagination={jobPagination}
          searchValue={jobSearch}
          onSearchChange={setJobSearch}
          searchPlaceholder="Rechercher un job..."
          emptyIcon={Clock}
          emptyTitle="Aucun job planifié"
          storageKey="admin-scheduler-jobs"
        />
      </div>

      {/* ── Execution History ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <History size={14} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            Historique d'exécution
            {selectedJobId && <span className="text-primary ml-1">— {selectedJobId}</span>}
          </h3>
          {selectedJobId && (
            <button onClick={() => setSelectedJobId(null)} className="text-[10px] text-muted-foreground hover:text-foreground ml-2">
              Voir tout
            </button>
          )}
        </div>
        <DataTable<JobExecutionItem>
          columns={histColumns}
          data={historyData?.items ?? []}
          isLoading={historyLoading}
          pagination={histPagination}
          onPaginationChange={(p) => setHistPage(p)}
          emptyIcon={History}
          emptyTitle="Aucun historique"
          storageKey="admin-scheduler-history"
        />
      </div>
    </div>
    </CollapsibleSection>
  )
}
