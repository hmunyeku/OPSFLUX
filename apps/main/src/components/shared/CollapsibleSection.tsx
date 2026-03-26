/**
 * CollapsibleSection — Reusable collapsible section with deep-link support.
 *
 * Features:
 * - Smooth expand/collapse animation (CSS transition on max-height)
 * - URL fragment deep linking: #section-id → auto-expand + scroll-to
 * - Section title replaces page subtitle when focused
 * - Click on header to toggle, chevron indicator
 * - Remembers state via optional localStorage persistence
 *
 * Pattern: Used across all settings tabs and forms for consistent UX.
 *
 * Usage:
 *   <CollapsibleSection
 *     id="cartographie"
 *     title="Cartographie"
 *     description="Configuration de la carte."
 *     defaultExpanded
 *   >
 *     {children}
 *   </CollapsibleSection>
 */
import { useState, useRef, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Context for deep-link focus ──────────────────────────────
interface CollapsibleContextValue {
  /** The section ID that should be focused (from URL hash) */
  focusedSection: string | null
  /** Clear the focused section after it has been scrolled to */
  clearFocus: () => void
  /** Callback when a section is expanded/focused (updates page subtitle) */
  onSectionFocus?: (title: string | null) => void
}

const CollapsibleContext = createContext<CollapsibleContextValue>({
  focusedSection: null,
  clearFocus: () => {},
})

export function CollapsibleProvider({
  focusedSection,
  onSectionFocus,
  children,
}: {
  focusedSection: string | null
  onSectionFocus?: (title: string | null) => void
  children: ReactNode
}) {
  const [focused, setFocused] = useState(focusedSection)

  // Sync from parent
  useEffect(() => {
    setFocused(focusedSection)
  }, [focusedSection])

  const clearFocus = useCallback(() => {
    setFocused(null)
  }, [])

  return (
    <CollapsibleContext.Provider value={{ focusedSection: focused, clearFocus, onSectionFocus }}>
      {children}
    </CollapsibleContext.Provider>
  )
}

export function useCollapsibleContext() {
  return useContext(CollapsibleContext)
}

// ── Persistence helpers ──────────────────────────────────────
function getStoredState(storageKey: string, sectionId: string): boolean | null {
  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored) return null
    const map = JSON.parse(stored) as Record<string, boolean>
    return map[sectionId] ?? null
  } catch {
    return null
  }
}

function setStoredState(storageKey: string, sectionId: string, expanded: boolean) {
  try {
    const stored = localStorage.getItem(storageKey)
    const map = stored ? (JSON.parse(stored) as Record<string, boolean>) : {}
    map[sectionId] = expanded
    localStorage.setItem(storageKey, JSON.stringify(map))
  } catch {
    // Ignore
  }
}

// ── CollapsibleSection Component ─────────────────────────────

export interface CollapsibleSectionProps {
  /** Unique ID for this section (used for deep linking via #id) */
  id: string
  /** Section title displayed in the header */
  title: string
  /** Optional description shown below the title */
  description?: string
  /** Whether section is expanded by default */
  defaultExpanded?: boolean
  /** Optional localStorage key for persisting expand/collapse state */
  storageKey?: string
  /** Additional className for the outer container */
  className?: string
  /** Show the bottom separator (default: true) */
  showSeparator?: boolean
  /** Optional action element rendered in the header (e.g. + button), visible on hover */
  headerAction?: ReactNode
  /** Children content */
  children: ReactNode
}

export function CollapsibleSection({
  id,
  title,
  description,
  defaultExpanded = false,
  storageKey,
  className,
  showSeparator = false,
  headerAction,
  children,
}: CollapsibleSectionProps) {
  const { focusedSection, clearFocus, onSectionFocus } = useCollapsibleContext()
  const sectionRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const hasScrolled = useRef(false)

  // Determine initial expanded state: deep-link > stored > default
  const isFocusTarget = focusedSection === id
  const initialExpanded = isFocusTarget
    ? true
    : storageKey
      ? getStoredState(storageKey, id) ?? defaultExpanded
      : defaultExpanded

  // If there's a focusedSection and it's NOT us, start collapsed
  const [expanded, setExpanded] = useState(
    focusedSection ? isFocusTarget : initialExpanded,
  )

  // Handle deep-link: scroll into view + update subtitle
  useEffect(() => {
    if (isFocusTarget && sectionRef.current && !hasScrolled.current) {
      setExpanded(true)
      hasScrolled.current = true

      // Wait for expand animation
      requestAnimationFrame(() => {
        setTimeout(() => {
          sectionRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          })
          // Notify parent to update page subtitle
          onSectionFocus?.(title)
          // Clear focus so other sections can re-expand if needed
          clearFocus()
        }, 50)
      })
    }
  }, [isFocusTarget, title, clearFocus, onSectionFocus])

  // When focusedSection changes and it's not us, collapse
  useEffect(() => {
    if (focusedSection && focusedSection !== id) {
      setExpanded(false)
    }
  }, [focusedSection, id])

  const toggle = useCallback(() => {
    const next = !expanded
    setExpanded(next)
    if (storageKey) {
      setStoredState(storageKey, id, next)
    }
    // Update URL hash when expanding
    if (next) {
      window.history.replaceState(null, '', `#${id}`)
      onSectionFocus?.(title)
    } else {
      onSectionFocus?.(null)
    }
  }, [expanded, storageKey, id, title, onSectionFocus])

  return (
    <div ref={sectionRef} id={id} className={cn('scroll-mt-4', className)}>
      {/* Header — clickable to toggle */}
      <div className="settings-sticky-header flex items-center gap-2 group">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-2 cursor-pointer select-none"
        >
          <ChevronRight
            size={16}
            className={cn(
              'shrink-0 text-muted-foreground transition-transform duration-200',
              expanded && 'rotate-90',
            )}
          />
          <h2 className="gl-heading-2 text-left">{title}</h2>
        </button>
        {headerAction && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => {
            e.stopPropagation()
            if (!expanded) {
              setExpanded(true)
              if (storageKey) setStoredState(storageKey, id, true)
            }
          }}>
            {headerAction}
          </div>
        )}
      </div>

      {description && (
        <p
          className={cn(
            'mt-1 ml-6 text-sm text-muted-foreground transition-opacity duration-200',
            !expanded && 'opacity-50',
          )}
        >
          {description}
        </p>
      )}

      {/* Content with animated expand/collapse — indented to align with title */}
      <div
        ref={contentRef}
        className={cn(
          'transition-all duration-300 ease-in-out',
          expanded ? 'max-h-[5000px] opacity-100 overflow-visible' : 'max-h-0 opacity-0 overflow-hidden',
        )}
      >
        <div className="pt-2 pb-2 ml-6">{children}</div>
      </div>

      {showSeparator && <hr className="border-border my-6 ml-6" />}
    </div>
  )
}
