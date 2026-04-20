/**
 * HomePage — launcher-style app hub ("desk" layout).
 *
 * Shows a grid of large, tappable tiles — one per authorized module.
 * Designed as an alternative landing page to `/dashboard` for users
 * who prefer direct module access over widgets.
 *
 * Routing:
 *   - Wired at `/home` in App.tsx
 *   - Users can set their personal default landing via
 *     preferences (`defaultLanding: 'dashboard' | 'home'`)
 *
 * Layout:
 *   - Hero greeting (time-of-day aware)
 *   - Three category sections: Opérations, Administration, Transverse
 *   - 2 cols on mobile / 3 on sm / 4 on md+ (responsive)
 *   - Each tile: large lucide icon, module name, short description,
 *     hover gradient. Keyboard-focusable (tab order = order prop).
 *
 * Permission gating mirrors Sidebar.tsx — same permission keys and
 * RequireModuleEnabled semantics applied via useMemo filter.
 */

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { usePermission } from '@/hooks/usePermission'
import { useModules } from '@/hooks/useModules'
import { useAuthStore } from '@/stores/authStore'
import {
  LayoutDashboard,
  Building2,
  FolderKanban,
  CalendarClock,
  Users,
  Ship,
  Package,
  Coins,
  FileText,
  Workflow,
  GitBranch,
  ClipboardList,
  ShieldCheck,
  Landmark,
  Globe,
  UserCog,
  LifeBuoy,
  FolderOpen,
  Settings,
  type LucideIcon,
} from 'lucide-react'

interface Tile {
  path: string
  icon: LucideIcon
  labelKey: string
  descKey: string
  /** Module slug used for `enabledModules` gating. `core` is always on. */
  module: string
  requiredPermission?: string
  requiredAnyPermissions?: string[]
  /** Visual accent — picks from a small palette so the desk isn't monotone. */
  tint: 'blue' | 'amber' | 'violet' | 'emerald' | 'rose' | 'cyan' | 'indigo' | 'slate'
}

