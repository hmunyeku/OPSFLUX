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
import type { InlineEditConfig } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
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

    // DFS to build ordered flat list
    function addChildren(parentId: string | null, depth: number) {
      const children = childrenMap.get(parentId) ?? []
      for (const child of children) {
        const kids = childrenMap.get(child.id) ?? []
        const hasKids = kids.length > 0
        // Duration
        const dur = child.start_date && child.due_date
          ? Math.ceil((new Date(child.due_date).getTime() - new Date(child.start_date).getTime()) / 86400000)
          : null
        // Predecessors from depsMap
        const taskDeps = depsMap?.get(child.id) ?? []
        const predLabels = taskDeps.map(d => {
          const pred = taskMap.get(d.from_task_id)
          return pred ? (pred.code || pred.title.slice(0, 15)) : d.from_task_id.slice(0, 6)
        }).join(', ')

        result.push({
          ...child,
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

export function SpreadsheetView() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
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

  // Fetch ALL tasks for tree building (no pagination — tree needs all data)
  const { data, isLoading } = useAllProjectTasks({
    page: 1, page_size: 500,
    search: debouncedSearch || undefined,
  })

  const allTasks = useMemo(() => {
    const items = data?.items ?? []
    if (!filteredProjectIds) return items
    return items.filter(t => filteredProjectIds.has(t.project_id))
  }, [data, filteredProjectIds])

  // Auto-expand all projects on first load
  useEffect(() => {
    if (allTasks.length > 0 && expandedProjects.size === 0 && !allExpanded) {
      const projectIds = new Set(allTasks.map(t => t.project_id))
      setExpandedProjects(projectIds)
      setAllExpanded(true)
    }
  }, [allTasks, expandedProjects.size, allExpanded])

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
        const cls = p === 'critical' ? 'gl-badge-danger' : p === 'high' ? 'gl-badge-warning' : 'gl-badge-neutral'
        return <span className={cn('gl-badge', cls)}>{projectPriorityLabels[p] ?? p}</span>
      },
    },
    {
      accessorKey: 'start_date', header: t('projets.columns.start_date'), size: 90,
      cell: ({ row }) => {
        if (row.original._isGroupHeader) return null
        return row.original.start_date
          ? <span className="text-xs tabular-nums">{new Date(row.original.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
          : <span className="text-muted-foreground/40">--</span>
      },
    },
    {
      accessorKey: 'due_date', header: t('projets.columns.due_date'), size: 90,
      cell: ({ row }) => {
        if (row.original._isGroupHeader) return null
        return row.original.due_date
          ? <span className="text-xs tabular-nums">{new Date(row.original.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
          : <span className="text-muted-foreground/40">--</span>
      },
    },
    {
      accessorKey: 'progress', header: t('projets.columns.progress'), size: 70,
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
      cell: ({ row }) => row.original._isGroupHeader ? null : <span className="text-xs tabular-nums text-muted-foreground">{row.original.estimated_hours ?? '--'}</span>,
    },
    {
      accessorKey: 'actual_hours', header: t('projets.columns.actual_hours'), size: 60,
      cell: ({ row }) => row.original._isGroupHeader ? null : <span className="text-xs tabular-nums text-muted-foreground">{row.original.actual_hours ?? '--'}</span>,
    },
    {
      accessorKey: 'assignee_name', header: t('projets.columns.assignee'), size: 130,
      cell: ({ row }) => row.original._isGroupHeader ? null : <span className="text-xs text-muted-foreground truncate">{row.original.assignee_name || '--'}</span>,
    },
    // ── Extra columns (hidden by default, toggle via column visibility) ──
    {
      id: 'duration', header: t('projets.columns.duration'), size: 60,
      accessorFn: (row) => row._durationDays,
      cell: ({ row }) => {
        if (row.original._isGroupHeader) return null
        const d = row.original._durationDays
        return d != null ? <span className="text-xs tabular-nums text-muted-foreground">{d}j</span> : <span className="text-muted-foreground/40">--</span>
      },
    },
    {
      id: 'predecessors', header: t('projets.columns.predecessors'), size: 140,
      accessorFn: (row) => row._predecessorLabels,
      cell: ({ row }) => {
        if (row.original._isGroupHeader) return null
        const v = row.original._predecessorLabels
        return v ? <span className="text-[10px] text-muted-foreground truncate font-mono">{v}</span> : <span className="text-muted-foreground/40">--</span>
      },
    },
    {
      id: 'child_count', header: t('projets.columns.subtasks'), size: 80,
      accessorFn: (row) => row._childCount,
      cell: ({ row }) => {
        if (row.original._isGroupHeader) return null
        const c = row.original._childCount ?? 0
        return c > 0 ? <span className="text-xs tabular-nums text-muted-foreground">{c}</span> : <span className="text-muted-foreground/40">--</span>
      },
    },
    {
      accessorKey: 'description', header: t('common.description'), size: 200,
      cell: ({ row }) => {
        if (row.original._isGroupHeader) return null
        const d = row.original.description
        return d ? <span className="text-[10px] text-muted-foreground truncate">{d.slice(0, 60)}{d.length > 60 ? '…' : ''}</span> : <span className="text-muted-foreground/40">--</span>
      },
    },
    {
      id: 'project_code', header: t('projets.title'), size: 100,
      accessorFn: (row) => row.project_code,
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
      {/* Project filter bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
        <Sheet size={14} className="text-primary" />
        <button
          onClick={() => setShowSelector(true)}
          className={cn('px-2 py-1 rounded border text-xs', isFiltered ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted text-muted-foreground')}
        >
          {isFiltered ? `${selection.projectIds.length} projet(s)` : 'Tous les projets'}
        </button>
        <span className="text-xs text-muted-foreground">{treeRows.length} lignes</span>
        <span className="text-xs text-muted-foreground ml-auto">Double-clic sur une cellule pour éditer</span>
      </div>

      <div className="flex-1 overflow-hidden">
        <DataTable<SpreadsheetRow>
          columns={columns}
          data={treeRows}
          isLoading={isLoading}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Rechercher par tâche ou code projet..."
          inlineEdit={inlineEdit}
          emptyIcon={Sheet}
          emptyTitle="Aucune tâche"
          columnResizing
          columnVisibility
          defaultHiddenColumns={['duration', 'predecessors', 'child_count', 'description', 'project_code', 'created_at', 'completed_at']}
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
