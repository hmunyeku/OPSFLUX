/**
 * Spreadsheet tab (MS Project-like tree view of all tasks).
 *
 * Extracted from ProjetsPage.tsx — pure restructure, no behavior changes.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Sheet, FolderKanban, ChevronRight,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTableFilterDef, InlineEditConfig } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useFilterPersistence } from '@/hooks/useFilterPersistence'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { ProjectSelectorModal } from '@/components/shared/ProjectSelectorModal'
import { useProjectFilter } from '@/hooks/useProjectFilter'
import { useAllProjectTasks } from '@/hooks/useProjets'
import { projetsService } from '@/services/projetsService'
import type { ProjectTaskEnriched } from '@/types/api'
import {
  PROJECT_PRIORITY_VALUES, PROJECT_TASK_STATUS_VALUES,
  PROJECT_PRIORITY_LABELS_FALLBACK, PROJECT_TASK_STATUS_LABELS_FALLBACK,
  TASK_STATUS_META,
  buildDictionaryOptions,
  TaskStatusIcon,
} from '../shared'

/** Tree row type for spreadsheet — extends task with depth/group info */
type SpreadsheetRow = ProjectTaskEnriched & {
  _depth: number
  _isGroupHeader?: boolean
  _groupLabel?: string
  _groupTaskCount?: number
  _hasChildren?: boolean
  _childCount?: number
  _durationDays?: number | null
  _predecessorLabels?: string
}

function computeDurationDays(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null
  const duration = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000)
  return duration >= 0 ? duration + 1 : null
}

function minIsoDate(values: Array<string | null | undefined>): string | null {
  const dates = values.filter(Boolean) as string[]
  if (dates.length === 0) return null
  return dates.reduce((min, value) => (new Date(value).getTime() < new Date(min).getTime() ? value : min))
}

function maxIsoDate(values: Array<string | null | undefined>): string | null {
  const dates = values.filter(Boolean) as string[]
  if (dates.length === 0) return null
  return dates.reduce((max, value) => (new Date(value).getTime() > new Date(max).getTime() ? value : max))
}

function sumNullable(values: Array<number | null | undefined>): number | null {
  const numbers = values.filter((value): value is number => value != null)
  if (numbers.length === 0) return null
  return numbers.reduce((sum, value) => sum + value, 0)
}

