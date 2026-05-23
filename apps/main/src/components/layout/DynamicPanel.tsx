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
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import {
  X, Check, Pencil, ChevronRight, ChevronLeft, ChevronDown,
  ChevronsLeft, ChevronsRight,
  ExternalLink, Pin, PinOff, Maximize2, Minimize2,
  PanelLeft, PanelRight, ArrowLeft, AppWindow,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import type { DetachedPanel } from '@/stores/uiStore'
import { ResponsiveActionBar, type ActionItem } from '@/components/shared/ResponsiveActionBar'

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
    const stored = localStorage.getItem(STORAGE_KEY)
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
  const { t } = useTranslation()
  const isFloating = useIsInsideFloatingPanel()

  // Esc closes the panel — a UX expectation across the app that was
  // missing on every dynamic-panel surface (audit K2). We listen at
  // the window level but bail when focus is inside an editor / input
  // so Esc still cancels in-place edits (Tiptap, native inputs) before
  // closing the panel.
  //
  // When the panel doesn't pass an explicit `onClose` prop (most do
  // not — they rely on the global `useUIStore.closeDynamicPanel()`),
  // we fall back to closing via the store. Without that fallback the
  // shortcut only worked on the handful of panels that wired onClose
  // themselves.
  const closeDynamicPanelFallback = useUIStore((s) => s.closeDynamicPanel)
  useEffect(() => {
    const isEditableTarget = (el: EventTarget | null): boolean => {
      const node = el as HTMLElement | null
      if (!node) return false
      if (node.isContentEditable) return true
      const tag = node.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (node.closest?.('.ProseMirror')) return true
      return false
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (isEditableTarget(e.target)) return
      // Skip when an outer modal (gl-modal-card) is open above us —
      // it has its own Esc handler and we don't want to fight it.
      if (document.querySelector('.gl-modal-backdrop')) return
      // Skip in inline mode — the parent surface is responsible for
      // its own keyboard handling there.
      if (inline) return
      if (onClose) {
        onClose()
      } else {
        closeDynamicPanelFallback()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, closeDynamicPanelFallback, inline])

  // Resolve the actions region once so the three render branches below stay
  // identical. `actionItems` (typed, responsive) wins over legacy `actions`
  // (opaque ReactNode) when both are provided.
  const actionsNode =
    actionItems && actionItems.length > 0 ? (
      <ResponsiveActionBar items={actionItems} onConfirm={onActionConfirm} />
    ) : actions ? (
      <>{actions}</>
    ) : null

  // Bug #86 (Rules of Hooks) : tous les hooks docked-mode etaient declares
  // APRES `if (inline) return` (L179) -- meme violation que #85 sur
  // AdsDetailPanel mais latente parce que la prop `inline` ne change
  // typiquement pas pour une meme instance. ESLint react-hooks/rules-of-hooks
  // attrape ça, et le pattern devient un piege futur (ex : si on passe une
  // logique conditionnelle qui flip `inline` cote parent). Tous les hooks
  // sont maintenant top-level INCONDITIONNELS, le mode inline les evalue
  // sans utilisation (cout < 1ms, pas d'effet de bord).

  // Panel store integration (docked mode)
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const detachDynamicPanel = useUIStore((s) => s.detachDynamicPanel)
  const detachDynamicPanelToWindow = useUIStore((s) => s.detachDynamicPanelToWindow)

  // Panel layout state
  const mode = useUIStore((s) => s.dynamicPanelMode)
  const dockSide = useUIStore((s) => s.dynamicPanelDockSide)
  const toggleMode = useUIStore((s) => s.toggleDynamicPanelMode)
  const toggleDock = useUIStore((s) => s.toggleDockSide)
  const setMode = useUIStore((s) => s.setDynamicPanelMode)

  // Auto full-screen on mobile (< 768px)
  useEffect(() => {
    if (inline) return // hook executes but no-op en mode inline
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches && mode !== 'full') setMode('full')
    }
    handler(mq)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode, setMode, inline])

  // Navigation
  const navItems = useUIStore((s) => s.dynamicPanelNavItems)
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const navigateToItem = useUIStore((s) => s.navigateToItem)

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
    if (inline) return
    localStorage.setItem(STORAGE_KEY, String(width))
  }, [width, inline])

  // Computed locals for navigation (NOT hooks, OK to be after early return)
  const currentId = dynamicPanel && 'id' in dynamicPanel ? (dynamicPanel as { id: string }).id : null
  const currentIndex = currentId ? navItems.indexOf(currentId) : -1
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < navItems.length - 1
  const canNavigate = currentId !== null && navItems.length > 1

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
            {subtitle && <p className="hidden text-xs text-muted-foreground truncate leading-tight sm:block">{subtitle}</p>}
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
              className="btn-sm btn-secondary h-6 w-6 !p-0 shrink-0"
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

  // (Hooks docked-mode deplaces AVANT `if (inline) return` -- cf bug #86)

  // Shared button style for header controls
  const hdrBtn = 'btn-sm btn-secondary flex h-6 w-6 !p-0 shrink-0'
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
        {/* Combined nav + header bar (April 2026 design v2) — fuses the
            previous two horizontal bars (h-9 nav + h-10 header = 76px)
            into a single h-11 row so the chrome eats less vertical
            real-estate. Layout from left to right:
              [Back btn] | [icon] [title/subtitle] | [actions] | [pager] [tools]
            Actions are inlined here on desktop (≥ sm) — Pajamas++ pattern.
            The previous standalone strip below the header was visually
            disconnected and ate vertical real estate. Mobile keeps the
            sticky-bottom action bar (rendered after the content). */}
        <div className="flex items-center gap-3 h-11 border-b border-border px-4 shrink-0 bg-background-subtle/50">
          <button
            onClick={() => {
              if (window.innerWidth < 768) closeDynamicPanel()
              else setMode('docked')
            }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary font-medium transition-colors shrink-0"
            title="Retour à la liste"
          >
            <ArrowLeft size={14} />
            <span className="hidden md:inline">Retour</span>
          </button>

          <div className="w-px h-5 bg-border/60 shrink-0" />

          {icon && <span className="shrink-0">{icon}</span>}
          {/* Title region: capped so the action bar gets a real budget.
              Without max-w the flex-1 title grows to fill all remaining
              space, leaving the ResponsiveActionBar with ~0 measured
              budget — which collapses every label to icon-only. Cap at
              ~50% of the row so actions always have ≥ 200-300px to render
              labelled buttons. min-w-0 still lets it truncate. */}
          <div className="flex-1 min-w-0 max-w-[50%]">
            <h2 className="text-sm font-semibold text-foreground truncate leading-tight">{title}</h2>
            {subtitle && <p className="hidden text-[11px] text-muted-foreground truncate leading-tight sm:block">{subtitle}</p>}
          </div>

          {/* Inline actions — desktop only (mobile uses sticky bottom bar).
              flex-1 lets the bar take all remaining horizontal space so the
              ResponsiveActionBar can keep labels visible (its own measure
              logic will collapse to icon-only only when truly out of room).
              Bug #164 : sans overflow-x-auto, les actions legacy (ReactNode
              opaque non-responsive, ex AdS : Lien externe / PDF / Demarrer
              sejour / Renvoyer en correction) debordaient hors ecran et
              poussaient les controles panel (shrink-0) au-dela du bord droit
              — le bouton X de fermeture sortait du cadre. overflow-x-auto
              + flex-nowrap confine les actions dans leur budget flex-1 et
              scrolle horizontalement au lieu de deborder. */}
          {actionsNode && (
            <div className="hidden sm:flex items-center gap-1.5 flex-1 min-w-0 pl-2 border-l border-border/60 overflow-x-auto flex-nowrap whitespace-nowrap [scrollbar-width:thin]">
              {actionsNode}
            </div>
          )}

          {canNavigate && (
            <div className="flex items-center gap-0.5 shrink-0 pl-2 border-l border-border/60">
              <span className="text-xs text-muted-foreground mr-1 tabular-nums hidden sm:inline">
                {currentIndex + 1} / {navItems.length}
              </span>
              <button disabled={!hasPrev} onClick={() => navigateToItem(navItems[0])} className={navBtn} title="Premier">
                <ChevronsLeft size={14} />
              </button>
              <button disabled={!hasPrev} onClick={() => navigateToItem(navItems[currentIndex - 1])} className={navBtn} title={t('common.previous')}>
                <ChevronLeft size={14} />
              </button>
              <button disabled={!hasNext} onClick={() => navigateToItem(navItems[currentIndex + 1])} className={navBtn} title="Suivant">
                <ChevronRight size={14} />
              </button>
              <button disabled={!hasNext} onClick={() => navigateToItem(navItems[navItems.length - 1])} className={navBtn} title="Dernier">
                <ChevronsRight size={14} />
              </button>
            </div>
          )}

          <div className="ml-auto flex items-center gap-0.5 pl-2 border-l border-border/60 shrink-0">
            <button onClick={toggleMode} className={hdrBtn} title={t('layout.reduire_en_panneau_lateral')}>
              <Minimize2 size={12} />
            </button>
            <button onClick={detachDynamicPanelToWindow} className={hdrBtn} title={t('layout.detacher_en_fenetre', 'Détacher en fenêtre')}>
              <AppWindow size={12} />
            </button>
            <button onClick={detachDynamicPanel} className={hdrBtn} title={t('layout.detacher_en_modal_flottant')}>
              <ExternalLink size={12} />
            </button>
            <button onClick={closeDynamicPanel} className={hdrBtn} aria-label="Fermer">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content — full-width scroll container; the inner
            `PanelContentLayout` (used by detail panels) handles its own
            max-width cap so we don't need to clamp here. Removing this
            outer wrapper unlocks the full main-area width on wide
            monitors.
            Bottom padding on mobile reserves space for the sticky
            action bar so the last form field stays scrollable above
            the buttons. */}
        <div className={cn(
          'flex-1 min-w-0 overflow-y-auto overflow-x-hidden @container',
          actionsNode && 'pb-16 sm:pb-0',
        )}>
          {children}
        </div>

        {/* Mobile sticky bottom action bar — only renders on < sm.
            Horizontal scroll if too many buttons to fit on a phone width
            (iPhone SE / Android compact). The inner gap-2 keeps spacing
            consistent; flex-nowrap forces children to stay on one line so
            the overflow-x-auto kicks in. The end-padding ensures the last
            button isn't flush with the screen edge during scroll. */}
        {actionsNode && (
          <div
            className="sm:hidden flex items-center gap-2 border-t border-border px-3 py-2 shrink-0 bg-background overflow-x-auto flex-nowrap whitespace-nowrap [scrollbar-width:thin]"
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
              <p className="hidden text-xs text-muted-foreground truncate leading-tight sm:block">{subtitle}</p>
            )}
          </div>

          {/* Nav arrows (compact, only for detail views with items) */}
          {canNavigate && (
            <div className="flex items-center gap-0 shrink-0">
              <button
                disabled={!hasPrev}
                onClick={() => navigateToItem(navItems[currentIndex - 1])}
                className={navBtn}
                title={t('common.previous')}
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

          {/* headerRight — custom content before panel controls */}
          {headerRight}

          {/* Panel controls — TOUJOURS visibles (priorite absolue : la
              fermeture du panel ne doit jamais sortir du cadre). Groupe
              shrink-0 ; les actions metier sont desormais dans une barre
              dediee SOUS le header (cf bug UI : en docked, actionsNode
              inline avec shrink-0 poussait ces controles hors champ
              quand il y avait beaucoup de boutons — ex AdS : Lien externe
              / PDF / Demarrer sejour / Renvoyer en correction / Mod...). */}
          <div className="ml-auto flex items-center gap-0.5 shrink-0">
            <button
              onClick={toggleDock}
              className={hdrBtn}
              title={isLeft ? 'Déplacer à droite' : 'Déplacer à gauche'}
            >
              {isLeft ? <PanelRight size={12} /> : <PanelLeft size={12} />}
            </button>
            <button onClick={toggleMode} className={hdrBtn} title="Agrandir en pleine largeur">
              <Maximize2 size={12} />
            </button>
            <button onClick={detachDynamicPanelToWindow} className={hdrBtn} title={t('layout.detacher_en_fenetre', 'Détacher en fenêtre')}>
              <AppWindow size={12} />
            </button>
            <button onClick={detachDynamicPanel} className={hdrBtn} title={t('layout.detacher_en_modal_flottant')}>
              <ExternalLink size={12} />
            </button>
            <button onClick={closeDynamicPanel} className={hdrBtn} aria-label={t('layout.fermer_le_panneau')}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Barre d'actions metier dediee — sous le header (pattern
            identique aux modes floating/mobile). Resout le debordement :
            les actions ne sont plus en competition d'espace avec le titre
            et les controles panel. overflow-x-auto = fallback scroll si
            vraiment trop de boutons pour la largeur du panel docked. */}
        {actionsNode && (
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 shrink-0 bg-background-subtle/40 overflow-x-auto flex-nowrap whitespace-nowrap [scrollbar-width:thin]">
            {actionsNode}
          </div>
        )}

        {/* Scrollable content (container query scope) */}
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden @container">
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
/**
 * @deprecated Sections must NEVER appear side-by-side per April 2026 design
 * rules — each section takes the full width of the boxed content area. This
 * helper is kept for backwards compatibility but now stacks children
 * vertically (single column) instead of using a 2-column grid. Migrate to
 * a plain `<div className="space-y-6">` over time.
 */
