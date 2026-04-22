/**
 * Create Token panel — opens in DynamicPanelShell (right side).
 *
 * API-backed: POST /api/v1/tokens
 * On success, displays the full token value (shown only once, user must copy).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Key, Loader2, Copy, Check } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useCreateToken } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormSection,
  PanelActionButton,
  panelInputClass,
} from '@/components/layout/DynamicPanel'

const scopeOptions = [
  { value: 'api', label: 'api', description: 'Accès complet à l\'API' },
  { value: 'read_api', label: 'read_api', description: 'Lecture seule API' },
  { value: 'read_repository', label: 'read_repository', description: 'Lecture des données' },
  { value: 'write_repository', label: 'write_repository', description: 'Écriture des données' },
]

export function CreateTokenPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createToken = useCreateToken()

  const [tokenName, setTokenName] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [selectedScopes, setSelectedScopes] = useState<string[]>([])

  // Post-creation: show the token value
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    )
  }

  const canSubmit = tokenName.trim().length > 0 && selectedScopes.length > 0 && !createToken.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const result = await createToken.mutateAsync({
        name: tokenName.trim(),
        scopes: selectedScopes,
        expires_at: expiresAt || null,
      })
      setCreatedToken(result.token)
      toast({ title: t('settings.toast.tokens.created'), description: t('settings.toast.tokens.created_desc'), variant: 'success', duration: 8000 })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('settings.toast.tokens.create_error')
      toast({ title: t('settings.toast.error'), description: message, variant: 'error' })
    }
  }

  const handleCopy = () => {
    if (createdToken) {
      navigator.clipboard.writeText(createdToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // After creation — show the token value for copying
  if (createdToken) {
    return (
      <DynamicPanelShell
        title={t('settings.toast.tokens.created')}
        icon={<Key size={14} className="text-primary" />}
        actions={
          <PanelActionButton variant="primary" onClick={closeDynamicPanel}>
            Fermer
          </PanelActionButton>
        }
      >
        <div className="p-4 space-y-4">
          <div className="rounded-lg border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/50 p-4">
            <p className="text-sm font-semibold text-green-800 dark:text-green-200 mb-2">
              Votre jeton d'accès personnel
            </p>
            <p className="text-xs text-green-700 dark:text-green-300 mb-3">
              Copiez ce jeton maintenant. Il ne sera plus affiché après fermeture.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-background p-2 rounded border border-border break-all select-all">
                {createdToken}
              </code>
              <button onClick={handleCopy} className="gl-button-sm gl-button-default shrink-0" title="Copier">
                {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={t('settings.nouveau_jeton')}
      icon={<Key size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={!canSubmit}
            onClick={() => (document.getElementById('create-token-form') as HTMLFormElement | null)?.requestSubmit()}
          >
            {createToken.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Créer le jeton'}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-token-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        <FormSection title={t('common.information')}>
          <DynamicPanelField label={t('settings.nom_du_jeton')} required>
            <input
              type="text"
              className={panelInputClass}
              placeholder="Ex: CI/CD Pipeline"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
            />
          </DynamicPanelField>

          <DynamicPanelField label="Date d'expiration">
            <input
              type="date"
              className={panelInputClass}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Laissez vide pour un jeton sans expiration.
            </p>
          </DynamicPanelField>
        </FormSection>

        <FormSection title={t('common.scopes')} collapsible storageKey="panel.token.sections" id="token-scopes">
          <div className="space-y-2">
            {scopeOptions.map((scope) => (
              <label key={scope.value} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedScopes.includes(scope.value)}
                  onChange={() => toggleScope(scope.value)}
                  className="h-4 w-4 accent-primary mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium text-foreground font-mono">{scope.label}</span>
                  <p className="text-xs text-muted-foreground">{scope.description}</p>
                </div>
              </label>
            ))}
          </div>
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}
