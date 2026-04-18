/**
 * Gouti import modal, catalog browser, and sync toolbar.
 *
 * Extracted from ProjetsPage.tsx — pure restructure, no behavior changes.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import {
  Loader2, X, Download, Milestone, ChevronRight, Layers, RefreshCw,
  ChevronDown, Filter, Search, Settings2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import { useToast } from '@/components/ui/Toast'
import {
  useGoutiStatus, useGoutiFacets, useGoutiCatalog, useGoutiDefaultFilters, useGoutiSetDefaultFilters,
  useGoutiSaveSelection, useGoutiSyncSelected, useGoutiProjectTasks,
} from '@/hooks/useProjets'
import type {
  GoutiCatalogFilters, GoutiCatalogProject, GoutiCatalogTask, GoutiSelectionPayload,
  GoutiProjectSelection, GoutiTaskSelection,
} from '@/services/projetsService'
import { PROJECT_STATUS_LABELS_FALLBACK } from '../shared'

// ── Gouti task treegrid used by the import modal ────────────────────────
//
// Gouti tasks come with a flat list + a synthesized ``parent_ref`` built
// from ``level_ta`` + ``order_ta``. This component rebuilds the nested
// tree, supports collapsible parent rows, and visually indents children
// so users can see the real hierarchy before picking which tasks to
// import. Milestones (``is_milestone``) get a diamond icon and macro
// grouping rows (``is_macro``) get a folder icon.
function GoutiTaskTree({
  tasks,
  taskMode,
  included,
  selectedTaskIds,
  onToggleTaskId,
}: {
  tasks: GoutiCatalogTask[]
  taskMode: 'all' | 'some' | 'none'
  included: boolean
  selectedTaskIds: string[]
  onToggleTaskId: (taskId: string, ensureSelectedIds?: string[]) => void
}) {
  // Build children map keyed by parent_ref (null for roots)
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, GoutiCatalogTask[]>()
    for (const t of tasks) {
      const k = t.parent_ref ?? null
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(t)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }
    return map
  }, [tasks])

  // §1.3: Build gouti_id → parent gouti_id map for ancestor auto-inclusion
  const parentOf = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const t of tasks) {
      map.set(t.gouti_id, t.parent_ref ?? null)
    }
    return map
  }, [tasks])

  // Walk up parent chain to collect all ancestor IDs
  const getAncestorIds = useCallback((taskId: string): string[] => {
    const ancestors: string[] = []
    let current = parentOf.get(taskId)
    while (current) {
      ancestors.push(current)
      current = parentOf.get(current) ?? null
    }
    return ancestors
  }, [parentOf])

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const disabled = taskMode !== 'some' || !included
  const selectedSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds])

  // Collect all non-macro leaf descendants of a macro task
  const getLeafDescendants = useCallback((parentId: string): string[] => {
    const children = childrenOf.get(parentId) || []
    if (children.length === 0) return []
    const leaves: string[] = []
    for (const child of children) {
      if (!child.is_macro) leaves.push(child.gouti_id)
      leaves.push(...getLeafDescendants(child.gouti_id))
    }
    return leaves
  }, [childrenOf])

  // Toggle all non-macro descendants of a macro task
  const toggleMacro = useCallback((macroId: string) => {
    const leafIds = getLeafDescendants(macroId)
    if (leafIds.length === 0) return
    const allSelected = leafIds.every(id => selectedSet.has(id))
    for (const id of leafIds) {
      if (allSelected || !selectedSet.has(id)) {
        // §1.3: when selecting, auto-include all ancestors up to root
        onToggleTaskId(id, allSelected ? undefined : getAncestorIds(id))
      }
    }
  }, [getLeafDescendants, getAncestorIds, selectedSet, onToggleTaskId])

  const renderRow = (task: GoutiCatalogTask, depth: number): React.ReactNode => {
    const children = childrenOf.get(task.gouti_id) || []
    const hasChildren = children.length > 0
    const isCollapsed = collapsed.has(task.gouti_id)
    const checked = taskMode === 'all' || selectedSet.has(task.gouti_id)

    // For macro tasks: check if all/some/none leaf descendants are selected
    let macroState: 'all' | 'some' | 'none' = 'none'
    if (task.is_macro) {
      const leafIds = getLeafDescendants(task.gouti_id)
      if (leafIds.length > 0) {
        const count = leafIds.filter(id => selectedSet.has(id)).length
        macroState = count === leafIds.length ? 'all' : count > 0 ? 'some' : 'none'
      }
    }

    return (
      <div key={task.gouti_id} role="treeitem" aria-level={depth + 1} aria-expanded={hasChildren ? !isCollapsed : undefined}>
        <div
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 text-[10px] border-b border-border/30',
            !disabled && 'cursor-pointer hover:bg-muted/40',
            disabled && 'opacity-70',
            task.is_macro && 'bg-muted/30 font-medium',
          )}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => {
            if (disabled) return
            if (task.is_macro) toggleMacro(task.gouti_id)
            else onToggleTaskId(task.gouti_id, selectedSet.has(task.gouti_id) ? undefined : getAncestorIds(task.gouti_id))
          }}
        >
          {/* Expand/collapse chevron */}
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleCollapse(task.gouti_id) }}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground shrink-0"
              aria-label={isCollapsed ? 'Déplier' : 'Replier'}
            >
              <ChevronRight size={10} className={cn('transition-transform', !isCollapsed && 'rotate-90')} />
            </button>
          ) : (
            <span className="w-[14px] shrink-0" />
          )}

          {/* Checkbox — macro tasks show tri-state, normal tasks show regular checkbox */}
          {!task.is_macro ? (
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={(e) => { e.stopPropagation(); onToggleTaskId(task.gouti_id, selectedSet.has(task.gouti_id) ? undefined : getAncestorIds(task.gouti_id)) }}
              onClick={(e) => e.stopPropagation()}
              className="w-3 h-3 shrink-0"
            />
          ) : (
            <input
              type="checkbox"
              checked={macroState === 'all'}
              ref={(el) => { if (el) el.indeterminate = macroState === 'some' }}
              disabled={disabled}
              onChange={(e) => { e.stopPropagation(); toggleMacro(task.gouti_id) }}
              onClick={(e) => e.stopPropagation()}
              className="w-3 h-3 shrink-0"
            />
          )}

          {/* Type icon */}
          {task.is_milestone ? (
            <Milestone size={10} className="text-yellow-600 shrink-0" />
          ) : task.is_macro ? (
            <Layers size={10} className="text-primary shrink-0" />
          ) : null}

          {/* Code + name */}
          <span className="font-mono text-[8px] text-muted-foreground/60 shrink-0">{task.code}</span>
          <span className="flex-1 truncate">{task.name}</span>

          {/* Rich meta: dates, status, progress, workload */}
          {task.start_date && (
            <span className="text-[8px] text-muted-foreground tabular-nums shrink-0">
              {new Date(task.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
            </span>
          )}
          {task.end_date && (
            <span className="text-[8px] text-muted-foreground tabular-nums shrink-0">
              → {new Date(task.end_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
            </span>
          )}
          {task.progress != null && task.progress > 0 && (
            <span className={cn('text-[8px] font-semibold tabular-nums shrink-0', task.progress >= 80 ? 'text-emerald-600' : task.progress >= 40 ? 'text-blue-600' : 'text-orange-600')}>
              {task.progress}%
            </span>
          )}
          {task.status_raw && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground shrink-0">{task.status_raw}</span>
          )}
          {task.workload != null && task.workload > 0 && (
            <span className="text-[8px] text-muted-foreground/50 tabular-nums shrink-0">{task.workload}h</span>
          )}
        </div>

        {hasChildren && !isCollapsed && (
          <div role="group">
            {children.map(child => renderRow(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const roots = childrenOf.get(null) || []
  return (
    <div
      role="tree"
      aria-label="Hiérarchie des tâches Gouti"
      className="max-h-[260px] overflow-y-auto border border-border/50 rounded bg-background"
    >
      {roots.length === 0 && (
        <div className="text-center py-3 text-[10px] text-muted-foreground italic">
          Aucune tâche racine — vérifiez le filtre
        </div>
      )}
      {roots.map(r => renderRow(r, 0))}
    </div>
  )
}

// ── Single project row with expandable task tree ────────────────────────
function GoutiProjectRow({
  project,
  selection,
  onToggleInclude,
  onTaskModeChange,
  onToggleTaskId,
}: {
  project: GoutiCatalogProject
  selection: GoutiProjectSelection | undefined
  onToggleInclude: () => void
  onTaskModeChange: (mode: 'all' | 'none' | 'some') => void
  onToggleTaskId: (taskId: string, ensureSelectedIds?: string[]) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const included = !!selection?.include
  const taskMode = selection?.tasks.mode ?? 'all'
  const { data: tasksData, isLoading: tasksLoading } = useGoutiProjectTasks(
    expanded ? project.gouti_id : undefined,
  )

  return (
    <div className={cn('border border-border rounded', included && 'border-primary/40 bg-primary/5')}>
      <div className="flex items-start gap-2 p-2">
        <input
          type="checkbox"
          checked={included}
          onChange={onToggleInclude}
          onClick={e => e.stopPropagation()}
          className="w-3.5 h-3.5 mt-0.5 shrink-0"
        />
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="shrink-0 mt-0.5 p-0.5 rounded hover:bg-muted text-muted-foreground"
          aria-label="Déplier les tâches"
        >
          <ChevronRight size={12} className={cn('transition-transform', expanded && 'rotate-90')} />
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggleInclude}>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground">{project.code}</span>
            <span className="text-[11px] font-medium truncate">{project.name}</span>
          </div>
          <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5 flex-wrap">
            {project.status_raw && <span className="px-1 rounded bg-muted">{project.status_raw}</span>}
            {project.progress != null && <span>Progression {project.progress}%</span>}
            {project.manager_name && <span>· {project.manager_name}</span>}
            {project.target_date && <span>· Fin {project.target_date}</span>}
            {project.criticality && <span>· Crit. {project.criticality}</span>}
            {project.categories.slice(0, 3).map(c => (
              <span key={c.id} className="px-1 rounded bg-orange-500/10 text-orange-700">{c.name}</span>
            ))}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/50 bg-muted/20 px-2 py-2 space-y-1.5">
          {/* Task mode selector */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Tâches:</span>
            {(['all', 'some', 'none'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => onTaskModeChange(mode)}
                disabled={!included}
                className={cn(
                  'text-[9px] px-1.5 py-0.5 rounded',
                  !included && 'opacity-40',
                  taskMode === mode ? 'gl-button-sm gl-button-primary' : 'gl-button-sm gl-button-default',
                )}
              >
                {mode === 'all' ? 'Toutes' : mode === 'some' ? 'Choix' : 'Aucune'}
              </button>
            ))}
            {tasksData && (
              <span className="text-[9px] text-muted-foreground ml-auto">
                {tasksData.count} tâche{tasksData.count > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {tasksLoading && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground py-1">
              <Loader2 size={10} className="animate-spin" /> Chargement des tâches…
            </div>
          )}

          {!tasksLoading && tasksData && tasksData.items.length === 0 && (
            <div className="text-[10px] text-muted-foreground italic py-1">Aucune tâche dans ce projet</div>
          )}

          {!tasksLoading && tasksData && tasksData.items.length > 0 && taskMode !== 'none' && (
            <GoutiTaskTree
              tasks={tasksData.items}
              taskMode={taskMode}
              included={included}
              selectedTaskIds={selection?.tasks.task_ids || []}
              onToggleTaskId={onToggleTaskId}
            />
          )}
        </div>
      )}
    </div>
  )
}

function GoutiImportModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { data: facets, isLoading: facetsLoading } = useGoutiFacets()
  const { data: defaultFilters } = useGoutiDefaultFilters()
  const setDefaultFilters = useGoutiSetDefaultFilters()
  const saveSelection = useGoutiSaveSelection()
  const syncSelected = useGoutiSyncSelected()
  const { toast } = useToast()
  const projectStatusLabels = useDictionaryLabels('project_status', PROJECT_STATUS_LABELS_FALLBACK)

  const [filters, setFilters] = useState<GoutiCatalogFilters>({})
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  // Per-project selection keyed by gouti_id
  const [projectSelection, setProjectSelection] = useState<Record<string, GoutiProjectSelection>>({})
  const [showAdminDefaults, setShowAdminDefaults] = useState(false)

  const includedCount = Object.values(projectSelection).filter(s => s.include).length

  // Seed filters from admin defaults on first load
  useEffect(() => {
    if (defaultFilters && Object.keys(defaultFilters).length > 0 && Object.keys(filters).length === 0) {
      setFilters({ ...defaultFilters })
    }
  }, [defaultFilters]) // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveFilters: GoutiCatalogFilters = {
    ...filters,
    search: debouncedSearch || undefined,
  }
  const { data: catalog, isLoading: catalogLoading } = useGoutiCatalog(effectiveFilters)

  const getOrInit = (id: string): GoutiProjectSelection => (
    projectSelection[id] ?? { include: false, tasks: { mode: 'all' as const, task_ids: [] } }
  )

  const toggleProject = (id: string) => {
    setProjectSelection(prev => {
      const current = prev[id] ?? { include: false, tasks: { mode: 'all' as const, task_ids: [] } }
      return { ...prev, [id]: { ...current, include: !current.include } }
    })
  }

  const toggleAll = () => {
    if (!catalog) return
    const allSelected = catalog.items.every(p => projectSelection[p.gouti_id]?.include)
    setProjectSelection(prev => {
      const next = { ...prev }
      catalog.items.forEach(p => {
        const current = next[p.gouti_id] ?? { include: false, tasks: { mode: 'all' as const, task_ids: [] } }
        next[p.gouti_id] = { ...current, include: !allSelected }
      })
      return next
    })
  }

  const setTaskMode = (id: string, mode: 'all' | 'none' | 'some') => {
    setProjectSelection(prev => {
      const current = prev[id] ?? { include: true, tasks: { mode: 'all' as const, task_ids: [] } }
      const nextTasks: GoutiTaskSelection = {
        mode,
        task_ids: mode === 'some' ? current.tasks.task_ids : [],
      }
      return { ...prev, [id]: { ...current, tasks: nextTasks } }
    })
  }

  const toggleTaskId = (projectId: string, taskId: string, ensureSelectedIds?: string[]) => {
    setProjectSelection(prev => {
      const current = prev[projectId] ?? { include: true, tasks: { mode: 'some' as const, task_ids: [] } }
      const isRemoving = current.tasks.task_ids.includes(taskId)
      let ids = isRemoving
        ? current.tasks.task_ids.filter(x => x !== taskId)
        : [...current.tasks.task_ids, taskId]
      // §1.3: when selecting a child, ensure all ancestor IDs are included
      if (!isRemoving && ensureSelectedIds?.length) {
        const idSet = new Set(ids)
        for (const aid of ensureSelectedIds) {
          if (!idSet.has(aid)) {
            ids.push(aid)
            idSet.add(aid)
          }
        }
      }
      return {
        ...prev,
        [projectId]: {
          ...current,
          tasks: { mode: 'some' as const, task_ids: ids },
        },
      }
    })
  }

  const handleSaveAndSync = async () => {
    if (includedCount === 0) {
      toast({ title: t('projets.toast.no_project_selected'), variant: 'warning' })
      return
    }
    const payload: GoutiSelectionPayload = { projects: {} }
    Object.entries(projectSelection).forEach(([id, sel]) => {
      if (sel.include) payload.projects[id] = sel
    })
    try {
      await saveSelection.mutateAsync(payload)
      const res = await syncSelected.mutateAsync()
      toast({
        title: `${res.synced} projet${res.synced > 1 ? 's' : ''} importé${res.synced > 1 ? 's' : ''}`,
        description: `${res.created} créés, ${res.updated} mis à jour${res.errors.length ? `, ${res.errors.length} erreurs` : ''}`,
        variant: res.errors.length > 0 ? 'warning' : 'success',
      })
      onClose()
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? t('projets.toast.error')
      toast({ title: t('projets.toast.import_failed'), description: String(msg), variant: 'error' })
    }
  }

  const handleSaveAsAdminDefault = async () => {
    try {
      await setDefaultFilters.mutateAsync(filters)
      toast({ title: t('projets.toast.default_filters_saved'), variant: 'success' })
      setShowAdminDefaults(false)
    } catch {
      toast({ title: t('projets.toast.error'), variant: 'error' })
    }
  }

  const toggleCategory = (id: string) => {
    setFilters(f => {
      const current = f.category_ids || []
      const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id]
      return { ...f, category_ids: next }
    })
  }

  const toggleStatus = (v: string) => {
    setFilters(f => {
      const current = f.status || []
      const next = current.includes(v) ? current.filter(x => x !== v) : [...current, v]
      return { ...f, status: next }
    })
  }

  const toggleCriticality = (v: number) => {
    setFilters(f => {
      const current = f.criticality || []
      const next = current.includes(v) ? current.filter(x => x !== v) : [...current, v]
      return { ...f, criticality: next }
    })
  }

  const resetFilters = () => {
    setFilters({})
    setSearch('')
  }

  const activeFilterCount =
    (filters.year ? 1 : 0) +
    (filters.category_ids?.length || 0) +
    (filters.status?.length || 0) +
    (filters.manager_id ? 1 : 0) +
    (filters.criticality?.length || 0)

  const allFilteredSelected = !!catalog && catalog.items.length > 0
    && catalog.items.every(p => projectSelection[p.gouti_id]?.include)

  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-black/40 backdrop-blur-sm animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[var(--z-modal)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card shadow-xl animate-in fade-in slide-in-from-bottom-4 w-[95vw] max-w-6xl h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Download size={14} className="text-orange-500" />
              <Dialog.Title className="text-sm font-semibold">Assistant d'import Gouti</Dialog.Title>
              <span className="text-[11px] text-muted-foreground">
                {catalog ? `${catalog.filtered}/${catalog.total} projets` : '…'}
              </span>
            </div>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-muted text-muted-foreground"><X size={14} /></button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Sélectionnez les projets Gouti à importer dans OpsFlux et, pour chaque projet, les tâches à synchroniser.
          </Dialog.Description>

          {/* Body: sidebar + list */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* ── Left sidebar: filters ───────────────────────── */}
            <aside className="w-[260px] shrink-0 border-r border-border bg-muted/20 overflow-y-auto p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  <Filter size={11} /> Filtres
                  {activeFilterCount > 0 && (
                    <span className="ml-1 px-1 rounded bg-primary/10 text-primary">{activeFilterCount}</span>
                  )}
                </div>
                {activeFilterCount > 0 && (
                  <button
                    onClick={resetFilters}
                    className="text-[9px] text-primary hover:text-primary/80"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>

              {/* Search */}
              <div>
                <label className="block text-[9px] uppercase tracking-wide text-muted-foreground mb-1">
                  Recherche
                </label>
                <div className="relative">
                  <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Nom ou référence..."
                    className={`${panelInputClass} pl-6 text-xs w-full`}
                  />
                </div>
              </div>

              {facetsLoading && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loader2 size={10} className="animate-spin" /> Chargement des facettes…
                </div>
              )}

              {/* Year */}
              {facets && facets.years.length > 0 && (
                <div>
                  <label className="block text-[9px] uppercase tracking-wide text-muted-foreground mb-1">
                    Année
                  </label>
                  <select
                    value={filters.year ?? ''}
                    onChange={e => setFilters(f => ({ ...f, year: e.target.value ? Number(e.target.value) : null }))}
                    className={`${panelInputClass} text-xs w-full`}
                  >
                    <option value="">Toutes</option>
                    {facets.years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              )}

              {/* Manager */}
              {facets && facets.managers.length > 0 && (
                <div>
                  <label className="block text-[9px] uppercase tracking-wide text-muted-foreground mb-1">
                    Chef de projet
                  </label>
                  <select
                    value={filters.manager_id ?? ''}
                    onChange={e => setFilters(f => ({ ...f, manager_id: e.target.value || null }))}
                    className={`${panelInputClass} text-xs w-full`}
                  >
                    <option value="">Tous</option>
                    {facets.managers.map(m => <option key={m.ref_us} value={m.ref_us}>{m.name_us}</option>)}
                  </select>
                </div>
              )}

              {/* Status chips */}
              {facets && facets.statuses.length > 0 && (
                <div>
                  <label className="block text-[9px] uppercase tracking-wide text-muted-foreground mb-1">
                    Statut
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {facets.statuses.map(s => {
                      const active = filters.status?.includes(s.value)
                      const label = projectStatusLabels[s.value] || s.value
                      return (
                        <button
                          key={s.value}
                          onClick={() => toggleStatus(s.value)}
                          className={cn(
                            'text-[9px] px-1.5 py-0.5 rounded',
                            active ? 'gl-button-sm gl-button-primary' : 'gl-button-sm gl-button-default',
                          )}
                        >
                          {label} <span className="opacity-60">({s.count})</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Criticality */}
              {facets && facets.criticalities.length > 0 && (
                <div>
                  <label className="block text-[9px] uppercase tracking-wide text-muted-foreground mb-1">
                    Criticité
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {facets.criticalities.map(c => {
                      const active = filters.criticality?.includes(c.value)
                      return (
                        <button
                          key={c.value}
                          onClick={() => toggleCriticality(c.value)}
                          className={cn(
                            'text-[9px] px-1.5 py-0.5 rounded',
                            active ? 'gl-button-sm gl-button-primary' : 'gl-button-sm gl-button-default',
                          )}
                        >
                          {c.value} <span className="opacity-60">({c.count})</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Enterprise categories */}
              {facets && facets.categories.length > 0 && (
                <div>
                  <label className="block text-[9px] uppercase tracking-wide text-muted-foreground mb-1">
                    Étiquettes
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {facets.categories.map(cat => {
                      const active = filters.category_ids?.includes(cat.id)
                      return (
                        <button
                          key={cat.id}
                          onClick={() => toggleCategory(cat.id)}
                          className={cn(
                            'text-[9px] px-1.5 py-0.5 rounded',
                            active ? 'gl-button-sm gl-button-primary' : 'gl-button-sm gl-button-default',
                          )}
                        >
                          {cat.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Admin defaults */}
              <div className="pt-2 border-t border-border">
                <button
                  onClick={() => setShowAdminDefaults(v => !v)}
                  className={cn(
                    'w-full flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground',
                    showAdminDefaults && 'text-primary',
                  )}
                >
                  <Settings2 size={10} />
                  Filtres par défaut (admin)
                </button>
                {showAdminDefaults && (
                  <div className="mt-2 p-2 rounded border border-primary/30 bg-primary/5 space-y-1.5">
                    <p className="text-[9px] text-primary/80 leading-snug">
                      Les filtres ci-dessus seront appliqués à chaque ouverture de l'assistant.
                    </p>
                    <button
                      onClick={handleSaveAsAdminDefault}
                      disabled={setDefaultFilters.isPending}
                      className="w-full gl-button-sm gl-button-primary disabled:opacity-50"
                    >
                      {setDefaultFilters.isPending
                        ? <Loader2 size={9} className="animate-spin inline" />
                        : 'Enregistrer comme défaut'}
                    </button>
                  </div>
                )}
              </div>
            </aside>

            {/* ── Right side: project list with expandable task tree ── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              {/* Select-all row */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/10 shrink-0">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  ref={el => {
                    if (el) el.indeterminate = includedCount > 0 && !allFilteredSelected
                  }}
                  onChange={toggleAll}
                  className="w-3.5 h-3.5"
                />
                <span className="text-[11px] font-medium">
                  {includedCount > 0
                    ? `${includedCount} projet${includedCount > 1 ? 's' : ''} sélectionné${includedCount > 1 ? 's' : ''}`
                    : 'Tout sélectionner'}
                </span>
                <span className="ml-auto text-[9px] text-muted-foreground">
                  Cliquez sur ▸ pour choisir les tâches par projet
                </span>
              </div>

              {/* Project list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {catalogLoading && (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 size={16} className="animate-spin text-muted-foreground" />
                  </div>
                )}
                {!catalogLoading && catalog && catalog.items.length === 0 && (
                  <div className="text-center py-8 text-xs text-muted-foreground italic">
                    Aucun projet ne correspond à vos filtres
                  </div>
                )}
                {!catalogLoading && catalog && catalog.items.length > 0 && catalog.items.map(p => (
                  <GoutiProjectRow
                    key={p.gouti_id}
                    project={p}
                    selection={getOrInit(p.gouti_id)}
                    onToggleInclude={() => toggleProject(p.gouti_id)}
                    onTaskModeChange={(mode) => setTaskMode(p.gouti_id, mode)}
                    onToggleTaskId={(taskId, ensureSelectedIds) => toggleTaskId(p.gouti_id, taskId, ensureSelectedIds)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border bg-muted/20 shrink-0">
            <span className="text-[11px] text-muted-foreground">
              {includedCount > 0
                ? `${includedCount} projet${includedCount > 1 ? 's' : ''} prêts à importer`
                : 'Sélectionnez au moins un projet'}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1 text-xs rounded border border-border hover:bg-muted"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveAndSync}
                disabled={includedCount === 0 || syncSelected.isPending || saveSelection.isPending}
                className="px-3 py-1 text-xs rounded bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 flex items-center gap-1.5"
              >
                {(syncSelected.isPending || saveSelection.isPending)
                  ? <Loader2 size={11} className="animate-spin" />
                  : <Download size={11} />}
                Importer {includedCount > 0 && `(${includedCount})`}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ── Split button: main click = force sync (if selection saved), dropdown = reopen modal ─
export function GoutiSyncToolbar() {
  const { t } = useTranslation()
  const { data: status } = useGoutiStatus()
  const syncSelected = useGoutiSyncSelected()
  const { toast } = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  if (!status?.connector_configured) return null

  const hasSelection = !!status.has_selection

  const handleMainClick = async () => {
    if (!hasSelection) {
      setModalOpen(true)
      return
    }
    try {
      const res = await syncSelected.mutateAsync()
      toast({
        title: t('projets.toast.gouti_sync_completed'),
        description: `${res.created} créés, ${res.updated} mis à jour${res.errors.length ? `, ${res.errors.length} erreurs` : ''}`,
        variant: res.errors.length > 0 ? 'warning' : 'success',
      })
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? t('projets.toast.error')
      toast({ title: t('projets.toast.sync_failed'), description: String(msg).slice(0, 200), variant: 'error' })
    }
  }

  const lastSync = status.last_sync_at ? new Date(status.last_sync_at) : null
  const lastSyncLabel = lastSync
    ? lastSync.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'jamais'

  return (
    <>
      {/* NOTE: no `overflow-hidden` here — it would clip the absolutely
          positioned dropdown. Rounded corners are applied per-button via
          rounded-l/rounded-r so the split-button still looks unified. */}
      <div ref={wrapperRef} className="relative inline-flex text-xs">
        <button
          type="button"
          onClick={handleMainClick}
          disabled={syncSelected.isPending}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-l border border-orange-500/30 bg-orange-500/5 text-orange-700 hover:bg-orange-500/10 disabled:opacity-50"
          title={hasSelection
            ? `Forcer la synchronisation (${status.project_count} importés · dernière : ${lastSyncLabel})`
            : 'Ouvrir l\'assistant d\'import Gouti'}
        >
          {syncSelected.isPending
            ? <Loader2 size={12} className="animate-spin" />
            : <RefreshCw size={12} />}
          Sync Gouti
          {status.project_count > 0 && (
            <span className="ml-0.5 px-1 rounded bg-orange-500/20 text-[10px] tabular-nums">{status.project_count}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setDropdownOpen(v => !v)}
          className={cn(
            'px-1.5 rounded-r border border-l-0 border-orange-500/30 bg-orange-500/5 text-orange-700 hover:bg-orange-500/10 flex items-center',
            dropdownOpen && 'bg-orange-500/20',
          )}
          title="Options"
          aria-haspopup="menu"
          aria-expanded={dropdownOpen}
        >
          <ChevronDown size={11} className={cn('transition-transform', dropdownOpen && 'rotate-180')} />
        </button>
        {dropdownOpen && (
          <div
            className="absolute top-full right-0 mt-1 min-w-[240px] bg-popover border border-border rounded-md shadow-lg py-1"
            style={{ zIndex: 'var(--z-popover, 60)' }}
            role="menu"
          >
            <button
              onClick={() => { setDropdownOpen(false); setModalOpen(true) }}
              role="menuitem"
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2 text-foreground"
            >
              <Filter size={11} /> Re-sélectionner les projets…
            </button>
            {hasSelection && (
              <button
                onClick={() => { setDropdownOpen(false); handleMainClick() }}
                role="menuitem"
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2 text-foreground"
              >
                <RefreshCw size={11} /> Forcer la synchronisation
              </button>
            )}
          </div>
        )}
      </div>
      {modalOpen && <GoutiImportModal onClose={() => setModalOpen(false)} />}
    </>
  )
}
