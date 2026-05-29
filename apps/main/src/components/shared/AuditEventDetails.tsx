/**
 * AuditEventDetails — Rendu intelligent des `details` JSON d'un event
 * audit-log, partage entre TierAuditTimeline / ProjectAuditTimeline /
 * TaskAuditTimeline / ActivityAuditTimeline.
 *
 * Avant : chaque timeline rendait `{k}: {v}` brut. UUIDs noisy, ID
 * fields opaques, fields[] = JSON string moche.
 *
 * Apres :
 * - Cles connues (project_id, activity_id, tier_id) -> CrossModuleLink
 *   cliquable qui ouvre le panel cible.
 * - old_status + new_status -> combines en "X -> Y" (1 ligne).
 * - fields: string[] -> rendu en virgules.
 * - UUIDs inconnues -> truncate 8 chars (visual cleanup).
 * - Reste : key: value plain.
 *
 * Centraliser ici evite la duplication et garantit que tout nouveau
 * mapping (ex. ajout d'un futur `voyage_id` cliquable) profite a
 * toutes les timelines d'un coup.
 */
import { useTranslation } from 'react-i18next'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'

// Map des cles ID connues -> (module, label_prefix) pour CrossModuleLink.
// Les sub-resources locales (task_id, contact_id, deliverable_id, ...) ne
// sont PAS dans cette map car elles n'ont pas de panel dedie sans contexte
// parent. Le rendu retombe sur la version "UUID tronquee" pour celles-la.
const LINKABLE_ID_KEYS: Record<string, { module: string; labelPrefix: string }> = {
  project_id: { module: 'projets', labelPrefix: 'Projet' },
  previous_tier_id: { module: 'tiers', labelPrefix: 'Tier' },
  new_tier_id: { module: 'tiers', labelPrefix: 'Tier' },
  tier_id: { module: 'tiers', labelPrefix: 'Tier' },
  activity_id: { module: 'planner', labelPrefix: 'Activité' },
  asset_id: { module: 'assets', labelPrefix: 'Asset' },
}

// Une chaine au format UUID standard (8-4-4-4-12) qu'on tronque pour
// l'affichage des cles inconnues. Le titre HTML garde la valeur complete.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(s: string): boolean {
  return UUID_RE.test(s)
}

function truncateUuid(s: string): string {
  return s.slice(0, 8) + '…'
}

// Mapping des cles d'event details (snake_case) -> libelle humanise FR.
// Couvre AUSSI les noms de champs qui peuvent apparaitre :
// - en tant que cle de detail   (k = 'fields', 'title', 'rejection_reason')
// - en tant que valeur de fields[] (item = 'title', 'status')
// Memes labels, meme map, pas de duplication.
// Pour une cle/valeur absente du map, on retombe sur la version snake_case
// (acceptable : l'utilisateur peut deduire le sens dans 99% des cas).
// Note : on ne couvre pas TOUS les champs - juste les plus frequents
// dans les events update. Pour un champ absent, on retombe sur le
// snake_case (acceptable car l'utilisateur peut deduire le sens).
const FIELD_NAME_LABELS_FR: Record<string, string> = {
  title: 'Titre',
  name: 'Nom',
  description: 'Description',
  status: 'Statut',
  priority: 'Priorité',
  code: 'Code',
  type: 'Type',
  start_date: 'Date de début',
  end_date: 'Date de fin',
  due_date: 'Échéance',
  target_date: 'Date cible',
  assignee_id: 'Responsable',
  manager_id: 'Manager',
  tier_id: 'Tier',
  project_id: 'Projet',
  asset_id: 'Asset',
  budget: 'Budget',
  currency: 'Devise',
  progress: 'Avancement',
  weather: 'Météo',
  trend: 'Tendance',
  is_primary: 'Principal',
  is_blocked: 'Bloqué',
  is_milestone: 'Jalon',
  email: 'Email',
  phone: 'Téléphone',
  pax_quota: 'PAX quota',
  pax_quota_mode: 'PAX mode',
  pax_quota_daily: 'PAX journalier',
  rejection_reason: 'Raison du rejet',
  // Cles d'event details specifiques (pas des field SQL)
  fields: 'Champs',
  reason: 'Raison',
  block_type: 'Type de blocage',
  role: 'Rôle',
  label: 'Libellé',
  city: 'Ville',
  country: 'Pays',
  number: 'Numéro',
  system: 'Système',
  send_invitation: 'Invitation envoyée',
  conflicts_detected: 'Conflits détectés',
  ads_flagged_for_review: 'AdS à revoir',
  status_changed: 'Statut modifié',
  invited_validators: 'Validateurs invités',
}

function humanizeFieldName(field: string): string {
  return FIELD_NAME_LABELS_FR[field] ?? field
}

