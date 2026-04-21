/**
 * DynamicPanel — Pajamas Zone 4 (resizable side panel / full-width mode).
 *
 * Modes:
 *   - docked: narrow side panel (left or right, user-chosen, persisted).
 *     Default 360px. Resizable via drag handle. Min 280px, Max 600px.
 *   - full: replaces the main content area — the list hides and the panel
 *     occupies the full width. Shows navigation bar (back to list, prev, next).
 *
 * Dockable left/right — user preference persisted in localStorage.
 * Item-level navigation (prev/next) in both modes.
 *
 * Pajamas compliance (audited 2025):
 * - 8px border-radius on all controls
 * - 32px input/button height
 * - 400 font-weight on buttons, 600 on labels
 * - 8px spacing base unit
 * - Inset box-shadow for input borders
 */
import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Check, Pencil, ChevronRight, ChevronLeft, ChevronDown,
  ChevronsLeft, ChevronsRight,
  ExternalLink, Pin, PinOff, Maximize2, Minimize2,
  PanelLeft, PanelRight, ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import type { DetachedPanel } from '@/stores/uiStore'
import { ResponsiveActionBar, type ActionItem } from '@/components/shared/ResponsiveActionBar'
import { safeLocal } from '@/lib/safeStorage'

// Re-export so consumers that already pull DynamicPanelShell from this file
// can also pick up the typed action item shape without a second import.
export type { ActionItem } from '@/components/shared/ResponsiveActionBar'

/**
 * Context: true when rendering inside a FloatingPanel.
 * DynamicPanelShell uses this to strip its own chrome (header, resize, border)
 * to avoid duplicate UI when the floating panel already provides those.
 */
const FloatingPanelContext = createContext(false)
export const useIsInsideFloatingPanel = () => useContext(FloatingPanelContext)

const STORAGE_KEY = 'opsflux:dynamic-panel-width'
const MIN_WIDTH = 280
// Dynamic limits based on viewport — design for large screens first
const MAX_WIDTH = Math.max(800, Math.floor(window.innerWidth * 0.65))
// Default = 50% of viewport (≈ half the work area)
const DEFAULT_WIDTH = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(window.innerWidth * 0.5)))

function getStoredWidth(): number {
  try {
    const stored = safeLocal.getItem(STORAGE_KEY)
    if (stored) {
      const w = parseInt(stored, 10)
      if (!isNaN(w)) return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w))
    }
  } catch {}
  return DEFAULT_WIDTH
}

/* ─── Shell ─────────────────────────────────────────────────── */

interface DynamicPanelShellProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  children: React.ReactNode
  /**
   * Compact action buttons rendered in a sticky toolbar below the header.
   *
   * LEGACY: opaque ReactNode fragment. Kept for backwards compat with
   * existing detail panels — new code should prefer `actionItems` which
   * gets responsive overflow (priority-based kebab menu) out of the box.
   */
  actions?: React.ReactNode
  /**
   * Responsive action list. When provided, takes precedence over `actions`
   * and is rendered through `ResponsiveActionBar` so buttons that don't
   * fit horizontally collapse into an overflow menu instead of being
   * clipped off-screen on narrow viewports.
   */
  actionItems?: ActionItem[]
  /**
   * Confirm dialog resolver for `actionItems` entries that carry a
   * `confirm` config. Typically wired to `useConfirm()`. Only required if
   * any of the provided `actionItems` have a `confirm` block.
   */
  onActionConfirm?: (
    cfg: NonNullable<ActionItem['confirm']>,
  ) => Promise<boolean>
  /** Extra content rendered in the header bar (right side, before detach/close buttons). */
  headerRight?: React.ReactNode
  /**
   * Inline mode — renders a lightweight panel without uiStore integration.
   * Use for embedded detail panels (e.g. settings inline detail, split pane).
   * Requires `onClose` prop.
   */
  inline?: boolean
  /** Close handler for inline mode. */
  onClose?: () => void
  /** Width in inline mode (default 360). */
  inlineWidth?: number | string
  /** Extra class names applied to the outermost container. */
  className?: string
}

