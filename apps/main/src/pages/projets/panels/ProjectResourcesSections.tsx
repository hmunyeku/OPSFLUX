/**
 * Project resources & time tracking sections (MS Project parity).
 *
 * Four collapsible FormSections to plug into the Project Detail panel:
 *  - TimeTrackingSection — daily pointage with workflow draft → submitted →
 *    validated | rejected. Shows entries, status filter, inline quick-add,
 *    and inline workflow buttons (submit / approve / reject / delete).
 *  - AllocationMatrixSection — tasks × members grid with planned vs actual
 *    hours. Click a cell to edit planned hours.
 *  - LossesSection — track time/cost losses by category (weather, material,
 *    equipment, manpower, contractual, accident, other).
 *  - ProjectReportSection — synthesis report (KPIs + tasks + members + losses).
 *
 * Backend: app/api/routes/modules/projets.py — endpoints
 *   /projects/{pid}/{time-entries,allocations,losses,report}
 *   /projects/{pid}/{time-summary,allocation-matrix}
 */
import { useState } from 'react'
import { Loader2, Trash2, X, Check, Send, Plus, Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FormSection, panelInputClass } from '@/components/layout/DynamicPanel'
import {
  useProjectTasks,
  useProjectTimeEntries, useCreateProjectTimeEntry, useSubmitProjectTimeEntry,
  useApproveProjectTimeEntry, useRejectProjectTimeEntry, useDeleteProjectTimeEntry,
  useProjectTimeSummary,
  useProjectAllocationMatrix, useCreateProjectAllocation,
  useUpdateProjectAllocation, useDeleteProjectAllocation,
  useProjectLosses, useCreateProjectLoss, useDeleteProjectLoss,
  useProjectReport,
} from '@/hooks/useProjets'
import type { ProjectMember as ProjectMemberType } from '@/types/api'

// ════════════════════════════════════════════════════════════════════════════
// Time Tracking (pointage)
// ════════════════════════════════════════════════════════════════════════════

const TIME_STATUS_BADGE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-500/10 text-blue-600',
  validated: 'bg-green-500/10 text-green-600',
  rejected: 'bg-red-500/10 text-red-600',
}
const TIME_STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon', submitted: 'Soumis', validated: 'Validé', rejected: 'Rejeté',
}

