/**
 * MOCDetailPanel — inspect and act on a Management of Change request.
 *
 * Sections:
 *   • Header — reference + status badge + priority
 *   • Info — location, content, modification type, dates
 *   • Workflow — list of allowed transitions as action buttons
 *   • Validation matrix — one row per role with approve / reject controls
 *   • Flags — HAZOP/HAZID/Environmental + PID/ESD update checkboxes
 *   • Timeline — status history (reverse chronological)
 *   • Attachments — polymorphic via AttachmentManager
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Loader2, Send, Trash2, XCircle } from 'lucide-react'
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
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { formatDate, formatDateTime } from '@/lib/i18n'
import {
  useDeleteMOC,
  useMOC,
  useMOCFsm,
  useTransitionMOC,
  useUpdateMOC,
  useUpsertMOCValidation,
} from '@/hooks/useMOC'
import {
  MOC_STATUS_COLOURS,
  MOC_STATUS_LABELS,
  type MOCStatus,
  type MOCValidation,
  type MOCValidationRole,
} from '@/services/mocService'

const ROLE_LABELS: Record<MOCValidationRole, string> = {
  hse: 'HSE / Safety',
  lead_process: 'Lead Process',
  production_manager: 'Production Manager',
  gas_manager: 'Gas Manager',
  maintenance_manager: 'Maintenance Manager',
  metier: 'Métier',
}

const CORE_ROLES: MOCValidationRole[] = [
  'hse',
  'lead_process',
  'production_manager',
  'gas_manager',
  'maintenance_manager',
]

interface Props {
  id: string
}

export function MOCDetailPanel({ id }: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()
  const closePanel = useUIStore((s) => s.closeDynamicPanel)

  const { data: moc, isLoading } = useMOC(id)
  const { data: fsm } = useMOCFsm()
  const transitionMutation = useTransitionMOC()
  const deleteMutation = useDeleteMOC()
  const updateMutation = useUpdateMOC()
  const validationMutation = useUpsertMOCValidation()

  // Dictionary-backed labels (admin-customisable per tenant)
  const statusLabels = useDictionaryLabels('moc_status', MOC_STATUS_LABELS)
  const roleLabels = useDictionaryLabels('moc_validation_role', ROLE_LABELS as Record<string, string>)

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

  const allowedTransitions = fsm?.transitions[moc.status] ?? []

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
      toast({ title: t('moc.toast.transitioned', { status: statusLabels[to] ?? MOC_STATUS_LABELS[to] }), variant: 'success' })
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
    },
  ) => {
    await validationMutation.mutateAsync({
      id: moc.id,
      payload: { role, ...fields },
    })
  }

  const validationByRole = new Map<MOCValidationRole, MOCValidation>()
  for (const v of moc.validations) {
    if (v.role !== 'metier') validationByRole.set(v.role as MOCValidationRole, v)
  }
  const metierValidations = moc.validations.filter((v) => v.role === 'metier')

  return (
    <DynamicPanelShell
      title={moc.reference}
      subtitle={moc.objectives || moc.description || ''}
      actions={[
        <DangerConfirmButton
          key="del"
          icon={<Trash2 size={12} />}
          onConfirm={doDelete}
          disabled={deleteMutation.isPending}
        >
          {t('common.delete')}
        </DangerConfirmButton>,
      ]}
    >
      <PanelContentLayout>
        {/* Status header */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
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
                moc.priority === '1' ? 'danger' : moc.priority === '2' ? 'warning' : 'neutral'
              }`}
            >
              {t('moc.priority_prefix')} {moc.priority}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDateTime(moc.status_changed_at)}
          </span>
        </div>

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
              {allowedTransitions.some((t) => t.to === 'approved_to_study') && (
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
                  const isReturn = tr.to === 'under_study' && moc.status === 'study_in_validation'
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
            <ReadOnlyRow label={t('moc.fields.reference')} value={moc.reference} />
            <ReadOnlyRow label={t('moc.fields.created_at')} value={formatDateTime(moc.created_at)} />
            <ReadOnlyRow label={t('moc.fields.site')} value={moc.site_label} />
            <ReadOnlyRow label={t('moc.fields.platform')} value={moc.platform_code} />
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
                    ? `${t('moc.type_temporary')} (${moc.temporary_duration_days ?? '?'} j)`
                    : '—'
              }
            />
            <ReadOnlyRow
              label={t('moc.fields.planned_date')}
              value={moc.planned_implementation_date ? formatDate(moc.planned_implementation_date) : '—'}
            />
          </DetailFieldGrid>
        </FormSection>

        {/* Content */}
        <FormSection title={t('moc.section.content')} defaultExpanded>
          <DetailFieldGrid>
            <ReadOnlyRow label={t('moc.fields.objectives')} value={moc.objectives || '—'} />
            <ReadOnlyRow label={t('moc.fields.description')} value={moc.description || '—'} />
            <ReadOnlyRow label={t('moc.fields.current_situation')} value={moc.current_situation || '—'} />
            <ReadOnlyRow label={t('moc.fields.proposed_changes')} value={moc.proposed_changes || '—'} />
            <ReadOnlyRow label={t('moc.fields.impact_analysis')} value={moc.impact_analysis || '—'} />
          </DetailFieldGrid>
        </FormSection>

        {/* Validation matrix */}
        <FormSection title={t('moc.section.validation_matrix')} defaultExpanded>
          <div className="space-y-2">
            {CORE_ROLES.map((role) => {
              const v = validationByRole.get(role)
              return (
                <ValidationRow
                  key={role}
                  label={roleLabels[role] ?? ROLE_LABELS[role]}
                  entry={v}
                  onChange={(patch) => setValidation(role, patch)}
                  disabled={validationMutation.isPending}
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
                        payload: { role: 'metier', metier_code: v.metier_code, ...patch },
                      })
                    }
                    disabled={validationMutation.isPending}
                  />
                ))}
              </div>
            )}
          </div>
        </FormSection>

        {/* Flags */}
        <FormSection title={t('moc.section.flags')}>
          <div className="grid grid-cols-2 gap-2">
            <FlagRow
              label="HAZOP"
              required={moc.hazop_required}
              completed={moc.hazop_completed}
              onToggleRequired={(v) => toggleFlag('hazop_required', v)}
              onToggleCompleted={(v) => toggleFlag('hazop_completed', v)}
            />
            <FlagRow
              label="HAZID"
              required={moc.hazid_required}
              completed={moc.hazid_completed}
              onToggleRequired={(v) => toggleFlag('hazid_required', v)}
              onToggleCompleted={(v) => toggleFlag('hazid_completed', v)}
            />
            <FlagRow
              label="Environmental"
              required={moc.environmental_required}
              completed={moc.environmental_completed}
              onToggleRequired={(v) => toggleFlag('environmental_required', v)}
              onToggleCompleted={(v) => toggleFlag('environmental_completed', v)}
            />
            <FlagRow
              label="MAJ PID"
              required={moc.pid_update_required}
              completed={moc.pid_update_completed}
              onToggleRequired={(v) => toggleFlag('pid_update_required', v)}
              onToggleCompleted={(v) => toggleFlag('pid_update_completed', v)}
            />
            <FlagRow
              label="MAJ ESD"
              required={moc.esd_update_required}
              completed={moc.esd_update_completed}
              onToggleRequired={(v) => toggleFlag('esd_update_required', v)}
              onToggleCompleted={(v) => toggleFlag('esd_update_completed', v)}
            />
          </div>
        </FormSection>

        {/* Attachments (polymorphic) */}
        <FormSection title={t('moc.section.attachments')}>
          <AttachmentManager ownerType="moc" ownerId={moc.id} />
        </FormSection>

        {/* Status history */}
        <FormSection title={t('moc.section.timeline')}>
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
                          {statusLabels[h.old_status as MOCStatus] ?? MOC_STATUS_LABELS[h.old_status as MOCStatus] ?? h.old_status}
                        </span>
                        <span className="text-muted-foreground">→</span>
                      </>
                    )}
                    <span className="font-medium text-foreground">
                      {statusLabels[h.new_status as MOCStatus] ?? MOC_STATUS_LABELS[h.new_status as MOCStatus] ?? h.new_status}
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
          </div>
        </FormSection>
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
}: {
  label: string
  entry: MOCValidation | undefined
  onChange: (patch: {
    required?: boolean
    completed?: boolean
    approved?: boolean | null
    comments?: string
  }) => void
  disabled: boolean
}) {
  return (
    <div className="rounded-md border border-border/60 bg-card px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={entry?.required ?? false}
              disabled={disabled}
              onChange={(e) => onChange({ required: e.target.checked })}
            />
            Requis
          </label>
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={entry?.completed ?? false}
              disabled={disabled}
              onChange={(e) => onChange({ completed: e.target.checked })}
            />
            Réalisé
          </label>
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
        </div>
      </div>
      {entry?.validator_name && entry.validated_at && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          {entry.validator_name} · {formatDateTime(entry.validated_at)}
        </div>
      )}
    </div>
  )
}

function FlagRow({
  label,
  required,
  completed,
  onToggleRequired,
  onToggleCompleted,
}: {
  label: string
  required: boolean
  completed: boolean
  onToggleRequired: (v: boolean) => void
  onToggleCompleted: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-card px-3 py-2 text-xs">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => onToggleRequired(e.target.checked)}
          />
          Nécessaire
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={completed}
            onChange={(e) => onToggleCompleted(e.target.checked)}
          />
          Réalisé
        </label>
      </div>
    </div>
  )
}
