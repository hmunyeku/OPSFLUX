/**
 * HeavyConnectorsSection — CRUD UI for GitHub / Dokploy / Agent Runner
 * connectors stored in `integration_connections`.
 *
 * Rendered as a sub-section inside the global IntegrationsTab next to the
 * Settings-key-based light integrations. Each connector is editable in
 * place via an accordion row with its type-specific fields.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Github,
  Rocket,
  Bot,
  Plus,
  Trash2,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Edit3,
} from 'lucide-react'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  useIntegrationConnections,
  useCreateIntegrationConnection,
  useUpdateIntegrationConnection,
  useDeleteIntegrationConnection,
  useTestIntegrationConnection,
  type IntegrationConnection,
  type IntegrationConnectionType,
} from '@/hooks/useIntegrationConnections'

const TYPE_META: Record<IntegrationConnectionType, { icon: typeof Github; label: string; description: string }> = {
  github: {
    icon: Github,
    label: 'GitHub',
    description: 'Dépôt GitHub lié pour création d’Issues/PRs et déclenchement de l’agent de maintenance.',
  },
  dokploy: {
    icon: Rocket,
    label: 'Dokploy',
    description: 'Instance Dokploy pour déploiement staging/production automatisé.',
  },
  agent_runner: {
    icon: Bot,
    label: 'Agent Runner',
    description: 'Exécuteur d’agent IA (Claude Code ou Codex) pour les runs de maintenance.',
  },
}

export function HeavyConnectorsSection() {
  const { t } = useTranslation()
  const { data: connections, isLoading } = useIntegrationConnections()
  const { toast } = useToast()
  const confirm = useConfirm()
  const del = useDeleteIntegrationConnection()
  const test = useTestIntegrationConnection()

  const [creatingType, setCreatingType] = useState<IntegrationConnectionType | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleTest = async (id: string) => {
    try {
      const result = await test.mutateAsync(id)
      toast({
        title: result.ok ? 'Connexion validée' : 'Connexion échouée',
        description: result.message,
        variant: result.ok ? 'success' : 'error',
      })
    } catch (err) {
      toast({ title: 'Erreur', description: String(err), variant: 'error' })
    }
  }

  const handleDelete = async (conn: IntegrationConnection) => {
    const ok = await confirm({
      title: 'Supprimer le connecteur ?',
      message: `"${conn.name}" sera définitivement supprimé. Les credentials chiffrés seront perdus.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await del.mutateAsync(conn.id)
      toast({ title: 'Connecteur supprimé', variant: 'success' })
    } catch (err) {
      toast({ title: 'Erreur', description: String(err), variant: 'error' })
    }
  }

  const byType = (type: IntegrationConnectionType) =>
    (connections ?? []).filter((c) => c.connection_type === type)

  return (
    <CollapsibleSection
      id="heavy-connectors"
      title={t('integrations.heavy.title', 'Connecteurs avancés')}
      description={t(
        'integrations.heavy.description',
        'GitHub, Dokploy et Agent Runner. Nécessaires pour activer l’agent de maintenance IA.',
      )}
      storageKey="settings.integrations.collapse"
    >
      <div className="mt-2 space-y-4">
        {(['github', 'dokploy', 'agent_runner'] as const).map((type) => {
          const meta = TYPE_META[type]
          const Icon = meta.icon
          const rows = byType(type)
          return (
            <div key={type} className="border border-border/60 rounded-lg bg-card">
              <div className="px-4 py-3 border-b border-border/40 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Icon size={16} className="text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">{meta.label}</div>
                    <p className="text-[11px] text-muted-foreground">{meta.description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="gl-button gl-button-sm gl-button-confirm shrink-0"
                  onClick={() => setCreatingType(type)}
                >
                  <Plus size={12} />
                  {t('common.add', 'Ajouter')}
                </button>
              </div>

              {isLoading && rows.length === 0 ? (
                <div className="p-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" />
                  {t('common.loading', 'Chargement…')}
                </div>
              ) : rows.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground italic">
                  {t('integrations.heavy.no_connector', 'Aucun connecteur configuré.')}
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {rows.map((conn) => (
                    <ConnectorRow
                      key={conn.id}
                      conn={conn}
                      isEditing={editingId === conn.id}
                      onStartEdit={() => setEditingId(conn.id)}
                      onStopEdit={() => setEditingId(null)}
                      onTest={() => handleTest(conn.id)}
                      onDelete={() => handleDelete(conn)}
                      isTesting={test.isPending}
                    />
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {creatingType && (
        <ConnectorForm
          mode="create"
          connectionType={creatingType}
          onClose={() => setCreatingType(null)}
        />
      )}
    </CollapsibleSection>
  )
}

// ── Row ─────────────────────────────────────────────────────────────

function ConnectorRow({
  conn,
  isEditing,
  onStartEdit,
  onStopEdit,
  onTest,
  onDelete,
  isTesting,
}: {
  conn: IntegrationConnection
  isEditing: boolean
  onStartEdit: () => void
  onStopEdit: () => void
  onTest: () => void
  onDelete: () => void
  isTesting: boolean
}) {
  const lastTest = conn.last_test_result
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{conn.name}</span>
            <StatusPill status={conn.status} />
            {lastTest && (
              <span
                className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
                  lastTest.ok
                    ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                }`}
              >
                {lastTest.ok ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                {lastTest.ok ? 'Testé OK' : 'Dernier test KO'}
              </span>
            )}
          </div>
          <ConfigSummary conn={conn} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="gl-button gl-button-sm gl-button-default"
            onClick={onTest}
            disabled={isTesting}
            title="Tester la connexion"
          >
            {isTesting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          </button>
          <button
            type="button"
            className="gl-button gl-button-sm gl-button-default"
            onClick={isEditing ? onStopEdit : onStartEdit}
            title={isEditing ? 'Fermer' : 'Éditer'}
          >
            <Edit3 size={12} />
          </button>
          <button
            type="button"
            className="gl-button gl-button-sm gl-button-default text-destructive"
            onClick={onDelete}
            title="Supprimer"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {isEditing && (
        <ConnectorForm
          mode="edit"
          connectionType={conn.connection_type}
          initial={conn}
          onClose={onStopEdit}
        />
      )}
    </li>
  )
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'active'
      ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
      : status === 'error'
        ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
        : 'bg-muted text-muted-foreground'
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{status}</span>
}

function ConfigSummary({ conn }: { conn: IntegrationConnection }) {
  const c = conn.config as Record<string, unknown>
  const parts: string[] = []
  if (conn.connection_type === 'github') {
    if (c.repo_owner && c.repo_name) parts.push(`${c.repo_owner}/${c.repo_name}`)
    if (c.auth_method) parts.push(String(c.auth_method))
  } else if (conn.connection_type === 'dokploy') {
    if (c.environment_label) parts.push(`env: ${c.environment_label}`)
    if (c.compose_id) parts.push(`compose: ${c.compose_id}`)
    else if (c.application_id) parts.push(`app: ${c.application_id}`)
  } else if (conn.connection_type === 'agent_runner') {
    if (c.runner_type) parts.push(String(c.runner_type))
    if (c.model_preference) parts.push(String(c.model_preference))
  }
  if (parts.length === 0) return null
  return <p className="text-[11px] text-muted-foreground mt-0.5">{parts.join(' · ')}</p>
}

// ── Form (create + edit) ────────────────────────────────────────────

function ConnectorForm({
  mode,
  connectionType,
  initial,
  onClose,
}: {
  mode: 'create' | 'edit'
  connectionType: IntegrationConnectionType
  initial?: IntegrationConnection
  onClose: () => void
}) {
  const { toast } = useToast()
  const create = useCreateIntegrationConnection()
  const update = useUpdateIntegrationConnection()

  const [name, setName] = useState<string>(initial?.name ?? '')
  const [config, setConfig] = useState<Record<string, unknown>>(
    initial?.config ?? getDefaultConfig(connectionType),
  )
  const [credentials, setCredentials] = useState<Record<string, string>>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (mode === 'create') {
        await create.mutateAsync({
          connection_type: connectionType,
          name,
          config,
          credentials,
        })
        toast({ title: 'Connecteur créé', variant: 'success' })
      } else if (initial) {
        const body: Parameters<typeof update.mutateAsync>[0] = {
          id: initial.id,
          name,
          config,
        }
        // Only send credentials if user filled at least one field
        if (Object.values(credentials).some((v) => v)) {
          body.credentials = credentials
        }
        await update.mutateAsync(body)
        toast({ title: 'Connecteur mis à jour', variant: 'success' })
      }
      onClose()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({ title: 'Erreur', description: detail || String(err), variant: 'error' })
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <form onSubmit={handleSubmit} className="mt-3 p-3 border border-border/60 rounded bg-muted/30 space-y-3">
      <div>
        <label className="gl-label-sm">Nom du connecteur *</label>
        <input
          type="text"
          required
          className="gl-form-input"
          placeholder="Ex: Dépôt principal"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {connectionType === 'github' && (
        <GithubFields config={config} setConfig={setConfig} credentials={credentials} setCredentials={setCredentials} isEdit={mode === 'edit'} preview={initial?.credentials_preview} />
      )}
      {connectionType === 'dokploy' && (
        <DokployFields config={config} setConfig={setConfig} credentials={credentials} setCredentials={setCredentials} isEdit={mode === 'edit'} preview={initial?.credentials_preview} />
      )}
      {connectionType === 'agent_runner' && (
        <AgentRunnerFields config={config} setConfig={setConfig} credentials={credentials} setCredentials={setCredentials} isEdit={mode === 'edit'} preview={initial?.credentials_preview} />
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="gl-button gl-button-sm gl-button-default" onClick={onClose}>Annuler</button>
        <button type="submit" className="gl-button gl-button-sm gl-button-confirm" disabled={busy}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : mode === 'create' ? 'Créer' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

function getDefaultConfig(type: IntegrationConnectionType): Record<string, unknown> {
  if (type === 'github') {
    return { auth_method: 'personal_access_token', repo_owner: '', repo_name: '', default_branch: 'main' }
  }
  if (type === 'dokploy') {
    return {
      api_url: '',
      project_id: '',
      application_id: '',
      compose_id: '',
      environment_label: 'staging',
      health_check_url: '',
      health_check_timeout_seconds: 300,
      deployment_strategy: 'restart',
    }
  }
  return {
    runner_type: 'claude_code',
    auth_method: 'api_key',
    model_preference: 'claude-opus-4-7',
    max_tokens_budget_per_run: 200000,
    max_wall_time_seconds: 1800,
    monthly_budget_usd: 200,
    additional_flags: [],
  }
}

type FieldsProps = {
  config: Record<string, unknown>
  setConfig: (c: Record<string, unknown>) => void
  credentials: Record<string, string>
  setCredentials: (c: Record<string, string>) => void
  isEdit: boolean
  preview?: Record<string, string>
}

function GithubFields({ config, setConfig, credentials, setCredentials, isEdit, preview }: FieldsProps) {
  const auth = (config.auth_method as string) ?? 'personal_access_token'
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="gl-label-sm">Méthode d'authentification</label>
          <select
            className="gl-form-input"
            value={auth}
            onChange={(e) => setConfig({ ...config, auth_method: e.target.value })}
          >
            <option value="personal_access_token">Personal Access Token</option>
            <option value="github_app">GitHub App (recommandé)</option>
          </select>
        </div>
        <div>
          <label className="gl-label-sm">Branche par défaut</label>
          <input
            type="text"
            className="gl-form-input"
            value={(config.default_branch as string) ?? 'main'}
            onChange={(e) => setConfig({ ...config, default_branch: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="gl-label-sm">Owner *</label>
          <input
            type="text"
            required
            className="gl-form-input"
            placeholder="votre-organisation"
            value={(config.repo_owner as string) ?? ''}
            onChange={(e) => setConfig({ ...config, repo_owner: e.target.value })}
          />
        </div>
        <div>
          <label className="gl-label-sm">Nom du repo *</label>
          <input
            type="text"
            required
            className="gl-form-input"
            placeholder="nom-du-repo"
            value={(config.repo_name as string) ?? ''}
            onChange={(e) => setConfig({ ...config, repo_name: e.target.value })}
          />
        </div>
      </div>

      {auth === 'personal_access_token' && (
        <div>
          <label className="gl-label-sm">Token {isEdit && '(laisser vide pour conserver)'}</label>
          <input
            type="password"
            required={!isEdit}
            className="gl-form-input font-mono"
            placeholder={preview?.token || 'ghp_...'}
            value={credentials.token ?? ''}
            onChange={(e) => setCredentials({ ...credentials, token: e.target.value })}
          />
        </div>
      )}

      {auth === 'github_app' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="gl-label-sm">App ID *</label>
              <input
                type="text"
                className="gl-form-input"
                value={(config.app_id as string) ?? ''}
                onChange={(e) => setConfig({ ...config, app_id: e.target.value })}
              />
            </div>
            <div>
              <label className="gl-label-sm">Installation ID *</label>
              <input
                type="text"
                className="gl-form-input"
                value={(config.installation_id as string) ?? ''}
                onChange={(e) => setConfig({ ...config, installation_id: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="gl-label-sm">Private Key (PEM) {isEdit && '(laisser vide pour conserver)'}</label>
            <textarea
              className="gl-form-input font-mono h-32"
              placeholder={preview?.private_key || '-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----'}
              value={credentials.private_key ?? ''}
              onChange={(e) => setCredentials({ ...credentials, private_key: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  )
}

function DokployFields({ config, setConfig, credentials, setCredentials, isEdit, preview }: FieldsProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="gl-label-sm">API URL *</label>
        <input
          type="url"
          required
          className="gl-form-input"
          placeholder="https://dokploy.exemple.com/api"
          value={(config.api_url as string) ?? ''}
          onChange={(e) => setConfig({ ...config, api_url: e.target.value })}
        />
      </div>
      <div>
        <label className="gl-label-sm">Project ID *</label>
        <input
          type="text"
          required
          className="gl-form-input font-mono"
          value={(config.project_id as string) ?? ''}
          onChange={(e) => setConfig({ ...config, project_id: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="gl-label-sm">Compose ID (ou)</label>
          <input
            type="text"
            className="gl-form-input font-mono"
            placeholder="id-du-compose-dokploy"
            value={(config.compose_id as string) ?? ''}
            onChange={(e) => setConfig({ ...config, compose_id: e.target.value, application_id: '' })}
          />
        </div>
        <div>
          <label className="gl-label-sm">Application ID</label>
          <input
            type="text"
            className="gl-form-input font-mono"
            value={(config.application_id as string) ?? ''}
            onChange={(e) => setConfig({ ...config, application_id: e.target.value, compose_id: '' })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="gl-label-sm">Environnement</label>
          <select
            className="gl-form-input"
            value={(config.environment_label as string) ?? 'staging'}
            onChange={(e) => setConfig({ ...config, environment_label: e.target.value })}
          >
            <option value="staging">Staging</option>
            <option value="production">Production</option>
            <option value="qa">QA</option>
            <option value="development">Development</option>
            <option value="other">Autre</option>
          </select>
        </div>
        <div>
          <label className="gl-label-sm">Stratégie</label>
          <select
            className="gl-form-input"
            value={(config.deployment_strategy as string) ?? 'restart'}
            onChange={(e) => setConfig({ ...config, deployment_strategy: e.target.value })}
          >
            <option value="restart">Restart</option>
            <option value="rolling">Rolling</option>
            <option value="blue_green">Blue/Green</option>
          </select>
        </div>
      </div>
      <div>
        <label className="gl-label-sm">Health check URL</label>
        <input
          type="url"
          className="gl-form-input"
          placeholder="https://votre-domaine/api/health"
          value={(config.health_check_url as string) ?? ''}
          onChange={(e) => setConfig({ ...config, health_check_url: e.target.value })}
        />
      </div>
      <div>
        <label className="gl-label-sm">API token {isEdit && '(laisser vide pour conserver)'}</label>
        <input
          type="password"
          required={!isEdit}
          className="gl-form-input font-mono"
          placeholder={preview?.api_token || '...'}
          value={credentials.api_token ?? ''}
          onChange={(e) => setCredentials({ ...credentials, api_token: e.target.value })}
        />
      </div>
    </div>
  )
}

function AgentRunnerFields({ config, setConfig, credentials, setCredentials, isEdit, preview }: FieldsProps) {
  const auth = (config.auth_method as string) ?? 'api_key'
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="gl-label-sm">Runner</label>
          <select
            className="gl-form-input"
            value={(config.runner_type as string) ?? 'claude_code'}
            onChange={(e) => setConfig({ ...config, runner_type: e.target.value })}
          >
            <option value="claude_code">Claude Code</option>
            <option value="codex">Codex</option>
          </select>
        </div>
        <div>
          <label className="gl-label-sm">Auth</label>
          <select
            className="gl-form-input"
            value={auth}
            onChange={(e) => setConfig({ ...config, auth_method: e.target.value })}
          >
            <option value="api_key">API Key (pay-per-token)</option>
            <option value="oauth_token">OAuth token (abonnement Claude Pro/Max)</option>
            <option value="subscription_login">Subscription login (volume ~/.claude)</option>
          </select>
        </div>
      </div>
      <div>
        <label className="gl-label-sm">Modèle</label>
        <input
          type="text"
          className="gl-form-input"
          placeholder="claude-opus-4-7 ou gpt-5-codex"
          value={(config.model_preference as string) ?? ''}
          onChange={(e) => setConfig({ ...config, model_preference: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="gl-label-sm">Budget tokens/run</label>
          <input
            type="number"
            className="gl-form-input"
            value={(config.max_tokens_budget_per_run as number) ?? 200000}
            onChange={(e) => setConfig({ ...config, max_tokens_budget_per_run: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="gl-label-sm">Wall time (s)</label>
          <input
            type="number"
            className="gl-form-input"
            value={(config.max_wall_time_seconds as number) ?? 1800}
            onChange={(e) => setConfig({ ...config, max_wall_time_seconds: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="gl-label-sm">Budget mensuel (USD)</label>
          <input
            type="number"
            step="10"
            className="gl-form-input"
            value={(config.monthly_budget_usd as number) ?? 200}
            onChange={(e) => setConfig({ ...config, monthly_budget_usd: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>
      {auth === 'api_key' && (
        <div>
          <label className="gl-label-sm">API Key {isEdit && '(laisser vide pour conserver)'}</label>
          <input
            type="password"
            required={!isEdit}
            className="gl-form-input font-mono"
            placeholder={preview?.api_key_value || 'sk-...'}
            value={credentials.api_key_value ?? ''}
            onChange={(e) => setCredentials({ ...credentials, api_key_value: e.target.value })}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Billing : consomme les crédits du compte Anthropic. Recharge sur{' '}
            <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer" className="text-primary underline">console.anthropic.com</a>.
          </p>
        </div>
      )}
      {auth === 'oauth_token' && (
        <div>
          <label className="gl-label-sm">OAuth token {isEdit && '(laisser vide pour conserver)'}</label>
          <input
            type="password"
            required={!isEdit}
            className="gl-form-input font-mono"
            placeholder={preview?.oauth_token || 'sk-ant-oat01-...'}
            value={credentials.oauth_token ?? ''}
            onChange={(e) => setCredentials({ ...credentials, oauth_token: e.target.value })}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Pour ton abonnement Claude Pro/Max. Génère-le localement via :{' '}
            <code className="font-mono bg-muted px-1 rounded text-[10px]">claude setup-token</code>{' '}
            — puis colle la valeur ici. Pas de facturation supplémentaire.
          </p>
        </div>
      )}
      {auth === 'subscription_login' && (
        <div>
          <label className="gl-label-sm">Nom du volume Docker (~/.claude)</label>
          <input
            type="text"
            className="gl-form-input font-mono"
            placeholder="ex: claude-subscription-prod"
            value={(config.credentials_volume_name as string) ?? ''}
            onChange={(e) => setConfig({ ...config, credentials_volume_name: e.target.value })}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Un login initial doit être fait manuellement sur ce volume avant utilisation.
          </p>
        </div>
      )}
    </div>
  )
}
