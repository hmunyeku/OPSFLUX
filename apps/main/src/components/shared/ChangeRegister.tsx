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
  X,
  XCircle,
} from 'lucide-react'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { RichTextDisplay, RichTextField } from '@/components/shared/RichTextField'
import { EmptyState } from '@/components/ui/EmptyState'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import { UserPicker } from '@/components/shared/UserPicker'
import { useCreateMOCForContext, useInviteMOCValidator, useMOCsForContext, useMOCTypes, useTransitionMOC } from '@/hooks/useMOC'
import { usePermission } from '@/hooks/usePermission'
import { useToast } from '@/components/ui/Toast'
import type { MOCStatus, MOCValidationRole, MOCWithDetails, MOCWorkflowProfile } from '@/services/mocService'
import type { ProjectTask, ProjectWBSNode } from '@/types/api'
import { cn } from '@/lib/utils'

const VALIDATION_ROLE_LABELS: Record<MOCValidationRole, string> = {
  hse: 'HSE / Safety',
  lead_process: 'Lead Process',
  production_manager: 'Production',
  gas_manager: 'Gaz',
  maintenance_manager: 'Maintenance',
  process_engineer: 'Process Engineer',
  metier: 'Métier',
}

interface ChangeRegisterProps {
  contextType: string
  contextId: string | undefined
  contextModule: string
  projectId?: string
  tasks?: ProjectTask[]
  wbsNodes?: ProjectWBSNode[]
  currency?: string
  compact?: boolean
  attachmentCategoryDictionary?: string
  workflowProfile?: MOCWorkflowProfile
}

function contextPayloadValue(moc: MOCWithDetails, key: string) {
  const payload = moc.context_payload
  return payload && typeof payload === 'object' ? payload[key] : null
}

function payloadStringArray(moc: MOCWithDetails, key: string) {
  const raw = contextPayloadValue(moc, key)
  return Array.isArray(raw) ? raw.map(String) : []
}

function formatMoney(value: unknown, currency: string, locale: string) {
  const amount = typeof value === 'number' ? value : Number(value || 0)
  return `${new Intl.NumberFormat(locale || 'fr-FR', { maximumFractionDigits: 0 }).format(amount)} ${currency}`
}