export function SectionColumns({
  children,
  className,
  sidebar,
}: {
  children: React.ReactNode
  className?: string
  /** Layout mode:
   *   - undefined (default): vertical stack (legacy behavior)
   *   - 'right-320': CSS Grid 1fr/320px on ≥ lg viewports — main on
   *     left, narrow sidebar on right (Pajamas++ design pattern).
   *     Children are placed in source order: 1st = main, 2nd = sidebar.
   *     Stacks vertically below the breakpoint.
   */
  sidebar?: 'right-320'
}) {
  if (sidebar === 'right-320') {
    return (
      <div className={cn('grid gap-4 @[900px]:grid-cols-[minmax(0,1fr)_320px]', className)}>
        {children}
      </div>
    )
  }
  return (
    <div className={cn('space-y-3', className)}>
      {children}
    </div>
  )
}

/* ─── Detail Field Grid — arranges detail rows in 2 columns on wide screens ── */

/**
 * Use inside a FormSection in detail panels to arrange InlineEditableRow /
 * ReadOnlyRow items in a 2-column grid when space allows.
 */
/**
 * Grid layout for fields inside a section.
 *
 * Per April 2026 design rules:
 *  - 1 column on mobile / narrow containers (< 600px)
 *  - 2 columns max on wider containers — NEVER 3+
 *  - The 40px gap between columns is enough to show alignment without
 *    needing an explicit divider (a divider on grid children would clip
 *    every-other label because `divide-x` adds left borders by document
 *    order, not by visual column).
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
        // 2 cols once the section has enough width. Each column hosts a
        // {label, value} pair so the pair takes ~50% of the section width.
        '@[600px]:grid-cols-2',
        className,
      )}
    >
      {children}
    </div>
  )
}

/* ─── Panel Content Layout — responsive boxed wrapper for all panel content ── */

