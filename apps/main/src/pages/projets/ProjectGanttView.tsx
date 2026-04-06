/**
 * ProjectGanttView — Production Gantt chart with grouped time cells,
 * dual-row header, adjustable bar height, date range picker, and
 * hierarchical task tree with Gouti sub-task support.
 *
 * Time scales group days into cells:
 * - Day:      1 cell = 1 day
 * - Week:     1 cell = 1 ISO week (Mon–Sun)
 * - Month:    1 cell = 1 calendar month
 * - Quarter:  1 cell = 3 months
 * - Semester: 1 cell = 6 months
 *
 * Bar position = (task.start - viewStart) * pxPerDay. Cell width =
 * daysInCell * pxPerDay. This means zooming changes pxPerDay, not the
 * cell count — perfectly proportional.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  ChevronLeft, ChevronRight, ChevronDown, Loader2,
  Milestone, Layers, Download, Settings2, Save, FolderOpen, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useProjects, useProjectTasks, useProjectMilestones, useProjectCpm, useTaskDependencies } from '@/hooks/useProjets'
import { projetsService, isGoutiProject } from '@/services/projetsService'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useToast } from '@/components/ui/Toast'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import type { Project, ProjectTask, TaskDependency } from '@/types/api'

// ═══════════════════════════════════════════════════════════════════════
// Time scale engine
// ═══════════════════════════════════════════════════════════════════════

type TimeScale = 'day' | 'week' | 'month' | 'quarter' | 'semester'

interface TimeCell {
  key: string
  label: string
  startDate: Date
  endDate: Date
  days: number
}

interface HeaderGroup {
  key: string
  label: string
  spanCells: number // how many child cells this group covers
}

const SCALE_META: Record<TimeScale, {
  label: string
  pxPerDay: number
  defaultMonths: number
  shiftDays: number
}> = {
  day:      { label: 'Jour',      pxPerDay: 40,  defaultMonths: 1,  shiftDays: 7 },
  week:     { label: 'Semaine',   pxPerDay: 16,  defaultMonths: 3,  shiftDays: 14 },
  month:    { label: 'Mois',      pxPerDay: 4,   defaultMonths: 12, shiftDays: 30 },
  quarter:  { label: 'Trimestre', pxPerDay: 1.5, defaultMonths: 24, shiftDays: 90 },
  semester: { label: 'Semestre',  pxPerDay: 0.8, defaultMonths: 36, shiftDays: 180 },
}

function buildCells(scale: TimeScale, start: Date, end: Date): TimeCell[] {
  const cells: TimeCell[] = []
  const cur = new Date(start)

  while (cur <= end) {
    let cellEnd: Date
    let label: string
    let key: string

    if (scale === 'day') {
      cellEnd = new Date(cur)
      label = cur.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
      key = cur.toISOString().slice(0, 10)
      const next = new Date(cur); next.setDate(next.getDate() + 1)
      cells.push({ key, label, startDate: new Date(cur), endDate: cellEnd, days: 1 })
      cur.setDate(cur.getDate() + 1)
    } else if (scale === 'week') {
      // Start of ISO week (Monday)
      const day = cur.getDay()
      const mon = new Date(cur)
      if (day !== 1) mon.setDate(mon.getDate() - ((day + 6) % 7))
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      cellEnd = sun > end ? end : sun
      const effectiveStart = mon < start ? start : mon
      const days = Math.ceil((cellEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1
      label = `S${String(getISOWeek(mon)).padStart(2, '0')}`
      key = `w${mon.toISOString().slice(0, 10)}`
      cells.push({ key, label, startDate: effectiveStart, endDate: cellEnd, days: Math.max(1, days) })
      cur.setTime(sun.getTime()); cur.setDate(cur.getDate() + 1)
    } else if (scale === 'month') {
      const y = cur.getFullYear(); const m = cur.getMonth()
      const monthStart = new Date(y, m, 1)
      const monthEnd = new Date(y, m + 1, 0)
      const effectiveStart = monthStart < start ? start : monthStart
      const effectiveEnd = monthEnd > end ? end : monthEnd
      const days = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1
      label = cur.toLocaleDateString('fr-FR', { month: 'short' })
      key = `m${y}-${String(m + 1).padStart(2, '0')}`
      cells.push({ key, label, startDate: effectiveStart, endDate: effectiveEnd, days: Math.max(1, days) })
      cur.setMonth(cur.getMonth() + 1); cur.setDate(1)
    } else if (scale === 'quarter') {
      const y = cur.getFullYear(); const q = Math.floor(cur.getMonth() / 3)
      const qStart = new Date(y, q * 3, 1)
      const qEnd = new Date(y, q * 3 + 3, 0)
      const effectiveStart = qStart < start ? start : qStart
      const effectiveEnd = qEnd > end ? end : qEnd
      const days = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1
      label = `T${q + 1}`
      key = `q${y}-${q + 1}`
      cells.push({ key, label, startDate: effectiveStart, endDate: effectiveEnd, days: Math.max(1, days) })
      cur.setMonth(q * 3 + 3); cur.setDate(1)
    } else {
      // semester
      const y = cur.getFullYear(); const s = cur.getMonth() < 6 ? 0 : 1
      const sStart = new Date(y, s * 6, 1)
      const sEnd = new Date(y, s * 6 + 6, 0)
      const effectiveStart = sStart < start ? start : sStart
      const effectiveEnd = sEnd > end ? end : sEnd
      const days = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1
      label = `S${s + 1}`
      key = `s${y}-${s + 1}`
      cells.push({ key, label, startDate: effectiveStart, endDate: effectiveEnd, days: Math.max(1, days) })
      cur.setMonth(s * 6 + 6); cur.setDate(1)
    }
  }
  return cells
}

function buildHeaderGroups(scale: TimeScale, cells: TimeCell[]): HeaderGroup[] {
  if (scale === 'day' || scale === 'week') {
    // Group by month
    const groups: HeaderGroup[] = []
    let cur = ''
    for (const c of cells) {
      const ym = `${c.startDate.getFullYear()}-${c.startDate.getMonth()}`
      const label = c.startDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      if (ym !== cur) { groups.push({ key: ym, label, spanCells: 1 }); cur = ym }
      else { groups[groups.length - 1].spanCells++ }
    }
    return groups
  }
  if (scale === 'month') {
    // Group by year
    const groups: HeaderGroup[] = []
    let cur = -1
    for (const c of cells) {
      const y = c.startDate.getFullYear()
      if (y !== cur) { groups.push({ key: `y${y}`, label: String(y), spanCells: 1 }); cur = y }
      else { groups[groups.length - 1].spanCells++ }
    }
    return groups
  }
  // quarter/semester: group by year
  const groups: HeaderGroup[] = []
  let cur = -1
  for (const c of cells) {
    const y = c.startDate.getFullYear()
    if (y !== cur) { groups.push({ key: `y${y}`, label: String(y), spanCells: 1 }); cur = y }
    else { groups[groups.length - 1].spanCells++ }
  }
  return groups
}

function getISOWeek(d: Date): number {
  const t = new Date(d.valueOf())
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7))
  const y1 = new Date(t.getFullYear(), 0, 4)
  return 1 + Math.round(((t.getTime() - y1.getTime()) / 86400000 - 3 + ((y1.getDay() + 6) % 7)) / 7)
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

const toISO = (d: Date) => d.toISOString().slice(0, 10)
// SIGNED days-between — can be negative when b < a (task before view start)
const daysB = (a: string, b: string) => Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
const addD = (s: string, n: number) => { const d = new Date(s); d.setDate(d.getDate() + n); return toISO(d) }

const S_CLR: Record<string, string> = { draft: '#9ca3af', planned: '#60a5fa', active: '#22c55e', on_hold: '#fbbf24', completed: '#10b981', cancelled: '#ef4444' }
const T_CLR: Record<string, string> = { todo: '#9ca3af', in_progress: '#3b82f6', review: '#eab308', done: '#22c55e', cancelled: '#ef4444' }

// ── Persisted Gantt display settings ────────────────────────────────────

// DB-backed preference keys (namespace in user.preferences JSONB):
//   gantt         → GanttSettings
//   gantt_presets  → GanttPreset[]

const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done', 'cancelled'] as const
type TaskStatus = typeof TASK_STATUSES[number]

const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
type TaskPriority = typeof TASK_PRIORITIES[number]
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Basse', medium: 'Moyenne', high: 'Haute', critical: 'Critique',
}
const PRIORITY_CLR: Record<TaskPriority, string> = {
  low: '#9ca3af', medium: '#3b82f6', high: '#f59e0b', critical: '#ef4444',
}

interface GanttSettings {
  barH: number
  showLabels: boolean
  showDates: 'none' | 'on_bar' | 'below_bar'
  showProgress: boolean          // overlay % fill on bars
  zoomFactor: number
  hiddenStatuses: TaskStatus[]   // statuses to HIDE
  hiddenPriorities: TaskPriority[] // priorities to HIDE
  filterAssignee: string | null  // assignee_name substring filter (null = all)
  activePreset: string | null
}

interface GanttPreset {
  name: string
  settings: Omit<GanttSettings, 'activePreset'>
  scale: TimeScale
  viewStart: string
  viewEnd: string
}

const DEFAULT_SETTINGS: GanttSettings = {
  barH: 18, showLabels: true, showDates: 'none', showProgress: true,
  zoomFactor: 1.0, hiddenStatuses: [], hiddenPriorities: [],
  filterAssignee: null, activePreset: null,
}

// Settings/presets are now loaded via useUserPreferences (DB-backed with
// localStorage cache). The old direct-localStorage functions are removed.

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'À faire', in_progress: 'En cours', review: 'Revue', done: 'Terminé', cancelled: 'Annulé',
}

/** Compute bar pixel position. Returns null when entirely outside the view. */
function computeBar(vs: string, startISO: string, endISO: string, ppd: number, totalViewDays: number): { left: number; width: number } | null {
  const s = daysB(vs, startISO)  // signed!
  const e = daysB(vs, endISO)
  // Entirely before view or entirely after
  if (e < 0 || s > totalViewDays) return null
  const cl = Math.max(0, s)
  const cr = Math.min(totalViewDays, e)
  return { left: cl * ppd, width: Math.max(ppd * 0.5, (cr - cl + 1) * ppd) }
}

