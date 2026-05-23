import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Loader2,
  Save,
  Send,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { RichTextField } from '@/components/shared/RichTextField'
import { UserPicker } from '@/components/shared/UserPicker'
import { useToast } from '@/components/ui/Toast'
import {
  buildAuditAnswerDrafts,
  draftsToUpsertPayload,
  getDraftProgress,
  type ComplianceAuditAnswerDraft,
} from '@/lib/complianceAudit'
import { cn } from '@/lib/utils'
import { useSubmitComplianceAudit, useUpdateComplianceAuditAnswers } from '@/hooks/useConformite'
import type { ComplianceAudit } from '@/types/api'

interface ComplianceAuditDetailModalProps {
  audit: ComplianceAudit | null
  open: boolean
  onClose: () => void
}

export function scoreColor(score: number | null | undefined) {
  if (score === null || score === undefined) return 'text-muted-foreground'
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-destructive'
}

type AuditChoiceOption = {
  value: string
  label: string
  score: number | null
}

function getChoiceOptions(optionsJson: Record<string, unknown> | null): AuditChoiceOption[] {
  const choices = optionsJson?.choices
  if (Array.isArray(choices)) {
    return choices
      .map((choice) => {
        if (typeof choice === 'string') return { value: choice, label: choice, score: null }
        if (!choice || typeof choice !== 'object') return null
        const raw = choice as Record<string, unknown>
        const value = String(raw.value ?? raw.label ?? '').trim()
        const label = String(raw.label ?? raw.value ?? '').trim()
        const score = typeof raw.score === 'number' ? raw.score : null
        return value && label ? { value, label, score } : null
      })
      .filter((choice): choice is AuditChoiceOption => !!choice)
  }
  const raw = optionsJson?.options
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean).map((option) => ({ value: option, label: option, score: null }))
  return []
}

function answerLabel(value: Record<string, unknown> | null): string {
  const raw = value?.value ?? value?.text
  return typeof raw === 'string' ? raw : ''
}

