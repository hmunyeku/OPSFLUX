/**
 * TaskTable — reusable editable table for ProjectTask rows.
 *
 * Designed to render a tight, scannable table with inline cell editing
 * and a deterministic column layout. Used in:
 *   - the project detail panel (Tâches tab)
 *   - the fullscreen Table + Gantt split (TaskTableFullscreen)
 *   - cross-project spreadsheet views (later)
 *   - PDF export (later, with `density="compact"`)
 *
 * Features (V1):
 *   - Inline editable cells: title, start_date, due_date, duration,
 *     progress (0-100), assignee.
 *   - Status icon click cycles to next status.
 *   - Hierarchy via parent_id with chevron expand/collapse and indent.
 *   - Sticky header, virtualisation skipped for now (we paginate by
 *     `maxRows` in the parent if needed).
 *   - Per-row "..." action button -> opens the advanced editor passed
 *     via `onOpenAdvanced` prop (the parent owns the modal).
 *   - Météo column derived from progress vs schedule.
 *
 * Out of scope V1 (will land in V2):
 *   - Predecessors cell (multi-select popover with task search).
 *   - Drag reorder.
 *   - Multi-row selection + bulk actions.
 *   - Column resize / hide via header menu.
 */
import { useMemo, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import {
  ChevronRight, MoreHorizontal, Sun, Cloud, CloudRain, CloudLightning,
  CalendarClock, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProjectTask } from '@/types/api'
import { useUpdateProjectTask } from '@/hooks/useProjets'

// ──────────────────────────────────────────────────────────────────────
// Public column model
// ──────────────────────────────────────────────────────────────────────

export type TaskTableColumnId =
  | 'wbs'
  | 'status'
  | 'title'
  | 'start_date'
  | 'due_date'
  | 'duration'
  | 'progress'
  | 'meteo'
  | 'planner'
  | 'assignee'
  | 'actions'

export interface TaskTableColumn {
  id: TaskTableColumnId
  /** Width applied to the grid template; `auto` and `1fr` allowed. */
  width: string
  /** Header label; not shown for icon-only columns. */
  label?: string
  /** Right-align numeric columns. */
  align?: 'left' | 'right' | 'center'
  /** Hide the column when the container is below this many pixels.
   *  Used to make the table responsive without horizontal scroll. */
  hideBelow?: number
}

export const DEFAULT_COLUMNS: TaskTableColumn[] = [
  { id: 'wbs',          width: '56px',          label: 'WBS',                                hideBelow: 540 },
  { id: 'status',       width: '24px' },
  { id: 'title',        width: 'minmax(120px, 1fr)', label: 'Tâche' },
  { id: 'start_date',   width: '74px',          label: 'Début',     align: 'right',          hideBelow: 380 },
  { id: 'due_date',     width: '74px',          label: 'Fin',       align: 'right' },
  { id: 'duration',     width: '46px',          label: 'Dur.',      align: 'right',          hideBelow: 460 },
  { id: 'progress',     width: '52px',          label: '%',         align: 'right' },
  { id: 'meteo',        width: '24px',          label: '',          align: 'center',         hideBelow: 360 },
  { id: 'planner',      width: '34px',          label: '',          align: 'center',         hideBelow: 320 },
  { id: 'assignee',     width: '110px',         label: 'Assigné',                            hideBelow: 720 },
  { id: 'actions',      width: '28px',          label: '',          align: 'center' },
]

// ──────────────────────────────────────────────────────────────────────
// Helpers (pure)
// ──────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
}

function dateInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.split('T')[0]
}

function computeDurationDays(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const s = new Date(start); const e = new Date(end)
  const d = Math.round((e.getTime() - s.getTime()) / 86_400_000)
  return d >= 0 ? d + 1 : null
}