export function DynamicPanelShell({
  title,
  subtitle,
  icon,
  children,
  actions,
  actionItems,
  onActionConfirm,
  headerRight,
  inline,
  onClose,
  inlineWidth = 360,
  className,
}: DynamicPanelShellProps) {
  const isFloating = useIsInsideFloatingPanel()

  // Resolve the actions region once so the three render branches below stay
  // identical. `actionItems` (typed, responsive) wins over legacy `actions`
  // (opaque ReactNode) when both are provided.
  const actionsNode =
    actionItems && actionItems.length > 0 ? (
      <ResponsiveActionBar items={actionItems} onConfirm={onActionConfirm} />
    ) : actions ? (
      <>{actions}</>
    ) : null

  // ── INLINE MODE — lightweight embedded panel ──
  if (inline) {
    return (
      <div
        className={cn(
          'shrink-0 border-l border-border flex flex-col bg-background overflow-hidden',
          className,
        )}
        style={{ width: typeof inlineWidth === 'number' ? `${inlineWidth}px` : inlineWidth }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 h-10 px-3 border-b border-border shrink-0">
          {icon && <span className="shrink-0">{icon}</span>}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate leading-tight">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground truncate leading-tight">{subtitle}</p>}
          </div>
          {/* Inline actions in header (same pattern as docked mode) */}
          {actionsNode && (
            <>
              <div className="w-px h-4 bg-border/60 shrink-0" />
              <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                {actionsNode}
              </div>
            </>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="gl-button-sm gl-button-default flex h-6 w-6 !p-0 shrink-0"
              aria-label="Fermer"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto @container">
          {children}
        </div>
      </div>
    )
  }

  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const detachDynamicPanel = useUIStore((s) => s.detachDynamicPanel)

  // Panel layout state
  const mode = useUIStore((s) => s.dynamicPanelMode)
  const dockSide = useUIStore((s) => s.dynamicPanelDockSide)
  const toggleMode = useUIStore((s) => s.toggleDynamicPanelMode)
  const toggleDock = useUIStore((s) => s.toggleDockSide)
  const setMode = useUIStore((s) => s.setDynamicPanelMode)

  // Auto full-screen on mobile (< 768px)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches && mode !== 'full') setMode('full')
    }
    handler(mq)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode, setMode])

  // Navigation
  const navItems = useUIStore((s) => s.dynamicPanelNavItems)
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const navigateToItem = useUIStore((s) => s.navigateToItem)

  const currentId = dynamicPanel && 'id' in dynamicPanel ? (dynamicPanel as { id: string }).id : null
  const currentIndex = currentId ? navItems.indexOf(currentId) : -1
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < navItems.length - 1
  const canNavigate = currentId !== null && navItems.length > 1

  const [width, setWidth] = useState(getStoredWidth)
  const isDragging = useRef(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const startX = e.clientX
    const startWidth = width
    const isLeftDock = dockSide === 'left'

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      // Left dock: drag right = increase; Right dock: drag left = increase
      const delta = isLeftDock
        ? ev.clientX - startX
        : startX - ev.clientX
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta))
      setWidth(newWidth)
    }

    const onMouseUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [width, dockSide])

  useEffect(() => {
    safeLocal.setItem(STORAGE_KEY, String(width))
  }, [width])

  // Shared button style for header controls
  const hdrBtn = 'gl-button-sm gl-button-default flex h-6 w-6 !p-0 shrink-0'
  const navBtn = 'h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors shrink-0'

  // ── When inside a floating panel, skip all shell chrome ──
  if (isFloating) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {actionsNode && (
          <div className="flex items-center justify-end gap-2 border-b border-border px-4 py-1.5 shrink-0 bg-background-subtle min-w-0">
            {actionsNode}
          </div>
        )}
        <div className="flex-1 overflow-y-auto min-h-0">
          {children}
        </div>
      </div>
    )
  }

  // ── FULL MODE — replaces the main content area ──
  if (mode === 'full') {
    return (
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        {/* Navigation bar */}
        <div className="flex items-center gap-2 h-9 border-b border-border px-4 shrink-0 bg-background-subtle">
          <button
            onClick={() => {
              // On mobile (< md), close panel entirely; on desktop, go back to docked mode
              if (window.innerWidth < 768) closeDynamicPanel()
              else setMode('docked')
            }}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <ArrowLeft size={12} />
            Retour à la liste
          </button>

          {canNavigate && (
            <div className="flex items-center gap-0.5 ml-auto">
              <span className="text-xs text-muted-foreground mr-2 tabular-nums">
                {currentIndex + 1} / {navItems.length}
              </span>
              <button
                disabled={!hasPrev}
                onClick={() => navigateToItem(navItems[0])}
                className={navBtn}
                title="Premier"
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                disabled={!hasPrev}
                onClick={() => navigateToItem(navItems[currentIndex - 1])}
                className={navBtn}
                title="Précédent"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                disabled={!hasNext}
                onClick={() => navigateToItem(navItems[currentIndex + 1])}
                className={navBtn}
                title="Suivant"
              >
                <ChevronRight size={14} />
              </button>
              <button
                disabled={!hasNext}
                onClick={() => navigateToItem(navItems[navItems.length - 1])}
                className={navBtn}
                title="Dernier"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          )}

          {!canNavigate && <div className="ml-auto" />}

          <div className="flex items-center gap-0.5 ml-2 pl-2 border-l border-border/60">
            <button onClick={toggleMode} className={hdrBtn} title="Réduire en panneau latéral">
              <Minimize2 size={12} />
            </button>
            <button onClick={detachDynamicPanel} className={hdrBtn} title="Détacher en modal flottant">
              <ExternalLink size={12} />
            </button>
            <button onClick={closeDynamicPanel} className={hdrBtn} aria-label="Fermer">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Header */}
        <div className="flex h-10 items-center gap-2 border-b border-border px-4 shrink-0">
          {icon && <span className="shrink-0">{icon}</span>}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate leading-tight">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground truncate leading-tight">{subtitle}</p>}
          </div>
        </div>

        {/* Actions toolbar
            Desktop: rendered as a slim row UNDER the header (existing
            behaviour preserved by `hidden sm:flex`).
            Mobile: hidden here — instead the same actions are rendered
            as a sticky bottom bar BELOW the scroll area so users don't
            have to scroll a long form to reach the Save / Cancel
            buttons. Both layouts share the same `actionsNode` so the
            button labels stay consistent. */}
        {actionsNode && (
          <div className="hidden sm:flex items-center justify-end gap-2 border-b border-border px-4 py-1.5 shrink-0 bg-background-subtle min-w-0">
            {actionsNode}
          </div>
        )}

        {/* Content — full-width scroll container; the inner
            `PanelContentLayout` (used by detail panels) handles its own
            max-width cap so we don't need to clamp here. Removing this
            outer wrapper unlocks the full main-area width on wide
            monitors.
            Bottom padding on mobile reserves space for the sticky
            action bar so the last form field stays scrollable above
            the buttons. */}
        <div className={cn(
          'flex-1 overflow-y-auto @container',
          actionsNode && 'pb-16 sm:pb-0',
        )}>
          {children}
        </div>

        {/* Mobile sticky bottom action bar — only renders on < sm */}
        {actionsNode && (
          <div
            className="sm:hidden flex items-center justify-end gap-2 border-t border-border px-3 py-2 shrink-0 bg-background"
            style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
          >
            {actionsNode}
          </div>
        )}
      </div>
    )
  }

  // ── DOCKED MODE — side panel (left or right) ──
  const isLeft = dockSide === 'left'

  return (
    <aside
      className={cn(
        'flex-shrink-0 flex overflow-hidden',
        isLeft ? 'border-r border-border order-first' : 'border-l border-border',
      )}
      style={{ width: `${width}px` }}
    >
      {/* Drag handle — on the inner edge */}
      {!isLeft && (
        <div
          className="w-1 flex-shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
          onMouseDown={onMouseDown}
          title="Redimensionner"
        />
      )}

      {/* Panel body */}
      <div className="flex flex-col flex-1 min-w-0 bg-background overflow-hidden">
        {/* Header — 40px, Pajamas style */}
        <div className="flex h-10 items-center gap-1.5 border-b border-border px-3 shrink-0">
          {icon && <span className="shrink-0">{icon}</span>}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate leading-tight">{title}</h2>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate leading-tight">{subtitle}</p>
            )}
          </div>

          {/* Nav arrows (compact, only for detail views with items) */}
          {canNavigate && (
            <div className="flex items-center gap-0 shrink-0">
              <button
                disabled={!hasPrev}
                onClick={() => navigateToItem(navItems[currentIndex - 1])}
                className={navBtn}
                title="Précédent"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                disabled={!hasNext}
                onClick={() => navigateToItem(navItems[currentIndex + 1])}
                className={navBtn}
                title="Suivant"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}

          {/* Inline actions (e.g. Désactiver) — embedded in header for docked mode */}
          {actionsNode && (
            <>
              <div className="w-px h-4 bg-border/60 shrink-0" />
              <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                {actionsNode}
              </div>
            </>
          )}

          {/* headerRight — custom content before panel controls */}
          {headerRight}

          {/* Dock side toggle */}
          <button
            onClick={toggleDock}
            className={hdrBtn}
            title={isLeft ? 'Déplacer à droite' : 'Déplacer à gauche'}
          >
            {isLeft ? <PanelRight size={12} /> : <PanelLeft size={12} />}
          </button>

          {/* Expand to full */}
          <button onClick={toggleMode} className={hdrBtn} title="Agrandir en pleine largeur">
            <Maximize2 size={12} />
          </button>

          {/* Detach */}
          <button onClick={detachDynamicPanel} className={hdrBtn} title="Détacher en modal flottant">
            <ExternalLink size={12} />
          </button>

          {/* Close */}
          <button onClick={closeDynamicPanel} className={hdrBtn} aria-label="Fermer le panneau">
            <X size={14} />
          </button>
        </div>

        {/* Scrollable content (container query scope) */}
        <div className="flex-1 overflow-y-auto @container">
          {children}
        </div>
      </div>

      {/* Drag handle on right edge for left dock */}
      {isLeft && (
        <div
          className="w-1 flex-shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
          onMouseDown={onMouseDown}
          title="Redimensionner"
        />
      )}
    </aside>
  )
}

