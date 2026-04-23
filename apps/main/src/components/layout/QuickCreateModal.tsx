/**
 * QuickCreateModal — global "+" shortcut to create any entity
 * regardless of the current page.
 *
 * Pattern is inspired by YetiCRM / Odoo / Jira: a centered dialog
 * with categories in columns, each listing the creatable items.
 * Search narrows the list live (case-insensitive, matches label +
 * keywords). Arrow-key navigation + Enter activates the top result.
 *
 * Click flow (per item):
 *   1. navigate(item.route) — so the target module page mounts.
 *   2. openDynamicPanel({ type: 'create', module, meta }) — the
 *      page's dispatcher renders the matching Create* panel.
 *   3. close the modal.
 *
 * Permission gating: each item may declare a required permission
 * key; if the user doesn't have it, the item is hidden.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Plus,
  Search,
  X,
  FolderKanban,
  Wrench,
  CalendarRange,
  UserCheck,
  AlertTriangle,
  RefreshCw,
  UserPlus,
  Building2,
  Ship,
  Route,
  Package,
  Boxes,
  MapPin,
  Landmark,
  Factory,
  Map,
  ShieldCheck,
  FileCheck,
  Briefcase,
  ShieldAlert,
  Users,
  Key,
  AppWindow,
  Home,
  LifeBuoy,
  FileText,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'

// ── Item definition ────────────────────────────────────────────

interface QuickCreateItem {
  /** Stable ID used as React key and as anchor for keyboard nav. */
  id: string
  /** i18n key for the label. Falls back to `fallback` if missing. */
  labelKey: string
  fallback: string
  icon: LucideIcon
  /** Route to navigate to before opening the panel. */
  route: string
  /** Module ID passed to openDynamicPanel. */
  module: string
  /** Optional meta (e.g. subtype for paxlog/conformite dispatchers). */
  meta?: Record<string, unknown>
  /** Optional permission guard. Item is hidden if caller lacks it. */
  permission?: string
  /** Extra search tokens (synonyms, English fallback) — not rendered. */
  keywords?: string[]
}

interface QuickCreateCategory {
  id: string
  labelKey: string
  fallback: string
  icon: LucideIcon
  items: QuickCreateItem[]
}

// ── Category / item catalogue ──────────────────────────────────
// Keep this in sync with the Create* panels registered by each
// module page (see e.g. PaxLogPage.tsx, ConformitePage.tsx).