/** Add `days` to an ISO date and return ISO at day-precision. */
function addDays(iso: string, days: number): string {
  const d = new Date(iso); d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function isOverdue(task: ProjectTask): boolean {
  if (!task.due_date) return false
  if (task.status === 'done' || task.status === 'cancelled') return false
  const d = new Date(task.due_date); const today = new Date(); today.setHours(0, 0, 0, 0)
  return d < today
}

type Weather = 'sunny' | 'cloudy' | 'rainy' | 'stormy' | null

function computeWeather(task: ProjectTask, displayProgress: number): Weather {
  if (task.status === 'cancelled') return null
  if (task.status === 'done') return 'sunny'
  if (!task.due_date) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(task.due_date); due.setHours(0, 0, 0, 0)
  if (today > due && displayProgress < 100) return 'stormy'
  const start = task.start_date ? new Date(task.start_date) : null
  if (start) start.setHours(0, 0, 0, 0)
  let expected = 0
  if (start && due > start) {
    if (today <= start) expected = 0
    else if (today >= due) expected = 100
    else expected = ((today.getTime() - start.getTime()) / (due.getTime() - start.getTime())) * 100
  } else {
    expected = today >= due ? 100 : 0
  }
  const delta = displayProgress - expected
  if (delta < -25) return 'rainy'
  if (delta < -10) return 'cloudy'
  return 'sunny'
}

// Status icon (SVG-free, light) — keeps the table self-contained.
function StatusDot({ status }: { status: ProjectTask['status'] }) {
  const cls = cn(
    'w-2.5 h-2.5 rounded-full ring-1 ring-inset',
    status === 'done' && 'bg-green-500 ring-green-600',
    status === 'in_progress' && 'bg-primary ring-primary/70',
    status === 'review' && 'bg-yellow-500 ring-yellow-600',
    status === 'cancelled' && 'bg-zinc-400 ring-zinc-500',
    status === 'todo' && 'bg-transparent ring-muted-foreground/60',
  )
  return <span className={cls} />
}

const STATUS_CYCLE: ProjectTask['status'][] = ['todo', 'in_progress', 'review', 'done', 'cancelled']
function nextStatus(s: ProjectTask['status']): ProjectTask['status'] {
  const i = STATUS_CYCLE.indexOf(s)
  return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length]
}

// ──────────────────────────────────────────────────────────────────────
// Editable cell primitives
// ──────────────────────────────────────────────────────────────────────

/**
 * EditableCell — generic cell that toggles between display and editor.
 *
 * The display child receives the current value and onClick to enter
 * edit mode. The editor child receives the current value, a setter
 * (controlled), and `commit` / `cancel` callbacks. We commit on Enter
 * or blur, cancel on Escape.
 */
function EditableText({
  value, placeholder, onCommit, className, displayClassName, multiline = false,
}: {
  value: string
  placeholder?: string
  onCommit: (next: string) => void
  className?: string
  displayClassName?: string
  multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const commit = () => {
    setEditing(false)
    if (draft !== value) onCommit(draft)
  }
  const cancel = () => { setDraft(value); setEditing(false) }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        className={cn(
          'w-full text-left truncate hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 transition-colors',
          !value && 'text-muted-foreground italic',
          displayClassName,
        )}
        title="Cliquer pour éditer"
      >
        {value || placeholder || '—'}
      </button>
    )
  }

  const Editor = multiline ? 'textarea' : 'input'
  return (
    <Editor
      ref={ref as never}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !multiline) { e.preventDefault(); commit() }
        if (e.key === 'Escape') { e.preventDefault(); cancel() }
      }}
      className={cn(
        'w-full bg-card border border-primary/40 rounded px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/40',
        className,
      )}
    />
  )
}

function EditableDate({
  value, onCommit, className,
}: {
  value: string | null
  onCommit: (next: string | null) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(dateInputValue(value))
  const ref = useRef<HTMLInputElement | null>(null)

  useEffect(() => { if (!editing) setDraft(dateInputValue(value)) }, [value, editing])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        className={cn(
          'w-full text-right truncate hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 transition-colors text-[10px] tabular-nums',
          !value && 'text-muted-foreground/60 italic',
          className,
        )}
        title={value ? `Cliquer pour modifier (${dateInputValue(value)})` : 'Cliquer pour définir'}
      >
        {fmtDate(value) || '—'}
      </button>
    )
  }

  return (
    <input
      ref={ref}
      type="date"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false)
        const next = draft || null
        if (next !== value?.split('T')[0]) onCommit(next)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); setDraft(dateInputValue(value)); setEditing(false) }
      }}
      className="w-full bg-card border border-primary/40 rounded px-1 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/40"
    />
  )
}

