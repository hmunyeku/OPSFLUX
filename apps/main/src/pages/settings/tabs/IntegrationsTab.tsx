/**
 * Integrations & External Services tab — centralized API keys, OAuth configs, map engines.
 *
 * All external service configurations are stored as settings with scope=entity.
 * Keys follow pattern: integration.<provider>.<key>
 *
 * OAuth2 & Services connectés: DYNAMIC catalog — user picks services to add/configure.
 * Modules can register their own integration needs here.
 * Configured services are reusable across the entire application.
 */
import { useCallback, useState, useMemo } from 'react'
import {
  Loader2, Key, Eye, EyeOff,
  Cloud, Shield, Plus, X, ExternalLink,
  Check, Settings2, ChevronDown, ChevronRight, Trash2,
  AlertCircle, Zap, Send,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { TagSelector } from '@/components/layout/DynamicPanel'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import type { SettingRead } from '@/types/api'

// ── Helpers ──
async function fetchSettings(scope: string): Promise<Record<string, unknown>> {
  const { data } = await api.get<SettingRead[]>('/api/v1/settings', { params: { scope } })
  const map: Record<string, unknown> = {}
  for (const s of data) {
    map[s.key] = s.value?.v ?? s.value
  }
  return map
}

async function saveSetting(key: string, value: unknown, scope: string): Promise<void> {
  await api.put('/api/v1/settings', { key, value: { v: value } }, { params: { scope } })
}

// ── Secret field with reveal toggle ──
function SecretField({
  value,
  placeholder,
  onSave,
}: {
  value: string
  placeholder: string
  onSave: (v: string) => void
}) {
  const [visible, setVisible] = useState(false)
  const [localValue, setLocalValue] = useState(value)

  return (
    <div className="flex items-center gap-1.5">
      <input
        type={visible ? 'text' : 'password'}
        className="gl-form-input text-sm flex-1 font-mono"
        value={localValue}
        placeholder={placeholder}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          if (localValue !== value) onSave(localValue)
        }}
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
        title={visible ? 'Masquer' : 'Afficher'}
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

// ── Integration status badge ──
function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <span className={`gl-badge ${configured ? 'gl-badge-success' : 'gl-badge-neutral'}`}>
      {configured ? 'Configuré' : 'Non configuré'}
    </span>
  )
}

// ── Connector status (richer than StatusBadge) ──
type ConnectorStatusType = 'idle' | 'configured' | 'connected' | 'error'

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  return `il y a ${days}j`
}

