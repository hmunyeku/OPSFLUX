/**
 * TopbarSearchSuggestions — live suggestions dropdown under the
 * topbar search input. Inspired by ERPNext's "awesomebar":
 *
 *   • Math expression  →  inline result (Enter to copy)
 *   • Object code      →  direct jump (ADS-2026-0001, MOC-2026-0001, …)
 *   • "new …"          →  action shortcut to a Create panel
 *   • Module keyword   →  module jump (accueil, projets, paxlog, …)
 *   • Free text        →  top N results from /api/v1/search
 *
 * The Enter key opens the highlighted suggestion. If no suggestion
 * is highlighted (or the list is empty), Enter falls back to the
 * full-search page at /search?q=… — matching the behaviour the
 * topbar had before this component existed.
 *
 * Keyboard: ArrowDown / ArrowUp navigate, Enter opens, Escape closes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Building2,
  Calculator,
  Calendar,
  FileText,
  GitBranch,
  Loader2,
  MapPin,
  Package,
  ShieldCheck,
  Ship,
  UserCheck,
  User as UserIcon,
  Wrench,
  Briefcase,
  AlertTriangle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { runSmartDetectors, type SmartItem } from '@/components/ui/smartSearchDetectors'

// ── API types ─────────────────────────────────────────────────

interface ApiSearchResult {
  type: string
  id: string
  title: string
  subtitle?: string | null
  url: string
}

interface ApiSearchResponse {
  results: ApiSearchResult[]
}

// ── Render helpers ────────────────────────────────────────────

function iconForType(type: string): LucideIcon {
  switch (type) {
    case 'asset':      return MapPin
    case 'tier':       return Building2
    case 'user':       return UserIcon
    case 'moc':        return Wrench
    case 'project':    return Briefcase
    case 'activity':   return Calendar
    case 'ads':        return UserCheck
    case 'incident':   return AlertTriangle
    case 'voyage':     return Ship
    case 'cargo':      return Package
    case 'compliance': return ShieldCheck
    case 'workflow':   return GitBranch
    default:           return FileText
  }
}

// ── Props ─────────────────────────────────────────────────────

interface TopbarSearchSuggestionsProps {
  /** The raw query from the input. */
  query: string
  /** Whether the dropdown should be shown (typically: focus + query). */
  open: boolean
  /** Fired when the user picks a suggestion or Enter with no match. */
  onClose: () => void
  /** Bounding element used as the positioning anchor (the input wrapper). */
  anchorRef: React.RefObject<HTMLDivElement>
  /**
   * Forwarded from the input so the dropdown can handle
   * ArrowUp / ArrowDown / Enter / Escape without losing input focus.
   * Return `true` if the key was handled (caller should preventDefault).
   */
  registerKeyHandler: (handler: (e: KeyboardEvent) => boolean) => void
  /** Used when Enter falls through to the full-search page. */
  onFallback: () => void
}

type SuggestionItem =
  | (SmartItem & { kind: 'smart' })
  | {
      kind: 'result'
      id: string
      label: string
      subtitle?: string
      icon: LucideIcon
      url: string
      type: string
    }

// ── Component ─────────────────────────────────────────────────

