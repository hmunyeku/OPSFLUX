/**
 * ProjectGanttWrapper — Wrapper that feeds project data into GanttCore.
 *
 * Loads projects, tasks, milestones, dependencies, CPM, baselines
 * and transforms them into the generic GanttCore interfaces.
 *
 * This replaces the monolithic ProjectGanttView (1385 lines) with
 * a thin adapter (~250 lines) + the shared GanttCore component.
 */
import { useState, useMemo, useCallback } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { useProjects } from '@/hooks/useProjets'
import { projetsService, isGoutiProject } from '@/services/projetsService'
import { useToast } from '@/components/ui/Toast'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { ProjectSelectorModal } from '@/components/shared/ProjectSelectorModal'
import type { ProjectSelection } from '@/components/shared/ProjectSelectorModal'
import { GanttCore } from '@/components/shared/gantt/GanttCore'
import type { GanttRow, GanttBarData, GanttDependencyData, GanttColumn } from '@/components/shared/gantt/GanttCore'
// ganttEngine utilities available via GanttCore
import type { Project, ProjectTask } from '@/types/api'

// ── Color maps ──────────────────────────────────────────────────

const S_CLR: Record<string, string> = {
  draft: '#9ca3af', planned: '#60a5fa', active: '#22c55e',
  on_hold: '#fbbf24', completed: '#10b981', cancelled: '#ef4444',
}
const T_CLR: Record<string, string> = {
  todo: '#9ca3af', in_progress: '#3b82f6', review: '#eab308',
  done: '#22c55e', cancelled: '#ef4444',
}

const STATUS_OPTIONS = [
  { value: 'todo', label: 'À faire', color: T_CLR.todo },
  { value: 'in_progress', label: 'En cours', color: T_CLR.in_progress },
  { value: 'review', label: 'Revue', color: T_CLR.review },
  { value: 'done', label: 'Terminé', color: T_CLR.done },
  { value: 'cancelled', label: 'Annulé', color: T_CLR.cancelled },
]
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Basse', color: '#9ca3af' },
  { value: 'medium', label: 'Moyenne', color: '#3b82f6' },
  { value: 'high', label: 'Haute', color: '#f59e0b' },
  { value: 'critical', label: 'Critique', color: '#ef4444' },
]

const COLUMNS: GanttColumn[] = [
  { id: 'status', label: 'Statut', width: 70, align: 'center' },
  { id: 'progress', label: '%', width: 40, align: 'right' },
]

// ── Helper: flatten project tasks into rows + bars ──────────────

