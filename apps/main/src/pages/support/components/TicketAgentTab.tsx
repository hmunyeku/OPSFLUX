/**
 * "Agent IA" tab on the ticket detail — launch / monitor / cancel runs.
 */
import { Bot, Play, XCircle, CheckCircle2, Loader2, AlertCircle, ExternalLink, Github, ThumbsUp, ThumbsDown, Rocket, Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  useAgentRunsForTicket,
  useLaunchAgentRun,
  useCancelAgentRun,
  useApproveAgentRun,
  useRejectAgentRun,
  useAgentConfig,
  useVerificationResults,
  useDeployAndVerify,
  type AgentRun,
  type AgentPhase,
} from '@/hooks/useAgentRuns'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { AgentRunReviewPanel } from './AgentRunReviewPanel'

const TERMINAL = ['completed', 'failed', 'cancelled', 'rejected', 'failed_and_reverted']

function usePhases(): { id: AgentPhase; label: string }[] {
  const { t } = useTranslation()
  return [
    { id: 'triage', label: t('support.agent.phase.triage', 'Triage') },
    { id: 'reproduction', label: t('support.agent.phase.reproduction', 'Reproduction') },
    { id: 'diagnosis', label: t('support.agent.phase.diagnosis', 'Diagnostic') },
    { id: 'fix', label: t('support.agent.phase.fix', 'Correction') },
    { id: 'deploy', label: t('support.agent.phase.deploy', 'Déploiement') },
    { id: 'verification', label: t('support.agent.phase.verification', 'Vérification') },
    { id: 'report', label: t('support.agent.phase.report', 'Rapport') },
  ]
}

