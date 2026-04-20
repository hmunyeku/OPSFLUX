/**
 * Sidebar — GitLab Pajamas-style navigation with dynamic module items.
 *
 * Collapsed: 48px (icons only). Expanded: 180px.
 * Background: --chrome.
 * Active item: bg-primary/[0.16] + left 3px accent.
 * Transition: width 200ms cubic-bezier(0.4, 0, 0.2, 1).
 *
 * Per docs spec (02_DESIGN_SYSTEM.md §4):
 * - Section label "Navigation" (expanded only)
 * - Nav items from registered modules (ordered, RBAC-filtered)
 * - Spacer
 * - Admin section: Settings + Help + Collapse toggle
 * - Badge support on each nav item
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

// ── Navigation registry ──────────────────────────────────────
// Modules register their nav items here. In a full implementation,
// this would come from ModuleRegistry manifests + RBAC filtering.
// For now, module manifests populate this at startup.

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

// Core navigation items — sourced from module manifests
// Each item requires at least one .read permission from its module to be visible.
const moduleNavItems: NavItemDef[] = [
  { path: '/home', icon: LayoutGrid, labelKey: 'nav.home', module: 'core', order: 5 },
  { path: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard', module: 'dashboard', order: 10, requiredPermission: 'dashboard.read' },
  { path: '/tiers', icon: Building2, labelKey: 'nav.tiers', module: 'tiers', order: 30, requiredPermission: 'tier.read' },
  { path: '/projets', icon: FolderKanban, labelKey: 'nav.projets', module: 'projets', order: 38, requiredPermission: 'project.read' },
  { path: '/planner', icon: CalendarClock, labelKey: 'nav.planner', module: 'planner', order: 39, requiredPermission: 'planner.activity.read' },
  { path: '/paxlog', icon: Users, labelKey: 'nav.paxlog', module: 'paxlog', order: 40, requiredAnyPermissions: ['paxlog.ads.read', 'paxlog.ads.create', 'paxlog.ads.approve', 'paxlog.avm.read', 'paxlog.avm.create', 'paxlog.avm.update', 'paxlog.avm.approve', 'paxlog.avm.complete', 'paxlog.profile.read', 'paxlog.compliance.read'] },
  { path: '/travelwiz', icon: Ship, labelKey: 'nav.travelwiz', module: 'travelwiz', order: 42, requiredPermission: 'travelwiz.voyage.read' },
  { path: '/packlog', icon: Package, labelKey: 'nav.packlog', module: 'packlog', order: 43, requiredPermission: 'packlog.cargo.read' },
  { path: '/imputations', icon: Coins, labelKey: 'nav.imputations', module: 'core', order: 44, requiredPermission: 'imputation.read' },
  { path: '/papyrus', icon: FileText, labelKey: 'nav.papyrus', module: 'papyrus', order: 55, requiredPermission: 'document.read' },
  { path: '/pid-pfd', icon: Workflow, labelKey: 'nav.pid_pfd', module: 'pid_pfd', order: 58, requiredPermission: 'pid.read' },
  { path: '/workflow', icon: GitBranch, labelKey: 'nav.workflow', module: 'workflow', order: 60, requiredPermission: 'workflow.definition.read' },
  { path: '/moc', icon: ClipboardList, labelKey: 'nav.moc', module: 'moc', order: 62, requiredPermission: 'moc.read' },
]

const adminNavItems: NavItemDef[] = [
  { path: '/conformite', icon: ShieldCheck, labelKey: 'nav.conformite', module: 'conformite', order: 82, requiredPermission: 'conformite.record.read' },
  { path: '/assets', icon: Landmark, labelKey: 'nav.assets', module: 'asset_registry', order: 85, requiredPermission: 'asset.read' },
  { path: '/entities', icon: Globe, labelKey: 'nav.entities', module: 'core', order: 88, requiredPermission: 'core.entity.read' },
  { path: '/users', icon: UserCog, labelKey: 'nav.accounts', module: 'core', order: 90, requiredPermission: 'core.users.read' },
  { path: '/support', icon: LifeBuoy, labelKey: 'nav.support', module: 'support', order: 92, requiredPermission: 'support.ticket.read' },
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

  // Filter items based on requiredPermission, then sort by order
  const filterByPermission = (items: NavItemDef[]) =>
    items.filter((item) => {
      // Prevent a first-paint flash of disabled modules before module state loads.
      if (item.module && item.module !== 'core' && modulesLoading) {
        return false
      }
      if (item.module && item.module !== 'core' && modules.length > 0 && !enabledModules.has(item.module)) {
        return false
      }
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
        onClick={() => { navigate(item.path); onClose?.() }}
        className={cn(
          'group relative flex w-full items-center gap-2.5 rounded-lg h-8 text-sm transition-all duration-200',
          // Active: gradient primary → highlight tint, subtle glow.
          // Hover: soft chrome bg, icon scales slightly, tint strip
          // slides in from the left.
          isActive
            ? 'bg-gradient-to-r from-primary/[0.18] to-[hsl(var(--highlight))]/[0.10] text-foreground font-medium shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.12)]'
            : 'text-muted-foreground hover:bg-chrome-hover hover:text-foreground',
          collapsed ? 'justify-center px-0 w-8 mx-auto' : 'px-2',
        )}
        title={collapsed ? t(item.labelKey) : undefined}
      >
        {/* Active accent strip — gradient so it aligns with the StatCard
            vocabulary. Slightly thicker than before for better read. */}
        {isActive && !collapsed && (
          <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-gradient-to-b from-primary to-[hsl(var(--highlight))]" />
        )}
        {/* Hover accent strip — fades in on non-active items so users
            get a consistent visual cue. */}
        {!isActive && !collapsed && (
          <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r-full bg-primary/0 group-hover:bg-primary/40 transition-colors duration-200" />
        )}
        <Icon
          size={16}
          className={cn(
            'shrink-0 transition-transform duration-200',
            isActive ? 'text-primary' : 'group-hover:scale-110',
          )}
        />
        {!collapsed && (
          <>
            <span className="truncate flex-1 text-left">{t(item.labelKey)}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="ml-auto h-4 min-w-[16px] flex items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground px-1 shadow-sm">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
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
        collapsed ? 'w-12' : 'w-[180px]',
      )}
    >
      {/* Top spacing */}
      <div className="h-1.5 shrink-0" />

      {/* Navigation section */}
      <nav className="flex-1 space-y-0.5 px-1.5 py-1 overflow-y-auto overflow-x-hidden" role="navigation" aria-label={t('nav.section_label')}>
        {/* Section label (expanded only) */}
        {!collapsed && (
          <div className="px-1.5 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {t('nav.section_label')}
            </span>
          </div>
        )}

        {sortedModuleItems.map(renderNavItem)}
      </nav>

      {/* Bottom section: admin + help + network status + collapse toggle */}
      <div className="border-t border-border px-1.5 py-1.5 space-y-0.5 shrink-0">
        {filteredAdminItems.map(renderNavItem)}

        <button
          onClick={onToggle}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg h-8 text-sm text-muted-foreground hover:bg-chrome-hover hover:text-foreground transition-colors duration-150',
            collapsed ? 'justify-center px-0 w-8 mx-auto' : 'px-2',
          )}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
        >
          {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span className="truncate">{t('nav.collapse')}</span>}
        </button>
      </div>
    </aside>
  )
}