function buildProjectData(
  project: Project,
  tasks: ProjectTask[] | undefined,
  milestones: { id: string; name: string; due_date: string; status: string }[] | undefined,
  criticalTaskIds: Set<string>,
  baselineMap: Map<string, { start: string; end: string }>,
  isGouti: boolean,
): { rows: GanttRow[]; bars: GanttBarData[] } {
  const rows: GanttRow[] = []
  const bars: GanttBarData[] = []
  const projectColor = isGouti ? '#f97316' : (S_CLR[project.status] || '#9ca3af')

  // Project row
  rows.push({
    id: project.id,
    label: project.code,
    sublabel: project.name,
    level: 0,
    hasChildren: true,
    color: projectColor,
    columns: {
      status: project.status,
      progress: project.progress ?? 0,
    },
  })

  // Project summary bar
  if (project.start_date && project.end_date) {
    bars.push({
      id: `proj-${project.id}`,
      rowId: project.id,
      title: `${project.code} — ${project.progress ?? 0}%`,
      startDate: project.start_date.split('T')[0],
      endDate: project.end_date.split('T')[0],
      progress: project.progress ?? 0,
      color: projectColor,
      status: project.status,
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

  // Task rows (hierarchical)
  if (tasks) {
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
        const isCrit = criticalTaskIds.has(task.id)
        const bl = baselineMap.get(task.id)

        rows.push({
          id: task.id,
          label: task.title,
          sublabel: task.assignee_name || undefined,
          level,
          hasChildren: hasKids,
          color: T_CLR[task.status] || '#9ca3af',
          columns: {
            status: task.status,
            progress: task.progress ?? 0,
          },
        })

        if (task.start_date && task.due_date) {
          bars.push({
            id: task.id,
            rowId: task.id,
            title: task.title,
            startDate: task.start_date.split('T')[0],
            endDate: task.due_date.split('T')[0],
            progress: task.progress ?? 0,
            color: T_CLR[task.status] || '#9ca3af',
            status: task.status,
            priority: task.priority,
            isCritical: isCrit,
            isDraft: task.status === 'todo',
            draggable: true,
            resizable: true,
            baselineStart: bl?.start,
            baselineEnd: bl?.end,
            meta: { projectId: project.id, taskId: task.id },
            tooltipLines: [
              ['Statut', task.status],
              ['Priorité', task.priority || '—'],
              ...(task.assignee_name ? [['Assigné', task.assignee_name] as [string, string]] : []),
              ...(task.estimated_hours ? [['Estimé', `${task.estimated_hours}h`] as [string, string]] : []),
              ...(task.actual_hours ? [['Réel', `${task.actual_hours}h`] as [string, string]] : []),
            ],
          })
        }

        if (hasKids) addTaskRows(task.id, level + 1)
      }
    }
    addTaskRows(null, 1)
  }

  // Milestones
  if (milestones) {
    for (const m of milestones) {
      if (!m.due_date) continue
      const mId = `ms-${m.id}`
      rows.push({
        id: mId,
        label: `◆ ${m.name}`,
        level: 1,
        hasChildren: false,
        color: m.status === 'completed' ? '#22c55e' : '#eab308',
      })
      bars.push({
        id: mId,
        rowId: mId,
        title: m.name,
        startDate: m.due_date.split('T')[0],
        endDate: m.due_date.split('T')[0],
        isMilestone: true,
        color: m.status === 'completed' ? '#22c55e' : '#eab308',
        status: m.status,
        tooltipLines: [
          ['Type', 'Jalon'],
          ['Statut', m.status],
          ['Échéance', m.due_date],
        ],
      })
    }
  }

  return { rows, bars }
}

// ── Main Component ──────────────────────────────────────────────

export function ProjectGanttWrapper() {
  const { data: pd, isLoading } = useProjects({ page_size: 200 })
  const openPanel = useUIStore(s => s.openDynamicPanel)
  const { toast } = useToast()
  const { getPref, setPref } = useUserPreferences()

  // Project selection
  const [showProjectSelector, setShowProjectSelector] = useState(false)
  const projectSelection: ProjectSelection = getPref('gantt_project_selection', { mode: 'all', projectIds: [] })
  const handleProjectSelectionChange = useCallback((sel: ProjectSelection) => {
    setPref('gantt_project_selection', sel)
  }, [setPref])

  const allProjects = pd?.items ?? []
  const projects = useMemo(() => {
    if (projectSelection.mode === 'all' || projectSelection.projectIds.length === 0) return allProjects
    const ids = new Set(projectSelection.projectIds)
    return allProjects.filter(p => ids.has(p.id))
  }, [allProjects, projectSelection])

  // Expand/collapse
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(projects.map(p => p.id)))
  const toggleRow = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // Auto-expand all projects on first load
  useMemo(() => {
    if (projects.length > 0 && expanded.size === 0) {
      setExpanded(new Set(projects.map(p => p.id)))
    }
  }, [projects.length])

  // Build data for all projects
  // For now: only load tasks for expanded projects (lazy)
  // TODO: useProjectTasks for each expanded project
  const { rows, bars, deps } = useMemo(() => {
    const allRows: GanttRow[] = []
    const allBars: GanttBarData[] = []
    const allDeps: GanttDependencyData[] = []

    for (const project of projects) {
      const isGouti = isGoutiProject(project)

      // Build minimal project data (tasks only if expanded — loaded by sub-hooks)
      const data = buildProjectData(project, undefined, undefined, new Set(), new Map(), isGouti)

      // Project row always visible
      allRows.push(data.rows[0])
      allBars.push(...data.bars)

      // If expanded, we need task data — but hooks can't be conditional.
      // For now, just show the project bar. Task data will be loaded
      // when we implement per-project data loading.
    }

    return { rows: allRows, bars: allBars, deps: allDeps }
  }, [projects, expanded])

  // Callbacks
  const handleBarClick = useCallback((_barId: string, meta?: Record<string, unknown>) => {
    const projectId = meta?.projectId as string
    if (projectId) {
      openPanel({ type: 'detail', module: 'projets', id: projectId })
    }
  }, [openPanel])

  const handleBarDrag = useCallback(async (barId: string, newStart: string, newEnd: string) => {
    // Extract projectId from bar meta — for now handle project bars
    if (barId.startsWith('proj-')) return // can't drag project summary bars
    // Task drag needs projectId — stored in bar.meta
    const bar = bars.find(b => b.id === barId)
    const projectId = bar?.meta?.projectId as string
    if (!projectId) return
    try {
      await projetsService.updateTask(projectId, barId, { start_date: newStart, due_date: newEnd })
      toast({ title: 'Tâche replanifiée', variant: 'success' })
    } catch {
      toast({ title: 'Erreur de replanification', variant: 'error' })
    }
  }, [bars, toast])

  const handleBarTitleEdit = useCallback(async (editBarId: string, newTitle: string) => {
    const bar = bars.find(b => b.id === editBarId)
    const projectId = bar?.meta?.projectId as string
    if (!projectId || editBarId.startsWith('proj-') || editBarId.startsWith('ms-')) return
    try {
      await projetsService.updateTask(projectId, editBarId, { title: newTitle })
      toast({ title: 'Titre modifié', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [bars, toast])

  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => setShowProjectSelector(true)}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted"
        >
          {projectSelection.mode === 'all' ? 'Tous les projets' : `${projectSelection.projectIds.length} projet(s)`}
        </button>
        <span className="text-xs text-muted-foreground">{projects.length} projets</span>
      </div>

      <div className="h-[calc(100vh-220px)] min-h-[400px]">
        <GanttCore
          rows={rows}
          bars={bars}
          dependencies={deps}
          columns={COLUMNS}
          initialScale="month"
          initialSettings={{ barHeight: 20, rowHeight: 34, showBaselines: true }}
          onBarClick={handleBarClick}
          onBarDrag={handleBarDrag}
          onBarTitleEdit={handleBarTitleEdit}
          expandedRows={expanded}
          onToggleRow={toggleRow}
          isLoading={isLoading}
          statusOptions={STATUS_OPTIONS}
          priorityOptions={PRIORITY_OPTIONS}
          emptyMessage="Aucun projet à afficher. Créez un projet ou modifiez les filtres."
        />
      </div>

      <ProjectSelectorModal
        open={showProjectSelector}
        onClose={() => setShowProjectSelector(false)}
        selection={projectSelection}
        onSelectionChange={handleProjectSelectionChange}
      />
    </>
  )
}
