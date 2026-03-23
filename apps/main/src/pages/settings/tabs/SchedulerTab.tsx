/**
 * Scheduler Admin Tab — view and manage background jobs.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Play, Clock, Zap, RefreshCw } from 'lucide-react'
import api from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

interface ScheduledJob {
  id: string
  name: string
  trigger: string
  next_run_at: string | null
  pending: boolean
}

function formatTrigger(trigger: string): string {
  // Simplify APScheduler trigger strings for display
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
  if (!iso) return 'N/A'
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

export function SchedulerTab() {
  const { toast } = useToast()
  const qc = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-scheduler-jobs'],
    queryFn: async () => {
      const { data } = await api.get<{ jobs: ScheduledJob[]; total: number }>('/api/v1/admin/scheduler/jobs')
      return data
    },
  })

  const [runningJobId, setRunningJobId] = useState<string | null>(null)

  const runMutation = useMutation({
    mutationFn: async (jobId: string) => {
      setRunningJobId(jobId)
      const { data } = await api.post('/api/v1/admin/scheduler/run', { job_id: jobId })
      return data
    },
    onSuccess: (_, jobId) => {
      toast({ title: 'Job lancé', description: `Le job "${jobId}" a été déclenché.`, variant: 'success' })
      setRunningJobId(null)
      // Refresh job list after a delay to see updated next_run
      setTimeout(() => qc.invalidateQueries({ queryKey: ['admin-scheduler-jobs'] }), 2000)
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible de lancer le job.', variant: 'error' })
      setRunningJobId(null)
    },
  })

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
  }

  const jobs = data?.jobs ?? []

  return (
    <CollapsibleSection
      id="scheduler-jobs"
      title="Tâches planifiées"
      description="Jobs de fond exécutés automatiquement par le serveur. Vous pouvez déclencher manuellement un job en cliquant sur le bouton Exécuter."
      storageKey="settings.scheduler.collapse"
    >
      <div className="mt-3 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground">{jobs.length} job(s) enregistré(s)</span>
          <button
            onClick={() => refetch()}
            className="gl-button-sm gl-button-default"
          >
            <RefreshCw size={12} />
            Rafraîchir
          </button>
        </div>

        {/* Job list */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="text-xs w-full">
            <thead>
              <tr className="bg-accent/60 border-b border-border">
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Job</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Fréquence</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Prochaine exécution</th>
                <th className="px-2 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {jobs.map(job => (
                <tr key={job.id} className="hover:bg-accent/20 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Clock size={13} className="text-muted-foreground shrink-0" />
                      <div>
                        <span className="font-medium text-foreground">{job.name}</span>
                        <p className="text-[10px] text-muted-foreground font-mono">{job.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {formatTrigger(job.trigger)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs ${job.next_run_at ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {formatNextRun(job.next_run_at)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => runMutation.mutate(job.id)}
                      disabled={runningJobId === job.id}
                      className="gl-button-sm gl-button-default"
                    >
                      {runningJobId === job.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Play size={12} />
                      )}
                      Exécuter
                    </button>
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-muted-foreground">
                    Aucun job planifié.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </CollapsibleSection>
  )
}
