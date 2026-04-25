/**
 * ResponsiveActionBar — Horizontal action bar with priority-based overflow.
 *
 * Problem solved: detail panels (e.g. Planner activity, Paxlog ADS) expose
 * a handful of action buttons in their header — "Modifier / Soumettre /
 * Annuler / Supprimer" — and on mobile these overflow the available width,
 * hiding buttons completely. The previous pattern (flex row + truncate)
 * simply clipped the tail, making actions unreachable.
 *
 * How it works:
 *   1. Consumers pass a typed list of `ActionItem`s with a `priority`
 *      (higher = kept visible longer). Typical priorities:
 *        - 100  main CTA (e.g. "Soumettre", "Enregistrer")
 *        - 60   secondary (e.g. "Modifier")
 *        - 40   cancel/back
 *        - 20   destructive ("Supprimer")
 *   2. An off-screen measurement row renders every item at its natural
 *      width so we know how much space each would take.
 *   3. A ResizeObserver on the visible container computes how many items
 *      (sorted by priority desc) fit, reserving space for the overflow
 *      kebab button when at least one item will be collapsed.
 *   4. Items that fit are rendered inline; the rest go into a "⋮" popover
 *      menu anchored to the right.
 *   5. On very narrow screens, even the primary action collapses its label
 *      to icon-only (but never disappears entirely).
 *
 * The `confirm` config lets callers move the two-step danger pattern
 * (DangerConfirmButton) into a proper modal confirmation, which is the
 * only interaction that works reliably both inline AND inside a popover.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MoreHorizontal, Loader2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ActionItem {
  /** Stable id (used as React key and for test selectors). */
  id: string
  label: string
  /**
   * Click handler. Fires after the `confirm` modal resolves to `true`,
   * or immediately if no `confirm` is set.
   */
  onClick?: () => void
  /** Lucide icon component (not an instance). */
  icon?: LucideIcon
  variant?: 'default' | 'primary' | 'danger'
  disabled?: boolean
  /** Shows a spinner instead of the icon and disables the button. */
  loading?: boolean
  /**
   * Higher priority = kept visible longer when the bar is narrow.
   * Main CTA: 100. Secondary: 60. Cancel: 40. Destructive: 20. Default 50.
   */
  priority?: number
  /**
   * When set, clicking the action opens a confirm dialog via the
   * `onConfirm` callback the consumer provided to the bar. If the user
   * confirms, `onClick` fires; otherwise nothing happens.
   */
  confirm?: {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: 'default' | 'warning' | 'danger'
  }
  /** Optional explicit tooltip text (defaults to `label`). */
  tooltip?: string
}

interface ResponsiveActionBarProps {
  items: ActionItem[]
  /**
   * Resolves a confirm dialog. Typically wired to `useConfirm()` from
   * `@/components/ui/ConfirmDialog`. Called only when an item has a
   * `confirm` config. Must return a Promise<boolean>.
   */
  onConfirm?: (
    cfg: NonNullable<ActionItem['confirm']>,
  ) => Promise<boolean>
  /**
   * Width (px) below which even inline labels collapse to icon-only to
   * save horizontal space. Defaults to 360.
   */
  compactBelow?: number
  /** Extra class names on the container. */
  className?: string
}

