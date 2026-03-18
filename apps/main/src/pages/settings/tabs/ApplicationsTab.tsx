/**
 * Applications tab — GitLab Pajamas pattern.
 * Matches gitlab.com/-/user_settings/applications
 *
 * API-backed: GET /api/v1/oauth/applications, /authorizations
 * Create via DynamicPanel (CreateAppPanel).
 */
import { AppWindow, Loader2, Trash2 } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useOAuthApps, useDeactivateOAuthApp, useOAuthAuthorizations, useRevokeOAuthAuthorization } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

export function ApplicationsTab() {
  const { toast } = useToast()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data: apps, isLoading: appsLoading } = useOAuthApps()
  const { data: authorizations, isLoading: authsLoading } = useOAuthAuthorizations()
  const deactivateApp = useDeactivateOAuthApp()
  const revokeAuth = useRevokeOAuthAuthorization()

  const handleDeactivate = async (id: string) => {
    try {
      await deactivateApp.mutateAsync(id)
      toast({ title: 'Application désactivée', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de désactiver l\'application.', variant: 'error' })
    }
  }

  const handleRevokeAuth = async (id: string) => {
    try {
      await revokeAuth.mutateAsync(id)
      toast({ title: 'Autorisation révoquée', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de révoquer l\'autorisation.', variant: 'error' })
    }
  }

  const isLoading = appsLoading || authsLoading

  return (
    <CollapsibleSection
      id="oauth-apps"
      title="Applications"
      description="Gérez les applications qui peuvent utiliser OpsFlux comme fournisseur OAuth, et les applications que vous avez autorisées à accéder à votre compte."
      storageKey="settings.applications.collapse"
      showSeparator={false}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Your applications */}
          <div className="mt-6 border border-border/60 rounded-lg bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/30 rounded-t-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">Vos applications</span>
                <AppWindow size={14} className="text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{apps?.length || 0}</span>
              </div>
              <button
                className="gl-button-sm gl-button-default"
                onClick={() => openDynamicPanel({ type: 'create', module: 'settings-app' })}
              >
                Ajouter une application
              </button>
            </div>

            {apps && apps.length > 0 ? (
              apps.map((app) => (
                <div key={app.id} className="flex items-center justify-between px-4 py-3 border-b border-border/20 last:border-b-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{app.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">Client ID: {app.client_id}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className="gl-badge gl-badge-info">{app.confidential ? 'Confidentielle' : 'Publique'}</span>
                      {app.scopes.map((s) => (
                        <span key={s} className="gl-badge gl-badge-neutral">{s}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    className="gl-button-sm gl-button-danger shrink-0"
                    onClick={() => handleDeactivate(app.id)}
                    disabled={deactivateApp.isPending}
                  >
                    <Trash2 size={12} /> Supprimer
                  </button>
                </div>
              ))
            ) : (
              <div className="px-4 py-4 text-sm text-muted-foreground">
                Vous n'avez aucune application.
              </div>
            )}
          </div>

          {/* Authorized applications */}
          <div className="mt-4 border border-border/60 rounded-lg bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/30 rounded-t-lg">
              <span className="text-sm font-semibold text-foreground">Applications autorisées</span>
              <AppWindow size={14} className="text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{authorizations?.length || 0}</span>
            </div>

            {authorizations && authorizations.length > 0 ? (
              authorizations.map((auth) => (
                <div key={auth.id} className="flex items-center justify-between px-4 py-3 border-b border-border/20 last:border-b-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{auth.application.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {auth.scopes.map((s) => (
                        <span key={s} className="gl-badge gl-badge-neutral">{s}</span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Autorisé le {new Date(auth.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <button
                    className="gl-button-sm gl-button-danger shrink-0"
                    onClick={() => handleRevokeAuth(auth.id)}
                    disabled={revokeAuth.isPending}
                  >
                    Révoquer
                  </button>
                </div>
              ))
            ) : (
              <div className="px-4 py-4 text-sm text-muted-foreground">
                Vous n'avez autorisé aucune application.
              </div>
            )}
          </div>
        </>
      )}
    </CollapsibleSection>
  )
}
