/**
 * Card rendered on the ticket detail panel — binds the ticket to a
 * GitHub connector, shows linked Issue/PR and exposes enable/disable
 * toggles.
 */
import { useState } from 'react'
import { Github, Link2, ExternalLink, Loader2, CheckCircle2, PauseCircle } from 'lucide-react'
import { useIntegrationConnections } from '@/hooks/useIntegrationConnections'
import {
  useEnableTicketGithubSync,
  useDisableTicketGithubSync,
} from '@/hooks/useTicketGithubSync'
import { useToast } from '@/components/ui/Toast'

export interface TicketGithubCardTicket {
  id: string
  github_connection_id: string | null
  github_issue_number: number | null
  github_issue_url: string | null
  github_pr_number: number | null
  github_pr_url: string | null
  github_sync_enabled: boolean
  github_last_synced_at: string | null
}

export function TicketGithubCard({
  ticket,
  canManage,
}: {
  ticket: TicketGithubCardTicket
  canManage: boolean
}) {
  const { data: connections, isLoading } = useIntegrationConnections('github')
  const enableSync = useEnableTicketGithubSync()
  const disableSync = useDisableTicketGithubSync()
  const { toast } = useToast()
  const [selectedConnId, setSelectedConnId] = useState<string>('')

  const activeConns = (connections ?? []).filter((c) => c.status === 'active')
  const linkedConn = activeConns.find((c) => c.id === ticket.github_connection_id)
  const isLinked = Boolean(ticket.github_issue_number)

  const handleEnable = async () => {
    if (!selectedConnId) {
      toast({ title: 'Sélectionnez un connecteur', variant: 'warning' })
      return
    }
    try {
      await enableSync.mutateAsync({ ticketId: ticket.id, connectionId: selectedConnId })
      toast({ title: 'Ticket lié à GitHub', variant: 'success' })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string; message?: string } } })?.response?.data
      toast({
        title: 'Échec de liaison GitHub',
        description: msg?.message || msg?.detail || String(err),
        variant: 'error',
      })
    }
  }

  const handleDisable = async () => {
    try {
      await disableSync.mutateAsync(ticket.id)
      toast({ title: 'Sync GitHub désactivée', variant: 'success' })
    } catch (err) {
      toast({ title: 'Erreur', description: String(err), variant: 'error' })
    }
  }

  const handleResume = async () => {
    if (!ticket.github_connection_id) return
    try {
      await enableSync.mutateAsync({
        ticketId: ticket.id,
        connectionId: ticket.github_connection_id,
      })
      toast({ title: 'Sync GitHub réactivée', variant: 'success' })
    } catch (err) {
      toast({ title: 'Erreur', description: String(err), variant: 'error' })
    }
  }

  return (
    <div className="border border-border/60 rounded-lg bg-card">
      <div className="px-4 py-2.5 border-b border-border/40 flex items-center gap-2">
        <Github size={14} className="text-primary" />
        <span className="text-sm font-semibold">GitHub</span>
        {isLinked && ticket.github_sync_enabled && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
            <CheckCircle2 size={10} />
            Sync active
          </span>
        )}
        {isLinked && !ticket.github_sync_enabled && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            <PauseCircle size={10} />
            En pause
          </span>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        {isLinked ? (
          <>
            <div className="text-xs text-muted-foreground">
              Lié au connecteur <strong className="text-foreground">{linkedConn?.name ?? '—'}</strong>
            </div>
            <div className="space-y-1.5">
              <a
                href={ticket.github_issue_url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <Link2 size={11} />
                Issue #{ticket.github_issue_number}
                <ExternalLink size={10} />
              </a>
              {ticket.github_pr_number && (
                <a
                  href={ticket.github_pr_url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <Link2 size={11} />
                  PR #{ticket.github_pr_number}
                  <ExternalLink size={10} />
                </a>
              )}
            </div>
            {ticket.github_last_synced_at && (
              <div className="text-[10px] text-muted-foreground">
                Dernier sync : {new Date(ticket.github_last_synced_at).toLocaleString()}
              </div>
            )}
            {canManage && (
              <div className="flex gap-2 pt-1">
                {ticket.github_sync_enabled ? (
                  <button
                    type="button"
                    className="gl-button gl-button-sm gl-button-default"
                    onClick={handleDisable}
                    disabled={disableSync.isPending}
                  >
                    {disableSync.isPending ? <Loader2 size={12} className="animate-spin" /> : <PauseCircle size={12} />}
                    Mettre en pause
                  </button>
                ) : (
                  <button
                    type="button"
                    className="gl-button gl-button-sm gl-button-confirm"
                    onClick={handleResume}
                    disabled={enableSync.isPending}
                  >
                    {enableSync.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                    Réactiver
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Pas encore lié à une Issue GitHub. Sélectionnez un connecteur pour activer la sync.
            </p>
            {canManage && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    className="gl-form-input text-xs flex-1 min-w-0"
                    value={selectedConnId}
                    onChange={(e) => setSelectedConnId(e.target.value)}
                    disabled={isLoading || activeConns.length === 0}
                  >
                    <option value="">— Choisir un connecteur —</option>
                    {activeConns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (
                        {String((c.config as { repo_owner?: string }).repo_owner)}/
                        {String((c.config as { repo_name?: string }).repo_name)})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="gl-button gl-button-sm gl-button-confirm shrink-0 whitespace-nowrap"
                    onClick={handleEnable}
                    disabled={!selectedConnId || enableSync.isPending}
                  >
                    {enableSync.isPending ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Github size={12} />
                    )}
                    Créer l’Issue GitHub et activer la sync
                  </button>
                </div>
                {activeConns.length === 0 && !isLoading && (
                  <p className="text-[10px] text-muted-foreground italic">
                    Aucun connecteur GitHub actif. Créez-en un via Paramètres → Intégrations.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