const CATEGORIES: QuickCreateCategory[] = [
  {
    id: 'operations',
    labelKey: 'quick_create.cat_operations',
    fallback: 'Opérations',
    icon: Wrench,
    items: [
      {
        id: 'moc',
        labelKey: 'quick_create.item_moc',
        fallback: 'MOC (Modification)',
        icon: Wrench,
        route: '/moc',
        module: 'moc',
        permission: 'moc.create',
        keywords: ['management of change', 'modification', 'mot'],
      },
      {
        id: 'activity',
        labelKey: 'quick_create.item_activity',
        fallback: 'Activité Planner',
        icon: CalendarRange,
        route: '/planner',
        module: 'planner',
        meta: { subtype: 'activity' },
        permission: 'planner.activity.create',
        keywords: ['planning', 'activité'],
      },
      {
        id: 'project',
        labelKey: 'quick_create.item_project',
        fallback: 'Projet',
        icon: FolderKanban,
        route: '/projets',
        module: 'projets',
        permission: 'project.create',
        keywords: ['projet'],
      },
    ],
  },
  {
    id: 'passengers',
    labelKey: 'quick_create.cat_passengers',
    fallback: 'Passagers (PaxLog)',
    icon: UserCheck,
    items: [
      {
        id: 'ads',
        labelKey: 'quick_create.item_ads',
        fallback: 'Avis de séjour (AdS)',
        icon: UserCheck,
        route: '/paxlog',
        module: 'paxlog',
        meta: { subtype: 'ads' },
        permission: 'paxlog.ads.create',
        keywords: ['ads', 'séjour', 'visit notice'],
      },
      {
        id: 'avm',
        labelKey: 'quick_create.item_avm',
        fallback: 'Avis de mission (AVM)',
        icon: FileCheck,
        route: '/paxlog',
        module: 'paxlog',
        meta: { subtype: 'avm' },
        permission: 'paxlog.avm.create',
        keywords: ['avm', 'mission'],
      },
      {
        id: 'pax-profile',
        labelKey: 'quick_create.item_pax_profile',
        fallback: 'Profil PAX',
        icon: UserPlus,
        route: '/paxlog',
        module: 'paxlog',
        meta: { subtype: 'profile' },
        permission: 'paxlog.profile.create',
        keywords: ['passager', 'profil'],
      },
      {
        id: 'pax-incident',
        labelKey: 'quick_create.item_pax_incident',
        fallback: 'Incident PAX',
        icon: AlertTriangle,
        route: '/paxlog',
        module: 'paxlog',
        meta: { subtype: 'incident' },
        permission: 'paxlog.incident.create',
        keywords: ['incident', 'ban'],
      },
      {
        id: 'pax-rotation',
        labelKey: 'quick_create.item_pax_rotation',
        fallback: 'Cycle de rotation',
        icon: RefreshCw,
        route: '/paxlog',
        module: 'paxlog',
        meta: { subtype: 'rotation' },
        // Backend uses paxlog.rotation.manage for all rotation-cycle ops
        // (create/update/delete). There's no dedicated .create perm.
        permission: 'paxlog.rotation.manage',
        keywords: ['rotation', 'cycle', 'on/off'],
      },
    ],
  },
  {
    id: 'travelwiz',
    labelKey: 'quick_create.cat_travelwiz',
    fallback: 'Logistique (TravelWiz)',
    icon: Ship,
    items: [
      {
        id: 'voyage',
        labelKey: 'quick_create.item_voyage',
        fallback: 'Voyage',
        icon: Ship,
        route: '/travelwiz',
        module: 'travelwiz',
        meta: { subtype: 'voyage' },
        permission: 'travelwiz.voyage.create',
        keywords: ['voyage', 'rotation', 'vol'],
      },
      {
        id: 'vector',
        labelKey: 'quick_create.item_vector',
        fallback: 'Vecteur',
        icon: Ship,
        route: '/travelwiz',
        module: 'travelwiz',
        meta: { subtype: 'vector' },
        permission: 'travelwiz.vector.create',
        keywords: ['vecteur', 'hélicoptère', 'navire', 'bus'],
      },
      {
        id: 'rotation',
        labelKey: 'quick_create.item_rotation',
        fallback: 'Rotation logistique',
        icon: Route,
        route: '/travelwiz',
        module: 'travelwiz',
        meta: { subtype: 'rotation' },
        // POST /travelwiz/rotations has no dedicated perm upstream; we
        // gate on voyage.create since a rotation is the nominal
        // parent of voyages — same audience in practice.
        permission: 'travelwiz.voyage.create',
        keywords: ['rotation', 'cadence'],
      },
    ],
  },
  {
    id: 'packlog',
    labelKey: 'quick_create.cat_packlog',
    fallback: 'Cargaisons (PackLog)',
    icon: Package,
    items: [
      {
        id: 'cargo-request',
        labelKey: 'quick_create.item_cargo_request',
        fallback: 'Demande de cargaison',
        icon: Package,
        route: '/packlog',
        module: 'packlog',
        meta: { subtype: 'cargo-request' },
        permission: 'packlog.cargo.create',
        keywords: ['cargaison', 'shipment'],
      },
      {
        id: 'cargo',
        labelKey: 'quick_create.item_cargo',
        fallback: 'Colis',
        icon: Boxes,
        route: '/packlog',
        module: 'packlog',
        meta: { subtype: 'cargo' },
        permission: 'packlog.cargo.create',
        keywords: ['colis', 'parcel'],
      },
    ],
  },
  {
    id: 'assets',
    labelKey: 'quick_create.cat_assets',
    fallback: 'Assets',
    icon: Factory,
    items: [
      {
        id: 'field',
        labelKey: 'quick_create.item_field',
        fallback: 'Champ',
        icon: Map,
        route: '/assets',
        module: 'ar-field',
        permission: 'asset.create',
        keywords: ['champ', 'field'],
      },
      {
        id: 'site',
        labelKey: 'quick_create.item_site',
        fallback: 'Site',
        icon: Landmark,
        route: '/assets',
        module: 'ar-site',
        permission: 'asset.create',
        keywords: ['site'],
      },
      {
        id: 'installation',
        labelKey: 'quick_create.item_installation',
        fallback: 'Installation',
        icon: Factory,
        route: '/assets',
        module: 'ar-installation',
        permission: 'asset.create',
        keywords: ['plateforme', 'platform'],
      },
      {
        id: 'equipment',
        labelKey: 'quick_create.item_equipment',
        fallback: 'Équipement',
        icon: Wrench,
        route: '/assets',
        module: 'ar-equipment',
        permission: 'asset.create',
        keywords: ['equipement', 'equipment'],
      },
      {
        id: 'pipeline',
        labelKey: 'quick_create.item_pipeline',
        fallback: 'Pipeline',
        icon: Route,
        route: '/assets',
        module: 'ar-pipeline',
        permission: 'asset.create',
        keywords: ['pipe', 'ligne'],
      },
    ],
  },
  {
    id: 'tiers',
    labelKey: 'quick_create.cat_tiers',
    fallback: 'Sociétés & Contacts',
    icon: Building2,
    items: [
      {
        id: 'tier',
        labelKey: 'quick_create.item_tier',
        fallback: 'Entreprise (Tier)',
        icon: Building2,
        route: '/tiers',
        module: 'tiers',
        permission: 'tier.create',
        keywords: ['entreprise', 'company', 'third party'],
      },
    ],
  },
  {
    id: 'compliance',
    labelKey: 'quick_create.cat_compliance',
    fallback: 'Conformité',
    icon: ShieldCheck,
    items: [
      {
        id: 'compliance-record',
        labelKey: 'quick_create.item_compliance_record',
        fallback: 'Enregistrement de conformité',
        icon: FileCheck,
        route: '/conformite',
        module: 'conformite',
        meta: { subtype: 'record' },
        permission: 'conformite.record.create',
        keywords: ['certification', 'record'],
      },
      {
        id: 'compliance-type',
        labelKey: 'quick_create.item_compliance_type',
        fallback: 'Type de conformité',
        icon: ShieldCheck,
        route: '/conformite',
        module: 'conformite',
        permission: 'conformite.type.create',
        keywords: ['type'],
      },
      {
        id: 'job-position',
        labelKey: 'quick_create.item_job_position',
        fallback: 'Poste',
        icon: Briefcase,
        route: '/conformite',
        module: 'conformite',
        meta: { subtype: 'job-position' },
        permission: 'conformite.jobposition.create',
        keywords: ['poste', 'function', 'job'],
      },
      {
        id: 'exemption',
        labelKey: 'quick_create.item_exemption',
        fallback: 'Exemption',
        icon: ShieldAlert,
        route: '/conformite',
        module: 'conformite',
        meta: { subtype: 'exemption' },
        permission: 'conformite.exemption.create',
        keywords: ['exemption', 'waiver'],
      },
    ],
  },
  {
    id: 'support',
    labelKey: 'quick_create.cat_support',
    fallback: 'Support',
    icon: LifeBuoy,
    items: [
      {
        id: 'ticket',
        labelKey: 'quick_create.item_ticket',
        fallback: 'Ticket support',
        icon: LifeBuoy,
        route: '/support',
        module: 'support',
        meta: { subtype: 'ticket' },
        permission: 'support.ticket.create',
        keywords: ['ticket', 'bug', 'question'],
      },
    ],
  },
  {
    id: 'admin',
    labelKey: 'quick_create.cat_admin',
    fallback: 'Administration',
    icon: Users,
    items: [
      {
        id: 'user',
        labelKey: 'quick_create.item_user',
        fallback: 'Utilisateur',
        icon: Users,
        route: '/users',
        module: 'users',
        // Backend registers the perm as 'user.create' (no 'core.' prefix).
        permission: 'user.create',
        keywords: ['user', 'utilisateur', 'compte'],
      },
      {
        id: 'entity',
        labelKey: 'quick_create.item_entity',
        fallback: 'Entité',
        icon: Home,
        route: '/entities',
        module: 'entities',
        permission: 'core.entity.create',
        keywords: ['entité', 'tenant'],
      },
      {
        id: 'oauth-app',
        labelKey: 'quick_create.item_oauth_app',
        fallback: 'Application OAuth',
        icon: AppWindow,
        route: '/settings/integrations',
        module: 'settings',
        meta: { subtype: 'oauth-app' },
        permission: 'core.settings.manage',
        keywords: ['oauth', 'app', 'integration'],
      },
      {
        id: 'token',
        labelKey: 'quick_create.item_token',
        fallback: 'Token API',
        icon: Key,
        route: '/settings/tokens',
        module: 'settings',
        meta: { subtype: 'token' },
        permission: 'core.settings.manage',
        keywords: ['token', 'api key'],
      },
      {
        id: 'address',
        labelKey: 'quick_create.item_address',
        fallback: 'Adresse',
        icon: MapPin,
        route: '/settings/addresses',
        module: 'settings',
        meta: { subtype: 'address' },
        permission: 'core.settings.manage',
        keywords: ['adresse', 'address'],
      },
      {
        id: 'papyrus-doc',
        labelKey: 'quick_create.item_papyrus_doc',
        fallback: 'Document Papyrus',
        icon: FileText,
        route: '/papyrus',
        module: 'papyrus',
        permission: 'document.create',
        keywords: ['document', 'papyrus', 'report'],
      },
    ],
  },
]

