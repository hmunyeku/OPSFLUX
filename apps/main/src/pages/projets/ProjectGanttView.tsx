/**
 * ProjectGanttView — Single-scroll Gantt with sticky left column.
 *
 * Standard Gantt layout: one scroll container, horizontal scroll moves
 * the timeline but the left "Projet / Tâche" column stays fixed via
 * position:sticky left:0. Vertical scroll is shared.
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

// ── Scales ──────────────────────────────────────────────────────────────

type TimeScale = 'day' | 'week' | 'month' | 'quarter' | 'semester'
const SCALES: Record<TimeScale, {
  label: string; dayW: number; months: number; shift: number;
  fmt: (d: Date) => string; show: (d: Date) => boolean;
}> = {
  day:      { label:'Jour',      dayW:48, months:1,  shift:7,   fmt:d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}), show:()=>true },
  week:     { label:'Semaine',   dayW:28, months:2,  shift:14,  fmt:d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}), show:d=>d.getDay()===1 },
  month:    { label:'Mois',      dayW:14, months:4,  shift:30,  fmt:d=>d.toLocaleDateString('fr-FR',{month:'short',year:'2-digit'}), show:d=>d.getDate()===1 },
  quarter:  { label:'Trimestre', dayW:5,  months:12, shift:90,  fmt:d=>`T${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()}`, show:d=>d.getDate()===1&&d.getMonth()%3===0 },
  semester: { label:'Semestre',  dayW:3,  months:24, shift:180, fmt:d=>`S${d.getMonth()<6?1:2} ${d.getFullYear()}`, show:d=>d.getDate()===1&&d.getMonth()%6===0 },
}

// ── Colors ──────────────────────────────────────────────────────────────

const S_CLR: Record<string,string> = { draft:'#9ca3af', planned:'#60a5fa', active:'#22c55e', on_hold:'#fbbf24', completed:'#10b981', cancelled:'#ef4444' }
const T_CLR: Record<string,string> = { todo:'#9ca3af', in_progress:'#3b82f6', review:'#eab308', done:'#22c55e', cancelled:'#ef4444' }

// ── Date utils ──────────────────────────────────────────────────────────

const iso = (d:Date) => d.toISOString().slice(0,10)
const daysB = (a:string,b:string) => Math.ceil((new Date(b).getTime()-new Date(a).getTime())/86400000)
const addD = (s:string,n:number) => { const d=new Date(s); d.setDate(d.getDate()+n); return iso(d) }
const dOff = (vs:string,t:string) => daysB(vs,t)
function dRange(s:string,e:string) { const r:string[]=[]; let c=new Date(s); const l=new Date(e); while(c<=l){r.push(iso(c));c.setDate(c.getDate()+1)} return r }

// ── Tooltip ─────────────────────────────────────────────────────────────

function Tip({ title, lines, x, y }: { title:string; lines:[string,string][]; x:number; y:number }) {
  return (
    <div className="fixed z-[100] bg-popover border border-border rounded-md shadow-lg p-2 text-xs w-[230px] pointer-events-none" style={{left:x+14,top:y-8}}>
      <div className="font-semibold mb-1 truncate">{title}</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
        {lines.map(([k,v],i)=><><span key={`k${i}`} className="text-muted-foreground">{k}</span><span key={`v${i}`}>{v}</span></>)}
      </div>
    </div>
  )
}

// ── Expanded tasks sub-component ────────────────────────────────────────

function ExpandedTasks({ project, sc, vs, td, pw }: {
  project: Project; sc: typeof SCALES.month; vs: string; td: number; pw: number;
}) {
  const { data: tasks } = useProjectTasks(project.id)
  const { data: milestones } = useProjectMilestones(project.id)
  const { data: cpm } = useProjectCpm(project.id)
  const { toast } = useToast()
  const [tip, setTip] = useState<{title:string;lines:[string,string][];x:number;y:number}|null>(null)

  const critSet = useMemo(() => new Set(cpm?.critical_path_task_ids || []), [cpm])

  // Build tree
  const tree = useMemo(() => {
    const m = new Map<string|null, ProjectTask[]>()
    for (const t of (tasks||[])) { const k=t.parent_id??null; if(!m.has(k))m.set(k,[]); m.get(k)!.push(t) }
    for (const a of m.values()) a.sort((x,y)=>(x.order??0)-(y.order??0))
    return m
  }, [tasks])

  const handleDrop = useCallback(async (e: React.DragEvent, date: string) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/ptask')
    if (!raw) return
    try {
      const { id, s, e: end } = JSON.parse(raw)
      const dur = daysB(s, end)
      await projetsService.updateTask(project.id, id, { start_date: date, due_date: addD(date, dur) })
      toast({ title: 'Tâche replanifiée', variant: 'success' })
    } catch { toast({ title: 'Erreur', variant: 'error' }) }
  }, [project.id, toast])

  const renderTask = (task: ProjectTask, depth: number): React.ReactNode[] => {
    const children = tree.get(task.id) || []
    const isCrit = critSet.has(task.id)
    const hasS = !!task.start_date; const hasE = !!task.due_date
    const bs = hasS ? Math.max(0, dOff(vs, task.start_date!.split('T')[0])) : -1
    const be = hasE ? Math.min(td-1, dOff(vs, task.due_date!.split('T')[0])) : -1
    const ok = bs>=0 && be>=bs
    const clr = T_CLR[task.status] || '#9ca3af'

    const nodes: React.ReactNode[] = []
    nodes.push(
      <div key={task.id} className="flex border-b border-border/20" style={{minWidth: pw + td*sc.dayW}}>
        {/* Sticky left: task name */}
        <div
          className="sticky left-0 z-[5] bg-background border-r border-border flex items-center gap-1 py-1 text-[10px] truncate shrink-0 hover:bg-muted/30"
          style={{ width: pw, paddingLeft: `${12 + depth * 14}px` }}
          onMouseEnter={e => setTip({
            title: task.title,
            lines: [
              ['Statut', task.status], ['Progression', `${task.progress}%`],
              ...(task.start_date ? [['Début', new Date(task.start_date).toLocaleDateString('fr-FR')] as [string,string]] : []),
              ...(task.due_date ? [['Fin', new Date(task.due_date).toLocaleDateString('fr-FR')] as [string,string]] : []),
              ...(task.assignee_name ? [['Resp.', task.assignee_name] as [string,string]] : []),
              ...(task.estimated_hours ? [['Charge', `${task.estimated_hours}h`] as [string,string]] : []),
            ], x:e.clientX, y:e.clientY
          })}
          onMouseLeave={() => setTip(null)}
        >
          {children.length > 0 && <ChevronDown size={8} className="text-muted-foreground shrink-0" />}
          <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:clr}} />
          <span className={cn('truncate', task.status==='done'&&'line-through text-muted-foreground')}>{task.title}</span>
          {isCrit && <span className="text-[7px] px-0.5 rounded bg-red-500/10 text-red-500 shrink-0">CPM</span>}
        </div>
        {/* Bar area */}
        <div
          className="relative min-h-[22px] flex-1"
          style={{minWidth: td * sc.dayW}}
          onDragOver={e => e.preventDefault()}
          onDrop={e => handleDrop(e, addD(vs, Math.floor(e.nativeEvent.offsetX / sc.dayW)))}
        >
          {ok && (
            <div
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('application/ptask', JSON.stringify({id:task.id, s:task.start_date!.split('T')[0], e:task.due_date!.split('T')[0]}))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onMouseEnter={e => setTip({title:task.title, lines:[['Statut',task.status],['%',`${task.progress}%`]], x:e.clientX, y:e.clientY})}
              onMouseMove={e => setTip(t=>t?{...t,x:e.clientX,y:e.clientY}:null)}
              onMouseLeave={() => setTip(null)}
              className={cn('absolute top-[2px] h-[18px] rounded-sm cursor-move text-white text-[7px] font-medium truncate px-0.5 flex items-center hover:brightness-110', isCrit&&'ring-1 ring-red-500')}
              style={{
                left: bs*sc.dayW, width: Math.max(sc.dayW,(be-bs+1)*sc.dayW),
                backgroundColor: clr, opacity: task.status==='todo'?0.5:1,
              }}
            >
              <span className="truncate">{task.title}</span>
            </div>
          )}
        </div>
      </div>
    )
    for (const ch of children) nodes.push(...renderTask(ch, depth+1))
    return nodes
  }

  const roots = tree.get(null) || []
  const knownIds = new Set((tasks||[]).map(t=>t.id))
  const orphans = (tasks||[]).filter(t=>t.parent_id&&!knownIds.has(t.parent_id))

  return (
    <>
      {roots.flatMap(r => renderTask(r, 1))}
      {orphans.flatMap(t => renderTask(t, 1))}
      {(milestones||[]).filter(ms=>ms.due_date).map(ms => {
        const mDay = dOff(vs, ms.due_date!.split('T')[0])
        if (mDay<0||mDay>=td) return null
        return (
          <div key={ms.id} className="flex border-b border-border/20" style={{minWidth:pw+td*sc.dayW}}>
            <div className="sticky left-0 z-[5] bg-background border-r border-border flex items-center gap-1 py-1 pl-6 text-[10px] text-muted-foreground truncate shrink-0" style={{width:pw}}>
              <Milestone size={9} className={ms.status==='completed'?'text-green-500':'text-yellow-500'} />
              {ms.name}
            </div>
            <div className="relative min-h-[22px] flex-1" style={{minWidth:td*sc.dayW}}>
              <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rotate-45 bg-yellow-500 border border-yellow-600" style={{left:mDay*sc.dayW}} title={`${ms.name} — ${new Date(ms.due_date!).toLocaleDateString('fr-FR')}`} />
            </div>
          </div>
        )
      })}
      {tip && <Tip {...tip} />}
    </>
  )
}

