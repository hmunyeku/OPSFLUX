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
const daysB = (a: string, b: string) => Math.max(0, Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000))
const addD = (s: string, n: number) => { const d = new Date(s); d.setDate(d.getDate() + n); return toISO(d) }

const S_CLR: Record<string, string> = { draft: '#9ca3af', planned: '#60a5fa', active: '#22c55e', on_hold: '#fbbf24', completed: '#10b981', cancelled: '#ef4444' }
const T_CLR: Record<string, string> = { todo: '#9ca3af', in_progress: '#3b82f6', review: '#eab308', done: '#22c55e', cancelled: '#ef4444' }

const BAR_HEIGHT_KEY = 'opsflux:gantt-bar-height'
function loadBarHeight(): number { try { return Number(localStorage.getItem(BAR_HEIGHT_KEY)) || 18 } catch { return 18 } }
function saveBarHeight(h: number) { try { localStorage.setItem(BAR_HEIGHT_KEY, String(h)) } catch {} }

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

function ExpandedTasks({ project, ppd, vs, totalPx, pw, barH }: {
  project: Project; ppd: number; vs: string; totalPx: number; pw: number; barH: number
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
    let barLeft = -1; let barWidth = 0
    if (task.start_date && task.due_date) {
      const s = daysB(vs, task.start_date.split('T')[0])
      const e = daysB(vs, task.due_date.split('T')[0])
      if (e >= 0 && s < totalPx / ppd) {
        barLeft = Math.max(0, s) * ppd
        barWidth = Math.max(ppd, (Math.min(e, totalPx / ppd) - Math.max(0, s) + 1) * ppd)
      }
    }
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
          {barLeft >= 0 && (
            <div
              draggable
              onDragStart={e => { e.dataTransfer.setData('application/ptask', JSON.stringify({ id: task.id, s: task.start_date!.split('T')[0], e: task.due_date!.split('T')[0] })); e.dataTransfer.effectAllowed = 'move' }}
              onMouseEnter={e => setTip({ title: task.title, lines: [['Statut', task.status], ['%', `${task.progress}%`]], x: e.clientX, y: e.clientY })}
              onMouseMove={e => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
              onMouseLeave={() => setTip(null)}
              className={cn('absolute rounded-sm cursor-move text-white text-[7px] font-medium truncate px-0.5 flex items-center hover:brightness-110', isCrit && 'ring-1 ring-red-500')}
              style={{ left: barLeft, width: barWidth, top: (rowH - barH) / 2, height: barH, backgroundColor: clr, opacity: task.status === 'todo' ? 0.5 : 1 }}
            >
              <span className="truncate">{task.title}</span>
            </div>
          )}
        </div>
      </div>
    )
    for (const ch of children) nodes.push(...renderTask(ch, depth + 1))
    return nodes
  }

  const roots = tree.get(null) || []
  const knownIds = new Set((tasks || []).map(t => t.id))
  const orphans = (tasks || []).filter(t => t.parent_id && !knownIds.has(t.parent_id))

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
  const [barH, setBarH] = useState(loadBarHeight)
  const [exp, setExp] = useState<Set<string>>(new Set())
  const [tip, setTip] = useState<{ title: string; lines: [string, string][]; x: number; y: number } | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const resizing = useRef(false)

  const meta = SCALE_META[scale]
  const projects = pd?.items ?? []

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
  const totalPx = totalDays * meta.pxPerDay
  const contentW = pw + totalPx

  // Today line
  const todayStr = toISO(new Date())
  const todayDays = daysB(vs, todayStr)
  const todayPx = todayDays * meta.pxPerDay

  // Navigation
  const nav = useCallback((d: -1 | 1) => { setVs(v => addD(v, d * meta.shiftDays)); setVe(v => addD(v, d * meta.shiftDays)) }, [meta.shiftDays])

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

        {/* Settings (bar height) */}
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
        <div className="border-b border-border px-3.5 py-2 bg-muted/30 flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">Hauteur des barres:</span>
          <input
            type="range" min="10" max="32" step="2" value={barH}
            onChange={e => { const v = Number(e.target.value); setBarH(v); saveBarHeight(v) }}
            className="w-[120px]"
          />
          <span className="tabular-nums text-muted-foreground">{barH}px</span>
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
                    const w = cells.slice(cellIdx, cellIdx + g.spanCells).reduce((s, c) => s + c.days * meta.pxPerDay, 0)
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
                  const w = c.days * meta.pxPerDay
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
            let barLeft = -1; let barWidth = 0
            if (project.start_date && project.end_date) {
              const s = daysB(vs, project.start_date.split('T')[0])
              const e = daysB(vs, project.end_date.split('T')[0])
              if (e >= 0 && s * meta.pxPerDay < totalPx) {
                barLeft = Math.max(0, s) * meta.pxPerDay
                barWidth = Math.max(meta.pxPerDay, (Math.min(e, totalPx / meta.pxPerDay) - Math.max(0, s) + 1) * meta.pxPerDay)
              }
            }

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
                    {barLeft >= 0 && (
                      <div
                        onClick={() => open({ type: 'detail', module: 'projets', id: project.id })}
                        className="absolute rounded-sm cursor-pointer hover:brightness-110 flex items-center px-1 text-white text-[8px] font-medium truncate"
                        style={{ left: barLeft, width: barWidth, top: (rowH + 4 - barH - 2) / 2, height: barH + 2, backgroundColor: color }}
                      >
                        <span className="truncate">{project.progress}%</span>
                      </div>
                    )}
                  </div>
                </div>
                {isExp && <ExpandedTasks project={project} ppd={meta.pxPerDay} vs={vs} totalPx={totalPx} pw={pw} barH={barH} />}
              </div>
            )
          })}
        </div>
      )}
      {tip && <Tip {...tip} />}
    </div>
  )
}