export function ResponsiveActionBar({
  items,
  onConfirm,
  compactBelow = 360,
  className,
}: ResponsiveActionBarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const [visibleCount, setVisibleCount] = useState(items.length)
  const [compact, setCompact] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // Priority-sorted copy. Memoized so render doesn't reshuffle on every tick.
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50)),
    [items],
  )

  // Measure + fit computation.
  //
  // IMPORTANT: we measure the PARENT element, not our own container.
  //
  // Why: the bar is typically dropped inside a `flex justify-end` parent
  // (the detail-panel header toolbar, for example). In that layout its
  // own `clientWidth` equals its content's natural width — growing to
  // fit the buttons rather than being constrained by available space —
  // so the ResizeObserver would never see a narrow container and the
  // overflow menu would never trigger. Reading the parent's clientWidth
  // gives us the actual allocation: the horizontal budget the layout
  // engine has reserved for us, regardless of how flex sizes us.
  //
  // We subtract the width of any non-action siblings inside that same
  // parent (icons, titles, other flex children to our left/right) so
  // the budget reflects the space that's really available for actions,
  // not the whole parent row.
  useLayoutEffect(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) return
    const parent = container.parentElement
    if (!parent) return

    const computeFit = () => {
      // Start from the parent's inner width (content-box) and subtract
      // the width of every sibling so only the slice we actually own
      // counts as our budget.
      let siblingWidth = 0
      const siblings = Array.from(parent.children) as HTMLElement[]
      for (const sib of siblings) {
        if (sib === container) continue
        // Include margins in the sibling budget so gaps on the parent
        // flex container don't get double-counted.
        siblingWidth += sib.offsetWidth
      }
      // Gap property of the parent (if any): approximate by reading the
      // computed style. A flex gap of 8 with N siblings adds ~8*(siblings.length)
      // to the horizontal flow.
      const parentStyle = window.getComputedStyle(parent)
      const gap = parseFloat(parentStyle.columnGap || parentStyle.gap || '0')
      const gapBudget = isFinite(gap) ? gap * siblings.length : 0
      const parentInner =
        parent.clientWidth -
        parseFloat(parentStyle.paddingLeft || '0') -
        parseFloat(parentStyle.paddingRight || '0')
      const containerWidth = Math.max(0, parentInner - siblingWidth - gapBudget)
      if (containerWidth <= 0) return

      // Reserve space for the overflow ⋮ button (icon only, ~32px with gap).
      const OVERFLOW_WIDTH = 36
      const GAP = 6

      const itemEls = Array.from(measure.children) as HTMLElement[]
      if (itemEls.length === 0) {
        setVisibleCount(0)
        return
      }

      // Strategy:
      //   1. Prefer labeled buttons. Fit items by priority, reserving
      //      OVERFLOW_WIDTH for the kebab whenever there will be at
      //      least one item left over.
      //   2. If NOTHING fits with labels (not even one), fall back to
      //      compact (icon-only) mode and repeat the fit. Compact mode
      //      strips labels from the inline buttons; the popover still
      //      shows the full labels so the action stays discoverable.
      //   3. Always keep at least 1 item inline so the primary CTA is
      //      one tap away even on the tiniest viewport.
      //
      // This is intentionally NOT gated by a `containerWidth < threshold`
      // check — that kind of pre-emptive collapse (what the old
      // `compactBelow` flag did) removed labels too aggressively. For
      // example on a 375px mobile the container budget was ~343px,
      // which is plenty of room for 3 labeled buttons + a kebab menu;
      // forcing compact mode made all 4 go icon-only instead of
      // surfacing the primary label clearly.
      let width = 0
      let count = 0
      for (let i = 0; i < itemEls.length; i++) {
        const itemWidth = itemEls[i].offsetWidth + (i === 0 ? 0 : GAP)
        const hasOverflow = i < itemEls.length - 1
        const budget = containerWidth - (hasOverflow ? OVERFLOW_WIDTH + GAP : 0)
        if (width + itemWidth > budget) break
        width += itemWidth
        count++
      }

      if (count === 0) {
        // Not even one labeled button fits → go icon-only.
        setCompact(true)
        const COMPACT_WIDTH = 32
        width = 0
        count = 0
        for (let i = 0; i < itemEls.length; i++) {
          const w = COMPACT_WIDTH + (i === 0 ? 0 : GAP)
          const hasOverflow = i < itemEls.length - 1
          const budget = containerWidth - (hasOverflow ? OVERFLOW_WIDTH + GAP : 0)
          if (width + w > budget) break
          width += w
          count++
        }
        setVisibleCount(Math.max(1, count))
      } else {
        setCompact(false)
        setVisibleCount(count)
      }
    }

    computeFit()
    const ro = new ResizeObserver(computeFit)
    ro.observe(parent)
    // Also observe any flex siblings — when a title truncates, the bar's
    // budget grows. Without this the overflow wouldn't relax back once a
    // sibling shrinks.
    const initialSiblings = Array.from(parent.children) as HTMLElement[]
    for (const sib of initialSiblings) {
      if (sib !== container) ro.observe(sib)
    }
    return () => ro.disconnect()
  }, [sortedItems, compactBelow])

  // Close menu on outside click / escape.
  useEffect(() => {
    if (!menuOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    // Defer the click listener so the click that opened the menu isn't
    // captured as an outside click.
    const id = setTimeout(() => document.addEventListener('click', onDocClick), 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(id)
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const visible = sortedItems.slice(0, visibleCount)
  const overflow = sortedItems.slice(visibleCount)

  const runAction = async (item: ActionItem) => {
    if (item.disabled || item.loading) return
    setMenuOpen(false)
    if (item.confirm) {
      if (!onConfirm) {
        // Fallback: fire directly if the host didn't wire a confirm provider.
        item.onClick?.()
        return
      }
      const ok = await onConfirm(item.confirm)
      if (!ok) return
    }
    item.onClick?.()
  }

  const buttonClass = (variant: ActionItem['variant']) =>
    cn(
      'gl-button-sm',
      variant === 'primary' && 'gl-button-confirm',
      variant === 'danger' && 'gl-button-danger',
      (!variant || variant === 'default') && 'gl-button-default',
    )

  return (
    <div
      ref={containerRef}
      className={cn('flex items-center gap-1.5 min-w-0 relative', className)}
    >
      {/* ── Hidden measurement row ──
          Renders every item at its natural size so we know the true width
          of each action. Absolutely positioned off-screen so it doesn't
          affect layout and never intercepts clicks. Visibility:hidden keeps
          it out of the accessibility tree too. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="absolute -left-[9999px] top-0 flex items-center gap-1.5 invisible pointer-events-none"
      >
        {sortedItems.map((item) => {
          const Icon = item.icon
          return (
            <button key={item.id} className={buttonClass(item.variant)} tabIndex={-1}>
              {Icon && <Icon size={12} />}
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Visible inline buttons ── */}
      {visible.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => runAction(item)}
            disabled={item.disabled || item.loading}
            className={buttonClass(item.variant)}
            title={item.tooltip ?? item.label}
            aria-label={item.label}
          >
            {item.loading ? (
              <Loader2 size={12} className="animate-spin shrink-0" />
            ) : (
              Icon && <Icon size={12} className="shrink-0" />
            )}
            {!compact && <span className="truncate">{item.label}</span>}
          </button>
        )
      })}

      {/* ── Overflow menu ── */}
      {overflow.length > 0 && (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="gl-button-sm gl-button-default !px-1.5"
            aria-label="Plus d'actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Plus d'actions"
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-md border border-border bg-card shadow-lg py-1"
            >
              {overflow.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => runAction(item)}
                    disabled={item.disabled || item.loading}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors',
                      'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none',
                      'disabled:opacity-50 disabled:pointer-events-none',
                      item.variant === 'danger' &&
                        'text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive',
                      item.variant === 'primary' && 'text-primary font-medium',
                    )}
                  >
                    {item.loading ? (
                      <Loader2 size={12} className="animate-spin shrink-0" />
                    ) : (
                      Icon && <Icon size={12} className="shrink-0" />
                    )}
                    <span className="flex-1 truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