// ── Main ────────────────────────────────────────────────────────────────

export function ProjectGanttView() {
  const { data: pd, isLoading } = useProjects({ page_size: 200 })
  const open = useUIStore(s => s.openDynamicPanel)

  const [scale, setScale] = useState<TimeScale>('month')
  const [pw, setPw] = useState(260)
  const [exp, setExp] = useState<Set<string>>(new Set())
  const [tip, setTip] = useState<{title:string;lines:[string,string][];x:number;y:number}|null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const resizing = useRef(false)

  const sc = SCALES[scale]
  const projects = pd?.items ?? []

  const base = useMemo(() => {
    const t = new Date()
    return { s: iso(new Date(t.getFullYear(),t.getMonth(),1)), e: iso(new Date(t.getFullYear(),t.getMonth()+sc.months,0)) }
  }, [sc.months])

  const [vs, setVs] = useState(base.s)
  const [ve, setVe] = useState(base.e)
  useEffect(() => { setVs(base.s); setVe(base.e) }, [base])

  const td = daysB(vs, ve)
  const dates = useMemo(() => dRange(vs, ve), [vs, ve])
  const todayS = iso(new Date())
  const todayO = dOff(vs, todayS)
  const contentW = pw + td * sc.dayW

  const nav = useCallback((d: -1|1) => { setVs(v=>addD(v,d*sc.shift)); setVe(v=>addD(v,d*sc.shift)) }, [sc.shift])

  const handleResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); resizing.current=true; const sx=e.clientX; const sw=pw
    const onM = (ev:MouseEvent) => { if(!resizing.current)return; setPw(Math.max(160,Math.min(500,sw+ev.clientX-sx))) }
    const onU = () => { resizing.current=false; window.removeEventListener('mousemove',onM); window.removeEventListener('mouseup',onU) }
    window.addEventListener('mousemove',onM); window.addEventListener('mouseup',onU)
  }, [pw])

  const handleGrab = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return; e.preventDefault()
    const sx=e.clientX; const sl=scrollRef.current.scrollLeft
    const onM = (ev:MouseEvent) => { if(scrollRef.current) scrollRef.current.scrollLeft=sl-(ev.clientX-sx) }
    const onU = () => { window.removeEventListener('mousemove',onM); window.removeEventListener('mouseup',onU) }
    window.addEventListener('mousemove',onM); window.addEventListener('mouseup',onU)
  }, [])

  const toggle = useCallback((id:string) => { setExp(p=>{const n=new Set(p);if(n.has(id))n.delete(id);else n.add(id);return n}) }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0 flex-wrap">
        <div className="flex items-center gap-0.5 mr-2">
          {(Object.keys(SCALES) as TimeScale[]).map(s=>(
            <button key={s} onClick={()=>setScale(s)} className={cn('px-2 py-0.5 rounded text-xs font-medium',scale===s?'bg-primary/[0.16] text-foreground':'text-muted-foreground hover:text-foreground')}>
              {SCALES[s].label}
            </button>
          ))}
        </div>
        <button onClick={()=>nav(-1)} className="p-1 rounded hover:bg-accent text-muted-foreground"><ChevronLeft size={14}/></button>
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {new Date(vs).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})} — {new Date(ve).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})}
        </span>
        <button onClick={()=>nav(1)} className="p-1 rounded hover:bg-accent text-muted-foreground"><ChevronRight size={14}/></button>
        <span className="text-xs text-muted-foreground ml-auto">{projects.length} projet(s)</span>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 size={16} className="animate-spin text-muted-foreground"/></div>
      ) : projects.length===0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Aucun projet</div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-auto relative">
          {/* ── Header row ─────────────────────────────── */}
          <div className="sticky top-0 z-10 flex bg-background border-b border-border" style={{minWidth:contentW}}>
            {/* Sticky left header */}
            <div className="sticky left-0 z-20 bg-background border-r border-border shrink-0 flex items-center" style={{width:pw}}>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground px-2">Projet / Tâche</span>
              {/* Resize handle */}
              <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50" onMouseDown={handleResize} />
            </div>
            {/* Date cells (drag-scrollable) */}
            <div className="flex cursor-grab active:cursor-grabbing" onMouseDown={handleGrab}>
              {dates.map(d => {
                const dt=new Date(d); const show=sc.show(dt); const we=dt.getDay()===0||dt.getDay()===6
                return (
                  <div key={d} className={cn('shrink-0 border-r border-border/30 text-center',d===todayS&&'bg-primary/5',we&&'bg-muted/20')} style={{width:sc.dayW}}>
                    {show && <span className="text-[7px] text-muted-foreground leading-none block pt-1">{sc.fmt(dt)}</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Today line ──────────────────────────────── */}
          {todayO>=0 && todayO<td && (
            <div className="absolute top-0 bottom-0 w-px bg-primary/60 z-[15] pointer-events-none" style={{left:pw+todayO*sc.dayW+sc.dayW/2}} />
          )}

          {/* ── Project rows ────────────────────────────── */}
          {projects.map(project => {
            const isExp = exp.has(project.id)
            const gouti = isGoutiProject(project)
            const isMacro = (project.children_count??0) > 0
            const color = gouti ? '#f97316' : (S_CLR[project.status]||'#9ca3af')
            const hasS = !!project.start_date; const hasE = !!project.end_date
            const bs = hasS ? Math.max(0, dOff(vs, project.start_date!.split('T')[0])) : -1
            const be = hasE ? Math.min(td-1, dOff(vs, project.end_date!.split('T')[0])) : -1
            const ok = bs>=0 && be>=bs

            return (
              <div key={project.id}>
                <div className={cn('flex border-b border-border/50 hover:bg-muted/30',isMacro&&'bg-muted/10')} style={{minWidth:contentW}}>
                  {/* Sticky left: project name */}
                  <div
                    className="sticky left-0 z-[5] bg-background border-r border-border shrink-0 flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-muted/40"
                    style={{width:pw}}
                    onClick={() => toggle(project.id)}
                    onMouseEnter={e => setTip({title:project.name, lines:[['Code',project.code],['Statut',project.status],['%',`${project.progress}%`],...(gouti?[['Source','Gouti'] as [string,string]]:[])] ,x:e.clientX,y:e.clientY})}
                    onMouseLeave={() => setTip(null)}
                  >
                    <ChevronDown size={10} className={cn('text-muted-foreground transition-transform shrink-0',!isExp&&'-rotate-90')} />
                    {isMacro && <Layers size={10} className="text-primary shrink-0" />}
                    {gouti && <Download size={9} className="text-orange-500 shrink-0" />}
                    <span className="text-[10px] font-medium truncate">{project.code}</span>
                    <span className="text-[9px] text-muted-foreground truncate">{project.name}</span>
                  </div>
                  {/* Bar */}
                  <div className="relative flex-1 py-1 min-h-[28px]" style={{minWidth:td*sc.dayW}}>
                    {ok && (
                      <div
                        onClick={() => open({type:'detail',module:'projets',id:project.id})}
                        className="absolute h-5 rounded-sm top-1/2 -translate-y-1/2 cursor-pointer hover:brightness-110 flex items-center px-1 text-white text-[8px] font-medium truncate"
                        style={{left:bs*sc.dayW, width:Math.max(sc.dayW,(be-bs+1)*sc.dayW), backgroundColor:color}}
                      >
                        <span className="truncate">{project.progress}%</span>
                      </div>
                    )}
                  </div>
                </div>
                {isExp && <ExpandedTasks project={project} sc={sc} vs={vs} td={td} pw={pw} />}
              </div>
            )
          })}
        </div>
      )}
      {tip && <Tip {...tip} />}
    </div>
  )
}
