/**
 * Active sessions tab — GitLab Pajamas pattern.
 * Matches gitlab.com/-/user_settings/active_sessions
 *
 * API-backed: GET /api/v1/sessions, DELETE /sessions/:id, POST /sessions/revoke-all
 */
import { Monitor, Smartphone, Tablet, Loader2 } from 'lucide-react'
import { useSessions, useRevokeSession, useRevokeAllSessions } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

const deviceIcons = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
} as const

export function SessionsTab() {
  const { toast } = useToast()
  const { data: sessions, isLoading } = useSessions()
  const revokeSession = useRevokeSession()
  const revokeAll = useRevokeAllSessions()

  const handleRevoke = async (id: string) => {
    try {
      await revokeSession.mutateAsync(id)
      toast({ title: 'Session révoquée', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de révoquer la session.', variant: 'error' })
    }
  }

  const handleRevokeAll = async () => {
    try {
      const result = await revokeAll.mutateAsync()
      toast({ title: 'Sessions révoquées', description: `${result.revoked_count} session(s) déconnectée(s).`, variant: 'success' })
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de révoquer les sessions.', variant: 'error' })
    }
  }

  const otherSessions = sessions?.filter((s) => !s.is_current) || []

  return (
    <CollapsibleSection
      id="active-sessions"
      title="Sessions actives"
      description="Liste des appareils connectés à votre compte. Révoquez les sessions que vous ne reconnaissez pas."
      storageKey="settings.sessions.collapse"
      showSeparator={false}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {sessions?.map((session) => {
              const Icon = deviceIcons[session.device_type] || Monitor
              return (
                <div
                  key={session.id}
                  className={`border rounded-lg p-4 transition-colors ${
                    session.is_current
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border/60 bg-card'
                  }`}
                >
                  {/* Header: device icon + IP + current badge */}
                  <div className="flex items-start gap-2.5 mb-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
                      session.is_current ? 'bg-primary/10' : 'bg-muted/50'
                    }`}>
                      <Icon size={18} className={session.is_current ? 'text-primary' : 'text-muted-foreground'} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{session.ip_address || 'IP inconnue'}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {session.is_current && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            Session actuelle
                          </span>
                        )}
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground">
                          {session.device_type || 'desktop'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-1 mb-3">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{session.browser || 'Navigateur inconnu'}</span>
                      {' sur '}
                      <span className="font-medium text-foreground">{session.os || 'OS inconnu'}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Connecté le {new Date(session.created_at).toLocaleString('fr-FR')}
                    </p>
                    {!session.is_current && session.last_active_at && (
                      <p className="text-xs text-muted-foreground">
                        Dernier accès le {new Date(session.last_active_at).toLocaleString('fr-FR')}
                      </p>
                    )}
                  </div>

                  {/* Action */}
                  {!session.is_current && (
                    <div className="pt-2 border-t border-border/30">
                      <button
                        className="gl-button-sm gl-button-danger"
                        onClick={() => handleRevoke(session.id)}
                        disabled={revokeSession.isPending}
                      >
                        Révoquer
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {(!sessions || sessions.length === 0) && (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucune session active.</p>
          )}

          {otherSessions.length > 0 && (
            <div className="mt-6">
              <button className="gl-button gl-button-danger" onClick={handleRevokeAll} disabled={revokeAll.isPending}>
                {revokeAll.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
                Révoquer toutes les autres sessions
              </button>
            </div>
          )}
        </>
      )}
    </CollapsibleSection>
  )
}
