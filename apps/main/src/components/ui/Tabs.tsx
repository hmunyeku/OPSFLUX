/**
 * Tabs — Pajamas-style tab bar + tab button.
 *
 * Centralized tab component for consistent styling across all modules.
 * Mobile-friendly: icons-only on narrow containers (container queries),
 * horizontal scroll when tabs overflow.
 *
 * Usage:
 *   <TabBar>
 *     <TabButton active icon={Shield} label="Securité" onClick={…} />
 *     <TabButton icon={Users} label="Utilisateurs" badge={5} onClick={…} />
 *   </TabBar>
 *
 * Or with items array:
 *   <TabBar
 *     items={[{ id: 'sec', label: 'Securité', icon: Shield }]}
 *     activeId="sec"
 *     onTabChange={(id) => setTab(id)}
 *   />
 *
 * For page-level navigation (pill style, not underline tabs):
 *   <PageNavBar
 *     items={[{ id: 'overview', label: 'Vue d\'ensemble', icon: LayoutDashboard }]}
 *     activeId="overview"
 *     onTabChange={(id) => setTab(id)}
 *   />
 */
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── TabBar (container) ─────────────────────────────────────── */

export interface TabBarItem<T extends string = string> {
  id: T
  label: string
  icon: LucideIcon
  badge?: number | string
  hidden?: boolean
}

interface TabBarProps<T extends string = string> {
  children?: React.ReactNode
  /** Declarative items mode — alternative to using TabButton children. */
  items?: TabBarItem<T>[]
  activeId?: T
  onTabChange?: (id: T) => void
  /** Extra CSS on the container */
  className?: string
  /** Variant: 'default' (border-bottom tabs), 'muted' (muted bg tabs) */
  variant?: 'default' | 'muted'
  /**
   * Optional content rendered on the FAR RIGHT of the tab bar row.
   * Used by pages to attach contextual controls aligned with the
   * current tab — typically the "Modifier le tableau de bord" button
   * when the active tab is the module dashboard. The slot is fully
   * controlled by the parent: pass `null` to hide it.
   */
  rightSlot?: React.ReactNode
}

export function TabBar<T extends string = string>({
  children,
  items,
  activeId,
  onTabChange,
  className,
  variant = 'default',
  rightSlot,
}: TabBarProps<T>) {
  return (
    <div
      className={cn(
        'gl-tab-bar',
        variant === 'muted' && 'bg-muted/30',
        // Spread tab buttons to the left, push the right slot to the
        // far end via flex justify-between. The first child is the
        // tabs container; the second (when present) is the right slot.
        rightSlot && 'justify-between',
        className,
      )}
    >
      {/* Tabs container — scrolls horizontally on narrow containers
          while the rightSlot stays anchored. @container enables child
          TabButtons to hide their labels below 380px using @[380px]:inline. */}
      <div className="@container flex items-center gap-1 min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {items
          ? items
              .filter((t) => !t.hidden)
              .map((item) => (
                <TabButton
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  active={activeId === item.id}
                  badge={item.badge}
                  onClick={() => onTabChange?.(item.id)}
                />
              ))
          : children}
      </div>
      {rightSlot && (
        <div className="flex items-center gap-1.5 shrink-0 pl-3">
          {rightSlot}
        </div>
      )}
    </div>
  )
}

/* ── TabButton ──────────────────────────────────────────────── */

interface TabButtonProps {
  icon: LucideIcon
  label: string
  active?: boolean
  badge?: number | string
  onClick?: () => void
  className?: string
}

export function TabButton({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
  className,
}: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'gl-tab-button',
        active ? 'gl-tab-active' : 'gl-tab-inactive',
        className,
      )}
    >
      <Icon size={13} className="shrink-0" />
      <span className="hidden @[380px]:inline">{label}</span>
      {badge !== undefined && badge !== 0 && (
        <span
          className={cn(
            'gl-tab-badge',
            active ? 'bg-primary/10 text-primary' : 'bg-accent text-muted-foreground',
          )}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

/* ── PageNavBar — pill/segment button nav for page-level tabs ── */
/**
 * PageNavBar replaces TabBar in main page content areas.
 * Renders as a pill/button-group rather than underline tabs.
 * Labels are hidden below 380px of the container width (container query).
 */

interface PageNavBarProps<T extends string = string> {
  items: TabBarItem<T>[]
  activeId?: T
  onTabChange?: (id: T) => void
  className?: string
  rightSlot?: React.ReactNode
}

export function PageNavBar<T extends string = string>({
  items,
  activeId,
  onTabChange,
  className,
  rightSlot,
}: PageNavBarProps<T>) {
  return (
    <div className={cn('@container gl-page-nav-bar', rightSlot && 'justify-between', className)}>
      <div className="flex items-center gap-1 min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {items
          .filter((t) => !t.hidden)
          .map((item) => {
            const Icon = item.icon
            const isActive = activeId === item.id
            return (
              <button
                key={item.id}
                onClick={() => onTabChange?.(item.id)}
                title={item.label}
                className={cn(
                  'gl-page-nav-btn',
                  isActive ? 'gl-page-nav-active' : 'gl-page-nav-inactive',
                )}
              >
                <Icon size={13} className="shrink-0" />
                <span className="hidden @[380px]:inline">{item.label}</span>
                {item.badge !== undefined && item.badge !== 0 && (
                  <span
                    className={cn(
                      'gl-tab-badge',
                      isActive ? 'bg-primary/10 text-primary' : 'bg-accent text-muted-foreground',
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
      </div>
      {rightSlot && (
        <div className="flex items-center gap-1.5 shrink-0 pl-3">
          {rightSlot}
        </div>
      )}
    </div>
  )
}

/* ── SubTabBar — smaller variant for nested/secondary tabs ─── */

export function SubTabBar<T extends string = string>({
  children,
  items,
  activeId,
  onTabChange,
  className,
  counts,
}: TabBarProps<T> & { counts?: Record<string, number> }) {
  return (
    <div className={cn('gl-subtab-bar', className)}>
      {items
        ? items
            .filter((t) => !t.hidden)
            .map((item) => {
              const count = counts?.[item.id]
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange?.(item.id)}
                  className={cn(
                    'gl-subtab-button',
                    activeId === item.id ? 'gl-subtab-active' : 'gl-subtab-inactive',
                  )}
                >
                  {item.label}
                  {count !== undefined && count > 0 && (
                    <span className="ml-1 sm:ml-1.5 text-[10px] bg-primary/15 text-primary rounded-full px-1.5">
                      {count}
                    </span>
                  )}
                </button>
              )
            })
        : children}
    </div>
  )
}