/* ─── Form Grid — responsive layout ─────────────────────────── */

export function FormGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid gap-x-4 gap-y-4 grid-cols-1',
        // Container-query responsive: 2 cols at 500px, 3 at 900px
        '@[500px]:grid-cols-2',
        '@[900px]:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  )
}

/* ─── Section Columns — arranges sections side-by-side on wide screens ── */

/**
 * Splits children into 2 columns on wide panels (full mode).
 * In docked mode (narrow), stacks vertically.
 *
 * Each direct child should be wrapped in a `<div className="@container space-y-5">`
 * so that nested container queries (FormGrid, DetailFieldGrid) respond
 * to the actual column width, not the outer panel width.
 */
export function SectionColumns({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        // UX request: NEVER split sections into side-by-side columns.
        // Each section should be a single column taking full panel width,
        // with its internal DetailFieldGrid providing up to 2-col layout.
        // This keeps max 2 data columns total (was 4 before: 2 side-sections
        // × 2 fields each).
        //
        // gap-y-8 (was 5): sections need proper breathing room so each
        // group of fields reads as its own thing rather than running
        // into the next section.
        'grid gap-y-8 grid-cols-1',
        className,
      )}
    >
      {children}
    </div>
  )
}

/* ─── Detail Field Grid — arranges detail rows in 2 columns on wide screens ── */

/**
 * Use inside a FormSection in detail panels to arrange InlineEditableRow /
 * ReadOnlyRow items in a 2-column grid when space allows.
 */
export function DetailFieldGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid gap-x-10 gap-y-0 grid-cols-1',
        // 2 cols once the container is at least 700px wide. Each field
        // row has a 160px label + ~150px min value + 40px gap, so two
        // columns need ≥680px to sit side-by-side without cramping the
        // label into ellipsis. Below that we stack single-column which
        // is more readable on narrow detail panels.
        '@[700px]:grid-cols-2',
        className,
      )}
    >
      {children}
    </div>
  )
}

