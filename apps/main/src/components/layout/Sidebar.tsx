/**
 * Sidebar — Pajamas++ navigation (Phase 1B)
 *
 * What changed vs. the previous version:
 *  - Replaced inline className spaghetti (cn() with 8 lines of conditionals)
 *    with the single `.nav-item` utility from styles/pajamas-pp.css.
 *  - Removed gradient + shadow on active state. Pajamas++ uses a solid
 *    primary tint (10% opacity) + a 2px left rail. Cleaner, ERP-like.
 *  - Removed icon hover-scale. Reads as a UI tic at this density.
 *  - Section labels use the new `.nav-section-label` class for consistency.
 *  - Default expanded width: 200px (was 180px) — the new label letter
 *    spacing needs the extra room.
 *  - Active state now also tints the icon. Uniform "this is selected".
 *
 * Behaviour preserved 1:1: routing, RBAC, module gating, prefetch on hover,
 * mobile close, badges, collapse toggle.
 */
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { usePermission } from '@/hooks/usePermission'
import { useModules } from '@/hooks/useModules'
import {
  LayoutDashboard,
  LayoutGrid,
  Landmark,
  Building2,
  Globe,
  Settings,
  GitBranch,
  Users,
  UserCog,
  PanelLeftClose,
  PanelLeft,
  ShieldCheck,
  FolderKanban,
  CalendarClock,
  Ship,
  Coins,
  FileText,
  Workflow,
  FolderOpen,
  LifeBuoy,
  Package,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onClose?: () => void
}

export interface NavItemDef {
  path: string
  icon: LucideIcon
  labelKey: string
  module?: string
  order: number
  badge?: number
  requiredPermission?: string
  requiredAnyPermissions?: string[]
}