export function TimeTrackingSection({ projectId, members }: { projectId: string; members: ProjectMemberType[] }) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [showAdd, setShowAdd] = useState(false)
  const [memberId, setMemberId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [date, setDate] = useState(todayStr)
  const [hours, setHours] = useState('')
  const [description, setDescription] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  const { data: entries } = useProjectTimeEntries(projectId, statusFilter ? { status: statusFilter } : {})
  const { data: tasks } = useProjectTasks(projectId)
  const { data: summary } = useProjectTimeSummary(projectId)
  const createEntry = useCreateProjectTimeEntry()
  const submitEntry = useSubmitProjectTimeEntry()
  const approveEntry = useApproveProjectTimeEntry()
  const rejectEntry = useRejectProjectTimeEntry()
  const deleteEntry = useDeleteProjectTimeEntry()

  const reset = () => {
    setMemberId(''); setTaskId(''); setDate(todayStr); setHours(''); setDescription('')
    setShowAdd(false)
  }

  const handleSubmitEntry = async () => {
    if (!memberId || !hours) return
    await createEntry.mutateAsync({
      projectId,
      payload: {
        member_id: memberId,
        task_id: taskId || null,
        date,
        hours: parseFloat(hours),
        description: description || null,
      },
    })
    reset()
  }

  const handleReject = async (entryId: string) => {
    const reason = window.prompt('Motif du rejet ?')
    if (!reason) return
    await rejectEntry.mutateAsync({ projectId, entryId, reason })
  }

  return (
    <FormSection
      title={`Pointage${entries && entries.length ? ` (${entries.length})` : ''}`}
      collapsible
      defaultExpanded={false}
      storageKey="project-detail-timesheet"
    >
      {summary && summary.totals.hours > 0 && (
        <div className="flex items-center gap-3 text-[11px] mb-2 px-2 py-1.5 rounded bg-muted/40">
          <span className="text-muted-foreground">Total :</span>
          <span className="font-medium">{summary.totals.hours.toFixed(1)} h</span>
          {summary.totals.cost > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="font-medium">{summary.totals.cost.toFixed(2)}</span>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 mb-2 text-[10px]">
        <span className="text-muted-foreground">Filtrer :</span>
        {(['', 'draft', 'submitted', 'validated', 'rejected'] as const).map(s => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-1.5 py-0.5 rounded',
              statusFilter === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground',
            )}
          >
            {s ? TIME_STATUS_LABEL[s] : 'Tous'}
          </button>
        ))}
      </div>

      {entries && entries.length > 0 ? (
        <div className="space-y-1 mb-2">
          {entries.map((te) => (
            <div key={te.id} className="group flex items-center gap-2 text-xs py-1 border-b border-border/40 last:border-0">
              <Clock size={11} className="text-muted-foreground shrink-0" />
              <span className="text-muted-foreground tabular-nums w-[80px] shrink-0">{te.date}</span>
              <span className="font-medium tabular-nums w-[40px] shrink-0">{te.hours}h</span>
              <span className="flex-1 min-w-0 truncate">
                {te.member_name || '?'}
                {te.task_title && <span className="text-muted-foreground"> · {te.task_title}</span>}
                {te.description && <span className="text-muted-foreground"> — {te.description}</span>}
              </span>
              {te.cost && te.currency_snapshot && (
                <span className="text-[10px] text-muted-foreground shrink-0">{te.cost.toFixed(2)} {te.currency_snapshot}</span>
              )}
              <span className={cn('px-1.5 py-0.5 rounded text-[9px] shrink-0', TIME_STATUS_BADGE[te.status])}>
                {TIME_STATUS_LABEL[te.status]}
              </span>
              <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {te.status === 'draft' && (
                  <>
                    <button title="Soumettre" onClick={() => submitEntry.mutate({ projectId, entryId: te.id })} className="p-0.5 rounded hover:bg-primary/10 text-primary">
                      <Send size={10} />
                    </button>
                    <button title="Supprimer" onClick={() => deleteEntry.mutate({ projectId, entryId: te.id })} className="p-0.5 rounded hover:bg-red-500/10 text-red-500">
                      <Trash2 size={10} />
                    </button>
                  </>
                )}
                {te.status === 'submitted' && (
                  <>
                    <button title="Approuver" onClick={() => approveEntry.mutate({ projectId, entryId: te.id })} className="p-0.5 rounded hover:bg-green-500/10 text-green-600">
                      <Check size={10} />
                    </button>
                    <button title="Rejeter" onClick={() => handleReject(te.id)} className="p-0.5 rounded hover:bg-red-500/10 text-red-500">
                      <X size={10} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground text-center py-2">Aucun pointage</div>
      )}

      {!showAdd ? (
        <button onClick={() => setShowAdd(true)} disabled={members.length === 0} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1 disabled:opacity-40">
          <Plus size={12} /> Ajouter un pointage
        </button>
      ) : (
        <div className="flex flex-col gap-1.5 p-2 border border-border rounded-md bg-muted/30">
          <div className="grid grid-cols-2 gap-1.5">
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={`${panelInputClass} text-xs`}>
              <option value="">— Membre —</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.member_name || '(inconnu)'}{m.specialty ? ` (${m.specialty})` : ''}</option>
              ))}
            </select>
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className={`${panelInputClass} text-xs`}>
              <option value="">— Tâche (optionnel) —</option>
              {tasks?.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${panelInputClass} text-xs`} />
            <input type="number" min={0.25} max={24} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Heures" className={`${panelInputClass} text-xs`} />
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optionnel)" className={`${panelInputClass} text-xs col-span-2`} />
          </div>
          <div className="flex justify-end gap-1">
            <button onClick={reset} className="px-2 py-0.5 text-[10px] rounded hover:bg-muted text-muted-foreground">Annuler</button>
            <button onClick={handleSubmitEntry} disabled={createEntry.isPending || !memberId || !hours} className="px-2 py-0.5 text-[10px] rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              {createEntry.isPending ? <Loader2 size={10} className="animate-spin" /> : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </FormSection>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Allocation Matrix (tasks × members, planned vs actual)
// ════════════════════════════════════════════════════════════════════════════

export function AllocationMatrixSection({ projectId }: { projectId: string }) {
  const { data: matrix } = useProjectAllocationMatrix(projectId)
  const createAlloc = useCreateProjectAllocation()
  const updateAlloc = useUpdateProjectAllocation()
  const deleteAlloc = useDeleteProjectAllocation()
  const [editing, setEditing] = useState<{ taskId: string; memberId: string } | null>(null)
  const [editPlanned, setEditPlanned] = useState('')

  if (!matrix) return null
  if (matrix.tasks.length === 0 || matrix.members.length === 0) {
    return (
      <FormSection title="Matrice d'affectation" collapsible defaultExpanded={false} storageKey="project-detail-alloc-matrix">
        <div className="text-[11px] text-muted-foreground text-center py-2">
          {matrix.tasks.length === 0 ? 'Aucune tâche' : 'Aucun membre'} — créez d'abord {matrix.tasks.length === 0 ? 'des tâches' : 'des membres'} pour planifier les affectations.
        </div>
      </FormSection>
    )
  }

  const startEdit = (taskId: string, memberId: string, currentPlanned: number) => {
    setEditing({ taskId, memberId })
    setEditPlanned(currentPlanned > 0 ? String(currentPlanned) : '')
  }

  const commitEdit = async (allocId: string | null) => {
    if (!editing) return
    const hours = parseFloat(editPlanned)
    const valid = !isNaN(hours) && hours >= 0
    if (!valid && allocId) {
      await deleteAlloc.mutateAsync({ projectId, allocId })
    } else if (valid && !allocId && hours > 0) {
      await createAlloc.mutateAsync({
        projectId,
        payload: { task_id: editing.taskId, member_id: editing.memberId, planned_hours: hours },
      })
    } else if (valid && allocId) {
      await updateAlloc.mutateAsync({ projectId, allocId, payload: { planned_hours: hours } })
    }
    setEditing(null)
    setEditPlanned('')
  }

  return (
    <FormSection
      title={`Matrice d'affectation (${matrix.tasks.length} t. × ${matrix.members.length} m.)`}
      collapsible
      defaultExpanded={false}
      storageKey="project-detail-alloc-matrix"
    >
      <div className="text-[10px] text-muted-foreground mb-2">
        Cliquez sur une cellule pour saisir les heures planifiées. Format : <span className="font-mono">planifié / réalisé</span>.
      </div>
      <div className="overflow-x-auto border border-border rounded-md max-h-[400px]">
        <table className="text-[11px] w-full">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground sticky left-0 bg-muted/40 z-20 min-w-[180px] max-w-[260px]">Tâche</th>
              {matrix.members.map(m => (
                <th key={m.member_id} className="text-center px-2 py-1.5 font-medium text-muted-foreground min-w-[80px]" title={m.specialty || ''}>
                  <div className="truncate max-w-[120px]">{m.member_name}</div>
                  {m.specialty && <div className="text-[9px] text-muted-foreground/70 font-normal truncate">{m.specialty}</div>}
                </th>
              ))}
              <th className="text-right px-2 py-1.5 font-medium text-muted-foreground sticky right-0 bg-muted/40 z-20 min-w-[80px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {matrix.tasks.map(task => (
              <tr key={task.task_id} className="border-t border-border/40 hover:bg-muted/20">
                <td className="px-2 py-1 sticky left-0 bg-background z-10 truncate max-w-[260px]" title={task.task_title}>
                  <div className="truncate">{task.task_title}</div>
                  {task.estimated_hours && <div className="text-[9px] text-muted-foreground">est. {task.estimated_hours}h</div>}
                </td>
                {task.cells.map(cell => {
                  const isEditing = editing?.taskId === task.task_id && editing?.memberId === cell.member_id
                  const has = cell.planned_hours > 0 || cell.actual_hours > 0
                  return (
                    <td key={cell.member_id} className="text-center px-1 py-1 border-l border-border/30">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          step={0.25}
                          autoFocus
                          value={editPlanned}
                          onChange={(e) => setEditPlanned(e.target.value)}
                          onBlur={() => commitEdit(cell.allocation_id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(cell.allocation_id)
                            if (e.key === 'Escape') { setEditing(null); setEditPlanned('') }
                          }}
                          className={`${panelInputClass} text-[10px] text-center w-full`}
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(task.task_id, cell.member_id, cell.planned_hours)}
                          className={cn(
                            'w-full px-1 py-0.5 rounded text-[10px] tabular-nums hover:bg-primary/10',
                            !has && 'text-muted-foreground/40',
                            has && cell.variance_hours < -0.01 && 'bg-red-500/10 text-red-600',
                            has && Math.abs(cell.variance_hours) < 0.01 && cell.planned_hours > 0 && 'bg-green-500/10 text-green-600',
                            has && cell.variance_hours > 0.01 && 'text-foreground',
                          )}
                          title={`Planifié: ${cell.planned_hours}h\nRéalisé: ${cell.actual_hours}h\nÉcart: ${cell.variance_hours.toFixed(1)}h`}
                        >
                          {has ? `${cell.planned_hours} / ${cell.actual_hours}` : '–'}
                        </button>
                      )}
                    </td>
                  )
                })}
                <td className="text-right px-2 py-1 tabular-nums sticky right-0 bg-background z-10 border-l border-border/30 text-[10px]">
                  <div>{task.planned_hours_total} / {task.actual_hours_total}</div>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-border bg-muted/30 font-medium">
              <td className="px-2 py-1.5 sticky left-0 bg-muted/30 z-10">Total</td>
              {matrix.members.map(m => {
                const totals = matrix.tasks.reduce((acc, t) => {
                  const c = t.cells.find(c => c.member_id === m.member_id)
                  if (c) { acc.p += c.planned_hours; acc.a += c.actual_hours }
                  return acc
                }, { p: 0, a: 0 })
                return (
                  <td key={m.member_id} className="text-center px-1 py-1.5 tabular-nums text-[10px]">
                    {totals.p.toFixed(0)} / {totals.a.toFixed(0)}
                  </td>
                )
              })}
              <td className="text-right px-2 py-1.5 tabular-nums sticky right-0 bg-muted/30 z-10">
                {matrix.tasks.reduce((s, t) => s + t.planned_hours_total, 0).toFixed(0)} / {matrix.tasks.reduce((s, t) => s + t.actual_hours_total, 0).toFixed(0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </FormSection>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Losses (pertes)
// ════════════════════════════════════════════════════════════════════════════

const LOSS_CATEGORIES: { value: string; label: string }[] = [
  { value: 'weather', label: 'Intempéries' },
  { value: 'material', label: 'Matériau' },
  { value: 'equipment', label: 'Équipement' },
  { value: 'manpower', label: 'Main d\'œuvre' },
  { value: 'contractual', label: 'Contractuel' },
  { value: 'accident', label: 'Accident' },
  { value: 'other', label: 'Autre' },
]

export function LossesSection({ projectId }: { projectId: string }) {
  const { data: losses } = useProjectLosses(projectId)
  const { data: tasks } = useProjectTasks(projectId)
  const createLoss = useCreateProjectLoss()
  const deleteLoss = useDeleteProjectLoss()
  const [showAdd, setShowAdd] = useState(false)
  const todayStr = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(todayStr)
  const [taskId, setTaskId] = useState('')
  const [category, setCategory] = useState('weather')
  const [hoursLost, setHoursLost] = useState('')
  const [costAmount, setCostAmount] = useState('')
  const [description, setDescription] = useState('')

  const reset = () => {
    setDate(todayStr); setTaskId(''); setCategory('weather')
    setHoursLost(''); setCostAmount(''); setDescription('')
    setShowAdd(false)
  }

  const handleSubmit = async () => {
    if (!description.trim()) return
    if (!hoursLost && !costAmount) return
    await createLoss.mutateAsync({
      projectId,
      payload: {
        task_id: taskId || null,
        date,
        category,
        hours_lost: hoursLost ? parseFloat(hoursLost) : null,
        cost_amount: costAmount ? parseFloat(costAmount) : null,
        description: description.trim(),
      },
    })
    reset()
  }

  const totals = (losses ?? []).reduce(
    (acc, l) => ({
      hours: acc.hours + (l.hours_lost ?? 0),
      cost: acc.cost + (l.cost_amount ?? 0),
    }),
    { hours: 0, cost: 0 },
  )

  return (
    <FormSection
      title={`Pertes${losses && losses.length ? ` (${losses.length})` : ''}`}
      collapsible
      defaultExpanded={false}
      storageKey="project-detail-losses"
    >
      {losses && losses.length > 0 && (
        <div className="flex items-center gap-3 text-[11px] mb-2 px-2 py-1.5 rounded bg-red-500/5 border border-red-500/10">
          <span className="text-muted-foreground">Total :</span>
          {totals.hours > 0 && <span className="font-medium text-red-600">{totals.hours.toFixed(1)} h</span>}
          {totals.cost > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="font-medium text-red-600">{totals.cost.toFixed(2)}</span>
            </>
          )}
        </div>
      )}

      {losses && losses.length > 0 ? (
        <div className="space-y-1 mb-2">
          {losses.map((l) => {
            const catLabel = LOSS_CATEGORIES.find(c => c.value === l.category)?.label ?? l.category
            return (
              <div key={l.id} className="group flex items-center gap-2 text-xs py-1 border-b border-border/40 last:border-0">
                <AlertTriangle size={11} className="text-red-500 shrink-0" />
                <span className="text-muted-foreground tabular-nums w-[80px] shrink-0">{l.date}</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-muted shrink-0">{catLabel}</span>
                <span className="flex-1 min-w-0 truncate" title={l.description}>
                  {l.task_title && <span className="text-muted-foreground">{l.task_title} · </span>}
                  {l.description}
                </span>
                {l.hours_lost && <span className="text-[10px] text-red-600 shrink-0 tabular-nums">{l.hours_lost}h</span>}
                {l.cost_amount && <span className="text-[10px] text-red-600 shrink-0 tabular-nums">{l.cost_amount} {l.currency}</span>}
                <button
                  onClick={() => deleteLoss.mutate({ projectId, lossId: l.id })}
                  className="p-0.5 rounded hover:bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground text-center py-2">Aucune perte enregistrée</div>
      )}

      {!showAdd ? (
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1">
          <Plus size={12} /> Déclarer une perte
        </button>
      ) : (
        <div className="flex flex-col gap-1.5 p-2 border border-border rounded-md bg-muted/30">
          <div className="grid grid-cols-2 gap-1.5">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${panelInputClass} text-xs`} />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${panelInputClass} text-xs`}>
              {LOSS_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className={`${panelInputClass} text-xs col-span-2`}>
              <option value="">— Tâche (optionnel) —</option>
              {tasks?.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <input type="number" min={0} step={0.25} value={hoursLost} onChange={(e) => setHoursLost(e.target.value)} placeholder="Heures perdues" className={`${panelInputClass} text-xs`} />
            <input type="number" min={0} step={0.01} value={costAmount} onChange={(e) => setCostAmount(e.target.value)} placeholder="Surcoût" className={`${panelInputClass} text-xs`} />
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (obligatoire)" className={`${panelInputClass} text-xs col-span-2`} />
          </div>
          <div className="flex justify-end gap-1">
            <button onClick={reset} className="px-2 py-0.5 text-[10px] rounded hover:bg-muted text-muted-foreground">Annuler</button>
            <button onClick={handleSubmit} disabled={createLoss.isPending || !description.trim() || (!hoursLost && !costAmount)} className="px-2 py-0.5 text-[10px] rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              {createLoss.isPending ? <Loader2 size={10} className="animate-spin" /> : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </FormSection>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Project Report (synthèse façon MS Project)
// ════════════════════════════════════════════════════════════════════════════

export function ProjectReportSection({ projectId }: { projectId: string }) {
  const { data: report } = useProjectReport(projectId)
  if (!report) return null
  const k = report.kpis
  const fmt = (n: number, d = 1) => n.toFixed(d)

  return (
    <FormSection title="Rapport projet" collapsible defaultExpanded={false} storageKey="project-detail-report">
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 mb-3">
        <div className="px-2 py-1.5 rounded bg-muted/40 border border-border/40">
          <div className="text-[10px] text-muted-foreground">Avancement</div>
          <div className="text-base font-medium tabular-nums">{fmt(k.completion_pct, 0)}%</div>
        </div>
        <div className="px-2 py-1.5 rounded bg-muted/40 border border-border/40">
          <div className="text-[10px] text-muted-foreground">Heures planif. / réal.</div>
          <div className="text-base font-medium tabular-nums">{fmt(k.total_planned_hours, 0)} / {fmt(k.total_actual_hours, 0)}</div>
          <div className={cn('text-[10px] tabular-nums', k.variance_hours < 0 ? 'text-red-500' : 'text-green-500')}>
            écart {k.variance_hours >= 0 ? '+' : ''}{fmt(k.variance_hours, 1)}h
          </div>
        </div>
        <div className="px-2 py-1.5 rounded bg-muted/40 border border-border/40">
          <div className="text-[10px] text-muted-foreground">Coût</div>
          <div className="text-base font-medium tabular-nums">{fmt(k.total_cost, 0)} {report.project.currency}</div>
        </div>
        <div className="px-2 py-1.5 rounded bg-red-500/5 border border-red-500/20">
          <div className="text-[10px] text-muted-foreground">Pertes</div>
          <div className="text-base font-medium tabular-nums text-red-600">{fmt(k.total_lost_hours, 1)}h · {fmt(k.total_lost_cost, 0)}</div>
        </div>
      </div>

      {report.tasks.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] font-medium mb-1">Tâches</div>
          <div className="border border-border rounded text-[10px] max-h-[160px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1">Titre</th>
                  <th className="text-right px-2 py-1 w-[60px]">Plan.</th>
                  <th className="text-right px-2 py-1 w-[60px]">Réal.</th>
                  <th className="text-right px-2 py-1 w-[60px]">Écart</th>
                  <th className="text-right px-2 py-1 w-[50px]">%</th>
                </tr>
              </thead>
              <tbody>
                {report.tasks.map(t => (
                  <tr key={t.task_id} className="border-t border-border/40">
                    <td className="px-2 py-1 truncate max-w-[200px]">{t.title}</td>
                    <td className="text-right px-2 py-1 tabular-nums">{fmt(t.planned_hours, 0)}</td>
                    <td className="text-right px-2 py-1 tabular-nums">{fmt(t.actual_hours, 0)}</td>
                    <td className={cn('text-right px-2 py-1 tabular-nums', t.variance_hours < 0 ? 'text-red-500' : '')}>{t.variance_hours >= 0 ? '+' : ''}{fmt(t.variance_hours, 1)}</td>
                    <td className="text-right px-2 py-1 tabular-nums">{fmt(t.completion_pct, 0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {report.members.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] font-medium mb-1">Ressources</div>
          <div className="border border-border rounded text-[10px] max-h-[160px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1">Membre</th>
                  <th className="text-left px-2 py-1">Spécialité</th>
                  <th className="text-right px-2 py-1 w-[60px]">Plan.</th>
                  <th className="text-right px-2 py-1 w-[60px]">Réal.</th>
                  <th className="text-right px-2 py-1 w-[80px]">Coût</th>
                </tr>
              </thead>
              <tbody>
                {report.members.map(m => (
                  <tr key={m.member_id} className="border-t border-border/40">
                    <td className="px-2 py-1 truncate max-w-[140px]">{m.member_name}</td>
                    <td className="px-2 py-1 text-muted-foreground truncate max-w-[100px]">{m.specialty || '—'}</td>
                    <td className="text-right px-2 py-1 tabular-nums">{fmt(m.planned_hours, 0)}</td>
                    <td className="text-right px-2 py-1 tabular-nums">{fmt(m.actual_hours, 0)}</td>
                    <td className="text-right px-2 py-1 tabular-nums">{fmt(m.cost, 0)} {m.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {report.losses_by_category.length > 0 && (
        <div>
          <div className="text-[11px] font-medium mb-1">Pertes par catégorie</div>
          <div className="grid grid-cols-2 @md:grid-cols-4 gap-1.5">
            {report.losses_by_category.map(l => {
              const lbl = LOSS_CATEGORIES.find(c => c.value === l.category)?.label ?? l.category
              return (
                <div key={l.category} className="px-2 py-1 rounded border border-red-500/20 bg-red-500/5 text-[10px]">
                  <div className="text-muted-foreground">{lbl}</div>
                  <div className="font-medium tabular-nums">{fmt(l.hours_lost, 1)}h · {fmt(l.cost_amount, 0)}</div>
                  <div className="text-muted-foreground">{l.count} {l.count > 1 ? 'incidents' : 'incident'}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </FormSection>
  )
}
