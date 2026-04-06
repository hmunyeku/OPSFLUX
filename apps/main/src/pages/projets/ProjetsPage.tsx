/**
 * Projets (Project Management) page — inspired by Gouti.
 *
 * Architecture:
 *  - DataTable with enriched columns (code, name, status, weather, %, manager, dates)
 *  - ProjectDetailPanel: fiche projet + equipe + taches + jalons + notes/documents
 *  - CreateProjectPanel: full creation form
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import {
  FolderKanban, Plus, Loader2, Trash2, Users, Target, X, Check,
  Sun, Cloud, CloudRain, CloudLightning, Milestone, ListTodo, UserPlus,
  Circle, CircleDot, CheckCircle2, CircleSlash, Clock,
  Sheet, CalendarRange, ChevronRight, Layers, RefreshCw, Download,
  Link2, Package, CheckSquare, History, ArrowRight,
  Camera, Play, FlaskConical, Star,
  Zap, GitBranch, ChevronDown, Filter, Search, Settings2,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef, InlineEditConfig } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { normalizeNames } from '@/lib/normalize'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  InlineEditableRow,
  InlineEditableTags,
  ReadOnlyRow,
  PanelActionButton,
  DangerConfirmButton,
  TagSelector,
  panelInputClass,
  PanelContentLayout,
  SectionColumns,
  DetailFieldGrid,
} from '@/components/layout/DynamicPanel'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { TagManager } from '@/components/shared/TagManager'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { usePermission } from '@/hooks/usePermission'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useAsset } from '@/hooks/useAssets'
import {
  useProjects, useProject, useCreateProject, useUpdateProject, useArchiveProject,
  useProjectTasks, useCreateProjectTask, useUpdateProjectTask, useDeleteProjectTask,
  useProjectMembers, useAddProjectMember, useRemoveProjectMember,
  useProjectMilestones, useCreateProjectMilestone, useUpdateProjectMilestone, useDeleteProjectMilestone,
  useAllProjectTasks, useSubProjects,
  useGoutiStatus, useGoutiSyncOne,
  useGoutiFacets, useGoutiCatalog, useGoutiDefaultFilters, useGoutiSetDefaultFilters,
  useGoutiSaveSelection, useGoutiSyncSelected, useGoutiProjectTasks,
  useTaskDependencies, useCreateTaskDependency, useDeleteTaskDependency,
  useTaskDeliverables, useCreateDeliverable, useUpdateDeliverable, useDeleteDeliverable,
  useTaskActions, useCreateAction, useUpdateAction, useDeleteAction,
  useTaskChangelog,
  usePlanningRevisions, useCreateRevision, useApplyRevision, useDeleteRevision,
  useWbsNodes, useCreateWbsNode, useDeleteWbsNode,
  useProjectCpm,
} from '@/hooks/useProjets'
import type {
  GoutiCatalogFilters, GoutiCatalogProject, GoutiCatalogTask, GoutiSelectionPayload,
  GoutiProjectSelection, GoutiTaskSelection,
} from '@/services/projetsService'
import { projetsService, isGoutiProject, goutiProjectId, isProjectFieldEditable } from '@/services/projetsService'
import { ProjectGanttView } from './ProjectGanttView'
import type {
  Project, ProjectCreate, ProjectTask, ProjectTaskEnriched,
  ProjectMilestone as ProjectMilestoneType,
  ProjectMember as ProjectMemberType,
  TaskDependency, DependencyType,
  TaskDeliverable, TaskAction, TaskChangeLog,
  PlanningRevision,
  ProjectWBSNode,
  CPMTaskInfo,
} from '@/types/api'

// -- Constants ----------------------------------------------------------------

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

const WEATHER_OPTIONS = [
  { value: 'sunny', label: 'Ensoleille', icon: Sun },
  { value: 'cloudy', label: 'Nuageux', icon: Cloud },
  { value: 'rainy', label: 'Pluvieux', icon: CloudRain },
  { value: 'stormy', label: 'Orageux', icon: CloudLightning },
]

const TASK_STATUS_OPTIONS = [
  { value: 'todo', label: 'A faire', icon: Circle, color: 'text-muted-foreground' },
  { value: 'in_progress', label: 'En cours', icon: CircleDot, color: 'text-primary' },
  { value: 'review', label: 'Revue', icon: Clock, color: 'text-yellow-500' },
  { value: 'done', label: 'Terminee', icon: CheckCircle2, color: 'text-green-500' },
  { value: 'cancelled', label: 'Annulee', icon: CircleSlash, color: 'text-red-500' },
]

const MEMBER_ROLE_OPTIONS = [
  { value: 'manager', label: 'Chef de projet' },
  { value: 'member', label: 'Membre' },
  { value: 'reviewer', label: 'Reviseur' },
  { value: 'stakeholder', label: 'Partie prenante' },
]

// Dismissible warning banner shown on Gouti-imported projects. The
// dismissal is persisted in localStorage so the same user sees it at
// most once per browser — if the warning still applies, a Resync Gouti
// button in the panel header remains the authoritative action.
const GOUTI_BANNER_DISMISSED_KEY = 'opsflux:gouti-project-banner-dismissed'

function GoutiProjectBanner() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(GOUTI_BANNER_DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })
  if (dismissed) return null
  const handleDismiss = () => {
    try {
      localStorage.setItem(GOUTI_BANNER_DISMISSED_KEY, '1')
    } catch { /* ignore quota/privacy mode errors */ }
    setDismissed(true)
  }
  return (
    <div className="flex items-start gap-2 p-2 rounded-md border border-orange-500/30 bg-orange-500/5 text-[11px] text-orange-700">
      <Download size={12} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="font-medium flex items-center gap-1.5">
          Projet importé de Gouti <GoutiBadge />
        </div>
        <div className="text-orange-600/80 mt-0.5">
          Les modifications locales seront écrasées au prochain "Resync Gouti".
          Pour un contrôle total, modifier le projet dans Gouti puis relancer la sync.
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="p-0.5 rounded hover:bg-orange-500/20 text-orange-700 shrink-0"
        aria-label="Masquer ce bandeau"
        title="Masquer (votre préférence est sauvegardée)"
      >
        <X size={12} />
      </button>
    </div>
  )
}

// Small badge shown on projects imported from Gouti so users can
// distinguish them from OpsFlux-native projects at a glance.
function GoutiBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-semibold uppercase tracking-wide bg-orange-500/10 text-orange-600 border border-orange-500/20',
        className,
      )}
      title="Projet importé depuis Gouti"
    >
      <Download size={8} /> Gouti
    </span>
  )
}

