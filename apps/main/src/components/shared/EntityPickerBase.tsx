import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { safeLocal } from '@/lib/safeStorage'
import { useTranslation } from 'react-i18next'
import { useDebounce } from '@/hooks/useDebounce'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, ChevronDown, Clock, Loader2, Search, Star, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type PickerItem = {
  id: string
  label: string
  secondary?: string | null
  badge?: string | null
  keywords?: string[]
}

interface EntityPickerBaseProps<T> {
  value?: string | null
  onChange: (id: string | null, item?: T) => void
  items: T[]
  isLoading?: boolean
  disabled?: boolean
  className?: string
  label?: string
  placeholder: string
  clearable?: boolean
  minWidthClassName?: string
  icon: LucideIcon
  recentKey: string
  toItem: (item: T) => PickerItem
  onSearchChange?: (query: string) => void
  truncated?: boolean
}

const MAX_RECENT = 6

interface RecentPickerItem extends PickerItem {
  count: number
  lastUsed: number
}

function getRecentItems(storageKey: string): RecentPickerItem[] {
  try {
    return JSON.parse(safeLocal.getItem(storageKey) || '[]')
  } catch {
    return []
  }
}

function trackRecentItem(storageKey: string, item: PickerItem) {
  const recents = getRecentItems(storageKey)
  const index = recents.findIndex((recent) => recent.id === item.id)
  if (index >= 0) {
    recents[index].count += 1
    recents[index].lastUsed = Date.now()
    recents[index].label = item.label
    recents[index].secondary = item.secondary
    recents[index].badge = item.badge
    recents[index].keywords = item.keywords
  } else {
    recents.push({ ...item, count: 1, lastUsed: Date.now() })
  }
  recents.sort((a, b) => (b.count * Math.log(b.lastUsed)) - (a.count * Math.log(a.lastUsed)))
  safeLocal.setItem(storageKey, JSON.stringify(recents.slice(0, MAX_RECENT)))
}

