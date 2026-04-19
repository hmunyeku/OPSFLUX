/**
 * ActivityPicker — Searchable combobox for selecting a planner activity.
 *
 * Same UX pattern as AssetPicker:
 * - Trigger button showing selected activity
 * - Dropdown with search, recent tracking, flat list
 * - Shows title, type badge, status badge, asset name, dates
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Loader2, X, Clock, Star, ChevronDown, ListTodo, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActivities } from '@/hooks/usePlanner'
import { useDebounce } from '@/hooks/useDebounce'
import type { PlannerActivity } from '@/types/api'

// ── Recency tracking (localStorage) ──────────────────────────
const RECENT_KEY = 'opsflux:activity-picker:recent'
const MAX_RECENT = 6

interface RecentActivity {
  id: string
  title: string
  type: string
  status: string
  count: number
  lastUsed: number
}

function getRecentActivities(): RecentActivity[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}

function trackActivityUsage(a: { id: string; title: string; type: string; status: string }) {
  const recents = getRecentActivities()
  const idx = recents.findIndex(r => r.id === a.id)
  if (idx >= 0) {
    recents[idx].count += 1
    recents[idx].lastUsed = Date.now()
  } else {
    recents.push({ ...a, count: 1, lastUsed: Date.now() })
  }
  recents.sort((a, b) => b.count * Math.log(b.lastUsed) - a.count * Math.log(a.lastUsed))
  localStorage.setItem(RECENT_KEY, JSON.stringify(recents.slice(0, MAX_RECENT)))
}

// ── Status/Type badges ──────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  submitted: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  validated: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-medium', STATUS_COLORS[status] || 'bg-muted text-muted-foreground')}>
      {status}
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
      {type}
    </span>
  )
}

// ── Activity row ────────────────────────────────────────────
function ActivityRow({
  activity,
  isSelected,
  onClick,
}: {
  activity: PlannerActivity | RecentActivity
  isSelected: boolean
  onClick: () => void
}) {
  const a = activity as PlannerActivity
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm transition-colors',
        isSelected
          ? 'bg-primary/15 text-primary font-medium'
          : 'hover:bg-muted text-foreground',
      )}
    >
      <ListTodo size={12} className="shrink-0 text-muted-foreground" />
      <span className="truncate flex-1 text-xs">{a.title}</span>
      <TypeBadge type={a.type} />
      <StatusBadge status={a.status} />
      {a.start_date && (
        <span className="text-[9px] text-muted-foreground shrink-0 flex items-center gap-0.5">
          <Calendar size={8} />
          {new Date(a.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
        </span>
      )}
    </button>
  )
}

// ── Props ────────────────────────────────────────────────────
interface ActivityPickerProps {
  value?: string | null
  onChange: (activityId: string | null, activity?: PlannerActivity) => void
  /** Activity ID to exclude from results (e.g., current activity) */
  excludeId?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  label?: string
  clearable?: boolean
}

// ── Main Component ──────────────────────────────────────────
export function ActivityPicker({
  value,
  onChange,
  excludeId,
  placeholder = 'Sélectionner une activité...',
  disabled,
  className,
  label,
  clearable = true,
}: ActivityPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 200)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useActivities({
    page: 1,
    page_size: 20,
    search: debouncedSearch || undefined,
  })

  const items = useMemo(() => {
    const list = data?.items ?? []
    return excludeId ? list.filter(a => a.id !== excludeId) : list
  }, [data, excludeId])

  // Find selected activity name
  const selectedActivity = useMemo(() => items.find(a => a.id === value), [items, value])
  const [selectedLabel, setSelectedLabel] = useState('')

  // Keep the label stable even if the item is not in current search results
  useEffect(() => {
    if (selectedActivity) {
      setSelectedLabel(selectedActivity.title)
    }
  }, [selectedActivity])

  // Recent activities
  const recentActivities = useMemo(() => {
    const recents = getRecentActivities()
    return excludeId ? recents.filter(r => r.id !== excludeId) : recents
  }, [excludeId])

  const handleSelect = useCallback((activity: PlannerActivity | RecentActivity) => {
    const a = activity as PlannerActivity
    trackActivityUsage({ id: a.id, title: a.title, type: a.type, status: a.status })
    setSelectedLabel(a.title)
    onChange(a.id, a)
    setOpen(false)
    setSearch('')
  }, [onChange])

  const handleClear = useCallback(() => {
    onChange(null)
    setSelectedLabel('')
  }, [onChange])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Focus search when opened
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      {label && (
        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1 block">
          {label}
        </label>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 h-8 text-sm text-left transition-colors',
          'hover:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30',
          disabled && 'opacity-50 cursor-not-allowed',
          !value && 'text-muted-foreground',
        )}
      >
        <ListTodo size={14} className="shrink-0 text-muted-foreground" />
        <span className="truncate flex-1 text-xs">
          {value && selectedLabel ? selectedLabel : placeholder}
        </span>
        {clearable && value && (
          <button
            onClick={(e) => { e.stopPropagation(); handleClear() }}
            className="shrink-0 p-0.5 rounded hover:bg-muted"
          >
            <X size={12} />
          </button>
        )}
        <ChevronDown size={14} className={cn('shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[380px] max-h-[350px] rounded-lg border border-border bg-background shadow-lg flex flex-col overflow-hidden">
          {/* Search bar */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search size={14} className="text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('shared.rechercher_une_activite')}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto py-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Recent activities (only when no search) */}
                {!search && recentActivities.length > 0 && (
                  <div className="px-2 pb-1 mb-1 border-b border-border">
                    <div className="flex items-center gap-1.5 px-1 py-1">
                      <Clock size={10} className="text-muted-foreground" />
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('assets.recent')}</span>
                    </div>
                    {recentActivities.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handleSelect(r as unknown as PlannerActivity)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm transition-colors',
                          r.id === value ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-muted text-foreground',
                        )}
                      >
                        <Star size={10} className="shrink-0 text-amber-400" />
                        <span className="truncate flex-1 text-xs">{r.title}</span>
                        <TypeBadge type={r.type} />
                        <StatusBadge status={r.status} />
                      </button>
                    ))}
                  </div>
                )}

                {/* Activity list */}
                {items.length > 0 ? (
                  <div className="px-1">
                    {items.map(a => (
                      <ActivityRow
                        key={a.id}
                        activity={a}
                        isSelected={a.id === value}
                        onClick={() => handleSelect(a)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                    Aucune activité trouvée
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
