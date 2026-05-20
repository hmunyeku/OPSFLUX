import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  FileText,
  Loader2,
  Plus,
  Send,
  XCircle,
} from 'lucide-react'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { RichTextDisplay, RichTextField } from '@/components/shared/RichTextField'
import { EmptyState } from '@/components/ui/EmptyState'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import { useCreateMOCForContext, useMOCsForContext, useMOCTypes, useTransitionMOC } from '@/hooks/useMOC'
import type { MOCStatus, MOCWithDetails, MOCWorkflowProfile } from '@/services/mocService'
import type { ProjectTask } from '@/types/api'
import { cn } from '@/lib/utils'

interface ChangeRegisterProps {
  contextType: string
  contextId: string | undefined
  contextModule: string
  projectId?: string
  tasks?: ProjectTask[]
  currency?: string
  compact?: boolean
  attachmentCategoryDictionary?: string
  workflowProfile?: MOCWorkflowProfile
}

function contextPayloadValue(moc: MOCWithDetails, key: string) {
  const payload = moc.context_payload
  return payload && typeof payload === 'object' ? payload[key] : null
}

function formatMoney(value: unknown, currency: string, locale: string) {
  const amount = typeof value === 'number' ? value : Number(value || 0)
  return `${new Intl.NumberFormat(locale || 'fr-FR', { maximumFractionDigits: 0 }).format(amount)} ${currency}`
}

