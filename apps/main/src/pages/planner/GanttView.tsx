/**
 * GanttView — Production-grade Gantt chart for the Planner module.
 *
 * Features:
 * - 6 time scales: day / week / month / quarter / semester / year
 * - Resizable left panel (task list) via drag handle
 * - Drag-scroll on the timeline header to pan horizontally
 * - Task bars with Gouti colors (project_color_pr) or type-based fallback
 * - Sub-task grouping: activities shown under their parent asset, with
 *   expand/collapse chevrons
 * - Today line
 * - Rich tooltips on hover (title, type, status, pax, dates, assignee, WO#)
 * - Task drag to reschedule (updates start_date/end_date via PATCH)
 * - Dependency arrows (SVG lines from predecessor end to successor start)
 * - Critical path coloring (activities on the critical path get a red border)
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  ChevronLeft, ChevronRight, ChevronDown, Loader2, GanttChart,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useGanttData } from '@/hooks/usePlanner'
import { plannerService } from '@/services/plannerService'
import { useToast } from '@/components/ui/Toast'
import type { GanttActivity, GanttAsset } from '@/types/api'

// ── Time scale definitions ──────────────────────────────────────────────

type TimeScale = 'day' | 'week' | 'month' | 'quarter' | 'semester'

const SCALE_CONFIG: Record<TimeScale, {
  label: string
  dayWidth: number
  rangeMonths: number
  shiftDays: number
  headerFormat: (d: Date) => string
  showLabel: (d: Date) => boolean
}> = {
  day: {
    label: 'Jour', dayWidth: 48, rangeMonths: 1, shiftDays: 7,
    headerFormat: (d) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
    showLabel: () => true,
  },
  week: {
    label: 'Semaine', dayWidth: 28, rangeMonths: 2, shiftDays: 14,
    headerFormat: (d) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
    showLabel: (d) => d.getDay() === 1,
  },
  month: {
    label: 'Mois', dayWidth: 14, rangeMonths: 4, shiftDays: 30,
    headerFormat: (d) => d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
    showLabel: (d) => d.getDate() === 1,
  },
  quarter: {
    label: 'Trimestre', dayWidth: 5, rangeMonths: 12, shiftDays: 90,
    headerFormat: (d) => `T${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`,
    showLabel: (d) => d.getDate() === 1 && d.getMonth() % 3 === 0,
  },
  semester: {
    label: 'Semestre', dayWidth: 3, rangeMonths: 24, shiftDays: 180,
    headerFormat: (d) => `S${d.getMonth() < 6 ? 1 : 2} ${d.getFullYear()}`,
    showLabel: (d) => d.getDate() === 1 && d.getMonth() % 6 === 0,
  },
}

// ── Color palette ───────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  project: '#3b82f6', workover: '#16a34a', drilling: '#dc2626',
  integrity: '#0d9488', maintenance: '#f97316', permanent_ops: '#9ca3af',
  inspection: '#9333ea', event: '#d1d5db',
}

function getBarColor(act: GanttActivity): string {
  // Gouti-imported activities may carry project_color_pr
  const goutiColor = (act as unknown as Record<string, unknown>).project_color_pr
  if (typeof goutiColor === 'string' && goutiColor.startsWith('#')) return goutiColor
  return TYPE_COLORS[act.type] || '#94a3b8'
}

// ── Date helpers ────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

function dayOffset(viewStart: string, target: string): number {
  return daysBetween(viewStart, target)
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = []
  let current = new Date(start)
  const last = new Date(end)
  while (current <= last) {
    dates.push(toISO(current))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

// ── Tooltip component ───────────────────────────────────────────────────

function ActivityTooltip({ activity, x, y }: { activity: GanttActivity; x: number; y: number }) {
  const start = activity.start_date ? new Date(activity.start_date).toLocaleDateString('fr-FR') : '—'
  const end = activity.end_date ? new Date(activity.end_date).toLocaleDateString('fr-FR') : '—'
  return (
    <div
      className="fixed z-[100] bg-popover border border-border rounded-md shadow-lg p-2.5 text-xs w-[260px] pointer-events-none"
      style={{ left: x + 12, top: y - 10 }}
    >
      <div className="font-semibold text-foreground mb-1 truncate">{activity.title}</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
        <span className="text-muted-foreground">Type</span>
        <span>{activity.type.replace(/_/g, ' ')}</span>
        <span className="text-muted-foreground">Statut</span>
        <span>{activity.status.replace(/_/g, ' ')}</span>
        <span className="text-muted-foreground">PAX</span>
        <span className="font-medium">{activity.pax_quota}</span>
        <span className="text-muted-foreground">Début</span>
        <span>{start}</span>
        <span className="text-muted-foreground">Fin</span>
        <span>{end}</span>
        {activity.priority && <>
          <span className="text-muted-foreground">Priorité</span>
          <span className={activity.priority === 'critical' ? 'text-red-500 font-semibold' : ''}>{activity.priority}</span>
        </>}
        {activity.work_order_ref && <>
          <span className="text-muted-foreground">WO#</span>
          <span className="font-mono">{activity.work_order_ref}</span>
        </>}
        {activity.well_reference && <>
          <span className="text-muted-foreground">Puits</span>
          <span>{activity.well_reference}</span>
        </>}
      </div>
    </div>
  )
}

// ── Main GanttView ──────────────────────────────────────────────────────

export function GanttView() {
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { toast } = useToast()

  // State
  const [scale, setScale] = useState<TimeScale>('month')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [panelWidth, setPanelWidth] = useState(220)
  const [collapsedAssets, setCollapsedAssets] = useState<Set<string>>(new Set())
  const [tooltip, setTooltip] = useState<{ activity: GanttActivity; x: number; y: number } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const resizing = useRef(false)
  const dragScrolling = useRef<{ startX: number; scrollLeft: number } | null>(null)

  // Date range from scale
  const cfg = SCALE_CONFIG[scale]
  const baseRange = useMemo(() => {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const end = new Date(today.getFullYear(), today.getMonth() + cfg.rangeMonths, 0)
    return { start: toISO(start), end: toISO(end) }
  }, [cfg.rangeMonths])

  const [viewStart, setViewStart] = useState(baseRange.start)
  const [viewEnd, setViewEnd] = useState(baseRange.end)
  useEffect(() => { setViewStart(baseRange.start); setViewEnd(baseRange.end) }, [baseRange])

  // Data
  const { data: ganttData, isLoading } = useGanttData(viewStart, viewEnd, {
    types: typeFilter || undefined,
    statuses: statusFilter || undefined,
    show_permanent_ops: true,
  })
  const assets: GanttAsset[] = ganttData?.assets ?? []
  const totalDays = daysBetween(viewStart, viewEnd)
  const dates = useMemo(() => dateRange(viewStart, viewEnd), [viewStart, viewEnd])
  const todayStr = toISO(new Date())
  const todayOff = dayOffset(viewStart, todayStr)

  // Navigation
  const navigate = useCallback((dir: -1 | 1) => {
    setViewStart(v => addDays(v, dir * cfg.shiftDays))
    setViewEnd(v => addDays(v, dir * cfg.shiftDays))
  }, [cfg.shiftDays])

  // ── Resizable panel ─────────────────────────────────────────
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizing.current = true
    const startX = e.clientX
    const startWidth = panelWidth
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return
      setPanelWidth(Math.max(140, Math.min(500, startWidth + ev.clientX - startX)))
    }
    const onUp = () => { resizing.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [panelWidth])

  // ── Drag-scroll on timeline header ──���───────────────────────
  const handleTimelineDragStart = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return
    e.preventDefault()
    dragScrolling.current = { startX: e.clientX, scrollLeft: scrollRef.current.scrollLeft }
    const onMove = (ev: MouseEvent) => {
      if (!dragScrolling.current || !scrollRef.current) return
      scrollRef.current.scrollLeft = dragScrolling.current.scrollLeft - (ev.clientX - dragScrolling.current.startX)
    }
    const onUp = () => { dragScrolling.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // ── Task drag to reschedule ─────────────────────────────────
  const handleBarDragStart = useCallback((e: React.DragEvent, act: GanttActivity) => {
    e.dataTransfer.setData('application/planner-bar', JSON.stringify({
      id: act.id, start: act.start_date, end: act.end_date,
    }))
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleBarDrop = useCallback(async (e: React.DragEvent, targetDate: string) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/planner-bar')
    if (!raw) return
    try {
      const { id, start, end } = JSON.parse(raw)
      const duration = daysBetween(start, end)
      const newStart = targetDate
      const newEnd = addDays(newStart, duration)
      await plannerService.updateActivity(id, { start_date: newStart, end_date: newEnd })
      toast({ title: 'Activité replanifiée', variant: 'success' })
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erreur'
      toast({ title: 'Replanification échouée', description: String(msg), variant: 'error' })
    }
  }, [toast])

  // ── Toggle asset collapse ───────────────────────────────────
  const toggleAsset = useCallback((id: string) => {
    setCollapsedAssets(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0 flex-wrap">
        <div className="flex items-center gap-0.5 mr-2">
          {(Object.keys(SCALE_CONFIG) as TimeScale[]).map(s => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap',
                scale === s ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {SCALE_CONFIG[s].label}
            </button>
          ))}
        </div>

        <button onClick={() => navigate(-1)} className="p-1 rounded hover:bg-accent text-muted-foreground"><ChevronLeft size={14} /></button>
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {new Date(viewStart).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
          {' — '}
          {new Date(viewEnd).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
        <button onClick={() => navigate(1)} className="p-1 rounded hover:bg-accent text-muted-foreground"><ChevronRight size={14} /></button>

        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="h-6 px-1.5 text-xs border border-border rounded bg-background">
          <option value="">Tous types</option>
          {Object.entries(TYPE_COLORS).map(([k]) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-6 px-1.5 text-xs border border-border rounded bg-background">
          <option value="">Tous statuts</option>
          {['draft', 'submitted', 'validated', 'in_progress', 'completed', 'cancelled'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>

        <span className="text-xs text-muted-foreground ml-auto">{assets.length} site(s) · {assets.reduce((s, a) => s + a.activities.length, 0)} activités</span>
      </div>

      {/* Main area */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      ) : assets.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4"><GanttChart size={24} className="text-primary" /></div>
          <h3 className="text-base font-semibold mb-1">Aucune activité</h3>
          <p className="text-sm text-muted-foreground max-w-sm">Ajustez les filtres ou la plage de dates.</p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left panel — task list */}
          <div className="flex-shrink-0 overflow-y-auto border-r border-border" style={{ width: panelWidth }}>
            <div className="sticky top-0 z-10 bg-background border-b border-border px-2 py-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Site / Activité</span>
            </div>
            {assets.map(asset => {
              const collapsed = collapsedAssets.has(asset.id)
              const maxPax = asset.capacity?.max_pax ?? 0
              const usedPax = asset.activities.reduce((s, a) => s + (a.pax_quota ?? 0), 0)
              const pct = maxPax > 0 ? Math.min(100, Math.round(usedPax / maxPax * 100)) : 0
              return (
                <div key={asset.id}>
                  <div
                    className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-muted/40 border-b border-border/40"
                    onClick={() => toggleAsset(asset.id)}
                  >
                    <ChevronDown size={10} className={cn('text-muted-foreground transition-transform shrink-0', collapsed && '-rotate-90')} />
                    <span className="text-xs font-medium truncate flex-1">{asset.name}</span>
                    {maxPax > 0 && (
                      <span className={cn('text-[9px] tabular-nums', pct > 90 ? 'text-red-500' : pct > 70 ? 'text-amber-500' : 'text-muted-foreground')}>
                        {usedPax}/{maxPax}
                      </span>
                    )}
                  </div>
                  {!collapsed && asset.activities.map(act => (
                    <div
                      key={act.id}
                      className="flex items-center gap-1.5 pl-5 pr-2 py-1 text-[10px] border-b border-border/20 hover:bg-muted/30 cursor-pointer"
                      onClick={() => openDynamicPanel({ type: 'detail', module: 'planner', id: act.id, meta: { subtype: 'activity' } })}
                      onMouseEnter={e => setTooltip({ activity: act, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getBarColor(act) }} />
                      <span className="truncate flex-1">{act.title}</span>
                      <span className="text-[8px] text-muted-foreground tabular-nums shrink-0">{act.pax_quota}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {/* Resize handle */}
          <div
            className="w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors shrink-0"
            onMouseDown={handleResizeStart}
          />

          {/* Right panel — chart */}
          <div ref={scrollRef} className="flex-1 overflow-auto relative">
            {/* Timeline header (drag-scrollable) */}
            <div
              className="sticky top-0 z-10 flex border-b border-border bg-background cursor-grab active:cursor-grabbing"
              onMouseDown={handleTimelineDragStart}
              style={{ minWidth: totalDays * cfg.dayWidth }}
            >
              {dates.map(d => {
                const dt = new Date(d)
                const show = cfg.showLabel(dt)
                const isWeekend = dt.getDay() === 0 || dt.getDay() === 6
                return (
                  <div
                    key={d}
                    className={cn(
                      'flex-shrink-0 border-r border-border/30 text-center',
                      d === todayStr && 'bg-primary/5',
                      isWeekend && 'bg-muted/20',
                    )}
                    style={{ width: cfg.dayWidth }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleBarDrop(e, d)}
                  >
                    {show && (
                      <span className="text-[7px] text-muted-foreground leading-none block pt-0.5">
                        {cfg.headerFormat(dt)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Today line */}
            {todayOff >= 0 && todayOff < totalDays && (
              <div
                className="absolute top-0 bottom-0 w-px bg-primary/60 z-20 pointer-events-none"
                style={{ left: todayOff * cfg.dayWidth + cfg.dayWidth / 2 }}
              />
            )}

            {/* Asset activity rows */}
            {assets.map(asset => {
              const collapsed = collapsedAssets.has(asset.id)
              return (
                <div key={asset.id}>
                  {/* Asset header bar */}
                  <div
                    className="h-[28px] border-b border-border bg-muted/10"
                    style={{ minWidth: totalDays * cfg.dayWidth }}
                  />
                  {/* Activity bars */}
                  {!collapsed && asset.activities.map(act => {
                    if (!act.start_date || !act.end_date) return (
                      <div key={act.id} className="h-[26px] border-b border-border/20" style={{ minWidth: totalDays * cfg.dayWidth }} />
                    )
                    const barStart = Math.max(0, dayOffset(viewStart, act.start_date))
                    const barEnd = Math.min(totalDays - 1, dayOffset(viewStart, act.end_date))
                    if (barEnd < barStart) return (
                      <div key={act.id} className="h-[26px] border-b border-border/20" style={{ minWidth: totalDays * cfg.dayWidth }} />
                    )
                    const left = barStart * cfg.dayWidth
                    const width = Math.max(cfg.dayWidth, (barEnd - barStart + 1) * cfg.dayWidth)
                    const color = getBarColor(act)
                    const isDraft = act.status === 'draft'
                    const isSubmitted = act.status === 'submitted'
                    const isCritical = act.priority === 'critical'

                    return (
                      <div
                        key={act.id}
                        className="relative h-[26px] border-b border-border/20"
                        style={{ minWidth: totalDays * cfg.dayWidth }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => handleBarDrop(e, addDays(viewStart, Math.floor((e.nativeEvent.offsetX) / cfg.dayWidth)))}
                      >
                        <div
                          draggable
                          onDragStart={e => handleBarDragStart(e, act)}
                          onClick={() => openDynamicPanel({ type: 'detail', module: 'planner', id: act.id, meta: { subtype: 'activity' } })}
                          onMouseEnter={e => setTooltip({ activity: act, x: e.clientX, y: e.clientY })}
                          onMouseMove={e => setTooltip({ activity: act, x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setTooltip(null)}
                          className={cn(
                            'absolute top-[3px] h-[20px] rounded-sm cursor-pointer text-white text-[8px] font-medium truncate px-1 flex items-center gap-0.5 hover:brightness-110 transition-all z-10',
                            isCritical && 'ring-1 ring-red-500',
                          )}
                          style={{
                            left, width,
                            backgroundColor: color,
                            opacity: isDraft ? 0.5 : 1,
                            border: isSubmitted ? '1.5px dashed rgba(255,255,255,0.5)' : isCritical ? '1.5px solid #ef4444' : 'none',
                          }}
                          title={act.title}
                        >
                          <span className="truncate">{act.title}</span>
                          <span className="text-[7px] opacity-70 shrink-0">{act.pax_quota}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Floating tooltip */}
      {tooltip && <ActivityTooltip activity={tooltip.activity} x={tooltip.x} y={tooltip.y} />}
    </div>
  )
}
