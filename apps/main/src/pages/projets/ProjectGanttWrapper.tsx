/**
 * ProjectGanttWrapper — Feeds project + task data into GanttCore.
 *
 * Uses useQueries to load tasks/milestones/dependencies for each
 * expanded project in parallel, then combines into GanttCore format.
 */
import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useUIStore } from '@/stores/uiStore'
import { useProjects } from '@/hooks/useProjets'
import { projetsService, isGoutiProject } from '@/services/projetsService'
import { useToast } from '@/components/ui/Toast'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { ProjectSelectorModal } from '@/components/shared/ProjectSelectorModal'
import type { ProjectSelection } from '@/components/shared/ProjectSelectorModal'
import { GanttCore } from '@/components/shared/gantt/GanttCore'
import type { GanttRow, GanttBarData, GanttDependencyData, GanttColumn } from '@/components/shared/gantt/GanttCore'
import { daysB } from '@/components/shared/gantt/ganttEngine'
import type { ProjectTask } from '@/types/api'

// ── Colors ──────────────────────────────────────────────────────

const PROJECT_COLORS: Record<string, string> = {
  draft: '#9ca3af', planned: '#60a5fa', active: '#22c55e',
  on_hold: '#fbbf24', completed: '#10b981', cancelled: '#ef4444',
}
const TASK_COLORS: Record<string, string> = {
  todo: '#94a3b8', in_progress: '#3b82f6', review: '#eab308',
  done: '#22c55e', cancelled: '#ef4444',
}
const PRIORITY_COLORS: Record<string, string> = {
  low: '#94a3b8', medium: '#3b82f6', high: '#f59e0b', critical: '#ef4444',
}

const STATUS_OPTIONS = [
  { value: 'todo', label: 'À faire', color: TASK_COLORS.todo },
  { value: 'in_progress', label: 'En cours', color: TASK_COLORS.in_progress },
  { value: 'review', label: 'Revue', color: TASK_COLORS.review },
  { value: 'done', label: 'Terminé', color: TASK_COLORS.done },
  { value: 'cancelled', label: 'Annulé', color: TASK_COLORS.cancelled },
]
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Basse', color: PRIORITY_COLORS.low },
  { value: 'medium', label: 'Moyenne', color: PRIORITY_COLORS.medium },
  { value: 'high', label: 'Haute', color: PRIORITY_COLORS.high },
  { value: 'critical', label: 'Critique', color: PRIORITY_COLORS.critical },
]

// ── Grid columns ────────────────────────────────────────────────

const COLUMNS: GanttColumn[] = [
  { id: 'start', label: 'Début', width: 80, align: 'center', editable: true, editType: 'date' },
  { id: 'end', label: 'Fin', width: 80, align: 'center', editable: true, editType: 'date' },
  { id: 'duration', label: 'Durée', width: 45, align: 'right' },
  { id: 'progress', label: '%', width: 35, align: 'right', editable: true, editType: 'number' },
]

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) } catch { return '—' }
}

// ── Main Component ──────────────────────────────────────────────