export function TopbarSearchSuggestions({
  query,
  open,
  onClose,
  anchorRef,
  registerKeyHandler,
  onFallback,
}: TopbarSearchSuggestionsProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [selectedIndex, setSelectedIndex] = useState(0)

  const q = query.trim()
  const canSearch = q.length >= 2

  // Debounced query for the API — smart detectors run synchronously.
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(q), 200)
    return () => window.clearTimeout(id)
  }, [q])

  const { data, isFetching } = useQuery<ApiSearchResponse>({
    queryKey: ['topbar-search', debouncedQuery],
    queryFn: () =>
      api
        .get('/api/v1/search', { params: { q: debouncedQuery } })
        .then((r) => r.data),
    enabled: open && canSearch && debouncedQuery.length >= 2,
    staleTime: 10_000,
  })

  // Smart detectors (math, codes, actions, module jumps).
  const smartItems: SmartItem[] = useMemo(() => {
    if (!q) return []
    return runSmartDetectors(q)
  }, [q])

  // Flatten into a single scrollable list. Cap API results at 8 so the
  // dropdown stays scannable — full journal is still reachable via
  // Enter-with-no-selection (falls through to /search).
  const items: SuggestionItem[] = useMemo(() => {
    const out: SuggestionItem[] = []
    smartItems.forEach((s) => out.push({ ...s, kind: 'smart' }))
    const apiResults = (data?.results ?? []).slice(0, 8)
    apiResults.forEach((r) =>
      out.push({
        kind: 'result',
        id: `result-${r.type}-${r.id}`,
        label: r.title,
        subtitle: r.subtitle ?? undefined,
        icon: iconForType(r.type),
        url: r.url,
        type: r.type,
      }),
    )
    return out
  }, [smartItems, data])

  // Keep selection valid when the list size changes.
  useEffect(() => {
    setSelectedIndex((prev) => {
      if (items.length === 0) return 0
      return Math.min(prev, items.length - 1)
    })
  }, [items])

  // Reset highlight when the query changes.
  useEffect(() => {
    setSelectedIndex(0)
  }, [q])

  // Select/open an item.
  const pickItem = useCallback(
    (it: SuggestionItem) => {
      if (it.kind === 'smart' && it.action === 'copy' && it.copyValue !== undefined) {
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(it.copyValue)
        }
        // Don't close: let the user chain calculations.
        return
      }
      if (it.url) navigate(it.url)
      onClose()
    },
    [navigate, onClose],
  )

  // Register keyboard handler with the parent input.
  // We use a ref so identity changes don't cause the parent to
  // re-attach listeners too aggressively.
  const handlerRef = useRef<(e: KeyboardEvent) => boolean>(() => false)
  handlerRef.current = (e: KeyboardEvent): boolean => {
    if (!open) return false
    if (e.key === 'ArrowDown') {
      if (items.length === 0) return false
      setSelectedIndex((i) => (i + 1) % items.length)
      return true
    }
    if (e.key === 'ArrowUp') {
      if (items.length === 0) return false
      setSelectedIndex((i) => (i - 1 + items.length) % items.length)
      return true
    }
    if (e.key === 'Enter') {
      if (items.length > 0) {
        pickItem(items[selectedIndex])
        return true
      }
      // Fall through: let parent navigate to /search?q=…
      return false
    }
    if (e.key === 'Escape') {
      onClose()
      return true
    }
    return false
  }
  useEffect(() => {
    registerKeyHandler((e) => handlerRef.current(e))
  }, [registerKeyHandler])

  // Positioning — anchor to the input's bounding rect so the dropdown
  // tracks resizes / window scroll gracefully.
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  useEffect(() => {
    if (!open || !anchorRef.current) {
      setAnchorRect(null)
      return
    }
    const update = () => {
      if (anchorRef.current) setAnchorRect(anchorRef.current.getBoundingClientRect())
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef])

  // Scroll selected item into view when it moves.
  const listRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(
      `[data-idx="${selectedIndex}"]`,
    ) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!open || !anchorRect) return null
  // Don't render the dropdown if there's literally nothing to show AND
  // the query is too short — keeps the UI calm when the user just
  // focuses the field.
  if (!canSearch && items.length === 0) return null

  return (
    <div
      role="listbox"
      aria-label={t('search.suggestions', 'Suggestions')}
      className="fixed rounded-xl border border-border/60 bg-popover/97 backdrop-blur-md shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)] overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150"
      style={{
        top: anchorRect.bottom + 6,
        left: anchorRect.left,
        width: anchorRect.width,
        maxHeight: 'min(480px, calc(100vh - ' + (anchorRect.bottom + 24) + 'px))',
        zIndex: 'var(--z-dropdown)',
      }}
    >
      {/* Accent strip */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary via-primary to-highlight"
      />

      {/* Body */}
      <div className="overflow-y-auto max-h-[480px] pt-[2px]">
        {items.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {isFetching ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                {t('search.searching', 'Recherche...')}
              </span>
            ) : (
              t('search.no_suggestions', 'Aucune suggestion. Appuyez sur Entrée pour lancer la recherche complète.')
            )}
          </div>
        )}

        {items.length > 0 && (
          <ul ref={listRef} className="py-1">
            {items.map((it, idx) => {
              const Icon = it.kind === 'smart' ? it.icon : it.icon
              const isActive = idx === selectedIndex
              const category =
                it.kind === 'smart' ? it.category : t(`search.type_${it.type}`, it.type)
              return (
                <li key={it.id} data-idx={idx}>
                  <button
                    type="button"
                    // Fire on mousedown so we beat the input's blur event.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickItem(it)
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                      isActive
                        ? 'bg-primary/[0.10] text-foreground'
                        : 'text-foreground hover:bg-muted/40',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-md shrink-0',
                        isActive
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted/60 text-muted-foreground',
                      )}
                    >
                      <Icon size={13} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate">{it.label}</span>
                        <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70 shrink-0">
                          {category}
                        </span>
                      </span>
                      {it.subtitle && (
                        <span className="block text-[11px] text-muted-foreground truncate">
                          {it.subtitle}
                        </span>
                      )}
                    </span>
                    {it.kind === 'smart' && it.action === 'copy' ? (
                      <Calculator size={11} className="text-muted-foreground/60 shrink-0" />
                    ) : (
                      <ArrowRight size={11} className="text-muted-foreground/50 shrink-0" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Footer — fallback hint */}
      {canSearch && (
        <div className="border-t border-border/60 bg-muted/15 px-3 py-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            <kbd className="px-1 py-0.5 rounded bg-background border border-border/60 font-mono text-[10px]">
              ↵
            </kbd>{' '}
            {items.length > 0
              ? t('search.hint_enter_select', 'pour ouvrir la sélection')
              : t('search.hint_enter_full', 'pour la recherche complète')}
          </span>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              onFallback()
            }}
            className="text-primary hover:underline"
          >
            {t('search.view_full_results', 'Voir tous les résultats →')}
          </button>
        </div>
      )}
    </div>
  )
}
