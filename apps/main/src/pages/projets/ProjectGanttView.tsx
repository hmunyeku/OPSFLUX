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
  Milestone, Layers, Download, Settings2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useProjects, useProjectTasks, useProjectMilestones, useProjectCpm } from '@/hooks/useProjets'
import { projetsService, isGoutiProject } from '@/services/projetsService'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useToast } from '@/components/ui/Toast'
import type { Project, ProjectTask } from '@/types/api'

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
const SETTINGS_KEY = 'opsflux:gantt-settings'
interface GanttSettings { barH: number; showLabels: boolean; zoomFactor: number }
const DEFAULT_SETTINGS: GanttSettings = { barH: 18, showLabels: true, zoomFactor: 1.0 }
function loadSettings(): GanttSettings { try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } } catch { return DEFAULT_SETTINGS } }
function saveSettings(s: GanttSettings) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch {} }

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

function ExpandedTasks({ project, ppd, vs, totalPx, pw, barH, showLabels }: {
  project: Project; ppd: number; vs: string; totalPx: number; pw: number; barH: number; showLabels: boolean
}) {
  const { data: tasks } = useProjectTasks(project.id)
  const { data: milestones } = useProjectMilestones(project.id)
  const { data: cpm } = useProjectCpm(project.id)
  const { toast } = useToast()
  const [tip, setTip] = useState<{ title: string; lines: [string, string][]; x: number; y: number } | null>(null)
  const critSet = useMemo(() => new Set(cpm?.critical_path_task_ids || []), [cpm])
  const rowH = barH + 8

  const tree = useMemo(() => {
    const m = new Map<string | null, ProjectTask[]>()
    for (const t of (tasks || [])) { const k = t.parent_id ?? null; if (!m.has(k)) m.set(k, []); m.get(k)!.push(t) }
    for (const a of m.values()) a.sort((x, y) => (x.order ?? 0) - (y.order ?? 0))
    return m
  }, [tasks])

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
      toast({ title: 'Tâche replanifiée', variant: 'success' })
    } catch { toast({ title: 'Erreur', variant: 'error' }) }
  }, [project.id, toast, ppd, vs])

  const renderTask = (task: ProjectTask, depth: number): React.ReactNode[] => {
    const children = tree.get(task.id) || []
    const isCrit = critSet.has(task.id)
    const clr = T_CLR[task.status] || '#9ca3af'
    const bar = (task.start_date && task.due_date)
      ? computeBar(vs, task.start_date.split('T')[0], task.due_date.split('T')[0], ppd, totalPx / ppd)
      : null
    const nodes: React.ReactNode[] = []
    nodes.push(
      <div key={task.id} className="flex border-b border-border/20" style={{ minWidth: pw + totalPx, height: rowH }}>
        <div
          className="sticky left-0 z-[5] bg-background border-r border-border flex items-center gap-1 text-[10px] truncate shrink-0 hover:bg-muted/30 px-1"
          style={{ width: pw, paddingLeft: `${10 + depth * 14}px` }}
          onMouseEnter={e => setTip({ title: task.title, lines: [['Statut', task.status], ['%', `${task.progress}%`], ...(task.assignee_name ? [['Resp.', task.assignee_name] as [string, string]] : []), ...(task.estimated_hours ? [['Charge', `${task.estimated_hours}h`] as [string, string]] : [])], x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setTip(null)}
        >
          {children.length > 0 && <ChevronDown size={8} className="text-muted-foreground shrink-0" />}
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: clr }} />
          <span className={cn('truncate', task.status === 'done' && 'line-through text-muted-foreground')}>{task.title}</span>
          {isCrit && <span className="text-[7px] px-0.5 rounded bg-red-500/10 text-red-500 shrink-0">CPM</span>}
        </div>
        <div data-bar-area className="relative flex-1" style={{ minWidth: totalPx }} onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
          {bar && (
            <div
              draggable
              onDragStart={e => { e.dataTransfer.setData('application/ptask', JSON.stringify({ id: task.id, s: task.start_date!.split('T')[0], e: task.due_date!.split('T')[0] })); e.dataTransfer.effectAllowed = 'move' }}
              onMouseEnter={e => setTip({ title: task.title, lines: [['Statut', task.status], ['%', `${task.progress}%`]], x: e.clientX, y: e.clientY })}
              onMouseMove={e => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
              onMouseLeave={() => setTip(null)}
              className={cn('absolute rounded-sm cursor-move text-white text-[7px] font-medium truncate px-0.5 flex items-center hover:brightness-110', isCrit && 'ring-1 ring-red-500')}
              style={{ left: bar.left, width: bar.width, top: (rowH - barH) / 2, height: barH, backgroundColor: clr, opacity: task.status === 'todo' ? 0.5 : 1 }}
            >
              {showLabels && <span className="truncate">{task.title}</span>}
            </div>
          )}
        </div>
      </div>
    )
    for (const ch of children) nodes.push(...renderTask(ch, depth + 1))
    return nodes
  }

  const roots = tree.get(null) || []
  // Orphans: tasks whose parent_id doesn't exist in the task set.
  // Skip tasks already reachable from the roots to prevent double-render.
  const rendered = new Set<string>()
  const markRendered = (id: string) => { rendered.add(id); for (const ch of (tree.get(id) || [])) markRendered(ch.id) }
  for (const r of roots) markRendered(r.id)
  const orphans = (tasks || []).filter(t => !rendered.has(t.id))

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
      {tip && <Tip {...tip} />}
    </>
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
  const [settings, setSettingsRaw] = useState(loadSettings)
  const setSettings = useCallback((fn: (s: GanttSettings) => GanttSettings) => {
    setSettingsRaw(prev => { const next = fn(prev); saveSettings(next); return next })
  }, [])
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
        <div className="border-b border-border px-3.5 py-2 bg-muted/30 flex items-center gap-4 text-xs flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Hauteur barres:</span>
            <input type="range" min="8" max="32" step="2" value={barH} onChange={e => setSettings(s => ({ ...s, barH: Number(e.target.value) }))} className="w-[100px]" />
            <span className="tabular-nums text-muted-foreground w-6">{barH}px</span>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showLabels} onChange={e => setSettings(s => ({ ...s, showLabels: e.target.checked }))} className="w-3 h-3" />
            <span className="text-muted-foreground">Noms sur les barres</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Zoom:</span>
            <input type="range" min="25" max="400" step="5" value={Math.round(zoomFactor * 100)} onChange={e => setSettings(s => ({ ...s, zoomFactor: Number(e.target.value) / 100 }))} className="w-[100px]" />
            <span className="tabular-nums text-muted-foreground w-8">{Math.round(zoomFactor * 100)}%</span>
          </div>
        </div>
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
          {todayDays >= 0 && todayPx < totalPx && (
            <div className="absolute top-0 bottom-0 w-px bg-primary/60 z-[15] pointer-events-none" style={{ left: pw + todayPx }} />
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
                {isExp && <ExpandedTasks project={project} ppd={ppd} vs={vs} totalPx={totalPx} pw={pw} barH={barH} showLabels={showLabels} />}
              </div>
            )
          })}
        </div>
      )}
      {tip && <Tip {...tip} />}
    </div>
  )
}
