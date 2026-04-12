/**
 * Create Application panel — opens in DynamicPanelShell (right side).
 *
 * API-backed: POST /api/v1/oauth/applications
 * On success, displays client_id and client_secret (shown only once).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppWindow, Loader2, Copy, Check } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useCreateOAuthApp } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import type { OAuthAppCreated } from '@/types/api'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormSection,
  PanelActionButton,
  panelInputClass,
} from '@/components/layout/DynamicPanel'

const scopeOptions = [
  { value: 'api', label: 'api', desc: 'Accès complet à l\'API' },
  { value: 'read_user', label: 'read_user', desc: 'Lecture du profil utilisateur' },
  { value: 'openid', label: 'openid', desc: 'Authentification OpenID Connect' },
  { value: 'profile', label: 'profile', desc: 'Accès au profil' },
  { value: 'email', label: 'email', desc: 'Accès à l\'adresse email' },
]

export function CreateAppPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createApp = useCreateOAuthApp()

  const [appName, setAppName] = useState('')
  const [redirectUri, setRedirectUri] = useState('')
  const [confidential, setConfidential] = useState(true)
  const [selectedScopes, setSelectedScopes] = useState<string[]>([])

  // Post-creation: show credentials
  const [createdApp, setCreatedApp] = useState<OAuthAppCreated | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const canSubmit = appName.trim().length > 0 && redirectUri.trim().length > 0 && !createApp.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const uris = redirectUri.split('\n').map((u) => u.trim()).filter(Boolean)
    try {
      const result = await createApp.mutateAsync({
        name: appName.trim(),
        redirect_uris: uris,
        scopes: selectedScopes,
        confidential,
      })
      setCreatedApp(result)
      toast({ title: t('settings.toast.apps.created'), description: t('settings.toast.apps.created_desc'), variant: 'success', duration: 8000 })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('settings.toast.apps.create_error')
      toast({ title: t('settings.toast.error'), description: message, variant: 'error' })
    }
  }

  const handleCopy = (field: string, value: string) => {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  // After creation — show credentials
  if (createdApp) {
    return (
      <DynamicPanelShell
        title="Application créée"
        icon={<AppWindow size={14} className="text-primary" />}
        actions={
          <PanelActionButton variant="primary" onClick={closeDynamicPanel}>
            Fermer
          </PanelActionButton>
        }
      >
        <div className="p-4 space-y-4">
          <div className="rounded-lg border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/50 p-4">
            <p className="text-sm font-semibold text-green-800 dark:text-green-200 mb-3">
              Identifiants de l'application
            </p>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-green-700 dark:text-green-300 font-medium mb-1">Client ID</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-background p-2 rounded border border-border break-all select-all">
                    {createdApp.client_id}
                  </code>
                  <button onClick={() => handleCopy('client_id', createdApp.client_id)} className="gl-button-sm gl-button-default shrink-0">
                    {copiedField === 'client_id' ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {createdApp.client_secret && (
                <div>
                  <p className="text-xs text-green-700 dark:text-green-300 font-medium mb-1">Client Secret</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mb-1">
                    Ce secret ne sera plus affiché. Copiez-le maintenant.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-background p-2 rounded border border-border break-all select-all">
                      {createdApp.client_secret}
                    </code>
                    <button onClick={() => handleCopy('client_secret', createdApp.client_secret!)} className="gl-button-sm gl-button-default shrink-0">
                      {copiedField === 'client_secret' ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title="Nouvelle application"
      icon={<AppWindow size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>Annuler</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={!canSubmit}
            onClick={() => (document.getElementById('create-app-form') as HTMLFormElement | null)?.requestSubmit()}
          >
            {createApp.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Enregistrer'}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-app-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        <FormSection title="Informations">
          <DynamicPanelField label="Nom de l'application" required>
            <input
              type="text"
              className={panelInputClass}
              placeholder="Mon application"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
            />
          </DynamicPanelField>

          <DynamicPanelField label="URI de redirection" required>
            <textarea
              className={`${panelInputClass} h-20 resize-y`}
              placeholder="https://mon-app.example.com/callback"
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">Une URI par ligne.</p>
          </DynamicPanelField>
        </FormSection>

        <FormSection title="Confidentialité" collapsible storageKey="panel.app.sections" id="app-confidentiality">
          <div className="space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="confidential"
                checked={confidential}
                onChange={() => setConfidential(true)}
                className="h-4 w-4 accent-primary mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-foreground">Confidentielle</span>
                <p className="text-xs text-muted-foreground">Serveur web — peut garder son secret.</p>
              </div>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="confidential"
                checked={!confidential}
                onChange={() => setConfidential(false)}
                className="h-4 w-4 accent-primary mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-foreground">Publique</span>
                <p className="text-xs text-muted-foreground">SPA / mobile — ne peut garder de secret.</p>
              </div>
            </label>
          </div>
        </FormSection>

        <FormSection title="Scopes" collapsible storageKey="panel.app.sections" id="app-scopes">
          <div className="space-y-2">
            {scopeOptions.map((scope) => (
              <label key={scope.value} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedScopes.includes(scope.value)}
                  onChange={() => {
                    setSelectedScopes((prev) =>
                      prev.includes(scope.value) ? prev.filter((s) => s !== scope.value) : [...prev, scope.value]
                    )
                  }}
                  className="h-4 w-4 accent-primary mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium text-foreground font-mono">{scope.label}</span>
                  <p className="text-xs text-muted-foreground">{scope.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}
