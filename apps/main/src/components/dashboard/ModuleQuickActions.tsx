/**
 * ModuleQuickActions — compact band of contextual shortcuts rendered
 * at the top of each module dashboard.
 *
 * Goal: the user lands on /moc, /projets, /paxlog… and sees a strip
 * of 4-6 primary actions (create record, jump to conflicts, open
 * reports, etc.) without having to hunt through tabs. Filling the gap
 * between the global QuickCreate modal (topbar "+" — all modules) and
 * each tab's own deep actions (inside the tab).
 *
 * Each action is a small card:
 *   - icon in a primary-tinted chip (standard vocabulary)
 *   - label
 *   - optional subtitle
 *   - either navigates (url) or opens a create panel (createModule + meta)
 *
 * Permission-gated — items without the required perm are hidden.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Briefcase,
  CalendarRange,
  FileCheck,
  FileText,
  FolderKanban,
  LifeBuoy,
  ListTodo,
  Map,
  Package,
  Plus,
  Route,
  Ship,
  ShieldCheck,
  UserCheck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'

interface QuickAction {
  id: string
  labelKey: string
  labelFallback: string
  subtitleKey?: string
  subtitleFallback?: string
  icon: LucideIcon
  /** Navigate to this path + (optionally) open a create panel. */
  url?: string
  /** openDynamicPanel({ type: 'create', module, meta }) */
  createModule?: string
  createMeta?: Record<string, unknown>
  /** Required permission; item hidden when the user lacks it. */
  permission?: string
  /** Visual accent — maps to the tint of the chip + border. */
  variant?: 'default' | 'primary' | 'warning' | 'danger'
}

// ── Per-module catalogues ─────────────────────────────────────────