export function TicketAgentTab({
  ticketId,
  canManage,
}: {
  ticketId: string
  canManage: boolean
}) {
  const { t } = useTranslation()
  const { data: runs = [], isLoading } = useAgentRunsForTicket(ticketId)
  const { data: config } = useAgentConfig()
  const launch = useLaunchAgentRun()
  const cancel = useCancelAgentRun()
  const approve = useApproveAgentRun()
  const reject = useRejectAgentRun()
  const deployVerify = useDeployAndVerify()
  const { toast } = useToast()
  const confirm = useConfirm()

  const handleDeployAndVerify = async (run: AgentRun) => {
    const ok = await confirm({
      title: t('support.agent.confirm.deploy_title', 'Déployer sur staging et lancer Playwright ?'),
      message: t('support.agent.confirm.deploy_msg', 'La branche agent sera déployée sur l’environnement staging Dokploy, suivi des scénarios Playwright pertinents.'),
      confirmLabel: t('support.agent.confirm.deploy_label', 'Déployer et vérifier'),
    })
    if (!ok) return
    try {
      const result = await deployVerify.mutateAsync(run.id)
      const label = result.deploy_ok
        ? t('support.agent.deploy.ok', 'Déploiement OK — {{passed}}✓ / {{failed}}✗ / {{crit}} critiques', {
            passed: result.passed ?? 0,
            failed: result.failed ?? 0,
            crit: result.critical_failures ?? 0,
          })
        : t('support.agent.deploy.failed', 'Déploiement échoué : {{msg}}', { msg: result.deploy_message ?? t('common.error', 'erreur') })
      toast({
        title: t('support.agent.deploy.done_title', 'Deploy + verify terminé'),
        description: label,
        variant: result.deploy_ok && !result.critical_failures ? 'success' : 'error',
      })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({ title: t('support.agent.deploy.fail_title', 'Échec deploy+verify'), description: msg || String(err), variant: 'error' })
    }
  }

  const handleApprove = async (run: AgentRun) => {
    const ok = await confirm({
      title: t('support.agent.confirm.approve_title', 'Approuver et merger la PR ?'),
      message: t('support.agent.confirm.approve_msg', 'La PR #{{n}} sera squash-mergée sur le repo. Le pipeline CI/CD déclenchera un déploiement.', { n: run.github_pr_number }),
      confirmLabel: t('support.agent.confirm.approve_label', 'Approuver et merger'),
    })
    if (!ok) return
    try {
      await approve.mutateAsync(run.id)
      toast({ title: t('support.agent.toast.merged', 'PR mergée'), variant: 'success' })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({ title: t('support.agent.toast.merge_failed', 'Merge impossible'), description: msg || String(err), variant: 'error' })
    }
  }

  const handleReject = async (run: AgentRun) => {
    const ok = await confirm({
      title: t('support.agent.confirm.reject_title', 'Rejeter ce run ?'),
      message: t('support.agent.confirm.reject_msg', 'La PR #{{n}} sera fermée. Tu peux laisser un motif pour l’agent.', { n: run.github_pr_number ?? '(?)' }),
      confirmLabel: t('support.agent.confirm.reject_label', 'Rejeter'),
      variant: 'danger',
    })
    if (!ok) return
    try {
      await reject.mutateAsync({ runId: run.id })
      toast({ title: t('support.agent.toast.rejected', 'Run rejeté'), variant: 'success' })
    } catch (err) {
      toast({ title: t('common.error', 'Erreur'), description: String(err), variant: 'error' })
    }
  }

  const activeRun = runs.find((r) => !TERMINAL.includes(r.status))
  const previousRuns = runs.filter((r) => TERMINAL.includes(r.status))

  const handleLaunch = async () => {
    const ok = await confirm({
      title: t('support.agent.confirm.launch_title', 'Lancer l’agent de maintenance ?'),
      message: t('support.agent.confirm.launch_msg', 'L’agent va analyser le ticket, produire un diagnostic et créer une PR. Tu pourras l’annuler à tout moment.'),
      confirmLabel: t('support.agent.confirm.launch_label', 'Lancer'),
    })
    if (!ok) return
    try {
      await launch.mutateAsync({ ticket_id: ticketId })
      toast({ title: t('support.agent.toast.launched', 'Agent lancé'), description: t('support.agent.toast.launched_desc', 'Le run apparaît dans la liste ci-dessous.'), variant: 'success' })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({ title: t('support.agent.toast.launch_failed', 'Lancement impossible'), description: msg || String(err), variant: 'error' })
    }
  }

  const handleCancel = async (run: AgentRun) => {
    const ok = await confirm({
      title: t('support.agent.confirm.cancel_title', 'Annuler ce run ?'),
      message: t('support.agent.confirm.cancel_msg', 'Le container sera arrêté. Les artefacts déjà produits sont conservés.'),
      confirmLabel: t('support.agent.confirm.cancel_label', 'Annuler le run'),
      variant: 'danger',
    })
    if (!ok) return
    try {
      await cancel.mutateAsync(run.id)
      toast({ title: t('support.agent.toast.cancelled', 'Run annulé'), variant: 'success' })
    } catch (err) {
      toast({ title: t('common.error', 'Erreur'), description: String(err), variant: 'error' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="border border-border/60 rounded-lg bg-card">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <Bot size={14} className="text-primary" />
          <span className="text-sm font-semibold">{t('support.agent.title', 'Agent de maintenance IA')}</span>
          {config && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              {config.enabled ? t('support.agent.enabled', 'Activé') : t('support.agent.disabled', 'Désactivé')} ·{' '}
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
                <p className="font-medium text-yellow-900 dark:text-yellow-200">{t('support.agent.disabled_title', 'Agent désactivé')}</p>
                <p className="text-yellow-700 dark:text-yellow-300 mt-0.5">
                  {t('support.agent.disabled_desc', 'Active l’agent dans Paramètres → Support → Agent de maintenance IA avant de lancer un run.')}
                </p>
              </div>
            </div>
          )}

          {config?.circuit_breaker_tripped_at && (
            <div className="flex items-start gap-2 p-3 rounded bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs">
              <AlertCircle size={14} className="text-red-700 dark:text-red-300 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-red-900 dark:text-red-200">{t('support.agent.cb_title', 'Circuit breaker déclenché')}</p>
                <p className="text-red-700 dark:text-red-300 mt-0.5">
                  {t('support.agent.cb_desc', 'Trop d’échecs consécutifs. Les nouveaux runs sont bloqués jusqu’à expiration du cooldown.')}
                </p>
              </div>
            </div>
          )}

          {activeRun ? (
            <ActiveRunCard
              run={activeRun}
              onCancel={handleCancel}
              onApprove={handleApprove}
              onReject={handleReject}
              onDeployAndVerify={handleDeployAndVerify}
              canManage={canManage}
              isApproving={approve.isPending}
              isRejecting={reject.isPending}
              isDeploying={deployVerify.isPending}
            />
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {t('support.agent.no_active', 'Aucun run actif pour ce ticket.')}
              </p>
              {canManage && config?.enabled && (
                <button
                  type="button"
                  className="gl-button gl-button-sm gl-button-confirm w-fit"
                  onClick={handleLaunch}
                  disabled={launch.isPending}
                >
                  {launch.isPending ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                  {t('support.agent.launch', 'Lancer l’agent')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Latest finished run with PR — full review panel */}
      {(() => {
        const latestReviewable = previousRuns.find(
          (r) => (r.status === 'completed' || r.status === 'awaiting_human') && r.github_pr_url,
        )
        if (!latestReviewable) return null
        return (
          <div className="border border-border/60 rounded-lg bg-card">
            <div className="px-4 py-2.5 border-b border-border/40">
              <span className="text-sm font-semibold">{t('support.agent.last_run_proposal', "Dernier run — proposition de l'agent")}</span>
              <span className="ml-2 text-[10px] text-muted-foreground font-mono">
                {latestReviewable.id.slice(0, 8)}
              </span>
            </div>
            <div className="p-4">
              <AgentRunReviewPanel
                run={latestReviewable}
                onMerge={handleApprove}
                onReject={handleReject}
                isMerging={approve.isPending}
                isRejecting={reject.isPending}
                canManage={canManage}
              />
            </div>
          </div>
        )
      })()}

      {previousRuns.length > 0 && (
        <div className="border border-border/60 rounded-lg bg-card">
          <div className="px-4 py-2.5 border-b border-border/40">
            <span className="text-sm font-semibold">{t('support.agent.previous_runs', 'Runs précédents')}</span>
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
          <Loader2 size={12} className="animate-spin" /> {t('common.loading', 'Chargement…')}
        </div>
      )}
    </div>
  )
}

// ── Active run card ─────────────────────────────────────────────────

function ActiveRunCard({
  run,
  onCancel,
  onApprove,
  onReject,
  onDeployAndVerify,
  canManage,
  isApproving,
  isRejecting,
  isDeploying,
}: {
  run: AgentRun
  onCancel: (r: AgentRun) => void
  onApprove: (r: AgentRun) => void
  onReject: (r: AgentRun) => void
  onDeployAndVerify: (r: AgentRun) => void
  canManage: boolean
  isApproving: boolean
  isRejecting: boolean
  isDeploying: boolean
}) {
  const { t } = useTranslation()
  const PHASES = usePhases()
  const currentIdx = PHASES.findIndex((p) => p.id === run.current_phase)
  const awaitingApproval = run.status === 'awaiting_human'
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-mono text-primary">{run.id.slice(0, 8)}</span>
        <StatusBadge status={run.status} />
        <span className="text-[11px] text-muted-foreground">
          {t('support.agent.mode_label', 'Mode')} : {run.autonomy_mode} · {t('support.agent.deployment_label', 'Déploiement')} : {run.deployment_mode}
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
          {t('support.agent.tokens', 'Tokens')} : {run.llm_tokens_used.toLocaleString()} · {t('support.agent.cost', 'Coût')} :{' '}
          {Number(run.llm_cost_usd).toFixed(4)} USD
        </span>
        {run.wall_time_seconds != null && <span>· {run.wall_time_seconds}s</span>}
      </div>

      {awaitingApproval && canManage && (
        <div className="flex items-start gap-2 p-3 rounded bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800">
          <AlertCircle size={14} className="text-blue-700 dark:text-blue-300 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-blue-900 dark:text-blue-200">
              {t('support.agent.approval_required', 'Approbation requise')}
            </p>
            <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5">
              {t('support.agent.approval_desc', 'Tous les gates sont verts. Tu peux déployer sur staging + vérifier avant approbation, ou approuver directement (le CI/CD prendra le relais).')}
            </p>
            <div className="flex gap-2 mt-2 flex-wrap">
              <button
                type="button"
                className="gl-button gl-button-sm gl-button-default"
                onClick={() => onDeployAndVerify(run)}
                disabled={isApproving || isRejecting || isDeploying}
              >
                {isDeploying ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
                {t('support.agent.deploy_verify_btn', 'Déployer + vérifier (staging)')}
              </button>
              <button
                type="button"
                className="gl-button gl-button-sm gl-button-confirm"
                onClick={() => onApprove(run)}
                disabled={isApproving || isRejecting || isDeploying}
              >
                {isApproving ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />}
                {t('support.agent.approve_merge', 'Approuver et merger')}
              </button>
              <button
                type="button"
                className="gl-button gl-button-sm gl-button-default text-destructive"
                onClick={() => onReject(run)}
                disabled={isApproving || isRejecting || isDeploying}
              >
                {isRejecting ? <Loader2 size={12} className="animate-spin" /> : <ThumbsDown size={12} />}
                {t('support.agent.reject', 'Rejeter')}
              </button>
            </div>
          </div>
        </div>
      )}

      {run.dokploy_deploy_url && (
        <VerificationResultsPanel runId={run.id} />
      )}

      {canManage && !awaitingApproval && (
        <button
          type="button"
          className="gl-button gl-button-sm gl-button-default text-destructive"
          onClick={() => onCancel(run)}
        >
          <XCircle size={12} /> {t('support.agent.cancel_run', 'Annuler le run')}
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

function VerificationResultsPanel({ runId }: { runId: string }) {
  const { t } = useTranslation()
  const { data: results = [], isLoading } = useVerificationResults(runId)

  if (isLoading) {
    return (
      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Loader2 size={10} className="animate-spin" /> {t('support.agent.loading_playwright', 'Chargement des résultats Playwright…')}
      </div>
    )
  }
  if (results.length === 0) {
    return null
  }

  const passed = results.filter((r) => r.status === 'passed').length
  const failed = results.filter((r) => r.status === 'failed' || r.status === 'error').length
  const critFail = results.filter(
    (r) => (r.status === 'failed' || r.status === 'error') && r.criticality === 'critical',
  ).length

  return (
    <div className="border border-border/60 rounded bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <Eye size={12} className="text-primary" />
        <span className="font-medium">{t('support.agent.playwright_check', 'Vérification Playwright')}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {passed}✓ {failed}✗ {critFail > 0 && `· ${critFail} ${t('support.agent.critical_count', 'critique(s)')}`}
        </span>
      </div>
      <ul className="space-y-1">
        {results.map((r) => (
          <li
            key={r.id}
            className="flex items-start gap-2 text-[11px] py-1 px-1.5 rounded hover:bg-muted/60"
          >
            {r.status === 'passed' ? (
              <CheckCircle2 size={11} className="text-green-600 mt-0.5 shrink-0" />
            ) : r.status === 'skipped' ? (
              <span className="text-muted-foreground mt-0.5 shrink-0">⊘</span>
            ) : (
              <XCircle size={11} className="text-destructive mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-medium">{r.scenario_name}</span>
                <span
                  className={`text-[9px] px-1 rounded ${
                    r.criticality === 'critical'
                      ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      : r.criticality === 'important'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {r.criticality}
                </span>
                {r.duration_seconds != null && (
                  <span className="text-[10px] text-muted-foreground">{r.duration_seconds}s</span>
                )}
              </div>
              {r.error_excerpt && (
                <p className="text-[10px] text-destructive font-mono mt-0.5 line-clamp-3">
                  {r.error_excerpt}
                </p>
              )}
              {r.console_errors.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {r.console_errors.length} {t('support.agent.console_errors', 'console error(s)')}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
