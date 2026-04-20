/**
 * MOCDetailPanel — inspect and act on a Management of Change request.
 *
 * Tabbed layout (TabBar inside DynamicPanelShell), following the same
 * pattern as ProjectDetailPanel / TaskDetailPanel / PaxProfileDetailPanel:
 *
 *   - Fiche         : status header, workflow actions, identification + content
 *   - Validation    : per-role matrix + HAZOP/HAZID/Environmental + PID/ESD flags
 *   - Commentaires  : polymorphic NoteManager (owner_type="moc") — CDC §4.7
 *   - Documents     : polymorphic AttachmentManager — CDC §4.3
 *   - Historique    : status_history timeline — CDC §4.9
 *
 * Permission-aware: workflow buttons, validation controls and delete action
 * are hidden for users who don't hold the matching permission.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Factory,
  History,
  Info,
  Loader2,
  MessageSquare,
  PlayCircle,
  Send,
  FileDown,
  Trash2,
  Undo2,
  XCircle,
} from 'lucide-react'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormSection,
  DetailFieldGrid,
  ReadOnlyRow,
  PanelActionButton,
  DangerConfirmButton,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { TabBar } from '@/components/ui/Tabs'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { MarkdownDisplay } from '@/components/shared/MarkdownField'
import { NoteManager } from '@/components/shared/NoteManager'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { usePermission } from '@/hooks/usePermission'
import { formatDate, formatDateTime } from '@/lib/i18n'
import {
  useDeleteMOC,
  useInviteMOCValidator,
  useMOC,
  useMOCExecutionAccord,
  useMOCFsm,
  useMOCProductionValidation,
  useMOCReturnRequest,
  useMOCSignature,
  useTransitionMOC,
  useUpdateMOC,
  useUpsertMOCValidation,
} from '@/hooks/useMOC'
import { UserPicker } from '@/components/shared/UserPicker'
import { SignaturePad } from '@/components/shared/SignaturePad'
import {
  MOC_STATUS_COLOURS,
  MOC_STATUS_LABELS,
  mocService,
  type MOCStatus,
  type MOCValidation,
  type MOCValidationRole,
  type MOCWithDetails,
} from '@/services/mocService'

const ROLE_LABELS: Record<MOCValidationRole, string> = {
  hse: 'HSE / Safety',
  lead_process: 'Lead Process',
  production_manager: 'Production Manager',
  gas_manager: 'Gas Manager',
  maintenance_manager: 'Maintenance Manager',
  process_engineer: 'Process Engineer',
  metier: 'Métier',
}

// Roles shown permanently in the matrix (paper form page 5 order)
const CORE_ROLES: MOCValidationRole[] = [
  'process_engineer',
  'hse',
  'lead_process',
  'production_manager',
  'gas_manager',
  'maintenance_manager',
]

const COST_BUCKET_LABELS: Record<string, string> = {
  lt_20: '< 20 MXAF',
  '20_to_50': '20 – 50 MXAF',
  '50_to_100': '50 – 100 MXAF',
  gt_100: '> 100 MXAF',
}

type DetailTab =
  | 'fiche'
  | 'production'
  | 'validation'
  | 'execution'
  | 'comments'
  | 'documents'
  | 'history'

interface Props {
  id: string
}

export function MOCDetailPanel({ id }: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()
  const closePanel = useUIStore((s) => s.closeDynamicPanel)
  const { hasPermission } = usePermission()

  const { data: moc, isLoading } = useMOC(id)
  const { data: fsm } = useMOCFsm()
  const transitionMutation = useTransitionMOC()
  const deleteMutation = useDeleteMOC()
  const updateMutation = useUpdateMOC()
  const validationMutation = useUpsertMOCValidation()
  const inviteMutation = useInviteMOCValidator()
  const executionAccordMutation = useMOCExecutionAccord()
  const productionValidationMutation = useMOCProductionValidation()
  const returnMutation = useMOCReturnRequest()
  const signatureMutation = useMOCSignature()

  // Inline ad-hoc invite form state (scoped to the validation tab)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteUserId, setInviteUserId] = useState<string | null>(null)
  const [inviteRole, setInviteRole] = useState<MOCValidationRole>('hse')
  const [inviteLevel, setInviteLevel] = useState<'' | 'DO' | 'DG' | 'DO_AND_DG'>('')
  const [inviteComments, setInviteComments] = useState('')

  // Dictionary-backed labels (admin-customisable per tenant)
  const statusLabels = useDictionaryLabels('moc_status', MOC_STATUS_LABELS)
  const roleLabels = useDictionaryLabels(
    'moc_validation_role',
    ROLE_LABELS as Record<string, string>,
  )

  const [activeTab, setActiveTab] = useState<DetailTab>('fiche')
  const [transitionNote, setTransitionNote] = useState('')
  const [priorityPick, setPriorityPick] = useState<'1' | '2' | '3'>('2')

  if (isLoading || !moc) {
    return (
      <DynamicPanelShell title={t('common.loading')}>
        <div className="flex items-center justify-center p-8">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  const allAllowedFsm = fsm?.transitions[moc.status] ?? []
  const allowedTransitions = allAllowedFsm.filter(
    (tr) => hasPermission(tr.permission) || hasPermission('moc.manage'),
  )
  const canValidate = hasPermission('moc.validate') || hasPermission('moc.manage')
  const canDelete = hasPermission('moc.delete') || hasPermission('moc.manage')
  const canUpdateFlags = hasPermission('moc.update') || hasPermission('moc.manage')

  const doTransition = async (to: MOCStatus) => {
    try {
      const payload: Record<string, unknown> = {}
      if (to === 'approved_to_study') {
        payload.priority = priorityPick
      }
      await transitionMutation.mutateAsync({
        id: moc.id,
        payload: { to_status: to, comment: transitionNote || null, payload },
      })
      toast({
        title: t('moc.toast.transitioned', {
          status: statusLabels[to] ?? MOC_STATUS_LABELS[to],
        }),
        variant: 'success',
      })
      setTransitionNote('')
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { detail?: { message?: string } | string } } })
        ?.response?.data?.detail
      const msg = typeof d === 'string' ? d : d?.message || 'Transition refusée'
      toast({ title: msg, variant: 'error' })
    }
  }

  const doDelete = async () => {
    const ok = await confirm({
      title: t('moc.delete.confirm_title'),
      message: t('moc.delete.confirm_message', { ref: moc.reference }),
    })
    if (!ok) return
    await deleteMutation.mutateAsync(moc.id)
    toast({ title: t('moc.toast.deleted'), variant: 'success' })
    closePanel()
  }

  const toggleFlag = async (field: string, value: boolean) => {
    await updateMutation.mutateAsync({ id: moc.id, payload: { [field]: value } })
  }

  const setValidation = async (
    role: MOCValidationRole,
    fields: {
      required?: boolean
      completed?: boolean
      approved?: boolean | null
      comments?: string
      level?: 'DO' | 'DG' | 'DO_AND_DG' | null
    },
  ) => {
    await validationMutation.mutateAsync({
      id: moc.id,
      payload: { role, ...fields },
    })
  }

  // Split validations by source:
  //  • matrix/manual rows (validator_id=NULL) → one row per CORE_ROLES slot
  //  • invite rows (source='invite', validator_id set) → ad-hoc list below
  const matrixRows = moc.validations.filter(
    (v) => v.source !== 'invite' && !v.validator_id,
  )
  const invitedRows = moc.validations.filter((v) => v.source === 'invite')
  const validationByRole = new Map<MOCValidationRole, MOCValidation>()
  for (const v of matrixRows) {
    if (v.role !== 'metier') validationByRole.set(v.role as MOCValidationRole, v)
  }
  const metierValidations = matrixRows.filter((v) => v.role === 'metier')

  const submitInvite = async () => {
    if (!inviteUserId) return
    try {
      await inviteMutation.mutateAsync({
        id: moc.id,
        payload: {
          user_id: inviteUserId,
          role: inviteRole,
          level: inviteLevel || null,
          comments: inviteComments.trim() || null,
        },
      })
      toast({ title: t('moc.toast.validator_invited'), variant: 'success' })
      setInviteOpen(false)
      setInviteUserId(null)
      setInviteComments('')
      setInviteLevel('')
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: { message?: string } } } })
          ?.response?.data?.detail?.message || t('moc.toast.error_generic')
      toast({ title: msg, variant: 'error' })
    }
  }

  const tabItems = [
    { id: 'fiche' as const, label: t('moc.detail_tab.fiche'), icon: Info },
    {
      id: 'production' as const,
      label: t('moc.detail_tab.production'),
      icon: Factory,
    },
    {
      id: 'validation' as const,
      label: t('moc.detail_tab.validation'),
      icon: ClipboardCheck,
    },
    {
      id: 'execution' as const,
      label: t('moc.detail_tab.execution'),
      icon: PlayCircle,
    },
    {
      id: 'comments' as const,
      label: t('moc.detail_tab.comments'),
      icon: MessageSquare,
    },
    {
      id: 'documents' as const,
      label: t('moc.detail_tab.documents'),
      icon: FileText,
    },
    { id: 'history' as const, label: t('moc.detail_tab.history'), icon: History },
  ]

  return (
    <DynamicPanelShell
      title={moc.reference}
      subtitle={moc.objectives || moc.description || ''}
      actions={[
        <PanelActionButton
          key="pdf"
          icon={<FileDown size={12} />}
          variant="default"
          onClick={async () => {
            try {
              await mocService.downloadPdf(moc.id, 'fr')
            } catch {
              toast({ title: t('moc.toast.pdf_failed'), variant: 'error' })
            }
          }}
        >
          {t('moc.actions.download_pdf')}
        </PanelActionButton>,
        ...(canDelete
          ? [
              <DangerConfirmButton
                key="del"
                icon={<Trash2 size={12} />}
                onConfirm={doDelete}
                disabled={deleteMutation.isPending}
              >
                {t('common.delete')}
              </DangerConfirmButton>,
            ]
          : []),
      ]}
    >
      {/* Status header — always visible above the tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 bg-muted/20">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('moc.fields.status')}
        </span>
        <span
          className={`gl-badge gl-badge-${MOC_STATUS_COLOURS[moc.status]}`}
          title={statusLabels[moc.status] ?? MOC_STATUS_LABELS[moc.status]}
        >
          {statusLabels[moc.status] ?? MOC_STATUS_LABELS[moc.status]}
        </span>
        {moc.priority && (
          <span
            className={`gl-badge gl-badge-${
              moc.priority === '1'
                ? 'danger'
                : moc.priority === '2'
                  ? 'warning'
                  : 'neutral'
            }`}
          >
            {t('moc.priority_prefix')} {moc.priority}
          </span>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {formatDateTime(moc.status_changed_at)}
        </span>
      </div>

      {/* Tabs */}
      <TabBar
        items={tabItems}
        activeId={activeTab}
        onTabChange={setActiveTab}
      />

      <PanelContentLayout>
        {activeTab === 'fiche' && (
          <>
            {/* Allowed workflow actions */}
            {allowedTransitions.length > 0 && (
              <FormSection title={t('moc.section.workflow')} defaultExpanded>
                <div className="space-y-2">
                  <textarea
                    className={panelInputClass}
                    rows={2}
                    value={transitionNote}
                    onChange={(e) => setTransitionNote(e.target.value)}
                    placeholder={t('moc.fields.transition_comment_ph') as string}
                  />
                  {allowedTransitions.some((tr) => tr.to === 'approved_to_study') && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t('moc.fields.priority')}
                      </span>
                      {(['1', '2', '3'] as const).map((p) => (
                        <label key={p} className="flex items-center gap-1 text-xs">
                          <input
                            type="radio"
                            checked={priorityPick === p}
                            onChange={() => setPriorityPick(p)}
                          />
                          P{p}
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {allowedTransitions.map((tr) => {
                      const isCancel = tr.to === 'cancelled'
                      const isReturn =
                        tr.to === 'under_study' && moc.status === 'study_in_validation'
                      const IconComp = isCancel || isReturn ? XCircle : Send
                      return (
                        <PanelActionButton
                          key={tr.to}
                          icon={<IconComp size={12} />}
                          variant={isCancel ? 'danger' : isReturn ? 'default' : 'primary'}
                          onClick={() => doTransition(tr.to)}
                          disabled={transitionMutation.isPending}
                        >
                          {statusLabels[tr.to] ?? MOC_STATUS_LABELS[tr.to]}
                        </PanelActionButton>
                      )
                    })}
                  </div>
                </div>
              </FormSection>
            )}

            {/* Identification */}
            <FormSection title={t('moc.section.identification')} defaultExpanded>
              <DetailFieldGrid>
                <ReadOnlyRow
                  label={t('moc.fields.reference')}
                  value={moc.reference}
                />
                <ReadOnlyRow
                  label={t('moc.fields.created_at')}
                  value={formatDateTime(moc.created_at)}
                />
                <ReadOnlyRow label={t('moc.fields.site')} value={moc.site_label} />
                <ReadOnlyRow
                  label={t('moc.fields.platform')}
                  value={moc.platform_code}
                />
                <ReadOnlyRow
                  label={t('moc.fields.initiator')}
                  value={moc.initiator_display || moc.initiator_name || '—'}
                />
                <ReadOnlyRow
                  label={t('moc.fields.initiator_function')}
                  value={moc.initiator_function || '—'}
                />
                <ReadOnlyRow
                  label={t('moc.fields.modification_type')}
                  value={
                    moc.modification_type === 'permanent'
                      ? t('moc.type_permanent')
                      : moc.modification_type === 'temporary'
                        ? t('moc.type_temporary')
                        : '—'
                  }
                />
                {moc.modification_type === 'temporary' && (
                  <>
                    <ReadOnlyRow
                      label={t('moc.fields.temporary_period')}
                      value={
                        moc.temporary_start_date && moc.temporary_end_date
                          ? `${formatDate(moc.temporary_start_date)} → ${formatDate(moc.temporary_end_date)}`
                          : moc.temporary_duration_days
                            ? `${moc.temporary_duration_days} j`
                            : '—'
                      }
                    />
                  </>
                )}
                <ReadOnlyRow
                  label={t('moc.fields.planned_date')}
                  value={
                    moc.planned_implementation_date
                      ? formatDate(moc.planned_implementation_date)
                      : '—'
                  }
                />
              </DetailFieldGrid>
            </FormSection>

            {/* Content — multi-paragraph fields rendered as Markdown */}
            <FormSection title={t('moc.section.content')} defaultExpanded>
              <DetailFieldGrid>
                <ReadOnlyRow
                  label={t('moc.fields.objectives')}
                  value={moc.objectives || '—'}
                />
                <ReadOnlyRow
                  label={t('moc.fields.description')}
                  value={<MarkdownDisplay value={moc.description} />}
                />
                <ReadOnlyRow
                  label={t('moc.fields.current_situation')}
                  value={<MarkdownDisplay value={moc.current_situation} />}
                />
                <ReadOnlyRow
                  label={t('moc.fields.proposed_changes')}
                  value={<MarkdownDisplay value={moc.proposed_changes} />}
                />
                <ReadOnlyRow
                  label={t('moc.fields.impact_analysis')}
                  value={<MarkdownDisplay value={moc.impact_analysis} />}
                />
              </DetailFieldGrid>
            </FormSection>
          </>
        )}

        {activeTab === 'validation' && (
          <>
            <FormSection
              title={t('moc.section.validation_matrix')}
              defaultExpanded
              headerExtra={
                canValidate ? (
                  <button
                    type="button"
                    className="gl-button gl-button-sm gl-button-default"
                    onClick={() => setInviteOpen((v) => !v)}
                  >
                    {inviteOpen
                      ? t('common.cancel')
                      : t('moc.actions.invite_validator')}
                  </button>
                ) : undefined
              }
            >
              {inviteOpen && (
                <div className="mb-3 rounded border border-border bg-muted/30 p-3 space-y-2">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">
                        {t('moc.fields.invitee')}
                      </label>
                      <UserPicker
                        value={inviteUserId}
                        onChange={(uid) => setInviteUserId(uid)}
                        placeholder={t('moc.fields.invitee_ph') as string}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">
                        {t('moc.fields.role')}
                      </label>
                      <select
                        className="gl-form-input h-8 w-full text-xs"
                        value={inviteRole}
                        onChange={(e) =>
                          setInviteRole(e.target.value as MOCValidationRole)
                        }
                      >
                        {(Object.keys(ROLE_LABELS) as MOCValidationRole[]).map(
                          (r) => (
                            <option key={r} value={r}>
                              {roleLabels[r] ?? ROLE_LABELS[r]}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">
                        {t('moc.fields.level')}
                      </label>
                      <select
                        className="gl-form-input h-8 w-full text-xs"
                        value={inviteLevel}
                        onChange={(e) =>
                          setInviteLevel(
                            e.target.value as '' | 'DO' | 'DG' | 'DO_AND_DG',
                          )
                        }
                      >
                        <option value="">—</option>
                        <option value="DO">DO</option>
                        <option value="DG">DG</option>
                        <option value="DO_AND_DG">DO + DG</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-medium text-muted-foreground">
                        {t('moc.fields.invite_comment')}
                      </label>
                      <input
                        className="gl-form-input h-8 w-full text-xs"
                        value={inviteComments}
                        onChange={(e) => setInviteComments(e.target.value)}
                        placeholder={t('moc.fields.invite_comment_ph') as string}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="gl-button gl-button-sm gl-button-primary"
                      disabled={!inviteUserId || inviteMutation.isPending}
                      onClick={submitInvite}
                    >
                      {t('moc.actions.send_invite')}
                    </button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {CORE_ROLES.map((role) => {
                  const v = validationByRole.get(role)
                  return (
                    <ValidationRow
                      key={role}
                      label={roleLabels[role] ?? ROLE_LABELS[role]}
                      entry={v}
                      onChange={(patch) => setValidation(role, patch)}
                      disabled={validationMutation.isPending || !canValidate}
                      readOnly={!canValidate}
                    />
                  )
                })}
                {metierValidations.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground">
                      {t('moc.section.metier_validations')}
                    </h4>
                    {metierValidations.map((v) => (
                      <ValidationRow
                        key={v.id}
                        label={`Métier — ${v.metier_code ?? '?'}`}
                        entry={v}
                        onChange={(patch) =>
                          validationMutation.mutate({
                            id: moc.id,
                            payload: {
                              role: 'metier',
                              metier_code: v.metier_code,
                              ...patch,
                            },
                          })
                        }
                        disabled={validationMutation.isPending || !canValidate}
                        readOnly={!canValidate}
                      />
                    ))}
                  </div>
                )}
                {invitedRows.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground">
                      {t('moc.section.invited_validators')}
                    </h4>
                    {invitedRows.map((v) => (
                      <ValidationRow
                        key={v.id}
                        label={
                          (v.validator_name || t('moc.invited_user_default')) +
                          ' — ' +
                          (roleLabels[v.role] ?? ROLE_LABELS[v.role])
                        }
                        entry={v}
                        onChange={(patch) =>
                          validationMutation.mutate({
                            id: moc.id,
                            payload: {
                              role: v.role,
                              metier_code: v.metier_code,
                              target_validator_id: v.validator_id,
                              ...patch,
                            },
                          })
                        }
                        disabled={validationMutation.isPending || !canValidate}
                        readOnly={!canValidate}
                      />
                    ))}
                  </div>
                )}
              </div>
            </FormSection>

            <FormSection title={t('moc.section.flags')} defaultExpanded>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <FlagRow
                  label={t('moc.flags.hazop')}
                  required={moc.hazop_required}
                  completed={moc.hazop_completed}
                  disabled={!canUpdateFlags}
                  onToggleRequired={(v) => toggleFlag('hazop_required', v)}
                  onToggleCompleted={(v) => toggleFlag('hazop_completed', v)}
                />
                <FlagRow
                  label={t('moc.flags.hazid')}
                  required={moc.hazid_required}
                  completed={moc.hazid_completed}
                  disabled={!canUpdateFlags}
                  onToggleRequired={(v) => toggleFlag('hazid_required', v)}
                  onToggleCompleted={(v) => toggleFlag('hazid_completed', v)}
                />
                <FlagRow
                  label={t('moc.flags.environmental')}
                  required={moc.environmental_required}
                  completed={moc.environmental_completed}
                  disabled={!canUpdateFlags}
                  onToggleRequired={(v) => toggleFlag('environmental_required', v)}
                  onToggleCompleted={(v) => toggleFlag('environmental_completed', v)}
                />
                <FlagRow
                  label={t('moc.flags.pid_update')}
                  required={moc.pid_update_required}
                  completed={moc.pid_update_completed}
                  disabled={!canUpdateFlags}
                  onToggleRequired={(v) => toggleFlag('pid_update_required', v)}
                  onToggleCompleted={(v) => toggleFlag('pid_update_completed', v)}
                />
                <FlagRow
                  label={t('moc.flags.esd_update')}
                  required={moc.esd_update_required}
                  completed={moc.esd_update_completed}
                  disabled={!canUpdateFlags}
                  onToggleRequired={(v) => toggleFlag('esd_update_required', v)}
                  onToggleCompleted={(v) => toggleFlag('esd_update_completed', v)}
                />
              </div>
            </FormSection>

            {/* Coût du MOC — paper form page 5 */}
            <FormSection title={t('moc.section.cost')} defaultExpanded>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-medium text-muted-foreground">
                  {t('moc.fields.cost_bucket')}
                </label>
                <select
                  className="gl-form-input h-7 text-xs"
                  value={moc.cost_bucket ?? ''}
                  disabled={!canUpdateFlags}
                  onChange={(e) =>
                    updateMutation.mutate({
                      id: moc.id,
                      payload: {
                        cost_bucket:
                          (e.target.value || null) as
                            | 'lt_20'
                            | '20_to_50'
                            | '50_to_100'
                            | 'gt_100'
                            | null,
                      },
                    })
                  }
                >
                  <option value="">—</option>
                  {(['lt_20', '20_to_50', '50_to_100', 'gt_100'] as const).map(
                    (v) => (
                      <option key={v} value={v}>
                        {COST_BUCKET_LABELS[v]}
                      </option>
                    ),
                  )}
                </select>
                {moc.estimated_cost_mxaf !== null && (
                  <span className="text-xs text-muted-foreground">
                    Estimé : {moc.estimated_cost_mxaf} MXAF
                  </span>
                )}
              </div>
            </FormSection>

            {/* "Réalisation du MOC" — DO + DG dual sign-off (paper form p.5) */}
            <FormSection
              title={t('moc.section.execution_accord')}
              defaultExpanded
            >
              <p className="mb-2 text-[11px] text-muted-foreground">
                {t('moc.section.execution_accord_hint')}
              </p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <ExecutionAccordRow
                  label={t('moc.roles.do_full')}
                  accord={moc.do_execution_accord}
                  accordAt={moc.do_execution_accord_at}
                  comment={moc.do_execution_comment}
                  disabled={executionAccordMutation.isPending}
                  onAccord={(accord, comment) =>
                    executionAccordMutation.mutate({
                      id: moc.id,
                      payload: { actor: 'do', accord, comment },
                    })
                  }
                />
                <ExecutionAccordRow
                  label={t('moc.roles.dg_full')}
                  accord={moc.dg_execution_accord}
                  accordAt={moc.dg_execution_accord_at}
                  comment={moc.dg_execution_comment}
                  disabled={executionAccordMutation.isPending}
                  onAccord={(accord, comment) =>
                    executionAccordMutation.mutate({
                      id: moc.id,
                      payload: { actor: 'dg', accord, comment },
                    })
                  }
                />
              </div>
            </FormSection>
          </>
        )}

        {activeTab === 'production' && (
          <ProductionValidationTab
            moc={moc}
            disabled={!canUpdateFlags}
            onSubmit={async (payload) => {
              try {
                await productionValidationMutation.mutateAsync({ id: moc.id, payload })
                toast({
                  title: t('moc.toast.production_saved'),
                  variant: 'success',
                })
              } catch {
                toast({ title: t('moc.toast.error_generic'), variant: 'error' })
              }
            }}
            onReturn={async (reason) => {
              try {
                await returnMutation.mutateAsync({
                  id: moc.id,
                  payload: { stage: 'production', reason },
                })
                toast({ title: t('moc.toast.return_sent'), variant: 'success' })
              } catch {
                toast({ title: t('moc.toast.error_generic'), variant: 'error' })
              }
            }}
          />
        )}

        {activeTab === 'execution' && (
          <ExecutionTab
            moc={moc}
            disabled={!canUpdateFlags}
            onAccord={async (actor, accord, comment, signature) => {
              try {
                await executionAccordMutation.mutateAsync({
                  id: moc.id,
                  payload: { actor, accord, comment, signature },
                })
                toast({ title: t('moc.toast.accord_saved'), variant: 'success' })
              } catch {
                toast({ title: t('moc.toast.error_generic'), variant: 'error' })
              }
            }}
            onReturn={async (stage, reason) => {
              try {
                await returnMutation.mutateAsync({
                  id: moc.id,
                  payload: { stage, reason },
                })
                toast({ title: t('moc.toast.return_sent'), variant: 'success' })
              } catch {
                toast({ title: t('moc.toast.error_generic'), variant: 'error' })
              }
            }}
            onSignature={async (slot, signature) => {
              try {
                await signatureMutation.mutateAsync({
                  id: moc.id,
                  payload: { slot, signature },
                })
              } catch {
                toast({ title: t('moc.toast.error_generic'), variant: 'error' })
              }
            }}
          />
        )}

        {activeTab === 'comments' && (
          <FormSection title={t('moc.section.comments')} defaultExpanded>
            <NoteManager ownerType="moc" ownerId={moc.id} />
          </FormSection>
        )}

        {activeTab === 'documents' && (
          <FormSection title={t('moc.section.attachments')} defaultExpanded>
            <AttachmentManager
              ownerType="moc"
              ownerId={moc.id}
              categoryDictionary="moc_attachment_type"
            />
          </FormSection>
        )}

        {activeTab === 'history' && (
          <FormSection title={t('moc.section.timeline')} defaultExpanded>
            <div className="space-y-2">
              {moc.status_history.map((h) => (
                <div
                  key={h.id}
                  className="rounded-md border border-border/60 bg-card px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {h.old_status && (
                        <>
                          <span className="text-muted-foreground">
                            {statusLabels[h.old_status as MOCStatus] ??
                              MOC_STATUS_LABELS[h.old_status as MOCStatus] ??
                              h.old_status}
                          </span>
                          <span className="text-muted-foreground">→</span>
                        </>
                      )}
                      <span className="font-medium text-foreground">
                        {statusLabels[h.new_status as MOCStatus] ??
                          MOC_STATUS_LABELS[h.new_status as MOCStatus] ??
                          h.new_status}
                      </span>
                    </div>
                    <span className="text-muted-foreground tabular-nums">
                      {formatDateTime(h.created_at)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-muted-foreground">
                    {h.changed_by_name || '—'}
                    {h.note ? ` — ${h.note}` : ''}
                  </div>
                </div>
              ))}
              {moc.status_history.length === 0 && (
                <p className="text-xs text-muted-foreground/60">
                  {t('common.empty_state')}
                </p>
              )}
            </div>
          </FormSection>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// ─── ValidationRow ─────────────────────────────────────────────────────────

function ValidationRow({
  label,
  entry,
  onChange,
  disabled,
  readOnly,
}: {
  label: string
  entry: MOCValidation | undefined
  onChange: (patch: {
    required?: boolean
    completed?: boolean
    approved?: boolean | null
    comments?: string
    level?: 'DO' | 'DG' | 'DO_AND_DG' | null
  }) => void
  disabled: boolean
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-md border border-border/60 bg-card px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={entry?.required ?? false}
              disabled={disabled}
              onChange={(e) => !readOnly && onChange({ required: e.target.checked })}
            />
            {t('moc.fields.required')}
          </label>
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={entry?.completed ?? false}
              disabled={disabled}
              onChange={(e) => !readOnly && onChange({ completed: e.target.checked })}
            />
            {t('moc.fields.completed')}
          </label>
          {!readOnly && (
            <>
              <select
                className="gl-form-input h-6 text-[10px] px-1 py-0"
                value={entry?.level ?? ''}
                disabled={disabled}
                onChange={(e) =>
                  onChange({
                    level: (e.target.value || null) as
                      | 'DO'
                      | 'DG'
                      | 'DO_AND_DG'
                      | null,
                  })
                }
                title="Niveau de validation (DO/DG/DO+DG)"
              >
                <option value="">—</option>
                <option value="DO">DO</option>
                <option value="DG">DG</option>
                <option value="DO_AND_DG">DO+DG</option>
              </select>
              <button
                type="button"
                disabled={disabled}
                className={`gl-button gl-button-sm ${
                  entry?.approved === true ? 'gl-button-confirm' : 'gl-button-default'
                }`}
                onClick={() => onChange({ approved: true })}
              >
                <CheckCircle2 size={12} /> OK
              </button>
              <button
                type="button"
                disabled={disabled}
                className={`gl-button gl-button-sm ${
                  entry?.approved === false ? 'gl-button-danger' : 'gl-button-default'
                }`}
                onClick={() => onChange({ approved: false })}
              >
                <XCircle size={12} /> Rejet
              </button>
            </>
          )}
          {readOnly && entry?.approved != null && (
            <span
              className={`gl-badge ${
                entry.approved ? 'gl-badge-success' : 'gl-badge-danger'
              }`}
            >
              {entry.approved ? 'Approuvé' : 'Rejeté'}
              {entry.level ? ` — ${entry.level}` : ''}
            </span>
          )}
        </div>
      </div>
      {entry?.validator_name && entry.validated_at && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          {entry.validator_name} · {formatDateTime(entry.validated_at)}
          {entry.level ? ` · Niveau ${entry.level}` : ''}
        </div>
      )}
    </div>
  )
}

function ExecutionAccordRow({
  label,
  accord,
  accordAt,
  comment,
  disabled,
  onAccord,
}: {
  label: string
  accord: boolean | null
  accordAt: string | null
  comment: string | null
  disabled?: boolean
  onAccord: (accord: boolean, comment: string | null) => void
}) {
  const [commentDraft, setCommentDraft] = useState(comment ?? '')
  return (
    <div className="rounded-md border border-border/60 bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        {accord === null ? (
          <span className="text-[10px] text-muted-foreground">En attente</span>
        ) : (
          <span
            className={`gl-badge ${
              accord ? 'gl-badge-success' : 'gl-badge-danger'
            }`}
          >
            {accord ? 'Accord' : 'Refus'}
          </span>
        )}
      </div>
      <textarea
        className="gl-form-input mt-2 text-xs"
        rows={2}
        value={commentDraft}
        disabled={disabled}
        onChange={(e) => setCommentDraft(e.target.value)}
        placeholder="Commentaire (optionnel)"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className={`gl-button gl-button-sm ${
            accord === true ? 'gl-button-confirm' : 'gl-button-default'
          }`}
          disabled={disabled}
          onClick={() => onAccord(true, commentDraft.trim() || null)}
        >
          <CheckCircle2 size={12} /> Accord
        </button>
        <button
          type="button"
          className={`gl-button gl-button-sm ${
            accord === false ? 'gl-button-danger' : 'gl-button-default'
          }`}
          disabled={disabled}
          onClick={() => onAccord(false, commentDraft.trim() || null)}
        >
          <XCircle size={12} /> Refus
        </button>
      </div>
      {accordAt && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          {formatDateTime(accordAt)}
        </div>
      )}
    </div>
  )
}

function FlagRow({
  label,
  required,
  completed,
  disabled,
  onToggleRequired,
  onToggleCompleted,
}: {
  label: string
  required: boolean
  completed: boolean
  disabled?: boolean
  onToggleRequired: (v: boolean) => void
  onToggleCompleted: (v: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-card px-3 py-2 text-xs">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={required}
            disabled={disabled}
            onChange={(e) => onToggleRequired(e.target.checked)}
          />
          {t('moc.fields.necessary')}
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={completed}
            disabled={disabled}
            onChange={(e) => onToggleCompleted(e.target.checked)}
          />
          {t('moc.fields.completed')}
        </label>
      </div>
    </div>
  )
}


// ─── ProductionValidationTab (Daxium tab 3) ────────────────────────────────


function ProductionValidationTab({
  moc,
  disabled,
  onSubmit,
  onReturn,
}: {
  moc: MOCWithDetails
  disabled?: boolean
  onSubmit: (payload: {
    validated: boolean
    comment?: string | null
    signature?: string | null
    priority?: '1' | '2' | '3' | null
  }) => Promise<void>
  onReturn: (reason: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [validated, setValidated] = useState<boolean | null>(moc.production_validated)
  const [comment, setComment] = useState(moc.production_comment ?? '')
  const [priority, setPriority] = useState<'1' | '2' | '3'>(
    (moc.priority as '1' | '2' | '3') || '2',
  )
  const [signature, setSignature] = useState<string | null>(moc.production_signature)
  const [returnReason, setReturnReason] = useState('')
  const [returnOpen, setReturnOpen] = useState(false)

  return (
    <>
      <FormSection
        title={t('moc.section.production_validation')}
        defaultExpanded
      >
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="radio"
                name="prodValidated"
                checked={validated === true}
                onChange={() => setValidated(true)}
                disabled={disabled}
              />
              {t('moc.actions.production_validate')}
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="radio"
                name="prodValidated"
                checked={validated === false}
                onChange={() => setValidated(false)}
                disabled={disabled}
              />
              {t('moc.actions.production_refuse')}
            </label>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] text-muted-foreground shrink-0">
              {t('moc.fields.priority')} :
            </label>
            <select
              className="gl-form-input h-7 text-xs"
              value={priority}
              onChange={(e) => setPriority(e.target.value as '1' | '2' | '3')}
              disabled={disabled}
            >
              <option value="1">{t('moc.priority.1')}</option>
              <option value="2">{t('moc.priority.2')}</option>
              <option value="3">{t('moc.priority.3')}</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground">
              {t('moc.fields.comment')}
            </label>
            <textarea
              className="gl-form-input w-full text-xs"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={disabled}
            />
          </div>

          <SignaturePad
            label={t('moc.fields.production_signature')}
            value={signature}
            onChange={setSignature}
            disabled={disabled}
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="gl-button gl-button-sm gl-button-primary"
              disabled={disabled || validated === null}
              onClick={() =>
                onSubmit({
                  validated: validated ?? false,
                  comment: comment.trim() || null,
                  signature,
                  priority,
                })
              }
            >
              <CheckCircle2 size={12} /> {t('common.save')}
            </button>
            <button
              type="button"
              className="gl-button gl-button-sm gl-button-default"
              onClick={() => setReturnOpen((v) => !v)}
              disabled={disabled}
            >
              <Undo2 size={12} /> {t('moc.actions.request_return')}
            </button>
          </div>

          {returnOpen && (
            <div className="rounded border border-border bg-muted/20 p-2 space-y-2">
              <label className="text-[10px] text-muted-foreground">
                {t('moc.fields.return_reason')}
              </label>
              <textarea
                className="gl-form-input w-full text-xs"
                rows={2}
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
              />
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  className="gl-button gl-button-sm gl-button-default"
                  onClick={() => setReturnOpen(false)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="gl-button gl-button-sm gl-button-danger"
                  disabled={returnReason.trim().length < 3}
                  onClick={async () => {
                    await onReturn(returnReason.trim())
                    setReturnOpen(false)
                    setReturnReason('')
                  }}
                >
                  {t('moc.actions.send_return')}
                </button>
              </div>
            </div>
          )}

          {moc.production_return_requested && moc.production_return_reason && (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-destructive">
              <strong>{t('moc.fields.return_reason')} :</strong>{' '}
              {moc.production_return_reason}
            </div>
          )}
        </div>
      </FormSection>
    </>
  )
}


// ─── ExecutionTab (signatures + accords DO/DG + renvois) ──────────────────


function ExecutionTab({
  moc,
  disabled,
  onAccord,
  onReturn,
  onSignature,
}: {
  moc: MOCWithDetails
  disabled?: boolean
  onAccord: (
    actor: 'do' | 'dg',
    accord: boolean,
    comment: string | null,
    signature: string | null,
  ) => Promise<void>
  onReturn: (stage: 'do' | 'dg', reason: string) => Promise<void>
  onSignature: (
    slot:
      | 'initiator'
      | 'site_chief'
      | 'production'
      | 'director'
      | 'process_engineer'
      | 'do'
      | 'dg',
    signature: string,
  ) => Promise<void>
}) {
  const { t } = useTranslation()
  return (
    <>
      <FormSection title={t('moc.section.signatures')} defaultExpanded>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SignatureSlot
            label={t('moc.signature.initiator')}
            value={moc.initiator_signature}
            disabled={disabled}
            onSave={(s) => onSignature('initiator', s)}
          />
          <SignatureSlot
            label={t('moc.signature.site_chief')}
            value={moc.site_chief_signature}
            disabled={disabled}
            onSave={(s) => onSignature('site_chief', s)}
          />
          <SignatureSlot
            label={t('moc.signature.production')}
            value={moc.production_signature}
            disabled={disabled}
            onSave={(s) => onSignature('production', s)}
          />
          <SignatureSlot
            label={t('moc.signature.director')}
            value={moc.director_signature}
            disabled={disabled}
            onSave={(s) => onSignature('director', s)}
          />
          <SignatureSlot
            label={t('moc.signature.process_engineer')}
            value={moc.process_engineer_signature}
            disabled={disabled}
            onSave={(s) => onSignature('process_engineer', s)}
          />
        </div>
      </FormSection>

      <FormSection title={t('moc.section.execution_accord')} defaultExpanded>
        <div className="space-y-3">
          <DirectorAccordBlock
            actor="do"
            label={t('moc.roles.do_full')}
            accord={moc.do_execution_accord}
            comment={moc.do_execution_comment}
            signature={moc.do_signature}
            returnReason={moc.do_return_reason}
            disabled={disabled}
            onAccord={onAccord}
            onReturn={(reason) => onReturn('do', reason)}
          />
          <DirectorAccordBlock
            actor="dg"
            label={t('moc.roles.dg_full')}
            accord={moc.dg_execution_accord}
            comment={moc.dg_execution_comment}
            signature={moc.dg_signature}
            returnReason={moc.dg_return_reason}
            disabled={disabled}
            onAccord={onAccord}
            onReturn={(reason) => onReturn('dg', reason)}
          />
        </div>
      </FormSection>
    </>
  )
}

function SignatureSlot({
  label,
  value,
  disabled,
  onSave,
}: {
  label: string
  value: string | null
  disabled?: boolean
  onSave: (signature: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string | null>(value)
  return (
    <div className="space-y-1">
      <SignaturePad
        label={label}
        value={draft ?? value}
        onChange={(s) => setDraft(s)}
        disabled={disabled}
      />
      {draft && draft !== value && (
        <button
          type="button"
          className="gl-button gl-button-sm gl-button-primary"
          onClick={async () => {
            if (draft) await onSave(draft)
          }}
        >
          <CheckCircle2 size={11} /> {t('moc.actions.save_signature')}
        </button>
      )}
    </div>
  )
}

function DirectorAccordBlock({
  actor,
  label,
  accord,
  comment,
  signature,
  returnReason,
  disabled,
  onAccord,
  onReturn,
}: {
  actor: 'do' | 'dg'
  label: string
  accord: boolean | null
  comment: string | null
  signature: string | null
  returnReason: string | null
  disabled?: boolean
  onAccord: (
    actor: 'do' | 'dg',
    accord: boolean,
    comment: string | null,
    signature: string | null,
  ) => Promise<void>
  onReturn: (reason: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [draftComment, setDraftComment] = useState(comment ?? '')
  const [draftSig, setDraftSig] = useState<string | null>(signature)
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnReasonDraft, setReturnReasonDraft] = useState('')

  return (
    <div className="rounded border border-border bg-muted/10 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <strong className="text-xs">{label}</strong>
        <div className="flex items-center gap-2 text-xs">
          {accord === true && (
            <span className="text-green-600 font-semibold">✓ Accord</span>
          )}
          {accord === false && (
            <span className="text-destructive font-semibold">✗ Refus</span>
          )}
          {accord === null && (
            <span className="text-muted-foreground">— En attente —</span>
          )}
        </div>
      </div>

      <textarea
        className="gl-form-input w-full text-xs"
        rows={2}
        value={draftComment}
        onChange={(e) => setDraftComment(e.target.value)}
        placeholder={t('moc.fields.comment_ph') as string}
        disabled={disabled}
      />

      <SignaturePad
        label={t(`moc.signature.${actor}`)}
        value={draftSig}
        onChange={setDraftSig}
        disabled={disabled}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="gl-button gl-button-sm gl-button-primary"
          disabled={disabled}
          onClick={() => onAccord(actor, true, draftComment.trim() || null, draftSig)}
        >
          <CheckCircle2 size={11} /> {t('moc.actions.accord')}
        </button>
        <button
          type="button"
          className="gl-button gl-button-sm gl-button-danger"
          disabled={disabled}
          onClick={() => onAccord(actor, false, draftComment.trim() || null, draftSig)}
        >
          <XCircle size={11} /> {t('moc.actions.refuse')}
        </button>
        <button
          type="button"
          className="gl-button gl-button-sm gl-button-default"
          onClick={() => setReturnOpen((v) => !v)}
          disabled={disabled}
        >
          <Undo2 size={11} /> {t('moc.actions.request_return')}
        </button>
      </div>

      {returnOpen && (
        <div className="rounded border border-border bg-muted/30 p-2 space-y-2">
          <textarea
            className="gl-form-input w-full text-xs"
            rows={2}
            value={returnReasonDraft}
            onChange={(e) => setReturnReasonDraft(e.target.value)}
            placeholder={t('moc.fields.return_reason_ph') as string}
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              className="gl-button gl-button-sm gl-button-default"
              onClick={() => setReturnOpen(false)}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="gl-button gl-button-sm gl-button-danger"
              disabled={returnReasonDraft.trim().length < 3}
              onClick={async () => {
                await onReturn(returnReasonDraft.trim())
                setReturnOpen(false)
                setReturnReasonDraft('')
              }}
            >
              {t('moc.actions.send_return')}
            </button>
          </div>
        </div>
      )}

      {returnReason && (
        <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          <strong>{t('moc.fields.return_reason')} :</strong> {returnReason}
        </div>
      )}
    </div>
  )
}