const QUICK_ACTIONS: Record<string, QuickAction[]> = {
  moc: [
    {
      id: 'moc-new',
      labelKey: 'quick_actions.moc.new',
      labelFallback: 'Nouveau MOC',
      subtitleKey: 'quick_actions.moc.new_sub',
      subtitleFallback: 'Déclarer une modification',
      icon: Plus,
      createModule: 'moc',
      permission: 'moc.create',
      variant: 'primary',
    },
    {
      id: 'moc-list',
      labelKey: 'quick_actions.moc.list',
      labelFallback: 'Registre MOC',
      subtitleKey: 'quick_actions.moc.list_sub',
      subtitleFallback: 'Toutes les modifications',
      icon: Wrench,
      url: '/moc?tab=list',
      permission: 'moc.read',
    },
  ],
  projets: [
    {
      id: 'projet-new',
      labelKey: 'quick_actions.projet.new',
      labelFallback: 'Nouveau projet',
      icon: Plus,
      createModule: 'projets',
      permission: 'project.create',
      variant: 'primary',
    },
    {
      id: 'projet-gantt',
      labelKey: 'quick_actions.projet.gantt',
      labelFallback: 'Vue Gantt',
      subtitleKey: 'quick_actions.projet.gantt_sub',
      subtitleFallback: 'Planning multi-projets',
      icon: FolderKanban,
      url: '/projets?tab=gantt',
      permission: 'project.read',
    },
    {
      id: 'projet-tasks',
      labelKey: 'quick_actions.projet.tasks',
      labelFallback: 'Toutes les tâches',
      icon: ListTodo,
      url: '/projets?tab=tasks',
      permission: 'project.read',
    },
  ],
  planner: [
    {
      id: 'activity-new',
      labelKey: 'quick_actions.planner.new_activity',
      labelFallback: 'Nouvelle activité',
      icon: Plus,
      createModule: 'planner',
      permission: 'planner.activity.create',
      variant: 'primary',
    },
    {
      id: 'planner-gantt',
      labelKey: 'quick_actions.planner.gantt',
      labelFallback: 'Plan Gantt',
      icon: CalendarRange,
      url: '/planner?tab=gantt',
      permission: 'planner.activity.read',
    },
    {
      id: 'planner-conflicts',
      labelKey: 'quick_actions.planner.conflicts',
      labelFallback: 'Conflits POB',
      icon: AlertTriangle,
      url: '/planner?tab=conflicts',
      permission: 'planner.activity.read',
      variant: 'warning',
    },
    {
      id: 'planner-capacity',
      labelKey: 'quick_actions.planner.capacity',
      labelFallback: 'Capacité',
      icon: Map,
      url: '/planner?tab=capacity',
      permission: 'planner.activity.read',
    },
  ],
  paxlog: [
    {
      id: 'ads-new',
      labelKey: 'quick_actions.paxlog.new_ads',
      labelFallback: 'Nouvel AdS',
      icon: UserCheck,
      createModule: 'paxlog',
      createMeta: { subtype: 'ads' },
      permission: 'paxlog.ads.create',
      variant: 'primary',
    },
    {
      id: 'avm-new',
      labelKey: 'quick_actions.paxlog.new_avm',
      labelFallback: 'Nouvel AVM',
      icon: FileCheck,
      createModule: 'paxlog',
      createMeta: { subtype: 'avm' },
      permission: 'paxlog.avm.create',
    },
    {
      id: 'incident-new',
      labelKey: 'quick_actions.paxlog.new_incident',
      labelFallback: 'Signalement',
      icon: AlertTriangle,
      createModule: 'paxlog',
      createMeta: { subtype: 'incident' },
      permission: 'paxlog.incident.create',
      variant: 'warning',
    },
    {
      id: 'pax-profile-new',
      labelKey: 'quick_actions.paxlog.new_profile',
      labelFallback: 'Profil PAX',
      icon: Users,
      createModule: 'paxlog',
      createMeta: { subtype: 'profile' },
      permission: 'paxlog.profile.create',
    },
  ],
  travelwiz: [
    {
      id: 'voyage-new',
      labelKey: 'quick_actions.travelwiz.new_voyage',
      labelFallback: 'Nouveau voyage',
      icon: Ship,
      createModule: 'travelwiz',
      createMeta: { subtype: 'voyage' },
      permission: 'travelwiz.voyage.create',
      variant: 'primary',
    },
    {
      id: 'vector-new',
      labelKey: 'quick_actions.travelwiz.new_vector',
      labelFallback: 'Nouveau vecteur',
      icon: Ship,
      createModule: 'travelwiz',
      createMeta: { subtype: 'vector' },
      permission: 'travelwiz.vector.create',
    },
    {
      id: 'rotation-new',
      labelKey: 'quick_actions.travelwiz.new_rotation',
      labelFallback: 'Nouvelle rotation',
      icon: Route,
      createModule: 'travelwiz',
      createMeta: { subtype: 'rotation' },
      permission: 'travelwiz.voyage.create',
    },
  ],
  packlog: [
    {
      id: 'cargo-request-new',
      labelKey: 'quick_actions.packlog.new_request',
      labelFallback: 'Nouvelle demande',
      icon: Plus,
      createModule: 'packlog',
      createMeta: { subtype: 'cargo-request' },
      permission: 'packlog.cargo.create',
      variant: 'primary',
    },
    {
      id: 'cargo-new',
      labelKey: 'quick_actions.packlog.new_cargo',
      labelFallback: 'Nouveau colis',
      icon: Package,
      createModule: 'packlog',
      createMeta: { subtype: 'cargo' },
      permission: 'packlog.cargo.create',
    },
  ],
  conformite: [
    {
      id: 'conformite-record-new',
      labelKey: 'quick_actions.conformite.new_record',
      labelFallback: 'Nouvel enregistrement',
      icon: FileCheck,
      createModule: 'conformite',
      createMeta: { subtype: 'record' },
      permission: 'conformite.record.create',
      variant: 'primary',
    },
    {
      id: 'conformite-records',
      labelKey: 'quick_actions.conformite.records',
      labelFallback: 'Registre conformité',
      icon: ShieldCheck,
      url: '/conformite?tab=enregistrements',
      permission: 'conformite.record.read',
    },
    {
      id: 'conformite-exemption-new',
      labelKey: 'quick_actions.conformite.new_exemption',
      labelFallback: 'Exemption',
      icon: AlertTriangle,
      createModule: 'conformite',
      createMeta: { subtype: 'exemption' },
      permission: 'conformite.exemption.create',
      variant: 'warning',
    },
  ],
  support: [
    {
      id: 'ticket-new',
      labelKey: 'quick_actions.support.new_ticket',
      labelFallback: 'Nouveau ticket',
      icon: LifeBuoy,
      createModule: 'support',
      createMeta: { subtype: 'ticket' },
      permission: 'support.ticket.create',
      variant: 'primary',
    },
  ],
  papyrus: [
    {
      id: 'document-new',
      labelKey: 'quick_actions.papyrus.new_document',
      labelFallback: 'Nouveau document',
      icon: FileText,
      createModule: 'papyrus',
      permission: 'document.create',
      variant: 'primary',
    },
  ],
  tiers: [
    {
      id: 'tier-new',
      labelKey: 'quick_actions.tiers.new_tier',
      labelFallback: 'Nouvelle entreprise',
      icon: Briefcase,
      createModule: 'tiers',
      permission: 'tier.create',
      variant: 'primary',
    },
  ],
}