// ═══════════════════════════════════════════════════════════════════════
// Tooltip
// ═══════════════════════════════════════════════════════════════════════

function Tip({ title, lines, x, y }: { title: string; lines: [string, string][]; x: number; y: number }) {
  return (
    <div className="fixed z-[100] bg-popover border border-border rounded-md shadow-lg p-2 text-xs w-[230px] pointer-events-none" style={{ left: x + 14, top: y - 8 }}>
      <div className="font-semibold mb-1 truncate">{title}</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
        {lines.map(([k, v], i) => <><span key={`k${i}`} className="text-muted-foreground">{k}</span><span key={`v${i}`}>{v}</span></>)}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Expanded tasks
// ═══════════════════════════════════════════════════════════════════════

function ExpandedTasks({ project, ppd, vs, totalPx, pw, settings }: {
  project: Project; ppd: number; vs: string; totalPx: number; pw: number; settings: GanttSettings
}) {
  const { barH, showLabels, showDates, showProgress, hiddenStatuses, hiddenPriorities, filterAssignee } = settings
  const { data: tasks } = useProjectTasks(project.id)
  const { data: milestones } = useProjectMilestones(project.id)
  const { data: cpm } = useProjectCpm(project.id)
  const { data: deps } = useTaskDependencies(project.id)
  const { toast } = useToast()
  const [tip, setTip] = useState<{ title: string; lines: [string, string][]; x: number; y: number } | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const critSet = useMemo(() => new Set(cpm?.critical_path_task_ids || []), [cpm])
  const rowH = barH + 8

  // Filter by status + priority + assignee
  const hiddenStatusSet = useMemo(() => new Set(hiddenStatuses), [hiddenStatuses])
  const hiddenPrioritySet = useMemo(() => new Set(hiddenPriorities), [hiddenPriorities])
  const assigneeNeedle = (filterAssignee || '').toLowerCase().trim()
  const filteredTasks = useMemo(() =>
    (tasks || []).filter(t => {
      if (hiddenStatusSet.has(t.status as TaskStatus)) return false
      if (hiddenPrioritySet.has(t.priority as TaskPriority)) return false
      if (assigneeNeedle && !(t.assignee_name || '').toLowerCase().includes(assigneeNeedle)) return false
      return true
    }),
    [tasks, hiddenStatusSet, hiddenPrioritySet, assigneeNeedle],
  )

  const tree = useMemo(() => {
    const m = new Map<string | null, ProjectTask[]>()
    for (const t of filteredTasks) { const k = t.parent_id ?? null; if (!m.has(k)) m.set(k, []); m.get(k)!.push(t) }
    for (const a of m.values()) a.sort((x, y) => (x.order ?? 0) - (y.order ?? 0))
    return m
  }, [filteredTasks])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/ptask')
    if (!raw) return
    try {
      const { id, s, e: end } = JSON.parse(raw)
      const dur = daysB(s, end)
      const rect = (e.target as HTMLElement).closest('[data-bar-area]')?.getBoundingClientRect()
      if (!rect) return
      const offsetDays = Math.floor((e.clientX - rect.left) / ppd)
      const newStart = addD(vs, offsetDays)
      await projetsService.updateTask(project.id, id, { start_date: newStart, due_date: addD(newStart, dur) })
      // Propagate to parent: if this task has a parent, update parent's dates
      // to span min(children.start) → max(children.end)
      const task = filteredTasks.find(t => t.id === id)
      if (task?.parent_id) {
        const siblings = filteredTasks.filter(t => t.parent_id === task.parent_id)
        const allStarts = siblings.map(t => t.id === id ? newStart : t.start_date?.split('T')[0]).filter(Boolean) as string[]
        const allEnds = siblings.map(t => t.id === id ? addD(newStart, dur) : t.due_date?.split('T')[0]).filter(Boolean) as string[]
        if (allStarts.length && allEnds.length) {
          const minStart = allStarts.sort()[0]
          const maxEnd = allEnds.sort().reverse()[0]
          try {
            await projetsService.updateTask(project.id, task.parent_id, { start_date: minStart, due_date: maxEnd })
          } catch { /* parent update is best-effort */ }
        }
      }
      toast({ title: 'Tâche replanifiée', variant: 'success' })
    } catch { toast({ title: 'Erreur', variant: 'error' }) }
  }, [project.id, toast, ppd, vs])

  // Inline edit: double-click on task name → input, Enter/blur saves
  const handleInlineEdit = useCallback(async (taskId: string, newTitle: string) => {
    const trimmed = newTitle.trim()
    if (!trimmed) { setEditingId(null); return }
    try {
      await projetsService.updateTask(project.id, taskId, { title: trimmed })
      toast({ title: 'Titre modifié', variant: 'success' })
    } catch { toast({ title: 'Erreur', variant: 'error' }) }
    setEditingId(null)
  }, [project.id, toast])

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }, [])

  // Build rich tooltip content for a task
  const buildTip = useCallback((task: ProjectTask, e: React.MouseEvent) => {
    const lines: [string, string][] = [
      ['Statut', STATUS_LABELS[task.status as TaskStatus] || task.status],
      ['Priorité', PRIORITY_LABELS[task.priority as TaskPriority] || task.priority],
      ['Progression', `${task.progress}%`],
    ]
    if (task.start_date) lines.push(['Début', new Date(task.start_date).toLocaleDateString('fr-FR')])
    if (task.due_date) lines.push(['Fin', new Date(task.due_date).toLocaleDateString('fr-FR')])
    if (task.start_date && task.due_date) {
      const dur = daysB(task.start_date.split('T')[0], task.due_date.split('T')[0])
      lines.push(['Durée', `${dur} jour${dur > 1 ? 's' : ''}`])
    }
    if (task.assignee_name) lines.push(['Responsable', task.assignee_name])
    if (task.estimated_hours) lines.push(['Charge estimée', `${task.estimated_hours}h`])
    if (task.actual_hours) lines.push(['Charge réelle', `${task.actual_hours}h`])
    if (task.code) lines.push(['Réf.', task.code])
    if (critSet.has(task.id)) lines.push(['Chemin critique', '⚡ Oui'])
    setTip({ title: task.title, lines, x: e.clientX, y: e.clientY })
  }, [critSet])

  const renderTask = (task: ProjectTask, depth: number): React.ReactNode[] => {
    const children = tree.get(task.id) || []
    const hasChildren = children.length > 0
    const isCollapsed = collapsed.has(task.id)
    const isEditing = editingId === task.id
    const isCrit = critSet.has(task.id)
    const clr = T_CLR[task.status] || '#9ca3af'
    const bar = (task.start_date && task.due_date)
      ? computeBar(vs, task.start_date.split('T')[0], task.due_date.split('T')[0], ppd, totalPx / ppd)
      : null
    const nodes: React.ReactNode[] = []
    nodes.push(
      <div key={task.id} className="flex border-b border-border/20" style={{ minWidth: pw + totalPx, height: rowH }}>
        {/* ── Left panel: tree with expand/collapse + inline edit ── */}
        <div
          className="sticky left-0 z-[5] bg-background border-r border-border flex items-center gap-1 text-[10px] truncate shrink-0 hover:bg-muted/30 px-1"
          style={{ width: pw, paddingLeft: `${6 + depth * 16}px` }}
          onMouseEnter={e => buildTip(task, e)}
          onMouseMove={e => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
          onMouseLeave={() => setTip(null)}
        >
          {/* Expand/collapse chevron for parent tasks */}
          {hasChildren ? (
            <button
              onClick={() => toggleCollapse(task.id)}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground shrink-0"
            >
              <ChevronDown size={9} className={cn('transition-transform', isCollapsed && '-rotate-90')} />
            </button>
          ) : (
            <span className="w-[13px] shrink-0" />
          )}
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: clr }} />
          {/* Task title — double-click to edit */}
          {isEditing ? (
            <input
              autoFocus
              className="flex-1 bg-transparent border-b border-primary text-[10px] outline-none min-w-0"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={() => handleInlineEdit(task.id, editValue)}
              onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(task.id, editValue); if (e.key === 'Escape') setEditingId(null) }}
            />
          ) : (
            <span
              className={cn('truncate cursor-text', task.status === 'done' && 'line-through text-muted-foreground')}
              onDoubleClick={() => { setEditingId(task.id); setEditValue(task.title) }}
            >
              {task.title}
            </span>
          )}
          {isCrit && <span className="text-[7px] px-0.5 rounded bg-red-500/10 text-red-500 shrink-0">CPM</span>}
          {task.progress > 0 && task.progress < 100 && (
            <span className="text-[7px] text-muted-foreground tabular-nums shrink-0">{task.progress}%</span>
          )}
        </div>
        <div data-bar-area className="relative flex-1" style={{ minWidth: totalPx }} onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
          {bar && (
            <>
              <div
                draggable
                onDragStart={e => { e.dataTransfer.setData('application/ptask', JSON.stringify({ id: task.id, s: task.start_date!.split('T')[0], e: task.due_date!.split('T')[0] })); e.dataTransfer.effectAllowed = 'move' }}
                onMouseEnter={e => setTip({ title: task.title, lines: [['Statut', task.status], ['%', `${task.progress}%`]], x: e.clientX, y: e.clientY })}
                onMouseMove={e => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                onMouseLeave={() => setTip(null)}
                className={cn('absolute rounded-sm cursor-move text-white font-medium truncate px-0.5 flex items-center gap-0.5 hover:brightness-110 overflow-hidden', isCrit && 'ring-1 ring-red-500')}
                style={{ left: bar.left, width: bar.width, top: (rowH - barH) / 2, height: barH, backgroundColor: clr, opacity: task.status === 'todo' ? 0.5 : 1, fontSize: Math.max(6, barH * 0.45) }}
              >
                {/* Progress overlay */}
                {showProgress && task.progress > 0 && task.progress < 100 && (
                  <div className="absolute inset-0 bg-white/20 pointer-events-none" style={{ width: `${task.progress}%` }} />
                )}
                <span className="relative z-[1] flex items-center gap-0.5 w-full truncate">
                  {showDates === 'on_bar' && task.start_date && (
                    <span className="opacity-70 shrink-0 tabular-nums">{new Date(task.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
                  )}
                  {showLabels && <span className="truncate">{task.title}</span>}
                  {showDates === 'on_bar' && task.due_date && (
                    <span className="opacity-70 shrink-0 tabular-nums ml-auto">{new Date(task.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
                  )}
                </span>
              </div>
              {showDates === 'below_bar' && task.start_date && (
                <div className="absolute text-[6px] text-muted-foreground tabular-nums" style={{ left: bar.left, top: (rowH - barH) / 2 + barH + 1 }}>
                  {new Date(task.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                  {task.due_date && ` → ${new Date(task.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
    if (!isCollapsed) {
      for (const ch of children) nodes.push(...renderTask(ch, depth + 1))
    }
    return nodes
  }

  const roots = tree.get(null) || []
  const rendered = new Set<string>()
  const markRendered = (id: string) => { rendered.add(id); for (const ch of (tree.get(id) || [])) markRendered(ch.id) }
  for (const r of roots) markRendered(r.id)
  const orphans = filteredTasks.filter(t => !rendered.has(t.id))

  // Build visible row order for dependency arrow Y positions
  const visibleRows = useMemo(() => {
    const rows: string[] = []
    const walk = (parentId: string | null) => {
      for (const t of (tree.get(parentId) || [])) {
        rows.push(t.id)
        if (!collapsed.has(t.id)) walk(t.id)
      }
    }
    walk(null)
    // Orphans
    for (const t of orphans) {
      rows.push(t.id)
    }
    return rows
  }, [tree, collapsed, orphans])

  const rowIndex = useMemo(() => {
    const m = new Map<string, number>()
    visibleRows.forEach((id, i) => m.set(id, i))
    return m
  }, [visibleRows])

  // Task position map for arrows: id → { endX, centerY } for "from" and { startX, centerY } for "to"
  const taskPositions = useMemo(() => {
    const m = new Map<string, { startX: number; endX: number; centerY: number }>()
    for (const t of filteredTasks) {
      const idx = rowIndex.get(t.id)
      if (idx === undefined) continue
      const centerY = idx * rowH + rowH / 2
      if (t.start_date && t.due_date) {
        const bar = computeBar(vs, t.start_date.split('T')[0], t.due_date.split('T')[0], ppd, totalPx / ppd)
        if (bar) {
          m.set(t.id, { startX: bar.left, endX: bar.left + bar.width, centerY })
          continue
        }
      }
      // No bar visible — position at 0
      m.set(t.id, { startX: 0, endX: 0, centerY })
    }
    return m
  }, [filteredTasks, rowIndex, rowH, vs, ppd, totalPx])

  // Dependency arrows as SVG paths
  const depArrows = useMemo(() => {
    if (!deps || deps.length === 0) return []
    const arrows: { key: string; path: string; isCritical: boolean }[] = []
    for (const d of deps as TaskDependency[]) {
      const from = taskPositions.get(d.from_task_id)
      const to = taskPositions.get(d.to_task_id)
      if (!from || !to) continue
      // FS: arrow from end of predecessor to start of successor
      const x1 = from.endX; const y1 = from.centerY
      const x2 = to.startX; const y2 = to.centerY
      if (x1 === 0 && x2 === 0) continue // both out of view
      // Bezier curve
      const dx = Math.abs(x2 - x1) / 2
      const path = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
      const isCritical = critSet.has(d.from_task_id) && critSet.has(d.to_task_id)
      arrows.push({ key: d.id, path, isCritical })
    }
    return arrows
  }, [deps, taskPositions, critSet])

  const totalHeight = visibleRows.length * rowH + ((milestones || []).filter(ms => ms.due_date).length * rowH)

  return (
    <>
      {roots.flatMap(r => renderTask(r, 1))}
      {orphans.flatMap(t => renderTask(t, 1))}
      {(milestones || []).filter(ms => ms.due_date).map(ms => {
        const mOff = daysB(vs, ms.due_date!.split('T')[0])
        if (mOff < 0 || mOff * ppd > totalPx) return null
        return (
          <div key={ms.id} className="flex border-b border-border/20" style={{ minWidth: pw + totalPx, height: rowH }}>
            <div className="sticky left-0 z-[5] bg-background border-r border-border flex items-center gap-1 pl-6 text-[10px] text-muted-foreground truncate shrink-0" style={{ width: pw }}>
              <Milestone size={9} className={ms.status === 'completed' ? 'text-green-500' : 'text-yellow-500'} />
              {ms.name}
            </div>
            <div className="relative flex-1" style={{ minWidth: totalPx }}>
              <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rotate-45 bg-yellow-500 border border-yellow-600" style={{ left: mOff * ppd }} />
            </div>
          </div>
        )
      })}
      {/* Dependency arrows SVG overlay */}
      {depArrows.length > 0 && (
        <svg
          className="absolute pointer-events-none z-[12]"
          style={{ left: pw, top: 0, width: totalPx, height: totalHeight }}
          viewBox={`0 0 ${totalPx} ${totalHeight}`}
          fill="none"
        >
          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="#6b7280" />
            </marker>
            <marker id="arrowhead-crit" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="#ef4444" />
            </marker>
          </defs>
          {depArrows.map(a => (
            <path
              key={a.key}
              d={a.path}
              stroke={a.isCritical ? '#ef4444' : '#6b7280'}
              strokeWidth={a.isCritical ? 1.5 : 1}
              strokeDasharray={a.isCritical ? undefined : '4 2'}
              opacity={0.6}
              markerEnd={a.isCritical ? 'url(#arrowhead-crit)' : 'url(#arrowhead)'}
            />
          ))}
        </svg>
      )}
      {tip && <Tip {...tip} />}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Settings panel (extracted for clarity)
// ═══════════════════════════════════════════════════════════════════════

function GanttSettingsPanel({ settings, setSettings, scale, vs, ve, presets, setPresets }: {
  settings: GanttSettings
  setSettings: (fn: (s: GanttSettings) => GanttSettings) => void
  scale: TimeScale
  vs: string
  ve: string
  presets: GanttPreset[]
  setPresets: (p: GanttPreset[]) => void
}) {
  const [newPresetName, setNewPresetName] = useState('')
  const [showPresets, setShowPresets] = useState(false)

  const handleSavePreset = () => {
    const name = newPresetName.trim()
    if (!name) return
    const { activePreset, ...rest } = settings
    const preset: GanttPreset = { name, settings: rest, scale, viewStart: vs, viewEnd: ve }
    setPresets([...presets.filter(p => p.name !== name), preset])
    setSettings(s => ({ ...s, activePreset: name }))
    setNewPresetName('')
  }

  const handleLoadPreset = (p: GanttPreset) => {
    setSettings(() => ({ ...p.settings, activePreset: p.name }))
    setShowPresets(false)
  }

  const handleDeletePreset = (name: string) => {
    setPresets(presets.filter(p => p.name !== name))
    if (settings.activePreset === name) setSettings(s => ({ ...s, activePreset: null }))
  }

  const toggleStatus = (status: TaskStatus) => {
    setSettings(s => {
      const cur = s.hiddenStatuses
      const next = cur.includes(status) ? cur.filter(x => x !== status) : [...cur, status]
      return { ...s, hiddenStatuses: next }
    })
  }

  return (
    <div className="border-b border-border px-3.5 py-2.5 bg-muted/30 space-y-2.5 text-xs">
      {/* Row 1: Appearance */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-medium">Barres:</span>
          <input type="range" min="8" max="32" step="2" value={settings.barH} onChange={e => setSettings(s => ({ ...s, barH: Number(e.target.value) }))} className="w-[80px]" />
          <span className="tabular-nums text-muted-foreground w-6">{settings.barH}px</span>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={settings.showLabels} onChange={e => setSettings(s => ({ ...s, showLabels: e.target.checked }))} className="w-3 h-3" />
          <span className="text-muted-foreground">Noms</span>
        </label>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Dates:</span>
          {(['none', 'on_bar', 'below_bar'] as const).map(v => (
            <button
              key={v}
              onClick={() => setSettings(s => ({ ...s, showDates: v }))}
              className={cn('px-1.5 py-0.5 rounded border text-[9px]', settings.showDates === v ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}
            >
              {v === 'none' ? 'Masquées' : v === 'on_bar' ? 'Sur barre' : 'Sous barre'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Zoom:</span>
          <input type="range" min="25" max="400" step="5" value={Math.round(settings.zoomFactor * 100)} onChange={e => setSettings(s => ({ ...s, zoomFactor: Number(e.target.value) / 100 }))} className="w-[80px]" />
          <span className="tabular-nums text-muted-foreground w-8">{Math.round(settings.zoomFactor * 100)}%</span>
        </div>
      </div>

      {/* Row 2: Status + Priority filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-muted-foreground font-medium">Statut:</span>
        {TASK_STATUSES.map(st => {
          const hidden = settings.hiddenStatuses.includes(st)
          return (
            <button
              key={st}
              onClick={() => toggleStatus(st)}
              className={cn(
                'px-1.5 py-0.5 rounded border text-[9px] flex items-center gap-1',
                hidden
                  ? 'border-red-500/30 bg-red-500/10 text-red-600 line-through'
                  : 'border-border hover:bg-muted text-foreground',
              )}
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: T_CLR[st] }} />
              {STATUS_LABELS[st]}
            </button>
          )
        })}
        <span className="text-muted-foreground font-medium ml-2">Priorité:</span>
        {TASK_PRIORITIES.map(pr => {
          const hidden = settings.hiddenPriorities.includes(pr)
          return (
            <button
              key={pr}
              onClick={() => setSettings(s => {
                const cur = s.hiddenPriorities
                return { ...s, hiddenPriorities: cur.includes(pr) ? cur.filter(x => x !== pr) : [...cur, pr] }
              })}
              className={cn(
                'px-1.5 py-0.5 rounded border text-[9px] flex items-center gap-1',
                hidden
                  ? 'border-red-500/30 bg-red-500/10 text-red-600 line-through'
                  : 'border-border hover:bg-muted text-foreground',
              )}
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PRIORITY_CLR[pr] }} />
              {PRIORITY_LABELS[pr]}
            </button>
          )
        })}
        {(settings.hiddenStatuses.length > 0 || settings.hiddenPriorities.length > 0) && (
          <button
            onClick={() => setSettings(s => ({ ...s, hiddenStatuses: [], hiddenPriorities: [] }))}
            className="text-[9px] text-primary hover:text-primary/80"
          >
            Tout afficher
          </button>
        )}
      </div>

      {/* Row 2b: Assignee filter + progress toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground font-medium">Responsable:</span>
          <input
            type="text"
            value={settings.filterAssignee || ''}
            onChange={e => setSettings(s => ({ ...s, filterAssignee: e.target.value || null }))}
            placeholder="Filtrer par nom..."
            className="h-5 px-1.5 text-[9px] border border-border rounded bg-background w-[130px]"
          />
          {settings.filterAssignee && (
            <button onClick={() => setSettings(s => ({ ...s, filterAssignee: null }))} className="text-[9px] text-primary">✕</button>
          )}
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={settings.showProgress} onChange={e => setSettings(s => ({ ...s, showProgress: e.target.checked }))} className="w-3 h-3" />
          <span className="text-muted-foreground">Progression sur barres</span>
        </label>
      </div>

      {/* Row 3: Presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-muted-foreground font-medium">Modèles:</span>
        {settings.activePreset && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            {settings.activePreset}
          </span>
        )}
        <button
          onClick={() => setShowPresets(v => !v)}
          className="flex items-center gap-1 text-[9px] text-primary hover:text-primary/80"
        >
          <FolderOpen size={10} /> Charger
        </button>
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={newPresetName}
            onChange={e => setNewPresetName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSavePreset() }}
            placeholder="Nom du modèle..."
            className="h-5 px-1.5 text-[9px] border border-border rounded bg-background w-[120px]"
          />
          <button
            onClick={handleSavePreset}
            disabled={!newPresetName.trim()}
            className="flex items-center gap-0.5 text-[9px] text-primary hover:text-primary/80 disabled:opacity-40"
          >
            <Save size={10} /> Enregistrer
          </button>
        </div>
      </div>

      {/* Preset list (expandable) */}
      {showPresets && presets.length > 0 && (
        <div className="border border-border rounded p-2 bg-background space-y-1">
          {presets.map(p => (
            <div key={p.name} className="flex items-center gap-2 text-[10px] hover:bg-muted/40 px-1.5 py-0.5 rounded">
              <button onClick={() => handleLoadPreset(p)} className="flex-1 text-left truncate text-foreground hover:text-primary">
                {p.name}
              </button>
              <span className="text-muted-foreground text-[8px]">{p.scale} · {Math.round((p.settings.zoomFactor || 1) * 100)}%</span>
              <button onClick={() => handleDeletePreset(p.name)} className="p-0.5 hover:text-red-500 text-muted-foreground">
                <Trash2 size={9} />
              </button>
            </div>
          ))}
        </div>
      )}
      {showPresets && presets.length === 0 && (
        <div className="text-[9px] text-muted-foreground italic pl-2">Aucun modèle sauvegardé</div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════

export function ProjectGanttView() {
  const { data: pd, isLoading } = useProjects({ page_size: 200 })
  const open = useUIStore(s => s.openDynamicPanel)

  const [scale, setScale] = useState<TimeScale>('month')
  const [pw, setPw] = useState(260)
  // User preferences backed by DB (synced via API) with localStorage cache
  const { getPref, setPref: setUserPref } = useUserPreferences()
  const settings: GanttSettings = getPref('gantt', DEFAULT_SETTINGS)
  const setSettings = useCallback((fn: (s: GanttSettings) => GanttSettings) => {
    const next = fn(settings)
    setUserPref('gantt', next)
  }, [settings, setUserPref])
  const barH = settings.barH
  const showLabels = settings.showLabels
  const zoomFactor = settings.zoomFactor

  const [exp, setExp] = useState<Set<string>>(new Set())
  const [tip, setTip] = useState<{ title: string; lines: [string, string][]; x: number; y: number } | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const resizing = useRef(false)

  const meta = SCALE_META[scale]
  const projects = pd?.items ?? []
  // Effective pxPerDay = base * user zoom factor
  const ppd = meta.pxPerDay * zoomFactor

  // Date range
  const defaultRange = useMemo(() => {
    const t = new Date()
    return { s: toISO(new Date(t.getFullYear(), t.getMonth(), 1)), e: toISO(new Date(t.getFullYear(), t.getMonth() + meta.defaultMonths, 0)) }
  }, [meta.defaultMonths])

  const [vs, setVs] = useState(defaultRange.s)
  const [ve, setVe] = useState(defaultRange.e)
  useEffect(() => { setVs(defaultRange.s); setVe(defaultRange.e) }, [defaultRange])

  // Build cells
  const cells = useMemo(() => buildCells(scale, new Date(vs), new Date(ve)), [scale, vs, ve])
  const headerGroups = useMemo(() => buildHeaderGroups(scale, cells), [scale, cells])
  const totalDays = useMemo(() => cells.reduce((s, c) => s + c.days, 0), [cells])
  const totalPx = totalDays * ppd
  const contentW = pw + totalPx

  // Today line
  const todayStr = toISO(new Date())
  const todayDays = daysB(vs, todayStr)
  const todayPx = todayDays * ppd

  // Navigation
  const nav = useCallback((d: -1 | 1) => { setVs(v => addD(v, d * meta.shiftDays)); setVe(v => addD(v, d * meta.shiftDays)) }, [meta.shiftDays])

  // Zoom
  const zoomIn = useCallback(() => setSettings(s => ({ ...s, zoomFactor: Math.min(4, s.zoomFactor * 1.25) })), [setSettings])
  const zoomOut = useCallback(() => setSettings(s => ({ ...s, zoomFactor: Math.max(0.25, s.zoomFactor / 1.25) })), [setSettings])

  // Fit all — calculate zoom factor to show entire date range in viewport
  const fitAll = useCallback(() => {
    if (!scrollRef.current || totalDays === 0) return
    const viewportW = scrollRef.current.clientWidth - pw
    if (viewportW <= 0) return
    const newPpd = viewportW / totalDays
    const newZoom = newPpd / meta.pxPerDay
    setSettings(s => ({ ...s, zoomFactor: Math.max(0.1, Math.min(6, newZoom)) }))
  }, [totalDays, pw, ppd, setSettings])

  // Resize
  const handleResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); resizing.current = true; const sx = e.clientX; const sw = pw
    const onM = (ev: MouseEvent) => { if (!resizing.current) return; setPw(Math.max(160, Math.min(500, sw + ev.clientX - sx))) }
    const onU = () => { resizing.current = false; window.removeEventListener('mousemove', onM); window.removeEventListener('mouseup', onU) }
    window.addEventListener('mousemove', onM); window.addEventListener('mouseup', onU)
  }, [pw])

  // Drag-scroll
  const handleGrab = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return; e.preventDefault()
    const sx = e.clientX; const sl = scrollRef.current.scrollLeft
    const onM = (ev: MouseEvent) => { if (scrollRef.current) scrollRef.current.scrollLeft = sl - (ev.clientX - sx) }
    const onU = () => { window.removeEventListener('mousemove', onM); window.removeEventListener('mouseup', onU) }
    window.addEventListener('mousemove', onM); window.addEventListener('mouseup', onU)
  }, [])

  const toggle = useCallback((id: string) => { setExp(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n }) }, [])

  const rowH = barH + 8

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0 flex-wrap">
        <div className="flex items-center gap-0.5 mr-2">
          {(Object.keys(SCALE_META) as TimeScale[]).map(s => (
            <button key={s} onClick={() => setScale(s)} className={cn('px-2 py-0.5 rounded text-xs font-medium', scale === s ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {SCALE_META[s].label}
            </button>
          ))}
        </div>

        <button onClick={() => nav(-1)} className="p-1 rounded hover:bg-accent text-muted-foreground"><ChevronLeft size={14} /></button>

        {/* Date range — double-click to open picker */}
        <span
          className="text-xs text-muted-foreground tabular-nums whitespace-nowrap cursor-pointer hover:text-foreground"
          onDoubleClick={() => setShowDatePicker(true)}
          title="Double-clic pour choisir la plage"
        >
          {new Date(vs).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
          {' — '}
          {new Date(ve).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>

        <button onClick={() => nav(1)} className="p-1 rounded hover:bg-accent text-muted-foreground"><ChevronRight size={14} /></button>

        {/* Zoom controls */}
        <div className="flex items-center gap-0.5 ml-2 border-l border-border pl-2">
          <button onClick={zoomOut} className="p-1 rounded hover:bg-accent text-muted-foreground text-xs font-bold" title="Zoom arrière">−</button>
          <span className="text-[9px] tabular-nums text-muted-foreground w-8 text-center">{Math.round(zoomFactor * 100)}%</span>
          <button onClick={zoomIn} className="p-1 rounded hover:bg-accent text-muted-foreground text-xs font-bold" title="Zoom avant">+</button>
          <button onClick={fitAll} className="px-1.5 py-0.5 rounded hover:bg-accent text-[9px] text-muted-foreground" title="Ajuster tout à la vue">Fit</button>
        </div>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(v => !v)}
          className={cn('p-1 rounded hover:bg-accent text-muted-foreground', showSettings && 'bg-primary/10 text-primary')}
          title="Réglages d'affichage"
        >
          <Settings2 size={13} />
        </button>

        <span className="text-xs text-muted-foreground ml-auto">{projects.length} projet(s)</span>
      </div>

      {/* ── Date range picker (overlay) ─────────────────────── */}
      {showDatePicker && (
        <div className="border-b border-border px-3.5 py-2 bg-muted/30 flex items-center gap-3">
          <DateRangePicker
            startDate={vs}
            endDate={ve}
            onStartChange={v => setVs(v)}
            onEndChange={v => setVe(v)}
            startLabel="Début"
            endLabel="Fin"
          />
          <button onClick={() => setShowDatePicker(false)} className="text-xs text-primary hover:text-primary/80">Fermer</button>
        </div>
      )}

      {/* ── Settings panel ──────────────────────────────────── */}
      {showSettings && (
        <GanttSettingsPanel
          settings={settings}
          setSettings={setSettings}
          scale={scale}
          vs={vs}
          ve={ve}
          presets={getPref('gantt_presets', [] as GanttPreset[])}
          setPresets={(p) => setUserPref('gantt_presets', p)}
        />
      )}

      {/* ── Content ─────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      ) : projects.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Aucun projet</div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-auto relative">
          {/* ── Dual-row header ──────────────────────────────── */}
          <div className="sticky top-0 z-10 bg-background border-b border-border" style={{ minWidth: contentW }}>
            {/* Row 1: groups (year or month depending on scale) */}
            <div className="flex">
              <div className="sticky left-0 z-20 bg-background border-r border-border shrink-0" style={{ width: pw }}>
                <div className="h-5 flex items-center px-2">
                  <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Projet / Tâche</span>
                </div>
              </div>
              <div className="flex cursor-grab active:cursor-grabbing" onMouseDown={handleGrab}>
                {(() => {
                  let cellIdx = 0
                  return headerGroups.map(g => {
                    const w = cells.slice(cellIdx, cellIdx + g.spanCells).reduce((s, c) => s + c.days * ppd, 0)
                    cellIdx += g.spanCells
                    return (
                      <div key={g.key} className="h-5 flex items-center justify-center border-r border-border/50 text-[9px] font-semibold text-muted-foreground" style={{ width: w }}>
                        {g.label}
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
            {/* Row 2: cells (month, week, day, etc.) */}
            <div className="flex border-t border-border/30">
              <div className="sticky left-0 z-20 bg-background border-r border-border shrink-0" style={{ width: pw }}>
                <div className="h-5" />
                {/* Resize handle */}
                <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50" onMouseDown={handleResize} />
              </div>
              <div className="flex cursor-grab active:cursor-grabbing" onMouseDown={handleGrab}>
                {cells.map(c => {
                  const w = c.days * ppd
                  const isToday = c.key === todayStr
                  return (
                    <div key={c.key} className={cn('h-5 flex items-center justify-center border-r border-border/30 text-[8px] text-muted-foreground', isToday && 'bg-primary/5')} style={{ width: w }}>
                      {w > 20 ? c.label : ''}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Today line ───────────────────────────────────── */}
          {todayDays >= 0 && todayDays <= totalDays && (
            <div className="absolute top-0 bottom-0 w-[2px] bg-primary z-[15] pointer-events-none" style={{ left: pw + todayPx }} />
          )}

          {/* ── Project rows ─────────────────────────────────── */}
          {projects.map(project => {
            const isExp = exp.has(project.id)
            const gouti = isGoutiProject(project)
            const isMacro = (project.children_count ?? 0) > 0
            const color = gouti ? '#f97316' : (S_CLR[project.status] || '#9ca3af')
            const projBar = (project.start_date && project.end_date)
              ? computeBar(vs, project.start_date.split('T')[0], project.end_date.split('T')[0], ppd, totalDays)
              : null

            return (
              <div key={project.id}>
                <div className={cn('flex border-b border-border/50 hover:bg-muted/30', isMacro && 'bg-muted/10')} style={{ minWidth: contentW, height: rowH + 4 }}>
                  <div
                    className="sticky left-0 z-[5] bg-background border-r border-border shrink-0 flex items-center gap-1.5 px-2 cursor-pointer hover:bg-muted/40"
                    style={{ width: pw }}
                    onClick={() => toggle(project.id)}
                    onMouseEnter={e => setTip({ title: project.name, lines: [['Code', project.code], ['Statut', project.status], ['%', `${project.progress}%`], ...(gouti ? [['Source', 'Gouti'] as [string, string]] : [])], x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTip(null)}
                  >
                    <ChevronDown size={10} className={cn('text-muted-foreground transition-transform shrink-0', !isExp && '-rotate-90')} />
                    {isMacro && <Layers size={10} className="text-primary shrink-0" />}
                    {gouti && <Download size={9} className="text-orange-500 shrink-0" />}
                    <span className="text-[10px] font-medium truncate">{project.code}</span>
                    <span className="text-[9px] text-muted-foreground truncate">{project.name}</span>
                  </div>
                  <div className="relative flex-1" style={{ minWidth: totalPx }}>
                    {projBar && (
                      <div
                        onClick={() => open({ type: 'detail', module: 'projets', id: project.id })}
                        className="absolute rounded-sm cursor-pointer hover:brightness-110 flex items-center px-1 text-white text-[8px] font-medium truncate"
                        style={{ left: projBar.left, width: projBar.width, top: (rowH + 4 - barH - 2) / 2, height: barH + 2, backgroundColor: color }}
                      >
                        {showLabels && <span className="truncate">{project.progress}%</span>}
                      </div>
                    )}
                  </div>
                </div>
                {isExp && <ExpandedTasks project={project} ppd={ppd} vs={vs} totalPx={totalPx} pw={pw} settings={settings} />}
              </div>
            )
          })}
        </div>
      )}
      {tip && <Tip {...tip} />}
    </div>
  )
}
