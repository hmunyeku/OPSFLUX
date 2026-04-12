/**
 * ProjectGanttWrapper — Feeds project + task data into GanttCore.
 *
 * Uses useQueries to load tasks/milestones/dependencies for each
 * expanded project in parallel, then combines into GanttCore format.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueries } from '@tanstack/react-query'
import { useUIStore } from '@/stores/uiStore'
import { useProjects, useUpdateProjectTask } from '@/hooks/useProjets'
import { projetsService, isGoutiProject } from '@/services/projetsService'
import type { GanttPdfExportPayload, GanttPdfRow } from '@/services/projetsService'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { ProjectSelectorModal } from '@/components/shared/ProjectSelectorModal'
import type { ProjectSelection } from '@/components/shared/ProjectSelectorModal'
import { GanttCore } from '@/components/shared/gantt/GanttCore'
import type { GanttRow, GanttBarData, GanttDependencyData, GanttColumn } from '@/components/shared/gantt/GanttCore'
import { daysB, buildCells, toISO, type TimeScale } from '@/components/shared/gantt/ganttEngine'
import { useQueryClient } from '@tanstack/react-query'
import type { ProjectTask } from '@/types/api'

// Cascade mode persisted user preference. Same semantics as the planner
// gantt:
//   'warn'    — confirm a constraint violation, then commit only the
//                dragged task. The user accepts a partially-broken
//                schedule consciously.
//   'cascade' — walk the dependency graph downstream from the dragged
//                task, propose minimum-shift updates for every successor
//                whose constraint would otherwise be violated, then
//                commit them all in one batch after confirmation.
//   'strict'  — refuse the drag entirely if any constraint would break.
type DragCascadeMode = 'warn' | 'cascade' | 'strict'

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
  { id: 'start', label: 'Début', width: 62, align: 'center', editable: true, editType: 'date' },
  { id: 'end', label: 'Fin', width: 62, align: 'center', editable: true, editType: 'date' },
  { id: 'duration', label: 'Jrs', width: 32, align: 'right' },
  { id: 'progress', label: '%', width: 28, align: 'right', editable: true, editType: 'number' },
  { id: 'predecessors', label: 'Préd.', width: 40, align: 'center' },
]

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) } catch { return '—' }
}

// ── Main Component ──────────────────────────────────────────────

export function ProjectGanttWrapper() {
  const { t } = useTranslation()
  const { data: pd, isLoading: projLoading } = useProjects({ page_size: 200 })
  const openPanel = useUIStore(s => s.openDynamicPanel)
  const { toast } = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { getPref, setPref } = useUserPreferences()
  const updateTaskMutation = useUpdateProjectTask()
  // Cascade mode preference (per spec §1.5: a date change cascades
  // through the dependency graph). Persisted across sessions.
  const dragCascadeMode = getPref<DragCascadeMode>('projets_gantt_drag_cascade_mode', 'warn')

  // ── Persisted timeline scale + range ──
  // Mirrors the planner's once-after-mount hydration pattern: localStorage
  // gives us an initial value synchronously, but the API may overwrite it
  // shortly after mount; we sync once via `hydratedFromPrefsRef` so the
  // user sees their saved scale without overwriting their interactions.
  const persistedScale = getPref<TimeScale>('gantt_scale', 'month')
  const persistedStart = getPref<string | undefined>('gantt_viewStart', undefined)
  const persistedEnd = getPref<string | undefined>('gantt_viewEnd', undefined)
  const [currentScale, setCurrentScale] = useState<TimeScale>(persistedScale)
  const [currentStart, setCurrentStart] = useState<string | undefined>(persistedStart)
  const [currentEnd, setCurrentEnd] = useState<string | undefined>(persistedEnd)
  const hydratedFromPrefsRef = useRef(false)
  useEffect(() => {
    if (hydratedFromPrefsRef.current) return
    hydratedFromPrefsRef.current = true
    if (persistedScale) setCurrentScale(persistedScale)
    if (persistedStart) setCurrentStart(persistedStart)
    if (persistedEnd) setCurrentEnd(persistedEnd)
  }, [persistedScale, persistedStart, persistedEnd])

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
  const savedExpanded: string[] = getPref('gantt_expanded', [])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(savedExpanded))
  const toggleRow = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      setPref('gantt_expanded', [...next])
      return next
    })
  }, [setPref])

  // Auto-expand all on first load
  useEffect(() => {
    if (projects.length > 0 && expanded.size === 0) {
      setExpanded(new Set(projects.map(p => p.id)))
    }
  }, [projects.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Prune stale IDs from `expanded` whenever the projects list changes.
  // Without this, a project that was deleted (or moved to another entity)
  // remains in the persisted `gantt_expanded` localStorage entry and
  // triggers 404 task fetches every time the gantt loads.
  useEffect(() => {
    if (allProjects.length === 0 || expanded.size === 0) return
    const validIds = new Set(allProjects.map(p => p.id))
    let pruned = false
    const next = new Set<string>()
    for (const id of expanded) {
      if (validIds.has(id)) next.add(id)
      else pruned = true
    }
    if (pruned) {
      setExpanded(next)
      setPref('gantt_expanded', [...next])
    }
    // We deliberately depend on allProjects.length and the projects map —
    // not on `expanded` — to avoid an infinite loop. allProjects is a
    // stable reference between fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allProjects.length])

  // ── Load tasks for each expanded project in parallel ──────────

  // Compute the list of expanded IDs that ALSO exist in the visible
  // projects list. This double-filter (alongside the prune effect above)
  // protects the queries from stale localStorage entries even on the
  // first render before the prune effect runs, eliminating the 404
  // burst on initial mount.
  const visibleProjectIds = useMemo(
    () => new Set(allProjects.map(p => p.id)),
    [allProjects],
  )
  const expandedIds = useMemo(
    () => [...expanded].filter(id => visibleProjectIds.has(id)),
    [expanded, visibleProjectIds],
  )

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
  type ProjectDep = { id: string; from_task_id: string; to_task_id: string; dependency_type: string; lag_days?: number | null }
  const depsByProject = useMemo(() => {
    const m = new Map<string, ProjectDep[]>()
    expandedIds.forEach((pid, i) => {
      const q = depQueries[i]
      if (q.data) {
        const items = Array.isArray(q.data) ? q.data : (q.data as { items?: unknown[] }).items ?? []
        m.set(pid, items as ProjectDep[])
      }
    })
    return m
  }, [expandedIds, depQueries])

  // Flat task index across all loaded projects (taskId → task) used by
  // the cascade walker. Built once per re-render of tasksByProject.
  const taskIndex = useMemo(() => {
    const idx = new Map<string, ProjectTask & { _projectId: string }>()
    for (const [pid, list] of tasksByProject) {
      for (const t of list) idx.set(t.id, { ...t, _projectId: pid })
    }
    return idx
  }, [tasksByProject])

  // Flat dependency list across all projects (used by the cascade walker)
  const allDepsFlat = useMemo(() => {
    const out: ProjectDep[] = []
    for (const list of depsByProject.values()) out.push(...list)
    return out
  }, [depsByProject])

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
          predecessors: '—',
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
                predecessors: projectDeps.filter(d => d.to_task_id === task.id).length > 0
                  ? projectDeps.filter(d => d.to_task_id === task.id).map(d => {
                      const pred = tasks.find(t => t.id === d.from_task_id)
                      return pred ? (pred.code || pred.title.slice(0, 8)) : '?'
                    }).join(', ')
                  : '—',
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

  const handleBarClick = useCallback((barId: string, meta?: Record<string, unknown>) => {
    const projectId = meta?.projectId as string
    if (!projectId) return
    // Project summary bar → open project
    if (barId.startsWith('proj-')) {
      openPanel({ type: 'detail', module: 'projets', id: projectId })
    } else {
      // Task bar → open task detail
      openPanel({ type: 'task-detail', module: 'projets', id: barId, meta: { projectId } })
    }
  }, [openPanel])

  // ── Drag with cascade / warn / strict (ported from Planner GanttView) ──
  //
  // Spec §1.5: "Si les champs dates, POB ou statut d'une tâche déjà
  // présente dans Planner sont modifiés, une notification est
  // automatiquement envoyée à l'arbitre Planner. Cette notification
  // contient une proposition de nouvelle révision du Planner."
  //
  // Three modes (configurable via the gantt settings panel):
  //  • warn    — confirm before allowing a constraint violation, then
  //              commit only the dragged task. Default.
  //  • cascade — BFS-walk the dependency graph downstream, propose
  //              minimum shifts for every successor whose constraint
  //              would otherwise break, commit them in batch.
  //  • strict  — refuse the drag entirely if any constraint would break.
  //
  // Same FS/SS/FF/SF semantics as the planner. Cycle detection prevents
  // infinite loops on malformed graphs.
  const handleBarDrag = useCallback(async (barId: string, newStart: string, newEnd: string) => {
    if (barId.startsWith('proj-')) return
    const seedTask = taskIndex.get(barId)
    if (!seedTask) return
    const projectId = seedTask._projectId
    const MS = 86_400_000

    // ── Build proposed slot map (taskId → {start_ms, end_ms, title}) ──
    type Slot = { start: number; end: number; title: string }
    const proposed = new Map<string, Slot>()
    proposed.set(barId, {
      start: new Date(newStart).getTime(),
      end: new Date(newEnd).getTime(),
      title: seedTask.title,
    })

    const slotOf = (taskId: string): Slot | null => {
      const p = proposed.get(taskId)
      if (p) return p
      const t = taskIndex.get(taskId)
      if (!t || !t.start_date || !t.due_date) return null
      return {
        start: new Date(t.start_date).getTime(),
        end: new Date(t.due_date).getTime(),
        title: t.title,
      }
    }

    // ── Index deps by predecessor and successor ──
    const depsByPredecessor = new Map<string, ProjectDep[]>()
    const depsBySuccessor = new Map<string, ProjectDep[]>()
    for (const dep of allDepsFlat) {
      const out = depsByPredecessor.get(dep.from_task_id) ?? []
      out.push(dep)
      depsByPredecessor.set(dep.from_task_id, out)
      const inn = depsBySuccessor.get(dep.to_task_id) ?? []
      inn.push(dep)
      depsBySuccessor.set(dep.to_task_id, inn)
    }

    const violations: string[] = []
    type Shift = { id: string; projectId: string; title: string; oldStart: string; oldEnd: string; newStart: string; newEnd: string }
    const cascadeShifts: Shift[] = []

    // ── Pass 1: incoming constraints on the dragged bar itself ──
    const draggedIncoming = depsBySuccessor.get(barId) ?? []
    for (const dep of draggedIncoming) {
      const predSlot = slotOf(dep.from_task_id)
      const draggedSlot = slotOf(barId)
      const predTask = taskIndex.get(dep.from_task_id)
      if (!predSlot || !draggedSlot || !predTask) continue
      const lag = (dep.lag_days ?? 0) * MS
      let ok = true
      let label = ''
      // Project deps store the type as full strings ("finish_to_start" etc)
      // OR the short form (FS/SS/FF/SF). Normalise to the short form.
      const t = (dep.dependency_type || 'FS').toUpperCase()
      const dt = t.startsWith('FINISH_TO_START') || t === 'FS' ? 'FS'
        : t.startsWith('START_TO_START') || t === 'SS' ? 'SS'
        : t.startsWith('FINISH_TO_FINISH') || t === 'FF' ? 'FF'
        : t.startsWith('START_TO_FINISH') || t === 'SF' ? 'SF' : 'FS'
      if (dt === 'FS' && draggedSlot.start < predSlot.end + lag) ok = false
      else if (dt === 'SS' && draggedSlot.start < predSlot.start + lag) ok = false
      else if (dt === 'FF' && draggedSlot.end < predSlot.end + lag) ok = false
      else if (dt === 'SF' && draggedSlot.end < predSlot.start + lag) ok = false
      if (!ok) {
        const lagSign = (dep.lag_days ?? 0) >= 0 ? '+' : ''
        label = `${predTask.title} → ${draggedSlot.title} (${dt}${lagSign}${dep.lag_days ?? 0}j)`
        violations.push(label)
      }
    }

    // ── Pass 2: outgoing BFS walk to detect / propagate ──
    const visited = new Set<string>()
    const queue: string[] = [barId]
    const MAX_STEPS = 500
    let steps = 0
    let cycleDetected = false

    while (queue.length > 0 && steps < MAX_STEPS) {
      steps++
      const currentId = queue.shift()!
      if (visited.has(currentId)) {
        if (currentId !== barId) cycleDetected = true
        continue
      }
      visited.add(currentId)

      const currentSlot = slotOf(currentId)
      if (!currentSlot) continue

      const outgoing = depsByPredecessor.get(currentId) ?? []
      for (const dep of outgoing) {
        const succTask = taskIndex.get(dep.to_task_id)
        const succSlot = slotOf(dep.to_task_id)
        if (!succTask || !succSlot) continue

        const lag = (dep.lag_days ?? 0) * MS
        const t = (dep.dependency_type || 'FS').toUpperCase()
        const dt = t.startsWith('FINISH_TO_START') || t === 'FS' ? 'FS'
          : t.startsWith('START_TO_START') || t === 'SS' ? 'SS'
          : t.startsWith('FINISH_TO_FINISH') || t === 'FF' ? 'FF'
          : t.startsWith('START_TO_FINISH') || t === 'SF' ? 'SF' : 'FS'

        let requiredStart = succSlot.start
        let requiredEnd = succSlot.end
        if (dt === 'FS') {
          const minStart = currentSlot.end + lag
          if (succSlot.start < minStart) {
            const delta = minStart - succSlot.start
            requiredStart = succSlot.start + delta
            requiredEnd = succSlot.end + delta
          }
        } else if (dt === 'SS') {
          const minStart = currentSlot.start + lag
          if (succSlot.start < minStart) {
            const delta = minStart - succSlot.start
            requiredStart = succSlot.start + delta
            requiredEnd = succSlot.end + delta
          }
        } else if (dt === 'FF') {
          const minEnd = currentSlot.end + lag
          if (succSlot.end < minEnd) {
            const delta = minEnd - succSlot.end
            requiredStart = succSlot.start + delta
            requiredEnd = succSlot.end + delta
          }
        } else if (dt === 'SF') {
          const minEnd = currentSlot.start + lag
          if (succSlot.end < minEnd) {
            const delta = minEnd - succSlot.end
            requiredStart = succSlot.start + delta
            requiredEnd = succSlot.end + delta
          }
        }

        const needsShift = requiredStart !== succSlot.start || requiredEnd !== succSlot.end
        if (!needsShift) continue

        const lagSign = (dep.lag_days ?? 0) >= 0 ? '+' : ''
        violations.push(`${currentSlot.title} → ${succTask.title} (${dt}${lagSign}${dep.lag_days ?? 0}j)`)

        if (dragCascadeMode === 'cascade') {
          proposed.set(dep.to_task_id, { start: requiredStart, end: requiredEnd, title: succTask.title })
          queue.push(dep.to_task_id)
        }
      }
    }

    if (steps >= MAX_STEPS) cycleDetected = true

    // ── Build cascade list from proposed map ──
    if (dragCascadeMode === 'cascade') {
      for (const [tid, slot] of proposed) {
        if (tid === barId) continue
        const orig = taskIndex.get(tid)
        if (!orig?.start_date || !orig?.due_date) continue
        cascadeShifts.push({
          id: tid,
          projectId: orig._projectId,
          title: slot.title,
          oldStart: orig.start_date.slice(0, 10),
          oldEnd: orig.due_date.slice(0, 10),
          newStart: new Date(slot.start).toISOString().slice(0, 10),
          newEnd: new Date(slot.end).toISOString().slice(0, 10),
        })
      }
    }

    // ── Apply strategy ──
    if (dragCascadeMode === 'strict' && violations.length > 0) {
      await confirm({
        title: 'Déplacement refusé',
        message:
          `Ce déplacement viole ${violations.length} contrainte(s) :\n\n` +
          violations.slice(0, 10).map((v) => `• ${v}`).join('\n') +
          (violations.length > 10 ? `\n… et ${violations.length - 10} de plus` : '') +
          `\n\nAjustez manuellement les tâches liées ou passez en mode « cascade » dans les paramètres du gantt.`,
        confirmLabel: 'Compris',
        cancelLabel: '',
        variant: 'danger',
      })
      return
    }

    if (dragCascadeMode === 'warn' && violations.length > 0) {
      const proceed = await confirm({
        title: `${violations.length} contrainte(s) violée(s)`,
        message:
          violations.slice(0, 10).map((v) => `• ${v}`).join('\n') +
          (violations.length > 10 ? `\n… et ${violations.length - 10} de plus` : '') +
          `\n\nAppliquer quand même ?`,
        confirmLabel: 'Appliquer',
        cancelLabel: 'Annuler',
        variant: 'warning',
      })
      if (!proceed) return
    }

    if (dragCascadeMode === 'cascade' && cascadeShifts.length > 0) {
      const cycleNote = cycleDetected
        ? '\n\n⚠️ Cycle ou chaîne trop longue détecté(e). Certains décalages peuvent être incomplets.'
        : ''
      const proceed = await confirm({
        title: `Cascade : ${cascadeShifts.length} successeur(s) décalé(s)`,
        message:
          cascadeShifts.slice(0, 10).map((s) => `• ${s.title} : ${s.oldStart} → ${s.newStart}`).join('\n') +
          (cascadeShifts.length > 10 ? `\n… et ${cascadeShifts.length - 10} de plus` : '') +
          cycleNote,
        confirmLabel: 'Appliquer',
        cancelLabel: 'Annuler',
        variant: 'warning',
      })
      if (!proceed) return
    }

    // ── Commit dragged + cascade ──
    try {
      const ops: Promise<unknown>[] = [
        projetsService.updateTask(projectId, barId, { start_date: newStart, due_date: newEnd }),
      ]
      for (const shift of cascadeShifts) {
        ops.push(projetsService.updateTask(shift.projectId, shift.id, {
          start_date: shift.newStart,
          due_date: shift.newEnd,
        }))
      }
      await Promise.all(ops)
      // Invalidate every affected project's task list so all bars
      // re-fetch with the new dates.
      const affectedProjectIds = new Set<string>([projectId])
      for (const s of cascadeShifts) affectedProjectIds.add(s.projectId)
      for (const pid of affectedProjectIds) {
        qc.invalidateQueries({ queryKey: ['project-tasks', pid] })
      }
      const toastTitle = cascadeShifts.length > 0
        ? t('projets.toast.task_rescheduled_cascade', { count: cascadeShifts.length })
        : t('projets.toast.task_rescheduled')
      toast({ title: toastTitle, variant: 'success' })
    } catch {
      toast({ title: t('projets.toast.drag_error'), variant: 'error' })
    }
  }, [taskIndex, allDepsFlat, dragCascadeMode, confirm, toast, qc, t])

  const handleBarResize = useCallback((barId: string, edge: 'left' | 'right', newDate: string) => {
    if (barId.startsWith('proj-')) return
    const bar = bars.find(b => b.id === barId)
    const projectId = bar?.meta?.projectId as string
    if (!projectId) return
    const patch = edge === 'left' ? { start_date: newDate } : { due_date: newDate }
    updateTaskMutation.mutate(
      { projectId, taskId: barId, payload: patch },
      {
        onSuccess: () => toast({ title: edge === 'left' ? t('projets.toast.start_modified') : t('projets.toast.end_modified'), variant: 'success' }),
        onError: () => toast({ title: t('projets.toast.error'), variant: 'error' }),
      },
    )
  }, [bars, toast, updateTaskMutation, t])

  // ── Cell edit (inline grid editing) ────────────────────────────

  const handleCellEdit = useCallback((rowId: string, columnId: string, value: string) => {
    // Find which project this row belongs to
    const bar = bars.find(b => b.rowId === rowId)
    const projectId = bar?.meta?.projectId as string
    if (!projectId || rowId.startsWith('proj-')) return

    const patch: Record<string, unknown> = {}
    if (columnId === 'start') patch.start_date = value
    if (columnId === 'end') patch.due_date = value
    if (columnId === 'progress') patch.progress = Number(value)
    if (Object.keys(patch).length > 0) {
      updateTaskMutation.mutate(
        { projectId, taskId: rowId, payload: patch as Record<string, string | number | null> },
        {
          onSuccess: () => toast({ title: t('projets.toast.updated'), variant: 'success' }),
          onError: () => toast({ title: t('projets.toast.update_error'), variant: 'error' }),
        },
      )
    }
  }, [bars, toast, updateTaskMutation, t])

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
    if (!projectId) { toast({ title: t('projets.toast.select_project'), variant: 'warning' }); return }

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
      toast({ title: t('projets.toast.task_created'), variant: 'success' })
    } catch {
      toast({ title: t('projets.toast.error'), variant: 'error' })
    }
  }, [selectedRowId, projects, findProjectForRow, toast, t])

  // ── Add milestone ─────────────────────────────────────────────

  const handleAddMilestone = useCallback(async () => {
    const projectId = selectedRowId ? findProjectForRow(selectedRowId) : projects[0]?.id
    if (!projectId) { toast({ title: t('projets.toast.select_project'), variant: 'warning' }); return }

    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    try {
      await projetsService.createMilestone(projectId, {
        name: 'Nouveau jalon',
        due_date: nextMonth,
      })
      toast({ title: t('projets.toast.milestone_created'), variant: 'success' })
    } catch {
      toast({ title: t('projets.toast.error'), variant: 'error' })
    }
  }, [selectedRowId, projects, findProjectForRow, toast, t])

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
      toast({ title: t('projets.toast.task_indented'), variant: 'success' })
    } catch {
      toast({ title: t('projets.toast.error'), variant: 'error' })
    }
  }, [rows, findProjectForRow, toast, t])

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
      toast({ title: t('projets.toast.task_outdented'), variant: 'success' })
    } catch {
      toast({ title: t('projets.toast.error'), variant: 'error' })
    }
  }, [tasksByProject, findProjectForRow, toast, t])

  // ── Delete row ────────────────────────────────────────────────

  const handleDeleteRow = useCallback(async (rowId: string) => {
    const projectId = findProjectForRow(rowId)
    if (!projectId || rowId.startsWith('proj-')) return

    try {
      await projetsService.deleteTask(projectId, rowId)
      toast({ title: t('projets.toast.task_deleted'), variant: 'success' })
      setSelectedRowId(null)
    } catch {
      toast({ title: t('projets.toast.error'), variant: 'error' })
    }
  }, [findProjectForRow, toast, t])

  // ── Export Gantt as A3 PDF (server-side, vector) ──
  // Mirrors the planner export pipeline: build a JSON payload from the
  // local rows/bars and POST it to /api/v1/projects/export/gantt-pdf. The
  // backend renders the shared `planner.gantt_export` template via
  // WeasyPrint, returning a crisp vector PDF (no html2canvas screenshot).
  const handleExportPdf = useCallback(async () => {
    try {
      const scale: TimeScale = currentScale ?? 'month'
      // If the user hasn't navigated yet, fall back to the project envelope
      // so the PDF still has a sensible window.
      let start = currentStart
      let end = currentEnd
      if (!start || !end) {
        const dates = projects
          .flatMap(p => [p.start_date, p.end_date])
          .filter((d): d is string => !!d)
          .map(d => d.split('T')[0])
        if (dates.length > 0) {
          start = dates.reduce((a, b) => (a < b ? a : b))
          end = dates.reduce((a, b) => (a > b ? a : b))
        } else {
          // Last-resort default: today → 6 months
          const today = new Date()
          start = toISO(today)
          const future = new Date(today)
          future.setMonth(future.getMonth() + 6)
          end = toISO(future)
        }
      }

      const cells = buildCells(scale, new Date(start), new Date(end))
      const todayISO = toISO(new Date())

      const dateToCol = (iso: string): number => {
        const t = new Date(iso).getTime()
        for (let i = 0; i < cells.length; i++) {
          const cs = cells[i].startDate.getTime()
          const ce = cells[i].endDate.getTime() + 86_400_000 - 1
          if (t >= cs && t <= ce) return i
        }
        if (t < cells[0].startDate.getTime()) return 0
        return cells.length - 1
      }

      const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
      const pdfColumns = cells.map((c) => ({
        key: c.key,
        label: c.label,
        group_label: monthFmt.format(c.startDate),
        is_today: scale === 'day' && c.startDate.toISOString().slice(0, 10) === todayISO,
        is_weekend: scale === 'day' && (c.startDate.getDay() === 0 || c.startDate.getDay() === 6),
        is_dim: scale === 'day' && (c.startDate.getDay() === 0 || c.startDate.getDay() === 6),
      }))

      const barsByRow = new Map<string, typeof bars[number][]>()
      for (const b of bars) {
        const list = barsByRow.get(b.rowId) ?? []
        list.push(b)
        barsByRow.set(b.rowId, list)
      }

      const pdfRows: GanttPdfRow[] = []
      for (const row of rows) {
        const rowBars = barsByRow.get(row.id) ?? []
        if (rowBars.length === 0) {
          pdfRows.push({
            id: row.id,
            label: row.label,
            sublabel: row.sublabel ?? null,
            level: row.level ?? 0,
            is_heatmap: false,
          })
          continue
        }
        for (const b of rowBars) {
          const startCol = dateToCol(b.startDate)
          const endCol = dateToCol(b.endDate)
          pdfRows.push({
            id: `${row.id}::${b.id}`,
            label: row.label,
            sublabel: row.sublabel ?? null,
            level: row.level ?? 0,
            is_heatmap: false,
            bar: {
              start_col: startCol,
              end_col: endCol,
              color: b.color || '#3b82f6',
              text_color: '#ffffff',
              label: b.title || null,
              is_draft: !!b.isDraft,
              is_critical: !!b.isCritical,
              progress: typeof b.progress === 'number' ? b.progress : null,
              cell_labels: null,
            },
          })
        }
      }

      const dateRangeLabel = `${start} → ${end}`
      const payload: GanttPdfExportPayload = {
        title: 'Projets — Gantt',
        date_range: dateRangeLabel,
        scale,
        columns: pdfColumns,
        rows: pdfRows,
        task_col_label: 'Projet / tâche',
      }
      const blob = await projetsService.exportGanttPdf(payload)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `projets-gantt-${toISO(new Date())}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: t('projets.toast.pdf_generated'), variant: 'success' })
    } catch {
      toast({ title: t('projets.toast.pdf_error'), variant: 'error' })
    }
  }, [currentScale, currentStart, currentEnd, projects, rows, bars, toast, t])

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
          initialScale={currentScale}
          initialStart={currentStart}
          initialEnd={currentEnd}
          initialSettings={getPref('gantt_settings', { barHeight: 20, rowHeight: 34, showBaselines: true })}
          onSettingsChange={(s) => setPref('gantt_settings', s)}
          onViewChange={(scale, start, end) => {
            // GanttCore types `scale` as plain string for cross-module
            // reuse, but our local state is the narrower TimeScale union.
            const s = scale as TimeScale
            setCurrentScale(s)
            setCurrentStart(start)
            setCurrentEnd(end)
            setPref('gantt_scale', s)
            setPref('gantt_viewStart', start)
            setPref('gantt_viewEnd', end)
          }}
          onExportPdf={handleExportPdf}
          onBarClick={handleBarClick}
          onRowClick={(rowId) => {
            // Double-click: projects → project detail, tasks → task detail
            const isProject = projects.some(p => p.id === rowId)
            if (isProject) {
              openPanel({ type: 'detail', module: 'projets', id: rowId })
              return
            }
            // Task — open dedicated task detail panel
            const bar = bars.find(b => b.rowId === rowId)
            const projectId = bar?.meta?.projectId as string
            if (projectId) {
              openPanel({ type: 'task-detail', module: 'projets', id: rowId, meta: { projectId } })
            }
          }}
          onBarDrag={handleBarDrag}
          onBarResize={handleBarResize}
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