/* ─── Panel Content Layout — responsive wrapper for all panel content ── */

/**
 * Replaces `<div className="p-4 space-y-5">` inside DynamicPanelShell.
 * On wide panels (full mode), increases padding, caps max-width and centers.
 */
export function PanelContentLayout({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'p-4 space-y-5',
        '@[800px]:px-8 @[800px]:py-6',
        // Wider cap on big screens — readable line length is preserved by
        // the per-section grids (SectionColumns / DetailFieldGrid) which
        // split into 2 columns once the container is wide enough. The cap
        // only kicks in around ~2000px so detail panels in full mode use
        // the full main area on typical 1440-1920px monitors.
        '@[1200px]:max-w-[1800px] @[1200px]:mx-auto',
        className,
      )}
    >
      {children}
    </div>
  )
}

/* ─── Form Section — groups related fields, optionally collapsible ── */

export function FormSection({
  title,
  children,
  className,
  collapsible = false,
  defaultExpanded = true,
  storageKey,
  id,
  headerExtra,
}: {
  title?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Enable collapse/expand toggle on the section header */
  collapsible?: boolean
  /** Whether collapsed by default (only when collapsible=true) */
  defaultExpanded?: boolean
  /** localStorage key for persisting expand/collapse state per section */
  storageKey?: string
  /** Unique section ID (used for localStorage persistence) */
  id?: string
  /** Extra content rendered inline at the end of the section header */
  headerExtra?: React.ReactNode
}) {
  // Restore persisted state
  const resolvedId = id || (typeof title === 'string' ? title : '') || ''
  const initial = (() => {
    if (!collapsible) return true
    if (storageKey && resolvedId) {
      try {
        const stored = safeLocal.getItem(storageKey)
        if (stored) {
          const map = JSON.parse(stored) as Record<string, boolean>
          if (resolvedId in map) return map[resolvedId]
        }
      } catch { /* ignore */ }
    }
    return defaultExpanded
  })()

  const [expanded, setExpanded] = useState(initial)

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev
      if (storageKey && resolvedId) {
        try {
          const stored = safeLocal.getItem(storageKey)
          const map = stored ? (JSON.parse(stored) as Record<string, boolean>) : {}
          map[resolvedId] = next
          safeLocal.setItem(storageKey, JSON.stringify(map))
        } catch { /* ignore */ }
      }
      return next
    })
  }, [storageKey, resolvedId])

  return (
    <fieldset className={cn('space-y-4', className)}>
      {(title || headerExtra) && (
        collapsible ? (
          <div className="flex items-center gap-1.5 w-full">
            <button
              type="button"
              onClick={toggle}
              className="flex items-center gap-1.5 flex-1 text-left group cursor-pointer select-none"
            >
              <ChevronRight
                size={13}
                className={cn(
                  'shrink-0 text-muted-foreground transition-transform duration-200',
                  expanded && 'rotate-90',
                )}
              />
              <legend className="text-sm font-semibold text-foreground">
                {title}
              </legend>
            </button>
            {headerExtra && <span className="ml-auto">{headerExtra}</span>}
          </div>
        ) : (
          <div className="flex items-center gap-2 pb-2">
            <legend className="text-sm font-semibold text-foreground flex-1">
              {title}
            </legend>
            {headerExtra && <span className="ml-auto">{headerExtra}</span>}
          </div>
        )
      )}
      {/* Content with animated expand/collapse */}
      {collapsible ? (
        <div
          className={cn(
            'overflow-hidden transition-all duration-200 ease-in-out',
            expanded ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0',
          )}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </fieldset>
  )
}

/* ─── Form Field ─────────────────────────────────────────────── */

export function DynamicPanelField({
  label,
  children,
  required,
  span,
}: {
  label: string
  children: React.ReactNode
  required?: boolean
  span?: 'full'
}) {
  // Generate a stable id pair (label + control) so every field has proper
  // aria-labelledby and htmlFor, fixing the a11y "form field without label"
  // and "form field without id/name" warnings.
  const labelId = useId()
  const controlId = useId()

  // Derive a machine-friendly name from the label for autocomplete support
  const fieldName = label
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  // Inject id + name + aria-labelledby into the single child input if possible
  const enhancedChild = (() => {
    if (!React.isValidElement(children)) return children
    const element = children as React.ReactElement<Record<string, unknown>>
    const existingProps = element.props || {}
    return React.cloneElement(element, {
      id: (existingProps.id as string) || controlId,
      name: (existingProps.name as string) || fieldName,
      'aria-labelledby': labelId,
    })
  })()

  return (
    <div className={cn(span === 'full' && 'col-span-full')}>
      <label id={labelId} htmlFor={controlId} className="gl-label-sm">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {enhancedChild}
    </div>
  )
}

/* ─── Shared input class (for inline usage) ──────────────────── */

export const panelInputClass = 'gl-form-input'

/* ─── Detail components ──────────────────────────────────────── */

export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground font-medium w-40 shrink-0 truncate" title={label}>{label}</span>
      <span className="text-sm text-foreground flex-1 min-w-0">{value}</span>
    </div>
  )
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex items-center gap-3 pt-3 pb-2 mt-2 first:mt-0">
      {/* Left accent strip — same gradient vocabulary as the sidebar
          active indicator, giving sections a clear anchor without
          stealing visual weight. */}
      <span
        aria-hidden="true"
        className="inline-block h-4 w-[3px] rounded-full bg-gradient-to-b from-primary to-highlight"
      />
      <span className="text-[13px] font-semibold font-display tracking-tight text-foreground">
        {children}
      </span>
      <span aria-hidden="true" className="flex-1 h-px bg-gradient-to-r from-border/60 to-transparent" />
    </div>
  )
}

