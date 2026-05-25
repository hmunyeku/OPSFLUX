/**
 * Kanban tab (tasks grouped by status columns with drag-and-drop).
 *
 * Extracted from ProjetsPage.tsx — pure restructure, no behavior changes.
 */
import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderKanban, Loader2, Users } from 'lucide-react'
import { DataTableToolbar, type DataTableFilterDef } from '@/components/ui/DataTable'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useFilterPersistence } from '@/hooks/useFilterPersistence'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { ProjectSelectorModal } from '@/components/shared/ProjectSelectorModal'
import { useProjectFilter } from '@/hooks/useProjectFilter'
import { useAllProjectTasks, useUpdateProjectTask } from '@/hooks/useProjets'
import type { ProjectTaskEnriched } from '@/types/api'
import {
  PROJECT_PRIORITY_LABELS_FALLBACK, PROJECT_PRIORITY_VALUES,
  PROJECT_TASK_STATUS_LABELS_FALLBACK, PROJECT_TASK_STATUS_VALUES,
  buildDictionaryOptions,
  TaskStatusIcon,
} from '../shared'

const KANBAN_COLUMNS: { status: string; label: string; color: string }[] = [
  { status: 'todo', label: 'À faire', color: 'border-muted' },
  { status: 'in_progress', label: 'En cours', color: 'border-blue-400' },
  { status: 'review', label: 'Revue', color: 'border-yellow-400' },
  { status: 'done', label: 'Terminé', color: 'border-green-500' },
]

function activeFilterValues(raw: unknown): string[] {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'object') {
    const value = raw as { value?: unknown; values?: unknown[] }
    if (Array.isArray(value.values)) return value.values.map(String)
    if (value.value != null) return [String(value.value)]
  }
  return [String(raw)]
}

function isNegatedFilter(raw: unknown): boolean {
  return Boolean(raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as { operator?: string }).operator === 'is_not')
}

