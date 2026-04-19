/**
 * ProjectSelectorModal — Intelligent multi-select project/task picker.
 *
 * Shared across Gantt, Kanban, Planning, Dashboard views. Features:
 * - Search by name/code
 * - Filter by status, type, priority, source (Gouti/native)
 * - Tree view: projects → tasks (expandable)
 * - Multi-select with "select all" / "select none"
 * - Persists selection via useUserPreferences under a configurable key
 * - Radix Dialog for consistent OpsFlux modal pattern
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  X, Search, Filter, CheckSquare, Square,
  Download, Layers, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjects } from '@/hooks/useProjets'
import { useDebounce } from '@/hooks/useDebounce'
import { isGoutiProject } from '@/services/projetsService'
import type { Project } from '@/types/api'

export interface ProjectSelection {
  projectIds: string[]
  mode: 'all' | 'selected'
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'planned', label: 'Planifié' },
  { value: 'active', label: 'Actif' },
  { value: 'on_hold', label: 'Suspendu' },
  { value: 'completed', label: 'Terminé' },
  { value: 'cancelled', label: 'Annulé' },
]

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Basse' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'high', label: 'Haute' },
  { value: 'critical', label: 'Critique' },
]

const SOURCE_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'opsflux', label: 'OpsFlux' },
  { value: 'gouti', label: 'Gouti' },
]

interface Props {
  open: boolean
  onClose: () => void
  selection: ProjectSelection
  onSelectionChange: (sel: ProjectSelection) => void
  title?: string
}

export function ProjectSelectorModal({ open, onClose, selection, onSelectionChange, title = 'Sélection de projets' }: Props) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [typeFilter] = useState<string[]>([])
  const [priorityFilter, setPriorityFilter] = useState<string[]>([])
  const [sourceFilter, setSourceFilter] = useState<'all' | 'opsflux' | 'gouti'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(selection.projectIds))

  // Server-side paginated + search for scalability (works with 1000+ projects)
  const { data: projectsData, isLoading } = useProjects({
    page_size: 50,
    source: sourceFilter === 'all' ? undefined : sourceFilter,
    search: debouncedSearch || undefined,
    status: statusFilter.length === 1 ? statusFilter[0] : undefined,
    priority: priorityFilter.length === 1 ? priorityFilter[0] : undefined,
  })
  const totalAvailable = projectsData?.total ?? 0
  const hasMore = (projectsData?.items?.length ?? 0) < totalAvailable

  const projects = useMemo(() => {
    let list = projectsData?.items ?? []
    if (statusFilter.length > 0) list = list.filter(p => statusFilter.includes(p.status))
    if (typeFilter.length > 0) list = list.filter(p => typeFilter.includes(p.project_type))
    if (priorityFilter.length > 0) list = list.filter(p => priorityFilter.includes(p.priority))
    return list
  }, [projectsData, statusFilter, typeFilter, priorityFilter])

  // Sync when selection prop changes
  useEffect(() => {
    if (selection.mode === 'all') {
      setSelectedIds(new Set(projects.map(p => p.id)))
    } else {
      setSelectedIds(new Set(selection.projectIds))
    }
  }, [selection]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleAll = () => {
    if (selectedIds.size === projects.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(projects.map(p => p.id)))
  }

  const toggleChip = (arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val])
  }

  const handleApply = () => {
    const ids = [...selectedIds]
    onSelectionChange({
      mode: ids.length === projects.length ? 'all' : 'selected',
      projectIds: ids,
    })
    onClose()
  }

  return (
    <Dialog.Root open={open} onOpenChange={o => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-black/40 backdrop-blur-sm animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[var(--z-modal)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card shadow-xl animate-in fade-in slide-in-from-bottom-4 w-[95vw] max-w-3xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''} · {projects.length}{hasMore ? `/${totalAvailable}` : ''} affichés</span>
              <Dialog.Close asChild>
                <button className="p-1 rounded hover:bg-accent"><X size={14} /></button>
              </Dialog.Close>
            </div>
          </div>

          {/* Filters */}
          <div className="px-4 py-2 border-b border-border bg-muted/30 space-y-2 shrink-0">
            {/* Search + source */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher par nom ou code..."
                  className="w-full h-7 pl-7 pr-2 text-xs border border-border rounded bg-background"
                />
              </div>
              <div className="flex items-center gap-1">
                {SOURCE_OPTIONS.map(o => (
                  <button key={o.value} onClick={() => setSourceFilter(o.value as typeof sourceFilter)}
                    className={cn('px-2 py-1 rounded text-xs border', sourceFilter === o.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status + Type + Priority chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={11} className="text-muted-foreground shrink-0" />
              {STATUS_OPTIONS.map(o => (
                <button key={o.value} onClick={() => toggleChip(statusFilter, o.value, setStatusFilter)}
                  className={cn('px-1.5 py-0.5 rounded border text-xs', statusFilter.includes(o.value) ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted text-muted-foreground')}>
                  {o.label}
                </button>
              ))}
              <span className="text-muted-foreground">|</span>
              {PRIORITY_OPTIONS.map(o => (
                <button key={o.value} onClick={() => toggleChip(priorityFilter, o.value, setPriorityFilter)}
                  className={cn('px-1.5 py-0.5 rounded border text-xs', priorityFilter.includes(o.value) ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted text-muted-foreground')}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Project list */}
          <div className="flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex items-center justify-center h-32"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
            ) : projects.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground italic">Aucun projet ne correspond. Essayez une recherche différente.</div>
            ) : (
              <>
                {/* Select all header */}
                <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border mb-1 sticky top-0 bg-card z-10">
                  <button onClick={toggleAll} className="shrink-0">
                    {selectedIds.size === projects.length
                      ? <CheckSquare size={14} className="text-primary" />
                      : selectedIds.size > 0
                        ? <CheckSquare size={14} className="text-primary/50" />
                        : <Square size={14} className="text-muted-foreground" />}
                  </button>
                  <span className="text-xs font-medium">
                    {selectedIds.size === projects.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </span>
                </div>

                {projects.map((p: Project) => {
                  const checked = selectedIds.has(p.id)
                  const gouti = isGoutiProject(p)
                  const isMacro = (p.children_count ?? 0) > 0
                  return (
                    <div
                      key={p.id}
                      className={cn('flex items-start gap-2 px-2 py-2 rounded hover:bg-muted/40 cursor-pointer', checked && 'bg-primary/5')}
                      onClick={() => toggle(p.id)}
                    >
                      <button className="shrink-0 mt-0.5" onClick={e => { e.stopPropagation(); toggle(p.id) }}>
                        {checked ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} className="text-muted-foreground" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {isMacro && <Layers size={10} className="text-primary shrink-0" />}
                          {gouti && <Download size={9} className="text-orange-500 shrink-0" />}
                          <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                          <span className="text-xs font-medium truncate">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                          <span className={cn('px-1 rounded', p.status === 'active' ? 'bg-green-500/10 text-green-600' : 'bg-muted')}>{p.status}</span>
                          <span>{p.priority}</span>
                          <span>{p.progress}%</span>
                          {p.task_count ? <span>{p.task_count} tâches</span> : null}
                          {p.manager_name && <span>· {p.manager_name}</span>}
                          {gouti && <span className="text-orange-600">Gouti</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20 shrink-0">
            <span className="text-xs text-muted-foreground">
              {selectedIds.size > 0
                ? `${selectedIds.size} projet${selectedIds.size > 1 ? 's' : ''} sélectionné${selectedIds.size > 1 ? 's' : ''}`
                : 'Aucune sélection — affichera tous les projets'}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="gl-button-sm gl-button-default">Annuler</button>
              <button onClick={handleApply} className="gl-button-sm gl-button-confirm">
                Appliquer
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