/**
 * Replaces `<div className="p-4 space-y-5">` inside DynamicPanelShell.
 *
 * Design system rules (consolidated April 2026):
 *  - On full-screen / boxed mode: capped max-width with horizontal margin
 *    so content occupies 80-90% of viewport (centered, breathable).
 *  - Sections always stack vertically (one per row, never side-by-side):
 *    spacing managed via `space-y-6`. Wider gap than before for readability.
 *  - Padding scales with available width: tight on mobile, generous on
 *    large screens.
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
        // Tight gap between sections — they're already self-contained
        // cards with their own border. space-y-3 gives clear separation
        // without wasting vertical space (collapsed cards stack densely).
        'p-3 space-y-3',
        '@[640px]:px-5 @[640px]:py-4',
        // Full-bleed: previously capped width left ~200-300px of dead
        // space on wide screens. The detail panel is the user's main
        // working surface, so we let it breathe and use the full
        // available width. Padding alone provides the margins.
        '@[1024px]:px-6 @[1024px]:py-4',
        '@[1440px]:px-8',
        '@[1920px]:px-10',
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
        const stored = localStorage.getItem(storageKey)
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
          const stored = localStorage.getItem(storageKey)
          const map = stored ? (JSON.parse(stored) as Record<string, boolean>) : {}
          map[resolvedId] = next
          localStorage.setItem(storageKey, JSON.stringify(map))
        } catch { /* ignore */ }
      }
      return next
    })
  }, [storageKey, resolvedId])

  return (
    <fieldset
      className={cn(
        // Pajamas++ section card — visible but restrained chrome so
        // each section reads as its own grouped surface without making
        // a form-heavy panel feel like a card explosion (May 2026
        // design v2). Earlier attempts at "discreet"
        // (border-border/20 + bg-card/20, or border-border/60 +
        // shadow-sm) disappeared on white-on-cream because --card and
        // --background are nearly identical (#FFF vs #FCFAF6).
        // Solution: full-opacity border + ring shadow at low opacity
        // (the ring reads as a 1px outline rather than a drop shadow,
        // so 5+ sections stack cleanly).
        'min-w-0 w-full max-w-full [min-inline-size:0] border border-border rounded-lg bg-card shadow-[0_1px_3px_rgba(20,30,55,0.06)] transition-colors px-3 py-3 @[540px]:px-5 @[540px]:py-4',
        // Slightly more bottom padding when content is shown.
        collapsible && expanded && 'pb-4 space-y-2',
        !collapsible && 'pb-4 space-y-2',
        // Bug #39 fix : scroll panel CreateTier freeze 30s+. Cause = DOM
        // massif (15+ FormSections × inputs × Tiptap + managers) avec
        // container queries qui forcent style recalc complet a chaque
        // scroll. `content-visibility: auto` dit au navigateur de ne
        // pas paint/layout les sections hors viewport — gain enorme
        // sans casser le responsive (les container queries restent
        // valides quand la section entre en vue). `contain-intrinsic-size`
        // donne une estimation de taille pour eviter les scroll-jumps
        // visuels au moment de la mesure. 180px colle mieux aux sections
        // compactes frequentes (equipes, PJ, feuilles de temps repliees)
        // et evite de fabriquer de grands vides hors viewport ; le
        // navigateur remplace par la taille reelle une fois la section
        // dans le viewport.
        '[content-visibility:auto] [contain-intrinsic-size:auto_180px]',
        className,
      )}
    >
      {(title || headerExtra) && (
        collapsible ? (
          <div className="flex min-w-0 items-center gap-2 w-full">
            <button
              type="button"
              onClick={toggle}
              className="flex items-center gap-1.5 flex-1 min-w-0 text-left group cursor-pointer select-none rounded-md py-0.5"
            >
              <ChevronRight
                size={13}
                className={cn(
                  'shrink-0 text-muted-foreground transition-transform duration-200',
                  expanded && 'rotate-90',
                )}
              />
              <legend className="text-sm font-display font-semibold text-foreground tracking-tight truncate group-hover:text-primary transition-colors">
                {title}
              </legend>
            </button>
            {headerExtra && <span className="ml-auto shrink-0">{headerExtra}</span>}
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2 pb-1">
            <legend className="min-w-0 flex-1 truncate text-sm font-display font-semibold text-foreground tracking-tight">
              {title}
            </legend>
            {headerExtra && <span className="ml-auto">{headerExtra}</span>}
          </div>
        )
      )}
      {/* Content with animated expand/collapse.
          Important: when expanded, overflow MUST be visible so absolute-
          positioned dropdowns inside (UserPicker, AssetPicker, popovers)
          can escape the section bounds. Only the closing animation needs
          overflow-hidden — and at that point the section is already
          collapsing to 0 height anyway, so the dropdown auto-disappears
          as the parent shrinks. We render children unconditionally so the
          animation plays in both directions; for the collapsed state we
          rely on max-h-0 + opacity-0 to hide the body. */}
      {collapsible ? (
        expanded ? (
          <div className="transition-opacity duration-200 ease-in-out opacity-100">
            {children}
          </div>
        ) : (
          <div
            className="overflow-hidden transition-all duration-200 ease-in-out max-h-0 opacity-0"
            aria-hidden="true"
          >
            {children}
          </div>
        )
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
      <span className="text-sm text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="text-sm text-foreground flex-1 min-w-0">{value}</span>
    </div>
  )
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm font-semibold text-foreground pt-2 pb-1">
      {children}
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
        'btn-sm',
        variant === 'primary' && 'btn-primary',
        variant === 'danger' && 'btn-danger',
        variant === 'default' && 'btn-secondary',
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
        'btn-sm transition-all duration-200',
        confirming
          ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse'
          : 'btn-danger',
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
      <div className="flex flex-col gap-1 py-1.5 border-b border-border/20 sm:flex-row sm:items-start sm:gap-3">
        <span
          className="text-[10px] text-muted-foreground shrink-0 font-semibold uppercase tracking-wider sm:text-xs sm:font-medium sm:tracking-wide sm:pt-1"
          style={{ width: 'var(--opsflux-label-w, 8rem)' } as React.CSSProperties}
        >
          {label}
        </span>
        <div className="flex-1 flex items-center gap-1.5 min-w-0">
          <input
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            autoFocus
            className="gl-form-input h-8 text-sm flex-1 min-w-0"
          />
          <button
            onClick={commit}
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md text-success hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
          >
            <Check size={14} />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); cancel() }}
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  const titleAttr = disabled
    ? (typeof (displayValue ?? value) === 'string' ? (displayValue || value) : undefined)
    : 'Double-cliquer pour modifier'

  return (
    <div
      className="group flex flex-col gap-1 py-1.5 border-b border-border/20 last:border-0 sm:flex-row sm:items-start sm:gap-3"
      onDoubleClick={startEdit}
      title={titleAttr}
    >
      <span
        className="text-[10px] text-muted-foreground shrink-0 font-semibold uppercase tracking-wider sm:text-xs sm:font-medium sm:tracking-wide sm:pt-1"
        style={{ width: 'var(--opsflux-label-w, 8rem)' } as React.CSSProperties}
      >
        {label}
      </span>
      <span
        className={cn(
          'flex-1 min-w-0 text-sm text-foreground bg-muted/30 rounded-md px-2.5 py-1.5 flex items-center gap-2 transition-colors',
          !disabled && 'hover:bg-muted/60 hover:ring-1 hover:ring-primary/20 cursor-pointer',
          isLikelyLink(value) ? 'break-all' : 'break-words [overflow-wrap:anywhere]',
        )}
      >
        <span className="flex-1 min-w-0">
          {displayValue || value || <span className="text-muted-foreground/60">—</span>}
          {suffix && value ? <span className="text-muted-foreground"> {suffix}</span> : null}
        </span>
        {!disabled && (
          <Pencil
            size={11}
            className="shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground/70 transition-colors"
          />
        )}
      </span>
    </div>
  )
}

