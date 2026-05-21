/**
 * Project resources & time tracking sections (MS Project parity).
 *
 * Three collapsible FormSections to plug into the Project Detail panel:
 *  - TimeTrackingSection — daily pointage with workflow draft → submitted →
 *    validated | rejected. Shows entries, status filter, inline quick-add,
 *    and inline workflow buttons (submit / approve / reject / delete).
 *  - AllocationMatrixSection — tasks × members grid with planned vs actual
 *    hours. Click a cell to edit planned hours.
 *  - LossesSection — track time/cost losses by category (weather, material,
 *    equipment, manpower, contractual, accident, other).
 *
 * Backend: app/api/routes/modules/projets.py — endpoints
 *   /projects/{pid}/{time-entries,allocations,losses,report}
 *   /projects/{pid}/{time-summary,allocation-matrix}
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CircleDollarSign,
  Loader2,
  Plus,
  ReceiptText,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FormSection, panelInputClass } from '@/components/layout/DynamicPanel'
import {
  useProjectTasks,
  useProjectAllocationMatrix, useCreateProjectAllocation,
  useUpdateProjectAllocation, useDeleteProjectAllocation,
  useProjectLosses, useCreateProjectLoss, useDeleteProjectLoss,
  useProjectReport,
  useWbsNodes,
} from '@/hooks/useProjets'
import { WeeklyTimesheetGrid } from './WeeklyTimesheetGrid'
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
  draft: 'Brouillon', submitted: 'Soumis', validated: 'Valide', rejected: 'Rejete',
}
// Re-export for compatibility (currently unused after rewrite, kept for any
// downstream consumer of this module).
void TIME_STATUS_BADGE; void TIME_STATUS_LABEL

function fmtMoney(value: number | null | undefined, currency: string | null | undefined, digits = 0) {
  const amount = Number(value ?? 0)
  return `${amount.toLocaleString('fr-FR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })} ${currency || 'XAF'}`
}

function pct(value: number) {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(value)}%`
}

function budgetStatusClass(tone: 'good' | 'warn' | 'bad' | 'neutral') {
  if (tone === 'good') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  if (tone === 'warn') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  if (tone === 'bad') return 'bg-red-500/10 text-red-600 dark:text-red-400'
  return 'bg-muted text-muted-foreground'
}

type BudgetTone = 'good' | 'warn' | 'bad' | 'neutral'

export function BudgetSection({ projectId }: { projectId: string }) {
  const { data: report } = useProjectReport(projectId)
  const { data: wbsNodes = [] } = useWbsNodes(projectId)

  const budgetData = useMemo(() => {
    if (!report) return null
    const budget = Number(report.project.budget ?? 0)
    const currency = report.project.currency || 'XAF'
    const laborCost = Number(report.kpis.total_cost ?? 0)
    const lossCost = Number(report.kpis.total_lost_cost ?? 0)
    const actualCost = laborCost + lossCost
    const progress = Math.max(0, Math.min(100, Number(report.project.progress ?? 0)))
    const burnForecast = progress > 0 ? actualCost / (progress / 100) : 0
    const forecast = Math.max(actualCost, burnForecast)
    const variance = budget > 0 ? budget - forecast : 0
    const consumedPct = budget > 0 ? (actualCost / budget) * 100 : 0
    const forecastPct = budget > 0 ? (forecast / budget) * 100 : 0
    const wbsBudget = wbsNodes.reduce((sum, node) => sum + Number(node.budget ?? 0), 0)
    const unallocatedBudget = budget > 0 ? Math.max(0, budget - wbsBudget) : 0
    const wbsCoveragePct = budget > 0 ? (wbsBudget / budget) * 100 : 0
    const remaining = budget > 0 ? budget - actualCost : 0
    const tone: BudgetTone = budget <= 0
      ? 'neutral'
      : forecast > budget
        ? 'bad'
        : forecastPct >= 85
          ? 'warn'
          : 'good'

    return {
      budget,
      currency,
      laborCost,
      lossCost,
      actualCost,
      forecast,
      variance,
      remaining,
      consumedPct,
      forecastPct,
      wbsBudget,
      unallocatedBudget,
      wbsCoveragePct,
      tone,
    }
  }, [report, wbsNodes])

  if (!report || !budgetData) {
    return (
      <FormSection title="Budget" collapsible defaultExpanded storageKey="project-detail-budget-overview">
        <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-4 text-center text-xs text-muted-foreground">
          Chargement du suivi budgétaire...
        </div>
      </FormSection>
    )
  }

  const {
    budget,
    currency,
    laborCost,
    lossCost,
    actualCost,
    forecast,
    variance,
    remaining,
    consumedPct,
    forecastPct,
    wbsBudget,
    unallocatedBudget,
    wbsCoveragePct,
    tone,
  } = budgetData

  const statusLabel = budget <= 0
    ? 'Budget à définir'
    : tone === 'bad'
      ? 'Dépassement prévu'
      : tone === 'warn'
        ? 'À surveiller'
        : 'Sous contrôle'

  const budgetRows: Array<{ label: string; source: string; amount: number; ratio: number; status: string; tone: BudgetTone }> = [
    {
      label: 'Budget approuvé',
      source: 'Projet',
      amount: budget,
      ratio: budget > 0 ? 100 : 0,
      status: budget > 0 ? 'Base de contrôle' : 'À définir',
      tone: budget > 0 ? 'neutral' : 'warn',
    },
    {
      label: 'Budget ventilé WBS',
      source: 'Lots planification',
      amount: wbsBudget,
      ratio: wbsCoveragePct,
      status: budget > 0 ? `${pct(wbsCoveragePct)} ventilé` : 'Saisir le budget projet',
      tone: budget > 0 && wbsCoveragePct < 80 ? 'warn' : 'neutral',
    },
    {
      label: 'Budget non ventilé',
      source: 'Calcul',
      amount: unallocatedBudget,
      ratio: budget > 0 ? (unallocatedBudget / budget) * 100 : 0,
      status: unallocatedBudget > 0 ? 'À affecter' : 'Ventilation complète',
      tone: unallocatedBudget > 0 ? 'warn' : 'good',
    },
    {
      label: 'Réalisé temps validé',
      source: 'Pointages',
      amount: laborCost,
      ratio: consumedPct,
      status: `${report.kpis.total_actual_hours.toLocaleString('fr-FR')} h réelles`,
      tone: laborCost > 0 ? 'neutral' : 'good',
    },
    {
      label: 'Pertes et surcoûts',
      source: 'Pertes',
      amount: lossCost,
      ratio: budget > 0 ? (lossCost / budget) * 100 : 0,
      status: report.losses_by_category.length > 0 ? `${report.losses_by_category.length} catégorie(s)` : 'Aucune perte',
      tone: lossCost > 0 ? 'bad' : 'good',
    },
    {
      label: 'Réalisé total',
      source: 'Temps + pertes',
      amount: actualCost,
      ratio: consumedPct,
      status: budget > 0 ? `${pct(consumedPct)} consommé` : 'Budget requis',
      tone: budget > 0 && consumedPct > 85 ? 'warn' : 'neutral',
    },
    {
      label: 'Reste à engager',
      source: 'Calcul',
      amount: remaining,
      ratio: budget > 0 ? (remaining / budget) * 100 : 0,
      status: remaining >= 0 ? 'Disponible' : 'Dépassé',
      tone: remaining >= 0 ? 'good' : 'bad',
    },
    {
      label: 'Prévision fin projet',
      source: 'Avancement',
      amount: forecast,
      ratio: forecastPct,
      status: statusLabel,
      tone,
    },
    {
      label: 'Écart prévisionnel',
      source: 'Budget - prévision',
      amount: variance,
      ratio: budget > 0 ? (variance / budget) * 100 : 0,
      status: variance >= 0 ? 'Marge estimée' : 'Dépassement',
      tone: budget <= 0 ? 'neutral' : variance >= 0 ? 'good' : 'bad',
    },
  ]

  const wbsBudgetRows = wbsNodes
    .filter(node => Number(node.budget ?? 0) > 0 || node.cost_center_name)
    .sort((a, b) => Number(b.budget ?? 0) - Number(a.budget ?? 0))
  const memberCostRows = [...report.members]
    .filter(member => member.cost > 0 || member.planned_hours > 0 || member.actual_hours > 0)
    .sort((a, b) => b.cost - a.cost)
  const lossRows = [...report.losses_by_category]
    .filter(loss => loss.cost_amount > 0 || loss.hours_lost > 0 || loss.count > 0)
    .sort((a, b) => b.cost_amount - a.cost_amount)

  return (
    <FormSection title="Budget" collapsible defaultExpanded storageKey="project-detail-budget-overview">
      <div className="min-w-0 max-w-full space-y-3 overflow-hidden">
        <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-border/60 bg-background/40">
          <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
            <CircleDollarSign size={14} className="text-primary" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground">Registre budgétaire</div>
              <div className="truncate text-[10px] text-muted-foreground">
                Sources: projet, WBS, pointages validés, pertes.
              </div>
            </div>
            <span className={cn('max-w-full truncate rounded-full px-2 py-1 text-[10px] font-medium sm:shrink-0', budgetStatusClass(tone))}>
              {statusLabel}
            </span>
          </div>
          <div className="hidden border-b border-border/60 bg-muted/30 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[minmax(150px,1.2fr)_minmax(120px,.8fr)_120px_70px_minmax(120px,1fr)] sm:gap-3">
            <span>Poste</span>
            <span>Source</span>
            <span className="text-right">Montant</span>
            <span className="text-right">%</span>
            <span>Statut</span>
          </div>
          <div className="divide-y divide-border/50">
            {budgetRows.map(row => (
              <div
                key={row.label}
                className="grid min-w-0 gap-1 px-3 py-2 text-xs sm:grid-cols-[minmax(150px,1.2fr)_minmax(120px,.8fr)_120px_70px_minmax(120px,1fr)] sm:items-center sm:gap-3"
              >
                <div className="min-w-0 truncate font-medium text-foreground">{row.label}</div>
                <div className="min-w-0 truncate text-[11px] text-muted-foreground">{row.source}</div>
                <div className={cn('min-w-0 truncate font-semibold tabular-nums sm:text-right', row.amount < 0 && 'text-red-500')}>
                  {row.label === 'Écart prévisionnel' && row.amount > 0 ? '+' : ''}{fmtMoney(row.amount, currency)}
                </div>
                <div className="min-w-0 truncate text-[11px] tabular-nums text-muted-foreground sm:text-right">{pct(row.ratio)}</div>
                <div className="min-w-0">
                  <span className={cn('inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-medium', budgetStatusClass(row.tone))}>
                    {row.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-border/60 bg-background/40">
            <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
              <ReceiptText size={13} className="text-primary" />
              <div className="min-w-0 flex-1 truncate text-xs font-semibold">Ventilation WBS</div>
              <div className="text-[10px] text-muted-foreground sm:ml-auto">{wbsBudgetRows.length} ligne(s)</div>
            </div>
            {wbsBudgetRows.length > 0 ? (
              <div className="divide-y divide-border/50">
                {wbsBudgetRows.map(node => (
                  <div key={node.id} className="grid min-w-0 gap-1 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_120px_70px] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{node.code}</span>
                        <span className="truncate font-medium">{node.name}</span>
                      </div>
                      {node.cost_center_name && <div className="truncate text-[10px] text-muted-foreground">{node.cost_center_name}</div>}
                    </div>
                    <div className="min-w-0 truncate font-medium tabular-nums sm:text-right">{fmtMoney(node.budget, currency)}</div>
                    <div className="min-w-0 truncate text-[10px] text-muted-foreground tabular-nums sm:text-right">
                      {budget > 0 ? pct((Number(node.budget ?? 0) / budget) * 100) : '--'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Aucun lot WBS budgété.
              </div>
            )}
          </div>

          <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-border/60 bg-background/40">
            <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
              <ReceiptText size={13} className="text-primary" />
              <div className="min-w-0 flex-1 truncate text-xs font-semibold">Réalisé par source</div>
              <div className="text-[10px] text-muted-foreground sm:ml-auto">{memberCostRows.length + lossRows.length} ligne(s)</div>
            </div>
            {memberCostRows.length > 0 || lossRows.length > 0 ? (
              <div className="divide-y divide-border/50">
                {memberCostRows.map(member => (
                  <div key={member.member_id} className="grid min-w-0 gap-1 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_90px_110px] sm:items-center">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{member.member_name || 'Ressource'}</div>
                      <div className="truncate text-[10px] text-muted-foreground">{member.specialty || 'Pointage validé'}</div>
                    </div>
                    <div className="min-w-0 truncate text-muted-foreground tabular-nums sm:text-right">{member.actual_hours.toLocaleString('fr-FR')} h</div>
                    <div className="min-w-0 truncate font-medium tabular-nums sm:text-right">{fmtMoney(member.cost, member.currency || currency)}</div>
                  </div>
                ))}
                {lossRows.map(loss => (
                  <div key={loss.category} className="grid min-w-0 gap-1 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_90px_110px] sm:items-center">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{loss.category}</div>
                      <div className="truncate text-[10px] text-muted-foreground">Pertes déclarées · {loss.count} saisie(s)</div>
                    </div>
                    <div className="min-w-0 truncate text-muted-foreground tabular-nums sm:text-right">{loss.hours_lost.toLocaleString('fr-FR')} h</div>
                    <div className="min-w-0 truncate font-medium tabular-nums text-red-500 sm:text-right">{fmtMoney(loss.cost_amount, currency)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Aucun réalisé budgétaire enregistré.
              </div>
            )}
          </div>
        </div>
      </div>
    </FormSection>
  )
}
export function TimeTrackingSection({ projectId }: { projectId: string; members: ProjectMemberType[] }) {
  const { t } = useTranslation()
  return (
    <FormSection
      title={t('projets.timesheet.section_title', 'Feuille de temps')}
      collapsible
      defaultExpanded={false}
      storageKey="project-detail-timesheet"
      className="px-3 py-3"
    >
      <WeeklyTimesheetGrid projectId={projectId} />
    </FormSection>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Allocation Matrix (tasks × members, planned vs actual)
// ════════════════════════════════════════════════════════════════════════════

export function AllocationMatrixSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { data: matrix } = useProjectAllocationMatrix(projectId)
  const createAlloc = useCreateProjectAllocation()
  const updateAlloc = useUpdateProjectAllocation()
  const deleteAlloc = useDeleteProjectAllocation()
  const [editing, setEditing] = useState<{ taskId: string; memberId: string } | null>(null)
  const [editPlanned, setEditPlanned] = useState('')

  if (!matrix) return null
  if (matrix.tasks.length === 0 || matrix.members.length === 0) {
    const missingLabel = matrix.tasks.length === 0
      ? t('projets.allocation_matrix.no_tasks_short', 'Aucune tâche')
      : t('projets.allocation_matrix.no_members_short', 'Aucun membre')
    const missingObject = matrix.tasks.length === 0
      ? t('projets.allocation_matrix.tasks_object', 'des tâches')
      : t('projets.allocation_matrix.members_object', 'des membres')
    return (
      <FormSection title={t('projets.allocation_matrix.section_title', 'Matrice d’affectation')} collapsible defaultExpanded={false} storageKey="project-detail-alloc-matrix">
        <div className="text-[11px] text-muted-foreground text-center py-2">
          {t('projets.allocation_matrix.empty_message', '{{missing}} — créez d’abord {{object}} pour planifier les affectations.', {
            missing: missingLabel,
            object: missingObject,
          })}
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
      title={t('projets.allocation_matrix.section_title_with_counts', 'Matrice d’affectation ({{tasks}} t. × {{members}} m.)', {
        tasks: matrix.tasks.length,
        members: matrix.members.length,
      })}
      collapsible
      defaultExpanded={false}
      storageKey="project-detail-alloc-matrix"
      className="px-3 py-3"
    >
      <div className="text-[10px] text-muted-foreground mb-2">
        {t('projets.allocation_matrix.help_prefix', 'Cliquez sur une cellule pour saisir les heures planifiées. Format :')} <span className="font-mono">{t('projets.allocation_matrix.plan_actual_format', 'planifié / réalisé')}</span>.
      </div>
      <div className="overflow-x-auto border border-border rounded-md max-h-[400px]">
        <table className="text-[11px] w-full">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground sticky left-0 bg-muted/40 z-20 min-w-[180px] max-w-[260px]">{t('projets.allocation_matrix.task', 'Tâche')}</th>
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
                  {task.estimated_hours && <div className="text-[9px] text-muted-foreground">{t('projets.allocation_matrix.estimated_hours_short', 'est. {{hours}}h', { hours: task.estimated_hours })}</div>}
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
                          title={t('projets.allocation_matrix.cell_tooltip', 'Planifié : {{planned}}h\nRéalisé : {{actual}}h\nÉcart : {{variance}}h', {
                            planned: cell.planned_hours,
                            actual: cell.actual_hours,
                            variance: cell.variance_hours.toFixed(1),
                          })}
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

const LOSS_CATEGORIES: { value: string; labelKey: string; fallback: string }[] = [
  { value: 'weather', labelKey: 'projets.losses.categories.weather', fallback: 'Intempéries' },
  { value: 'material', labelKey: 'projets.losses.categories.material', fallback: 'Matériau' },
  { value: 'equipment', labelKey: 'projets.losses.categories.equipment', fallback: 'Équipement' },
  { value: 'manpower', labelKey: 'projets.losses.categories.manpower', fallback: 'Main d’œuvre' },
  { value: 'contractual', labelKey: 'projets.losses.categories.contractual', fallback: 'Contractuel' },
  { value: 'accident', labelKey: 'projets.losses.categories.accident', fallback: 'Accident' },
  { value: 'other', labelKey: 'projets.losses.categories.other', fallback: 'Autre' },
]

export function LossesSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
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
      title={losses && losses.length
        ? t('projets.losses.section_title_with_count', 'Pertes ({{count}})', { count: losses.length })
        : t('projets.losses.section_title', 'Pertes')}
      collapsible
      defaultExpanded={false}
      storageKey="project-detail-losses"
    >
      {losses && losses.length > 0 && (
        <div className="flex items-center gap-3 text-[11px] mb-2 px-2 py-1.5 rounded bg-red-500/5 border border-red-500/10">
          <span className="text-muted-foreground">{t('projets.losses.total', 'Total')} :</span>
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
            const categoryDef = LOSS_CATEGORIES.find(c => c.value === l.category)
            const catLabel = categoryDef ? t(categoryDef.labelKey, categoryDef.fallback) : l.category
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
                  title={t('projets.losses.delete', 'Supprimer la perte')}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground text-center py-2">{t('projets.losses.empty', 'Aucune perte enregistrée')}</div>
      )}

      {!showAdd ? (
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1">
          <Plus size={12} /> {t('projets.losses.declare', 'Déclarer une perte')}
        </button>
      ) : (
        <div className="flex flex-col gap-1.5 p-2 border border-border rounded-md bg-muted/30">
          <div className="grid grid-cols-2 gap-1.5">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${panelInputClass} text-xs`} />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${panelInputClass} text-xs`}>
              {LOSS_CATEGORIES.map(c => <option key={c.value} value={c.value}>{t(c.labelKey, c.fallback)}</option>)}
            </select>
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className={`${panelInputClass} text-xs col-span-2`}>
              <option value="">{t('projets.losses.task_optional', '— Tâche (optionnel) —')}</option>
              {tasks?.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <input type="number" min={0} step={0.25} value={hoursLost} onChange={(e) => setHoursLost(e.target.value)} placeholder={t('projets.losses.hours_lost_placeholder', 'Heures perdues')} className={`${panelInputClass} text-xs`} />
            <input type="number" min={0} step={0.01} value={costAmount} onChange={(e) => setCostAmount(e.target.value)} placeholder={t('projets.losses.cost_placeholder', 'Surcoût')} className={`${panelInputClass} text-xs`} />
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('projets.losses.description_placeholder', 'Description (obligatoire)')} className={`${panelInputClass} text-xs col-span-2`} />
          </div>
          <div className="flex justify-end gap-1">
            <button onClick={reset} className="px-2 py-0.5 text-[10px] rounded hover:bg-muted text-muted-foreground">{t('common.cancel', 'Annuler')}</button>
            <button onClick={handleSubmit} disabled={createLoss.isPending || !description.trim() || (!hoursLost && !costAmount)} className="px-2 py-0.5 text-[10px] rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              {createLoss.isPending ? <Loader2 size={10} className="animate-spin" /> : t('common.save', 'Enregistrer')}
            </button>
          </div>
        </div>
      )}
    </FormSection>
  )
}