const OPERATIONS: Tile[] = [
  { path: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard', descKey: 'home.desc.dashboard', module: 'dashboard', requiredPermission: 'dashboard.read', tint: 'blue' },
  { path: '/projets', icon: FolderKanban, labelKey: 'nav.projets', descKey: 'home.desc.projets', module: 'projets', requiredPermission: 'project.read', tint: 'emerald' },
  { path: '/planner', icon: CalendarClock, labelKey: 'nav.planner', descKey: 'home.desc.planner', module: 'planner', requiredPermission: 'planner.activity.read', tint: 'cyan' },
  { path: '/paxlog', icon: Users, labelKey: 'nav.paxlog', descKey: 'home.desc.paxlog', module: 'paxlog', requiredAnyPermissions: ['paxlog.ads.read', 'paxlog.ads.create', 'paxlog.ads.approve', 'paxlog.avm.read', 'paxlog.avm.create', 'paxlog.avm.update', 'paxlog.avm.approve', 'paxlog.avm.complete', 'paxlog.profile.read', 'paxlog.compliance.read'], tint: 'blue' },
  { path: '/travelwiz', icon: Ship, labelKey: 'nav.travelwiz', descKey: 'home.desc.travelwiz', module: 'travelwiz', requiredPermission: 'travelwiz.voyage.read', tint: 'indigo' },
  { path: '/packlog', icon: Package, labelKey: 'nav.packlog', descKey: 'home.desc.packlog', module: 'packlog', requiredPermission: 'packlog.cargo.read', tint: 'amber' },
  { path: '/moc', icon: ClipboardList, labelKey: 'nav.moc', descKey: 'home.desc.moc', module: 'moc', requiredPermission: 'moc.read', tint: 'rose' },
  { path: '/tiers', icon: Building2, labelKey: 'nav.tiers', descKey: 'home.desc.tiers', module: 'tiers', requiredPermission: 'tier.read', tint: 'slate' },
]

const TRANSVERSE: Tile[] = [
  { path: '/imputations', icon: Coins, labelKey: 'nav.imputations', descKey: 'home.desc.imputations', module: 'core', requiredPermission: 'imputation.read', tint: 'amber' },
  { path: '/papyrus', icon: FileText, labelKey: 'nav.papyrus', descKey: 'home.desc.papyrus', module: 'papyrus', requiredPermission: 'document.read', tint: 'indigo' },
  { path: '/pid-pfd', icon: Workflow, labelKey: 'nav.pid_pfd', descKey: 'home.desc.pid_pfd', module: 'pid_pfd', requiredPermission: 'pid.read', tint: 'cyan' },
  { path: '/workflow', icon: GitBranch, labelKey: 'nav.workflow', descKey: 'home.desc.workflow', module: 'workflow', requiredPermission: 'workflow.definition.read', tint: 'violet' },
  { path: '/conformite', icon: ShieldCheck, labelKey: 'nav.conformite', descKey: 'home.desc.conformite', module: 'conformite', requiredPermission: 'conformite.record.read', tint: 'emerald' },
  { path: '/assets', icon: Landmark, labelKey: 'nav.assets', descKey: 'home.desc.assets', module: 'asset_registry', requiredPermission: 'asset.read', tint: 'slate' },
]

const ADMINISTRATION: Tile[] = [
  { path: '/entities', icon: Globe, labelKey: 'nav.entities', descKey: 'home.desc.entities', module: 'core', requiredPermission: 'core.entity.read', tint: 'slate' },
  { path: '/users', icon: UserCog, labelKey: 'nav.accounts', descKey: 'home.desc.accounts', module: 'core', requiredPermission: 'core.users.read', tint: 'violet' },
  { path: '/support', icon: LifeBuoy, labelKey: 'nav.support', descKey: 'home.desc.support', module: 'support', requiredPermission: 'support.ticket.read', tint: 'rose' },
  { path: '/files', icon: FolderOpen, labelKey: 'nav.files', descKey: 'home.desc.files', module: 'core', requiredPermission: 'core.settings.manage', tint: 'amber' },
  { path: '/settings', icon: Settings, labelKey: 'nav.settings', descKey: 'home.desc.settings', module: 'core', tint: 'slate' },
]

/**
 * Colour palette for tile accents. Each tint provides:
 *   - `bg`   : faint tinted background that lifts the icon off the card
 *   - `icon` : filled icon colour
 *   - `ring` : hover glow / focus ring colour
 * We avoid saturated fills on the whole card so the desk remains calm
 * and the UI keeps its ERP readability character.
 */
const TINTS: Record<Tile['tint'], { bg: string; icon: string; ring: string }> = {
  blue:    { bg: 'bg-blue-500/10',    icon: 'text-blue-600 dark:text-blue-400',       ring: 'group-hover:ring-blue-500/30' },
  amber:   { bg: 'bg-amber-500/10',   icon: 'text-amber-600 dark:text-amber-400',     ring: 'group-hover:ring-amber-500/30' },
  violet:  { bg: 'bg-violet-500/10',  icon: 'text-violet-600 dark:text-violet-400',   ring: 'group-hover:ring-violet-500/30' },
  emerald: { bg: 'bg-emerald-500/10', icon: 'text-emerald-600 dark:text-emerald-400', ring: 'group-hover:ring-emerald-500/30' },
  rose:    { bg: 'bg-rose-500/10',    icon: 'text-rose-600 dark:text-rose-400',       ring: 'group-hover:ring-rose-500/30' },
  cyan:    { bg: 'bg-cyan-500/10',    icon: 'text-cyan-600 dark:text-cyan-400',       ring: 'group-hover:ring-cyan-500/30' },
  indigo:  { bg: 'bg-indigo-500/10',  icon: 'text-indigo-600 dark:text-indigo-400',   ring: 'group-hover:ring-indigo-500/30' },
  slate:   { bg: 'bg-slate-500/10',   icon: 'text-slate-600 dark:text-slate-400',     ring: 'group-hover:ring-slate-500/30' },
}

function TileButton({ tile, index }: { tile: Tile; index: number }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const Icon = tile.icon
  const style = TINTS[tile.tint]
  return (
    <button
      type="button"
      onClick={() => navigate(tile.path)}
      className={cn(
        'group relative flex flex-col items-start gap-3 p-4 sm:p-5',
        'rounded-2xl border border-border bg-card hover:bg-card/80',
        'text-left transition-all duration-200',
        'ring-1 ring-transparent hover:ring-2 hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300',
        style.ring,
      )}
      style={{ animationDelay: `${Math.min(index * 30, 240)}ms` }}
    >
      <div className={cn(
        'flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl shrink-0',
        style.bg,
      )}>
        <Icon className={cn('h-5 w-5 sm:h-6 sm:w-6', style.icon)} />
      </div>
      <div className="min-w-0">
        <div className="text-sm sm:text-base font-semibold text-foreground font-display tracking-tight">
          {t(tile.labelKey)}
        </div>
        <div className="mt-0.5 text-[11px] sm:text-xs text-muted-foreground line-clamp-2">
          {t(tile.descKey, { defaultValue: '' })}
        </div>
      </div>
    </button>
  )
}

function Section({ titleKey, tiles }: { titleKey: string; tiles: Tile[] }) {
  const { t } = useTranslation()
  if (tiles.length === 0) return null
  return (
    <section className="space-y-3">
      <h2 className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-1">
        {t(titleKey)}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
        {tiles.map((tile, i) => (
          <TileButton key={tile.path} tile={tile} index={i} />
        ))}
      </div>
    </section>
  )
}

/**
 * Compute the greeting based on the user's local time.
 * Keeps the string count low — 3 time windows cover the day.
 */
function useGreeting(): string {
  const { t } = useTranslation()
  const hour = new Date().getHours()
  if (hour < 5) return t('home.greeting.night')
  if (hour < 12) return t('home.greeting.morning')
  if (hour < 18) return t('home.greeting.afternoon')
  return t('home.greeting.evening')
}

export function HomePage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const { hasPermission, hasAny } = usePermission()
  const { data: modules = [] } = useModules()
  const enabledModules = useMemo(
    () => new Set(modules.filter((m) => m.enabled).map((m) => m.slug)),
    [modules],
  )

  const filterTiles = (tiles: Tile[]): Tile[] =>
    tiles.filter((tile) => {
      // `core` modules always pass the module gate; others must be enabled.
      if (tile.module !== 'core' && !enabledModules.has(tile.module)) return false
      if (tile.requiredPermission && !hasPermission(tile.requiredPermission)) return false
      if (tile.requiredAnyPermissions && !hasAny(tile.requiredAnyPermissions)) return false
      return true
    })

  const ops = useMemo(() => filterTiles(OPERATIONS), [enabledModules, hasPermission, hasAny])
  const transverse = useMemo(() => filterTiles(TRANSVERSE), [enabledModules, hasPermission, hasAny])
  const admin = useMemo(() => filterTiles(ADMINISTRATION), [enabledModules, hasPermission, hasAny])

  const greeting = useGreeting()
  const firstName = user?.first_name || user?.full_name?.split(' ')[0] || ''

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Hero — greeting + date */}
        <header className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground font-display tracking-tight">
            {greeting}{firstName && `, ${firstName}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </header>

        <Section titleKey="home.section.operations" tiles={ops} />
        <Section titleKey="home.section.transverse" tiles={transverse} />
        <Section titleKey="home.section.administration" tiles={admin} />

        {ops.length + transverse.length + admin.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t('home.no_modules', { defaultValue: 'Aucun module accessible pour votre compte. Contactez un administrateur.' })}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default HomePage
