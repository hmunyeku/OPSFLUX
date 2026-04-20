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
  Rocket,
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
import { RichTextDisplay } from '@/components/shared/RichTextField'
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
  useMOCTypes,
  usePromoteMOCToProject,
  useTransitionMOC,
  useUpdateMOC,
  useUpsertMOCValidation,
} from '@/hooks/useMOC'
import { UserPicker } from '@/components/shared/UserPicker'
import { SignaturePad } from '@/components/shared/SignaturePad'
import { RichTextField } from '@/components/shared/RichTextField'
import { cn } from '@/lib/utils'
import {
  MOC_STATUS_COLOURS,
  MOC_STATUS_LABELS,
  mocService,
  type MOCLinkedProject,
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
  const promoteMutation = usePromoteMOCToProject()
  // MOC types catalogue — to resolve moc_type_id → label and allow edit.
  const { data: mocTypes = [] } = useMOCTypes(false)

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
  // ── Permission helpers — each UI affordance is gated against the
  // backend permission actually checked on the route it triggers. A
  // missing or mismatched gate causes a 403 after click, which we want
  // to avoid by hiding the affordance upfront.
  const canValidate = hasPermission('moc.validate') || hasPermission('moc.manage')
  const canDelete = hasPermission('moc.delete') || hasPermission('moc.manage')
  const canUpdateFlags = hasPermission('moc.update') || hasPermission('moc.manage')
  // Dedicated, granular gates
  const canInviteValidator =
    hasPermission('moc.validator.invite') || hasPermission('moc.manage')
  const canPromoteToProject =
    hasPermission('moc.promote') || hasPermission('moc.manage')
  const canProductionValidate =
    hasPermission('moc.production.validate') || hasPermission('moc.manage')
  const canDirectorAccord =
    hasPermission('moc.director.validate_study') || hasPermission('moc.manage')
  // Note: CDS "close" is gated at the FSM layer via `moc.site_chief.close`,
  // which is already filtered inside `allowedTransitions` above. Signing
  // the close slot is gated per-slot via `canSignSlot('close')`.

  /** Signature slot → permission + self-service check.
   *  Returns true when the current user is allowed to sign that slot.
   *  Admins (moc.manage) are always allowed. Each signatory can sign
   *  their own slot even without the role permission (the natural
   *  self-service case — they've been designated).
   */
  const canSignSlot = (
    slot:
      | 'initiator'
      | 'hierarchy_reviewer'
      | 'site_chief'
      | 'production'
      | 'director'
      | 'process_engineer'
      | 'do'
      | 'dg'
      | 'close',
  ): boolean => {
    if (hasPermission('moc.manage')) return true
    if (!moc) return false
    // Self-service: the FK owner always signs their own slot.
    const selfMap: Record<string, string | null | undefined> = {
      initiator: moc.initiator_id,
      hierarchy_reviewer: moc.hierarchy_reviewer_id,
      site_chief: moc.site_chief_id,
      production: moc.production_validated_by,
      director: moc.director_id,
      process_engineer: moc.responsible_id,
      do: moc.do_execution_accord_by,
      dg: moc.dg_execution_accord_by,
      close: moc.close_by,
    }
    const selfId = selfMap[slot]
    // User.id lookup — we don't have current user id readily; fall back
    // to the role-permission check and let the backend enforce it.
    const permMap: Record<string, string> = {
      initiator: 'moc.create',
      hierarchy_reviewer: 'moc.update',
      site_chief: 'moc.site_chief.approve',
      production: 'moc.production.validate',
      director: 'moc.director.confirm',
      process_engineer: 'moc.responsible.submit_study',
      do: 'moc.director.validate_study',
      dg: 'moc.director.validate_study',
      close: 'moc.site_chief.close',
    }
    void selfId
    return hasPermission(permMap[slot])
  }

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
      const msg =
        typeof d === 'string'
          ? d
          : d?.message || (t('moc.transition.refused') as string)
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
        ...(canPromoteToProject &&
        !moc.project_id &&
        ['validated', 'execution', 'executed_docs_pending'].includes(moc.status)
          ? [
              <PanelActionButton
                key="promote"
                icon={<Rocket size={12} />}
                variant="primary"
                disabled={promoteMutation.isPending}
                onClick={async () => {
                  try {
                    await promoteMutation.mutateAsync(moc.id)
                    toast({
                      title: t('moc.toast.promoted'),
                      variant: 'success',
                    })
                  } catch (err) {
                    const msg =
                      (err as { response?: { data?: { detail?: { message?: string } } } })
                        ?.response?.data?.detail?.message ||
                      t('moc.toast.error_generic')
                    toast({ title: msg, variant: 'error' })
                  }
                }}
              >
                {t('moc.actions.promote_to_project')}
              </PanelActionButton>,
            ]
          : []),
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
            {/* FSM stepper — shows the 7 milestones of the Daxium/CDC flow
                so the user understands where the MOC stands and what's
                coming next. Hidden for terminal states (cancelled). */}
            {moc.status !== 'cancelled' && (
              <FormSection
                title={t('moc.section.workflow_stepper')}
                defaultExpanded
              >
                <MOCStepper status={moc.status} />
              </FormSection>
            )}

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
                      // Pre-flight — if the backend would reject this
                      // transition, show the missing items inline and
                      // disable the button rather than round-trip a 400.
                      const missing = missingPrereqsFor(
                        tr.to as MOCStatus,
                        moc,
                        transitionNote,
                        priorityPick,
                      )
                      const isBlocked = !isCancel && missing.length > 0
                      return (
                        <div key={tr.to} className="flex flex-col gap-1">
                          <PanelActionButton
                            icon={<IconComp size={12} />}
                            variant={isCancel ? 'danger' : isReturn ? 'default' : 'primary'}
                            onClick={() => doTransition(tr.to)}
                            disabled={transitionMutation.isPending || isBlocked}
                          >
                            {statusLabels[tr.to] ?? MOC_STATUS_LABELS[tr.to]}
                          </PanelActionButton>
                          {isBlocked && (
                            <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 max-w-[28ch]">
                              <strong>{t('moc.transition.prereqs_missing')} :</strong>
                              <ul className="list-disc pl-4 mt-0.5">
                                {missing.map((m) => (
                                  <li key={m}>{t(m)}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
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
                {moc.title && (
                  <ReadOnlyRow label={t('moc.fields.title')} value={moc.title} />
                )}
                {/* Type de MOC — editable while status = created via <select>,
                    read-only after (status locked) */}
                {moc.status === 'created' && canUpdateFlags ? (
                  <ReadOnlyRow
                    label={t('moc.fields.moc_type')}
                    value={
                      <select
                        className={panelInputClass}
                        value={moc.moc_type_id || ''}
                        onChange={(e) =>
                          updateMutation.mutate({
                            id: moc.id,
                            payload: { moc_type_id: e.target.value || null },
                          })
                        }
                      >
                        <option value="">—</option>
                        {mocTypes.map((tp) => (
                          <option key={tp.id} value={tp.id}>
                            {tp.label}
                          </option>
                        ))}
                      </select>
                    }
                  />
                ) : (
                  <ReadOnlyRow
                    label={t('moc.fields.moc_type')}
                    value={
                      mocTypes.find((t2) => t2.id === moc.moc_type_id)?.label ||
                      '—'
                    }
                  />
                )}
                {moc.nature && (
                  <ReadOnlyRow
                    label={t('moc.fields.nature')}
                    value={t(`moc.nature.${moc.nature}`)}
                  />
                )}
                {moc.metiers && moc.metiers.length > 0 && (
                  <ReadOnlyRow
                    label={t('moc.fields.metiers')}
                    value={moc.metiers.join(', ')}
                  />
                )}
                <ReadOnlyRow
                  label={t('moc.fields.initiator')}
                  value={
                    moc.initiator_external_name ||
                    moc.initiator_display ||
                    moc.initiator_name ||
                    '—'
                  }
                />
                <ReadOnlyRow
                  label={t('moc.fields.initiator_function')}
                  value={
                    moc.initiator_external_function ||
                    moc.initiator_function ||
                    '—'
                  }
                />
                {moc.initiator_email && (
                  <ReadOnlyRow
                    label={t('moc.fields.initiator_email')}
                    value={
                      <a
                        href={`mailto:${moc.initiator_email}`}
                        className="text-primary underline"
                      >
                        {moc.initiator_email}
                      </a>
                    }
                  />
                )}
                {/* Chef de projet MOC — assignable by anyone with moc.update
                    while the MOC isn't closed. */}
                <ReadOnlyRow
                  label={t('moc.fields.manager')}
                  value={
                    canUpdateFlags && moc.status !== 'closed' && moc.status !== 'cancelled' ? (
                      <UserPicker
                        value={moc.manager_id}
                        onChange={(uid) =>
                          updateMutation.mutate({
                            id: moc.id,
                            payload: { manager_id: uid || null },
                          })
                        }
                        placeholder={t('moc.fields.manager_ph') as string}
                      />
                    ) : (
                      <span>
                        {moc.manager_id
                          ? moc.manager_id
                          : '—'}
                      </span>
                    )
                  }
                />
                {/* Lien projet — read-only once promoted. */}
                {moc.project_id && (
                  <ReadOnlyRow
                    label={t('moc.fields.linked_project')}
                    value={
                      <a
                        href={`/projets?id=${moc.project_id}`}
                        className="text-primary underline inline-flex items-center gap-1"
                      >
                        <Rocket size={12} />
                        {t('moc.fields.linked_project_view')}
                      </a>
                    }
                  />
                )}
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

            {/* Content — rich multi-paragraph fields laid out full-width.
                A 2-column DetailFieldGrid made the prose columns ~240px
                wide, which is unreadable for anything longer than a few
                lines (and these fields routinely carry markdown, lists,
                tables). Each field is a stacked block taking the whole
                section width. `objectives` is short enough to stay
                inline with its label; the others get a labelled block. */}
            <FormSection title={t('moc.section.content')} defaultExpanded>
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    {t('moc.fields.objectives')}
                  </div>
                  <div className="text-sm">{moc.objectives || '—'}</div>
                </div>
                <FullWidthRichRow
                  label={t('moc.fields.description')}
                  value={moc.description}
                />
                <FullWidthRichRow
                  label={t('moc.fields.current_situation')}
                  value={moc.current_situation}
                />
                <FullWidthRichRow
                  label={t('moc.fields.proposed_changes')}
                  value={moc.proposed_changes}
                />
                <FullWidthRichRow
                  label={t('moc.fields.impact_analysis')}
                  value={moc.impact_analysis}
                />
              </div>
            </FormSection>
          </>
        )}

        {activeTab === 'validation' && (
          <>
            <FormSection
              title={t('moc.section.validation_matrix')}
              defaultExpanded
              headerExtra={
                canInviteValidator ? (
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

            {/* DO/DG accord moved to the "Exécution" tab — that tab provides
                the full flow (signature + motif de renvoi + accord/refus)
                wired through the new execution-accord + signature endpoints.
                Keeping both here would duplicate state and confuse the user. */}
          </>
        )}

        {activeTab === 'production' && (
          <ProductionValidationTab
            moc={moc}
            disabled={!canProductionValidate}
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
            canDirectorAccord={canDirectorAccord}
            canSignSlot={canSignSlot}
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
                title={t('moc.field.approval_level_tooltip')}
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
              {entry.approved ? t('moc.approved') : t('moc.rejected')}
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
            <RichTextField
              value={comment}
              onChange={setComment}
              disabled={disabled}
              rows={3}
              compact
              placeholder={t('moc.fields.comment_ph') as string}
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


type SigSlot =
  | 'initiator'
  | 'hierarchy_reviewer'
  | 'site_chief'
  | 'production'
  | 'director'
  | 'process_engineer'
  | 'do'
  | 'dg'
  | 'close'

function ExecutionTab({
  moc,
  disabled,
  canDirectorAccord,
  canSignSlot,
  onAccord,
  onReturn,
  onSignature,
}: {
  moc: MOCWithDetails
  disabled?: boolean
  /** Per-slot permission check — disables the signature pad when false. */
  canSignSlot: (slot: SigSlot) => boolean
  /** Allowed to give/refuse the DO or DG accord. */
  canDirectorAccord: boolean
  onAccord: (
    actor: 'do' | 'dg',
    accord: boolean,
    comment: string | null,
    signature: string | null,
  ) => Promise<void>
  onReturn: (stage: 'do' | 'dg', reason: string) => Promise<void>
  onSignature: (slot: SigSlot, signature: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const slotRow = (slot: SigSlot, value: string | null, labelKey: string) => (
    <SignatureSlot
      label={t(labelKey)}
      value={value}
      disabled={disabled || !canSignSlot(slot)}
      onSave={(s) => onSignature(slot, s)}
    />
  )
  return (
    <>
      {moc.linked_project && (
        <FormSection title={t('moc.section.linked_project')} defaultExpanded>
          <LinkedProjectCard project={moc.linked_project} />
        </FormSection>
      )}

      <FormSection title={t('moc.section.signatures')} defaultExpanded>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {slotRow('initiator', moc.initiator_signature, 'moc.signature.initiator')}
          {slotRow('hierarchy_reviewer', moc.hierarchy_reviewer_signature, 'moc.signature.hierarchy_reviewer')}
          {slotRow('site_chief', moc.site_chief_signature, 'moc.signature.site_chief')}
          {slotRow('production', moc.production_signature, 'moc.signature.production')}
          {slotRow('director', moc.director_signature, 'moc.signature.director')}
          {slotRow('process_engineer', moc.process_engineer_signature, 'moc.signature.process_engineer')}
          {slotRow('close', moc.close_signature, 'moc.signature.close')}
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
            disabled={disabled || !canDirectorAccord}
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
            disabled={disabled || !canDirectorAccord}
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

      <RichTextField
        value={draftComment}
        onChange={setDraftComment}
        disabled={disabled}
        rows={2}
        compact
        placeholder={t('moc.fields.comment_ph') as string}
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


// ─── MOCStepper — visible 7-step workflow ladder (Daxium-aligned) ──────────
// Groups the 12 FSM statuses into the 7 business milestones of the
// Perenco/CDC flow so the user always knows where the MOC is vs. what
// comes next. A terminal "cancelled" MOC hides the stepper entirely.

const STEPPER_MILESTONES: {
  id: string
  i18nKey: string
  statuses: MOCStatus[]
}[] = [
  { id: 'request', i18nKey: 'moc.stepper.request', statuses: ['created'] },
  { id: 'site_chief', i18nKey: 'moc.stepper.site_chief', statuses: ['approved'] },
  {
    id: 'direction',
    i18nKey: 'moc.stepper.direction',
    statuses: ['submitted_to_confirm', 'stand_by', 'approved_to_study'],
  },
  { id: 'study', i18nKey: 'moc.stepper.study', statuses: ['under_study'] },
  {
    id: 'validation',
    i18nKey: 'moc.stepper.validation',
    statuses: ['study_in_validation', 'validated'],
  },
  { id: 'execution', i18nKey: 'moc.stepper.execution', statuses: ['execution'] },
  {
    id: 'close',
    i18nKey: 'moc.stepper.close',
    statuses: ['executed_docs_pending', 'closed'],
  },
]

function MOCStepper({ status }: { status: MOCStatus }) {
  const { t } = useTranslation()
  const activeIndex = STEPPER_MILESTONES.findIndex((m) =>
    m.statuses.includes(status),
  )
  return (
    <div className="flex flex-wrap items-center gap-1 text-[10px] select-none">
      {STEPPER_MILESTONES.map((m, i) => {
        const done = i < activeIndex
        const active = i === activeIndex
        return (
          <div key={m.id} className="flex items-center gap-1">
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors',
                active && 'bg-primary text-primary-foreground font-semibold shadow-sm',
                done && 'bg-primary/20 text-primary',
                !active && !done && 'bg-muted text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold',
                  active && 'bg-primary-foreground/20',
                  done && 'bg-primary/30',
                  !active && !done && 'bg-background/50',
                )}
              >
                {done ? '✓' : i + 1}
              </span>
              <span>{t(m.i18nKey)}</span>
            </div>
            {i < STEPPER_MILESTONES.length - 1 && (
              <span
                className={cn(
                  'h-px w-3',
                  i < activeIndex ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}


// ─── LinkedProjectCard — summary of the project spawned from the MOC ───
// Shown on top of the Exécution tab when `moc.linked_project` is set.
// Displays code, name, status badge, progress bar and key dates. Clicking
// "Ouvrir" navigates to the project page.

function LinkedProjectCard({ project }: { project: MOCLinkedProject }) {
  const { t } = useTranslation()
  const statusClass =
    project.status === 'completed'
      ? 'bg-green-600 text-white'
      : project.status === 'cancelled'
        ? 'bg-destructive text-destructive-foreground'
        : project.status === 'on_hold'
          ? 'bg-amber-500 text-white'
          : 'bg-primary text-primary-foreground'
  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">
          {project.code}
        </span>
        <strong className="truncate">{project.name}</strong>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
            statusClass,
          )}
        >
          {project.status}
        </span>
        <a
          href={`/projets?id=${project.id}`}
          className="ml-auto text-primary underline inline-flex items-center gap-1"
        >
          {t('moc.fields.linked_project_view')}
        </a>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1 text-[10px] text-muted-foreground">
          <span>{t('common.progress')}</span>
          <span>{project.progress}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {project.start_date && (
          <span>
            {t('common.start_date')} : {formatDate(project.start_date)}
          </span>
        )}
        {project.end_date && (
          <span>
            {t('common.end_date')} : {formatDate(project.end_date)}
          </span>
        )}
        {project.actual_end_date && (
          <span>
            {t('common.actual_end')} : {formatDate(project.actual_end_date)}
          </span>
        )}
      </div>
    </div>
  )
}


// ─── Transition preconditions — mirror the backend guards ─────────────────
// Returns the i18n keys of missing prerequisites for a given target status.
// Must stay in sync with the gates declared in app/services/modules/moc_service.py
// under `async def transition`. If the list is non-empty, the UI disables
// the transition button and surfaces the blockers inline.

function missingPrereqsFor(
  to: MOCStatus,
  moc: MOCWithDetails,
  transitionNote: string,
  priority: '1' | '2' | '3',
): string[] {
  const missing: string[] = []
  if (to === 'approved') {
    if (!moc.initiator_signature) missing.push('moc.prereq.initiator_signature')
    if (moc.is_real_change === null || moc.is_real_change === undefined) {
      missing.push('moc.prereq.is_real_change')
    }
    if (
      !moc.site_chief_comment?.trim() &&
      !transitionNote.trim()
    ) {
      missing.push('moc.prereq.site_chief_comment')
    }
  } else if (to === 'submitted_to_confirm') {
    if (!moc.site_chief_signature) missing.push('moc.prereq.site_chief_signature')
  } else if (to === 'approved_to_study') {
    if (!['1', '2', '3'].includes(priority)) missing.push('moc.prereq.priority')
  } else if (to === 'validated') {
    const unapproved = (moc.validations || []).filter(
      (v) => v.required && !v.approved,
    )
    if (unapproved.length > 0) missing.push('moc.prereq.all_validators_approved')
  } else if (to === 'execution') {
    if (moc.do_execution_accord !== true) missing.push('moc.prereq.do_accord')
    if (moc.dg_execution_accord !== true) missing.push('moc.prereq.dg_accord')
  } else if (to === 'closed') {
    if (moc.pid_update_required && !moc.pid_update_completed) {
      missing.push('moc.prereq.pid_update')
    }
    if (moc.esd_update_required && !moc.esd_update_completed) {
      missing.push('moc.prereq.esd_update')
    }
    if (!moc.close_signature) missing.push('moc.prereq.close_signature')
  }
  return missing
}


// ─── FullWidthRichRow — labelled block for multi-paragraph rich text ─────
// Used instead of ReadOnlyRow inside a DetailFieldGrid when the value is
// long-form rich HTML that needs the whole section width to breathe.

function FullWidthRichRow({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  const hasContent = !!(value && value.trim() && value.trim() !== '<p></p>')
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </div>
      <div className="rounded border border-border bg-muted/10 px-3 py-2">
        {hasContent ? (
          <RichTextDisplay value={value} />
        ) : (
          <span className="text-xs italic text-muted-foreground">—</span>
        )}
      </div>
    </div>
  )
}
