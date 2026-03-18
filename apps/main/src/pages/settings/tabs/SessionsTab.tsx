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
          <div className="mt-6 space-y-3">
            {sessions?.map((session) => {
              const Icon = deviceIcons[session.device_type] || Monitor
              return (
                <div key={session.id} className="flex items-start gap-3 py-4 px-4 border border-border/60 rounded-lg bg-card">
                  <Icon size={20} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{session.ip_address || 'IP inconnue'}</p>
                    {session.is_current ? (
                      <p className="text-sm text-muted-foreground">Session actuelle</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Dernier accès le {new Date(session.last_active_at).toLocaleString('fr-FR')}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{session.browser || 'Navigateur inconnu'}</span>
                      {' sur '}
                      <span className="font-medium text-foreground">{session.os || 'OS inconnu'}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Connecté le {new Date(session.created_at).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  {!session.is_current && (
                    <button
                      className="gl-button gl-button-danger shrink-0"
                      onClick={() => handleRevoke(session.id)}
                      disabled={revokeSession.isPending}
                    >
                      Révoquer
                    </button>
                  )}
                </div>
              )
            })}

            {(!sessions || sessions.length === 0) && (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucune session active.</p>
            )}
          </div>

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