const moduleNavItems: NavItemDef[] = [
  { path: '/home', icon: LayoutGrid, labelKey: 'nav.home', module: 'core', order: 5 },
  { path: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard', module: 'dashboard', order: 10, requiredPermission: 'dashboard.dashboard.read' },
  { path: '/tiers', icon: Building2, labelKey: 'nav.tiers', module: 'tiers', order: 30, requiredPermission: 'tier.tier.read' },
  { path: '/projets', icon: FolderKanban, labelKey: 'nav.projets', module: 'projets', order: 38, requiredPermission: 'project.read' },
  { path: '/planner', icon: CalendarClock, labelKey: 'nav.planner', module: 'planner', order: 39, requiredPermission: 'planner.activity.read' },
  { path: '/paxlog', icon: Users, labelKey: 'nav.paxlog', module: 'paxlog', order: 40, requiredAnyPermissions: ['paxlog.ads.read', 'paxlog.ads.create', 'paxlog.ads.approve', 'paxlog.avm.read', 'paxlog.avm.create', 'paxlog.avm.update', 'paxlog.avm.approve', 'paxlog.avm.complete', 'paxlog.profile.read', 'paxlog.compliance.read'] },
  { path: '/travelwiz', icon: Ship, labelKey: 'nav.travelwiz', module: 'travelwiz', order: 42, requiredPermission: 'travelwiz.voyage.read' },
  { path: '/packlog', icon: Package, labelKey: 'nav.packlog', module: 'packlog', order: 43, requiredPermission: 'packlog.cargo.read' },
  { path: '/mto', icon: Package, labelKey: 'nav.mto', module: 'mto', order: 45, requiredPermission: 'mto.matching.read' },
  { path: '/imputations', icon: Coins, labelKey: 'nav.imputations', module: 'core', order: 44, requiredPermission: 'imputation.read' },
  { path: '/papyrus', icon: FileText, labelKey: 'nav.papyrus', module: 'papyrus', order: 55, requiredPermission: 'papyrus.document.read' },
  { path: '/pid-pfd', icon: Workflow, labelKey: 'nav.pid_pfd', module: 'pid_pfd', order: 58, requiredPermission: 'pid.diagram.read' },
  { path: '/moc', icon: ClipboardList, labelKey: 'nav.moc', module: 'moc', order: 62, requiredPermission: 'moc.change.read' },
]

const adminNavItems: NavItemDef[] = [
  { path: '/conformite', icon: ShieldCheck, labelKey: 'nav.conformite', module: 'conformite', order: 82, requiredPermission: 'conformite.record.read' },
  { path: '/assets', icon: Landmark, labelKey: 'nav.assets', module: 'asset_registry', order: 85, requiredPermission: 'asset.asset.read' },
  { path: '/entities', icon: Globe, labelKey: 'nav.entities', module: 'core', order: 88, requiredPermission: 'core.entity.read' },
  { path: '/users', icon: UserCog, labelKey: 'nav.accounts', module: 'core', order: 90, requiredPermission: 'core.users.read' },
  { path: '/support', icon: LifeBuoy, labelKey: 'nav.support', module: 'support', order: 92, requiredPermission: 'support.ticket.read' },
  { path: '/workflow', icon: GitBranch, labelKey: 'nav.workflow', module: 'workflow', order: 93, requiredPermission: 'workflow.definition.read' },
  { path: '/files', icon: FolderOpen, labelKey: 'nav.files', module: 'core', order: 95, requiredPermission: 'core.settings.manage' },
  { path: '/settings', icon: Settings, labelKey: 'nav.settings', module: 'core', order: 100 },
]

export function Sidebar({ collapsed, onToggle, onClose }: SidebarProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { hasPermission, hasAny } = usePermission()
  const { data: modules = [], isLoading: modulesLoading } = useModules()
  const enabledModules = new Set(modules.filter((m) => m.enabled).map((m) => m.slug))

  const filterByPermission = (items: NavItemDef[]) =>
    items.filter((item) => {
      if (item.module && item.module !== 'core' && modulesLoading) return false
      if (item.module && item.module !== 'core' && modules.length > 0 && !enabledModules.has(item.module)) return false
      if (item.requiredAnyPermissions?.length) return hasAny(item.requiredAnyPermissions)
      if (item.requiredPermission) return hasPermission(item.requiredPermission)
      return true
    })

  const sortedModuleItems = filterByPermission([...moduleNavItems]).sort((a, b) => a.order - b.order)
  const filteredAdminItems = filterByPermission([...adminNavItems]).sort((a, b) => a.order - b.order)

  const renderNavItem = (item: NavItemDef) => {
    const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
    const Icon = item.icon
    return (
      <button
        key={item.path}
        type="button"
        onClick={() => { navigate(item.path); onClose?.() }}
        onMouseEnter={() => { import('@/lib/routePrefetch').then(m => m.prefetchRoute(item.path)).catch(() => {}) }}
        onFocus={() => { import('@/lib/routePrefetch').then(m => m.prefetchRoute(item.path)).catch(() => {}) }}
        className={cn(
          'nav-item',
          isActive && 'is-active',
          collapsed && 'is-collapsed',
        )}
        title={collapsed ? t(item.labelKey) : undefined}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon className="nav-item-ico" aria-hidden="true" />
        {!collapsed && (
          <>
            <span className="nav-item-label">{t(item.labelKey)}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="nav-item-badge">{item.badge > 99 ? '99+' : item.badge}</span>
            )}
          </>
        )}
      </button>
    )
  }

  return (
    <aside
      data-tour="sidebar"
      className={cn(
        'flex h-full flex-col border-r border-border bg-chrome',
        'transition-[width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
        collapsed ? 'w-14' : 'w-[200px]',
      )}
    >
      <div className="h-1.5 shrink-0" />

      <nav
        className="flex-1 px-1.5 py-1 overflow-y-auto overflow-x-hidden flex flex-col gap-0.5"
        role="navigation"
        aria-label={t('nav.section_label')}
      >
        {!collapsed && (
          <span className="nav-section-label">{t('nav.section_label')}</span>
        )}
        {sortedModuleItems.map(renderNavItem)}
      </nav>

      <div className="border-t border-border px-1.5 py-1.5 shrink-0 flex flex-col gap-0.5">
        {!collapsed && filteredAdminItems.length > 0 && (
          <span className="nav-section-label">{t('nav.admin_section_label', 'Administration')}</span>
        )}
        {filteredAdminItems.map(renderNavItem)}

        <button
          type="button"
          onClick={onToggle}
          className={cn('nav-item', collapsed && 'is-collapsed')}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
        >
          {collapsed
            ? <PanelLeft className="nav-item-ico" aria-hidden="true" />
            : <PanelLeftClose className="nav-item-ico" aria-hidden="true" />}
          {!collapsed && <span className="nav-item-label">{t('nav.collapse')}</span>}
        </button>
      </div>
    </aside>
  )
}