// ── Gouti Import Modal ──────────────────────────────────────────────────
//
// Opens from the split-button's dropdown (or automatically on first click
// when no selection is saved). Lets the user filter the live Gouti catalog
// via facets, then pick projects (and optionally drill down to tasks) to
// import. Saves the selection as integration.gouti.sync_selection so the
// split-button's main click can "force sync" without asking again.

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
  onToggleTaskId: (taskId: string) => void
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

  const renderRow = (task: GoutiCatalogTask, depth: number): React.ReactNode => {
    const children = childrenOf.get(task.gouti_id) || []
    const hasChildren = children.length > 0
    const isCollapsed = collapsed.has(task.gouti_id)
    const checked = taskMode === 'all' || selectedSet.has(task.gouti_id)

    return (
      <div key={task.gouti_id} role="treeitem" aria-level={depth + 1} aria-expanded={hasChildren ? !isCollapsed : undefined}>
        <div
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 text-[10px] border-b border-border/30',
            !disabled && !task.is_macro && 'cursor-pointer hover:bg-muted/40',
            disabled && 'opacity-70',
            task.is_macro && 'bg-muted/30 font-medium',
          )}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => { if (!disabled && !task.is_macro) onToggleTaskId(task.gouti_id) }}
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

          {/* Checkbox (hidden for macro grouping rows which aren't real tasks) */}
          {!task.is_macro ? (
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={(e) => { e.stopPropagation(); onToggleTaskId(task.gouti_id) }}
              onClick={(e) => e.stopPropagation()}
              className="w-3 h-3 shrink-0"
            />
          ) : (
            <span className="w-3 h-3 shrink-0" />
          )}

          {/* Type icon */}
          {task.is_milestone ? (
            <Milestone size={10} className="text-yellow-600 shrink-0" />
          ) : task.is_macro ? (
            <Layers size={10} className="text-primary shrink-0" />
          ) : null}

          {/* Code + name */}
          <span className="font-mono text-[9px] text-muted-foreground shrink-0">{task.code}</span>
          <span className="flex-1 truncate">{task.name}</span>

          {/* Meta */}
          {task.progress != null && task.progress > 0 && (
            <span className="text-[9px] text-muted-foreground tabular-nums">{task.progress}%</span>
          )}
          {task.status_raw && (
            <span className="text-[9px] px-1 rounded bg-muted">{task.status_raw}</span>
          )}
          {task.workload != null && task.workload > 0 && (
            <span className="text-[9px] text-muted-foreground tabular-nums">{task.workload}h</span>
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
  onToggleTaskId: (taskId: string) => void
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
                  'text-[9px] px-1.5 py-0.5 rounded border',
                  !included && 'opacity-40',
                  taskMode === mode
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-muted',
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
  const { data: facets, isLoading: facetsLoading } = useGoutiFacets()
  const { data: defaultFilters } = useGoutiDefaultFilters()
  const setDefaultFilters = useGoutiSetDefaultFilters()
  const saveSelection = useGoutiSaveSelection()
  const syncSelected = useGoutiSyncSelected()
  const { toast } = useToast()

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

  const toggleTaskId = (projectId: string, taskId: string) => {
    setProjectSelection(prev => {
      const current = prev[projectId] ?? { include: true, tasks: { mode: 'some' as const, task_ids: [] } }
      const ids = current.tasks.task_ids.includes(taskId)
        ? current.tasks.task_ids.filter(x => x !== taskId)
        : [...current.tasks.task_ids, taskId]
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
      toast({ title: 'Aucun projet sélectionné', variant: 'warning' })
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
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erreur'
      toast({ title: 'Échec de l\'import', description: String(msg), variant: 'error' })
    }
  }

  const handleSaveAsAdminDefault = async () => {
    try {
      await setDefaultFilters.mutateAsync(filters)
      toast({ title: 'Filtres par défaut enregistrés', variant: 'success' })
      setShowAdminDefaults(false)
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
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
                      const label = STATUS_OPTIONS.find(o => o.value === s.value)?.label || s.value
                      return (
                        <button
                          key={s.value}
                          onClick={() => toggleStatus(s.value)}
                          className={cn(
                            'text-[9px] px-1.5 py-0.5 rounded border',
                            active
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border hover:bg-muted',
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
                            'text-[9px] px-1.5 py-0.5 rounded border',
                            active
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border hover:bg-muted',
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
                            'text-[9px] px-1.5 py-0.5 rounded border',
                            active
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border hover:bg-muted',
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
                      className="w-full text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
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
                    onToggleTaskId={(taskId) => toggleTaskId(p.gouti_id, taskId)}
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
function GoutiSyncToolbar() {
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
        title: 'Sync Gouti terminée',
        description: `${res.created} créés, ${res.updated} mis à jour${res.errors.length ? `, ${res.errors.length} erreurs` : ''}`,
        variant: res.errors.length > 0 ? 'warning' : 'success',
      })
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erreur'
      toast({ title: 'Sync échouée', description: String(msg).slice(0, 200), variant: 'error' })
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

function WeatherIcon({ weather, size = 14 }: { weather: string; size?: number }) {
  const opt = WEATHER_OPTIONS.find(w => w.value === weather)
  if (!opt) return null
  const Icon = opt.icon
  const color = weather === 'sunny' ? 'text-yellow-500' : weather === 'cloudy' ? 'text-gray-400' : weather === 'rainy' ? 'text-blue-400' : 'text-red-500'
  return <Icon size={size} className={color} />
}

// -- Create Project Panel -----------------------------------------------------

function CreateProjectPanel() {
  const { t } = useTranslation()
  const createProject = useCreateProject()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()
  const { data: projectsData } = useProjects({ page_size: 100 })
  const [form, setForm] = useState<ProjectCreate>({
    name: '',
    description: null,
    status: 'draft',
    priority: 'medium',
    weather: 'sunny',
    start_date: null,
    end_date: null,
    budget: null,
    manager_id: null,
    parent_id: null,
    tier_id: null,
    asset_id: null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createProject.mutateAsync(normalizeNames(form))
      closeDynamicPanel()
      toast({ title: 'Projet cree', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title="Nouveau projet"
      subtitle="Projets"
      icon={<FolderKanban size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createProject.isPending}
            onClick={() => (document.getElementById('create-project-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createProject.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-project-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <SectionColumns>
            <div className="@container space-y-5">
              <FormSection title="Identification">
                <FormGrid>
                  <DynamicPanelField label="Code">
                    <span className="text-sm font-mono text-muted-foreground italic">Auto-généré à la création</span>
                  </DynamicPanelField>
                  <DynamicPanelField label="Nom" required>
                    <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={panelInputClass} placeholder="Nom du projet" />
                  </DynamicPanelField>
                  <DynamicPanelField label="Macro-projet (parent)">
                    <select
                      value={form.parent_id ?? ''}
                      onChange={(e) => setForm({ ...form, parent_id: e.target.value || null })}
                      className={panelInputClass}
                    >
                      <option value="">Aucun (projet indépendant)</option>
                      {projectsData?.items?.map(p => (
                        <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                      ))}
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label="Site">
                    <AssetPicker
                      value={form.asset_id || null}
                      onChange={(id) => setForm({ ...form, asset_id: id || null })}
                      label="Site"
                    />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>

              <FormSection title="Planning">
                <DateRangePicker
                  startDate={form.start_date?.split('T')[0] ?? null}
                  endDate={form.end_date?.split('T')[0] ?? null}
                  onStartChange={(v) => setForm({ ...form, start_date: v || null })}
                  onEndChange={(v) => setForm({ ...form, end_date: v || null })}
                />
                <DynamicPanelField label="Budget">
                  <input type="number" step="any" value={form.budget ?? ''} onChange={(e) => setForm({ ...form, budget: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="0" />
                </DynamicPanelField>
              </FormSection>
            </div>

            <div className="@container space-y-5">
              <FormSection title="Statut">
                <TagSelector options={STATUS_OPTIONS} value={form.status || 'draft'} onChange={(v) => setForm({ ...form, status: v })} />
              </FormSection>

              <FormSection title="Priorité">
                <TagSelector options={PRIORITY_OPTIONS} value={form.priority || 'medium'} onChange={(v) => setForm({ ...form, priority: v })} />
              </FormSection>

              <FormSection title="Description" collapsible defaultExpanded={false}>
                <textarea
                  value={form.description ?? ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                  className={`${panelInputClass} min-h-[60px] resize-y`}
                  placeholder="Description du projet..."
                  rows={3}
                />
              </FormSection>
            </div>
          </SectionColumns>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// -- Task Status Cycle (click to advance) ------------------------------------

function TaskStatusIcon({ status, size = 13 }: { status: string; size?: number }) {
  const opt = TASK_STATUS_OPTIONS.find(s => s.value === status)
  if (!opt) return <Circle size={size} className="text-muted-foreground" />
  const Icon = opt.icon
  return <Icon size={size} className={opt.color} />
}

function nextTaskStatus(current: string): string {
  const cycle = ['todo', 'in_progress', 'review', 'done']
  const idx = cycle.indexOf(current)
  if (idx === -1) return 'todo'
  return cycle[(idx + 1) % cycle.length]
}

// -- Task Create Form (full, like Gouti task sheet) ---------------------------

function TaskCreateForm({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const createTask = useCreateProjectTask()
  const { toast } = useToast()
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    start_date: '',
    due_date: '',
    estimated_hours: '',
  })

  const handleSubmit = async () => {
    if (!form.title.trim()) return
    try {
      await createTask.mutateAsync({
        projectId,
        payload: {
          title: form.title.trim(),
          description: form.description || null,
          status: form.status,
          priority: form.priority,
          start_date: form.start_date || null,
          due_date: form.due_date || null,
          estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        },
      })
      toast({ title: 'Tache creee', variant: 'success' })
      onClose()
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  return (
    <div className="border border-primary/30 rounded-md bg-primary/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-primary">Nouvelle tache</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
      </div>

      <input
        type="text"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        className={`${panelInputClass} w-full text-xs`}
        placeholder="Titre de la tache *"
        autoFocus
      />

      <textarea
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        className={`${panelInputClass} w-full text-xs min-h-[40px] resize-y`}
        placeholder="Description..."
        rows={2}
      />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Statut</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={`${panelInputClass} w-full text-xs`}>
            {TASK_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Priorite</label>
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={`${panelInputClass} w-full text-xs`}>
            {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2 items-end">
        <DateRangePicker
          startDate={form.start_date || null}
          endDate={form.due_date || null}
          onStartChange={(v) => setForm({ ...form, start_date: v })}
          onEndChange={(v) => setForm({ ...form, due_date: v })}
          startLabel="Debut"
          endLabel="Fin"
          className="flex-1"
        />
        <div className="w-20 shrink-0">
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Heures est.</label>
          <input type="number" step="0.5" min="0" value={form.estimated_hours} onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} className={`${panelInputClass} w-full text-xs`} placeholder="0" />
        </div>
      </div>

      <div className="flex justify-end gap-1.5 pt-1">
        <button onClick={onClose} className="px-2.5 py-1 text-xs rounded border border-border hover:bg-muted text-muted-foreground">Annuler</button>
        <button onClick={handleSubmit} disabled={createTask.isPending || !form.title.trim()} className="px-2.5 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
          {createTask.isPending ? <Loader2 size={10} className="animate-spin inline mr-1" /> : null}
          Creer
        </button>
      </div>
    </div>
  )
}

// -- Task sub-features: Dependencies / Livrables / Actions / Historique -----

const DEPENDENCY_TYPE_LABELS: Record<DependencyType, string> = {
  finish_to_start: 'FS — Fin → Début',
  start_to_start: 'SS — Début → Début',
  finish_to_finish: 'FF — Fin → Fin',
  start_to_finish: 'SF — Début → Fin',
}

const DELIVERABLE_STATUS_OPTIONS = [
  { value: 'pending', label: 'En attente', color: 'text-muted-foreground' },
  { value: 'in_progress', label: 'En cours', color: 'text-primary' },
  { value: 'delivered', label: 'Livré', color: 'text-blue-500' },
  { value: 'accepted', label: 'Accepté', color: 'text-green-500' },
  { value: 'rejected', label: 'Rejeté', color: 'text-red-500' },
]

type SubTab = 'deps' | 'deliverables' | 'actions' | 'history'

function TaskDependenciesSection({ task, projectId, allTasks }: {
  task: ProjectTask
  projectId: string
  allTasks: ProjectTask[]
}) {
  const { data: deps = [] } = useTaskDependencies(projectId)
  const createDep = useCreateTaskDependency()
  const deleteDep = useDeleteTaskDependency()
  const { toast } = useToast()
  const [showAdd, setShowAdd] = useState(false)
  const [depForm, setDepForm] = useState<{ to_task_id: string; dependency_type: DependencyType; lag_days: number }>({
    to_task_id: '',
    dependency_type: 'finish_to_start',
    lag_days: 0,
  })

  const predecessors = deps.filter((d: TaskDependency) => d.to_task_id === task.id)
  const successors = deps.filter((d: TaskDependency) => d.from_task_id === task.id)
  const otherTasks = allTasks.filter(t => t.id !== task.id)
  const taskById = useMemo(() => new Map(allTasks.map(t => [t.id, t])), [allTasks])

  const handleCreate = async () => {
    if (!depForm.to_task_id) return
    try {
      await createDep.mutateAsync({
        projectId,
        payload: {
          from_task_id: task.id,
          to_task_id: depForm.to_task_id,
          dependency_type: depForm.dependency_type,
          lag_days: depForm.lag_days,
        },
      })
      toast({ title: 'Dépendance ajoutée', variant: 'success' })
      setShowAdd(false)
      setDepForm({ to_task_id: '', dependency_type: 'finish_to_start', lag_days: 0 })
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erreur'
      toast({ title: 'Impossible d\'ajouter la dépendance', description: String(msg), variant: 'error' })
    }
  }

  const renderLink = (d: TaskDependency, otherId: string, direction: 'from' | 'to') => {
    const other = taskById.get(otherId)
    return (
      <div key={d.id} className="flex items-center gap-1.5 py-1 text-[11px] group">
        {direction === 'from' ? <ArrowRight size={10} className="text-primary" /> : <ArrowRight size={10} className="text-muted-foreground rotate-180" />}
        <span className="truncate flex-1">{other?.title ?? `(tâche ${otherId.slice(0, 8)}…)`}</span>
        <span className="text-[9px] text-muted-foreground shrink-0">
          {DEPENDENCY_TYPE_LABELS[d.dependency_type]}{d.lag_days ? ` +${d.lag_days}j` : ''}
        </span>
        <button
          onClick={() => deleteDep.mutate({ projectId, depId: d.id })}
          className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100"
          title="Supprimer"
        >
          <X size={10} />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {predecessors.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">Prédécesseurs ({predecessors.length})</div>
          {predecessors.map((d: TaskDependency) => renderLink(d, d.from_task_id, 'to'))}
        </div>
      )}
      {successors.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">Successeurs ({successors.length})</div>
          {successors.map((d: TaskDependency) => renderLink(d, d.to_task_id, 'from'))}
        </div>
      )}
      {predecessors.length === 0 && successors.length === 0 && !showAdd && (
        <div className="text-[10px] text-muted-foreground italic">Aucune dépendance</div>
      )}

      {showAdd ? (
        <div className="border border-border rounded p-2 space-y-1.5 bg-background">
          <select
            value={depForm.to_task_id}
            onChange={e => setDepForm(f => ({ ...f, to_task_id: e.target.value }))}
            className={`${panelInputClass} w-full text-xs`}
          >
            <option value="">Sélectionner une tâche successeur…</option>
            {otherTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <div className="grid grid-cols-[1fr_60px] gap-1.5">
            <select
              value={depForm.dependency_type}
              onChange={e => setDepForm(f => ({ ...f, dependency_type: e.target.value as DependencyType }))}
              className={`${panelInputClass} text-xs`}
            >
              {(Object.entries(DEPENDENCY_TYPE_LABELS) as [DependencyType, string][]).map(([v, l]) =>
                <option key={v} value={v}>{l}</option>)}
            </select>
            <input
              type="number"
              value={depForm.lag_days}
              onChange={e => setDepForm(f => ({ ...f, lag_days: Number(e.target.value) || 0 }))}
              className={`${panelInputClass} text-xs`}
              placeholder="Lag j"
            />
          </div>
          <div className="flex justify-end gap-1">
            <button onClick={() => setShowAdd(false)} className="px-2 py-0.5 text-[10px] rounded hover:bg-muted">Annuler</button>
            <button
              onClick={handleCreate}
              disabled={!depForm.to_task_id || createDep.isPending}
              className="px-2 py-0.5 text-[10px] rounded bg-primary text-primary-foreground disabled:opacity-40"
            >
              {createDep.isPending ? <Loader2 size={9} className="animate-spin inline" /> : 'Ajouter'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80"
        >
          <Plus size={10} /> Lier à une autre tâche
        </button>
      )}
    </div>
  )
}

function TaskDeliverablesSection({ task, projectId }: { task: ProjectTask; projectId: string }) {
  const { data: deliverables = [] } = useTaskDeliverables(projectId, task.id)
  const createD = useCreateDeliverable()
  const updateD = useUpdateDeliverable()
  const deleteD = useDeleteDeliverable()
  const [newName, setNewName] = useState('')

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    await createD.mutateAsync({ projectId, taskId: task.id, payload: { name } })
    setNewName('')
  }

  return (
    <div className="space-y-1.5">
      {deliverables.length === 0 && (
        <div className="text-[10px] text-muted-foreground italic">Aucun livrable</div>
      )}
      {deliverables.map((d: TaskDeliverable) => {
        const statusOpt = DELIVERABLE_STATUS_OPTIONS.find(o => o.value === d.status)
        return (
          <div key={d.id} className="flex items-center gap-1.5 text-[11px] group">
            <Package size={10} className={cn('shrink-0', statusOpt?.color)} />
            <span className="flex-1 truncate">{d.name}</span>
            <select
              value={d.status}
              onChange={e => updateD.mutate({
                projectId, taskId: task.id, deliverableId: d.id,
                payload: { status: e.target.value },
              })}
              className={`${panelInputClass} text-[10px] w-[90px] py-0`}
              onClick={e => e.stopPropagation()}
            >
              {DELIVERABLE_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              onClick={() => deleteD.mutate({ projectId, taskId: task.id, deliverableId: d.id })}
              className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100"
            >
              <X size={10} />
            </button>
          </div>
        )
      })}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          className={`${panelInputClass} flex-1 text-[11px]`}
          placeholder="Nouveau livrable…"
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim() || createD.isPending}
          className="p-1 rounded hover:bg-primary/10 text-primary disabled:opacity-30"
        >
          {createD.isPending ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
        </button>
      </div>
    </div>
  )
}

function TaskActionsSection({ task, projectId }: { task: ProjectTask; projectId: string }) {
  const { data: actions = [] } = useTaskActions(projectId, task.id)
  const createA = useCreateAction()
  const updateA = useUpdateAction()
  const deleteA = useDeleteAction()
  const [newTitle, setNewTitle] = useState('')

  const handleAdd = async () => {
    const title = newTitle.trim()
    if (!title) return
    await createA.mutateAsync({ projectId, taskId: task.id, payload: { title } })
    setNewTitle('')
  }

  const toggleDone = (a: TaskAction) => {
    updateA.mutate({
      projectId, taskId: task.id, actionId: a.id,
      payload: { completed: !a.completed },
    })
  }

  const completedCount = actions.filter((a: TaskAction) => a.completed).length

  return (
    <div className="space-y-1.5">
      {actions.length > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${actions.length > 0 ? (completedCount / actions.length) * 100 : 0}%` }} />
          </div>
          <span className="tabular-nums">{completedCount}/{actions.length}</span>
        </div>
      )}
      {actions.length === 0 && (
        <div className="text-[10px] text-muted-foreground italic">Aucune action</div>
      )}
      {actions.map((a: TaskAction) => (
        <div key={a.id} className="flex items-center gap-1.5 text-[11px] group">
          <button onClick={() => toggleDone(a)} className="shrink-0">
            {a.completed
              ? <CheckSquare size={12} className="text-green-500" />
              : <Circle size={12} className="text-muted-foreground" />}
          </button>
          <span className={cn('flex-1 truncate', a.completed && 'line-through text-muted-foreground')}>{a.title}</span>
          <button
            onClick={() => deleteA.mutate({ projectId, taskId: task.id, actionId: a.id })}
            className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100"
          >
            <X size={10} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          className={`${panelInputClass} flex-1 text-[11px]`}
          placeholder="Nouvelle action…"
        />
        <button
          onClick={handleAdd}
          disabled={!newTitle.trim() || createA.isPending}
          className="p-1 rounded hover:bg-primary/10 text-primary disabled:opacity-30"
        >
          {createA.isPending ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
        </button>
      </div>
    </div>
  )
}

function TaskHistorySection({ task, projectId }: { task: ProjectTask; projectId: string }) {
  const { data: logs = [] } = useTaskChangelog(projectId, task.id)
  if (logs.length === 0) {
    return <div className="text-[10px] text-muted-foreground italic">Aucune modification enregistrée</div>
  }
  return (
    <div className="space-y-1 max-h-[160px] overflow-y-auto">
      {logs.map((l: TaskChangeLog) => (
        <div key={l.id} className="text-[10px] border-l-2 border-border pl-2 py-0.5">
          <div className="flex items-center gap-1">
            <span className="font-medium">{l.field_name}</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">{new Date(l.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div className="text-muted-foreground truncate">
            <span className="line-through">{l.old_value ?? '∅'}</span>
            <ArrowRight size={8} className="inline mx-1" />
            <span className="text-foreground">{l.new_value ?? '∅'}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function TaskSubFeatures({ task, projectId, allTasks }: {
  task: ProjectTask
  projectId: string
  allTasks: ProjectTask[]
}) {
  const [tab, setTab] = useState<SubTab>('deps')
  const tabs: { id: SubTab; label: string; icon: typeof Link2 }[] = [
    { id: 'deps', label: 'Dépendances', icon: Link2 },
    { id: 'deliverables', label: 'Livrables', icon: Package },
    { id: 'actions', label: 'Actions', icon: CheckSquare },
    { id: 'history', label: 'Historique', icon: History },
  ]
  return (
    <div className="border-t border-border/30 pt-2 mt-1">
      <div className="flex items-center gap-0.5 mb-2 border border-border rounded p-0.5 bg-muted/20">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors flex-1 justify-center',
                tab === t.id ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon size={10} />
              {t.label}
            </button>
          )
        })}
      </div>
      <div className="px-1">
        {tab === 'deps' && <TaskDependenciesSection task={task} projectId={projectId} allTasks={allTasks} />}
        {tab === 'deliverables' && <TaskDeliverablesSection task={task} projectId={projectId} />}
        {tab === 'actions' && <TaskActionsSection task={task} projectId={projectId} />}
        {tab === 'history' && <TaskHistorySection task={task} projectId={projectId} />}
      </div>
    </div>
  )
}

// -- Task Row (interactive, expandable) --------------------------------------

function TaskRow({
  task, projectId, allTasks, depth = 0,
}: {
  task: ProjectTask
  projectId: string
  allTasks: ProjectTask[]
  depth?: number
}) {
  const updateTask = useUpdateProjectTask()
  const deleteTask = useDeleteProjectTask()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleStatusChange = (newStatus: string) => {
    updateTask.mutate({ projectId, taskId: task.id, payload: { status: newStatus } })
  }

  const handleFieldSave = (field: string, value: string | number | null) => {
    updateTask.mutate({ projectId, taskId: task.id, payload: { [field]: value } })
  }

  const handleDelete = () => {
    deleteTask.mutate({ projectId, taskId: task.id })
    setConfirmDelete(false)
  }

  const statusOpt = TASK_STATUS_OPTIONS.find(s => s.value === task.status)
  const priorityOpt = PRIORITY_OPTIONS.find(p => p.value === task.priority)
  const hasChildren = allTasks.some(t => t.parent_id === task.id)

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={hasChildren ? expanded : undefined}
      className="border-b border-border/60 last:border-0"
    >
      {/* Summary row */}
      <div
        className="group flex items-center gap-2 py-2 text-xs hover:bg-muted/40 transition-colors cursor-pointer"
        style={{ paddingLeft: `${10 + depth * 16}px`, paddingRight: '10px' }}
        onClick={() => setExpanded(!expanded)}
      >
        {hasChildren ? (
          <ChevronRight
            size={10}
            className={cn('text-muted-foreground shrink-0 transition-transform', expanded && 'rotate-90')}
          />
        ) : (
          <span className="w-[10px] shrink-0" />
        )}
        <button onClick={(e) => { e.stopPropagation(); handleStatusChange(nextTaskStatus(task.status)) }} className="shrink-0 hover:scale-110 transition-transform" title={statusOpt?.label}>
          <TaskStatusIcon status={task.status} />
        </button>
        <span className={cn('flex-1 truncate font-medium', task.status === 'done' && 'line-through text-muted-foreground')}>{task.title}</span>
        {(task.priority === 'high' || task.priority === 'critical') && (
          <span className={cn('text-[9px] px-1 rounded', task.priority === 'critical' ? 'bg-red-500/10 text-red-500' : 'bg-orange-500/10 text-orange-500')}>
            {priorityOpt?.label}
          </span>
        )}
        {task.due_date && (
          <span className="text-muted-foreground text-[10px] tabular-nums">{new Date(task.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
        )}
        {task.progress > 0 && <span className="text-[10px] text-muted-foreground tabular-nums">{task.progress}%</span>}
        {task.assignee_name && <span className="text-muted-foreground text-[10px] max-w-[70px] truncate">{task.assignee_name}</span>}
        {confirmDelete ? (
          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button onClick={handleDelete} className="p-0.5 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20"><Check size={10} /></button>
            <button onClick={() => setConfirmDelete(false)} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={10} /></button>
          </div>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }} className="p-0.5 rounded hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            <Trash2 size={10} />
          </button>
        )}
      </div>

      {/* Expanded detail (like Gouti task sheet) */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 bg-muted/20 space-y-2.5 border-t border-border/30">
          {/* Status + Priority selectors */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Statut</label>
              <select value={task.status} onChange={(e) => handleStatusChange(e.target.value)} className={`${panelInputClass} w-full text-xs`}>
                {TASK_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Priorite</label>
              <select value={task.priority} onChange={(e) => handleFieldSave('priority', e.target.value)} className={`${panelInputClass} w-full text-xs`}>
                {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Dates */}
          <DateRangePicker
            startDate={task.start_date?.split('T')[0] ?? null}
            endDate={task.due_date?.split('T')[0] ?? null}
            onStartChange={(v) => handleFieldSave('start_date', v || null)}
            onEndChange={(v) => handleFieldSave('due_date', v || null)}
            startLabel="Debut"
            endLabel="Fin"
          />

          {/* Progress + Hours */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Progression %</label>
              <input
                type="number" min="0" max="100" step="5"
                defaultValue={task.progress}
                onBlur={(e) => handleFieldSave('progress', e.target.value ? Number(e.target.value) : 0)}
                className={`${panelInputClass} w-full text-xs`}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Heures est.</label>
              <input
                type="number" min="0" step="0.5"
                defaultValue={task.estimated_hours ?? ''}
                onBlur={(e) => handleFieldSave('estimated_hours', e.target.value ? Number(e.target.value) : null)}
                className={`${panelInputClass} w-full text-xs`}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Heures reelles</label>
              <input
                type="number" min="0" step="0.5"
                defaultValue={task.actual_hours ?? ''}
                onBlur={(e) => handleFieldSave('actual_hours', e.target.value ? Number(e.target.value) : null)}
                className={`${panelInputClass} w-full text-xs`}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Description</label>
            <textarea
              defaultValue={task.description ?? ''}
              onBlur={(e) => handleFieldSave('description', e.target.value || null)}
              className={`${panelInputClass} w-full text-xs min-h-[36px] resize-y`}
              rows={2}
              placeholder="Description de la tache..."
            />
          </div>

          {/* Dependencies / Deliverables / Actions / History tabs */}
          <TaskSubFeatures task={task} projectId={projectId} allTasks={allTasks} />

          {/* Meta info */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
            {task.code && <span>Ref: {task.code}</span>}
            {task.assignee_name && <span>Resp: {task.assignee_name}</span>}
            <span>Cree le {new Date(task.created_at).toLocaleDateString('fr-FR')}</span>
            {task.completed_at && <span>Terminé le {new Date(task.completed_at).toLocaleDateString('fr-FR')}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// -- Milestone Row (interactive) ---------------------------------------------

function MilestoneRow({ ms, projectId }: { ms: ProjectMilestoneType; projectId: string }) {
  const updateMs = useUpdateProjectMilestone()
  const deleteMs = useDeleteProjectMilestone()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const toggleComplete = () => {
    if (ms.status === 'completed') {
      updateMs.mutate({ projectId, msId: ms.id, payload: { status: 'pending', completed_at: null } })
    } else {
      updateMs.mutate({ projectId, msId: ms.id, payload: { status: 'completed', completed_at: new Date().toISOString() } })
    }
  }

  return (
    <div className="group flex items-center gap-2 text-xs py-1.5 border-b border-border/40 last:border-0">
      <button onClick={toggleComplete} className="shrink-0 hover:scale-110 transition-transform">
        {ms.status === 'completed'
          ? <CheckCircle2 size={12} className="text-green-500" />
          : ms.status === 'overdue'
            ? <Milestone size={12} className="text-red-500" />
            : <Milestone size={12} className="text-muted-foreground" />
        }
      </button>
      <span className={cn('flex-1 truncate text-foreground', ms.status === 'completed' && 'line-through text-muted-foreground')}>{ms.name}</span>
      {ms.due_date && (
        <span className="text-muted-foreground text-[10px] tabular-nums">{new Date(ms.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
      )}
      {confirmDelete ? (
        <div className="flex items-center gap-0.5">
          <button onClick={() => { deleteMs.mutate({ projectId, msId: ms.id }); setConfirmDelete(false) }} className="p-0.5 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20"><Check size={10} /></button>
          <button onClick={() => setConfirmDelete(false)} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={10} /></button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="p-0.5 rounded hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 size={10} />
        </button>
      )}
    </div>
  )
}

// -- Milestone Quick Add -----------------------------------------------------

function MilestoneQuickAdd({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const createMs = useCreateProjectMilestone()

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    await createMs.mutateAsync({ projectId, payload: { name: trimmed, due_date: dueDate || null } })
    setName('')
    setDueDate('')
    inputRef.current?.focus()
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1"
      >
        <Plus size={12} /> Ajouter un jalon
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') { setOpen(false); setName(''); setDueDate('') } }}
        className={`${panelInputClass} flex-1 text-xs`}
        placeholder="Nom du jalon..."
        autoFocus
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className={`${panelInputClass} w-[110px] text-xs`}
      />
      <button onClick={handleSubmit} disabled={createMs.isPending || !name.trim()} className="p-1 rounded hover:bg-primary/10 text-primary disabled:opacity-40">
        {createMs.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
      </button>
      <button onClick={() => { setOpen(false); setName(''); setDueDate('') }} className="p-1 rounded hover:bg-muted text-muted-foreground">
        <X size={12} />
      </button>
    </div>
  )
}

// -- Member Row (interactive) ------------------------------------------------

function MemberRow({ member, projectId }: { member: ProjectMemberType; projectId: string }) {
  const removeMember = useRemoveProjectMember()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const roleLbl = MEMBER_ROLE_OPTIONS.find(r => r.value === member.role)?.label ?? member.role

  return (
    <div className="group flex items-center gap-2 text-xs py-1.5 border-b border-border/40 last:border-0">
      <Users size={11} className="text-muted-foreground shrink-0" />
      <span className="flex-1 truncate text-foreground">{member.member_name || '(inconnu)'}</span>
      <span className="text-muted-foreground text-[10px]">{roleLbl}</span>
      {confirmDelete ? (
        <div className="flex items-center gap-0.5">
          <button onClick={() => { removeMember.mutate({ projectId, memberId: member.id }); setConfirmDelete(false) }} className="p-0.5 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20"><Check size={10} /></button>
          <button onClick={() => setConfirmDelete(false)} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={10} /></button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="p-0.5 rounded hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 size={10} />
        </button>
      )}
    </div>
  )
}

// -- Member Quick Add --------------------------------------------------------

function MemberQuickAdd({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState('member')
  const addMember = useAddProjectMember()

  const handleSubmit = async () => {
    if (!userId.trim()) return
    await addMember.mutateAsync({ projectId, payload: { user_id: userId.trim(), role } })
    setUserId('')
    setRole('member')
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1"
      >
        <UserPlus size={12} /> Ajouter un membre
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') { setOpen(false); setUserId('') } }}
        className={`${panelInputClass} flex-1 text-xs`}
        placeholder="ID utilisateur..."
        autoFocus
      />
      <select value={role} onChange={(e) => setRole(e.target.value)} className={`${panelInputClass} w-[100px] text-xs`}>
        {MEMBER_ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <button onClick={handleSubmit} disabled={addMember.isPending || !userId.trim()} className="p-1 rounded hover:bg-primary/10 text-primary disabled:opacity-40">
        {addMember.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
      </button>
      <button onClick={() => { setOpen(false); setUserId('') }} className="p-1 rounded hover:bg-muted text-muted-foreground">
        <X size={12} />
      </button>
    </div>
  )
}

// -- Task Section (list + create) — like Gouti "Progression et controle" -----

function TaskSection({ projectId, tasks }: { projectId: string; tasks: ProjectTask[] }) {
  const [showCreate, setShowCreate] = useState(false)

  const todoCount = tasks.filter(t => t.status === 'todo').length
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length
  const reviewCount = tasks.filter(t => t.status === 'review').length
  const doneCount = tasks.filter(t => t.status === 'done').length

  // Build a tree from parent_id so the list preserves Gouti-style hierarchy
  // (and any OpsFlux-native task tree built via the "sub-task" field).
  const tree = useMemo(() => {
    const byParent = new Map<string | null, ProjectTask[]>()
    for (const t of tasks) {
      const key = t.parent_id ?? null
      if (!byParent.has(key)) byParent.set(key, [])
      byParent.get(key)!.push(t)
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }
    return byParent
  }, [tasks])

  const walk = (parent: string | null, depth: number): React.ReactNode[] => {
    const children = tree.get(parent) || []
    const nodes: React.ReactNode[] = []
    for (const t of children) {
      nodes.push(
        <TaskRow key={t.id} task={t} projectId={projectId} allTasks={tasks} depth={depth} />,
      )
      // Recurse into subtasks
      nodes.push(...walk(t.id, depth + 1))
    }
    return nodes
  }
  const rootNodes = walk(null, 0)
  // Orphan safety: tasks whose parent_id doesn't exist in the flat set
  const knownIds = new Set(tasks.map(t => t.id))
  const orphanNodes = tasks
    .filter(t => t.parent_id && !knownIds.has(t.parent_id))
    .map(t => (
      <TaskRow key={t.id} task={t} projectId={projectId} allTasks={tasks} depth={0} />
    ))

  return (
    <FormSection
      title={`Taches (${tasks.length})`}
      collapsible
      defaultExpanded
      storageKey="project-detail-tasks"
    >
      {/* Kanban counters — like Gouti kanban columns header */}
      <div className="flex items-center gap-2 text-[10px] mb-2 flex-wrap">
        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{todoCount} a faire</span>
        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">{inProgressCount} en cours</span>
        {reviewCount > 0 && <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600">{reviewCount} revue</span>}
        <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">{doneCount} terminees</span>
      </div>

      {/* Task treegrid (hierarchy preserved via parent_id) */}
      {tasks.length > 0 ? (
        <div role="tree" aria-label="Hiérarchie des tâches" className="border border-border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
          {rootNodes}
          {orphanNodes}
        </div>
      ) : (
        <EmptyState icon={ListTodo} title="Aucune tache" variant="search" size="compact" />
      )}

      {/* Create form or button */}
      {showCreate ? (
        <TaskCreateForm projectId={projectId} onClose={() => setShowCreate(false)} />
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1"
        >
          <Plus size={12} /> Ajouter une tache
        </button>
      )}
    </FormSection>
  )
}

// -- Project Detail Panel -----------------------------------------------------

function ProjectDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data: project, isLoading } = useProject(id)
  const updateProject = useUpdateProject()
  const archiveProject = useArchiveProject()
  const { data: tasks } = useProjectTasks(id)
  const { data: members } = useProjectMembers(id)
  const { data: milestones } = useProjectMilestones(id)
  const { data: linkedAsset } = useAsset(project?.asset_id ?? '')
  const goutiSyncOne = useGoutiSyncOne()
  const { data: goutiStatus } = useGoutiStatus()
  const { toast } = useToast()
  const capabilities = goutiStatus?.capabilities ?? null

  const handleSave = useCallback((field: string, value: string) => {
    updateProject.mutate({ id, payload: normalizeNames({ [field]: value }) })
  }, [id, updateProject])

  const handleArchive = useCallback(async () => {
    await archiveProject.mutateAsync(id)
    closeDynamicPanel()
    toast({ title: 'Projet archive', variant: 'success' })
  }, [id, archiveProject, closeDynamicPanel, toast])

  const handleResyncGouti = useCallback(async () => {
    if (!project) return
    const gid = goutiProjectId(project)
    if (!gid) return
    try {
      const res = await goutiSyncOne.mutateAsync(gid)
      toast({
        title: 'Projet resynchronisé',
        description: `${res.action === 'created' ? 'Créé' : 'Mis à jour'} depuis Gouti — ${res.reports_synced} rapport(s)`,
        variant: 'success',
      })
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } }; message?: string })
        ?.response?.data?.detail ?? (err as Error)?.message ?? 'Erreur inconnue'
      toast({ title: 'Resync échouée', description: String(msg).slice(0, 200), variant: 'error' })
    }
  }, [project, goutiSyncOne, toast])

  if (isLoading || !project) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<FolderKanban size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const isGouti = isGoutiProject(project)

  return (
    <DynamicPanelShell
      title={project.code}
      subtitle={project.name}
      icon={<FolderKanban size={14} className="text-primary" />}
      actions={
        <>
          {isGouti && (
            <PanelActionButton
              onClick={handleResyncGouti}
              disabled={goutiSyncOne.isPending}
              icon={goutiSyncOne.isPending
                ? <Loader2 size={12} className="animate-spin" />
                : <RefreshCw size={12} />}
            >
              Resync Gouti
            </PanelActionButton>
          )}
          <DangerConfirmButton icon={<Trash2 size={12} />} onConfirm={handleArchive} confirmLabel="Archiver ?">
            Archiver
          </DangerConfirmButton>
        </>
      }
    >
      <PanelContentLayout>
        <TagManager ownerType="project" ownerId={project.id} compact />

        {isGouti && <GoutiProjectBanner />}

        {/* Description — shown above the Fiche section so the project's
            purpose/summary is the first thing the reader sees. */}
        {(project.description || isProjectFieldEditable(project, 'description', capabilities)) && (
          <FormSection title="Description" collapsible defaultExpanded storageKey="project-detail-desc">
            {isProjectFieldEditable(project, 'description', capabilities)
              ? <InlineEditableRow label="Description" value={project.description || ''} onSave={(v) => handleSave('description', v)} />
              : <ReadOnlyRow label="Description" value={<span className="text-sm whitespace-pre-wrap">{project.description || '—'}</span>} />}
          </FormSection>
        )}

        {/* Quick stats — inspired by Gouti "Donnees quantitatives et acces rapide" */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1"><WeatherIcon weather={project.weather} size={14} /> {WEATHER_OPTIONS.find(w => w.value === project.weather)?.label}</div>
          <div className="flex items-center gap-1"><Target size={11} /> {project.progress}%</div>
          <div className="flex items-center gap-1"><ListTodo size={11} /> {tasks?.length ?? 0} taches</div>
          <div className="flex items-center gap-1"><Users size={11} /> {members?.length ?? 0} personnes</div>
          <div className="flex items-center gap-1"><Milestone size={11} /> {milestones?.length ?? 0} jalons</div>
        </div>

        <SectionColumns>
          <div className="@container space-y-5">
            <FormSection title="Fiche projet" collapsible defaultExpanded storageKey="project-detail-fiche">
              <DetailFieldGrid>
                {isProjectFieldEditable(project, 'name', capabilities)
                  ? <InlineEditableRow label="Nom" value={project.name} onSave={(v) => handleSave('name', v)} />
                  : <ReadOnlyRow label="Nom" value={<span className="text-sm text-foreground">{project.name}</span>} />}
                <ReadOnlyRow label="Code" value={<span className="text-sm font-mono font-medium text-foreground">{project.code || '—'}</span>} />
                {isProjectFieldEditable(project, 'status', capabilities)
                  ? <InlineEditableTags label="Statut" value={project.status} options={STATUS_OPTIONS} onSave={(v) => handleSave('status', v)} />
                  : <ReadOnlyRow label="Statut" value={<span className="text-sm">{STATUS_OPTIONS.find(s => s.value === project.status)?.label || project.status}</span>} />}
                {isProjectFieldEditable(project, 'priority', capabilities)
                  ? <InlineEditableTags label="Priorité" value={project.priority} options={PRIORITY_OPTIONS} onSave={(v) => handleSave('priority', v)} />
                  : <ReadOnlyRow label="Priorité" value={<span className="text-sm">{PRIORITY_OPTIONS.find(p => p.value === project.priority)?.label || project.priority}</span>} />}
                <InlineEditableTags label="Météo" value={project.weather} options={WEATHER_OPTIONS.map(w => ({ value: w.value, label: w.label }))} onSave={(v) => handleSave('weather', v)} />
              </DetailFieldGrid>
              <DetailFieldGrid>
                <ReadOnlyRow label="Chef de projet" value={project.manager_name || '--'} />
                <ReadOnlyRow label="Entreprise" value={
                  project.tier_id ? (
                    <CrossModuleLink module="tiers" id={project.tier_id} label={project.tier_name || project.tier_id} mode="navigate" />
                  ) : (project.tier_name || '--')
                } />
                <ReadOnlyRow label="Budget" value={project.budget ? `${project.budget.toLocaleString('fr-FR')} XAF` : '--'} />
                <ReadOnlyRow label="Site / Asset" value={
                  project.asset_id ? (
                    <CrossModuleLink module="assets" id={project.asset_id} label={linkedAsset ? `${linkedAsset.code} — ${linkedAsset.name}` : project.asset_id.slice(0, 8) + '…'} mode="navigate" />
                  ) : '--'
                } />
              </DetailFieldGrid>
            </FormSection>

            <FormSection title="Planning" collapsible defaultExpanded storageKey="project-detail-planning">
              <DetailFieldGrid>
                <ReadOnlyRow label="Debut" value={project.start_date ? new Date(project.start_date).toLocaleDateString('fr-FR') : '--'} />
                <ReadOnlyRow label="Fin prevue" value={project.end_date ? new Date(project.end_date).toLocaleDateString('fr-FR') : '--'} />
                <ReadOnlyRow label="Fin reelle" value={project.actual_end_date ? new Date(project.actual_end_date).toLocaleDateString('fr-FR') : '--'} />
              </DetailFieldGrid>
            </FormSection>

            {/* Sub-projects — macro-projet hierarchy */}
            {(project.children_count ?? 0) > 0 && (
              <FormSection title={`Sous-projets (${project.children_count})`} collapsible defaultExpanded storageKey="project-detail-children">
                <SubProjectsSection projectId={id} />
              </FormSection>
            )}

            {/* Parent project link */}
            {project.parent_id && project.parent_name && (
              <FormSection title="Macro-projet" collapsible defaultExpanded storageKey="project-detail-parent">
                <div
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/40 px-2 py-1.5 rounded"
                  onClick={() => openDynamicPanel({ type: 'detail', module: 'projets', id: project.parent_id! })}
                >
                  <Layers size={12} className="text-primary" />
                  <span className="font-medium">{project.parent_name}</span>
                  <ChevronRight size={12} className="text-muted-foreground ml-auto" />
                </div>
              </FormSection>
            )}

            {/* Equipe / Members — like Gouti "Gestion > Les collaborateurs" */}
            <FormSection title={`Equipe (${members?.length ?? 0})`} collapsible defaultExpanded storageKey="project-detail-equipe">
              {members && members.length > 0 ? (
                <div>
                  {members.map((m) => <MemberRow key={m.id} member={m} projectId={id} />)}
                </div>
              ) : (
                <EmptyState icon={Users} title="Aucun membre" variant="search" size="compact" />
              )}
              <MemberQuickAdd projectId={id} />
            </FormSection>
          </div>

          <div className="@container space-y-5">
            {/* Tasks — inspired by Gouti "Progression et controle > Liste des taches" */}
            <TaskSection projectId={id} tasks={tasks ?? []} />

            {/* Milestones — like Gouti "Cadrage > Jalons" */}
            <FormSection title={`Jalons (${milestones?.length ?? 0})`} collapsible defaultExpanded storageKey="project-detail-jalons">
              {milestones && milestones.length > 0 ? (
                <div>
                  {milestones.map((ms) => (
                    <MilestoneRow key={ms.id} ms={ms} projectId={id} />
                  ))}
                </div>
              ) : (
                <EmptyState icon={Milestone} title="Aucun jalon" variant="search" size="compact" />
              )}
              <MilestoneQuickAdd projectId={id} />
            </FormSection>
          </div>
        </SectionColumns>

        {/* WBS — Work Breakdown Structure */}
        <WbsSection projectId={id} />

        {/* CPM — Critical Path Method analysis */}
        <CpmSection projectId={id} />

        {/* Planning Revisions — baselines + what-if simulations */}
        <PlanningRevisionsSection projectId={id} />

        {/* Notes & Documents */}
        <FormSection title="Notes & Documents" collapsible defaultExpanded={false} storageKey="project-detail-docs">
          <DetailFieldGrid>
            <div>
              <NoteManager ownerType="project" ownerId={project.id} compact />
            </div>
            <div>
              <AttachmentManager ownerType="project" ownerId={project.id} compact />
            </div>
          </DetailFieldGrid>
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- WBS Section (Work Breakdown Structure) ----------------------------------

function WbsSection({ projectId }: { projectId: string }) {
  const { data: nodes = [] } = useWbsNodes(projectId)
  const createNode = useCreateWbsNode()
  const deleteNode = useDeleteWbsNode()
  const { toast } = useToast()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<{ parent_id: string; code: string; name: string; budget: string }>({
    parent_id: '', code: '', name: '', budget: '',
  })

  // Build a tree structure for rendering
  const tree = useMemo(() => {
    const byParent = new Map<string | null, ProjectWBSNode[]>()
    for (const n of nodes) {
      const key = n.parent_id
      if (!byParent.has(key)) byParent.set(key, [])
      byParent.get(key)!.push(n)
    }
    for (const arr of byParent.values()) arr.sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
    return byParent
  }, [nodes])

  const handleCreate = async () => {
    if (!form.code.trim() || !form.name.trim()) return
    try {
      await createNode.mutateAsync({
        projectId,
        payload: {
          parent_id: form.parent_id || null,
          code: form.code.trim(),
          name: form.name.trim(),
          budget: form.budget ? Number(form.budget) : null,
        },
      })
      toast({ title: 'Nœud WBS créé', variant: 'success' })
      setForm({ parent_id: '', code: '', name: '', budget: '' })
      setShowAdd(false)
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erreur'
      toast({ title: 'Impossible de créer', description: String(msg), variant: 'error' })
    }
  }

  const renderNode = (node: ProjectWBSNode, depth: number): React.ReactNode => {
    const children = tree.get(node.id) ?? []
    return (
      <div key={node.id}>
        <div
          className="group flex items-center gap-1.5 text-[11px] py-1 px-1.5 rounded hover:bg-muted/40"
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
        >
          <GitBranch size={10} className="text-primary shrink-0" />
          <span className="font-mono text-[10px] text-muted-foreground">{node.code}</span>
          <span className="flex-1 truncate">{node.name}</span>
          {node.task_count! > 0 && (
            <span className="text-[9px] text-muted-foreground">{node.task_count} t.</span>
          )}
          {node.budget != null && (
            <span className="text-[9px] text-muted-foreground tabular-nums">
              {node.budget.toLocaleString('fr-FR')} XAF
            </span>
          )}
          {node.cost_center_name && (
            <span className="text-[9px] px-1 rounded bg-muted text-muted-foreground">{node.cost_center_name}</span>
          )}
          <button
            onClick={() => deleteNode.mutate({ projectId, nodeId: node.id })}
            className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100"
            title="Archiver le nœud"
          >
            <X size={10} />
          </button>
        </div>
        {children.map(c => renderNode(c, depth + 1))}
      </div>
    )
  }

  const roots = tree.get(null) ?? []

  return (
    <FormSection
      title={`WBS — Structure de découpage (${nodes.length})`}
      collapsible
      defaultExpanded={false}
      storageKey="project-detail-wbs"
    >
      {roots.length === 0 && !showAdd && (
        <div className="text-[11px] text-muted-foreground italic mb-2">
          Aucun nœud WBS. Créez une structure hiérarchique pour organiser les tâches
          par lots de travail et centres de coûts.
        </div>
      )}
      {roots.length > 0 && (
        <div className="border border-border rounded mb-2">
          {roots.map(r => renderNode(r, 0))}
        </div>
      )}

      {showAdd ? (
        <div className="border border-primary/30 rounded p-2 bg-primary/5 space-y-1.5">
          <select
            value={form.parent_id}
            onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
            className={`${panelInputClass} w-full text-xs`}
          >
            <option value="">(nœud racine)</option>
            {nodes.map(n => <option key={n.id} value={n.id}>{n.code} — {n.name}</option>)}
          </select>
          <div className="grid grid-cols-[90px_1fr] gap-1.5">
            <input
              type="text"
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
              className={`${panelInputClass} text-xs`}
              placeholder="Code (1.2.3) *"
              autoFocus
            />
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className={`${panelInputClass} text-xs`}
              placeholder="Nom du lot *"
            />
          </div>
          <input
            type="number"
            value={form.budget}
            onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
            className={`${panelInputClass} w-full text-xs`}
            placeholder="Budget (XAF)"
            step="any"
          />
          <div className="flex justify-end gap-1">
            <button onClick={() => setShowAdd(false)} className="px-2 py-0.5 text-[10px] rounded hover:bg-muted text-muted-foreground">
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={!form.code.trim() || !form.name.trim() || createNode.isPending}
              className="px-2 py-0.5 text-[10px] rounded bg-primary text-primary-foreground disabled:opacity-40"
            >
              {createNode.isPending ? <Loader2 size={9} className="animate-spin inline" /> : 'Créer'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80"
        >
          <Plus size={10} /> Ajouter un nœud
        </button>
      )}
    </FormSection>
  )
}

// -- CPM Section (Critical Path Method) --------------------------------------

function CpmSection({ projectId }: { projectId: string }) {
  const { data: cpm, isLoading } = useProjectCpm(projectId)

  return (
    <FormSection
      title="Chemin critique (CPM)"
      collapsible
      defaultExpanded={false}
      storageKey="project-detail-cpm"
    >
      {isLoading && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
          <Loader2 size={12} className="animate-spin" /> Calcul en cours…
        </div>
      )}
      {cpm && cpm.tasks.length === 0 && (
        <div className="text-[11px] text-muted-foreground italic">
          Aucune tâche à analyser. Créez des tâches et leurs dépendances pour voir le chemin critique.
        </div>
      )}
      {cpm && cpm.tasks.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="border border-primary/30 bg-primary/5 rounded p-2">
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Durée totale</div>
              <div className="text-lg font-semibold tabular-nums text-primary">{cpm.project_duration_days} j</div>
            </div>
            <div className="border border-red-500/30 bg-red-500/5 rounded p-2">
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Tâches critiques</div>
              <div className="text-lg font-semibold tabular-nums text-red-600">{cpm.critical_path_task_ids.length}</div>
            </div>
            <div className="border border-border rounded p-2">
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Tâches totales</div>
              <div className="text-lg font-semibold tabular-nums">{cpm.tasks.length}</div>
            </div>
          </div>
          {cpm.has_cycles && (
            <div className="flex items-start gap-1.5 text-[10px] p-1.5 rounded bg-red-500/10 border border-red-500/30 text-red-700">
              <Zap size={10} className="mt-0.5 shrink-0" />
              <span>Cycle détecté dans les dépendances — CPM partiel. Vérifiez les liens.</span>
            </div>
          )}
          {cpm.warnings.length > 0 && !cpm.has_cycles && (
            <div className="text-[10px] text-orange-600">
              {cpm.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}
          <div className="border border-border rounded overflow-hidden">
            <div className="grid grid-cols-[1fr_40px_40px_40px_40px] gap-1 px-2 py-1 bg-muted/50 text-[9px] font-semibold uppercase text-muted-foreground">
              <span>Tâche</span>
              <span className="text-right">ES</span>
              <span className="text-right">EF</span>
              <span className="text-right">Slack</span>
              <span className="text-right">Dur.</span>
            </div>
            <div className="max-h-[240px] overflow-y-auto">
              {cpm.tasks
                .slice()
                .sort((a, b) => {
                  if (a.is_critical !== b.is_critical) return a.is_critical ? -1 : 1
                  return a.early_start - b.early_start
                })
                .map((t: CPMTaskInfo) => (
                  <div
                    key={t.id}
                    className={cn(
                      'grid grid-cols-[1fr_40px_40px_40px_40px] gap-1 px-2 py-1 text-[10px] border-t border-border/30',
                      t.is_critical && 'bg-red-500/5',
                    )}
                  >
                    <span className="truncate flex items-center gap-1">
                      {t.is_critical && <Zap size={9} className="text-red-500 shrink-0" />}
                      {t.title}
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">J{t.early_start}</span>
                    <span className="text-right tabular-nums text-muted-foreground">J{t.early_finish}</span>
                    <span className={cn('text-right tabular-nums', t.slack === 0 ? 'text-red-500 font-semibold' : 'text-muted-foreground')}>
                      {t.slack}j
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">{t.duration_days}j</span>
                  </div>
                ))}
            </div>
          </div>
          <div className="text-[9px] text-muted-foreground italic">
            ES = début au plus tôt · EF = fin au plus tôt · Slack = marge totale (0 = critique)
          </div>
        </div>
      )}
    </FormSection>
  )
}

// -- Planning Revisions Section (in ProjectDetailPanel) ----------------------

function PlanningRevisionsSection({ projectId }: { projectId: string }) {
  const { data: revisions = [] } = usePlanningRevisions(projectId)
  const createRev = useCreateRevision()
  const applyRev = useApplyRevision()
  const deleteRev = useDeleteRevision()
  const { toast } = useToast()
  const [creating, setCreating] = useState<null | 'baseline' | 'simulation'>(null)
  const [revName, setRevName] = useState('')
  const [revDesc, setRevDesc] = useState('')

  const handleCreate = async () => {
    if (!revName.trim() || !creating) return
    try {
      await createRev.mutateAsync({
        projectId,
        payload: {
          name: revName.trim(),
          description: revDesc.trim() || null,
          is_simulation: creating === 'simulation',
        },
      })
      toast({
        title: creating === 'simulation' ? 'Simulation créée' : 'Référence créée',
        variant: 'success',
      })
      setCreating(null)
      setRevName('')
      setRevDesc('')
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erreur'
      toast({ title: 'Erreur création révision', description: String(msg), variant: 'error' })
    }
  }

  const handleApply = async (rev: PlanningRevision) => {
    try {
      await applyRev.mutateAsync({ projectId, revisionId: rev.id })
      toast({ title: `Révision "${rev.name}" activée`, variant: 'success' })
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erreur'
      toast({ title: 'Impossible d\'appliquer', description: String(msg), variant: 'error' })
    }
  }

  return (
    <FormSection
      title={`Révisions de planning (${revisions.length})`}
      collapsible
      defaultExpanded={false}
      storageKey="project-detail-revisions"
    >
      {revisions.length === 0 && !creating && (
        <div className="text-[11px] text-muted-foreground italic mb-2">
          Aucune révision. Créez une référence (baseline) pour figer le planning actuel,
          ou une simulation pour tester des scénarios "what-if".
        </div>
      )}

      {revisions.length > 0 && (
        <div className="space-y-1 mb-2">
          {revisions.map((rev: PlanningRevision) => (
            <div
              key={rev.id}
              className={cn(
                'group flex items-center gap-2 px-2 py-1.5 rounded border text-[11px]',
                rev.is_active ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/40',
              )}
            >
              {rev.is_active
                ? <Star size={11} className="text-primary shrink-0 fill-primary" />
                : rev.is_simulation
                  ? <FlaskConical size={11} className="text-orange-500 shrink-0" />
                  : <Camera size={11} className="text-muted-foreground shrink-0" />}
              <span className="font-medium">#{rev.revision_number}</span>
              <span className="flex-1 truncate">{rev.name}</span>
              {rev.is_simulation && (
                <span className="text-[9px] px-1 py-0 rounded bg-orange-500/10 text-orange-600 border border-orange-500/20">
                  Simulation
                </span>
              )}
              {rev.is_active && (
                <span className="text-[9px] px-1 py-0 rounded bg-primary/10 text-primary border border-primary/20">
                  Active
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {new Date(rev.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
              </span>
              {!rev.is_active && (
                <button
                  onClick={() => handleApply(rev)}
                  disabled={applyRev.isPending}
                  className="p-0.5 rounded hover:bg-primary/10 text-primary disabled:opacity-30"
                  title="Activer cette révision"
                >
                  <Play size={10} />
                </button>
              )}
              {!rev.is_active && (
                <button
                  onClick={() => deleteRev.mutate({ projectId, revisionId: rev.id })}
                  className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100"
                  title="Supprimer"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {creating ? (
        <div className="border border-primary/30 rounded p-2 bg-primary/5 space-y-1.5">
          <div className="text-[10px] font-medium text-primary flex items-center gap-1">
            {creating === 'simulation' ? <FlaskConical size={10} /> : <Camera size={10} />}
            Nouvelle {creating === 'simulation' ? 'simulation' : 'référence (baseline)'}
          </div>
          <input
            type="text"
            value={revName}
            onChange={e => setRevName(e.target.value)}
            className={`${panelInputClass} w-full text-xs`}
            placeholder="Nom de la révision *"
            autoFocus
          />
          <textarea
            value={revDesc}
            onChange={e => setRevDesc(e.target.value)}
            className={`${panelInputClass} w-full text-xs min-h-[36px] resize-y`}
            placeholder="Description (optionnel)…"
            rows={2}
          />
          <div className="flex justify-end gap-1">
            <button
              onClick={() => { setCreating(null); setRevName(''); setRevDesc('') }}
              className="px-2 py-0.5 text-[10px] rounded hover:bg-muted text-muted-foreground"
            >
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={!revName.trim() || createRev.isPending}
              className="px-2 py-0.5 text-[10px] rounded bg-primary text-primary-foreground disabled:opacity-40"
            >
              {createRev.isPending ? <Loader2 size={9} className="animate-spin inline" /> : 'Créer'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCreating('baseline')}
            className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80"
          >
            <Camera size={10} /> Nouvelle référence
          </button>
          <span className="text-muted-foreground">·</span>
          <button
            onClick={() => setCreating('simulation')}
            className="flex items-center gap-1 text-[10px] text-orange-600 hover:text-orange-500"
          >
            <FlaskConical size={10} /> Nouvelle simulation
          </button>
        </div>
      )}
    </FormSection>
  )
}

// -- Spreadsheet View (MS Project-like) ----------------------------------------

function SpreadsheetView() {
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [filterProjectId, setFilterProjectId] = useState<string | undefined>(undefined)
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({})
  const { toast } = useToast()

  const statusFilter = typeof activeFilters.status === 'string' ? activeFilters.status : undefined
  const priorityFilter = typeof activeFilters.priority === 'string' ? activeFilters.priority : undefined

  const { data, isLoading } = useAllProjectTasks({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    project_id: filterProjectId,
    status: statusFilter,
    priority: priorityFilter,
  })

  // Projects list for filter dropdown
  const { data: projectsData } = useProjects({ page_size: 100 })

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters, filterProjectId])

  const handleInlineSave = useCallback(async (row: ProjectTaskEnriched, columnId: string, value: unknown) => {
    try {
      await projetsService.updateTask(row.project_id, row.id, { [columnId]: value })
      toast({ title: 'Modifie', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [toast])

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters(prev => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])

  const filters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'status', label: 'Statut', type: 'multi-select', operators: ['is', 'is_not'], options: TASK_STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
    { id: 'priority', label: 'Priorité', type: 'select', options: PRIORITY_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
  ], [])

  const inlineEdit = useMemo<InlineEditConfig<ProjectTaskEnriched>>(() => ({
    editableColumns: ['title', 'status', 'priority', 'start_date', 'due_date', 'progress', 'estimated_hours', 'actual_hours'],
    onSave: handleInlineSave,
  }), [handleInlineSave])

  const columns = useMemo<ColumnDef<ProjectTaskEnriched, unknown>[]>(() => [
    {
      accessorKey: 'project_code', header: 'Projet', size: 90, enableResizing: true,
      cell: ({ row }) => <span className="font-mono text-[10px] text-muted-foreground">{row.original.project_code}</span>,
    },
    {
      accessorKey: 'code', header: 'Ref', size: 70,
      cell: ({ row }) => <span className="font-mono text-[10px] text-muted-foreground">{row.original.code || '--'}</span>,
    },
    {
      accessorKey: 'title', header: 'Tache', size: 280, enableResizing: true,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <TaskStatusIcon status={row.original.status} size={12} />
          <span className={cn('truncate', row.original.status === 'done' && 'line-through text-muted-foreground')}>
            {row.original.title}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'status', header: 'Statut', size: 100,
      cell: ({ row }) => {
        const opt = TASK_STATUS_OPTIONS.find(s => s.value === row.original.status)
        return <span className={cn('text-xs', opt?.color)}>{opt?.label ?? row.original.status}</span>
      },
    },
    {
      accessorKey: 'priority', header: 'Priorité', size: 80,
      cell: ({ row }) => {
        const p = row.original.priority
        const cls = p === 'critical' ? 'gl-badge-danger' : p === 'high' ? 'gl-badge-warning' : 'gl-badge-neutral'
        return <span className={cn('gl-badge', cls)}>{PRIORITY_OPTIONS.find(o => o.value === p)?.label ?? p}</span>
      },
    },
    {
      accessorKey: 'start_date', header: 'Debut', size: 100,
      cell: ({ row }) => row.original.start_date
        ? <span className="text-xs tabular-nums">{new Date(row.original.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
        : <span className="text-muted-foreground/40">--</span>,
    },
    {
      accessorKey: 'due_date', header: 'Fin', size: 100,
      cell: ({ row }) => row.original.due_date
        ? <span className="text-xs tabular-nums">{new Date(row.original.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
        : <span className="text-muted-foreground/40">--</span>,
    },
    {
      accessorKey: 'progress', header: '%', size: 70,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${row.original.progress}%` }} />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">{row.original.progress}%</span>
        </div>
      ),
    },
    {
      accessorKey: 'estimated_hours', header: 'H.Est', size: 60,
      cell: ({ row }) => <span className="text-xs tabular-nums text-muted-foreground">{row.original.estimated_hours ?? '--'}</span>,
    },
    {
      accessorKey: 'actual_hours', header: 'H.Reel', size: 60,
      cell: ({ row }) => <span className="text-xs tabular-nums text-muted-foreground">{row.original.actual_hours ?? '--'}</span>,
    },
    {
      accessorKey: 'assignee_name', header: 'Responsable', size: 130,
      cell: ({ row }) => <span className="text-xs text-muted-foreground truncate">{row.original.assignee_name || '--'}</span>,
    },
  ], [])

  const pagination: DataTablePagination | undefined = data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined

  return (
    <div className="flex flex-col h-full">
      {/* Project filter bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
        <Sheet size={14} className="text-primary" />
        <span className="text-xs font-medium text-muted-foreground">Projet:</span>
        <select
          value={filterProjectId || ''}
          onChange={(e) => setFilterProjectId(e.target.value || undefined)}
          className="text-xs border border-border rounded px-2 py-1 bg-background min-w-[180px]"
        >
          <option value="">Tous les projets</option>
          {projectsData?.items?.map(p => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </select>
        <span className="text-[10px] text-muted-foreground ml-auto">Double-clic sur une cellule pour editer</span>
      </div>

      <div className="flex-1 overflow-hidden">
        <DataTable<ProjectTaskEnriched>
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          pagination={pagination}
          onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Rechercher par tache ou code projet..."
          filters={filters}
          activeFilters={activeFilters}
          onFilterChange={handleFilterChange}
          inlineEdit={inlineEdit}
          emptyIcon={Sheet}
          emptyTitle="Aucune tache"
          columnResizing
          columnPinning
          columnVisibility
          defaultPinnedColumns={{ left: ['project_code', 'title'] }}
          compact
          storageKey="projets-spreadsheet"
        />
      </div>
    </div>
  )
}

// -- Macro Planning View -------------------------------------------------------

interface PlanningConfig {
  showProjects: boolean
  showTasks: boolean
  showMilestones: boolean
  levelDepth: number  // 1 = projects only, 2 = +tasks, 3 = +sub-tasks
  colorBy: 'status' | 'priority' | 'weather'
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-300', planned: 'bg-blue-300', active: 'bg-green-400',
  on_hold: 'bg-yellow-400', completed: 'bg-emerald-500', cancelled: 'bg-red-400',
  todo: 'bg-gray-300', in_progress: 'bg-blue-400', review: 'bg-yellow-400', done: 'bg-green-500',
}
const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-300', medium: 'bg-blue-300', high: 'bg-orange-400', critical: 'bg-red-500',
}
const WEATHER_COLORS: Record<string, string> = {
  sunny: 'bg-yellow-400', cloudy: 'bg-gray-400', rainy: 'bg-blue-500', stormy: 'bg-red-500',
}

function getBarColor(item: { status?: string; priority?: string; weather?: string }, colorBy: string): string {
  if (colorBy === 'priority') return PRIORITY_COLORS[(item as Record<string, string>).priority] || 'bg-gray-300'
  if (colorBy === 'weather') return WEATHER_COLORS[(item as Record<string, string>).weather] || 'bg-gray-300'
  return STATUS_COLORS[(item as Record<string, string>).status] || 'bg-gray-300'
}

/* @ts-expect-error legacy — replaced by ProjectGanttView.tsx */
function _MacroPlanningViewLegacy() { // eslint-disable-line
  const [config, setConfig] = useState<PlanningConfig>({
    showProjects: true,
    showTasks: true,
    showMilestones: true,
    levelDepth: 2,
    colorBy: 'status',
  })

  const { data: projectsData, isLoading } = useProjects({ page_size: 100 })
  const projects = projectsData?.items ?? []

  // Date range: min/max across all projects
  const allDates = useMemo(() => {
    const dates: number[] = []
    for (const p of projects) {
      if (p.start_date) dates.push(new Date(p.start_date).getTime())
      if (p.end_date) dates.push(new Date(p.end_date).getTime())
    }
    if (dates.length === 0) {
      const now = Date.now()
      return { min: now - 30 * 86400000, max: now + 180 * 86400000 }
    }
    const min = Math.min(...dates) - 7 * 86400000
    const max = Math.max(...dates) + 30 * 86400000
    return { min, max }
  }, [projects])

  const totalDays = Math.max(1, Math.ceil((allDates.max - allDates.min) / 86400000))

  // Generate month headers
  const months = useMemo(() => {
    const result: { label: string; startPct: number; widthPct: number }[] = []
    const startDate = new Date(allDates.min)
    startDate.setDate(1)
    const endDate = new Date(allDates.max)
    let current = new Date(startDate)
    while (current <= endDate) {
      const monthStart = Math.max(0, (current.getTime() - allDates.min) / 86400000)
      const nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1)
      const monthEnd = Math.min(totalDays, (nextMonth.getTime() - allDates.min) / 86400000)
      result.push({
        label: current.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        startPct: (monthStart / totalDays) * 100,
        widthPct: ((monthEnd - monthStart) / totalDays) * 100,
      })
      current = nextMonth
    }
    return result
  }, [allDates, totalDays])

  const getBarStyle = (startDateStr: string | null, endDateStr: string | null) => {
    if (!startDateStr) return null
    const start = new Date(startDateStr).getTime()
    const end = endDateStr ? new Date(endDateStr).getTime() : start + 30 * 86400000
    const left = ((start - allDates.min) / 86400000 / totalDays) * 100
    const width = Math.max(1, ((end - start) / 86400000 / totalDays) * 100)
    return { left: `${left}%`, width: `${width}%` }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Config toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 flex-wrap">
        <CalendarRange size={14} className="text-primary" />
        <span className="text-xs font-medium text-muted-foreground">Macro-Planning</span>

        <div className="flex items-center gap-1.5 ml-4">
          <span className="text-[10px] text-muted-foreground">Niveaux:</span>
          {[1, 2, 3].map(level => (
            <button
              key={level}
              onClick={() => setConfig(c => ({ ...c, levelDepth: level }))}
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] border',
                config.levelDepth === level ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              )}
            >
              {level}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Couleur:</span>
          {(['status', 'priority', 'weather'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setConfig(c => ({ ...c, colorBy: opt }))}
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] border',
                config.colorBy === opt ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              )}
            >
              {opt === 'status' ? 'Statut' : opt === 'priority' ? 'Priorité' : 'Météo'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={config.showTasks} onChange={(e) => setConfig(c => ({ ...c, showTasks: e.target.checked }))} className="w-3 h-3" />
            Taches
          </label>
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={config.showMilestones} onChange={(e) => setConfig(c => ({ ...c, showMilestones: e.target.checked }))} className="w-3 h-3" />
            Jalons
          </label>
        </div>
      </div>

      {/* Planning grid */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
        ) : projects.length === 0 ? (
          <EmptyState icon={CalendarRange} title="Aucun projet" variant="search" />
        ) : (
          <div className="min-w-[900px]">
            {/* Month headers */}
            <div className="flex border-b border-border bg-muted/50 sticky top-0 z-10">
              <div className="w-[260px] shrink-0 px-3 py-1.5 text-[10px] font-medium text-muted-foreground border-r border-border">Nom</div>
              <div className="flex-1 relative h-7">
                {months.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full text-[10px] text-muted-foreground flex items-center px-1 border-r border-border/40"
                    style={{ left: `${m.startPct}%`, width: `${m.widthPct}%` }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Project rows */}
            {projects.map((project) => (
              <PlanningProjectRow
                key={project.id}
                project={project}
                config={config}
                getBarStyle={getBarStyle}
                allDates={allDates}
                totalDays={totalDays}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PlanningProjectRow({
  project, config, getBarStyle, allDates, totalDays,
}: {
  project: Project
  config: PlanningConfig
  getBarStyle: (s: string | null, e: string | null) => { left: string; width: string } | null
  allDates: { min: number; max: number }
  totalDays: number
}) {
  const [expanded, setExpanded] = useState(false)
  const { data: tasks } = useProjectTasks(expanded && config.levelDepth >= 2 ? project.id : undefined)
  const { data: milestones } = useProjectMilestones(expanded && config.showMilestones ? project.id : undefined)

  const barStyle = getBarStyle(project.start_date, project.end_date)
  const isMacro = (project.children_count ?? 0) > 0

  return (
    <>
      {/* Project bar */}
      <div
        className={cn('flex border-b border-border/50 hover:bg-muted/30 cursor-pointer', isMacro && 'bg-muted/20')}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-[260px] shrink-0 px-3 py-1.5 flex items-center gap-1.5 border-r border-border">
          <ChevronRight size={12} className={cn('text-muted-foreground transition-transform shrink-0', expanded && 'rotate-90')} />
          {isMacro && <Layers size={11} className="text-primary shrink-0" />}
          <span className={cn('text-xs truncate', isMacro ? 'font-semibold' : 'font-medium')}>{project.code}</span>
          <span className="text-[10px] text-muted-foreground truncate">{project.name}</span>
        </div>
        <div className="flex-1 relative py-1.5 min-h-[28px]">
          {barStyle && (
            <div
              className={cn('absolute h-4 rounded-sm top-1/2 -translate-y-1/2', getBarColor(project, config.colorBy))}
              style={barStyle}
              title={`${project.name} — ${project.status} (${project.progress}%)`}
            >
              <span className="text-[9px] text-white px-1 truncate block leading-4">{project.progress}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded: tasks + milestones */}
      {expanded && config.showTasks && config.levelDepth >= 2 && tasks?.map((task) => {
        const tBarStyle = getBarStyle(task.start_date, task.due_date)
        return (
          <div key={task.id} className="flex border-b border-border/30 bg-background">
            <div className="w-[260px] shrink-0 px-3 py-1 flex items-center gap-1.5 border-r border-border pl-8">
              <TaskStatusIcon status={task.status} size={10} />
              <span className={cn('text-[11px] truncate', task.status === 'done' && 'line-through text-muted-foreground')}>{task.title}</span>
            </div>
            <div className="flex-1 relative py-1 min-h-[22px]">
              {tBarStyle && (
                <div
                  className={cn('absolute h-3 rounded-sm top-1/2 -translate-y-1/2', getBarColor(task, config.colorBy))}
                  style={tBarStyle}
                  title={`${task.title} — ${task.status}`}
                />
              )}
            </div>
          </div>
        )
      })}

      {expanded && config.showMilestones && milestones?.map((ms) => {
        if (!ms.due_date) return null
        const msDay = (new Date(ms.due_date).getTime() - allDates.min) / 86400000
        const leftPct = (msDay / totalDays) * 100
        return (
          <div key={ms.id} className="flex border-b border-border/30 bg-background">
            <div className="w-[260px] shrink-0 px-3 py-1 flex items-center gap-1.5 border-r border-border pl-8">
              <Milestone size={10} className={ms.status === 'completed' ? 'text-green-500' : 'text-yellow-500'} />
              <span className="text-[11px] truncate text-muted-foreground">{ms.name}</span>
            </div>
            <div className="flex-1 relative py-1 min-h-[22px]">
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rotate-45 bg-yellow-500 border border-yellow-600"
                style={{ left: `${leftPct}%` }}
                title={`${ms.name} — ${new Date(ms.due_date).toLocaleDateString('fr-FR')}`}
              />
            </div>
          </div>
        )
      })}
    </>
  )
}

// -- Sub-Projects Section (for detail panel) ----------------------------------

function SubProjectsSection({ projectId }: { projectId: string }) {
  const { data: children, isLoading } = useSubProjects(projectId)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  if (isLoading) return <div className="text-xs text-muted-foreground py-2"><Loader2 size={12} className="animate-spin inline mr-1" />Chargement...</div>
  if (!children || children.length === 0) return <EmptyState icon={Layers} title="Aucun sous-projet" variant="search" size="compact" />

  return (
    <div className="border border-border rounded-md overflow-hidden">
      {children.map((child) => (
        <div
          key={child.id}
          className="flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-muted/40 transition-colors cursor-pointer border-b border-border/60 last:border-0"
          onClick={() => openDynamicPanel({ type: 'detail', module: 'projets', id: child.id })}
        >
          <FolderKanban size={11} className="text-primary shrink-0" />
          <span className="font-medium">{child.code}</span>
          <span className="text-muted-foreground truncate flex-1">{child.name}</span>
          <span className={cn('gl-badge', child.status === 'active' ? 'gl-badge-success' : 'gl-badge-neutral')}>
            {STATUS_OPTIONS.find(s => s.value === child.status)?.label ?? child.status}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{child.progress}%</span>
          <ChevronRight size={12} className="text-muted-foreground" />
        </div>
      ))}
    </div>
  )
}

// -- Kanban view (by status) -------------------------------------------------

const KANBAN_COLUMNS: { status: string; label: string; color: string }[] = [
  { status: 'todo', label: 'À faire', color: 'border-muted' },
  { status: 'in_progress', label: 'En cours', color: 'border-blue-400' },
  { status: 'review', label: 'Revue', color: 'border-yellow-400' },
  { status: 'done', label: 'Terminé', color: 'border-green-500' },
]

function KanbanCard({ task }: { task: ProjectTaskEnriched }) {
  const priorityOpt = PRIORITY_OPTIONS.find(p => p.value === task.priority)
  const dueDate = task.due_date ? new Date(task.due_date) : null
  const isOverdue = dueDate && dueDate.getTime() < Date.now() && task.status !== 'done'

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/opsflux-task', JSON.stringify({ id: task.id, currentStatus: task.status }))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="bg-background border border-border rounded-md p-2 shadow-sm hover:shadow cursor-move space-y-1"
    >
      <div className="flex items-start gap-1.5">
        <TaskStatusIcon status={task.status} size={11} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium line-clamp-2">{task.title}</div>
          <div className="text-[9px] text-muted-foreground font-mono truncate mt-0.5">{task.project_code}</div>
        </div>
      </div>
      {(task.priority === 'high' || task.priority === 'critical') && (
        <span className={cn(
          'inline-block text-[8px] px-1 rounded',
          task.priority === 'critical' ? 'bg-red-500/10 text-red-500' : 'bg-orange-500/10 text-orange-500',
        )}>
          {priorityOpt?.label}
        </span>
      )}
      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
        {dueDate && (
          <span className={cn('tabular-nums', isOverdue && 'text-red-500 font-medium')}>
            {dueDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
          </span>
        )}
        {task.assignee_name && <span className="truncate">· {task.assignee_name}</span>}
        {task.progress > 0 && <span className="ml-auto tabular-nums">{task.progress}%</span>}
      </div>
    </div>
  )
}

function KanbanColumn({
  status, label, color, tasks, onTaskDrop,
}: {
  status: string
  label: string
  color: string
  tasks: ProjectTaskEnriched[]
  onTaskDrop: (taskId: string, newStatus: string) => void
}) {
  const [isOver, setIsOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!isOver) setIsOver(true)
  }

  const handleDragLeave = () => setIsOver(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsOver(false)
    const raw = e.dataTransfer.getData('application/opsflux-task')
    if (!raw) return
    try {
      const { id, currentStatus } = JSON.parse(raw)
      if (currentStatus !== status) onTaskDrop(id, status)
    } catch { /* ignore */ }
  }

  return (
    <div
      className={cn(
        'flex flex-col w-[260px] shrink-0 rounded-lg border-t-2 bg-muted/30 transition-colors',
        color,
        isOver && 'bg-primary/5 ring-2 ring-primary/30',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="px-3 py-2 flex items-center justify-between border-b border-border/40">
        <span className="text-xs font-semibold">{label}</span>
        <span className="text-[10px] tabular-nums px-1.5 py-0 rounded bg-background text-muted-foreground">{tasks.length}</span>
      </div>
      <div className="p-1.5 space-y-1.5 flex-1 overflow-y-auto max-h-[calc(100vh-220px)]">
        {tasks.map(t => (
          <KanbanCard key={t.id} task={t} />
        ))}
        {tasks.length === 0 && (
          <div className="text-[10px] text-muted-foreground text-center py-4 italic">Glissez une tâche ici</div>
        )}
      </div>
    </div>
  )
}

function KanbanView() {
  const [filterProjectId, setFilterProjectId] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const { data: projectsData } = useProjects({ page_size: 100 })
  const { data: tasksData, isLoading } = useAllProjectTasks({
    page: 1, page_size: 500,
    project_id: filterProjectId,
    search: debouncedSearch || undefined,
  })
  const { toast } = useToast()

  const tasks = tasksData?.items ?? []
  const columns = useMemo(() => {
    const map = new Map<string, ProjectTaskEnriched[]>()
    for (const col of KANBAN_COLUMNS) map.set(col.status, [])
    for (const t of tasks) {
      const bucket = map.get(t.status) ?? map.get('todo')!
      bucket.push(t)
    }
    return map
  }, [tasks])

  const handleTaskDrop = useCallback(async (taskId: string, newStatus: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    try {
      await projetsService.updateTask(task.project_id, taskId, { status: newStatus })
      toast({ title: 'Statut mis à jour', variant: 'success' })
    } catch {
      toast({ title: 'Erreur mise à jour', variant: 'error' })
    }
  }, [tasks, toast])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
        <FolderKanban size={14} className="text-primary" />
        <span className="text-xs font-medium text-muted-foreground">Projet:</span>
        <select
          value={filterProjectId || ''}
          onChange={e => setFilterProjectId(e.target.value || undefined)}
          className="text-xs border border-border rounded px-2 py-1 bg-background min-w-[180px]"
        >
          <option value="">Tous les projets</option>
          {projectsData?.items?.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher une tâche…"
          className="text-xs border border-border rounded px-2 py-1 bg-background flex-1 max-w-[260px]"
        />
        <span className="text-[10px] text-muted-foreground ml-auto">Glisser-déposer pour changer le statut</span>
      </div>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto p-3">
          <div className="flex gap-3 h-full">
            {KANBAN_COLUMNS.map(col => (
              <KanbanColumn
                key={col.status}
                status={col.status}
                label={col.label}
                color={col.color}
                tasks={columns.get(col.status) ?? []}
                onTaskDrop={handleTaskDrop}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// -- Dashboard view (KPIs + health overview) ---------------------------------

function DashboardKpiCard({ icon: Icon, label, value, hint, tone = 'default' }: {
  icon: typeof Target
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'primary'
}) {
  const toneClass = {
    default: 'border-border text-foreground',
    success: 'border-green-500/30 bg-green-500/5 text-green-700',
    warning: 'border-orange-500/30 bg-orange-500/5 text-orange-700',
    danger: 'border-red-500/30 bg-red-500/5 text-red-700',
    primary: 'border-primary/30 bg-primary/5 text-primary',
  }[tone]
  return (
    <div className={cn('border rounded-md p-3', toneClass)}>
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide opacity-70">
        <Icon size={12} /> {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
      {hint && <div className="text-[10px] opacity-60 mt-0.5">{hint}</div>}
    </div>
  )
}

function DashboardView() {
  const { data: projectsData, isLoading: projLoading } = useProjects({ page_size: 200 })
  const { data: tasksData, isLoading: tasksLoading } = useAllProjectTasks({ page: 1, page_size: 1000 })
  const openDynamicPanel = useUIStore(s => s.openDynamicPanel)

  const projects = projectsData?.items ?? []
  const tasks = tasksData?.items ?? []

  const stats = useMemo(() => {
    const total = projects.length
    const active = projects.filter(p => p.status === 'active').length
    const completed = projects.filter(p => p.status === 'completed').length
    const onHold = projects.filter(p => p.status === 'on_hold').length
    const avgProgress = total > 0 ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / total) : 0
    const totalBudget = projects.reduce((s, p) => s + (p.budget ?? 0), 0)
    const goutiCount = projects.filter(p => p.external_ref && p.external_ref.startsWith('gouti:')).length

    const tasksDone = tasks.filter(t => t.status === 'done').length
    const tasksOverdue = tasks.filter(t => {
      if (!t.due_date || t.status === 'done' || t.status === 'cancelled') return false
      return new Date(t.due_date).getTime() < Date.now()
    }).length
    const tasksInProgress = tasks.filter(t => t.status === 'in_progress').length
    const tasksCritical = tasks.filter(t => t.priority === 'critical' && t.status !== 'done').length

    // Health by weather
    const byWeather: Record<string, number> = { sunny: 0, cloudy: 0, rainy: 0, stormy: 0 }
    for (const p of projects) byWeather[p.weather] = (byWeather[p.weather] ?? 0) + 1

    // Upcoming deadlines (next 14 days)
    const horizon = Date.now() + 14 * 86400000
    const upcoming = tasks
      .filter(t => t.due_date && t.status !== 'done' && t.status !== 'cancelled')
      .filter(t => new Date(t.due_date!).getTime() < horizon)
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
      .slice(0, 8)

    // Top projects by task volume
    const topProjects = [...projects]
      .sort((a, b) => (b.task_count ?? 0) - (a.task_count ?? 0))
      .slice(0, 5)

    return {
      total, active, completed, onHold, avgProgress, totalBudget, goutiCount,
      tasksDone, tasksOverdue, tasksInProgress, tasksCritical,
      byWeather, upcoming, topProjects,
    }
  }, [projects, tasks])

  if (projLoading || tasksLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  const formatCurrency = (n: number) => n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n)

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DashboardKpiCard icon={FolderKanban} label="Projets actifs" value={stats.active} hint={`${stats.total} au total`} tone="primary" />
        <DashboardKpiCard icon={CheckCircle2} label="Projets terminés" value={stats.completed} tone="success" />
        <DashboardKpiCard icon={Target} label="Progression moy." value={`${stats.avgProgress}%`} />
        <DashboardKpiCard
          icon={Target}
          label="Budget cumulé"
          value={`${formatCurrency(stats.totalBudget)} XAF`}
          hint={stats.goutiCount > 0 ? `${stats.goutiCount} depuis Gouti` : undefined}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DashboardKpiCard icon={ListTodo} label="Tâches en cours" value={stats.tasksInProgress} tone="primary" />
        <DashboardKpiCard icon={Clock} label="Tâches en retard" value={stats.tasksOverdue} tone={stats.tasksOverdue > 0 ? 'danger' : 'default'} />
        <DashboardKpiCard icon={CircleDot} label="Tâches critiques" value={stats.tasksCritical} tone={stats.tasksCritical > 0 ? 'warning' : 'default'} />
        <DashboardKpiCard icon={CheckCircle2} label="Tâches terminées" value={stats.tasksDone} tone="success" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border border-border rounded-md p-3">
          <div className="text-xs font-semibold mb-2 flex items-center gap-1">
            <Sun size={12} className="text-yellow-500" /> Santé des projets (météo)
          </div>
          <div className="space-y-1.5">
            {WEATHER_OPTIONS.map(w => {
              const count = stats.byWeather[w.value] ?? 0
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0
              return (
                <div key={w.value} className="flex items-center gap-2 text-[11px]">
                  <w.icon size={12} className={
                    w.value === 'sunny' ? 'text-yellow-500' :
                    w.value === 'cloudy' ? 'text-gray-400' :
                    w.value === 'rainy' ? 'text-blue-400' : 'text-red-500'
                  } />
                  <span className="w-16">{w.label}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        w.value === 'sunny' ? 'bg-yellow-500' :
                        w.value === 'cloudy' ? 'bg-gray-400' :
                        w.value === 'rainy' ? 'bg-blue-400' : 'bg-red-500',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-muted-foreground w-6 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="border border-border rounded-md p-3">
          <div className="text-xs font-semibold mb-2 flex items-center gap-1">
            <Clock size={12} className="text-orange-500" /> Échéances 14 prochains jours
          </div>
          {stats.upcoming.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic">Aucune tâche dans les 14 prochains jours</div>
          ) : (
            <div className="space-y-1">
              {stats.upcoming.map(t => {
                const isOverdue = new Date(t.due_date!).getTime() < Date.now()
                return (
                  <div key={t.id} className="flex items-center gap-1.5 text-[11px]">
                    <TaskStatusIcon status={t.status} size={10} />
                    <span className="flex-1 truncate">{t.title}</span>
                    <span className="text-[9px] text-muted-foreground font-mono">{t.project_code}</span>
                    <span className={cn('text-[9px] tabular-nums', isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground')}>
                      {new Date(t.due_date!).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="border border-border rounded-md p-3">
        <div className="text-xs font-semibold mb-2 flex items-center gap-1">
          <Layers size={12} className="text-primary" /> Projets par volume de tâches (top 5)
        </div>
        {stats.topProjects.length === 0 ? (
          <div className="text-[11px] text-muted-foreground italic">Aucun projet</div>
        ) : (
          <div className="space-y-1.5">
            {stats.topProjects.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-muted/40 px-2 py-1 rounded"
                onClick={() => openDynamicPanel({ type: 'detail', module: 'projets', id: p.id })}
              >
                <WeatherIcon weather={p.weather} size={12} />
                <span className="font-mono text-muted-foreground">{p.code}</span>
                <span className="flex-1 truncate">{p.name}</span>
                {p.external_ref && p.external_ref.startsWith('gouti:') && <GoutiBadge />}
                <div className="flex items-center gap-1 w-[120px]">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${p.progress}%` }} />
                  </div>
                  <span className="tabular-nums text-muted-foreground w-8 text-right">{p.progress}%</span>
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{p.task_count ?? 0} t.</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// -- View Tab Selector --------------------------------------------------------

type ViewTab = 'projets' | 'tableur' | 'kanban' | 'planning' | 'dashboard'

function ViewTabSelector({ active, onChange }: { active: ViewTab; onChange: (tab: ViewTab) => void }) {
  const tabs: { id: ViewTab; label: string; icon: typeof FolderKanban }[] = [
    { id: 'projets', label: 'Projets', icon: FolderKanban },
    { id: 'tableur', label: 'Tableur', icon: Sheet },
    { id: 'kanban', label: 'Kanban', icon: Layers },
    { id: 'planning', label: 'Planning', icon: CalendarRange },
    { id: 'dashboard', label: 'Dashboard', icon: Target },
  ]

  return (
    <div className="flex items-center gap-0.5 px-1 py-0.5 bg-muted/50 rounded-md">
      {tabs.map(tab => {
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors',
              active === tab.id
                ? 'bg-background text-foreground shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <Icon size={12} />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// -- Main Page ----------------------------------------------------------------

function ProjectsListView() {
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({})
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)
  const { hasPermission } = usePermission()
  const canImport = hasPermission('project.import')
  const canExport = hasPermission('project.export') || hasPermission('project.read')

  const statusFilter = typeof activeFilters.status === 'string' ? activeFilters.status : undefined
  const priorityFilter = typeof activeFilters.priority === 'string' ? activeFilters.priority : undefined
  const sourceFilter = activeFilters.source === 'gouti' || activeFilters.source === 'opsflux'
    ? (activeFilters.source as 'gouti' | 'opsflux')
    : undefined

  const { data, isLoading } = useProjects({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter,
    priority: priorityFilter,
    source: sourceFilter,
  })

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters])

  useEffect(() => {
    if (data?.items) setNavItems(data.items.map(i => i.id))
    return () => setNavItems([])
  }, [data?.items, setNavItems])

  const filters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'status', label: 'Statut', type: 'multi-select', operators: ['is', 'is_not'], options: STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
    { id: 'priority', label: 'Priorité', type: 'select', options: PRIORITY_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
    { id: 'source', label: 'Source', type: 'select', options: [
      { value: 'opsflux', label: 'OpsFlux (natif)' },
      { value: 'gouti', label: 'Importé de Gouti' },
    ]},
  ], [])

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters(prev => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])

  const columns = useMemo<ColumnDef<Project, unknown>[]>(() => [
    { accessorKey: 'code', header: 'Code', size: 120, cell: ({ row }) => (
      <div className="flex items-center gap-1">
        {(row.original.children_count ?? 0) > 0 && <Layers size={10} className="text-primary" />}
        <span className="font-medium text-foreground">{row.original.code}</span>
        {isGoutiProject(row.original) && <GoutiBadge />}
      </div>
    )},
    { accessorKey: 'name', header: 'Nom', cell: ({ row }) => <span className="text-foreground">{row.original.name}</span> },
    {
      accessorKey: 'status', header: 'Statut', size: 100,
      cell: ({ row }) => {
        const s = row.original.status
        const cls = s === 'active' ? 'gl-badge-success' : s === 'completed' ? 'gl-badge-info' : s === 'on_hold' || s === 'cancelled' ? 'gl-badge-danger' : 'gl-badge-neutral'
        return <span className={cn('gl-badge', cls)}>{STATUS_OPTIONS.find(o => o.value === s)?.label ?? s}</span>
      },
    },
    { accessorKey: 'weather', header: 'Météo', size: 60, cell: ({ row }) => <WeatherIcon weather={row.original.weather} /> },
    {
      accessorKey: 'progress', header: '%', size: 60,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${row.original.progress}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">{row.original.progress}%</span>
        </div>
      ),
    },
    {
      accessorKey: 'priority', header: 'Priorité', size: 80,
      cell: ({ row }) => {
        const p = row.original.priority
        const cls = p === 'critical' ? 'gl-badge-danger' : p === 'high' ? 'gl-badge-warning' : 'gl-badge-neutral'
        return <span className={cn('gl-badge', cls)}>{PRIORITY_OPTIONS.find(o => o.value === p)?.label ?? p}</span>
      },
    },
    { accessorKey: 'manager_name', header: 'Chef de projet', size: 140, cell: ({ row }) => row.original.manager_id
        ? <CrossModuleLink module="users" id={row.original.manager_id} label={row.original.manager_name || row.original.manager_id} showIcon={false} className="text-xs" />
        : <span className="text-muted-foreground/40">--</span>,
    },
    { accessorKey: 'task_count', header: 'Taches', size: 70, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.task_count ?? 0}</span> },
    {
      accessorKey: 'parent_name', header: 'Macro-projet', size: 130,
      cell: ({ row }) => row.original.parent_id
        ? <CrossModuleLink module="projets" id={row.original.parent_id} label={row.original.parent_name || row.original.parent_id} showIcon={false} className="text-xs" />
        : <span className="text-muted-foreground/40">--</span>,
    },
    { accessorKey: 'tier_name', header: 'Entreprise', size: 130, cell: ({ row }) => row.original.tier_id
        ? <CrossModuleLink module="tiers" id={row.original.tier_id} label={row.original.tier_name || row.original.tier_id} showIcon={false} className="text-xs" />
        : <span className="text-muted-foreground/40">--</span>,
    },
    {
      accessorKey: 'end_date', header: 'Echeance', size: 100,
      cell: ({ row }) => row.original.end_date
        ? <span className="text-muted-foreground text-xs">{new Date(row.original.end_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        : <span className="text-muted-foreground/40">--</span>,
    },
  ], [])

  const pagination: DataTablePagination | undefined = data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined

  return (
    <DataTable<Project>
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      pagination={pagination}
      onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Rechercher par code ou nom..."
      filters={filters}
      activeFilters={activeFilters}
      onFilterChange={handleFilterChange}
      onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'projets', id: row.id })}
      importExport={(canExport || canImport) ? {
        exportFormats: canExport ? ['csv', 'xlsx'] : undefined,
        advancedExport: true,
        importWizardTarget: canImport ? 'project' : undefined,
        filenamePrefix: 'projets',
      } : undefined}
      emptyIcon={FolderKanban}
      emptyTitle="Aucun projet"
      columnResizing
      columnPinning
      columnVisibility
      defaultPinnedColumns={{ left: ['code'] }}
      defaultHiddenColumns={['tier_name', 'end_date', 'parent_name']}
      storageKey="projets"
    />
  )
}

export function ProjetsPage() {
  useTranslation()
  const [viewTab, setViewTab] = useState<ViewTab>('projets')

  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'projets'

  return (
    <div className="flex h-full">
      {!isFullPanel && <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <PanelHeader icon={FolderKanban} title="Projets" subtitle="Gestion de projets">
          <ViewTabSelector active={viewTab} onChange={setViewTab} />
          <GoutiSyncToolbar />
          <ToolbarButton icon={Plus} label="Nouveau projet" variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'projets' })} />
        </PanelHeader>

        <PanelContent>
          {viewTab === 'projets' && <ProjectsListView />}
          {viewTab === 'tableur' && <SpreadsheetView />}
          {viewTab === 'kanban' && <KanbanView />}
          {viewTab === 'planning' && <ProjectGanttView />}
          {viewTab === 'dashboard' && <DashboardView />}
        </PanelContent>
      </div>}

      {dynamicPanel?.module === 'projets' && dynamicPanel.type === 'create' && <CreateProjectPanel />}
      {dynamicPanel?.module === 'projets' && dynamicPanel.type === 'detail' && <ProjectDetailPanel id={dynamicPanel.id} />}
    </div>
  )
}

registerPanelRenderer('projets', (view) => {
  if (view.type === 'create') return <CreateProjectPanel />
  if (view.type === 'detail' && 'id' in view) return <ProjectDetailPanel id={view.id} />
  return null
})