/* ─── Action button primitives ────────────────────────────────── */

export function PanelActionButton({
  children,
  onClick,
  variant = 'default',
  disabled,
  icon,
  type,
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'danger'
  disabled?: boolean
  icon?: React.ReactNode
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type ?? 'button'}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'gl-button-sm',
        variant === 'primary' && 'gl-button-confirm',
        variant === 'danger' && 'gl-button-danger',
        variant === 'default' && 'gl-button-default',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

/* ─── Danger Confirm Button (action → confirmation inline) ────── */

/**
 * Two-step inline danger button: first click shows "Confirmer ?",
 * second click executes the action. Auto-resets after timeout.
 * No modal — the button transforms in place (Pajamas pattern).
 */
export function DangerConfirmButton({
  children,
  onConfirm,
  confirmLabel = 'Confirmer ?',
  icon,
  disabled,
  timeout = 3000,
}: {
  children: React.ReactNode
  onConfirm: () => void
  confirmLabel?: string
  icon?: React.ReactNode
  disabled?: boolean
  /** Auto-reset delay in ms (default 3s) */
  timeout?: number
}) {
  const [confirming, setConfirming] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClick = useCallback(() => {
    if (confirming) {
      // Second click → execute
      if (timerRef.current) clearTimeout(timerRef.current)
      setConfirming(false)
      onConfirm()
    } else {
      // First click → enter confirmation state
      setConfirming(true)
      timerRef.current = setTimeout(() => setConfirming(false), timeout)
    }
  }, [confirming, onConfirm, timeout])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'gl-button-sm transition-all duration-200',
        confirming
          ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse'
          : 'gl-button-danger',
      )}
    >
      {icon}
      {confirming ? confirmLabel : children}
    </button>
  )
}

/* ─── Inline Editable Row ─────────────────────────────────────── */

export function InlineEditableRow({
  label,
  value,
  displayValue,
  onSave,
  type = 'text',
  disabled,
  suffix,
}: {
  label: string
  value: string
  /** Optional formatted label shown in read mode (e.g. resolved dictionary label). */
  displayValue?: string
  onSave: (newValue: string) => void
  type?: 'text' | 'email' | 'tel' | 'date' | 'number'
  disabled?: boolean
  /** Optional suffix displayed after the value in read mode (e.g. "XAF"). */
  suffix?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const startEdit = useCallback(() => {
    if (disabled) return
    setDraft(value)
    setEditing(true)
  }, [value, disabled])

  const commit = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed !== value) {
      onSave(trimmed)
    }
    setEditing(false)
  }, [draft, value, onSave])

  const cancel = useCallback(() => {
    setDraft(value)
    setEditing(false)
  }, [value])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') cancel()
  }, [commit, cancel])

  if (editing) {
    return (
      <div className="flex items-center gap-3 py-1.5 border-b border-border/50">
        <span className="text-sm text-muted-foreground font-medium w-40 shrink-0 truncate" title={label}>{label}</span>
        <div className="flex-1 flex items-center gap-1.5">
          <input
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            autoFocus
            className="gl-form-input h-7 text-sm"
          />
          <button
            onClick={commit}
            className="gl-button gl-button-sm gl-button-confirm shrink-0 w-7 flex text-success dark:hover:bg-green-900/20"
          >
            <Check size={14} />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); cancel() }}
            className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "group flex items-baseline gap-4 py-2 border-b border-border/50 last:border-0 rounded-lg -mx-2 px-2 transition-colors",
        !disabled && "hover:bg-accent/50 cursor-pointer",
      )}
      onDoubleClick={startEdit}
      title={disabled ? undefined : "Double-cliquer pour modifier"}
    >
      <span className="text-sm text-muted-foreground font-medium w-40 shrink-0 truncate" title={label}>{label}</span>
      <span className="text-sm text-foreground flex-1 min-w-0 break-words">{displayValue || value || '—'}{suffix && value ? ` ${suffix}` : ''}</span>
      {!disabled && <Pencil size={12} className="shrink-0 text-transparent group-hover:text-muted-foreground transition-colors" />}
    </div>
  )
}

/* ─── Inline Editable Select ──────────────────────────────────── */

export function InlineEditableSelect({
  label,
  value,
  displayValue,
  options,
  onSave,
  disabled,
}: {
  label: string
  value: string
  displayValue?: string
  options: { value: string; label: string }[]
  onSave: (newValue: string) => void
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const startEdit = useCallback(() => {
    if (disabled) return
    setDraft(value)
    setEditing(true)
  }, [value, disabled])

  const commit = useCallback((newVal: string) => {
    if (newVal !== value) {
      onSave(newVal)
    }
    setEditing(false)
  }, [value, onSave])

  if (editing && !disabled) {
    return (
      <div className="flex items-center gap-3 py-1.5 border-b border-border/50">
        <span className="text-sm text-muted-foreground font-medium w-40 shrink-0 truncate" title={label}>{label}</span>
        <div className="flex-1">
          <select
            value={draft}
            onChange={(e) => { setDraft(e.target.value); commit(e.target.value) }}
            onBlur={() => setEditing(false)}
            autoFocus
            className="gl-form-select h-7 text-sm"
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group flex items-baseline gap-4 py-2 border-b border-border/50 last:border-0 rounded-lg -mx-2 px-2 transition-colors',
        !disabled && 'hover:bg-accent/50 cursor-pointer',
      )}
      onDoubleClick={startEdit}
      title={disabled ? undefined : 'Double-cliquer pour modifier'}
    >
      <span className="text-sm text-muted-foreground font-medium w-40 shrink-0 truncate" title={label}>{label}</span>
      <span className="text-sm text-foreground flex-1 min-w-0 break-words">{displayValue || value || '—'}</span>
      {!disabled && <Pencil size={12} className="shrink-0 text-transparent group-hover:text-muted-foreground transition-colors" />}
    </div>
  )
}

