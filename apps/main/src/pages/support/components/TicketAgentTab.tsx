/**
 * "Agent IA" tab on the ticket detail — launch / monitor / cancel runs.
 */
import { Bot, Play, XCircle, CheckCircle2, Loader2, AlertCircle, ExternalLink, Github } from 'lucide-react'
import {
  useAgentRunsForTicket,
  useLaunchAgentRun,
  useCancelAgentRun,
  useAgentConfig,
  type AgentRun,
  type AgentPhase,
} from '@/hooks/useAgentRuns'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const PHASES: { id: AgentPhase; label: string }[] = [
  { id: 'triage', label: 'Triage' },
  { id: 'reproduction', label: 'Reproduction' },
  { id: 'diagnosis', label: 'Diagnostic' },
  { id: 'fix', label: 'Correction' },
  { id: 'deploy', label: 'Déploiement' },
  { id: 'verification', label: 'Vérification' },
  { id: 'report', label: 'Rapport' },
]

const TERMINAL = ['completed', 'failed', 'cancelled', 'rejected', 'failed_and_reverted']

export function TicketAgentTab({
  ticketId,
  canManage,
}: {
  ticketId: string
  canManage: boolean
}) {
  const { data: runs = [], isLoading } = useAgentRunsForTicket(ticketId)
  const { data: config } = useAgentConfig()
  const launch = useLaunchAgentRun()
  const cancel = useCancelAgentRun()
  const { toast } = useToast()
  const confirm = useConfirm()

  const activeRun = runs.find((r) => !TERMINAL.includes(r.status))
  const previousRuns = runs.filter((r) => TERMINAL.includes(r.status))

  const handleLaunch = async () => {
    const ok = await confirm({
      title: 'Lancer l’agent de maintenance ?',
      message: 'L’agent va analyser le ticket, produire un diagnostic et créer une PR. Tu pourras l’annuler à tout moment.',
      confirmLabel: 'Lancer',
    })
    if (!ok) return
    try {
      await launch.mutateAsync({ ticket_id: ticketId })
      toast({ title: 'Agent lancé', description: 'Le run apparaît dans la liste ci-dessous.', variant: 'success' })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({ title: 'Lancement impossible', description: msg || String(err), variant: 'error' })
    }
  }

  const handleCancel = async (run: AgentRun) => {
    const ok = await confirm({
      title: 'Annuler ce run ?',
      message: 'Le container sera arrêté. Les artefacts déjà produits sont conservés.',
      confirmLabel: 'Annuler le run',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await cancel.mutateAsync(run.id)
      toast({ title: 'Run annulé', variant: 'success' })
    } catch (err) {
      toast({ title: 'Erreur', description: String(err), variant: 'error' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="border border-border/60 rounded-lg bg-card">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <Bot size={14} className="text-primary" />
          <span className="text-sm font-semibold">Agent de maintenance IA</span>
          {config && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              {config.enabled ? 'Activé' : 'Désactivé'} ·{' '}
              {config.current_month_spent_usd.toFixed(2)} /{' '}
              {config.monthly_budget_usd.toFixed(2)} USD
            </span>
          )}
        </div>

        <div className="px-4 py-4 space-y-3">
          {!config?.enabled && (
            <div className="flex items-start gap-2 p-3 rounded bg-yellow-50 dark:bg-yellow-950/50 border border-yellow-200 dark:border-yellow-800 text-xs">
              <AlertCircle size={14} className="text-yellow-700 dark:text-yellow-300 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-yellow-900 dark:text-yellow-200">Agent désactivé</p>
                <p className="text-yellow-700 dark:text-yellow-300 mt-0.5">
                  Active l’agent dans Paramètres → Support → Agent de maintenance IA avant de lancer un run.
                </p>
              </div>
            </div>
          )}

          {config?.circuit_breaker_tripped_at && (
            <div className="flex items-start gap-2 p-3 rounded bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs">
              <AlertCircle size={14} className="text-red-700 dark:text-red-300 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-red-900 dark:text-red-200">Circuit breaker déclenché</p>
                <p className="text-red-700 dark:text-red-300 mt-0.5">
                  Trop d’échecs consécutifs. Les nouveaux runs sont bloqués jusqu’à expiration du cooldown.
                </p>
              </div>
            </div>
          )}

          {activeRun ? (
            <ActiveRunCard run={activeRun} onCancel={handleCancel} canCancel={canManage} />
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Aucun run actif pour ce ticket.
              </p>
              {canManage && config?.enabled && (
                <button
                  type="button"
                  className="gl-button gl-button-sm gl-button-confirm text-primary w-fit"
                  onClick={handleLaunch}
                  disabled={launch.isPending}
                >
                  {launch.isPending ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                  Lancer l’agent
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {previousRuns.length > 0 && (
        <div className="border border-border/60 rounded-lg bg-card">
          <div className="px-4 py-2.5 border-b border-border/40">
            <span className="text-sm font-semibold">Runs précédents</span>
          </div>
          <ul className="divide-y divide-border/40">
            {previousRuns.map((r) => (
              <PreviousRunRow key={r.id} run={r} />
            ))}
          </ul>
        </div>
      )}

      {isLoading && runs.length === 0 && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" /> Chargement…
        </div>
      )}
    </div>
  )
}

// ── Active run card ─────────────────────────────────────────────────

function ActiveRunCard({
  run,
  onCancel,
  canCancel,
}: {
  run: AgentRun
  onCancel: (r: AgentRun) => void
  canCancel: boolean
}) {
  const currentIdx = PHASES.findIndex((p) => p.id === run.current_phase)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-mono text-primary">{run.id.slice(0, 8)}</span>
        <StatusBadge status={run.status} />
        <span className="text-[11px] text-muted-foreground">
          Mode : {run.autonomy_mode} · Déploiement : {run.deployment_mode}
        </span>
      </div>

      {/* Phase stepper */}
      <div className="grid grid-cols-7 gap-0.5">
        {PHASES.map((phase, idx) => {
          const done = idx < currentIdx
          const active = idx === currentIdx
          return (
            <div key={phase.id} className="flex flex-col items-center gap-1">
              <div
                className={`w-full h-1.5 rounded ${
                  done
                    ? 'bg-green-500'
                    : active
                      ? 'bg-primary animate-pulse'
                      : 'bg-muted'
                }`}
              />
              <span
                className={`text-[9px] uppercase tracking-wide ${
                  active ? 'text-primary font-medium' : 'text-muted-foreground'
                }`}
              >
                {phase.label}
              </span>
            </div>
          )
        })}
      </div>

      {run.github_pr_url && (
        <a
          href={run.github_pr_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Github size={12} /> PR #{run.github_pr_number}
          <ExternalLink size={10} />
        </a>
      )}

      {run.error_message && (
        <div className="text-[11px] text-destructive p-2 rounded bg-destructive/10">
          {run.error_message}
        </div>
      )}

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>
          Tokens : {run.llm_tokens_used.toLocaleString()} · Coût :{' '}
          {Number(run.llm_cost_usd).toFixed(4)} USD
        </span>
        {run.wall_time_seconds != null && <span>· {run.wall_time_seconds}s</span>}
      </div>

      {canCancel && (
        <button
          type="button"
          className="gl-button gl-button-sm gl-button-default text-destructive"
          onClick={() => onCancel(run)}
        >
          <XCircle size={12} /> Annuler le run
        </button>
      )}
    </div>
  )
}

function PreviousRunRow({ run }: { run: AgentRun }) {
  const ok = run.status === 'completed'
  const Icon = ok ? CheckCircle2 : XCircle
  return (
    <li className="px-4 py-3 flex items-center gap-3">
      <Icon size={14} className={ok ? 'text-green-600' : 'text-destructive'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-mono">{run.id.slice(0, 8)}</span>
          <StatusBadge status={run.status} />
          <span className="text-muted-foreground">
            {new Date(run.created_at).toLocaleString()}
          </span>
        </div>
        {run.github_pr_url && (
          <a
            href={run.github_pr_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 mt-0.5"
          >
            <Github size={10} /> PR #{run.github_pr_number}
          </a>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground shrink-0">
        {Number(run.llm_cost_usd).toFixed(2)} USD
      </div>
    </li>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'completed'
      ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
      : status === 'failed' || status === 'failed_and_reverted'
        ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
        : status === 'running' || status === 'preparing' || status === 'pending'
          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
          : 'bg-muted text-muted-foreground'
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{status}</span>
}