/** Format un champ value brut en chaine lisible (sans deep-link). */
function formatPlainValue(v: unknown, isFieldsList = false): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'boolean') return v ? '✓' : '✗'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') {
    if (isUuid(v)) return truncateUuid(v)
    return v
  }
  if (Array.isArray(v)) {
    // fields: ['title','status'] -> "Titre, Statut" si isFieldsList=true.
    // Autres arrays (e.g. affected_task_ids) -> on garde la valeur brute.
    return v
      .map((x) => {
        if (typeof x !== 'string') return JSON.stringify(x)
        return isFieldsList ? humanizeFieldName(x) : x
      })
      .join(', ')
  }
  return JSON.stringify(v)
}

interface AuditEventDetailsProps {
  details: Record<string, unknown> | null | undefined
  /** Max number of fields to render. Default 4. */
  maxFields?: number
}

export function AuditEventDetails({ details, maxFields = 4 }: AuditEventDetailsProps) {
  const { t } = useTranslation()

  if (!details || typeof details !== 'object') return null

  // Etape 1 : fusionne old_status + new_status en un seul item visuel
  //           "draft → active" qu'on insere a la place des 2 entrees.
  const entries = Object.entries(details).filter(([k]) => k !== 'source')
  const oldStatus = details.old_status as string | undefined
  const newStatus = details.new_status as string | undefined
  const statusTransition = oldStatus && newStatus ? `${oldStatus} → ${newStatus}` : null
  const renderableEntries: Array<[string, unknown, 'plain' | 'statusTx']> = []
  let statusTxInserted = false
  for (const [k, v] of entries) {
    if (k === 'old_status' || k === 'new_status') {
      if (!statusTxInserted && statusTransition) {
        renderableEntries.push(['statut', statusTransition, 'statusTx'])
        statusTxInserted = true
      }
      continue
    }
    renderableEntries.push([k, v, 'plain'])
  }
  const visible = renderableEntries.slice(0, maxFields)
  if (visible.length === 0) return null

  return (
    <div className="mt-1 text-[11px] text-muted-foreground">
      {visible.map(([k, v, kind], idx) => {
        // Status transition row : single combined chip-like span.
        if (kind === 'statusTx') {
          return (
            <span key={`status-${idx}`} className="mr-3">
              <span className="font-medium text-foreground/70">{t('common.status', 'Statut')}:</span>{' '}
              <span className="font-mono">{String(v)}</span>
            </span>
          )
        }

        // Linkable ID : CrossModuleLink cliquable.
        const linkable = LINKABLE_ID_KEYS[k]
        if (linkable && typeof v === 'string' && isUuid(v)) {
          // Label = 'Projet · uuid8' ou similaire (compact).
          // Pour eviter un fetch pour chaque ligne, on construit un label
          // simple a partir de l'UUID tronque. CrossModuleLink fera son
          // propre hover-preview a la demande.
          return (
            <span key={k} className="mr-3 inline-flex items-baseline gap-1">
              <span className="font-medium text-foreground/70">{linkable.labelPrefix}:</span>
              <CrossModuleLink
                module={linkable.module}
                id={v}
                label={truncateUuid(v)}
                showIcon={false}
                mono
                className="text-[11px]"
              />
            </span>
          )
        }

        // Cas degrades : tier_id manquant dans la map, OU UUID non
        // referencee dans LINKABLE_ID_KEYS. On affiche plain mais on
        // garde un onClick fallback pour les *_id evidents.
        const isKnownIdKey = k.endsWith('_id')
        // Pour la cle 'fields' (utilisee dans update events pour
        // lister les champs touches), on humanise via FIELD_NAME_LABELS_FR.
        const formatted = formatPlainValue(v, k === 'fields')
        if (isKnownIdKey && typeof v === 'string' && isUuid(v)) {
          // Pas de CrossModuleLink (module inconnu) mais on rend l'UUID
          // tronque + title pour copy-paste de la version complete.
          return (
            <span key={k} className="mr-3">
              <span className="font-medium text-foreground/70">{humanizeFieldName(k)}:</span>{' '}
              <button
                type="button"
                onClick={() => {
                  // Fallback : copy to clipboard si vraiment opaque.
                  void navigator.clipboard?.writeText(v)
                }}
                className="font-mono underline-offset-2 hover:underline"
                title={`${v} (cliquer pour copier)`}
              >
                {formatted}
              </button>
            </span>
          )
        }

        return (
          <span key={k} className="mr-3">
            <span className="font-medium text-foreground/70">{humanizeFieldName(k)}:</span>{' '}
            <span className="font-mono">{formatted}</span>
          </span>
        )
      })}
    </div>
  )
}

