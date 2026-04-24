/**
 * Sub-components of MOCDetailPanel — the per-role validation matrix
 * (ValidationRow, FlagRow), the Production Validation tab, and the
 * Execution tab (signatures + DO/DG accords).
 *
 * Extracted from MOCDetailPanel.tsx to keep the main panel file
 * reviewable. All pieces are tightly coupled to the MOC detail panel
 * and re-imported from there — no external consumers.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Undo2, XCircle } from 'lucide-react'
import {
  FormSection,
} from '@/components/layout/DynamicPanel'
import { RichTextField } from '@/components/shared/RichTextField'
import { SignaturePad } from '@/components/shared/SignaturePad'
import { formatDateTime } from '@/lib/i18n'
import type {
  MOCValidation,
  MOCWithDetails,
} from '@/services/mocService'
import {
  LinkedProjectCard,
  SignatureSlot,
} from './components/MOCDetailHelpers'

export function ValidationRow({
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

export function FlagRow({
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


export function ProductionValidationTab({
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
              imageOwnerType="moc"
              imageOwnerId={moc.id}
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


export type SigSlot =
  | 'initiator'
  | 'hierarchy_reviewer'
  | 'site_chief'
  | 'production'
  | 'director'
  | 'process_engineer'
  | 'do'
  | 'dg'
  | 'close'

export function ExecutionTab({
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
            mocId={moc.id}
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
            mocId={moc.id}
          />
        </div>
      </FormSection>
    </>
  )
}


export function DirectorAccordBlock({
  actor,
  label,
  accord,
  comment,
  signature,
  returnReason,
  disabled,
  onAccord,
  onReturn,
  mocId,
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
  mocId: string
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
        imageOwnerType="moc"
        imageOwnerId={mocId}
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