function EditableNumber({
  value, min, max, onCommit, suffix, className, readOnly, readOnlyTitle,
}: {
  value: number | null
  min?: number
  max?: number
  onCommit: (next: number | null) => void
  suffix?: string
  className?: string
  /** When true the value is shown but cannot be edited — used for
   *  parent-task progress which is server-computed from the children
   *  (see audit B3). */
  readOnly?: boolean
  readOnlyTitle?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value?.toString() ?? '')
  const ref = useRef<HTMLInputElement | null>(null)

  useEffect(() => { if (!editing) setDraft(value?.toString() ?? '') }, [value, editing])
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select() } }, [editing])

  const commit = () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed === '') { if (value !== null) onCommit(null); return }
    const n = Number(trimmed)
    if (Number.isNaN(n)) return
    let clamped = n
    if (min != null) clamped = Math.max(min, clamped)
    if (max != null) clamped = Math.min(max, clamped)
    if (clamped !== value) onCommit(clamped)
  }

  if (!editing) {
    if (readOnly) {
      return (
        <span
          className={cn(
            'w-full text-right truncate px-1 -mx-1 py-0.5 text-[10px] tabular-nums cursor-not-allowed',
            value == null && 'text-muted-foreground/60 italic',
            className,
          )}
          title={readOnlyTitle ?? 'Calculé automatiquement à partir des sous-tâches'}
        >
          {value == null ? '—' : `${value}${suffix ?? ''}`}
        </span>
      )
    }
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        className={cn(
          'w-full text-right truncate hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 transition-colors text-[10px] tabular-nums',
          value == null && 'text-muted-foreground/60 italic',
          className,
        )}
        title="Cliquer pour éditer"
      >
        {value == null ? '—' : `${value}${suffix ?? ''}`}
      </button>
    )
  }

  return (
    <input
      ref={ref}
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') { e.preventDefault(); setDraft(value?.toString() ?? ''); setEditing(false) }
      }}
      className="w-full bg-card border border-primary/40 rounded px-1 py-0.5 text-[10px] tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-primary/40"
    />
  )
}

// ──────────────────────────────────────────────────────────────────────
// Public props
// ──────────────────────────────────────────────────────────────────────

export interface TaskTableProps {
  tasks: ProjectTask[]
  projectId: string
  /** Override the column set (visibility + width). Defaults to DEFAULT_COLUMNS. */
  columns?: TaskTableColumn[]
  /** Show parent/child indent and chevrons. Defaults to true. */
  hierarchical?: boolean
  /** Hide all decorations (headers, hover) for PDF / dense exports. */
  density?: 'compact' | 'comfortable'
  /** Constrain table height; pass `'auto'` to let it grow. */
  maxHeight?: string | number
  /** Open the advanced editor for a task. Parent owns the modal. */
  onOpenAdvanced?: (task: ProjectTask) => void
  /** Callback when a task is clicked (single click on the row body — not on a cell editor). */
  onRowClick?: (task: ProjectTask) => void
  /** Currently selected task id — receives a primary highlight. Drives
   *  the contextual toolbar actions in the parent (indent, +after, …). */
  selectedTaskId?: string | null
  /** Called when the user clicks anywhere on the row body. Use this
   *  to lift selection to the parent. */
  onSelect?: (taskId: string) => void
  /** Optional className for the wrapping element. */
  className?: string
}

// ──────────────────────────────────────────────────────────────────────
// TaskTable
// ──────────────────────────────────────────────────────────────────────

