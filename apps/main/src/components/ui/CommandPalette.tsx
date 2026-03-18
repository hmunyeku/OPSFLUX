/**
 * CommandPalette — Ctrl+K / Cmd+K global search overlay.
 *
 * GitLab-style command palette built from scratch (no cmdk dependency).
 * Supports static page navigation, debounced API search, and full
 * keyboard navigation with proper focus management and accessibility.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Search,
  LayoutDashboard,
  MapPin,
  Building2,
  Users,
  GitBranch,
  Settings,
  FileText,
  User,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

// ── Types ───────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CommandItem {
  id: string
  label: string
  icon: LucideIcon
  url: string
  subtitle?: string
  category: string
}

interface SearchResult {
  type: string
  id: string | number
  title: string
  subtitle?: string
  url: string
}

// ── Static pages ────────────────────────────────────────────────

const PAGES: CommandItem[] = [
  { id: 'page-dashboard',   label: 'Dashboard',    icon: LayoutDashboard, url: '/dashboard',  category: 'Pages' },
  { id: 'page-assets',      label: 'Assets',       icon: MapPin,          url: '/assets',     category: 'Pages' },
  { id: 'page-tiers',       label: 'Tiers',        icon: Building2,       url: '/tiers',      category: 'Pages' },
  { id: 'page-users',       label: 'Utilisateurs', icon: Users,           url: '/users',      category: 'Pages' },
  { id: 'page-workflow',    label: 'Workflow',      icon: GitBranch,       url: '/workflow',   category: 'Pages' },
  { id: 'page-settings',    label: 'Parametres',   icon: Settings,        url: '/settings',   category: 'Pages' },
]

const RECENT_STORAGE_KEY = 'opsflux_cmd_recents'
const MAX_RECENTS = 5

// ── Helpers ─────────────────────────────────────────────────────

function getRecents(): CommandItem[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY)
    if (!raw) return []
    const ids: string[] = JSON.parse(raw)
    return ids
      .map((id) => PAGES.find((p) => p.id === id))
      .filter((p): p is CommandItem => p !== undefined)
  } catch {
    return []
  }
}

function saveRecent(id: string) {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY)
    const ids: string[] = raw ? JSON.parse(raw) : []
    const next = [id, ...ids.filter((i) => i !== id)].slice(0, MAX_RECENTS)
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // localStorage may be unavailable — silently ignore
  }
}

function iconForResultType(type: string): LucideIcon {
  switch (type) {
    case 'asset':      return MapPin
    case 'tier':       return Building2
    case 'user':       return User
    case 'document':   return FileText
    case 'workflow':   return GitBranch
    default:           return FileText
  }
}

// ── Component ───────────────────────────────────────────────────

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchResults, setSearchResults] = useState<CommandItem[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Recents ─────────────────────────────────────────────────
  const [recents, setRecents] = useState<CommandItem[]>([])

  useEffect(() => {
    if (open) {
      setRecents(getRecents())
    }
  }, [open])

  // ── Build the flat list of visible items ────────────────────
  const visibleItems = useMemo(() => {
    const items: CommandItem[] = []

    if (query.length === 0) {
      // Show recents, then all pages
      if (recents.length > 0) {
        recents.forEach((r) =>
          items.push({ ...r, id: `recent-${r.id}`, category: 'Recents' }),
        )
      }
      PAGES.forEach((p) => items.push(p))
    } else {
      // Filter static pages by query
      const q = query.toLowerCase()
      const matchedPages = PAGES.filter((p) =>
        p.label.toLowerCase().includes(q),
      )
      matchedPages.forEach((p) => items.push(p))

      // Append API search results
      searchResults.forEach((r) => items.push(r))
    }

    return items
  }, [query, recents, searchResults])

  // ── Group items by category for rendering ───────────────────
  const groups = useMemo(() => {
    const map = new Map<string, CommandItem[]>()
    for (const item of visibleItems) {
      const existing = map.get(item.category)
      if (existing) {
        existing.push(item)
      } else {
        map.set(item.category, [item])
      }
    }
    return map
  }, [visibleItems])

  // ── Clamp selectedIndex when list changes ───────────────────
  useEffect(() => {
    setSelectedIndex((prev) =>
      visibleItems.length === 0 ? 0 : Math.min(prev, visibleItems.length - 1),
    )
  }, [visibleItems])

  // ── Debounced API search ────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (query.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get<{ results: SearchResult[] }>(
          '/api/v1/search',
          { params: { q: query } },
        )
        const mapped: CommandItem[] = (res.data.results ?? []).map((r) => ({
          id: `search-${r.type}-${r.id}`,
          label: r.title,
          subtitle: r.subtitle,
          icon: iconForResultType(r.type),
          url: r.url,
          category: 'Resultats',
        }))
        setSearchResults(mapped)
      } catch {
        // Search endpoint may not exist yet — fail gracefully
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query])

  // ── Focus input on open, reset state on close ───────────────
  useEffect(() => {
    if (open) {
      // Small timeout ensures the DOM is painted before focusing
      const timer = setTimeout(() => inputRef.current?.focus(), 10)
      return () => clearTimeout(timer)
    } else {
      setQuery('')
      setSelectedIndex(0)
      setSearchResults([])
      setIsSearching(false)
    }
  }, [open])

  // ── Navigation action ───────────────────────────────────────
  const selectItem = useCallback(
    (item: CommandItem) => {
      // Persist to recents (use original page id for static pages)
      const pageId = item.id.startsWith('recent-')
        ? item.id.replace('recent-', '')
        : item.id
      const staticPage = PAGES.find((p) => p.id === pageId)
      if (staticPage) {
        saveRecent(staticPage.id)
      }

      onOpenChange(false)
      navigate(item.url)
    },
    [navigate, onOpenChange],
  )

  // ── Keyboard handler ────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          setSelectedIndex((prev) =>
            prev < visibleItems.length - 1 ? prev + 1 : 0,
          )
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : visibleItems.length - 1,
          )
          break
        }
        case 'Enter': {
          e.preventDefault()
          const item = visibleItems[selectedIndex]
          if (item) selectItem(item)
          break
        }
        case 'Escape': {
          e.preventDefault()
          onOpenChange(false)
          break
        }
        default:
          break
      }
    },
    [visibleItems, selectedIndex, selectItem, onOpenChange],
  )

  // ── Scroll selected item into view ──────────────────────────
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(
      `[data-index="${selectedIndex}"]`,
    ) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // ── Focus trap: keep focus inside the dialog ────────────────
  const handleBackdropKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Tab') {
        // Prevent tabbing out — keep focus on the input
        e.preventDefault()
        inputRef.current?.focus()
      }
    },
    [],
  )

  // ── Render ──────────────────────────────────────────────────
  if (!open) return null

  let flatIndex = -1

  return (
    <div
      ref={backdropRef}
      role="dialog"
      aria-label={t('search.command_palette')}
      aria-modal="true"
      className="fixed inset-0 z-modal flex items-start justify-center pt-[15vh] px-4"
      onKeyDown={handleBackdropKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className={cn(
          'relative w-full max-w-xl',
          'bg-popover text-popover-foreground',
          'rounded-lg shadow-pajamas-lg',
          'border border-border',
          'flex flex-col overflow-hidden',
        )}
        onKeyDown={handleKeyDown}
      >
        {/* ── Search input ─────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search
            size={16}
            className="shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            placeholder={t('search.placeholder')}
            className={cn(
              'flex-1 h-11 bg-transparent border-0 outline-none',
              'text-base text-foreground placeholder:text-muted-foreground',
            )}
            aria-label={t('common.search')}
            aria-autocomplete="list"
            aria-controls="command-palette-list"
            aria-activedescendant={
              visibleItems[selectedIndex]
                ? `cmd-item-${selectedIndex}`
                : undefined
            }
            role="combobox"
            aria-expanded={visibleItems.length > 0}
          />
          <kbd
            className={cn(
              'hidden sm:inline-flex items-center',
              'px-1.5 h-5 rounded-sm border border-border',
              'text-[10px] font-medium text-muted-foreground',
              'select-none pointer-events-none',
            )}
          >
            ESC
          </kbd>
        </div>

        {/* ── Results list ─────────────────────────────────── */}
        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label={t('search.results_label')}
          className="max-h-[320px] overflow-y-auto py-1"
        >
          {visibleItems.length === 0 && !isSearching && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {query.length >= 2
                ? t('search.no_results')
                : t('search.start_typing')}
            </div>
          )}

          {isSearching && visibleItems.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t('search.loading')}
            </div>
          )}

          {Array.from(groups.entries()).map(([category, items]) => (
            <div key={category} role="group" aria-label={category}>
              {/* Section header */}
              <div
                className={cn(
                  'px-4 pt-2 pb-1',
                  'text-[11px] font-semibold uppercase tracking-wider',
                  'text-muted-foreground select-none',
                )}
              >
                {category}
              </div>

              {/* Items */}
              {items.map((item) => {
                flatIndex++
                const idx = flatIndex
                const isSelected = idx === selectedIndex
                const Icon = item.icon

                return (
                  <div
                    key={item.id}
                    id={`cmd-item-${idx}`}
                    data-index={idx}
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      'flex items-center h-10 mx-1 px-3 gap-3 rounded-md',
                      'cursor-pointer select-none',
                      'transition-colors duration-75',
                      isSelected
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground hover:bg-accent/50',
                    )}
                    onClick={() => selectItem(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <Icon
                      size={16}
                      className="shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="text-sm font-medium truncate">
                      {item.label}
                    </span>
                    {item.subtitle && (
                      <span className="ml-auto text-xs text-muted-foreground truncate">
                        {item.subtitle}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* ── Footer hints ─────────────────────────────────── */}
        <div
          className={cn(
            'flex items-center gap-4 px-4 h-8 border-t border-border',
            'text-[11px] text-muted-foreground select-none',
          )}
        >
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 rounded-sm border border-border text-[10px]">&uarr;</kbd>
            <kbd className="px-1 rounded-sm border border-border text-[10px]">&darr;</kbd>
            <span className="ml-0.5">{t('search.navigate')}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 rounded-sm border border-border text-[10px]">&crarr;</kbd>
            <span className="ml-0.5">{t('search.open')}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 rounded-sm border border-border text-[10px]">esc</kbd>
            <span className="ml-0.5">{t('search.close')}</span>
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Global keyboard shortcut hook ───────────────────────────────

export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return { open, setOpen }
}