/* ─── Inline Editable Combobox (searchable autocomplete for >5 options) ── */

export function InlineEditableCombobox({
  label,
  value,
  options,
  onSave,
  placeholder,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onSave: (newValue: string) => void
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const displayLabel = useMemo(() => options.find((o) => o.value === value)?.label ?? value, [options, value])

  const filtered = useMemo(() => {
    if (!query) return options
    const q = query.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => { setHighlightIdx(0) }, [filtered.length])

  useEffect(() => {
    if (!editing || !listRef.current) return
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx, editing])

  useEffect(() => {
    if (!editing) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditing(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [editing])

  const startEdit = useCallback(() => {
    setQuery('')
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  const handleSelect = useCallback((opt: { value: string }) => {
    if (opt.value !== value) onSave(opt.value)
    setEditing(false)
    setQuery('')
  }, [value, onSave])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlightIdx]) handleSelect(filtered[highlightIdx])
    } else if (e.key === 'Escape') {
      setEditing(false)
      setQuery('')
    }
  }, [filtered, highlightIdx, handleSelect])

  if (editing) {
    return (
      <div ref={containerRef} className="flex items-center gap-3 py-1.5 border-b border-border/50 relative">
        <span className="text-sm text-muted-foreground font-medium w-40 shrink-0 truncate" title={label}>{label}</span>
        <div className="flex-1 relative">
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              className="gl-form-input h-7 text-sm flex-1"
              placeholder={placeholder || 'Rechercher...'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <ChevronDown size={14} className="shrink-0 text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <ul ref={listRef} className="absolute z-50 mt-1 w-full max-h-52 overflow-auto rounded-lg border border-border bg-popover shadow-md py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted-foreground text-center">Aucun résultat</li>
            )}
            {filtered.map((o, idx) => (
              <li
                key={o.value}
                className={`px-3 py-1.5 text-sm cursor-pointer transition-colors ${idx === highlightIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'} ${value === o.value ? 'font-semibold' : ''}`}
                onMouseEnter={() => setHighlightIdx(idx)}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(o) }}
              >
                {o.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div
      className="group flex items-baseline gap-4 py-2 border-b border-border/50 last:border-0 rounded-lg hover:bg-accent/50 -mx-2 px-2 cursor-pointer transition-colors"
      onDoubleClick={startEdit}
      title="Double-cliquer pour modifier"
    >
      <span className="text-sm text-muted-foreground font-medium w-40 shrink-0 truncate" title={label}>{label}</span>
      <span className="text-sm text-foreground flex-1 min-w-0 break-words">{displayLabel || '—'}</span>
      <Pencil size={12} className="shrink-0 text-transparent group-hover:text-muted-foreground transition-colors" />
    </div>
  )
}


/* ─── Tag Selector (modern clickable tags instead of <select>) ──── */

export function TagSelector({ options, value, onChange }: {
  options: { value: string; label: string; icon?: React.ReactNode }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border',
            value === opt.value
              ? 'bg-primary/10 border-primary/40 text-primary shadow-sm'
              : 'bg-background border-border text-muted-foreground hover:bg-accent hover:text-foreground hover:border-border',
          )}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/* ─── Inline Editable Tags (for detail panels) ──────────────────── */

export function InlineEditableTags({
  label,
  value,
  options,
  onSave,
  disabled,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onSave: (newValue: string) => void
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const displayLabel = options.find((o) => o.value === value)?.label || value || '—'

  if (editing && !disabled) {
    return (
      <div className="flex items-start gap-3 py-1.5 border-b border-border/50">
        <span className="text-sm text-muted-foreground w-28 shrink-0 pt-1.5 truncate" title={label}>{label}</span>
        <div className="flex-1 flex flex-wrap gap-1.5">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onSave(opt.value); setEditing(false) }}
              className={cn(
                'inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium transition-all border',
                value === opt.value
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'bg-background border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="shrink-0 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "group flex items-baseline gap-4 py-2 border-b border-border/50 last:border-0 rounded-lg -mx-2 px-2 transition-colors",
        !disabled && "hover:bg-accent/50 cursor-pointer",
      )}
      onDoubleClick={() => !disabled && setEditing(true)}
      title={disabled ? undefined : "Double-cliquer pour modifier"}
    >
      <span className="text-sm text-muted-foreground font-medium w-40 shrink-0 truncate" title={label}>{label}</span>
      <span className="text-sm text-foreground flex-1 min-w-0">
        <span className="gl-badge gl-badge-neutral">{displayLabel}</span>
      </span>
      {!disabled && <Pencil size={12} className="shrink-0 text-transparent group-hover:text-muted-foreground transition-colors" />}
    </div>
  )
}

/* ─── Read-Only Row ───────────────────────────────────────────── */

export function ReadOnlyRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground font-medium w-40 shrink-0 truncate" title={label}>{label}</span>
      <span className="text-sm text-foreground flex-1 min-w-0">{value}</span>
    </div>
  )
}

/* ─── Detached Panels Container (portal-rendered floating modals) ──── */

export function DetachedPanelsContainer({ children }: { children: (panel: DetachedPanel) => React.ReactNode }) {
  const panels = useUIStore((s) => s.detachedPanels)

  if (panels.length === 0) return null

  return createPortal(
    <>
      {panels.map((panel) => (
        <FloatingPanel key={panel.id} panel={panel}>
          {children(panel)}
        </FloatingPanel>
      ))}
    </>,
    document.body,
  )
}

/* ─── Floating Panel (draggable + resizable non-blocking modal) ──── */

const FLOAT_MIN_W = 360
const FLOAT_MIN_H = 320
const SNAP_THRESHOLD = 16
const EDGE_PAD = 8

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const cursorMap: Record<ResizeDir, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
}

