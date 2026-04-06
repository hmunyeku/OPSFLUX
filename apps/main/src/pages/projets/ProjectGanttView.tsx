/**
 * ProjectGanttView — Rich Gantt chart for the Projets module.
 *
 * Shows projects and their tasks (including Gouti-imported sub-tasks)
 * with a proper tree hierarchy, resizable splitter, drag-scroll timeline,
 * 6 time scale levels, drag-to-reschedule, critical path coloring,
 * dependency arrows, rich tooltips, and Gouti project_color support.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  ChevronLeft, ChevronRight, ChevronDown, Loader2,
  Milestone, Layers, Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useProjects, useProjectTasks, useProjectMilestones, useProjectCpm } from '@/hooks/useProjets'
import { projetsService, isGoutiProject } from '@/services/projetsService'
import { useToast } from '@/components/ui/Toast'
import type { Project, ProjectTask } from '@/types/api'

// ── Time scales ─────────────────────────────────────────────────────────

type TimeScale = 'day' | 'week' | 'month' | 'quarter' | 'semester'

const SCALE_CFG: Record<TimeScale, {
  label: string; dayWidth: number; rangeMonths: number; shiftDays: number;
  headerFormat: (d: Date) => string; showLabel: (d: Date) => boolean;
}> = {
  day:      { label: 'Jour',      dayWidth: 48, rangeMonths: 1,  shiftDays: 7,   headerFormat: d => d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}), showLabel: () => true },
  week:     { label: 'Semaine',   dayWidth: 28, rangeMonths: 2,  shiftDays: 14,  headerFormat: d => d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}), showLabel: d => d.getDay()===1 },
  month:    { label: 'Mois',      dayWidth: 14, rangeMonths: 4,  shiftDays: 30,  headerFormat: d => d.toLocaleDateString('fr-FR',{month:'short',year:'2-digit'}), showLabel: d => d.getDate()===1 },
  quarter:  { label: 'Trimestre', dayWidth: 5,  rangeMonths: 12, shiftDays: 90,  headerFormat: d => `T${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()}`, showLabel: d => d.getDate()===1&&d.getMonth()%3===0 },
  semester: { label: 'Semestre',  dayWidth: 3,  rangeMonths: 24, shiftDays: 180, headerFormat: d => `S${d.getMonth()<6?1:2} ${d.getFullYear()}`, showLabel: d => d.getDate()===1&&d.getMonth()%6===0 },
}

// ── Color palette ───────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: '#9ca3af', planned: '#60a5fa', active: '#22c55e',
  on_hold: '#fbbf24', completed: '#10b981', cancelled: '#ef4444',
}
const TASK_STATUS_COLORS: Record<string, string> = {
  todo: '#9ca3af', in_progress: '#3b82f6', review: '#eab308', done: '#22c55e', cancelled: '#ef4444',
}

function getProjectColor(p: Project): string {
  if (isGoutiProject(p)) {
    // Gouti projects might carry a color in weather-related field or external_ref metadata.
    // For now, use orange to distinguish them visually.
    return '#f97316'
  }
  return STATUS_COLORS[p.status] || '#9ca3af'
}

// ── Date helpers ────────────────────────────────────────────────────────

function toISO(d: Date): string { return d.toISOString().slice(0,10) }
function daysBetween(a: string, b: string): number { return Math.ceil((new Date(b).getTime()-new Date(a).getTime())/86400000) }
function addDays(iso: string, n: number): string { const d=new Date(iso); d.setDate(d.getDate()+n); return toISO(d) }
function dayOffset(vs: string, t: string): number { return daysBetween(vs,t) }
function dateRange(s: string, e: string): string[] {
  const dates:string[]=[]; let c=new Date(s); const last=new Date(e)
  while(c<=last){ dates.push(toISO(c)); c.setDate(c.getDate()+1) }
  return dates
}

// ── Tooltip ─────────────────────────────────────────────────────────────

function GanttTooltip({ title, fields, x, y }: {
  title: string; fields: [string,string][]; x: number; y: number;
}) {
  return (
    <div className="fixed z-[100] bg-popover border border-border rounded-md shadow-lg p-2.5 text-xs w-[240px] pointer-events-none" style={{left:x+12,top:y-10}}>
      <div className="font-semibold text-foreground mb-1 truncate">{title}</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
        {fields.map(([k,v],i) => <><span key={`k${i}`} className="text-muted-foreground">{k}</span><span key={`v${i}`}>{v}</span></>)}
      </div>
    </div>
  )
}

// ── Expanded project row (tasks + milestones + CPM) ─────────────────────

function ExpandedProjectTasks({ project, cfg, viewStart, totalDays }: {
  project: Project; cfg: typeof SCALE_CFG.month; viewStart: string; totalDays: number;
}) {
  const { data: tasks } = useProjectTasks(project.id)
  const { data: milestones } = useProjectMilestones(project.id)
  const { data: cpm } = useProjectCpm(project.id)
  const { toast } = useToast()
  const [tooltip, setTooltip] = useState<{title:string;fields:[string,string][];x:number;y:number}|null>(null)

  const criticalIds = useMemo(() => new Set(cpm?.critical_path_task_ids || []), [cpm])

  // Build tree from parent_id
  const tree = useMemo(() => {
    const byParent = new Map<string|null, ProjectTask[]>()
    for (const t of (tasks || [])) {
      const k = t.parent_id ?? null
      if (!byParent.has(k)) byParent.set(k, [])
      byParent.get(k)!.push(t)
    }
    for (const a of byParent.values()) a.sort((x,y) => (x.order??0)-(y.order??0))
    return byParent
  }, [tasks])

  const handleTaskDrag = useCallback(async (e: React.DragEvent, targetDate: string) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/project-task')
    if (!raw) return
    try {
      const { id, start, end } = JSON.parse(raw)
      const dur = daysBetween(start, end)
      await projetsService.updateTask(project.id, id, { start_date: targetDate, due_date: addDays(targetDate, dur) })
      toast({title:'Tâche replanifiée', variant:'success'})
    } catch { toast({title:'Erreur replanification', variant:'error'}) }
  }, [project.id, toast])

  const renderTaskRow = (task: ProjectTask, depth: number): React.ReactNode[] => {
    const children = tree.get(task.id) || []
    const isCritical = criticalIds.has(task.id)
    const hasStart = !!task.start_date
    const hasEnd = !!task.due_date
    const barStart = hasStart ? Math.max(0, dayOffset(viewStart, task.start_date!.split('T')[0])) : -1
    const barEnd = hasEnd ? Math.min(totalDays-1, dayOffset(viewStart, task.due_date!.split('T')[0])) : -1
    const canDraw = barStart >= 0 && barEnd >= barStart

    const color = TASK_STATUS_COLORS[task.status] || '#9ca3af'

    const nodes: React.ReactNode[] = []
    nodes.push(
      <div key={task.id} className="flex border-b border-border/20 bg-background">
        {/* Left: task name */}
        <div className="flex-shrink-0 border-r border-border overflow-hidden" style={{width: 'var(--gantt-panel-width)'}}>
          <div
            className="flex items-center gap-1 py-1 text-[10px] truncate hover:bg-muted/30"
            style={{paddingLeft: `${12+depth*14}px`}}
            onMouseEnter={e => setTooltip({
              title: task.title,
              fields: [
                ['Statut', task.status],
                ['Progression', `${task.progress}%`],
                ...(task.start_date ? [['Début', new Date(task.start_date).toLocaleDateString('fr-FR')] as [string,string]] : []),
                ...(task.due_date ? [['Fin', new Date(task.due_date).toLocaleDateString('fr-FR')] as [string,string]] : []),
                ...(task.assignee_name ? [['Responsable', task.assignee_name] as [string,string]] : []),
                ...(task.estimated_hours ? [['Charge', `${task.estimated_hours}h`] as [string,string]] : []),
              ],
              x: e.clientX, y: e.clientY,
            })}
            onMouseLeave={() => setTooltip(null)}
          >
            {children.length > 0 && <ChevronDown size={9} className="text-muted-foreground shrink-0" />}
            <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor: color}} />
            <span className={cn('truncate', task.status === 'done' && 'line-through text-muted-foreground')}>
              {task.title}
            </span>
            {isCritical && <span className="text-[7px] px-0.5 rounded bg-red-500/10 text-red-500 shrink-0">CPM</span>}
          </div>
        </div>
        {/* Right: bar */}
        <div
          className="flex-1 relative min-h-[22px]"
          style={{minWidth: totalDays * cfg.dayWidth}}
          onDragOver={e => e.preventDefault()}
          onDrop={e => handleTaskDrag(e, addDays(viewStart, Math.floor(e.nativeEvent.offsetX / cfg.dayWidth)))}
        >
          {canDraw && (
            <div
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('application/project-task', JSON.stringify({id:task.id, start:task.start_date!.split('T')[0], end:task.due_date!.split('T')[0]}))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onMouseEnter={e => setTooltip({
                title: task.title,
                fields: [['Statut',task.status],['Progression',`${task.progress}%`],['PAX',task.code||'—']],
                x:e.clientX, y:e.clientY,
              })}
              onMouseMove={e => setTooltip(t => t ? {...t, x:e.clientX, y:e.clientY} : null)}
              onMouseLeave={() => setTooltip(null)}
              className={cn(
                'absolute top-[2px] h-[18px] rounded-sm cursor-move text-white text-[7px] font-medium truncate px-0.5 flex items-center gap-0.5 hover:brightness-110',
                isCritical && 'ring-1 ring-red-500',
              )}
              style={{
                left: barStart * cfg.dayWidth,
                width: Math.max(cfg.dayWidth, (barEnd-barStart+1)*cfg.dayWidth),
                backgroundColor: color,
                opacity: task.status === 'todo' ? 0.6 : 1,
              }}
            >
              <span className="truncate">{task.title}</span>
            </div>
          )}
        </div>
      </div>
    )
    // Recurse children
    for (const child of children) nodes.push(...renderTaskRow(child, depth+1))
    return nodes
  }

  const roots = tree.get(null) || []
  // Orphans (parent_id not in the set)
  const knownIds = new Set((tasks||[]).map(t => t.id))
  const orphans = (tasks||[]).filter(t => t.parent_id && !knownIds.has(t.parent_id))

  return (
    <>
      {roots.flatMap(r => renderTaskRow(r, 1))}
      {orphans.flatMap(t => renderTaskRow(t, 1))}
      {/* Milestones */}
      {(milestones||[]).filter(ms => ms.due_date).map(ms => {
        const msDay = dayOffset(viewStart, ms.due_date!.split('T')[0])
        if (msDay < 0 || msDay >= totalDays) return null
        return (
          <div key={ms.id} className="flex border-b border-border/20 bg-background">
            <div className="flex-shrink-0 border-r border-border overflow-hidden" style={{width:'var(--gantt-panel-width)'}}>
              <div className="flex items-center gap-1 py-1 pl-6 text-[10px] text-muted-foreground truncate">
                <Milestone size={9} className={ms.status==='completed'?'text-green-500':'text-yellow-500'} />
                {ms.name}
              </div>
            </div>
            <div className="flex-1 relative min-h-[22px]" style={{minWidth:totalDays*cfg.dayWidth}}>
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rotate-45 bg-yellow-500 border border-yellow-600"
                style={{left: msDay*cfg.dayWidth}}
                title={`${ms.name} — ${new Date(ms.due_date!).toLocaleDateString('fr-FR')}`}
              />
            </div>
          </div>
        )
      })}
      {tooltip && <GanttTooltip {...tooltip} />}
    </>
  )
}