function ChangeRow({
  moc,
  tasks,
  wbsNodes,
  currency,
  attachmentCategoryDictionary,
  workflowProfile,
  onTransition,
  transitionPending,
}: {
  moc: MOCWithDetails
  tasks: ProjectTask[]
  wbsNodes: ProjectWBSNode[]
  currency: string
  attachmentCategoryDictionary?: string
  workflowProfile: MOCWorkflowProfile
  onTransition?: (moc: MOCWithDetails, toStatus: MOCStatus) => void
  transitionPending?: boolean
}) {
  const { t, i18n } = useTranslation()
  const { hasPermission } = usePermission()
  const { toast } = useToast()
  const inviteValidator = useInviteMOCValidator()
  const [expanded, setExpanded] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteUserId, setInviteUserId] = useState<string | null>(null)
  const [inviteRole, setInviteRole] = useState<MOCValidationRole>('hse')
  const [inviteRequired, setInviteRequired] = useState(true)
  const [inviteComment, setInviteComment] = useState('')
  const taskIds = payloadStringArray(moc, 'affected_task_ids')
  const wbsNodeIds = payloadStringArray(moc, 'affected_wbs_node_ids')
  const taskScope = String(contextPayloadValue(moc, 'affected_task_scope') || (taskIds.length > 0 ? 'selected' : 'all'))
  const budgetScope = String(contextPayloadValue(moc, 'budget_scope') || (wbsNodeIds.length > 0 ? 'selected' : 'all'))
  const linkedTasks = tasks.filter((task) => taskIds.includes(task.id))
  const linkedWbsNodes = wbsNodes.filter((node) => wbsNodeIds.includes(node.id))
  const planningImpact = contextPayloadValue(moc, 'planning_impact_days') ?? 0
  const budgetImpact = contextPayloadValue(moc, 'budget_impact_amount') ?? 0
  const payloadCurrency = String(contextPayloadValue(moc, 'currency') || currency)
  const effectiveAttachmentDictionary = attachmentCategoryDictionary
    ?? (workflowProfile === 'project_change' ? 'project_attachment_type' : 'moc_attachment_type')
  const statusLabel = t(
    `shared.change_register.status.${workflowProfile}.${moc.status}`,
    moc.status,
  )
  const requiredValidations = moc.validations.filter((validation) => validation.required)
  const approvedRequiredValidations = requiredValidations.filter((validation) => validation.approved)
  const approvalBlocked = requiredValidations.length > 0 && approvedRequiredValidations.length < requiredValidations.length
  const canRequestValidation = hasPermission('moc.validator.invite') || hasPermission('moc.change.manage')
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

  const requestValidation = async () => {
    if (!inviteUserId) return
    try {
      await inviteValidator.mutateAsync({
        id: moc.id,
        payload: {
          user_id: inviteUserId,
          role: inviteRole,
          required: inviteRequired,
          comments: inviteComment.trim() || null,
        },
      })
      toast({ title: t('shared.change_register.validation_request_sent'), variant: 'success' })
      setInviteOpen(false)
      setInviteUserId(null)
      setInviteRole('hse')
      setInviteRequired(true)
      setInviteComment('')
    } catch {
      toast({ title: t('common.error'), description: t('shared.change_register.validation_request_failed'), variant: 'error' })
    }
  }

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
            {workflowProfile === 'project_change' && (
              <span>
                {t('shared.change_register.budget_scope')}:{' '}
                <b className="text-foreground">
                  {budgetScope === 'selected'
                    ? t('shared.change_register.selected_wbs_count', { count: linkedWbsNodes.length || wbsNodeIds.length })
                    : t('shared.change_register.all_wbs')}
                </b>
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
              <div className="flex flex-wrap gap-1">
                {canRequestValidation && (
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-muted"
                    onClick={() => setInviteOpen((value) => !value)}
                  >
                    <Send size={13} />
                    <span>
                      {inviteOpen ? t('common.cancel') : t('shared.change_register.request_validation')}
                    </span>
                  </button>
                )}
                {projectActions.length > 0 && (
                  <>
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
                  </>
                )}
              </div>
            </div>
          )}
          {workflowProfile === 'project_change' && inviteOpen && (
            <div className="grid gap-2 rounded-md border border-border bg-background/60 p-2 md:grid-cols-[minmax(0,1fr)_160px_auto]">
              <UserPicker
                value={inviteUserId}
                onChange={(uid) => setInviteUserId(uid)}
                placeholder={t('shared.change_register.validation_user') as string}
                className="min-w-0"
              />
              <select
                className="gl-form-input h-8 text-xs"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as MOCValidationRole)}
              >
                {(Object.keys(VALIDATION_ROLE_LABELS) as MOCValidationRole[]).map((role) => (
                  <option key={role} value={role}>
                    {VALIDATION_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={inviteRequired}
                  onChange={(event) => setInviteRequired(event.target.checked)}
                />
                {t('shared.change_register.required')}
              </label>
              <input
                className="gl-form-input h-8 text-xs md:col-span-2"
                value={inviteComment}
                onChange={(event) => setInviteComment(event.target.value)}
                placeholder={t('shared.change_register.validation_comment') as string}
              />
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center gap-1 rounded bg-primary px-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
                disabled={!inviteUserId || inviteValidator.isPending}
                onClick={requestValidation}
              >
                {inviteValidator.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                {t('shared.change_register.send_validation_request')}
              </button>
            </div>
          )}
          {moc.description && <RichTextDisplay value={moc.description} className="text-sm" />}
          {workflowProfile !== 'project_change' && linkedTasks.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {linkedTasks.map((task) => (
                <span key={task.id} className="rounded border border-border bg-muted/30 px-2 py-0.5 text-[11px]">
                  {task.code ? `${task.code} · ` : ''}{task.title}
                </span>
              ))}
            </div>
          )}
          {workflowProfile === 'project_change' && (
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-md border border-border/60 bg-muted/10 p-2">
                <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                  {t('shared.change_register.task_scope')}
                </div>
                {taskScope === 'all' ? (
                  <span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {t('shared.change_register.all_project')}
                  </span>
                ) : linkedTasks.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {linkedTasks.map((task) => (
                      <span key={task.id} className="rounded border border-border bg-muted/30 px-2 py-0.5 text-[11px]">
                        {task.code ? `${task.code} · ` : ''}{task.title}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[12px] text-muted-foreground">
                    {t('shared.change_register.no_target_task')}
                  </span>
                )}
              </div>
              <div className="rounded-md border border-border/60 bg-muted/10 p-2">
                <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                  {t('shared.change_register.budget_scope')}
                </div>
                {budgetScope === 'all' ? (
                  <span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {t('shared.change_register.all_wbs')}
                  </span>
                ) : linkedWbsNodes.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {linkedWbsNodes.map((node) => (
                      <span key={node.id} className="rounded border border-border bg-muted/30 px-2 py-0.5 text-[11px]">
                        {node.code ? `${node.code} · ` : ''}{node.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[12px] text-muted-foreground">
                    {t('shared.change_register.no_target_wbs')}
                  </span>
                )}
              </div>
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
                categoryDictionary={effectiveAttachmentDictionary}
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
  wbsNodes = [],
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
  const [taskScope, setTaskScope] = useState<'all' | 'selected'>('all')
  const [taskIds, setTaskIds] = useState<string[]>([])
  const [wbsScope, setWbsScope] = useState<'all' | 'selected'>('all')
  const [wbsNodeIds, setWbsNodeIds] = useState<string[]>([])

  const selectedTasks = useMemo(
    () => tasks.filter((task) => taskIds.includes(task.id)),
    [taskIds, tasks],
  )
  const selectedWbsNodes = useMemo(
    () => wbsNodes.filter((node) => wbsNodeIds.includes(node.id)),
    [wbsNodeIds, wbsNodes],
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
          affected_task_scope: taskScope,
          affected_task_ids: taskScope === 'selected' ? taskIds : [],
          budget_scope: wbsScope,
          affected_wbs_node_ids: wbsScope === 'selected' ? wbsNodeIds : [],
        },
      },
    })
    setTitle('')
    setDescription('')
    setPlanningImpact('')
    setBudgetImpact('')
    setTaskScope('all')
    setTaskIds([])
    setWbsScope('all')
    setWbsNodeIds([])
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

          {workflowProfile !== 'project_change' && tasks.length > 0 && (
            <select
              className={`${panelInputClass} mt-2`}
              value=""
              onChange={(event) => {
                if (event.target.value && !taskIds.includes(event.target.value)) {
                  setTaskIds([...taskIds, event.target.value])
                }
              }}
            >
              <option value="">
                {selectedTasks.map((task) => task.title).join(', ') || t('shared.change_register.linked_tasks')}
              </option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>{task.code ? `${task.code} · ` : ''}{task.title}</option>
              ))}
            </select>
          )}

          {workflowProfile === 'project_change' && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-border bg-card/30 p-2">
                <div className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">
                  {t('shared.change_register.task_scope')}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    className={cn(
                      'h-8 rounded border px-2 text-xs font-medium',
                      taskScope === 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                    onClick={() => {
                      setTaskScope('all')
                      setTaskIds([])
                    }}
                  >
                    {t('shared.change_register.all_project')}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'h-8 rounded border px-2 text-xs font-medium',
                      taskScope === 'selected' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                    onClick={() => setTaskScope('selected')}
                  >
                    {t('shared.change_register.selected_tasks')}
                  </button>
                </div>
                {taskScope === 'selected' && tasks.length > 0 && (
                  <>
                    <select
                      className={`${panelInputClass} mt-2`}
                      value=""
                      onChange={(event) => {
                        if (event.target.value && !taskIds.includes(event.target.value)) {
                          setTaskIds([...taskIds, event.target.value])
                        }
                      }}
                    >
                      <option value="">{t('shared.change_register.add_target_task')}</option>
                      {tasks.map((task) => (
                        <option key={task.id} value={task.id}>{task.code ? `${task.code} · ` : ''}{task.title}</option>
                      ))}
                    </select>
                    {selectedTasks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {selectedTasks.map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            className="inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-foreground hover:bg-muted"
                            onClick={() => setTaskIds((ids) => ids.filter((id) => id !== task.id))}
                          >
                            {task.code ? `${task.code} · ` : ''}{task.title}
                            <X size={11} />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="rounded-md border border-border bg-card/30 p-2">
                <div className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">
                  {t('shared.change_register.budget_scope')}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    className={cn(
                      'h-8 rounded border px-2 text-xs font-medium',
                      wbsScope === 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                    onClick={() => {
                      setWbsScope('all')
                      setWbsNodeIds([])
                    }}
                  >
                    {t('shared.change_register.all_wbs')}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'h-8 rounded border px-2 text-xs font-medium',
                      wbsScope === 'selected' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                    onClick={() => setWbsScope('selected')}
                  >
                    {t('shared.change_register.selected_wbs')}
                  </button>
                </div>
                {wbsScope === 'selected' && wbsNodes.length > 0 && (
                  <>
                    <select
                      className={`${panelInputClass} mt-2`}
                      value=""
                      onChange={(event) => {
                        if (event.target.value && !wbsNodeIds.includes(event.target.value)) {
                          setWbsNodeIds([...wbsNodeIds, event.target.value])
                        }
                      }}
                    >
                      <option value="">{t('shared.change_register.add_target_wbs')}</option>
                      {wbsNodes.map((node) => (
                        <option key={node.id} value={node.id}>{node.code ? `${node.code} · ` : ''}{node.name}</option>
                      ))}
                    </select>
                    {selectedWbsNodes.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {selectedWbsNodes.map((node) => (
                          <button
                            key={node.id}
                            type="button"
                            className="inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-foreground hover:bg-muted"
                            onClick={() => setWbsNodeIds((ids) => ids.filter((id) => id !== node.id))}
                          >
                            {node.code ? `${node.code} · ` : ''}{node.name}
                            <X size={11} />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
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
              wbsNodes={wbsNodes}
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