function getViewLabel(view: DetachedPanel['view']): string {
  const moduleName = view.module.charAt(0).toUpperCase() + view.module.slice(1)
  switch (view.type) {
    case 'detail': return `${moduleName} — Détail`
    case 'create': return `${moduleName} — Créer`
    case 'edit': return `${moduleName} — Éditer`
    default: return moduleName
  }
}

function FloatingPanel({ panel, children }: { panel: DetachedPanel; children: React.ReactNode }) {
  const updateDetachedPanel = useUIStore((s) => s.updateDetachedPanel)
  const closeDetachedPanel = useUIStore((s) => s.closeDetachedPanel)
  const bringToFront = useUIStore((s) => s.bringToFront)
  const reattachPanel = useUIStore((s) => s.reattachPanel)
  const togglePinPanel = useUIStore((s) => s.togglePinPanel)

  const [maximized, setMaximized] = useState(false)
  const [mounted, setMounted] = useState(false)
  const preMaxRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  // Open animation
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
  }, [])

  // ── Drag (header) ────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent) => {
    // Ignore clicks on buttons
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    if (maximized) return
    bringToFront(panel.id)
    const startX = e.clientX
    const startY = e.clientY
    const origX = panel.x
    const origY = panel.y

    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      let newX = origX + dx
      let newY = origY + dy

      // Snap to viewport edges
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (newX < SNAP_THRESHOLD) newX = EDGE_PAD
      if (newY < SNAP_THRESHOLD) newY = EDGE_PAD
      if (newX + panel.width > vw - SNAP_THRESHOLD) newX = vw - panel.width - EDGE_PAD
      if (newY + panel.height > vh - SNAP_THRESHOLD) newY = vh - panel.height - EDGE_PAD

      // Keep at least 40px of header visible
      newY = Math.max(0, newY)
      newX = Math.max(-(panel.width - 80), newX)

      updateDetachedPanel(panel.id, { x: newX, y: newY })
    }
    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panel.id, panel.x, panel.y, panel.width, panel.height, maximized, bringToFront, updateDetachedPanel])

  // ── Resize (8-directional) ───────────────────────────────
  const onResizeStart = useCallback((dir: ResizeDir, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (maximized) return
    bringToFront(panel.id)
    const startX = e.clientX
    const startY = e.clientY
    const origX = panel.x
    const origY = panel.y
    const origW = panel.width
    const origH = panel.height
    const maxW = window.innerWidth - EDGE_PAD * 2
    const maxH = window.innerHeight - EDGE_PAD * 2

    document.body.style.cursor = cursorMap[dir]
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const updates: Partial<Pick<DetachedPanel, 'x' | 'y' | 'width' | 'height'>> = {}

      // East
      if (dir.includes('e')) {
        updates.width = Math.min(maxW, Math.max(FLOAT_MIN_W, origW + dx))
      }
      // West
      if (dir.includes('w')) {
        const newW = Math.min(maxW, Math.max(FLOAT_MIN_W, origW - dx))
        updates.width = newW
        updates.x = origX + (origW - newW)
      }
      // South
      if (dir === 's' || dir === 'se' || dir === 'sw') {
        updates.height = Math.min(maxH, Math.max(FLOAT_MIN_H, origH + dy))
      }
      // North
      if (dir === 'n' || dir === 'ne' || dir === 'nw') {
        const newH = Math.min(maxH, Math.max(FLOAT_MIN_H, origH - dy))
        updates.height = newH
        updates.y = origY + (origH - newH)
      }

      updateDetachedPanel(panel.id, updates)
    }
    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panel.id, panel.x, panel.y, panel.width, panel.height, maximized, bringToFront, updateDetachedPanel])

  // ── Maximize / Restore ───────────────────────────────────
  const toggleMaximize = useCallback(() => {
    if (maximized) {
      // Restore
      if (preMaxRef.current) {
        updateDetachedPanel(panel.id, {
          x: preMaxRef.current.x,
          y: preMaxRef.current.y,
          width: preMaxRef.current.w,
          height: preMaxRef.current.h,
        })
      }
      setMaximized(false)
    } else {
      // Save current position, then maximize
      preMaxRef.current = { x: panel.x, y: panel.y, w: panel.width, h: panel.height }
      updateDetachedPanel(panel.id, {
        x: EDGE_PAD,
        y: EDGE_PAD,
        width: window.innerWidth - EDGE_PAD * 2,
        height: window.innerHeight - EDGE_PAD * 2,
      })
      setMaximized(true)
    }
  }, [maximized, panel.id, panel.x, panel.y, panel.width, panel.height, updateDetachedPanel])

  // Double-click header to toggle maximize
  const onHeaderDoubleClick = useCallback(() => {
    toggleMaximize()
  }, [toggleMaximize])

  const label = getViewLabel(panel.view)

  // Edge resize zones (invisible hit areas)
  const edgeBase = 'absolute z-10'
  const EDGE_SIZE = 6

  return (
    <div
      className={cn(
        'fixed flex flex-col overflow-hidden',
        'rounded-xl border border-border/60 bg-background',
        'shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]',
        'dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_2px_8px_rgba(0,0,0,0.2)]',
        'transition-[opacity,transform] duration-200 ease-out',
        mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97]',
        maximized && '!rounded-none',
      )}
      style={{
        left: panel.x,
        top: panel.y,
        width: panel.width,
        height: panel.height,
        zIndex: panel.zIndex,
        willChange: 'transform',
      }}
      onMouseDown={() => bringToFront(panel.id)}
    >
      {/* ── Resize handles (8 directions) ── */}
      {!maximized && (
        <>
          {/* Edges */}
          <div className={`${edgeBase} top-0 left-2 right-2 cursor-ns-resize`} style={{ height: EDGE_SIZE }} onMouseDown={(e) => onResizeStart('n', e)} />
          <div className={`${edgeBase} bottom-0 left-2 right-2 cursor-ns-resize`} style={{ height: EDGE_SIZE }} onMouseDown={(e) => onResizeStart('s', e)} />
          <div className={`${edgeBase} left-0 top-2 bottom-2 cursor-ew-resize`} style={{ width: EDGE_SIZE }} onMouseDown={(e) => onResizeStart('w', e)} />
          <div className={`${edgeBase} right-0 top-2 bottom-2 cursor-ew-resize`} style={{ width: EDGE_SIZE }} onMouseDown={(e) => onResizeStart('e', e)} />
          {/* Corners */}
          <div className={`${edgeBase} top-0 left-0 cursor-nwse-resize`} style={{ width: EDGE_SIZE * 2, height: EDGE_SIZE * 2 }} onMouseDown={(e) => onResizeStart('nw', e)} />
          <div className={`${edgeBase} top-0 right-0 cursor-nesw-resize`} style={{ width: EDGE_SIZE * 2, height: EDGE_SIZE * 2 }} onMouseDown={(e) => onResizeStart('ne', e)} />
          <div className={`${edgeBase} bottom-0 left-0 cursor-nesw-resize`} style={{ width: EDGE_SIZE * 2, height: EDGE_SIZE * 2 }} onMouseDown={(e) => onResizeStart('sw', e)} />
          <div className={`${edgeBase} bottom-0 right-0 cursor-nwse-resize`} style={{ width: EDGE_SIZE * 2, height: EDGE_SIZE * 2 }} onMouseDown={(e) => onResizeStart('se', e)} />
        </>
      )}

      {/* ── Header — draggable ── */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 shrink-0 select-none',
          'border-b border-border/60 bg-chrome',
          maximized ? 'h-10 cursor-default' : 'h-10 cursor-grab active:cursor-grabbing',
        )}
        onMouseDown={onDragStart}
        onDoubleClick={onHeaderDoubleClick}
      >
        {/* Status dot — green when pinned */}
        <span className="flex items-center gap-1 shrink-0">
          <span className={cn(
            'h-2.5 w-2.5 rounded-full transition-colors',
            panel.pinned ? 'bg-green-500' : 'bg-primary/60',
          )} />
        </span>

        <span className="text-xs font-semibold text-foreground truncate flex-1">{label}</span>
        {panel.pinned && (
          <span className="text-[10px] text-green-600 dark:text-green-400 font-medium shrink-0">Épinglé</span>
        )}

        {/* Window controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => togglePinPanel(panel.id)}
            className={cn(
              'h-6 w-6 flex items-center justify-center rounded-md transition-colors',
              panel.pinned
                ? 'text-green-600 dark:text-green-400 bg-green-500/10 hover:bg-green-500/20'
                : 'text-muted-foreground hover:bg-chrome-hover hover:text-foreground',
            )}
            title={panel.pinned ? 'Désépingler — ne sera plus restauré au rechargement' : 'Épingler — persiste au rechargement de la page'}
          >
            {panel.pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
          <button
            onClick={() => reattachPanel(panel.id)}
            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-chrome-hover hover:text-foreground transition-colors"
            title="Rattacher au panneau latéral"
          >
            <ExternalLink size={12} className="rotate-180" />
          </button>
          <button
            onClick={toggleMaximize}
            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-chrome-hover hover:text-foreground transition-colors"
            title={maximized ? 'Restaurer' : 'Maximiser'}
          >
            {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button
            onClick={() => closeDetachedPanel(panel.id)}
            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="Fermer"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Content (container query scope for responsive layouts) ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 @container">
        <FloatingPanelContext.Provider value={true}>
          {children}
        </FloatingPanelContext.Provider>
      </div>

      {/* ── Visible resize grip (bottom-right) ── */}
      {!maximized && (
        <div
          className="absolute bottom-1 right-1 w-3.5 h-3.5 cursor-nwse-resize opacity-0 hover:opacity-100 transition-opacity"
          onMouseDown={(e) => onResizeStart('se', e)}
        >
          <svg className="w-full h-full text-muted-foreground/50" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2L2 12" />
            <path d="M12 6L6 12" />
            <path d="M12 10L10 12" />
          </svg>
        </div>
      )}
    </div>
  )
}
