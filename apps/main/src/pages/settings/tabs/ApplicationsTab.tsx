/**
 * Applications tab — GitLab Pajamas pattern.
 * Matches gitlab.com/-/user_settings/applications
 *
 * API-backed: GET /api/v1/oauth/applications, /authorizations
 * Create via DynamicPanel (CreateAppPanel).
 */
import { useTranslation } from 'react-i18next'
import { AppWindow, Loader2, Trash2 } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useOAuthApps, useDeactivateOAuthApp, useOAuthAuthorizations, useRevokeOAuthAuthorization } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

export function ApplicationsTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data: apps, isLoading: appsLoading } = useOAuthApps()
  const { data: authorizations, isLoading: authsLoading } = useOAuthAuthorizations()
  const deactivateApp = useDeactivateOAuthApp()
  const revokeAuth = useRevokeOAuthAuthorization()

  const handleDeactivate = async (id: string) => {
    try {
      await deactivateApp.mutateAsync(id)
      toast({ title: t('settings.toast.applications.deactivated'), variant: 'success' })
    } catch {
      toast({ title: t('settings.toast.error'), description: t('settings.toast.applications.deactivate_error'), variant: 'error' })
    }
  }

  const handleRevokeAuth = async (id: string) => {
    try {
      await revokeAuth.mutateAsync(id)
      toast({ title: t('settings.toast.applications.auth_revoked'), variant: 'success' })
    } catch {
      toast({ title: t('settings.toast.error'), description: t('settings.toast.applications.auth_revoke_error'), variant: 'error' })
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
          {/* Your applications — header */}
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Vos applications</h3>
              <span className="inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{apps?.length || 0}</span>
            </div>
            <button
              className="gl-button-sm gl-button-confirm"
              onClick={() => openDynamicPanel({ type: 'create', module: 'settings-app' })}
            >
              Ajouter une application
            </button>
          </div>

          {/* Your applications — card grid */}
          {apps && apps.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {apps.map((app) => (
                <div key={app.id} className="border border-border/60 rounded-lg bg-card p-4">
                  {/* App header */}
                  <div className="flex items-start gap-2.5 mb-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                      <AppWindow size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{app.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">ID: {app.client_id}</p>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      app.confidential
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                      {app.confidential ? 'Confidentielle' : 'Publique'}
                    </span>
                    {app.scopes.map((s) => (
                      <span key={s} className="gl-badge gl-badge-neutral">{s}</span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-border/30">
                    <button
                      className="gl-button-sm gl-button-danger"
                      onClick={() => handleDeactivate(app.id)}
                      disabled={deactivateApp.isPending}
                    >
                      <Trash2 size={11} /> Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 py-6 text-center text-sm text-muted-foreground border border-dashed border-border/60 rounded-lg">
              Vous n'avez aucune application.
            </div>
          )}

          {/* Authorized applications — header */}
          <div className="mt-8 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Applications autorisées</h3>
            <span className="inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{authorizations?.length || 0}</span>
          </div>

          {/* Authorized applications — card grid */}
          {authorizations && authorizations.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {authorizations.map((auth) => (
                <div key={auth.id} className="border border-border/60 rounded-lg bg-card p-4">
                  {/* App header */}
                  <div className="flex items-start gap-2.5 mb-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50 shrink-0">
                      <AppWindow size={18} className="text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{auth.application.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Autorisé le {new Date(auth.created_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>

                  {/* Scopes */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {auth.scopes.map((s) => (
                      <span key={s} className="gl-badge gl-badge-neutral">{s}</span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-border/30">
                    <button
                      className="gl-button-sm gl-button-danger"
                      onClick={() => handleRevokeAuth(auth.id)}
                      disabled={revokeAuth.isPending}
                    >
                      Révoquer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 py-6 text-center text-sm text-muted-foreground border border-dashed border-border/60 rounded-lg">
              Vous n'avez autorisé aucune application.
            </div>
          )}
        </>
      )}
    </CollapsibleSection>
  )
}
