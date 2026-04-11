/**
 * ProjectPicker — Searchable dropdown for selecting a project.
 *
 * Same UX pattern as AssetPicker:
 * - Search filter with live filtering (name, code, status)
 * - Recently/frequently used projects tracked via localStorage
 * - Shows project code, name, status badge, and priority
 * - Keyboard accessible, outside-click dismissal
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, FolderKanban, Loader2, X, Clock, Star, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjects } from '@/hooks/useProjets'

// ── Recency tracking (localStorage) ──────────────────────────
const RECENT_KEY = 'opsflux:project-picker:recent'
const MAX_RECENT = 6

interface RecentProject {
  id: string
  code: string
  name: string
  status: string
  count: number
  lastUsed: number
}

function getRecentProjects(): RecentProject[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}

function trackProjectUsage(project: { id: string; code: string; name: string; status: string }) {
  const recents = getRecentProjects()
  const idx = recents.findIndex(r => r.id === project.id)
  if (idx >= 0) {
    recents[idx].count += 1
    recents[idx].lastUsed = Date.now()
  } else {
    recents.push({ ...project, count: 1, lastUsed: Date.now() })
  }
  recents.sort((a, b) => {
    const scoreA = a.count * Math.log(a.lastUsed)
    const scoreB = b.count * Math.log(b.lastUsed)
    return scoreB - scoreA
  })
  localStorage.setItem(RECENT_KEY, JSON.stringify(recents.slice(0, MAX_RECENT)))
}

// ── Status colors ───────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  on_hold: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

// ── Props ────────────────────────────────────────────────────
interface ProjectPickerProps {
  value?: string | null
  onChange: (projectId: string | null, project?: { id: string; code: string; name: string; asset_id?: string | null; status?: string | null }) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Filter by status */
  filterStatus?: string[]
  /** Filter by linked site/asset */
  assetId?: string | null
  /** Label shown above the picker */
  label?: string
  /** Show clear button */
  clearable?: boolean
}

// ── Main Component ───────────────────────────────────────────
export function ProjectPicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  filterStatus,
  assetId,
  label,
  clearable = true,
}: ProjectPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch all projects (lightweight list)
  const { data, isLoading } = useProjects({ page_size: 200, asset_id: assetId || undefined })
  const projects = useMemo(() => {
    const items = (data as any)?.items ?? data ?? []
    if (filterStatus?.length) return items.filter((p: any) => filterStatus.includes(p.status))
    return items
  }, [data, filterStatus])

  // Find selected project
  const selectedProject = useMemo(
    () => projects.find((p: any) => p.id === value),
    [projects, value],
  )

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return projects
    const q = search.toLowerCase()
    return projects.filter((p: any) =>
      p.name?.toLowerCase().includes(q) ||
      p.code?.toLowerCase().includes(q) ||
      p.status?.toLowerCase().includes(q)
    )
  }, [projects, search])

  // Recent projects
  const recentProjects = useMemo(() => {
    const recents = getRecentProjects()
    const existingIds = new Set(projects.map((p: any) => p.id))
    return recents.filter(r => existingIds.has(r.id))
  }, [projects])

  const handleSelect = useCallback((project: any) => {
    trackProjectUsage({ id: project.id, code: project.code, name: project.name, status: project.status })
    onChange(project.id, { id: project.id, code: project.code, name: project.name, asset_id: project.asset_id ?? null, status: project.status ?? null })
    setOpen(false)
    setSearch('')
  }, [onChange])

  const handleClear = useCallback(() => {
    onChange(null)
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
          !selectedProject && 'text-muted-foreground',
        )}
      >
        <FolderKanban size={14} className="shrink-0 text-muted-foreground" />
        <span className="truncate flex-1">
          {selectedProject
            ? `${selectedProject.name} (${selectedProject.code})`
            : placeholder || t('projets.select', 'Sélectionner un projet...')}
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
        <div className="absolute z-50 mt-1 w-full min-w-[320px] max-h-[400px] rounded-lg border border-border bg-background shadow-lg flex flex-col overflow-hidden">
          {/* Search bar */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search size={14} className="text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('common.search')}
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
                {/* Recent projects (only when no search) */}
                {!search && recentProjects.length > 0 && (
                  <div className="px-2 pb-1 mb-1 border-b border-border">
                    <div className="flex items-center gap-1.5 px-1 py-1">
                      <Clock size={10} className="text-muted-foreground" />
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Récents
                      </span>
                    </div>
                    {recentProjects.map(r => (
                      <button
                        key={r.id}
                        onClick={() => handleSelect(r)}
                        className={cn(
                          'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors',
                          r.id === value
                            ? 'bg-primary/15 text-primary font-medium'
                            : 'hover:bg-muted text-foreground',
                        )}
                      >
                        <Star size={10} className="shrink-0 text-amber-400" />
                        <span className="truncate flex-1">{r.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{r.code}</span>
                        <span className={cn('text-[9px] rounded px-1 py-0.5 shrink-0', STATUS_COLORS[r.status] || 'bg-muted text-muted-foreground')}>
                          {r.status}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Projects list */}
                {filtered.length > 0 ? (
                  <div className="px-1">
                    {filtered.map((project: any) => (
                      <button
                        key={project.id}
                        onClick={() => handleSelect(project)}
                        className={cn(
                          'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm transition-colors',
                          project.id === value
                            ? 'bg-primary/15 text-primary font-medium'
                            : 'hover:bg-muted text-foreground',
                        )}
                      >
                        <FolderKanban size={12} className="shrink-0 text-muted-foreground" />
                        <span className="truncate flex-1">{project.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0 ml-1">{project.code}</span>
                        <span className={cn('text-[9px] rounded px-1 py-0.5 shrink-0 ml-1', STATUS_COLORS[project.status] || 'bg-muted text-muted-foreground')}>
                          {project.status}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                    {t('common.no_results')}
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