// ── Props ──────────────────────────────────────────────────────

interface QuickCreateModalProps {
  open: boolean
  onClose: () => void
}

export function QuickCreateModal({ open, onClose }: QuickCreateModalProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { hasPermission } = usePermission()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Autofocus the search input when the modal opens.
  useEffect(() => {
    if (open) {
      setQuery('')
      // Defer focus to the next frame to avoid losing it under the
      // mount transition.
      const id = window.setTimeout(() => inputRef.current?.focus(), 20)
      return () => window.clearTimeout(id)
    }
  }, [open])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Filter items by permission + query.
  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.filter((it) => {
        if (it.permission && !hasPermission(it.permission)) return false
        if (!q) return true
        const label = t(it.labelKey, it.fallback).toLowerCase()
        const hay = [label, it.fallback.toLowerCase(), ...(it.keywords ?? [])].join(' ')
        return hay.includes(q)
      }),
    })).filter((cat) => cat.items.length > 0)
  }, [query, hasPermission, t])

  // First visible item — used for Enter key.
  const firstVisibleItem = useMemo(() => {
    for (const cat of filteredCategories) {
      if (cat.items.length > 0) return cat.items[0]
    }
    return null
  }, [filteredCategories])

  const pickItem = (it: QuickCreateItem) => {
    navigate(it.route)
    // Open the panel AFTER pushing navigation so the target page's
    // dispatcher is mounted and picks up the store change.
    // A microtask is enough — React Router's navigation is synchronous
    // within the same render cycle for client-side routes.
    queueMicrotask(() => {
      openDynamicPanel({ type: 'create', module: it.module, meta: it.meta })
    })
    onClose()
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && firstVisibleItem) {
      e.preventDefault()
      pickItem(firstVisibleItem)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-create-title"
      className="fixed inset-0 flex items-start justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      style={{ zIndex: 'var(--z-modal)' }}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label={t('common.close', 'Fermer')}
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
      />

      {/* Modal card */}
      <div className="relative mt-12 w-[min(1100px,calc(100vw-2rem))] max-h-[85vh] flex flex-col rounded-2xl border border-border/60 bg-popover shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] motion-safe:animate-in motion-safe:slide-in-from-top-2 motion-safe:duration-200">
        {/* Accent strip */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary via-primary to-highlight rounded-t-2xl"
        />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/[0.12]">
              <Plus size={15} className="text-primary" />
            </span>
            <h2
              id="quick-create-title"
              className="text-sm font-semibold font-display tracking-tight text-foreground truncate"
            >
              {t('quick_create.title', 'Création rapide')}
            </h2>
          </div>

          <div className="relative flex-1 max-w-md ml-4">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder={t('quick_create.search_placeholder', 'Rechercher un élément à créer...')}
              className="w-full h-8 pl-8 pr-3 text-sm rounded-md border border-border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          <button
            onClick={onClose}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-chrome-hover hover:text-foreground transition-colors"
            aria-label={t('common.close', 'Fermer')}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body — category grid */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {filteredCategories.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t('quick_create.no_results', 'Aucun élément ne correspond à votre recherche.')}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredCategories.map((cat) => {
              const CatIcon = cat.icon
              return (
                <div
                  key={cat.id}
                  className="rounded-lg border border-border/50 bg-card/40 overflow-hidden"
                >
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/20 border-b border-border/40">
                    <CatIcon size={13} className="text-primary" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                      {t(cat.labelKey, cat.fallback)}
                    </h3>
                  </div>
                  <ul className="py-1">
                    {cat.items.map((it) => {
                      const ItIcon = it.icon
                      return (
                        <li key={it.id}>
                          <button
                            type="button"
                            onClick={() => pickItem(it)}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                              'text-foreground hover:bg-primary/[0.08] hover:text-primary',
                            )}
                          >
                            <ItIcon size={13} className="text-muted-foreground shrink-0" />
                            <span className="truncate">{t(it.labelKey, it.fallback)}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-t border-border/60 bg-muted/10 rounded-b-2xl">
          <span className="text-[10px] text-muted-foreground">
            <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">↵</kbd>{' '}
            {t('quick_create.hint_enter', 'pour sélectionner le premier résultat')} ·{' '}
            <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Esc</kbd>{' '}
            {t('common.cancel', 'Annuler')}
          </span>
          <button
            onClick={onClose}
            className="gl-button-sm gl-button-default inline-flex items-center gap-1.5"
          >
            <X size={12} />
            {t('common.cancel', 'Annuler')}
          </button>
        </div>
      </div>
    </div>
  )
}