/* ─── Inline Editable Select Dropdown (SUP-0026) ──────────────────
 * Custom dropdown qui remplace <select> natif HTML pour garantir
 * que TOUTES les options sont accessibles via scroll, peu importe
 * le browser. Le natif limitait l'affichage (Firefox tronquait,
 * Edge variait selon viewport).
 *
 * Comportement :
 *   - Click sur le bouton -> popup absolue avec liste scrollable
 *   - Click sur une option -> selection + commit
 *   - Escape ou click outside -> annule
 *   - Recherche clavier : taper des lettres focus la 1ere option
 *     matchante (preserve le comportement natif HTML attendu)
 *   - max-h-[280px] sur la liste = ~10 options visibles avant scroll
 */
function InlineEditableSelectDropdown({
  value,
  options,
  onSelect,
  onCancel,
}: {
  value: string
  options: { value: string; label: string }[]
  onSelect: (value: string) => void
  onCancel: () => void
}) {
  const [open, setOpen] = useState(true)  // ouvre par defaut quand on entre en edition
  const [searchBuf, setSearchBuf] = useState('')
  const [highlighted, setHighlighted] = useState<number>(() => {
    const idx = options.findIndex((o) => o.value === value)
    return idx >= 0 ? idx : 0
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const selectedOption = options.find((o) => o.value === value)

  // Auto-scroll la list pour montrer l'option highlighted.
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[highlighted] as HTMLElement | undefined
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlighted, open])

  // Click outside -> cancel.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        onCancel()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [onCancel])

  // Clavier : Up/Down navigue, Enter commit, Escape annule, lettres = type-ahead.
  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const opt = options[highlighted]
        if (opt) onSelect(opt.value)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlighted((i) => Math.min(i + 1, options.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlighted((i) => Math.max(i - 1, 0))
        return
      }
      // Type-ahead : on accumule les lettres tapees rapidement et on
      // jump vers la 1ere option dont le label commence par ce buffer.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const next = (searchBuf + e.key).toLowerCase()
        setSearchBuf(next)
        const idx = options.findIndex((o) => o.label.toLowerCase().startsWith(next))
        if (idx >= 0) setHighlighted(idx)
        // Reset buffer apres 600ms d'inactivite.
        window.setTimeout(() => setSearchBuf(''), 600)
      }
    },
    [highlighted, options, onSelect, onCancel, searchBuf],
  )

  return (
    <div
      ref={containerRef}
      className="relative"
      tabIndex={-1}
      onKeyDown={handleKey}
    >
      <button
        type="button"
        autoFocus
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between gap-2 h-7 px-2 rounded-md',
          'bg-background border border-border hover:border-primary/40',
          'text-sm text-foreground transition-colors',
          'focus:outline-none focus:ring-1 focus:ring-primary/40',
        )}
      >
        <span className="truncate">
          {selectedOption?.label ?? <span className="text-muted-foreground">—</span>}
        </span>
        <ChevronDown size={12} className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className={cn(
            'absolute z-50 left-0 right-0 mt-1',
            'max-h-[280px] overflow-y-auto',
            'rounded-md border border-border bg-popover shadow-lg',
            'py-1 text-sm',
          )}
        >
          {options.length === 0 && (
            <li className="px-2 py-1.5 text-xs text-muted-foreground italic">
              Aucune option
            </li>
          )}
          {options.map((opt, i) => (
            <li key={opt.value}>
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => onSelect(opt.value)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1 text-left text-sm',
                  'hover:bg-accent transition-colors',
                  i === highlighted && 'bg-accent',
                  opt.value === value && 'font-medium text-primary',
                )}
              >
                {opt.value === value && <Check size={11} className="shrink-0" />}
                <span className={cn('truncate', opt.value !== value && 'pl-[15px]')}>
                  {opt.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
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
  displayValue?: React.ReactNode
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
        <span className="text-sm text-muted-foreground w-28 shrink-0">{label}</span>
        <div className="flex-1">
          {/* SUP-0026 : le <select> natif HTML avec appearance:none rendait
              un dropdown limite a quelques options par browser (Firefox
              tronquait severement, Edge variait). On utilise maintenant un
              dropdown custom (button + ul absolu) avec max-h-[280px] et
              overflow-y-auto pour garantir que TOUTES les options sont
              accessibles, quel que soit le browser et le nombre d'options. */}
          <InlineEditableSelectDropdown
            value={draft}
            options={options}
            onSelect={(v) => { setDraft(v); commit(v) }}
            onCancel={() => setEditing(false)}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className="group flex flex-col gap-1 py-1.5 border-b border-border/20 last:border-0 sm:flex-row sm:items-start sm:gap-3"
      onDoubleClick={startEdit}
      title={disabled ? undefined : 'Double-cliquer pour modifier'}
    >
      <span
        className="text-[10px] text-muted-foreground shrink-0 font-semibold uppercase tracking-wider sm:text-xs sm:font-medium sm:tracking-wide sm:pt-1"
        style={{ width: 'var(--opsflux-label-w, 8rem)' } as React.CSSProperties}
      >
        {label}
      </span>
      <span
        className={cn(
          'flex-1 min-w-0 text-sm text-foreground bg-muted/30 rounded-md px-2.5 py-1.5 flex items-center gap-2 transition-colors',
          !disabled && 'hover:bg-muted/60 hover:ring-1 hover:ring-primary/20 cursor-pointer',
        )}
      >
        <span className="flex-1 min-w-0 break-words [overflow-wrap:anywhere]">
          {/* Bastien (mai 2026): le Site Detail panel affichait le UUID brut
              du champ parent au lieu de son nom. Cause: displayValue n'etait
              pas passe par le caller -> fallback sur value (qui est le UUID
              pour les selects pointant vers une entite). Fix a la source:
              auto-lookup le label dans options quand displayValue absent. */}
          {displayValue || options.find((o) => o.value === value)?.label || value || <span className="text-muted-foreground/60">—</span>}
        </span>
        {!disabled && <Pencil size={11} className="shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground/70 transition-colors" />}
      </span>
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
  const { t } = useTranslation()
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
        <span className="text-sm text-muted-foreground w-28 shrink-0">{label}</span>
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
              <li className="px-3 py-2 text-xs text-muted-foreground text-center">{t('common.no_results')}</li>
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
      title={t('layout.double_cliquer_pour_modifier')}
    >
      <span className="text-sm text-muted-foreground w-28 shrink-0">{label}</span>
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
        <span className="text-sm text-muted-foreground w-28 shrink-0 pt-1.5">{label}</span>
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
      className="group flex flex-col gap-1 py-1.5 border-b border-border/20 last:border-0 sm:flex-row sm:items-start sm:gap-3"
      onDoubleClick={() => !disabled && setEditing(true)}
      title={disabled ? undefined : "Double-cliquer pour modifier"}
    >
      <span
        className="text-[10px] text-muted-foreground shrink-0 font-semibold uppercase tracking-wider sm:text-xs sm:font-medium sm:tracking-wide sm:pt-1"
        style={{ width: 'var(--opsflux-label-w, 8rem)' } as React.CSSProperties}
      >
        {label}
      </span>
      <span
        className={cn(
          "flex-1 min-w-0 bg-muted/30 rounded-md px-2.5 py-1.5 flex items-center gap-2 transition-colors",
          !disabled && "hover:bg-muted/60 hover:ring-1 hover:ring-primary/20 cursor-pointer",
        )}
      >
        <span className="flex-1 min-w-0">
          <span className="chip">{displayLabel}</span>
        </span>
        {!disabled && <Pencil size={11} className="shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground/70 transition-colors" />}
      </span>
    </div>
  )
}