function ConnectorStatus({ status, lastTestedAt, lastError }: {
  status: ConnectorStatusType
  lastTestedAt?: string
  lastError?: string
}) {
  const styles: Record<ConnectorStatusType, string> = {
    idle: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
    configured: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    connected: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    error: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  }
  const labels: Record<ConnectorStatusType, string> = {
    idle: 'Non configuré',
    configured: 'Configuré',
    connected: 'Connecté',
    error: 'Erreur',
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${styles[status]}`}>
        {status === 'connected' && <Check size={10} />}
        {status === 'error' && <AlertCircle size={10} />}
        {labels[status]}
      </span>
      {lastTestedAt && (
        <span className="text-[10px] text-muted-foreground" title={lastError || undefined}>
          Testé {formatRelativeTime(lastTestedAt)}
        </span>
      )}
    </div>
  )
}

// ── Connector Catalog ──────────────────────────────────────

interface ConnectorField {
  key: string
  label: string
  placeholder?: string
  type: 'text' | 'secret' | 'select'
  options?: { value: string; label: string }[]
  helpText?: string
}

interface ConnectorDef {
  id: string
  name: string
  category: 'oauth2' | 'storage' | 'communication' | 'compliance' | 'other'
  description: string
  helpText: string
  consoleUrl?: string
  consoleName?: string
  icon: string // emoji
  settingsPrefix: string
  /** The key that determines if the connector is "enabled/active" */
  enabledKey: string
  fields: ConnectorField[]
}

const CONNECTORS_CATALOG: ConnectorDef[] = [
  // ── OAuth2 / Identity ──
  {
    id: 'google_oauth',
    name: 'Google OAuth2',
    category: 'oauth2',
    description: 'Accès Google Workspace (Gmail, Drive, Calendar, Meet). Permet l\'authentification SSO et l\'accès aux services Google.',
    helpText: 'Créez un projet dans Google Cloud Console, activez les API nécessaires (Gmail, Drive, Calendar), puis créez des identifiants OAuth2 de type "Application Web". Ajoutez votre domaine OpsFlux aux URI de redirection autorisées.',
    consoleUrl: 'https://console.cloud.google.com/apis/credentials',
    consoleName: 'Google Cloud Console',
    icon: '🔵',
    settingsPrefix: 'integration.google_oauth',
    enabledKey: 'integration.google_oauth.client_id',
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com', type: 'text' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'GOCSPX-...', type: 'secret' },
      { key: 'scopes', label: 'Scopes', placeholder: 'email profile openid', type: 'text', helpText: 'Scopes séparés par des espaces. Ex: email profile https://www.googleapis.com/auth/drive.readonly' },
    ],
  },
  {
    id: 'azure_ad',
    name: 'Microsoft Azure AD',
    category: 'oauth2',
    description: 'Accès Microsoft 365 (Outlook, OneDrive, Teams, SharePoint). SSO via Azure Active Directory / Entra ID.',
    helpText: 'Inscrivez une application dans Azure Portal → App registrations. Notez le Tenant ID et Client ID. Créez un secret client dans "Certificates & secrets". Configurez les URI de redirection.',
    consoleUrl: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    consoleName: 'Azure Portal',
    icon: '🟦',
    settingsPrefix: 'integration.azure',
    enabledKey: 'integration.azure.client_id',
    fields: [
      { key: 'tenant_id', label: 'Tenant ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', type: 'text' },
      { key: 'client_id', label: 'Client (Application) ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', type: 'text' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'Valeur du secret client', type: 'secret' },
    ],
  },
  {
    id: 'okta',
    name: 'Okta',
    category: 'oauth2',
    description: 'Authentification SSO via Okta. Prend en charge SAML 2.0 et OpenID Connect.',
    helpText: 'Dans Okta Admin Console, créez une nouvelle application (type Web). Copiez le Client ID et Secret. L\'URL de l\'émetteur est de la forme https://your-domain.okta.com.',
    consoleUrl: 'https://login.okta.com/',
    consoleName: 'Okta Admin Console',
    icon: '🔒',
    settingsPrefix: 'integration.okta',
    enabledKey: 'integration.okta.client_id',
    fields: [
      { key: 'domain', label: 'Okta Domain', placeholder: 'your-company.okta.com', type: 'text' },
      { key: 'client_id', label: 'Client ID', placeholder: '0oaxxxxxxxxxxxxxxxx', type: 'text' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'Votre secret client Okta', type: 'secret' },
    ],
  },
  {
    id: 'keycloak',
    name: 'Keycloak',
    category: 'oauth2',
    description: 'Serveur d\'identité open-source. SSO via OpenID Connect. Idéal pour les déploiements on-premise.',
    helpText: 'Dans Keycloak Admin Console, créez un nouveau client dans votre realm. Définissez l\'Access Type sur "confidential" et notez le secret. L\'URL du serveur est typiquement https://keycloak.example.com/auth.',
    consoleUrl: '',
    consoleName: 'Keycloak Admin',
    icon: '🛡️',
    settingsPrefix: 'integration.keycloak',
    enabledKey: 'integration.keycloak.client_id',
    fields: [
      { key: 'server_url', label: 'Server URL', placeholder: 'https://keycloak.example.com/auth', type: 'text' },
      { key: 'realm', label: 'Realm', placeholder: 'master', type: 'text' },
      { key: 'client_id', label: 'Client ID', placeholder: 'opsflux', type: 'text' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'Votre secret client', type: 'secret' },
    ],
  },
  // ── Storage ──
  {
    id: 's3_storage',
    name: 'AWS S3 / Object Storage',
    category: 'storage',
    description: 'Stockage de fichiers cloud (AWS S3, MinIO, Backblaze B2, DigitalOcean Spaces).',
    helpText: 'Créez un bucket S3 et un utilisateur IAM avec les droits s3:PutObject, s3:GetObject, s3:DeleteObject. Pour MinIO, utilisez l\'endpoint de votre instance.',
    consoleUrl: 'https://s3.console.aws.amazon.com/s3/buckets',
    consoleName: 'AWS Console S3',
    icon: '📦',
    settingsPrefix: 'integration.storage',
    enabledKey: 'integration.storage.provider',
    fields: [
      { key: 'provider', label: 'Type', placeholder: '', type: 'select', options: [
        { value: 'local', label: 'Local (disque)' },
        { value: 's3', label: 'AWS S3' },
        { value: 'minio', label: 'MinIO' },
        { value: 'b2', label: 'Backblaze B2' },
        { value: 'do_spaces', label: 'DigitalOcean Spaces' },
      ]},
      { key: 'endpoint', label: 'Endpoint URL', placeholder: 'https://s3.amazonaws.com', type: 'text' },
      { key: 'bucket', label: 'Bucket', placeholder: 'opsflux-files', type: 'text' },
      { key: 'region', label: 'Région', placeholder: 'eu-west-1', type: 'text' },
      { key: 'access_key', label: 'Access Key ID', placeholder: 'AKIA...', type: 'secret' },
      { key: 'secret_key', label: 'Secret Access Key', placeholder: 'Votre clé secrète', type: 'secret' },
    ],
  },
  // ── Communication ──
  {
    id: 'smtp',
    name: 'Email SMTP',
    category: 'communication',
    description: 'Serveur SMTP pour l\'envoi d\'emails transactionnels (notifications, invitations, rapports).',
    helpText: 'Utilisez les paramètres SMTP de votre fournisseur email (Gmail, Outlook, SendGrid, Mailgun, etc). Le port 587 avec TLS est recommandé.',
    icon: '📧',
    settingsPrefix: 'integration.smtp',
    enabledKey: 'integration.smtp.host',
    fields: [
      { key: 'host', label: 'Serveur SMTP', placeholder: 'smtp.gmail.com', type: 'text' },
      { key: 'port', label: 'Port', placeholder: '587', type: 'text' },
      { key: 'encryption', label: 'Chiffrement', placeholder: '', type: 'select', options: [
        { value: 'tls', label: 'TLS (recommandé)' },
        { value: 'ssl', label: 'SSL' },
        { value: 'none', label: 'Aucun' },
      ]},
      { key: 'username', label: 'Utilisateur', placeholder: 'user@example.com', type: 'text' },
      { key: 'password', label: 'Mot de passe', placeholder: 'Mot de passe SMTP', type: 'secret' },
      { key: 'from_name', label: 'Nom expéditeur', placeholder: 'OpsFlux', type: 'text' },
      { key: 'from_email', label: 'Email expéditeur', placeholder: 'noreply@example.com', type: 'text' },
    ],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    category: 'communication',
    description: 'Envoi de messages et OTP via WhatsApp Business Cloud API (Meta). Gratuit pour les templates d\'authentification.',
    helpText: 'Créez une application Meta Business, activez l\'API WhatsApp Cloud, et générez un token permanent. Le Phone Number ID se trouve dans le dashboard WhatsApp > Configuration.',
    consoleUrl: 'https://business.facebook.com/latest/whatsapp_manager/overview',
    consoleName: 'Meta WhatsApp Manager',
    icon: '💚',
    settingsPrefix: 'integration.whatsapp',
    enabledKey: 'integration.whatsapp.phone_number_id',
    fields: [
      { key: 'phone_number_id', label: 'Phone Number ID', placeholder: '1234567890123456', type: 'text' },
      { key: 'access_token', label: 'Access Token permanent', placeholder: 'EAAxxxxxxx...', type: 'secret' },
      { key: 'waba_id', label: 'WhatsApp Business Account ID', placeholder: '9876543210123456', type: 'text' },
      { key: 'otp_template_name', label: 'Nom du template OTP (optionnel)', placeholder: 'Ex: opsflux_otp_code', type: 'text' },
      { key: 'language', label: 'Langue du template', placeholder: 'fr', type: 'text' },
      { key: 'api_version', label: 'Version API (optionnel)', placeholder: 'v21.0', type: 'text' },
    ],
  },
  {
    id: 'sms_ovh',
    name: 'OVH SMS',
    category: 'communication',
    description: 'Envoi de SMS via OVH pour les notifications, vérifications de numéro, et alertes. Populaire en Europe.',
    helpText: 'Créez vos identifiants API OVH sur eu.api.ovh.com/createToken. Sélectionnez les droits GET/POST sur /sms/*. Récupérez le Consumer Key après validation.',
    consoleUrl: 'https://eu.api.ovh.com/createToken/',
    consoleName: 'OVH API Token',
    icon: '🇫🇷',
    settingsPrefix: 'integration.sms_ovh',
    enabledKey: 'integration.sms_ovh.application_key',
    fields: [
      { key: 'application_key', label: 'Application Key', placeholder: 'Votre Application Key OVH', type: 'text' },
      { key: 'application_secret', label: 'Application Secret', placeholder: 'Votre Application Secret', type: 'secret' },
      { key: 'consumer_key', label: 'Consumer Key', placeholder: 'Votre Consumer Key', type: 'secret' },
      { key: 'service_name', label: 'Nom du service SMS', placeholder: 'sms-xxXXXX-1', type: 'text' },
      { key: 'sender', label: 'Expéditeur', placeholder: 'OpsFlux', type: 'text' },
    ],
  },
  {
    id: 'sms_twilio',
    name: 'Twilio SMS',
    category: 'communication',
    description: 'Envoi de SMS via Twilio pour les notifications urgentes, 2FA, et alertes terrain.',
    helpText: 'Créez un compte Twilio, obtenez votre Account SID et Auth Token depuis le Dashboard. Achetez un numéro de téléphone pour l\'envoi.',
    consoleUrl: 'https://console.twilio.com/',
    consoleName: 'Twilio Console',
    icon: '📱',
    settingsPrefix: 'integration.sms_twilio',
    enabledKey: 'integration.sms_twilio.account_sid',
    fields: [
      { key: 'account_sid', label: 'Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', type: 'text' },
      { key: 'auth_token', label: 'Auth Token', placeholder: 'Votre Auth Token Twilio', type: 'secret' },
      { key: 'from_number', label: 'Numéro expéditeur', placeholder: '+1234567890', type: 'text' },
    ],
  },
  {
    id: 'sms_vonage',
    name: 'Vonage SMS',
    category: 'communication',
    description: 'Envoi de SMS via Vonage (ex-Nexmo). Alternative à Twilio pour les notifications SMS.',
    helpText: 'Créez un compte Vonage, copiez votre API Key et API Secret depuis le dashboard.',
    consoleUrl: 'https://dashboard.nexmo.com/',
    consoleName: 'Vonage Dashboard',
    icon: '💬',
    settingsPrefix: 'integration.sms_vonage',
    enabledKey: 'integration.sms_vonage.api_key',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Votre API Key', type: 'text' },
      { key: 'api_secret', label: 'API Secret', placeholder: 'Votre API Secret', type: 'secret' },
      { key: 'from_name', label: 'Nom expéditeur', placeholder: 'OpsFlux', type: 'text' },
    ],
  },
  // ── Intelligence Artificielle ──
  {
    id: 'ai',
    name: 'Intelligence Artificielle',
    category: 'other',
    description: 'Moteur IA pour l\'assistant, l\'analyse de documents, la génération de rapports et les suggestions intelligentes.',
    helpText: 'Choisissez votre fournisseur IA. Claude (Anthropic) est recommandé. Vous pouvez aussi utiliser OpenAI, Mistral, ou Ollama pour un déploiement local sans dépendance cloud.',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    consoleName: 'Anthropic Console',
    icon: '🤖',
    settingsPrefix: 'integration.ai',
    enabledKey: 'integration.ai.provider',
    fields: [
      { key: 'provider', label: 'Fournisseur', placeholder: '', type: 'select', options: [
        { value: 'anthropic', label: 'Anthropic (Claude)' },
        { value: 'openai', label: 'OpenAI (GPT)' },
        { value: 'mistral', label: 'Mistral AI' },
        { value: 'ollama', label: 'Ollama (local)' },
      ]},
      { key: 'api_key', label: 'Clé API', placeholder: 'sk-ant-... / sk-... ', type: 'secret', helpText: 'Non requis pour Ollama (local)' },
      { key: 'model', label: 'Modèle', placeholder: 'claude-sonnet-4-6', type: 'text', helpText: 'Ex: claude-sonnet-4-6, gpt-4o, mistral-large-latest, llama3' },
      { key: 'base_url', label: 'URL de base (optionnel)', placeholder: 'http://localhost:11434', type: 'text', helpText: 'Requis pour Ollama. Optionnel pour OpenAI-compatible (Azure, etc.)' },
      { key: 'max_tokens', label: 'Max tokens', placeholder: '4096', type: 'text', helpText: 'Limite de tokens par requête' },
      { key: 'temperature', label: 'Température', placeholder: '0.3', type: 'text', helpText: '0 = déterministe, 1 = créatif' },
    ],
  },
  // ── Webhooks ──
  {
    id: 'webhook',
    name: 'Webhook sortant',
    category: 'other',
    description: 'Notifiez des systèmes externes lors d\'événements OpsFlux (création, modification, etc).',
    helpText: 'Configurez l\'URL de votre endpoint. Les payloads seront envoyés en POST avec une signature HMAC-SHA256 dans le header X-Signature.',
    icon: '🔗',
    settingsPrefix: 'integration.webhook',
    enabledKey: 'integration.webhook.url',
    fields: [
      { key: 'url', label: 'URL du webhook', placeholder: 'https://example.com/webhook', type: 'text' },
      { key: 'secret', label: 'Secret de signature (HMAC-SHA256)', placeholder: 'whsec_...', type: 'secret' },
      { key: 'events', label: 'Événements', placeholder: '', type: 'select', options: [
        { value: 'all', label: 'Tous les événements' },
        { value: 'custom', label: 'Personnalisé' },
        { value: 'none', label: 'Désactivé' },
      ]},
    ],
  },
  // ── LDAP ──
  {
    id: 'ldap',
    name: 'LDAP / Active Directory',
    category: 'oauth2',
    description: 'Synchronisation des utilisateurs et authentification via LDAP ou Active Directory on-premise.',
    helpText: 'Configurez l\'URL de votre serveur LDAP (ldap:// ou ldaps://). Le Base DN est la racine de recherche (ex: dc=example,dc=com). Le Bind DN est le compte technique utilisé pour les requêtes.',
    icon: '🏢',
    settingsPrefix: 'integration.ldap',
    enabledKey: 'integration.ldap.server_url',
    fields: [
      { key: 'server_url', label: 'Serveur LDAP', placeholder: 'ldaps://ldap.example.com:636', type: 'text' },
      { key: 'base_dn', label: 'Base DN', placeholder: 'dc=example,dc=com', type: 'text' },
      { key: 'bind_dn', label: 'Bind DN', placeholder: 'cn=admin,dc=example,dc=com', type: 'text' },
      { key: 'bind_password', label: 'Bind Password', placeholder: 'Mot de passe du compte technique', type: 'secret' },
      { key: 'user_filter', label: 'User Search Filter', placeholder: '(objectClass=person)', type: 'text' },
    ],
  },
  // ── Gouti (Project Management) ──
  {
    id: 'gouti',
    name: 'Gouti',
    category: 'other',
    description: 'API de gestion de projets et rapports Perenco (Gouti).',
    helpText: 'Connectez OpsFlux à l\'API Gouti pour synchroniser les projets, rapports et suivis d\'avancement.',
    consoleUrl: 'https://apiprd.gouti.net',
    icon: '📊',
    settingsPrefix: 'integration.gouti',
    enabledKey: 'integration.gouti.client_id',
    fields: [
      { key: 'base_url', label: 'URL de l\'API', type: 'text' as const, placeholder: 'https://apiprd.gouti.net/v1/client' },
      { key: 'client_id', label: 'Client ID', type: 'text' as const, placeholder: 'Ex: PERDRAPI010' },
      { key: 'client_secret', label: 'Secret client', type: 'secret' as const, placeholder: '••••••' },
      { key: 'entity_code', label: 'Code entité', type: 'text' as const, placeholder: 'Ex: P3R3NCOD3' },
    ],
  },
  // ── Rise Up (LMS / Compliance) ──
  {
    id: 'riseup',
    name: 'Rise Up',
    category: 'compliance',
    description: 'Plateforme LMS Rise Up — synchronisation des formations, certifications et compliance.',
    helpText: 'Connectez OpsFlux à Rise Up pour vérifier automatiquement les formations et certifications des employés. Les clés API se trouvent dans Rise Up > Paramètres > Développeur > API.',
    consoleUrl: 'https://api.riseup.ai/documentation',
    icon: '🎓',
    settingsPrefix: 'integration.riseup',
    enabledKey: 'integration.riseup.public_key',
    fields: [
      { key: 'base_url', label: 'URL de l\'API', type: 'text' as const, placeholder: 'https://api.riseup.ai' },
      { key: 'public_key', label: 'Clé publique', type: 'text' as const, placeholder: 'Clé API publique Rise Up' },
      { key: 'secret_key', label: 'Clé secrète', type: 'secret' as const, placeholder: '••••••' },
      { key: 'match_field', label: 'Champ de liaison utilisateur', type: 'select' as const, options: [
        { value: 'email', label: 'Email (par défaut)' },
        { value: 'rhid', label: 'Matricule RH (intranet_id → rhid)' },
        { value: 'both', label: 'Matricule RH puis email (fallback)' },
      ]},
    ],
  },
  // ── Intranet Medical ──
  {
    id: 'intranet_medical',
    name: 'Intranet Médical',
    category: 'compliance',
    description: 'API intranet pour les visites médicales et certificats d\'aptitude.',
    helpText: 'Connectez OpsFlux à votre système intranet médical pour synchroniser les visites médicales et certificats d\'aptitude.',
    icon: '🏥',
    settingsPrefix: 'integration.intranet_medical',
    enabledKey: 'integration.intranet_medical.base_url',
    fields: [
      { key: 'base_url', label: 'URL de l\'API', type: 'text' as const, placeholder: 'https://intranet.example.com/api' },
      { key: 'api_key', label: 'Clé API', type: 'secret' as const, placeholder: '••••••' },
      { key: 'tenant_id', label: 'Tenant / Entreprise', type: 'text' as const, placeholder: 'Code entreprise' },
    ],
  },
]

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  oauth2: { label: 'Authentification & Identity', icon: <Shield size={16} /> },
  storage: { label: 'Stockage', icon: <Cloud size={16} /> },
  communication: { label: 'Communication', icon: <Key size={16} /> },
  compliance: { label: 'Conformité & Formation', icon: <Shield size={16} /> },
  other: { label: 'Autres', icon: <Settings2 size={16} /> },
}

// ── Connector Card (configured) ────────────────────────────

const SENDABLE_CONNECTORS = new Set(['smtp', 'sms_twilio', 'sms_vonage', 'sms_ovh', 'whatsapp'])

function ConnectorCard({
  connector,
  settings,
  save,
  onRemove,
  onTest,
  onTestSend,
  testingConnectorId,
  sendingConnectorId,
}: {
  connector: ConnectorDef
  settings: Record<string, unknown>
  save: (key: string, value: unknown) => void
  onRemove: () => void
  onTest: (id: string) => void
  onTestSend: (id: string, recipient: string) => void
  testingConnectorId: string | null
  sendingConnectorId: string | null
}) {
  // Auto-expand only if not yet configured
  const isConfigured = !!(settings[connector.enabledKey] as string)
  const [expanded, setExpanded] = useState(!isConfigured)
  const [testRecipient, setTestRecipient] = useState('')
  const [showSendTest, setShowSendTest] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const lastTestStatus = (settings[`integration.${connector.id}.last_test_status`] as string) ?? ''
  const lastTestAt = (settings[`integration.${connector.id}.last_test_at`] as string) ?? ''
  const lastTestError = (settings[`integration.${connector.id}.last_test_error`] as string) ?? ''

  let connectorStatus: ConnectorStatusType = 'idle'
  if (isConfigured) {
    if (lastTestStatus === 'ok') connectorStatus = 'connected'
    else if (lastTestStatus === 'error') connectorStatus = 'error'
    else connectorStatus = 'configured'
  }

  const isTesting = testingConnectorId === connector.id
  const isSending = sendingConnectorId === connector.id
  const canSendTest = SENDABLE_CONNECTORS.has(connector.id) && connectorStatus === 'connected'

  const borderClass = {
    idle: 'border-border/60 bg-card',
    configured: 'border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-900/5',
    connected: 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10',
    error: 'border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-900/5',
  }[connectorStatus]

  return (
    <div className={`border rounded-lg transition-colors flex flex-col self-start ${borderClass}`}>
      {/* Card Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex flex-col gap-2 px-4 py-3 text-left hover:bg-accent/30 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2.5 w-full">
          <span className="text-xl shrink-0">{connector.icon}</span>
          <span className="text-sm font-semibold text-foreground truncate flex-1">{connector.name}</span>
          {expanded ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{connector.description}</p>
        <ConnectorStatus
          status={connectorStatus}
          lastTestedAt={lastTestAt || undefined}
          lastError={lastTestError || undefined}
        />
      </button>

      {/* Expanded config */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/50">
          {/* Help text */}
          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">{connector.helpText}</p>
            {connector.consoleUrl && (
              <a
                href={connector.consoleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
              >
                <ExternalLink size={11} />
                Ouvrir {connector.consoleName}
              </a>
            )}
          </div>

          {/* Config fields */}
          <div className="space-y-3">
            {connector.fields.map((field) => {
              const settingKey = `${connector.settingsPrefix}.${field.key}`
              const currentValue = (settings[settingKey] as string) ?? ''

              return (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-foreground mb-1">{field.label}</label>
                  {field.type === 'secret' ? (
                    <SecretField
                      value={currentValue}
                      placeholder={field.placeholder || ''}
                      onSave={(v) => save(settingKey, v)}
                    />
                  ) : field.type === 'select' && field.options ? (
                    <TagSelector
                      options={field.options}
                      value={currentValue || field.options[0]?.value || ''}
                      onChange={(v) => save(settingKey, v)}
                    />
                  ) : (
                    <input
                      type="text"
                      className="gl-form-input text-sm w-full font-mono"
                      placeholder={field.placeholder}
                      defaultValue={currentValue}
                      onBlur={(e) => {
                        if (e.target.value !== currentValue) save(settingKey, e.target.value)
                      }}
                    />
                  )}
                  {field.helpText && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{field.helpText}</p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Test connection button */}
          {isConfigured && (
            <div className="flex items-center gap-3 pt-2 border-t border-border/30">
              <button
                className="gl-button-sm gl-button-confirm"
                onClick={() => onTest(connector.id)}
                disabled={isTesting}
              >
                {isTesting ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                Tester la connexion
              </button>
              {lastTestStatus === 'error' && lastTestError && (
                <p className="text-xs text-red-600 dark:text-red-400 flex-1">{lastTestError}</p>
              )}
              {lastTestStatus === 'ok' && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Connexion réussie</p>
              )}
            </div>
          )}

          {/* Real send test — only for email/SMS/WhatsApp after successful connection test */}
          {canSendTest && (
            <div className="pt-2 border-t border-border/30 space-y-2">
              {!showSendTest ? (
                <button
                  className="gl-button-sm gl-button-default"
                  onClick={() => setShowSendTest(true)}
                >
                  <Send size={12} />
                  Envoyer un test réel
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type={connector.id === 'smtp' ? 'email' : 'tel'}
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    placeholder={connector.id === 'smtp' ? 'email@exemple.com' : '+33612345678'}
                    className="gl-form-input h-7 text-xs flex-1 min-w-0"
                  />
                  <button
                    className="gl-button-sm gl-button-confirm shrink-0"
                    onClick={() => {
                      if (testRecipient.trim()) {
                        onTestSend(connector.id, testRecipient.trim())
                      }
                    }}
                    disabled={isSending || !testRecipient.trim()}
                  >
                    {isSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    Envoyer
                  </button>
                  <button
                    className="gl-button-sm gl-button-default shrink-0"
                    onClick={() => { setShowSendTest(false); setTestRecipient('') }}
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Remove button */}
          <div className="flex items-center justify-end pt-2 border-t border-border/30">
            {confirmRemove ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Supprimer ce connecteur ?</span>
                <button className="gl-button-sm gl-button-danger" onClick={onRemove}>Oui</button>
                <button className="gl-button-sm gl-button-default" onClick={() => setConfirmRemove(false)}>Non</button>
              </div>
            ) : (
              <button
                className="gl-button-sm gl-button-default text-red-600 dark:text-red-400"
                onClick={() => setConfirmRemove(true)}
              >
                <Trash2 size={12} />
                Retirer le connecteur
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add Connector Dialog ───────────────────────────────────

function AddConnectorDialog({
  onAdd,
  onClose,
  activeConnectorIds,
}: {
  onAdd: (id: string) => void
  onClose: () => void
  activeConnectorIds: string[]
}) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const available = useMemo(() => {
    return CONNECTORS_CATALOG.filter((c) => {
      if (activeConnectorIds.includes(c.id)) return false
      if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.description.toLowerCase().includes(search.toLowerCase())) return false
      if (selectedCategory && c.category !== selectedCategory) return false
      return true
    })
  }, [activeConnectorIds, search, selectedCategory])

  const categories = useMemo(() => {
    const cats = new Set(CONNECTORS_CATALOG.filter((c) => !activeConnectorIds.includes(c.id)).map((c) => c.category))
    return Array.from(cats)
  }, [activeConnectorIds])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Ajouter un service</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent text-muted-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Search + filter */}
        <div className="px-4 py-3 border-b border-border/50 space-y-2 shrink-0">
          <input
            type="text"
            className="gl-form-input text-sm w-full"
            placeholder="Rechercher un service..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${!selectedCategory ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground hover:text-foreground'}`}
            >
              Tous
            </button>
            {categories.map((cat) => {
              const label = CATEGORY_LABELS[cat]
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${selectedCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground hover:text-foreground'}`}
                >
                  {label?.label || cat}
                </button>
              )
            })}
          </div>
        </div>

        {/* Grid of available services */}
        <div className="flex-1 overflow-y-auto p-3">
          {available.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                {activeConnectorIds.length === CONNECTORS_CATALOG.length
                  ? 'Tous les services sont déjà ajoutés.'
                  : 'Aucun service ne correspond à votre recherche.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {available.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { onAdd(c.id); onClose() }}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border/50 hover:border-primary/40 hover:bg-accent/50 transition-colors text-center group"
                >
                  <span className="text-2xl">{c.icon}</span>
                  <span className="text-xs font-semibold text-foreground">{c.name}</span>
                  <span className="text-[10px] text-muted-foreground line-clamp-2 leading-snug">{c.description}</span>
                  <span className="mt-auto pt-1">
                    <Plus size={14} className="text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main IntegrationsTab ───────────────────────────────────

export function IntegrationsTab() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings', 'entity'],
    queryFn: () => fetchSettings('entity'),
  })

  const mutation = useMutation({
    mutationFn: ({ key, value, silent }: { key: string; value: unknown; silent?: boolean }) =>
      saveSetting(key, value, 'entity').then(() => silent),
    onSuccess: (silent) => {
      qc.invalidateQueries({ queryKey: ['settings', 'entity'] })
      if (!silent) toast({ title: 'Configuration enregistrée', variant: 'success' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible d\'enregistrer la configuration.', variant: 'error' })
    },
  })

  const save = useCallback((key: string, value: unknown) => {
    mutation.mutate({ key, value })
  }, [mutation])

  /** Save without showing a toast (for batch operations) */
  const saveSilent = useCallback((key: string, value: unknown) => {
    mutation.mutate({ key, value, silent: true })
  }, [mutation])

  const [testingConnectorId, setTestingConnectorId] = useState<string | null>(null)

  const testMutation = useMutation({
    mutationFn: async (connectorId: string) => {
      setTestingConnectorId(connectorId)
      const { data } = await api.post('/api/v1/integrations/test', { connector_id: connectorId })
      return data as { status: string; message?: string }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['settings', 'entity'] })
      if (data.status === 'ok') {
        toast({ title: 'Connexion réussie', description: data.message, variant: 'success' })
      } else {
        toast({ title: 'Échec de connexion', description: data.message, variant: 'error' })
      }
      setTestingConnectorId(null)
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible de tester la connexion.', variant: 'error' })
      setTestingConnectorId(null)
    },
  })

  // Real send test mutation
  const [sendingConnectorId, setSendingConnectorId] = useState<string | null>(null)

  const sendTestMutation = useMutation({
    mutationFn: async ({ connectorId, recipient }: { connectorId: string; recipient: string }) => {
      setSendingConnectorId(connectorId)
      const { data } = await api.post('/api/v1/integrations/test-send', { connector_id: connectorId, recipient })
      return data as { status: string; message?: string; channel?: string }
    },
    onSuccess: (data) => {
      if (data.status === 'ok') {
        toast({ title: 'Test envoyé', description: data.message, variant: 'success' })
      } else {
        toast({ title: 'Échec d\'envoi', description: data.message, variant: 'error' })
      }
      setSendingConnectorId(null)
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible d\'envoyer le test.', variant: 'error' })
      setSendingConnectorId(null)
    },
  })

  const [showAddDialog, setShowAddDialog] = useState(false)

  // Track which connectors the user has activated (stored in a setting)
  const s = settings ?? {}

  // Derive active connectors from settings: a connector is "active" if it has
  // been explicitly added (via the _active list) OR if it has any configured value
  const activeConnectorsSetting = (s['integration._active_connectors'] as string) ?? ''
  const activeConnectorIds = useMemo(() => {
    const fromSetting = activeConnectorsSetting ? activeConnectorsSetting.split(',').filter(Boolean) : []
    // Also include connectors that have at least one configured value
    for (const c of CONNECTORS_CATALOG) {
      if (!fromSetting.includes(c.id)) {
        const hasValue = c.fields.some((f) => !!(s[`${c.settingsPrefix}.${f.key}`] as string))
        if (hasValue) fromSetting.push(c.id)
      }
    }
    return fromSetting
  }, [activeConnectorsSetting, s])

  const activeConnectors = useMemo(() => {
    return activeConnectorIds
      .map((id) => CONNECTORS_CATALOG.find((c) => c.id === id))
      .filter(Boolean) as ConnectorDef[]
  }, [activeConnectorIds])

  const handleAddConnector = useCallback((id: string) => {
    const newList = [...activeConnectorIds, id]
    save('integration._active_connectors', newList.join(','))
  }, [activeConnectorIds, save])

  const handleRemoveConnector = useCallback((id: string) => {
    const newList = activeConnectorIds.filter((x) => x !== id)
    // Clear all fields silently (no individual toasts)
    const connector = CONNECTORS_CATALOG.find((c) => c.id === id)
    if (connector) {
      for (const field of connector.fields) {
        saveSilent(`${connector.settingsPrefix}.${field.key}`, '')
      }
    }
    // Save the active list — this one triggers the toast
    save('integration._active_connectors', newList.join(','))
  }, [activeConnectorIds, save, saveSilent])

  // Group active connectors by category (must be before early return)
  const connectorsByCategory = useMemo(() => {
    const groups: Record<string, ConnectorDef[]> = {}
    for (const c of activeConnectors) {
      if (!groups[c.category]) groups[c.category] = []
      groups[c.category].push(c)
    }
    return groups
  }, [activeConnectors])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  const mapProvider = (s['integration.map.provider'] as string) ?? 'openstreetmap'
  const hasGoogleMapsKey = !!(s['integration.google_maps.api_key'] as string)
  const hasMapboxKey = !!(s['integration.mapbox.access_token'] as string)

  return (
    <>
      {/* ── Cartographie ── */}
      <CollapsibleSection
        id="cartographie-integration"
        title="Cartographie"
        description="Moteur de carte, style de tuiles et service de géocodage. Le fournisseur choisi sera utilisé partout dans l'application (cartes, géolocalisation, planification)."
        storageKey="settings.integrations.collapse"
      >
      <div className="mt-2 border border-border/60 rounded-lg bg-card">
        {/* Provider selector (always visible) */}
        <div className="px-4 py-3 space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Fournisseur de carte</label>
            <TagSelector
              options={[
                { value: 'openstreetmap', label: 'OpenStreetMap (gratuit)' },
                { value: 'google_maps', label: 'Google Maps' },
                { value: 'mapbox', label: 'Mapbox' },
              ]}
              value={mapProvider}
              onChange={(v) => save('integration.map.provider', v)}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {mapProvider === 'openstreetmap' && 'OpenStreetMap est gratuit et ne nécessite aucune clé API.'}
              {mapProvider === 'google_maps' && 'Google Maps nécessite une clé API. Créez-la depuis la Google Cloud Console.'}
              {mapProvider === 'mapbox' && 'Mapbox nécessite un access token. Obtenez-le depuis votre compte Mapbox.'}
            </p>
          </div>

          {/* API Key (conditional) */}
          {(mapProvider === 'google_maps' || mapProvider === 'mapbox') && (
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                {mapProvider === 'google_maps' ? 'Google Maps API Key' : 'Mapbox Access Token'}
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <SecretField
                    value={
                      mapProvider === 'google_maps'
                        ? (s['integration.google_maps.api_key'] as string) ?? ''
                        : (s['integration.mapbox.access_token'] as string) ?? ''
                    }
                    placeholder={mapProvider === 'google_maps' ? 'AIzaSy...' : 'pk.eyJ1...'}
                    onSave={(v) =>
                      save(
                        mapProvider === 'google_maps'
                          ? 'integration.google_maps.api_key'
                          : 'integration.mapbox.access_token',
                        v,
                      )
                    }
                  />
                </div>
                <StatusBadge configured={mapProvider === 'google_maps' ? hasGoogleMapsKey : hasMapboxKey} />
              </div>
              <a
                href={mapProvider === 'google_maps' ? 'https://console.cloud.google.com/apis/credentials' : 'https://account.mapbox.com/access-tokens/'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                <ExternalLink size={9} />
                {mapProvider === 'google_maps' ? 'Google Cloud Console' : 'Mapbox Dashboard'}
              </a>
            </div>
          )}

          {/* Style */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Style de carte</label>
            <TagSelector
              options={
                mapProvider === 'mapbox'
                  ? [
                      { value: 'streets-v12', label: 'Streets' },
                      { value: 'satellite-streets-v12', label: 'Satellite' },
                      { value: 'outdoors-v12', label: 'Outdoors' },
                      { value: 'light-v11', label: 'Light' },
                      { value: 'dark-v11', label: 'Dark' },
                    ]
                  : [
                      { value: 'standard', label: 'Standard' },
                      { value: 'satellite', label: 'Satellite' },
                      { value: 'terrain', label: 'Terrain' },
                    ]
              }
              value={(s['integration.map.style'] as string) ?? 'standard'}
              onChange={(v) => save('integration.map.style', v)}
            />
          </div>

          {/* Geocoding */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Service de géocodage</label>
            <TagSelector
              options={[
                { value: 'nominatim', label: 'Nominatim (gratuit)' },
                { value: 'google', label: 'Google Geocoding' },
                { value: 'mapbox', label: 'Mapbox Geocoding' },
              ]}
              value={(s['integration.geocoding.provider'] as string) ?? 'nominatim'}
              onChange={(v) => save('integration.geocoding.provider', v)}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Convertit les adresses en coordonnées GPS (et inversement). Nominatim est gratuit mais soumis à des limites de requêtes.
            </p>
          </div>
        </div>
      </div>
      </CollapsibleSection>

      {/* ── Services connectés (dynamic catalog) ── */}
      <CollapsibleSection
        id="services-connectes"
        title="Services connectés"
        description="Ajoutez et configurez les services externes utilisés par OpsFlux. OAuth2, stockage, email, SMS, webhooks — tout se gère ici. Les accès configurés sont réutilisables par tous les modules."
        storageKey="settings.integrations.collapse"
        showSeparator={false}
      >

      {activeConnectors.length === 0 ? (
        <div className="mt-4 border border-border/60 border-dashed rounded-lg bg-card px-6 py-8 text-center">
          <Shield size={28} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-foreground mb-1">Aucun service configuré</p>
          <p className="text-xs text-muted-foreground mb-3">
            Ajoutez des services externes pour activer l'authentification SSO, l'envoi d'emails, le stockage cloud, etc.
          </p>
          <button
            onClick={() => setShowAddDialog(true)}
            className="gl-button-sm gl-button-confirm"
          >
            <Plus size={12} />
            Ajouter un service
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {Object.entries(connectorsByCategory).map(([category, connectors]) => {
            const catLabel = CATEGORY_LABELS[category]
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  {catLabel?.icon}
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {catLabel?.label || category}
                  </h3>
                  <span className="text-[10px] text-muted-foreground bg-accent rounded-full px-1.5">
                    {connectors.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {connectors.map((c) => (
                    <ConnectorCard
                      key={c.id}
                      connector={c}
                      settings={s}
                      save={save}
                      onRemove={() => handleRemoveConnector(c.id)}
                      onTest={(id) => testMutation.mutate(id)}
                      onTestSend={(id, recipient) => sendTestMutation.mutate({ connectorId: id, recipient })}
                      testingConnectorId={testingConnectorId}
                      sendingConnectorId={sendingConnectorId}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Summary bar + Add button */}
      <div className="mt-4 flex items-center justify-between px-3 py-2.5 bg-accent/50 rounded-lg">
        <div className="flex items-center gap-2">
          {activeConnectors.length > 0 ? (() => {
            const configuredCount = activeConnectors.filter((c) => !!(s[c.enabledKey] as string)).length
            const connectedCount = activeConnectors.filter((c) => (s[`integration.${c.id}.last_test_status`] as string) === 'ok').length
            const errorCount = activeConnectors.filter((c) => (s[`integration.${c.id}.last_test_status`] as string) === 'error').length
            const parts: string[] = []
            if (connectedCount > 0) parts.push(`${connectedCount} connecté(s)`)
            if (configuredCount > connectedCount + errorCount) parts.push(`${configuredCount - connectedCount - errorCount} configuré(s)`)
            if (errorCount > 0) parts.push(`${errorCount} en erreur`)

            return (
              <>
                <Check size={14} className="text-emerald-600" />
                <span className="text-xs text-muted-foreground">
                  {parts.length > 0 ? `${parts.join(', ')} sur ` : ''}{activeConnectors.length} service(s)
                </span>
              </>
            )
          })() : (
            <span className="text-xs text-muted-foreground">Aucun service configuré</span>
          )}
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="gl-button-sm gl-button-confirm"
        >
          <Plus size={12} />
          Ajouter un service
        </button>
      </div>

      {/* Add connector dialog */}
      {showAddDialog && (
        <AddConnectorDialog
          onAdd={handleAddConnector}
          onClose={() => setShowAddDialog(false)}
          activeConnectorIds={activeConnectorIds}
        />
      )}
      </CollapsibleSection>
    </>
  )
}