/** Build tree-ordered flat array from tasks grouped by project */
function buildSpreadsheetTree(
  tasks: ProjectTaskEnriched[],
  expandedProjects: Set<string>,
  expandedTasks: Set<string>,
  depsMap?: Map<string, { from_task_id: string; dependency_type: string }[]>,
): SpreadsheetRow[] {
  // Group by project
  const byProject = new Map<string, { code: string; name: string; tasks: ProjectTaskEnriched[] }>()
  for (const t of tasks) {
    const key = t.project_id
    if (!byProject.has(key)) {
      byProject.set(key, { code: t.project_code || key.slice(0, 8), name: t.project_name || '', tasks: [] })
    }
    byProject.get(key)!.tasks.push(t)
  }

  const result: SpreadsheetRow[] = []

  for (const [projectId, group] of byProject) {
    // Project header row
    result.push({
      id: `__project__${projectId}`,
      project_id: projectId,
      project_code: group.code,
      project_name: group.name,
      parent_id: null,
      code: group.code,
      title: group.name || group.code,
      description: null,
      status: 'todo',
      priority: 'medium',
      assignee_id: null,
      progress: 0,
      start_date: null,
      due_date: null,
      completed_at: null,
      estimated_hours: null,
      actual_hours: null,
      order: 0,
      active: true,
      created_at: '',
      _depth: 0,
      _isGroupHeader: true,
      _groupLabel: `${group.code}${group.name ? ' — ' + group.name : ''}`,
      _groupTaskCount: group.tasks.length,
    } as SpreadsheetRow)

    if (!expandedProjects.has(projectId)) continue

    // Build task tree within project
    const taskMap = new Map(group.tasks.map(t => [t.id, t]))
    const childrenMap = new Map<string | null, ProjectTaskEnriched[]>()
    for (const t of group.tasks) {
      const parentKey = t.parent_id && taskMap.has(t.parent_id) ? t.parent_id : null
      if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, [])
      childrenMap.get(parentKey)!.push(t)
    }

    const rollupCache = new Map<string, ProjectTaskEnriched>()
    const displayTaskFor = (task: ProjectTaskEnriched): ProjectTaskEnriched => {
      const cached = rollupCache.get(task.id)
      if (cached) return cached

      const children = childrenMap.get(task.id) ?? []
      if (children.length === 0) {
        rollupCache.set(task.id, task)
        return task
      }

      const rolledChildren = children.map(displayTaskFor)
      const startDate = minIsoDate(rolledChildren.map(child => child.start_date))
      const dueDate = maxIsoDate(rolledChildren.map(child => child.due_date))
      const estimatedHours = sumNullable(rolledChildren.map(child => child.estimated_hours))
      const actualHours = sumNullable(rolledChildren.map(child => child.actual_hours))
      const weightedChildren = rolledChildren.map(child => ({
        progress: child.progress ?? 0,
        weight: child.estimated_hours ?? computeDurationDays(child.start_date, child.due_date) ?? 1,
      }))
      const totalWeight = weightedChildren.reduce((sum, child) => sum + child.weight, 0)
      const progress = totalWeight > 0
        ? Math.round(weightedChildren.reduce((sum, child) => sum + (child.progress * child.weight), 0) / totalWeight)
        : Math.round(rolledChildren.reduce((sum, child) => sum + (child.progress ?? 0), 0) / Math.max(1, rolledChildren.length))

      const rolledTask: ProjectTaskEnriched = {
        ...task,
        start_date: startDate,
        due_date: dueDate,
        estimated_hours: estimatedHours,
        actual_hours: actualHours,
        progress: Math.max(0, Math.min(100, progress)),
      }
      rollupCache.set(task.id, rolledTask)
      return rolledTask
    }

    // DFS to build ordered flat list
    function addChildren(parentId: string | null, depth: number) {
      const children = childrenMap.get(parentId) ?? []
      for (const child of children) {
        const displayTask = displayTaskFor(child)
        const kids = childrenMap.get(child.id) ?? []
        const hasKids = kids.length > 0
        // Duration
        const dur = computeDurationDays(displayTask.start_date, displayTask.due_date)
        // Predecessors from depsMap
        const taskDeps = depsMap?.get(child.id) ?? []
        const predLabels = taskDeps.map(d => {
          const pred = taskMap.get(d.from_task_id)
          return pred ? (pred.code || pred.title.slice(0, 15)) : d.from_task_id.slice(0, 6)
        }).join(', ')

        result.push({
          ...displayTask,
          _depth: depth,
          _hasChildren: hasKids,
          _childCount: kids.length,
          _durationDays: dur,
          _predecessorLabels: predLabels,
        })
        if (hasKids && expandedTasks.has(child.id)) {
          addChildren(child.id, depth + 1)
        }
      }
    }

    addChildren(null, 1)
  }

  return result
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokenMatches(haystack: string, token: string): boolean {
  if (!token) return true
  if (haystack.includes(token)) return true

  if (token.length < 4) return false
  const maxDistance = token.length >= 7 ? 2 : 1
  return haystack
    .split(/\s+/)
    .some(word => word.startsWith(token) || editDistanceWithin(word, token, maxDistance))
}

function editDistanceWithin(a: string, b: string, maxDistance: number): boolean {
  if (Math.abs(a.length - b.length) > maxDistance) return false

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    let rowMin = current[0]
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      )
      current[j] = value
      rowMin = Math.min(rowMin, value)
    }
    if (rowMin > maxDistance) return false
    previous = current
  }

  return previous[b.length] <= maxDistance
}