export function ProjectGanttWrapper() {
  const { data: pd, isLoading: projLoading } = useProjects({ page_size: 200 })
  const openPanel = useUIStore(s => s.openDynamicPanel)
  const { toast } = useToast()
  const { getPref, setPref } = useUserPreferences()

  // Project selection
  const [showProjectSelector, setShowProjectSelector] = useState(false)
  const projectSelection: ProjectSelection = getPref('gantt_project_selection', { mode: 'all', projectIds: [] })

  const allProjects = pd?.items ?? []
  const projects = useMemo(() => {
    if (projectSelection.mode === 'all' || projectSelection.projectIds.length === 0) return allProjects
    const ids = new Set(projectSelection.projectIds)
    return allProjects.filter(p => ids.has(p.id))
  }, [allProjects, projectSelection])

  // Expand/collapse
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleRow = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // Auto-expand all on first load
  useEffect(() => {
    if (projects.length > 0 && expanded.size === 0) {
      setExpanded(new Set(projects.map(p => p.id)))
    }
  }, [projects.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load tasks for each expanded project in parallel ──────────

  const expandedIds = useMemo(() => [...expanded], [expanded])

  const taskQueries = useQueries({
    queries: expandedIds.map(pid => ({
      queryKey: ['project-tasks', pid],
      queryFn: () => projetsService.listTasks(pid),
      enabled: expanded.has(pid),
      staleTime: 30_000,
    })),
  })

  const depQueries = useQueries({
    queries: expandedIds.map(pid => ({
      queryKey: ['task-dependencies', pid],
      queryFn: () => projetsService.listDependencies(pid),
      enabled: expanded.has(pid),
      staleTime: 60_000,
    })),
  })

  // Map projectId → tasks
  const tasksByProject = useMemo(() => {
    const m = new Map<string, ProjectTask[]>()
    expandedIds.forEach((pid, i) => {
      const q = taskQueries[i]
      if (q.data) {
        const items = Array.isArray(q.data) ? q.data : (q.data as { items?: ProjectTask[] }).items ?? []
        m.set(pid, items)
      }
    })
    return m
  }, [expandedIds, taskQueries])

  // Map projectId → dependencies
  const depsByProject = useMemo(() => {
    const m = new Map<string, { id: string; from_task_id: string; to_task_id: string; dependency_type: string }[]>()
    expandedIds.forEach((pid, i) => {
      const q = depQueries[i]
      if (q.data) {
        const items = Array.isArray(q.data) ? q.data : (q.data as { items?: unknown[] }).items ?? []
        m.set(pid, items as { id: string; from_task_id: string; to_task_id: string; dependency_type: string }[])
      }
    })
    return m
  }, [expandedIds, depQueries])

  // ── Build GanttCore data ──────────────────────────────────────

  const { rows, bars, deps } = useMemo(() => {
    const allRows: GanttRow[] = []
    const allBars: GanttBarData[] = []
    const allDeps: GanttDependencyData[] = []

    for (const project of projects) {
      const isGouti = isGoutiProject(project)
      const color = isGouti ? '#f97316' : (PROJECT_COLORS[project.status] || '#9ca3af')
      const isExp = expanded.has(project.id)
      const tasks = tasksByProject.get(project.id) || []
      const projectDeps = depsByProject.get(project.id) || []

      // ── Project row ──
      allRows.push({
        id: project.id,
        label: project.name,
        sublabel: project.code,
        level: 0,
        hasChildren: true,
        color,
        columns: {
          start: fmtDate(project.start_date),
          end: fmtDate(project.end_date),
          duration: project.start_date && project.end_date
            ? `${daysB(project.start_date.split('T')[0], project.end_date.split('T')[0])}j`
            : '—',
          progress: project.progress ?? 0,
        },
      })

      // Project summary bar
      if (project.start_date && project.end_date) {
        allBars.push({
          id: `proj-${project.id}`,
          rowId: project.id,
          title: `${project.name} — ${project.progress ?? 0}%`,
          startDate: project.start_date.split('T')[0],
          endDate: project.end_date.split('T')[0],
          progress: project.progress ?? 0,
          color,
          status: project.status,
          isSummary: true,
          meta: { projectId: project.id },
          tooltipLines: [
            ['Code', project.code],
            ['Statut', project.status],
            ['Priorité', project.priority || '—'],
            ...(project.manager_name ? [['Chef de projet', project.manager_name] as [string, string]] : []),
            ...(project.task_count ? [['Tâches', String(project.task_count)] as [string, string]] : []),
          ],
        })
      }

      // ── Task rows (only if expanded and tasks loaded) ──
      if (isExp && tasks.length > 0) {
        // Build tree
        const tree = new Map<string | null, ProjectTask[]>()
        for (const t of tasks) {
          const k = t.parent_id ?? null
          if (!tree.has(k)) tree.set(k, [])
          tree.get(k)!.push(t)
        }
        for (const arr of tree.values()) arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

        function addTaskRows(parentId: string | null, level: number) {
          const children = tree.get(parentId) || []
          for (const task of children) {
            const hasKids = (tree.get(task.id) || []).length > 0
            const taskColor = TASK_COLORS[task.status] || '#94a3b8'

            allRows.push({
              id: task.id,
              label: task.title,
              sublabel: task.assignee_name || undefined,
              level,
              hasChildren: hasKids,
              color: taskColor,
              columns: {
                start: fmtDate(task.start_date),
                end: fmtDate(task.due_date),
                duration: task.start_date && task.due_date
                  ? `${daysB(task.start_date.split('T')[0], task.due_date.split('T')[0])}j`
                  : '—',
                progress: task.progress ?? 0,
              },
            })

            if (task.start_date && task.due_date) {
              allBars.push({
                id: task.id,
                rowId: task.id,
                title: task.title,
                startDate: task.start_date.split('T')[0],
                endDate: task.due_date.split('T')[0],
                progress: task.progress ?? 0,
                color: taskColor,
                status: task.status,
                priority: task.priority,
                isDraft: task.status === 'todo',
                isSummary: hasKids,
                draggable: true,
                resizable: true,
                meta: { projectId: project.id, taskId: task.id },
                tooltipLines: [
                  ['Statut', task.status],
                  ['Priorité', task.priority || '—'],
                  ...(task.assignee_name ? [['Assigné', task.assignee_name] as [string, string]] : []),
                  ...(task.estimated_hours ? [['Estimé', `${task.estimated_hours}h`] as [string, string]] : []),
                ],
              })
            }

            // Recurse into children
            if (hasKids) addTaskRows(task.id, level + 1)
          }
        }
        addTaskRows(null, 1)

        // Dependencies
        for (const dep of projectDeps) {
          const typeMap: Record<string, 'FS' | 'SS' | 'FF' | 'SF'> = {
            finish_to_start: 'FS', start_to_start: 'SS',
            finish_to_finish: 'FF', start_to_finish: 'SF',
          }
          allDeps.push({
            fromId: dep.from_task_id,
            toId: dep.to_task_id,
            type: typeMap[dep.dependency_type] || 'FS',
          })
        }
      }
    }

    return { rows: allRows, bars: allBars, deps: allDeps }
  }, [projects, expanded, tasksByProject, depsByProject])

  // ── Callbacks ─────────────────────────────────────────────────

  const handleBarClick = useCallback((_barId: string, meta?: Record<string, unknown>) => {
    const projectId = meta?.projectId as string
    if (projectId) openPanel({ type: 'detail', module: 'projets', id: projectId })
  }, [openPanel])

  const handleBarDrag = useCallback(async (barId: string, newStart: string, newEnd: string) => {
    if (barId.startsWith('proj-')) return
    const bar = bars.find(b => b.id === barId)
    const projectId = bar?.meta?.projectId as string
    if (!projectId) return
    try {
      await projetsService.updateTask(projectId, barId, { start_date: newStart, due_date: newEnd })
      toast({ title: 'Tâche replanifiée', variant: 'success' })
    } catch { toast({ title: 'Erreur', variant: 'error' }) }
  }, [bars, toast])

  const handleBarResize = useCallback(async (barId: string, edge: 'left' | 'right', newDate: string) => {
    if (barId.startsWith('proj-')) return
    const bar = bars.find(b => b.id === barId)
    const projectId = bar?.meta?.projectId as string
    if (!projectId) return
    try {
      const patch = edge === 'left' ? { start_date: newDate } : { due_date: newDate }
      await projetsService.updateTask(projectId, barId, patch)
      toast({ title: edge === 'left' ? 'Début modifié' : 'Fin modifiée', variant: 'success' })
    } catch { toast({ title: 'Erreur', variant: 'error' }) }
  }, [bars, toast])

  const handleBarTitleEdit = useCallback(async (barId: string, newTitle: string) => {
    if (barId.startsWith('proj-') || barId.startsWith('ms-')) return
    const bar = bars.find(b => b.id === barId)
    const projectId = bar?.meta?.projectId as string
    if (!projectId) return
    try {
      await projetsService.updateTask(projectId, barId, { title: newTitle })
      toast({ title: 'Titre modifié', variant: 'success' })
    } catch { toast({ title: 'Erreur', variant: 'error' }) }
  }, [bars, toast])

  // ── Cell edit (inline grid editing) ────────────────────────────

  const handleCellEdit = useCallback(async (rowId: string, columnId: string, value: string) => {
    // Find which project this row belongs to
    const bar = bars.find(b => b.rowId === rowId)
    const projectId = bar?.meta?.projectId as string
    if (!projectId || rowId.startsWith('proj-')) return

    try {
      const patch: Record<string, unknown> = {}
      if (columnId === 'start') patch.start_date = value
      if (columnId === 'end') patch.due_date = value
      if (columnId === 'progress') patch.progress = Number(value)
      if (Object.keys(patch).length > 0) {
        await projetsService.updateTask(projectId, rowId, patch)
        toast({ title: 'Mis à jour', variant: 'success' })
      }
    } catch {
      toast({ title: 'Erreur de mise à jour', variant: 'error' })
    }
  }, [bars, toast])

  // ── Row selection (for indent/delete context) ──────────────────

  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)

  // Find which project a row belongs to
  const findProjectForRow = useCallback((rowId: string): string | null => {
    const bar = bars.find(b => b.rowId === rowId)
    return (bar?.meta?.projectId as string) || null
  }, [bars])

  // ── Add task ──────────────────────────────────────────────────

  const handleAddTask = useCallback(async () => {
    // Add to the first expanded project, or the selected row's project
    const projectId = selectedRowId ? findProjectForRow(selectedRowId) : projects[0]?.id
    if (!projectId) { toast({ title: 'Sélectionnez un projet', variant: 'warning' }); return }

    const today = new Date().toISOString().slice(0, 10)
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    try {
      await projetsService.createTask(projectId, {
        title: 'Nouvelle tâche',
        status: 'todo',
        priority: 'medium',
        start_date: today,
        due_date: nextWeek,
        parent_id: selectedRowId && !selectedRowId.startsWith('proj-') ? selectedRowId : undefined,
      })
      toast({ title: 'Tâche créée', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [selectedRowId, projects, findProjectForRow, toast])

  // ── Add milestone ─────────────────────────────────────────────

  const handleAddMilestone = useCallback(async () => {
    const projectId = selectedRowId ? findProjectForRow(selectedRowId) : projects[0]?.id
    if (!projectId) { toast({ title: 'Sélectionnez un projet', variant: 'warning' }); return }

    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    try {
      await projetsService.createMilestone(projectId, {
        name: 'Nouveau jalon',
        due_date: nextMonth,
      })
      toast({ title: 'Jalon créé', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [selectedRowId, projects, findProjectForRow, toast])

  // ── Indent (make child of previous sibling) ───────────────────

  const handleIndent = useCallback(async (rowId: string) => {
    const projectId = findProjectForRow(rowId)
    if (!projectId || rowId.startsWith('proj-')) return

    // Find the previous sibling at same level
    const idx = rows.findIndex(r => r.id === rowId)
    if (idx <= 0) return
    const myLevel = rows[idx].level
    let prevSibling: string | null = null
    for (let i = idx - 1; i >= 0; i--) {
      if (rows[i].level === myLevel && rows[i].id !== rowId) { prevSibling = rows[i].id; break }
      if (rows[i].level < myLevel) break
    }
    if (!prevSibling || prevSibling.startsWith('proj-')) return

    try {
      await projetsService.updateTask(projectId, rowId, { parent_id: prevSibling } as Record<string, unknown>)
      toast({ title: 'Tâche indentée', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [rows, findProjectForRow, toast])

  // ── Outdent (move to parent's level) ──────────────────────────

  const handleOutdent = useCallback(async (rowId: string) => {
    const projectId = findProjectForRow(rowId)
    if (!projectId || rowId.startsWith('proj-')) return

    // Find this task's current parent, then set parent to grandparent
    const tasks = tasksByProject.get(projectId) || []
    const task = tasks.find(t => t.id === rowId)
    if (!task?.parent_id) return

    const parent = tasks.find(t => t.id === task.parent_id)
    try {
      await projetsService.updateTask(projectId, rowId, { parent_id: parent?.parent_id || null } as Record<string, unknown>)
      toast({ title: 'Tâche désindentée', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [tasksByProject, findProjectForRow, toast])

  // ── Delete row ────────────────────────────────────────────────

  const handleDeleteRow = useCallback(async (rowId: string) => {
    const projectId = findProjectForRow(rowId)
    if (!projectId || rowId.startsWith('proj-')) return

    try {
      await projetsService.deleteTask(projectId, rowId)
      toast({ title: 'Tâche supprimée', variant: 'success' })
      setSelectedRowId(null)
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [findProjectForRow, toast])

  const isLoading = projLoading || taskQueries.some(q => q.isLoading)

  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => setShowProjectSelector(true)}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted"
        >
          {projectSelection.mode === 'all' ? 'Tous les projets' : `${projectSelection.projectIds.length} projet(s)`}
        </button>
        <span className="text-xs text-muted-foreground">{projects.length} projets · {rows.length - projects.length} tâches</span>
      </div>

      <div className="flex-1 min-h-[400px]">
        <GanttCore
          rows={rows}
          bars={bars}
          dependencies={deps}
          columns={COLUMNS}
          initialScale="month"
          initialSettings={{ barHeight: 20, rowHeight: 34, showBaselines: true }}
          onBarClick={handleBarClick}
          onBarDrag={handleBarDrag}
          onBarResize={handleBarResize}
          onBarTitleEdit={handleBarTitleEdit}
          onCellEdit={handleCellEdit}
          expandedRows={expanded}
          onToggleRow={toggleRow}
          isLoading={isLoading}
          statusOptions={STATUS_OPTIONS}
          priorityOptions={PRIORITY_OPTIONS}
          showActions={true}
          onAddTask={handleAddTask}
          onAddMilestone={handleAddMilestone}
          onIndent={handleIndent}
          onOutdent={handleOutdent}
          onDeleteRow={handleDeleteRow}
          selectedRowId={selectedRowId}
          onSelectRow={setSelectedRowId}
          emptyMessage="Aucun projet. Créez un projet ou modifiez les filtres."
        />
      </div>

      <ProjectSelectorModal
        open={showProjectSelector}
        onClose={() => setShowProjectSelector(false)}
        selection={projectSelection}
        onSelectionChange={(sel) => setPref('gantt_project_selection', sel)}
      />
    </>
  )
}