function ChangeRow({
  moc,
  tasks,
  currency,
  attachmentCategoryDictionary,
  workflowProfile,
  onTransition,
  transitionPending,
}: {
  moc: MOCWithDetails
  tasks: ProjectTask[]
  currency: string
  attachmentCategoryDictionary?: string
  workflowProfile: MOCWorkflowProfile
  onTransition?: (moc: MOCWithDetails, toStatus: MOCStatus) => void
  transitionPending?: boolean
}) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const rawTaskIds = contextPayloadValue(moc, 'affected_task_ids')
  const taskIds = Array.isArray(rawTaskIds) ? rawTaskIds.map(String) : []
  const linkedTasks = tasks.filter((task) => taskIds.includes(task.id))
  const planningImpact = contextPayloadValue(moc, 'planning_impact_days') ?? 0
  const budgetImpact = contextPayloadValue(moc, 'budget_impact_amount') ?? 0
  const payloadCurrency = String(contextPayloadValue(moc, 'currency') || currency)
  const statusLabel = t(
    `shared.change_register.status.${workflowProfile}.${moc.status}`,
    moc.status,
  )
  const requiredValidations = moc.validations.filter((validation) => validation.required)
  const approvedRequiredValidations = requiredValidations.filter((validation) => validation.approved)
  const approvalBlocked = requiredValidations.length > 0 && approvedRequiredValidations.length < requiredValidations.length
  const projectActions: Array<{ to: MOCStatus; icon: typeof Send; disabled?: boolean }> = workflowProfile === 'project_change'
    ? ([
      ...(moc.status === 'draft' ? [{ to: 'submitted' as MOCStatus, icon: Send }] : []),
      ...(moc.status === 'submitted' ? [
        { to: 'in_review' as MOCStatus, icon: CircleDot },
        { to: 'rejected' as MOCStatus, icon: XCircle },
      ] : []),
      ...(moc.status === 'in_review' ? [
        { to: 'approved' as MOCStatus, icon: CheckCircle2, disabled: approvalBlocked },
        { to: 'rejected' as MOCStatus, icon: XCircle },
      ] : []),
      ...(moc.status === 'approved' ? [{ to: 'implemented' as MOCStatus, icon: CheckCircle2 }] : []),
      ...(moc.status === 'implemented' ? [{ to: 'closed' as MOCStatus, icon: CheckCircle2 }] : []),
    ])
    : []

  return (
    <article className="rounded-md border border-border bg-card/40">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start gap-3 px-3 py-2 text-left"
      >
        <ChevronDown
          size={14}
          className={cn('mt-1 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono">{moc.reference}</span>
            <span className="rounded border border-border px-1.5 py-0.5">{statusLabel}</span>
            {workflowProfile !== 'project_change' && moc.priority && (
              <span className="rounded border border-border px-1.5 py-0.5">P{moc.priority}</span>
            )}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-foreground">
            {moc.title || moc.objectives || moc.reference}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            <span>
              {t('shared.change_register.planning_impact')}: <b className="text-foreground">{String(planningImpact)}j</b>
            </span>
            <span>
              {t('shared.change_register.budget_impact')}: <b className="text-foreground">{formatMoney(budgetImpact, payloadCurrency, i18n.language)}</b>
            </span>
            {linkedTasks.length > 0 && (
              <span>
                {t('shared.change_register.linked_tasks')}: <b className="text-foreground">{linkedTasks.length}</b>
              </span>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {workflowProfile === 'project_change' && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-2 py-2">
              <div className="text-[12px] text-muted-foreground">
                {requiredValidations.length > 0 ? (
                  <>
                    {approvedRequiredValidations.length}/{requiredValidations.length}{' '}
                    {t('shared.change_register.validations_approved')}
                  </>
                ) : (
                  t('shared.change_register.no_validation_required')
                )}
              </div>
              {projectActions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {projectActions.map((action) => {
                    const Icon = action.icon
                    const label = t(`shared.change_register.actions.${action.to}`, action.to)
                    return (
                      <button
                        key={action.to}
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
                        disabled={transitionPending || action.disabled}
                        title={action.disabled ? t('shared.change_register.approval_blocked') : label}
                        onClick={() => onTransition?.(moc, action.to)}
                      >
                        {transitionPending ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
                        <span>{label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          {moc.description && <RichTextDisplay value={moc.description} className="text-sm" />}
          {linkedTasks.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {linkedTasks.map((task) => (
                <span key={task.id} className="rounded border border-border bg-muted/30 px-2 py-0.5 text-[11px]">
                  {task.code ? `${task.code} · ` : ''}{task.title}
                </span>
              ))}
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {t('shared.change_register.attachments')}
              </div>
              <AttachmentManager
                ownerType="moc"
                ownerId={moc.id}
                compact
                categoryDictionary={attachmentCategoryDictionary || 'moc_attachment_type'}
              />
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {t('shared.change_register.notes')}
              </div>
              <NoteManager ownerType="moc" ownerId={moc.id} compact />
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

export function ChangeRegister({
  contextType,
  contextId,
  contextModule,
  tasks = [],
  currency = 'XAF',
  compact = true,
  attachmentCategoryDictionary,
  workflowProfile = 'process_moc',
}: ChangeRegisterProps) {
  const { t } = useTranslation()
  const { data: mocs = [], isLoading } = useMOCsForContext(contextType, contextId)
  const { data: mocTypes = [] } = useMOCTypes(false)
  const create = useCreateMOCForContext()
  const transition = useTransitionMOC()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [planningImpact, setPlanningImpact] = useState('')
  const [budgetImpact, setBudgetImpact] = useState('')
  const [mocTypeId, setMocTypeId] = useState('')
  const [taskIds, setTaskIds] = useState<string[]>([])

  const selectedTasksLabel = useMemo(
    () => tasks.filter((task) => taskIds.includes(task.id)).map((task) => task.title).join(', '),
    [taskIds, tasks],
  )

  const save = async () => {
    if (!contextId || !title.trim()) return
    await create.mutateAsync({
      contextType,
      contextId,
      payload: {
        title: title.trim(),
        description: description || null,
        objectives: title.trim(),
        context_module: contextModule,
        workflow_profile: workflowProfile,
        moc_type_id: mocTypeId || null,
        context_payload: {
          planning_impact_days: planningImpact ? Number(planningImpact) : 0,
          budget_impact_amount: budgetImpact ? Number(budgetImpact) : 0,
          currency,
          affected_task_ids: taskIds,
        },
      },
    })
    setTitle('')
    setDescription('')
    setPlanningImpact('')
    setBudgetImpact('')
    setTaskIds([])
    setOpen(false)
  }

  return (
    <div className={cn('space-y-3', compact && 'text-sm')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {mocs.length} {t('shared.change_register.details')}
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary"
        >
          <Plus size={14} /> {t('shared.change_register.add')}
        </button>
      </div>

      {open && (
        <div className="rounded-md border border-border bg-background/40 p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <input
              className={panelInputClass}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('shared.change_register.title_placeholder')}
            />
            <select className={panelInputClass} value={mocTypeId} onChange={(event) => setMocTypeId(event.target.value)}>
              <option value="">
                {workflowProfile === 'project_change'
                  ? t('shared.change_register.project_change_type')
                  : 'MOC'}
              </option>
              {mocTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
            <input
              className={panelInputClass}
              type="number"
              value={planningImpact}
              onChange={(event) => setPlanningImpact(event.target.value)}
              placeholder={t('shared.change_register.planning_impact')}
            />
            <input
              className={panelInputClass}
              type="number"
              value={budgetImpact}
              onChange={(event) => setBudgetImpact(event.target.value)}
              placeholder={t('shared.change_register.budget_impact')}
            />
          </div>

          {tasks.length > 0 && (
            <select
              className={`${panelInputClass} mt-2`}
              value=""
              onChange={(event) => {
                if (event.target.value && !taskIds.includes(event.target.value)) {
                  setTaskIds([...taskIds, event.target.value])
                }
              }}
            >
              <option value="">{selectedTasksLabel || t('shared.change_register.linked_tasks')}</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>{task.code ? `${task.code} · ` : ''}{task.title}</option>
              ))}
            </select>
          )}

          <div className="mt-2">
            <RichTextField
              value={description}
              onChange={setDescription}
              placeholder={t('common.description')}
              compact
              rows={3}
            />
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={!title.trim() || create.isPending}>
              {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-4 text-sm text-muted-foreground">{t('common.loading')}</div>
      ) : mocs.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title={t('shared.change_register.empty_title')}
          description={t('shared.change_register.empty_description')}
        />
      ) : (
        <div className="space-y-2">
          {mocs.map((moc) => (
            <ChangeRow
              key={moc.id}
              moc={moc}
              tasks={tasks}
              currency={currency}
              attachmentCategoryDictionary={attachmentCategoryDictionary}
              workflowProfile={workflowProfile}
              transitionPending={transition.isPending}
              onTransition={(change, toStatus) => {
                void transition.mutateAsync({
                  id: change.id,
                  payload: { to_status: toStatus },
                })
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