function taskSearchText(
  task: ProjectTaskEnriched,
  taskStatusLabels: Record<string, string>,
  projectPriorityLabels: Record<string, string>,
): string {
  const startDate = task.start_date ? new Date(task.start_date) : null
  const dueDate = task.due_date ? new Date(task.due_date) : null
  const completedAt = task.completed_at ? new Date(task.completed_at) : null
  const parts = [
    task.title,
    task.code,
    task.description,
    task.project_code,
    task.project_name,
    task.status,
    taskStatusLabels[task.status],
    task.priority,
    projectPriorityLabels[task.priority],
    task.assignee_name,
    task.progress != null ? `${task.progress} ${task.progress}% avancement progression` : null,
    task.estimated_hours != null ? `${task.estimated_hours}h estime heures` : null,
    task.actual_hours != null ? `${task.actual_hours}h consomme heures` : null,
    task.pob_quota != null ? `${task.pob_quota} pob quota effectif` : null,
    task.pob_quota_mode === 'variable' ? 'pob variable j1 j2 planification relative' : null,
    task.pob_quota_mode === 'constant' ? 'pob fixe constant' : null,
    task.is_milestone ? 'jalon milestone' : null,
    startDate?.toISOString().slice(0, 10),
    startDate?.toLocaleDateString('fr-FR'),
    dueDate?.toISOString().slice(0, 10),
    dueDate?.toLocaleDateString('fr-FR'),
    completedAt?.toISOString().slice(0, 10),
    completedAt?.toLocaleDateString('fr-FR'),
  ]
  return normalizeSearchText(parts.filter(Boolean).join(' '))
}

function filterTasksForSearch(
  tasks: ProjectTaskEnriched[],
  query: string,
  taskStatusLabels: Record<string, string>,
  projectPriorityLabels: Record<string, string>,
): ProjectTaskEnriched[] {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return tasks

  const byId = new Map(tasks.map(task => [task.id, task]))
  const keepIds = new Set<string>()

  for (const task of tasks) {
    const haystack = taskSearchText(task, taskStatusLabels, projectPriorityLabels)
    if (!tokens.every(token => tokenMatches(haystack, token))) continue

    keepIds.add(task.id)
    let parent = task.parent_id ? byId.get(task.parent_id) : undefined
    while (parent) {
      keepIds.add(parent.id)
      parent = parent.parent_id ? byId.get(parent.parent_id) : undefined
    }
  }

  return tasks.filter(task => keepIds.has(task.id))
}

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

function filterTasksPreservingAncestors(
  tasks: ProjectTaskEnriched[],
  predicate: (task: ProjectTaskEnriched) => boolean,
): ProjectTaskEnriched[] {
  const byId = new Map(tasks.map(task => [task.id, task]))
  const keepIds = new Set<string>()

  for (const task of tasks) {
    if (!predicate(task)) continue
    keepIds.add(task.id)
    let parent = task.parent_id ? byId.get(task.parent_id) : undefined
    while (parent) {
      keepIds.add(parent.id)
      parent = parent.parent_id ? byId.get(parent.parent_id) : undefined
    }
  }

  return tasks.filter(task => keepIds.has(task.id))
}