function KanbanCard({ task }: { task: ProjectTaskEnriched }) {
  const projectPriorityLabels = useDictionaryLabels('project_priority', PROJECT_PRIORITY_LABELS_FALLBACK)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const dueDate = task.due_date ? new Date(task.due_date) : null
  const isOverdue = dueDate && dueDate.getTime() < Date.now() && task.status !== 'done'

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/opsflux-task', JSON.stringify({ id: task.id, currentStatus: task.status }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleClick = () => {
    openDynamicPanel({ type: 'task-detail', module: 'projets', id: task.id, meta: { projectId: task.project_id } })
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      className="bg-background border border-border rounded-lg p-2.5 shadow-sm hover:shadow-md hover:border-primary/30 cursor-pointer space-y-1.5 transition-all"
    >
      <div className="flex items-start gap-1.5">
        <TaskStatusIcon status={task.status} size={12} className="mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium line-clamp-2 leading-snug">{task.title}</div>
          <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
            {task.project_code}{task.project_name ? ` · ${task.project_name}` : ''}
          </div>
        </div>
      </div>
      {/* Progress bar */}
      {task.progress > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${task.progress}%` }} />
          </div>
          <span className="text-[9px] tabular-nums text-muted-foreground font-medium">{task.progress}%</span>
        </div>
      )}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {(task.priority === 'high' || task.priority === 'critical') && (
          <span className={cn(
            'inline-block text-[9px] px-1.5 py-0.5 rounded-full font-medium',
            task.priority === 'critical' ? 'bg-red-500/10 text-red-600' : 'bg-orange-500/10 text-orange-600',
          )}>
            {projectPriorityLabels[task.priority] ?? task.priority}
          </span>
        )}
        {dueDate && (
          <span className={cn('tabular-nums', isOverdue && 'text-red-500 font-medium')}>
            {dueDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
          </span>
        )}
        {task.assignee_name && (
          <span className="truncate ml-auto flex items-center gap-1">
            <Users size={9} />
            {task.assignee_name.split(' ')[0]}
          </span>
        )}
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
        'flex min-h-[180px] flex-col rounded-lg border-t-2 bg-muted/30 transition-colors',
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
      <div className="p-1.5 space-y-1.5 flex-1 overflow-y-auto min-h-0">
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

export function KanbanView() {
  const { t } = useTranslation()
  const { selection, setSelection, filteredProjectIds, isFiltered } = useProjectFilter()
  const [showSelector, setShowSelector] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useFilterPersistence<Record<string, unknown>>('projets.kanban.filters', {})
  const taskStatusLabels = useDictionaryLabels('project_task_status', PROJECT_TASK_STATUS_LABELS_FALLBACK)
  const projectPriorityLabels = useDictionaryLabels('project_priority', PROJECT_PRIORITY_LABELS_FALLBACK)
  const taskStatusOptions = useMemo(() => buildDictionaryOptions(taskStatusLabels, PROJECT_TASK_STATUS_VALUES), [taskStatusLabels])
  const projectPriorityOptions = useMemo(() => buildDictionaryOptions(projectPriorityLabels, PROJECT_PRIORITY_VALUES), [projectPriorityLabels])
  const taskFilters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'status', label: 'Statut', type: 'multi-select', operators: ['is', 'is_not'], options: taskStatusOptions },
    { id: 'priority', label: 'Priorité', type: 'multi-select', operators: ['is', 'is_not'], options: projectPriorityOptions },
    { id: 'kind', label: 'Type', type: 'select', operators: ['is', 'is_not'], options: [
      { value: 'task', label: 'Tâche' },
      { value: 'milestone', label: 'Jalon' },
    ] },
  ], [projectPriorityOptions, taskStatusOptions])
  const { data: tasksData, isLoading } = useAllProjectTasks({
    page: 1, page_size: 500,
    search: debouncedSearch || undefined,
  })
  const { toast } = useToast()
  const updateTask = useUpdateProjectTask()

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters(prev => {
      const next = { ...prev }
      if (value === undefined || value === null || value === '') delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [setActiveFilters])

  const allTasks = tasksData?.items ?? []
  // Filter tasks by project selection (shared across views)
  const tasks = useMemo(() => {
    const projectScoped = filteredProjectIds ? allTasks.filter(t => filteredProjectIds.has(t.project_id)) : allTasks
    const statusValues = activeFilterValues(activeFilters.status)
    const priorityValues = activeFilterValues(activeFilters.priority)
    const kindValues = activeFilterValues(activeFilters.kind)
    const statusNegated = isNegatedFilter(activeFilters.status)
    const priorityNegated = isNegatedFilter(activeFilters.priority)
    const kindNegated = isNegatedFilter(activeFilters.kind)

    return projectScoped.filter(task => {
      const matchesStatus = statusValues.length === 0 || statusValues.includes(task.status)
      const matchesPriority = priorityValues.length === 0 || priorityValues.includes(task.priority)
      const kind = task.is_milestone ? 'milestone' : 'task'
      const matchesKind = kindValues.length === 0 || kindValues.includes(kind)

      return (statusNegated ? !matchesStatus : matchesStatus)
        && (priorityNegated ? !matchesPriority : matchesPriority)
        && (kindNegated ? !matchesKind : matchesKind)
    })
  }, [activeFilters, allTasks, filteredProjectIds])

  const columns = useMemo(() => {
    const map = new Map<string, ProjectTaskEnriched[]>()
    for (const col of KANBAN_COLUMNS) map.set(col.status, [])
    for (const t of tasks) {
      const bucket = map.get(t.status) ?? map.get('todo')!
      bucket.push(t)
    }
    return map
  }, [tasks])

  const handleTaskDrop = useCallback((taskId: string, newStatus: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    updateTask.mutate(
      { projectId: task.project_id, taskId, payload: { status: newStatus } },
      {
        onSuccess: () => toast({ title: t('projets.toast.status_updated'), variant: 'success' }),
        onError: () => toast({ title: t('projets.toast.update_error'), variant: 'error' }),
      },
    )
  }, [tasks, updateTask, toast])

  return (
    <div className="flex flex-col h-full">
      <DataTableToolbar
        toolbarLeft={
          <button
            onClick={() => setShowSelector(true)}
            className={cn('inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs whitespace-nowrap', isFiltered ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted text-muted-foreground')}
            title="Choisir les projets affichés"
          >
            <FolderKanban size={13} className="text-primary" />
            {isFiltered ? `${selection.projectIds.length} projet(s)` : 'Sélection'}
          </button>
        }
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('projets.search.visual_placeholder') as string}
        filters={taskFilters}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        currentViewMode="table"
        onViewModeChange={() => undefined}
        totalCount={tasks.length}
      />
      <div className="hidden">
        <FolderKanban size={14} className="text-primary" />
        <button
          onClick={() => setShowSelector(true)}
          className={cn('px-2 py-1 rounded border text-xs', isFiltered ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted text-muted-foreground')}
        >
          {isFiltered ? `${selection.projectIds.length} projet(s)` : 'Sélection'}
        </button>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher une tâche…"
          className="text-xs border border-border rounded px-2 py-1 bg-background flex-1 max-w-[260px]"
        />
      </div>
      <ProjectSelectorModal open={showSelector} onClose={() => setShowSelector(false)} selection={selection} onSelectionChange={setSelection} />
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="@container flex-1 min-h-0 overflow-hidden p-3">
          <div className="grid h-full grid-cols-1 gap-3 @[640px]:grid-cols-2 @[1280px]:grid-cols-4">
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
