import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown, Clock, Loader2, Search, Star, X } from 'lucide-react'
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
}

const MAX_RECENT = 6

interface RecentPickerItem extends PickerItem {
  count: number
  lastUsed: number
}

function getRecentItems(storageKey: string): RecentPickerItem[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '[]')
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
  localStorage.setItem(storageKey, JSON.stringify(recents.slice(0, MAX_RECENT)))
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
}: EntityPickerBaseProps<T>) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      {label && (
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </label>
      )}

      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'flex h-8 w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 text-left text-sm transition-colors',
          'hover:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30',
          disabled && 'cursor-not-allowed opacity-50',
          !selected && 'text-muted-foreground',
        )}
      >
        <Icon size={14} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs">
          {selected ? selected.view.secondary ? `${selected.view.label} (${selected.view.secondary})` : selected.view.label : placeholder}
        </span>
        {clearable && value && (
          <button type="button" onClick={(e) => { e.stopPropagation(); handleClear() }} className="shrink-0 rounded p-0.5 hover:bg-muted">
            <X size={12} />
          </button>
        )}
        <ChevronDown size={14} className={cn('shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className={cn('absolute z-50 mt-1 max-h-[380px] w-full rounded-lg border border-border bg-background shadow-lg', minWidthClassName, 'flex flex-col overflow-hidden')}>
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search size={14} className="shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
                <X size={12} />
              </button>
            )}
          </div>

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
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">Aucun résultat</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