export function TaskTable({
  tasks,
  projectId,
  columns = DEFAULT_COLUMNS,
  hierarchical = true,
  density = 'comfortable',
  maxHeight,
  onOpenAdvanced,
  onRowClick,
  selectedTaskId,
  onSelect,
  className,
}: TaskTableProps) {
  const updateTask = useUpdateProjectTask()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Track container width via ResizeObserver so we can hide columns
  // tagged with `hideBelow`. Keeps the table inside its parent without
  // horizontal scroll on narrow screens (panel docked, mobile, etc.).
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState<number>(9999)
  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setContainerWidth(e.contentRect.width)
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  // Filter the column set against the current container width.
  const visibleColumns = useMemo(
    () => columns.filter(c => !c.hideBelow || containerWidth >= c.hideBelow),
    [columns, containerWidth],
  )

  // Build hierarchy index (parent -> children, ordered by `order`).
  const tree = useMemo(() => {
    const byParent = new Map<string | null, ProjectTask[]>()
    for (const t of tasks) {
      const k = t.parent_id ?? null
      if (!byParent.has(k)) byParent.set(k, [])
      byParent.get(k)!.push(t)
    }
    for (const arr of byParent.values()) arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    return byParent
  }, [tasks])

  // Per-task display progress.
  //
  // Bug fix (audit C2): the previous implementation computed a naive
  // arithmetic mean of direct children, which DIVERGED from the
  // backend's weighted average (Project.progress_weight_method:
  // equal | effort | duration | manual — see _update_project_progress
  // in app/api/routes/modules/projets.py). Result: the % shown in the
  // table differed from the % persisted server-side after a reload.
  //
  // Fix: trust the server. The backend recomputes parent progress on
  // every task mutation and writes it to ProjectTask.progress. We just
  // surface that value as-is; the only fallback is for transient cases
  // where the server hasn't refreshed yet (still 0 from creation).
  const aggregateProgress = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) {
      map.set(t.id, t.progress ?? 0)
    }
    return map
  }, [tasks])

  // Flatten to a render order respecting collapse state.
  const flatRows = useMemo(() => {
    const out: { task: ProjectTask; depth: number; hasChildren: boolean }[] = []
    const walk = (parent: string | null, depth: number) => {
      const children = tree.get(parent) || []
      for (const t of children) {
        const subs = tree.get(t.id) || []
        out.push({ task: t, depth, hasChildren: subs.length > 0 })
        if (subs.length > 0 && !collapsed.has(t.id)) walk(t.id, depth + 1)
      }
    }
    if (hierarchical) {
      walk(null, 0)
      // Orphans (parent_id pointing outside the loaded set)
      const known = new Set(tasks.map(t => t.id))
      for (const t of tasks) {
        if (t.parent_id && !known.has(t.parent_id)) {
          out.push({ task: t, depth: 0, hasChildren: false })
        }
      }
    } else {
      for (const t of tasks) out.push({ task: t, depth: 0, hasChildren: false })
    }
    return out
  }, [tasks, tree, collapsed, hierarchical])

  const toggleCollapse = useCallback((taskId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId)
      return next
    })
  }, [])

  const handleStatusClick = (task: ProjectTask) => {
    updateTask.mutate({ projectId, taskId: task.id, payload: { status: nextStatus(task.status) } })
  }

  const handleField = (task: ProjectTask, field: string, value: unknown) => {
    updateTask.mutate({ projectId, taskId: task.id, payload: { [field]: value } as never })
  }

  // Adjust due_date when duration is edited (keeps start_date stable).
  const handleDuration = (task: ProjectTask, days: number | null) => {
    if (!task.start_date || days == null) return
    // duration is inclusive — n days means due_date = start_date + (n-1) days
    const due = addDays(task.start_date, days - 1)
    updateTask.mutate({ projectId, taskId: task.id, payload: { due_date: due } })
  }

  // Build the CSS grid template from the visible column widths.
  const gridTemplate = visibleColumns.map(c => c.width).join(' ')
  const rowHeight = density === 'compact' ? 'h-7' : 'h-8'

  return (
    <div
      ref={wrapRef}
      className={cn(
        'border border-border rounded-md overflow-hidden bg-card/30 flex flex-col',
        className,
      )}
      style={{ maxHeight }}
    >
      {/* Header */}
      <div
        className="grid items-center gap-1 px-2 py-1 bg-muted/50 border-b border-border text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {visibleColumns.map(col => (
          <div
            key={col.id}
            className={cn(
              'truncate',
              col.align === 'right' && 'text-right',
              col.align === 'center' && 'text-center',
            )}
          >
            {col.label ?? ''}
          </div>
        ))}
      </div>

      {/* Body */}
      <div
        data-tasktable-body
        className="overflow-auto flex-1 min-h-0"
        style={{ maxHeight: maxHeight ? undefined : 'none' }}
      >
        {flatRows.length === 0 ? (
          <div className="text-[11px] text-muted-foreground italic p-3 text-center">
            Aucune tâche.
          </div>
        ) : (
          flatRows.map(({ task, depth, hasChildren }) => (
            <TaskTableRow
              key={task.id}
              task={task}
              depth={depth}
              hasChildren={hasChildren}
              isCollapsed={collapsed.has(task.id)}
              isSelected={selectedTaskId === task.id}
              columns={visibleColumns}
              gridTemplate={gridTemplate}
              rowHeight={rowHeight}
              displayProgress={aggregateProgress.get(task.id) ?? task.progress ?? 0}
              onToggleCollapse={() => toggleCollapse(task.id)}
              onStatusClick={() => handleStatusClick(task)}
              onField={(field, value) => handleField(task, field, value)}
              onDuration={(days) => handleDuration(task, days)}
              onOpenAdvanced={onOpenAdvanced ? () => onOpenAdvanced(task) : undefined}
              onRowClick={() => {
                onSelect?.(task.id)
                onRowClick?.(task)
              }}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Row
// ──────────────────────────────────────────────────────────────────────

interface RowProps {
  task: ProjectTask
  depth: number
  hasChildren: boolean
  isSelected?: boolean
  isCollapsed: boolean
  columns: TaskTableColumn[]
  gridTemplate: string
  rowHeight: string
  displayProgress: number
  onToggleCollapse: () => void
  onStatusClick: () => void
  onField: (field: string, value: unknown) => void
  onDuration: (days: number | null) => void
  onOpenAdvanced?: () => void
  onRowClick?: () => void
}

function TaskTableRow({
  task, depth, hasChildren, isCollapsed, isSelected,
  columns, gridTemplate, rowHeight, displayProgress,
  onToggleCollapse, onStatusClick, onField, onDuration,
  onOpenAdvanced, onRowClick,
}: RowProps) {
  const overdue = isOverdue(task)
  const weather = computeWeather(task, displayProgress)
  const duration = computeDurationDays(task.start_date, task.due_date)

  const WeatherIcon = weather === 'sunny' ? Sun
    : weather === 'cloudy' ? Cloud
    : weather === 'rainy' ? CloudRain
    : weather === 'stormy' ? CloudLightning
    : null
  const weatherTone = weather === 'sunny' ? 'text-amber-500'
    : weather === 'cloudy' ? 'text-zinc-400'
    : weather === 'rainy' ? 'text-blue-500'
    : weather === 'stormy' ? 'text-red-500'
    : ''

  const renderCell = (col: TaskTableColumn): ReactNode => {
    switch (col.id) {
      case 'wbs':
        return (
          <span className="truncate text-[10px] tabular-nums text-muted-foreground" title={task.code || undefined}>
            {task.code || '—'}
          </span>
        )

      case 'status':
        return (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStatusClick() }}
            className="flex items-center justify-center w-full hover:scale-110 transition-transform"
            title="Cycler le statut"
          >
            <StatusDot status={task.status} />
          </button>
        )

      case 'title':
        return (
          <div
            className="flex items-center gap-1 min-w-0"
            style={{ paddingLeft: `${depth * 12}px` }}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                title={isCollapsed ? 'Déplier' : 'Replier'}
              >
                <ChevronRight size={10} className={cn('transition-transform', !isCollapsed && 'rotate-90')} />
              </button>
            ) : (
              <span className="w-[10px] shrink-0" />
            )}
            <EditableText
              value={task.title}
              onCommit={(v) => onField('title', v)}
              displayClassName={cn(
                'text-[11px]',
                task.status === 'done' && 'line-through text-muted-foreground',
                hasChildren && 'font-medium',
              )}
            />
          </div>
        )

      case 'start_date':
        return (
          <EditableDate
            value={task.start_date}
            onCommit={(v) => onField('start_date', v)}
          />
        )

      case 'due_date':
        return (
          <EditableDate
            value={task.due_date}
            onCommit={(v) => onField('due_date', v)}
            className={overdue ? 'text-red-500 font-semibold' : undefined}
          />
        )

      case 'duration':
        // When user edits duration manually, we only adjust due_date if
        // start_date is set; otherwise we no-op (the field is read-only).
        return task.start_date ? (
          <EditableNumber
            value={duration}
            min={1}
            suffix="j"
            onCommit={(v) => onDuration(v)}
          />
        ) : (
          <span className="text-right text-[10px] text-muted-foreground/60 italic" title="Définir d'abord une date de début">
            {duration != null ? `${duration}j` : '—'}
          </span>
        )

      case 'progress':
        return (
          <EditableNumber
            value={displayProgress}
            min={0}
            max={100}
            suffix="%"
            onCommit={(v) => onField('progress', v ?? 0)}
            // Parent tasks have their progress recomputed server-side
            // from their children (weighted average per
            // Project.progress_weight_method). Editing it directly would
            // be silently overwritten by the next mutation. Lock the
            // cell with a tooltip explaining the rule.
            readOnly={hasChildren}
            readOnlyTitle="Calculé automatiquement à partir des sous-tâches (moyenne pondérée selon la méthode du projet)"
            className={cn(
              displayProgress >= 100 ? 'text-green-600' :
              overdue ? 'text-red-500' :
              displayProgress >= 50 ? 'text-primary' :
              displayProgress > 0 ? 'text-foreground/80' :
              'text-muted-foreground/60',
            )}
          />
        )

      case 'meteo':
        return WeatherIcon ? (
          <span className={cn('inline-flex items-center justify-center', weatherTone)} title={`Météo: ${weather}`}>
            <WeatherIcon size={12} />
          </span>
        ) : (
          <span className="text-muted-foreground/30">—</span>
        )

      case 'planner':
        return (task.linked_planner_count ?? 0) > 0 ? (
          <span
            className="inline-flex items-center justify-center gap-0.5 text-[9px] text-blue-600 dark:text-blue-400"
            title={`${task.linked_planner_count} activité(s) Planner liée(s)`}
          >
            <CalendarClock size={9} />
            <span className="tabular-nums">{task.linked_planner_count}</span>
          </span>
        ) : null

      case 'assignee':
        return (
          <span className="truncate text-[10px] text-muted-foreground" title={task.assignee_name || undefined}>
            {task.assignee_name || '—'}
          </span>
        )

      case 'actions':
        return onOpenAdvanced ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenAdvanced() }}
            className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Ouvrir l'éditeur avancé"
          >
            <MoreHorizontal size={11} />
          </button>
        ) : null

      default:
        return null
    }
  }

  return (
    <div
      className={cn(
        'grid items-center gap-1 px-2 border-b border-border/30 last:border-0 text-[11px] cursor-pointer',
        rowHeight,
        isSelected
          ? 'bg-primary/10 ring-1 ring-inset ring-primary/40'
          : 'hover:bg-muted/30 transition-colors',
      )}
      style={{ gridTemplateColumns: gridTemplate }}
      onClick={onRowClick}
    >
      {columns.map(col => (
        <div
          key={col.id}
          className={cn(
            'min-w-0',
            col.align === 'right' && 'text-right',
            col.align === 'center' && 'text-center',
          )}
        >
          {renderCell(col)}
        </div>
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Optional helper: small inline alert when the parent passes
// `tasks` but the project has zero — keeps consumers terse.
// ──────────────────────────────────────────────────────────────────────

export function TaskTableEmpty({ children }: { children?: ReactNode }) {
  return (
    <div className="border border-dashed border-border rounded-md p-4 text-center text-[11px] text-muted-foreground bg-muted/10">
      <AlertCircle size={14} className="mx-auto mb-1 opacity-60" />
      {children ?? 'Aucune tâche pour ce projet.'}
    </div>
  )
}
