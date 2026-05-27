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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
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
  const tabNodes = items
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
    : children

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
      <ScrollableTabs>{tabNodes}</ScrollableTabs>
      {rightSlot && (
        <div className="flex items-center gap-1.5 shrink-0 pl-3">
          {rightSlot}
        </div>
      )}
    </div>
  )
}

/* ── TabButton ──────────────────────────────────────────────── */

function ScrollableTabs({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft < max - 1)
  }, [])

  useEffect(() => {
    updateScrollState()
    const el = ref.current
    if (!el) return
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(el)
    Array.from(el.children).forEach((child) => resizeObserver.observe(child))
    el.addEventListener('scroll', updateScrollState, { passive: true })
    return () => {
      resizeObserver.disconnect()
      el.removeEventListener('scroll', updateScrollState)
    }
  }, [children, updateScrollState])

  const scrollByPage = useCallback((direction: -1 | 1) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.65), behavior: 'smooth' })
  }, [])

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
    const before = el.scrollLeft
    el.scrollLeft += event.deltaY
    if (el.scrollLeft !== before) event.preventDefault()
  }, [])

  const showControls = canScrollLeft || canScrollRight

  return (
    <div className="@container relative flex-1 min-w-0">
      {showControls && (
        <button
          type="button"
          className="absolute left-0 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/95 text-muted-foreground shadow-sm hover:text-foreground disabled:pointer-events-none disabled:opacity-35 sm:flex"
          onClick={() => scrollByPage(-1)}
          disabled={!canScrollLeft}
          aria-label="Onglets précédents"
        >
          <ChevronLeft size={14} />
        </button>
      )}
      <div
        ref={ref}
        onWheel={handleWheel}
        className={cn(
          'flex min-w-0 items-center gap-1 overflow-x-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
          showControls && 'sm:px-8',
        )}
      >
        {children}
      </div>
      {showControls && (
        <button
          type="button"
          className="absolute right-0 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/95 text-muted-foreground shadow-sm hover:text-foreground disabled:pointer-events-none disabled:opacity-35 sm:flex"
          onClick={() => scrollByPage(1)}
          disabled={!canScrollRight}
          aria-label="Onglets suivants"
        >
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  )
}

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
      <StableTabBadge badge={badge} active={active} />
    </button>
  )
}

function StableTabBadge({ badge, active }: { badge?: number | string; active?: boolean }) {
  const [stableBadge, setStableBadge] = useState<number | string | undefined>(badge)

  useEffect(() => {
    if (badge !== undefined) setStableBadge(badge)
  }, [badge])

  if (stableBadge === undefined || stableBadge === 0) return null

  return (
    <span
      className={cn(
        'gl-tab-badge',
        active ? 'bg-primary/15 text-primary' : 'bg-accent text-muted-foreground',
      )}
    >
      {stableBadge}
    </span>
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
  const tabNodes = items
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
          <StableTabBadge badge={item.badge} active={isActive} />
        </button>
      )
    })

  return (
    <div className={cn('@container gl-page-nav-bar', rightSlot && 'justify-between', className)}>
      <ScrollableTabs>{tabNodes}</ScrollableTabs>
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
  const tabNodes = items
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
    : children

  return (
    <div className={cn('gl-subtab-bar', className)}>
      <ScrollableTabs>{tabNodes}</ScrollableTabs>
    </div>
  )
}