export function EntityPickerBase<T>({
  value,
  onChange,
  items,
  isLoading,
  disabled,
  className,
  label,
  placeholder,
  clearable = true,
  minWidthClassName = 'min-w-[320px]',
  icon: Icon,
  recentKey,
  toItem,
  onSearchChange,
  truncated,
}: EntityPickerBaseProps<T>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)

  const debouncedSearch = useDebounce(search, 300)
  useEffect(() => {
    if (onSearchChange) onSearchChange(debouncedSearch)
  }, [debouncedSearch, onSearchChange])

  const normalizedItems = useMemo(() => items.map((item) => ({ raw: item, view: toItem(item) })), [items, toItem])
  const selected = useMemo(() => normalizedItems.find((item) => item.view.id === value), [normalizedItems, value])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return normalizedItems
    return normalizedItems.filter(({ view }) => {
      const haystacks = [view.label, view.secondary ?? '', ...(view.keywords ?? [])]
      return haystacks.some((entry) => entry.toLowerCase().includes(query))
    })
  }, [normalizedItems, search])

  const recents = useMemo(() => {
    const recentMap = new Map(getRecentItems(recentKey).map((item) => [item.id, item]))
    return normalizedItems
      .filter(({ view }) => recentMap.has(view.id))
      .sort((a, b) => (recentMap.get(b.view.id)?.lastUsed ?? 0) - (recentMap.get(a.view.id)?.lastUsed ?? 0))
      .slice(0, MAX_RECENT)
  }, [normalizedItems, recentKey])

  const handleSelect = useCallback((item: T) => {
    const view = toItem(item)
    trackRecentItem(recentKey, view)
    onChange(view.id, item)
    setOpen(false)
    setSearch('')
  }, [onChange, recentKey, toItem])

  const handleClear = useCallback(() => onChange(null), [onChange])

  const updateDropdownPosition = useCallback(() => {
    const anchor = rootRef.current
    if (!anchor) return

    const rect = anchor.getBoundingClientRect()
    const viewportPadding = 8
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding
    const availableAbove = rect.top - viewportPadding
    const openAbove = availableBelow < 220 && availableAbove > availableBelow
    const maxHeight = Math.max(180, Math.min(380, openAbove ? availableAbove : availableBelow))
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - rect.width - viewportPadding),
    )

    setDropdownPosition({
      top: openAbove ? Math.max(viewportPadding, rect.top - maxHeight - 4) : rect.bottom + 4,
      left,
      width: rect.width,
      maxHeight,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return
      setOpen(false)
      setSearch('')
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    updateDropdownPosition()
    inputRef.current?.focus()

    window.addEventListener('resize', updateDropdownPosition)
    window.addEventListener('scroll', updateDropdownPosition, true)
    return () => {
      window.removeEventListener('resize', updateDropdownPosition)
      window.removeEventListener('scroll', updateDropdownPosition, true)
    }
  }, [open, updateDropdownPosition])

  const dropdown = open && dropdownPosition ? (
    <div
      ref={dropdownRef}
      className={cn(
        'fixed rounded-lg border border-border bg-background shadow-lg',
        minWidthClassName,
        'flex flex-col overflow-hidden',
      )}
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
        maxHeight: dropdownPosition.maxHeight,
        zIndex: 'var(--z-dropdown)',
      }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search size={14} className="shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('common.search')}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
            <X size={12} />
          </button>
        )}
      </div>

      {truncated && !search && (
        <div className="flex items-start gap-1.5 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          <span>{t('common.picker_truncated', 'Liste tronquee - utilisez la recherche pour trouver une entree precise.')}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {!search && recents.length > 0 && (
              <div className="mb-1 border-b border-border px-2 pb-1">
                <div className="flex items-center gap-1.5 px-1 py-1">
                  <Clock size={10} className="text-muted-foreground" />
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Recents</span>
                </div>
                {recents.map(({ raw, view }) => (
                  <button
                    key={`recent-${view.id}`}
                    type="button"
                    onClick={() => handleSelect(raw)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors',
                      view.id === value ? 'bg-primary/15 text-primary font-medium' : 'text-foreground hover:bg-muted',
                    )}
                  >
                    <Star size={10} className="shrink-0 text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs">{view.label}</div>
                      {view.secondary && <div className="truncate text-[10px] text-muted-foreground">{view.secondary}</div>}
                    </div>
                    {view.badge && <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">{view.badge}</span>}
                  </button>
                ))}
              </div>
            )}

            {filtered.length > 0 ? (
              <div className="px-1">
                {filtered.map(({ raw, view }) => (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => handleSelect(raw)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors',
                      view.id === value ? 'bg-primary/15 text-primary font-medium' : 'text-foreground hover:bg-muted',
                    )}
                  >
                    <Icon size={12} className="shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs">{view.label}</div>
                      {view.secondary && <div className="truncate text-[10px] text-muted-foreground">{view.secondary}</div>}
                    </div>
                    {view.badge && <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">{view.badge}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">{t('common.no_results')}</div>
            )}
          </>
        )}
      </div>
    </div>
  ) : null

  return (
    <div className={cn('relative', className)} ref={rootRef}>
      {label && (
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </label>
      )}

      <div
        className={cn(
          'flex h-8 w-full items-center gap-1 rounded-md border border-border bg-background px-2.5 text-sm transition-colors',
          'hover:border-primary/50 focus-within:ring-1 focus-within:ring-primary/30',
          disabled && 'cursor-not-allowed opacity-50',
          !selected && 'text-muted-foreground',
        )}
      >
        <button
          type="button"
          onClick={() => !disabled && setOpen(!open)}
          disabled={disabled}
          className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none disabled:cursor-not-allowed"
        >
          <Icon size={14} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs">
            {selected ? selected.view.secondary ? `${selected.view.label} (${selected.view.secondary})` : selected.view.label : placeholder}
          </span>
          <ChevronDown size={14} className={cn('shrink-0 transition-transform', open && 'rotate-180')} />
        </button>
        {clearable && value && (
          <button type="button" onClick={(e) => { e.stopPropagation(); handleClear() }} className="shrink-0 rounded p-0.5 hover:bg-muted">
            <X size={12} />
          </button>
        )}
      </div>

      {dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  )
}