export function ComplianceAuditDetailModal({ audit, open, onClose }: ComplianceAuditDetailModalProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const updateAnswers = useUpdateComplianceAuditAnswers()
  const submitAudit = useSubmitComplianceAudit()
  const [drafts, setDrafts] = useState<ComplianceAuditAnswerDraft[]>([])
  const [validatorId, setValidatorId] = useState<string | null>(null)
  const [validators, setValidators] = useState<Array<{ id: string; label: string }>>([])
  const [submitComment, setSubmitComment] = useState('')

  useEffect(() => {
    setDrafts(audit ? buildAuditAnswerDrafts(audit) : [])
    setValidators([])
    setValidatorId(null)
    setSubmitComment('')
  }, [audit?.id, audit?.updated_at])

  const progress = useMemo(() => getDraftProgress(drafts), [drafts])
  const readOnly = !!audit && ['submitted', 'in_review', 'validated', 'closed'].includes(audit.status)
  const canSubmit = progress.canSubmit && validators.length > 0 && !readOnly && !!audit && !audit.validation_moc_id

  const updateDraft = (questionId: string, patch: Partial<ComplianceAuditAnswerDraft>) => {
    setDrafts((prev) => prev.map((draft) => (
      draft.question.id === questionId ? { ...draft, ...patch } : draft
    )))
  }

  const save = async () => {
    if (!audit) return
    await updateAnswers.mutateAsync({ id: audit.id, payload: draftsToUpsertPayload(drafts) })
    toast({ title: t('conformite.rules.audits.saved'), variant: 'success' })
  }

  const submit = async () => {
    if (!audit || !canSubmit) return
    await submitAudit.mutateAsync({
      id: audit.id,
      payload: {
        validator_user_ids: validators.map((validator) => validator.id),
        comment: submitComment.trim() || null,
      },
    })
    toast({ title: t('conformite.rules.audits.submitted'), variant: 'success' })
    onClose()
  }

  const addValidator = (id: string | null, item?: { first_name?: string; last_name?: string; email?: string }) => {
    if (!id || validators.some((validator) => validator.id === id)) return
    const label = `${item?.first_name ?? ''} ${item?.last_name ?? ''}`.trim() || item?.email || id
    setValidators((prev) => [...prev, { id, label }])
    setValidatorId(null)
  }

  if (!audit) return null

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-black/50 backdrop-blur-sm animate-in fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[var(--z-modal)] flex max-h-[92vh] w-[min(96vw,72rem)] max-w-[calc(100vw-0.75rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-card shadow-xl animate-in fade-in slide-in-from-bottom-4"
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                <ClipboardCheck size={16} className="text-primary" />
                <span className="truncate">{audit.title}</span>
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 truncate text-xs text-muted-foreground">
                {audit.reference} · {audit.template?.name ?? audit.template?.audit_type ?? audit.status}
              </Dialog.Description>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={16} />
            </button>
          </header>

          <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-border bg-muted/20 px-4 py-3 md:grid-cols-5">
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">{t('conformite.rules.audits.score')}</p>
              <p className={cn('text-lg font-semibold', scoreColor(audit.score_percent))}>{audit.score_percent ?? '—'}%</p>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">{t('conformite.rules.audits.progress')}</p>
              <p className="text-lg font-semibold text-foreground">{progress.completionPercent}%</p>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">{t('conformite.rules.audits.required')}</p>
              <p className="text-lg font-semibold text-foreground">{progress.answeredRequired}/{progress.requiredQuestions}</p>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">{t('conformite.rules.audits.evidence')}</p>
              <p className={cn('text-lg font-semibold', progress.missingEvidence ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>
                {progress.missingEvidence}
              </p>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">{t('conformite.rules.audits.status')}</p>
              <p className="truncate text-lg font-semibold text-foreground">{audit.status}</p>
            </div>
          </div>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="space-y-3">
              {drafts.map((draft, index) => (
                <QuestionCard
                  key={draft.question.id}
                  index={index}
                  draft={draft}
                  readOnly={readOnly}
                  onChange={(patch) => updateDraft(draft.question.id, patch)}
                />
              ))}
              {drafts.length === 0 && (
                <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {t('conformite.rules.audits.no_questions')}
                </div>
              )}
            </div>
          </main>

          <footer className="shrink-0 border-t border-border bg-background px-4 py-3">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="min-w-0 space-y-2">
                {!readOnly && (
                  <>
                    <div className="grid gap-2 md:grid-cols-[minmax(12rem,24rem)_1fr] md:items-center">
                      <UserPicker
                        value={validatorId}
                        onChange={addValidator}
                        placeholder={t('conformite.rules.audits.add_validator')}
                      />
                      <div className="flex min-w-0 flex-wrap gap-1">
                        {validators.map((validator) => (
                          <button
                            key={validator.id}
                            type="button"
                            onClick={() => setValidators((prev) => prev.filter((row) => row.id !== validator.id))}
                            className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-border px-2 text-xs text-foreground hover:bg-muted"
                          >
                            <span className="truncate">{validator.label}</span>
                            <X size={12} />
                          </button>
                        ))}
                        {validators.length === 0 && (
                          <span className="inline-flex h-7 items-center text-xs text-muted-foreground">
                            {t('conformite.rules.audits.validator_required')}
                          </span>
                        )}
                      </div>
                    </div>
                    <RichTextField
                      value={submitComment}
                      onChange={setSubmitComment}
                      placeholder={t('conformite.rules.audits.submit_comment')}
                      rows={3}
                    />
                  </>
                )}
                {!progress.canSubmit && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle size={13} />
                    {t('conformite.rules.audits.submit_blocked', {
                      missing: progress.missingRequired,
                      evidence: progress.missingEvidence,
                    })}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={readOnly || updateAnswers.isPending}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updateAnswers.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  {t('conformite.rules.audits.save')}
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit || submitAudit.isPending}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitAudit.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {t('conformite.rules.audits.submit')}
                </button>
              </div>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// Exporte pour reutilisation dans ComplianceAuditDetailPanel (refonte DetailPanel
// en remplacement de la modal). Garde le composant unique pour ne pas dupliquer
// la logique de rendu/saisie des reponses + attachments.
export function QuestionCard({
  index,
  draft,
  readOnly,
  onChange,
}: {
  index: number
  draft: ComplianceAuditAnswerDraft
  readOnly: boolean
  onChange: (patch: Partial<ComplianceAuditAnswerDraft>) => void
}) {
  const { t } = useTranslation()
  const choices = getChoiceOptions(draft.question.options_json)
  const currentValue = answerLabel(draft.responseValue)
  const answered = draft.score !== null || currentValue.trim().length > 0
  const missingEvidence = draft.question.attachment_required && draft.attachmentCount <= 0

  return (
    <article className="rounded-md border border-border bg-background">
      <div className="flex flex-col gap-2 border-b border-border/70 px-3 py-3 @[480px]:flex-row @[480px]:items-start @[480px]:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-muted px-1.5 text-xs font-semibold text-muted-foreground">
              {index + 1}
            </span>
            {draft.question.code && <span className="text-xs font-medium uppercase text-primary">{draft.question.code}</span>}
            {draft.question.required && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">{t('conformite.rules.audits.required_short')}</span>}
            {draft.question.attachment_required && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">{t('conformite.rules.audits.proof_required')}</span>}
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">{draft.question.text}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {answered ? <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" /> : <AlertTriangle size={16} className="text-muted-foreground" />}
          <span className={cn('text-sm font-semibold', scoreColor(draft.score))}>{draft.score ?? '—'}%</span>
        </div>
      </div>

      <div className="grid gap-3 p-3 @[540px]:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
        <div className="min-w-0 space-y-3">
          {draft.question.response_type === 'yes_no' ? (
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'yes', label: t('conformite.rules.audits.yes'), score: 100 },
                { value: 'no', label: t('conformite.rules.audits.no'), score: 0 },
                { value: 'partial', label: t('conformite.rules.audits.partial'), score: 50 },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={readOnly}
                  onClick={() => onChange({ responseValue: { value: option.value }, score: option.score })}
                  className={cn(
                    'inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60',
                    currentValue === option.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:bg-muted',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : draft.question.response_type === 'choice' ? (
            <select
              disabled={readOnly}
              value={currentValue}
              onChange={(event) => {
                const choice = choices.find((item) => item.value === event.target.value)
                onChange({
                  responseValue: choice ? { value: choice.value, label: choice.label } : { value: event.target.value },
                  score: choice?.score ?? draft.score ?? null,
                })
              }}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground disabled:opacity-60"
            >
              <option value="">{t('conformite.rules.audits.select')}</option>
              {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            </select>
          ) : (
            <RichTextField
              value={currentValue}
              onChange={(value) => onChange({ responseValue: { text: value } })}
              placeholder={t('conformite.rules.audits.response_placeholder')}
              rows={4}
              disabled={readOnly}
            />
          )}

          {draft.question.response_type !== 'yes_no' && (
            <label className="grid gap-1 text-xs font-medium text-muted-foreground sm:max-w-40">
              {t('conformite.rules.audits.score')}
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                disabled={readOnly}
                value={draft.score ?? ''}
                onChange={(event) => onChange({ score: event.target.value === '' ? null : Number(event.target.value) })}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground disabled:opacity-60"
              />
            </label>
          )}

          <RichTextField
            value={draft.notes}
            onChange={(value) => onChange({ notes: value })}
            placeholder={t('conformite.rules.audits.notes_placeholder')}
            rows={3}
            disabled={readOnly}
          />
        </div>

        <div className="min-w-0 rounded-md border border-border/70 bg-muted/20 p-2">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FileCheck2 size={13} />
              {t('conformite.rules.audits.evidence')}
            </span>
            <span className={missingEvidence ? 'text-destructive' : 'text-muted-foreground'}>{draft.attachmentCount}</span>
          </div>
          {draft.answerId ? (
            <AttachmentManager
              ownerType="compliance_audit_answer"
              ownerId={draft.answerId}
              compact
              readOnly={readOnly}
              onCountChange={(count) => {
                if (count !== draft.attachmentCount) onChange({ attachmentCount: count })
              }}
            />
          ) : (
            <p className="rounded border border-dashed border-border p-3 text-xs text-muted-foreground">
              {t('conformite.rules.audits.save_before_evidence')}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