// ── Render helpers ─────────────────────────────────────────────────

const VARIANT_STYLES: Record<string, { chip: string; border: string }> = {
  default: {
    chip: 'bg-primary/[0.08] text-primary ring-1 ring-inset ring-primary/10',
    border: 'border-border/60',
  },
  primary: {
    chip: 'bg-primary/15 text-primary ring-1 ring-inset ring-primary/20',
    border: 'border-primary/30',
  },
  warning: {
    chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20',
    border: 'border-amber-500/30',
  },
  danger: {
    chip: 'bg-red-500/15 text-red-600 dark:text-red-400 ring-1 ring-inset ring-red-500/20',
    border: 'border-red-500/30',
  },
}

// ── Component ──────────────────────────────────────────────────────

interface ModuleQuickActionsProps {
  module: string
  className?: string
}

export function ModuleQuickActions({ module, className }: ModuleQuickActionsProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const setDynamicPanelMode = useUIStore((s) => s.setDynamicPanelMode)
  const { hasPermission } = usePermission()

  const actions = useMemo(() => {
    const raw = QUICK_ACTIONS[module] ?? []
    return raw.filter((a) => !a.permission || hasPermission(a.permission))
  }, [module, hasPermission])

  if (actions.length === 0) return null

  const pick = (action: QuickAction) => {
    if (action.url) navigate(action.url)
    if (action.createModule) {
      setDynamicPanelMode('full')
      openDynamicPanel({
        type: 'create',
        module: action.createModule,
        meta: action.createMeta,
      })
    }
  }

  return (
    <div
      className={cn(
        'grid gap-2 mb-4',
        'grid-cols-2 @md:grid-cols-3 @lg:grid-cols-4 @2xl:grid-cols-6',
        className,
      )}
    >
      {actions.map((a) => {
        const v = VARIANT_STYLES[a.variant ?? 'default']
        const Icon = a.icon
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => pick(a)}
            className={cn(
              'group rounded-lg border bg-card px-3 py-2.5 text-left transition-all',
              'hover:bg-accent/40 hover:shadow-sm hover:-translate-y-[1px]',
              v.border,
            )}
          >
            <div className="flex items-start gap-2.5">
              <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-md shrink-0', v.chip)}>
                <Icon size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate leading-tight">
                  {t(a.labelKey, a.labelFallback)}
                </p>
                {a.subtitleFallback && (
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {t(a.subtitleKey ?? a.labelKey, a.subtitleFallback)}
                  </p>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