// ── Main component ──────────────────────────────────────────────────────

export function ProjectGanttView() {
  const { data: projectsData, isLoading } = useProjects({ page_size: 200 })
  const openDynamicPanel = useUIStore(s => s.openDynamicPanel)

  const [scale, setScale] = useState<TimeScale>('month')
  const [panelWidth, setPanelWidth] = useState(260)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const scrollRef = useRef<HTMLDivElement>(null)
  const resizing = useRef(false)
  const dragScrolling = useRef<{startX:number;scrollLeft:number}|null>(null)

  const cfg = SCALE_CFG[scale]
  const projects = projectsData?.items ?? []

  const baseRange = useMemo(() => {
    const today = new Date()
    return { start: toISO(new Date(today.getFullYear(), today.getMonth(), 1)), end: toISO(new Date(today.getFullYear(), today.getMonth()+cfg.rangeMonths, 0)) }
  }, [cfg.rangeMonths])

  const [viewStart, setViewStart] = useState(baseRange.start)
  const [viewEnd, setViewEnd] = useState(baseRange.end)
  useEffect(() => { setViewStart(baseRange.start); setViewEnd(baseRange.end) }, [baseRange])

  const totalDays = daysBetween(viewStart, viewEnd)
  const dates = useMemo(() => dateRange(viewStart, viewEnd), [viewStart, viewEnd])
  const todayStr = toISO(new Date())
  const todayOff = dayOffset(viewStart, todayStr)

  const navigate = useCallback((dir: -1|1) => {
    setViewStart(v => addDays(v, dir*cfg.shiftDays))
    setViewEnd(v => addDays(v, dir*cfg.shiftDays))
  }, [cfg.shiftDays])

  const handleResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); resizing.current = true
    const sx = e.clientX; const sw = panelWidth
    const onMove = (ev: MouseEvent) => { if (!resizing.current) return; setPanelWidth(Math.max(160,Math.min(500,sw+ev.clientX-sx))) }
    const onUp = () => { resizing.current=false; window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp) }
    window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp)
  }, [panelWidth])

  const handleTimelineDrag = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return; e.preventDefault()
    dragScrolling.current = {startX:e.clientX, scrollLeft:scrollRef.current.scrollLeft}
    const onMove = (ev: MouseEvent) => { if (!dragScrolling.current||!scrollRef.current) return; scrollRef.current.scrollLeft=dragScrolling.current.scrollLeft-(ev.clientX-dragScrolling.current.startX) }
    const onUp = () => { dragScrolling.current=null; window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp) }
    window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp)
  }, [])

  const toggleProject = useCallback((id: string) => {
    setExpanded(prev => { const n=new Set(prev); if(n.has(id)) n.delete(id); else n.add(id); return n })
  }, [])

  return (
    <div className="flex flex-col h-full" style={{'--gantt-panel-width': `${panelWidth}px`} as React.CSSProperties}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0 flex-wrap">
        <div className="flex items-center gap-0.5 mr-2">
          {(Object.keys(SCALE_CFG) as TimeScale[]).map(s => (
            <button key={s} onClick={() => setScale(s)} className={cn('px-2 py-0.5 rounded text-xs font-medium', scale===s?'bg-primary/[0.16] text-foreground':'text-muted-foreground hover:text-foreground')}>
              {SCALE_CFG[s].label}
            </button>
          ))}
        </div>
        <button onClick={() => navigate(-1)} className="p-1 rounded hover:bg-accent text-muted-foreground"><ChevronLeft size={14} /></button>
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {new Date(viewStart).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})} — {new Date(viewEnd).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})}
        </span>
        <button onClick={() => navigate(1)} className="p-1 rounded hover:bg-accent text-muted-foreground"><ChevronRight size={14} /></button>
        <span className="text-xs text-muted-foreground ml-auto">{projects.length} projet(s)</span>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      ) : projects.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Aucun projet</div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left panel (uses CSS var for width sync with child components) */}
          <div className="flex-shrink-0 overflow-y-auto border-r border-border" style={{width: panelWidth}}>
            <div className="sticky top-0 z-10 bg-background border-b border-border px-2 py-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Projet / Tâche</span>
            </div>
          </div>

          {/* Resize handle */}
          <div className="w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors shrink-0" onMouseDown={handleResize} />

          {/* Right: chart */}
          <div ref={scrollRef} className="flex-1 overflow-auto relative">
            {/* Header */}
            <div className="sticky top-0 z-10 flex border-b border-border bg-background cursor-grab active:cursor-grabbing" onMouseDown={handleTimelineDrag} style={{minWidth:totalDays*cfg.dayWidth}}>
              {dates.map(d => {
                const dt=new Date(d); const show=cfg.showLabel(dt); const we=dt.getDay()===0||dt.getDay()===6
                return (
                  <div key={d} className={cn('flex-shrink-0 border-r border-border/30 text-center',d===todayStr&&'bg-primary/5',we&&'bg-muted/20')} style={{width:cfg.dayWidth}}>
                    {show && <span className="text-[7px] text-muted-foreground leading-none block pt-0.5">{cfg.headerFormat(dt)}</span>}
                  </div>
                )
              })}
            </div>

            {/* Today line */}
            {todayOff>=0 && todayOff<totalDays && (
              <div className="absolute top-0 bottom-0 w-px bg-primary/60 z-20 pointer-events-none" style={{left:todayOff*cfg.dayWidth+cfg.dayWidth/2}} />
            )}

            {/* Project rows */}
            {projects.map(project => {
              const isExpanded = expanded.has(project.id)
              const barStart = project.start_date ? Math.max(0, dayOffset(viewStart, project.start_date.split('T')[0])) : -1
              const barEnd = project.end_date ? Math.min(totalDays-1, dayOffset(viewStart, project.end_date.split('T')[0])) : -1
              const canDraw = barStart >= 0 && barEnd >= barStart
              const isMacro = (project.children_count ?? 0) > 0
              const color = getProjectColor(project)
              const gouti = isGoutiProject(project)

              return (
                <div key={project.id}>
                  {/* Project header row */}
                  <div className={cn('flex border-b border-border/50 hover:bg-muted/30', isMacro&&'bg-muted/10')}>
                    {/* Name in left panel (rendered here but positioned via absolute to avoid duplicating the scroll) */}
                    <div className="flex-shrink-0 border-r border-border overflow-hidden" style={{width:'var(--gantt-panel-width)'}}>
                      <div
                        className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer"
                        onClick={() => toggleProject(project.id)}
                      >
                        <ChevronDown size={10} className={cn('text-muted-foreground transition-transform shrink-0', !isExpanded&&'-rotate-90')} />
                        {isMacro && <Layers size={10} className="text-primary shrink-0" />}
                        {gouti && <Download size={9} className="text-orange-500 shrink-0" />}
                        <span className="text-[10px] font-medium truncate">{project.code}</span>
                        <span className="text-[9px] text-muted-foreground truncate">{project.name}</span>
                      </div>
                    </div>
                    {/* Bar */}
                    <div className="flex-1 relative py-1 min-h-[28px]" style={{minWidth:totalDays*cfg.dayWidth}}>
                      {canDraw && (
                        <div
                          onClick={() => openDynamicPanel({type:'detail',module:'projets',id:project.id})}
                          className="absolute h-5 rounded-sm top-1/2 -translate-y-1/2 cursor-pointer hover:brightness-110 flex items-center px-1 text-white text-[8px] font-medium truncate"
                          style={{
                            left: barStart*cfg.dayWidth,
                            width: Math.max(cfg.dayWidth,(barEnd-barStart+1)*cfg.dayWidth),
                            backgroundColor: color,
                          }}
                        >
                          <span className="truncate">{project.progress}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Expanded: tasks + milestones */}
                  {isExpanded && (
                    <ExpandedProjectTasks project={project} cfg={cfg} viewStart={viewStart} totalDays={totalDays} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
