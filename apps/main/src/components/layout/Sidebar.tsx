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
import {
  LayoutDashboard,
  Landmark,
  Building2,
  Globe,
  Settings,
  GitBranch,
  Users,
  UserCog,
  PanelLeftClose,
  PanelLeft,
  HelpCircle,
  ShieldCheck,
  FolderKanban,
  CalendarClock,
  Ship,
  FileText,
  Workflow,
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
}

// Core navigation items — sourced from module manifests
const moduleNavItems: NavItemDef[] = [
  { path: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard', module: 'dashboard', order: 10 },
  { path: '/tiers', icon: Building2, labelKey: 'nav.tiers', module: 'tiers', order: 30 },
  { path: '/conformite', icon: ShieldCheck, labelKey: 'nav.conformite', module: 'conformite', order: 35 },
  { path: '/projets', icon: FolderKanban, labelKey: 'nav.projets', module: 'projets', order: 38 },
  { path: '/planner', icon: CalendarClock, labelKey: 'nav.planner', module: 'planner', order: 39 },
  { path: '/paxlog', icon: Users, labelKey: 'nav.paxlog', module: 'paxlog', order: 40 },
  { path: '/travelwiz', icon: Ship, labelKey: 'nav.travelwiz', module: 'travelwiz', order: 42 },
  { path: '/report-editor', icon: FileText, labelKey: 'nav.report_editor', module: 'report-editor', order: 55 },
  { path: '/pid-pfd', icon: Workflow, labelKey: 'nav.pid_pfd', module: 'pid-pfd', order: 58 },
  { path: '/workflow', icon: GitBranch, labelKey: 'nav.workflow', module: 'workflow', order: 60 },
]

const adminNavItems: NavItemDef[] = [
  { path: '/assets', icon: Landmark, labelKey: 'nav.assets', module: 'asset-registry', order: 85 },
  { path: '/entities', icon: Globe, labelKey: 'nav.entities', module: 'core', order: 88, requiredPermission: 'admin.system' },
  { path: '/users', icon: UserCog, labelKey: 'nav.accounts', module: 'core', order: 90, requiredPermission: 'admin.users.read' },
  { path: '/settings', icon: Settings, labelKey: 'nav.settings', module: 'core', order: 100 },
]

export function Sidebar({ collapsed, onToggle, onClose }: SidebarProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()

  // Sort by order (stable for now, dynamic when registry is populated from API)
  const sortedModuleItems = [...moduleNavItems].sort((a, b) => a.order - b.order)

  const renderNavItem = (item: NavItemDef) => {
    const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
    const Icon = item.icon
    return (
      <button
        key={item.path}
        onClick={() => { navigate(item.path); onClose?.() }}
        className={cn(
          'group relative flex w-full items-center gap-2.5 rounded-lg h-8 text-sm transition-colors duration-150',
          isActive
            ? 'bg-primary/[0.16] text-foreground font-medium'
            : 'text-muted-foreground hover:bg-chrome-hover hover:text-foreground',
          collapsed ? 'justify-center px-0 w-8 mx-auto' : 'px-2',
        )}
        title={collapsed ? t(item.labelKey) : undefined}
      >
        {isActive && !collapsed && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary" />
        )}
        <Icon size={16} className="shrink-0" />
        {!collapsed && (
          <>
            <span className="truncate flex-1 text-left">{t(item.labelKey)}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="ml-auto h-4 min-w-[16px] flex items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground px-1">
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
        {adminNavItems.map(renderNavItem)}

        <button
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg h-8 text-sm text-muted-foreground hover:bg-chrome-hover hover:text-foreground transition-colors duration-150',
            collapsed ? 'justify-center px-0 w-8 mx-auto' : 'px-2',
          )}
          title={collapsed ? t('nav.help') : undefined}
        >
          <HelpCircle size={16} className="shrink-0" />
          {!collapsed && <span className="truncate">{t('nav.help')}</span>}
        </button>

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