/* ─── Read-Only Row ───────────────────────────────────────────── */
//
// Layout per April 2026 design system v2:
//  - Mobile (< 640px): label STACKS above value (vertical) so the value
//    chip uses full width.
//  - Tablet+ (≥ 640px): label and value side-by-side, label width
//    controlled by CSS var --opsflux-label-w (default 8rem) so all
//    sections in a panel align consistently.
//  - Subtle bg-muted/30 chip on the value, hover:bg-muted/50.
//  - Long values: overflow-wrap-anywhere + word-break gracefully wraps
//    URLs / emails. Title attribute gives full content on hover.

const isLikelyLink = (v: unknown) =>
  typeof v === 'string' && /^(https?:\/\/|mailto:|[\w.+-]+@[\w-]+\.\w+)/.test(v)

export function ReadOnlyRow({ label, value }: { label: string; value: React.ReactNode }) {
  const titleAttr = typeof value === 'string' ? value : undefined
  return (
    <div className="flex flex-col gap-1 py-1.5 border-b border-border/20 last:border-0 sm:flex-row sm:items-start sm:gap-3">
      <span
        className="text-[10px] text-muted-foreground shrink-0 font-semibold uppercase tracking-wider sm:text-xs sm:font-medium sm:tracking-wide sm:pt-1"
        style={{ width: 'var(--opsflux-label-w, 8rem)' } as React.CSSProperties}
      >
        {label}
      </span>
      <span
        className={cn(
          'flex-1 min-w-0 text-sm text-foreground bg-muted/30 rounded-md px-2.5 py-1.5',
          isLikelyLink(value) ? 'break-all' : 'break-words [overflow-wrap:anywhere]',
        )}
        title={titleAttr}
      >
        {value || <span className="text-muted-foreground/60">—</span>}
      </span>
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
  const { t } = useTranslation()
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
          <span className="text-[10px] text-green-600 dark:text-green-400 font-medium shrink-0">{t('layout.epingle')}</span>
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
            title={t('layout.rattacher_au_panneau_lateral')}
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