export function SpreadsheetView() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useFilterPersistence<Record<string, unknown>>('projets.spreadsheet.filters', {})
  const { selection, setSelection, filteredProjectIds, isFiltered } = useProjectFilter()
  const [showSelector, setShowSelector] = useState(false)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [allExpanded, setAllExpanded] = useState(false)
  const { toast } = useToast()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
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

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters(prev => {
      const next = { ...prev }
      if (value === undefined || value === null || value === '') delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [setActiveFilters])

  // Fetch ALL tasks for tree building (no pagination — tree needs all data)
  const { data, isLoading } = useAllProjectTasks({
    page: 1, page_size: 500,
  })

  const projectScopedTasks = useMemo(() => {
    const items = data?.items ?? []
    if (!filteredProjectIds) return items
    return items.filter(t => filteredProjectIds.has(t.project_id))
  }, [data, filteredProjectIds])

  const filteredTasks = useMemo(() => {
    const statusValues = activeFilterValues(activeFilters.status)
    const priorityValues = activeFilterValues(activeFilters.priority)
    const kindValues = activeFilterValues(activeFilters.kind)
    const statusNegated = isNegatedFilter(activeFilters.status)
    const priorityNegated = isNegatedFilter(activeFilters.priority)
    const kindNegated = isNegatedFilter(activeFilters.kind)

    return filterTasksPreservingAncestors(projectScopedTasks, (task) => {
      const matchesStatus = statusValues.length === 0 || statusValues.includes(task.status)
      const matchesPriority = priorityValues.length === 0 || priorityValues.includes(task.priority)
      const kind = task.is_milestone ? 'milestone' : 'task'
      const matchesKind = kindValues.length === 0 || kindValues.includes(kind)

      return (statusNegated ? !matchesStatus : matchesStatus)
        && (priorityNegated ? !matchesPriority : matchesPriority)
        && (kindNegated ? !matchesKind : matchesKind)
    })
  }, [activeFilters, projectScopedTasks])

  const allTasks = useMemo(
    () => filterTasksForSearch(filteredTasks, debouncedSearch, taskStatusLabels, projectPriorityLabels),
    [filteredTasks, debouncedSearch, taskStatusLabels, projectPriorityLabels],
  )

  // Auto-expand all projects on first load
  useEffect(() => {
    if (projectScopedTasks.length > 0 && expandedProjects.size === 0 && !allExpanded) {
      const projectIds = new Set(projectScopedTasks.map(t => t.project_id))
      setExpandedProjects(projectIds)
      setAllExpanded(true)
    }
  }, [projectScopedTasks, expandedProjects.size, allExpanded])

  useEffect(() => {
    if (!debouncedSearch.trim() || allTasks.length === 0) return
    setExpandedProjects(new Set(allTasks.map(t => t.project_id)))
    setExpandedTasks(new Set(allTasks.map(t => t.parent_id).filter(Boolean) as string[]))
  }, [allTasks, debouncedSearch])

  // Build tree rows
  const treeRows = useMemo(
    () => buildSpreadsheetTree(allTasks, expandedProjects, expandedTasks),
    [allTasks, expandedProjects, expandedTasks],
  )

  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }, [])

  const toggleTask = useCallback((taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }, [])

  const handleInlineSave = useCallback(async (row: SpreadsheetRow, columnId: string, value: unknown) => {
    if (row._isGroupHeader) return
    try {
      await projetsService.updateTask(row.project_id, row.id, { [columnId]: value })
      toast({ title: t('projets.toast.modified'), variant: 'success' })
    } catch {
      toast({ title: t('projets.toast.error'), variant: 'error' })
    }
  }, [toast])

  const inlineEdit = useMemo<InlineEditConfig<SpreadsheetRow>>(() => ({
    editableColumns: ['title', 'status', 'priority', 'start_date', 'due_date', 'progress', 'estimated_hours', 'actual_hours'],
    onSave: handleInlineSave,
    columnEditors: {
      status: { type: 'select', options: taskStatusOptions },
      priority: { type: 'select', options: projectPriorityOptions },
      start_date: { type: 'date' },
      due_date: { type: 'date' },
      progress: { type: 'percent', min: 0, max: 100, step: 5 },
      estimated_hours: { type: 'hours', min: 0, step: 0.5, placeholder: '0' },
      actual_hours: { type: 'hours', min: 0, step: 0.5, placeholder: '0' },
    },
  }), [handleInlineSave, projectPriorityOptions, taskStatusOptions])

  const columns = useMemo<ColumnDef<SpreadsheetRow, unknown>[]>(() => [
    {
      accessorKey: 'title', header: t('projets.columns.task'), size: 380, enableResizing: true,
      meta: { mobileTitleOnly: true },
      cell: ({ row }) => {
        const r = row.original
        if (r._isGroupHeader) {
          const projectId = r.project_id
          const isOpen = expandedProjects.has(projectId)
          return (
            <div
              className="flex items-center gap-1.5 cursor-pointer select-none font-semibold text-xs"
              onClick={() => toggleProject(projectId)}
            >
              <ChevronRight size={12} className={cn('transition-transform text-muted-foreground', isOpen && 'rotate-90')} />
              <FolderKanban size={12} className="text-primary" />
              <span className="truncate">{r._groupLabel}</span>
              <span className="text-[10px] text-muted-foreground font-normal ml-1">({r._groupTaskCount})</span>
            </div>
          )
        }
        const depth = r._depth
        const hasChildren = r._hasChildren
        const isOpen = expandedTasks.has(r.id)
        return (
          <div
            className="flex items-center gap-1.5"
            style={{ paddingLeft: depth * 16 }}
          >
            {hasChildren ? (
              <button type="button" onClick={(e) => { e.stopPropagation(); toggleTask(r.id) }} className="p-0.5 -ml-1">
                <ChevronRight size={10} className={cn('transition-transform text-muted-foreground', isOpen && 'rotate-90')} />
              </button>
            ) : (
              <span className="w-3" />
            )}
            <TaskStatusIcon status={r.status} size={12} />
            <span className={cn('truncate', r.status === 'done' && 'line-through text-muted-foreground')}>
              {r.title}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'code', header: t('projets.columns.ref'), size: 80,
      meta: { mobileHideWhenEmpty: true },
      cell: ({ row }) => row.original._isGroupHeader
        ? null
        : <span className="font-mono text-[10px] text-muted-foreground">{row.original.code || '--'}</span>,
    },
    {
      accessorKey: 'status', header: t('projets.columns.status'), size: 100,
      cell: ({ row }) => {
        if (row.original._isGroupHeader) return null
        const meta = TASK_STATUS_META[row.original.status]
        return <span className={cn('text-xs', meta?.color)}>{taskStatusLabels[row.original.status] ?? row.original.status}</span>
      },
    },
    {
      accessorKey: 'priority', header: t('projets.columns.priority'), size: 80,
      cell: ({ row }) => {
        if (row.original._isGroupHeader) return null
        const p = row.original.priority
        const cls = p === 'critical' ? 'chip-danger' : p === 'high' ? 'chip-warn' : ''
        return <span className={cn('chip', cls)}>{projectPriorityLabels[p] ?? p}</span>
      },
    },
    {
      accessorKey: 'start_date', header: t('projets.columns.start_date'), size: 90,
      meta: { mobileHideWhenEmpty: true },
      cell: ({ row }) => {
        if (row.original._isGroupHeader) return null
        return row.original.start_date
          ? <span className="text-xs tabular-nums">{new Date(row.original.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
          : <span className="text-muted-foreground/40">--</span>
      },
    },
    {
      accessorKey: 'due_date', header: t('projets.columns.due_date'), size: 90,
      meta: { mobileHideWhenEmpty: true },
      cell: ({ row }) => {
        if (row.original._isGroupHeader) return null
        return row.original.due_date
          ? <span className="text-xs tabular-nums">{new Date(row.original.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
          : <span className="text-muted-foreground/40">--</span>
      },
    },
    {
      accessorKey: 'progress', header: t('projets.columns.progress'), size: 70,
      meta: { mobileFullWidth: true },
      cell: ({ row }) => {
        if (row.original._isGroupHeader) return null
        return (
          <div className="flex items-center gap-1">
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${row.original.progress}%` }} />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground">{row.original.progress}%</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'estimated_hours', header: t('projets.columns.estimated_hours'), size: 60,
      meta: { mobileHideWhenEmpty: true },
      cell: ({ row }) => row.original._isGroupHeader ? null : <span className="text-xs tabular-nums text-muted-foreground">{row.original.estimated_hours ?? '--'}</span>,
    },
    {
      accessorKey: 'actual_hours', header: t('projets.columns.actual_hours'), size: 60,
      meta: { mobileHideWhenEmpty: true },
      cell: ({ row }) => row.original._isGroupHeader ? null : <span className="text-xs tabular-nums text-muted-foreground">{row.original.actual_hours ?? '--'}</span>,
    },
    {
      accessorKey: 'assignee_name', header: t('projets.columns.assignee'), size: 130,
      meta: { mobileHideWhenEmpty: true },
      cell: ({ row }) => row.original._isGroupHeader ? null : <span className="text-xs text-muted-foreground truncate">{row.original.assignee_name || '--'}</span>,
    },
    // ── Extra columns (hidden by default, toggle via column visibility) ──
    {
      id: 'duration', header: t('projets.columns.duration'), size: 60,
      accessorFn: (row) => row._durationDays,
      meta: { mobileHideWhenEmpty: true },
      cell: ({ row }) => {
        if (row.original._isGroupHeader) return null
        const d = row.original._durationDays
        return d != null ? <span className="text-xs tabular-nums text-muted-foreground">{d}j</span> : <span className="text-muted-foreground/40">--</span>
      },
    },
    {
      id: 'predecessors', header: t('projets.columns.predecessors'), size: 140,
      accessorFn: (row) => row._predecessorLabels,
      meta: { mobileHideWhenEmpty: true },
      cell: ({ row }) => {
        if (row.original._isGroupHeader) return null
        const v = row.original._predecessorLabels
        return v ? <span className="text-[10px] text-muted-foreground truncate font-mono">{v}</span> : <span className="text-muted-foreground/40">--</span>
      },
    },
    {
      id: 'child_count', header: t('projets.columns.subtasks'), size: 80,
      accessorFn: (row) => row._childCount,
      meta: { mobileHideWhenEmpty: true },
      cell: ({ row }) => {
        if (row.original._isGroupHeader) return null
        const c = row.original._childCount ?? 0
        return c > 0 ? <span className="text-xs tabular-nums text-muted-foreground">{c}</span> : <span className="text-muted-foreground/40">--</span>
      },
    },
    {
      accessorKey: 'description', header: t('common.description'), size: 200,
      meta: { mobileHideWhenEmpty: true },
      cell: ({ row }) => {
        if (row.original._isGroupHeader) return null
        const d = row.original.description
        return d ? <span className="text-[10px] text-muted-foreground truncate">{d.slice(0, 60)}{d.length > 60 ? '…' : ''}</span> : <span className="text-muted-foreground/40">--</span>
      },
    },
    {
      id: 'project_code', header: t('projets.title'), size: 100,
      accessorFn: (row) => row.project_code,
      meta: { mobileHideWhenEmpty: true },
      cell: ({ row }) => row.original._isGroupHeader ? null : <span className="font-mono text-[10px] text-muted-foreground">{row.original.project_code}</span>,
    },
    {
      accessorKey: 'created_at', header: t('common.created_at'), size: 90,
      cell: ({ row }) => {
        if (row.original._isGroupHeader || !row.original.created_at) return null
        return <span className="text-[10px] tabular-nums text-muted-foreground">{new Date(row.original.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
      },
    },
    {
      accessorKey: 'completed_at', header: t('projets.columns.completed_at'), size: 90,
      cell: ({ row }) => {
        if (row.original._isGroupHeader || !row.original.completed_at) return null
        return <span className="text-[10px] tabular-nums text-muted-foreground">{new Date(row.original.completed_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
      },
    },
  ], [projectPriorityLabels, taskStatusLabels, expandedProjects, expandedTasks, toggleProject, toggleTask])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <DataTable<SpreadsheetRow>
          columns={columns}
          data={treeRows}
          isLoading={isLoading}
          toolbarLeft={
            <button
              onClick={() => setShowSelector(true)}
              className={cn('inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs whitespace-nowrap', isFiltered ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted text-muted-foreground')}
              title="Choisir les projets affichés"
            >
              <Sheet size={13} className="text-primary" />
              {isFiltered ? `${selection.projectIds.length} projet(s)` : 'Sélection'}
            </button>
          }
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('projets.search.visual_placeholder') as string}
          filters={taskFilters}
          activeFilters={activeFilters}
          onFilterChange={handleFilterChange}
          inlineEdit={inlineEdit}
          emptyIcon={Sheet}
          emptyTitle="Aucune tâche"
          columnResizing
          columnVisibility
          defaultHiddenColumns={['predecessors', 'child_count', 'description', 'project_code', 'created_at', 'completed_at']}
          compact
          storageKey="projets-spreadsheet-v3"
          onRowClick={(row) => {
            if (row._isGroupHeader) {
              openDynamicPanel({ type: 'detail', module: 'projets', id: row.project_id })
            } else {
              openDynamicPanel({ type: 'task-detail', module: 'projets', id: row.id, meta: { projectId: row.project_id } })
            }
          }}
        />
      </div>
      <ProjectSelectorModal open={showSelector} onClose={() => setShowSelector(false)} selection={selection} onSelectionChange={setSelection} />
    </div>
  )
}
