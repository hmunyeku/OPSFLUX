/**
 * Full review panel for a finished agent run.
 *
 * Shows everything an admin needs to decide on the PR without leaving
 * OPSFLUX:
 *   * Root cause + reasoning
 *   * Files modified with line counts and purpose
 *   * Soft gate failures (CI red, lines over budget) called out
 *   * PR link + Merge / Reject buttons
 *   * Live agent log (tool calls, edits, errors)
 *
 * Used inside `TicketAgentTab` when a run lands in `completed` or
 * `awaiting_human` with a PR attached.
 */
import { useState } from 'react'
import {
  FileEdit, AlertTriangle, GitMerge, XCircle, ExternalLink, ChevronDown, ChevronRight,
  Terminal, Edit3, Search, FileText, ListChecks, CircleAlert, Bot, RefreshCw,
} from 'lucide-react'
import {
  type AgentRun, type AgentLogEntry,
  useAgentLogExcerpt, useRetryCiAgentRun,
} from '@/hooks/useAgentRuns'
import { useToast } from '@/components/ui/Toast'

interface Props {
  run: AgentRun
  onMerge: (run: AgentRun) => void
  onReject: (run: AgentRun) => void
  isMerging: boolean
  isRejecting: boolean
  canManage: boolean
}

export function AgentRunReviewPanel({
  run,
  onMerge,
  onReject,
  isMerging,
  isRejecting,
  canManage,
}: Props) {
  const report = run.report_json
  const failedGates = run.failed_gates
  const hasPR = Boolean(run.github_pr_url)
  const [logsOpen, setLogsOpen] = useState(false)
  const { toast } = useToast()
  const retryCi = useRetryCiAgentRun()
  const ciFailed = Boolean(failedGates?.ci_status && !failedGates.ci_status.ok)
  const canRetryCi = canManage && ciFailed && hasPR && run.status !== 'rejected'

  return (
    <div className="space-y-3">
      {/* Status banner */}
      <StatusBanner run={run} />

      {/* Root cause + reasoning */}
      {report?.root_cause && (
        <div className="border border-border/60 rounded bg-muted/30 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            Cause racine
          </p>
          <p className="text-xs text-foreground">{report.root_cause}</p>
          {report.reasoning_summary && (
            <>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-3 mb-1">
                Raisonnement
              </p>
              <p className="text-xs text-foreground">{report.reasoning_summary}</p>
            </>
          )}
        </div>
      )}

      {/* Files modified */}
      {report?.files_modified && report.files_modified.length > 0 && (
        <div className="border border-border/60 rounded">
          <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
            <FileEdit size={12} className="text-primary" />
            <span className="text-xs font-medium">
              Fichiers modifiés ({report.files_modified.length})
            </span>
          </div>
          <ul className="divide-y divide-border/30">
            {report.files_modified.map((f) => (
              <li key={f.path} className="px-3 py-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="font-mono text-[11px] text-foreground">{f.path}</code>
                  <span className="text-[10px] text-green-700 dark:text-green-400">+{f.lines_added}</span>
                  <span className="text-[10px] text-red-700 dark:text-red-400">−{f.lines_removed}</span>
                </div>
                {f.purpose && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{f.purpose}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Failed gates */}
      {failedGates && Object.keys(failedGates).length > 0 && (
        <div className="border border-yellow-300 dark:border-yellow-800 rounded bg-yellow-50 dark:bg-yellow-950/40 p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={12} className="text-yellow-700 dark:text-yellow-400" />
            <span className="text-xs font-medium text-yellow-900 dark:text-yellow-200">
              Vérifications post-execution
            </span>
          </div>
          <ul className="space-y-1 mt-2">
            {Object.entries(failedGates).map(([name, info]) => (
              <li key={name} className="text-[11px] text-yellow-900 dark:text-yellow-200">
                <code className="font-mono text-[10px]">{name}</code> — {info.message}
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-yellow-700 dark:text-yellow-400 mt-2">
            La PR reste ouverte pour ta review. Vérifie les CI checks GitHub avant de merger.
          </p>
        </div>
      )}

      {/* Warnings from the agent itself */}
      {report?.warnings && report.warnings.length > 0 && (
        <div className="border border-orange-300 dark:border-orange-800 rounded bg-orange-50 dark:bg-orange-950/40 p-3">
          <div className="flex items-center gap-2 mb-1">
            <CircleAlert size={12} className="text-orange-700 dark:text-orange-400" />
            <span className="text-xs font-medium text-orange-900 dark:text-orange-200">
              L'agent signale
            </span>
          </div>
          <ul className="list-disc list-inside text-[11px] text-orange-900 dark:text-orange-200 space-y-0.5 mt-1">
            {report.warnings.map((w, i) => (<li key={i}>{w}</li>))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      {canManage && hasPR && run.status !== 'rejected' && (
        <div className="flex gap-2 flex-wrap pt-1">
          <a
            href={run.github_pr_url!}
            target="_blank" rel="noopener noreferrer"
            className="gl-button gl-button-sm gl-button-default"
          >
            <ExternalLink size={11} /> Voir la PR sur GitHub
          </a>
          <button
            type="button"
            className="gl-button gl-button-sm gl-button-confirm"
            onClick={() => onMerge(run)}
            disabled={isMerging || isRejecting}
          >
            <GitMerge size={11} />
            {isMerging ? 'Merge en cours…' : 'Merger sur main'}
          </button>
          <button
            type="button"
            className="gl-button gl-button-sm gl-button-default text-destructive"
            onClick={() => onReject(run)}
            disabled={isMerging || isRejecting}
          >
            <XCircle size={11} />
            {isRejecting ? 'Rejet…' : 'Rejeter'}
          </button>
          {canRetryCi && (
            <button
              type="button"
              className="gl-button gl-button-sm gl-button-default"
              disabled={retryCi.isPending || isMerging || isRejecting}
              onClick={() => {
                retryCi.mutate(run.id, {
                  onSuccess: () => toast({ variant: 'success', title: 'Run de correction CI lancé' }),
                  onError: (e) => toast({ variant: 'error', title: (e as Error).message || 'Échec du retry' }),
                })
              }}
              title="L'agent va reprendre la même branche, lire les logs CI et tenter de corriger."
            >
              <RefreshCw size={11} className={retryCi.isPending ? 'animate-spin' : ''} />
              {retryCi.isPending ? 'Relance…' : 'Corriger les CI rouges'}
            </button>
          )}
        </div>
      )}

      {/* Logs viewer (collapsible) */}
      <button
        type="button"
        className="w-full text-left flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground py-1.5 px-2 rounded hover:bg-muted/40"
        onClick={() => setLogsOpen((v) => !v)}
      >
        {logsOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Terminal size={11} />
        Voir les logs de l'agent
      </button>
      {logsOpen && <AgentLogStream runId={run.id} />}

      {/* Next steps */}
      {report?.next_steps_recommended && report.next_steps_recommended.length > 0 && (
        <div className="border border-border/60 rounded p-3">
          <div className="flex items-center gap-2 mb-1">
            <ListChecks size={12} className="text-primary" />
            <span className="text-xs font-medium">Prochaines étapes recommandées</span>
          </div>
          <ul className="list-decimal list-inside text-[11px] text-muted-foreground space-y-0.5 mt-1">
            {report.next_steps_recommended.map((s, i) => (<li key={i}>{s}</li>))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StatusBanner({ run }: { run: AgentRun }) {
  const status = run.status
  const cls =
    status === 'completed'
      ? 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800 text-green-900 dark:text-green-200'
      : status === 'awaiting_human'
        ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
        : status === 'failed' || status === 'rejected'
          ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
          : 'bg-muted border-border text-muted-foreground'
  const label =
    status === 'completed' ? 'Run terminé — la PR attend ta review'
      : status === 'awaiting_human' ? 'Approbation requise'
        : status === 'failed' ? 'Run en échec'
          : status === 'rejected' ? 'Run rejeté'
            : status
  return (
    <div className={`border rounded px-3 py-2 text-xs ${cls}`}>
      <div className="flex items-center gap-2">
        <Bot size={12} />
        <span className="font-medium">{label}</span>
        <span className="ml-auto text-[10px] opacity-70">
          {run.llm_tokens_used.toLocaleString()} tok ·{' '}
          {Number(run.llm_cost_usd).toFixed(3)} USD ·{' '}
          {run.wall_time_seconds}s
        </span>
      </div>
    </div>
  )
}

function AgentLogStream({ runId }: { runId: string }) {
  const { data: logs = [], isLoading, isError } = useAgentLogExcerpt(runId)

  if (isLoading) {
    return <div className="text-[11px] text-muted-foreground p-2">Chargement des logs…</div>
  }
  if (isError) {
    return <div className="text-[11px] text-destructive p-2">Logs indisponibles (volume non monté ?)</div>
  }
  if (logs.length === 0) {
    return <div className="text-[11px] text-muted-foreground italic p-2">Aucun événement de log.</div>
  }
  return (
    <div className="border border-border/60 rounded bg-black/90 dark:bg-black p-2 max-h-96 overflow-y-auto font-mono text-[10.5px]">
      {logs.map((entry, i) => (
        <LogLine key={i} entry={entry} />
      ))}
    </div>
  )
}

function LogLine({ entry }: { entry: AgentLogEntry }) {
  let icon: React.ReactNode = null
  let color = 'text-zinc-300'
  switch (entry.type) {
    case 'bash': icon = <Terminal size={10} className="text-cyan-400" />; color = 'text-cyan-200'; break
    case 'edit': icon = <Edit3 size={10} className="text-green-400" />; color = 'text-green-200'; break
    case 'read': icon = <FileText size={10} className="text-zinc-400" />; color = 'text-zinc-300'; break
    case 'grep': icon = <Search size={10} className="text-purple-400" />; color = 'text-purple-200'; break
    case 'todo': icon = <ListChecks size={10} className="text-yellow-400" />; color = 'text-yellow-200'; break
    case 'agent_text': icon = <Bot size={10} className="text-blue-400" />; color = 'text-blue-200'; break
    case 'error': icon = <AlertTriangle size={10} className="text-red-400" />; color = 'text-red-300'; break
    case 'init':
    case 'end': icon = <Bot size={10} className="text-amber-400" />; color = 'text-amber-200'; break
    default: icon = <Terminal size={10} className="text-zinc-500" />
  }
  return (
    <div className={`flex items-start gap-1.5 py-0.5 ${entry.is_error ? 'bg-red-950/40 -mx-2 px-2 rounded' : ''}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className={`whitespace-pre-wrap break-all ${color}`}>{entry.summary}</span>
    </div>
  )
}
