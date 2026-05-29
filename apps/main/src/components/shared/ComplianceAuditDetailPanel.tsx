/**
 * ComplianceAuditDetailPanel — saisie et soumission d'un rapport d'audit
 * fournisseur, rendu en DynamicPanelShell inline (pas une modal).
 *
 * Refonte UX : avant on utilisait ComplianceAuditDetailModal (Radix Dialog
 * full-screen). Le user a demande de basculer sur le pattern DetailPanel
 * standard OPSFLUX (DynamicPanelShell + FormSection) pour coherence avec
 * Tiers/Projets/PaxLog.
 *
 * Rendu inline = le panel s'affiche A LA PLACE de la liste audits dans
 * SupplierAuditManager. L'utilisateur garde son contexte tier ouvert (panel
 * Tier reste actif), et fait juste un "drill-down" pour saisir l'audit. Un
 * bouton "Retour" en header ferme l'audit et revient a la liste.
 *
 * AttachmentManager (composant shared) reste cable par QuestionCard sur
 * ownerType="compliance_audit_answer" — preserve par reutilisation de
 * QuestionCard exporte depuis l'ancienne modal.
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, ExternalLink, FileCheck2, Loader2, Lock, Pencil, Save, Send, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DynamicPanelShell, FormSection } from '@/components/layout/DynamicPanel'
import { QuestionCard, scoreColor } from '@/components/shared/ComplianceAuditDetailModal'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { RichTextDisplay, RichTextField } from '@/components/shared/RichTextField'
import { UserPicker } from '@/components/shared/UserPicker'
import { useToast } from '@/components/ui/Toast'
import { usePermission } from '@/hooks/usePermission'
import { useUIStore } from '@/stores/uiStore'
import {
  buildAuditAnswerDrafts,
  draftsToUpsertPayload,
  getDraftProgress,
  type ComplianceAuditAnswerDraft,
} from '@/lib/complianceAudit'
import { cn } from '@/lib/utils'
import { useSubmitComplianceAudit, useUpdateComplianceAuditAnswers, useComplianceAuditAuditLog } from '@/hooks/useConformite'
import type { ComplianceAudit } from '@/types/api'
import { Skeleton } from '@/components/ui/Skeleton'
import { AuditEventDetails } from '@/components/shared/AuditEventDetails'
import {
  HISTORY_PERIOD_PRESETS,
  HISTORY_PERIOD_LABELS_FR,
  periodToSince,
  type HistoryPeriodPreset,
} from '@/lib/auditHistory'

interface ComplianceAuditDetailPanelProps {
  audit: ComplianceAudit
  onClose: () => void
  inline?: boolean
  inlineWidth?: number | string
}

export function ComplianceAuditDetailPanel({
  audit,
  onClose,
  inline = true,
  inlineWidth,
}: ComplianceAuditDetailPanelProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { hasPermission } = usePermission()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const updateAnswers = useUpdateComplianceAuditAnswers()
  const submitAudit = useSubmitComplianceAudit()
  const [drafts, setDrafts] = useState<ComplianceAuditAnswerDraft[]>([])
  const [validatorId, setValidatorId] = useState<string | null>(null)
  const [validators, setValidators] = useState<Array<{ id: string; label: string }>>([])
  const [submitComment, setSubmitComment] = useState('')
  const [editMode, setEditMode] = useState(false)

  useEffect(() => {
    setDrafts(buildAuditAnswerDrafts(audit))
    setValidators([])
    setValidatorId(null)
    setSubmitComment('')
    setEditMode(false)
  }, [audit.id, audit.updated_at])

  const progress = useMemo(() => getDraftProgress(drafts), [drafts])
  const isLockedByStatus = ['submitted', 'in_review', 'validated', 'closed'].includes(audit.status)
  const canEditReport = hasPermission('conformite.audit.update')
  const canSubmitAudit = hasPermission('conformite.audit.submit')
  const canSave = canEditReport && !isLockedByStatus
  const isEditing = canSave && editMode
  const readOnly = !isEditing
  const canPrepareSubmission = canSubmitAudit && !isLockedByStatus && !audit.validation_moc_id
  const canSubmit = progress.canSubmit && validators.length > 0 && canPrepareSubmission
  const readOnlyReason = isLockedByStatus
    ? t('conformite.rules.audits.readonly_locked', 'Rapport verrouille par son statut : soumis, en validation, valide ou cloture.')
    : !canEditReport
      ? t('conformite.rules.audits.readonly_permission', 'Vous avez la lecture du rapport, mais pas la permission de le completer.')
      : !editMode
        ? t('conformite.rules.audits.readonly_view_mode', 'Le rapport est ouvert en lecture seule. Activez le mode edition pour modifier les reponses.')
        : null

  // Group drafts by theme for FormSection-per-theme rendering.
  // ComplianceAuditQuestion ne porte que theme_id : on resout via template.themes.
  const themesById = useMemo(() => {
    const map = new Map<string, { title: string; weight: number; position: number }>()
    audit.template?.themes?.forEach((th) => {
      map.set(th.id, { title: th.title, weight: th.weight, position: th.position })
    })
    return map
  }, [audit.template?.themes])

  const draftsByTheme = useMemo(() => {
    const map = new Map<string, { title: string; weight: number | null; position: number; drafts: ComplianceAuditAnswerDraft[] }>()
    drafts.forEach((draft) => {
      const themeId = draft.question.theme_id ?? 'unknown'
      const themeMeta = themesById.get(themeId)
      const entry = map.get(themeId)
      if (entry) {
        entry.drafts.push(draft)
      } else {
        map.set(themeId, {
          title: themeMeta?.title ?? 'Sans thème',
          weight: themeMeta?.weight ?? null,
          position: themeMeta?.position ?? 0,
          drafts: [draft],
        })
      }
    })
    return Array.from(map.entries())
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => a.position - b.position)
  }, [drafts, themesById])

  const updateDraft = (questionId: string, patch: Partial<ComplianceAuditAnswerDraft>) => {
    setDrafts((prev) => prev.map((draft) => (
      draft.question.id === questionId ? { ...draft, ...patch } : draft
    )))
  }

  const save = async () => {
    if (!isEditing) return
    await updateAnswers.mutateAsync({ id: audit.id, payload: draftsToUpsertPayload(drafts) })
    setEditMode(false)
    toast({ title: t('conformite.rules.audits.saved', 'Reponses enregistrees'), variant: 'success' })
  }

  const submit = async () => {
    if (!canSubmit) return
    await submitAudit.mutateAsync({
      id: audit.id,
      payload: {
        validator_user_ids: validators.map((validator) => validator.id),
        comment: submitComment.trim() || null,
      },
    })
    toast({ title: t('conformite.rules.audits.submitted', 'Audit soumis pour validation'), variant: 'success' })
    onClose()
  }

  const addValidator = (id: string | null, item?: { first_name?: string; last_name?: string; email?: string }) => {
    if (!id || validators.some((validator) => validator.id === id)) return
    const label = `${item?.first_name ?? ''} ${item?.last_name ?? ''}`.trim() || item?.email || id
    setValidators((prev) => [...prev, { id, label }])
    setValidatorId(null)
  }

  const auditStatusLabel = t(
    `conformite.audit_status.${audit.status}`,
    audit.status === 'draft' ? 'Brouillon' : audit.status,
  )
  const kpiCardClass = 'min-w-[6rem] flex-1 rounded border border-border/60 bg-background/60 px-2 py-1'
  const kpiLabelClass = 'text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground'
  const kpiValueClass = 'mt-0.5 truncate text-sm font-bold leading-none tabular-nums'

  return (
    <DynamicPanelShell
      inline={inline}
      inlineWidth={inlineWidth}
      onClose={onClose}
      title={audit.title}
      subtitle={`${audit.reference} · ${audit.template?.name ?? audit.template?.audit_type ?? audit.status}`}
      icon={<ClipboardCheck size={14} className="text-primary" />}
      actions={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="btn-sm btn-secondary inline-flex items-center gap-1"
            title={t('conformite.rules.audits.back_to_list', 'Retour a la liste')}
          >
            <ArrowLeft size={13} />
            <span>{t('common.back', 'Retour')}</span>
          </button>
          {canSave && !editMode && (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="btn-sm btn-secondary inline-flex items-center gap-1"
              title={t('conformite.rules.audits.mode_edit', 'Mode edition du rapport')}
            >
              <Pencil size={13} />
              <span>{t('common.edit', 'Modifier')}</span>
            </button>
          )}
          {isEditing && (
            <>
              <button
                type="button"
                onClick={save}
                disabled={updateAnswers.isPending}
                className="btn-sm btn-secondary inline-flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                title={t('conformite.rules.audits.save', 'Enregistrer')}
              >
                {updateAnswers.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                <span>{t('conformite.rules.audits.save', 'Enregistrer')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrafts(buildAuditAnswerDrafts(audit))
                  setEditMode(false)
                }}
                className="btn-sm btn-secondary inline-flex items-center gap-1"
                title={t('common.cancel', 'Annuler')}
              >
                <X size={13} />
                <span>{t('common.cancel', 'Annuler')}</span>
              </button>
            </>
          )}
          {audit.validation_moc_id && (
            <button
              type="button"
              onClick={() => openDynamicPanel({ type: 'detail', module: 'moc', id: audit.validation_moc_id!, meta: { tab: 'validation' } })}
              className="btn-sm btn-secondary inline-flex items-center gap-1"
              title={t('conformite.rules.audits.open_validation', 'Ouvrir la validation')}
            >
              <ExternalLink size={13} />
              <span>{t('conformite.rules.audits.validation_short', 'Validation')}</span>
            </button>
          )}
          {canPrepareSubmission && (
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit || submitAudit.isPending}
              className="btn-sm btn-primary inline-flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
              title={canSubmit
                ? t('conformite.rules.audits.submit_for_validation', 'Soumettre pour validation')
                : t('conformite.rules.audits.submit_blocked', 'Reponses obligatoires/preuves manquantes ou aucun validateur', {
                  missing: progress.missingRequired,
                  evidence: progress.missingEvidence,
                })}
            >
              {submitAudit.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              <span>{t('conformite.rules.audits.submit_short', 'Soumettre')}</span>
            </button>
          )}
        </div>
      }
    >
      {/* KPI strip cohérent avec patterns paxlog/projets */}
      <div className="mx-1 flex min-w-0 flex-wrap gap-1.5 rounded-md border border-border bg-card/60 p-1.5">
        <div className={kpiCardClass}>
          <p className={kpiLabelClass}>{t('conformite.rules.audits.score', 'Score')}</p>
          <p className={cn(kpiValueClass, scoreColor(audit.score_percent))}>{audit.score_percent ?? '—'}%</p>
        </div>
        <div className={kpiCardClass}>
          <p className={kpiLabelClass}>{t('conformite.rules.audits.progress', 'Avancement')}</p>
          <p className={cn(kpiValueClass, 'text-foreground')}>{progress.completionPercent}%</p>
        </div>
        <div className={kpiCardClass}>
          <p className={kpiLabelClass}>{t('conformite.rules.audits.required', 'Obligatoires')}</p>
          <p className={cn(kpiValueClass, 'text-foreground')}>{progress.answeredRequired}/{progress.requiredQuestions}</p>
        </div>
        <div className={kpiCardClass}>
          <p className={kpiLabelClass}>{t('conformite.rules.audits.evidence', 'Preuves')}</p>
          <p className={cn(kpiValueClass, progress.missingEvidence ? 'text-destructive' : 'text-success')}>
            {progress.missingEvidence}
          </p>
        </div>
        <div className={kpiCardClass}>
          <p className={kpiLabelClass}>{t('conformite.rules.audits.status', 'Statut')}</p>
          <p className={cn(kpiValueClass, 'text-foreground')}>{auditStatusLabel}</p>
        </div>
      </div>
      <div className={cn(
        'mx-1 flex min-w-0 items-start gap-2 rounded-md border px-2.5 py-2 text-xs',
        readOnly ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200' : 'border-primary/25 bg-primary/10 text-primary',
      )}>
        {readOnly ? <Lock size={14} className="mt-0.5 shrink-0" /> : <Pencil size={14} className="mt-0.5 shrink-0" />}
        <div className="min-w-0">
          <p className="font-semibold">
            {readOnly
              ? t('conformite.rules.audits.mode_readonly', 'Mode lecture seule')
              : t('conformite.rules.audits.mode_edit', 'Mode edition du rapport')}
          </p>
          <p className="mt-0.5 leading-snug text-muted-foreground">
            {readOnlyReason ?? t('conformite.rules.audits.mode_edit_help', 'Vous pouvez completer les reponses, joindre les preuves puis soumettre le rapport selon vos permissions.')}
          </p>
        </div>
      </div>

      {/* Questions groupées par thème via FormSection collapsibles */}
      {draftsByTheme.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t('conformite.rules.audits.no_questions', 'Aucune question dans ce modele d\'audit.')}
        </div>
      ) : (
        draftsByTheme.map((theme) => (
          <FormSection
            key={theme.id}
            title={theme.title + (theme.weight ? ` · poids ${theme.weight}` : '')}
            collapsible
            defaultExpanded
            storageKey={`audit-${audit.id}-theme-${theme.id}`}
          >
            <div className="space-y-3">
              {theme.drafts.map((draft, index) => (
                isEditing ? (
                  <QuestionCard
                    key={draft.question.id}
                    index={index}
                    draft={draft}
                    readOnly={false}
                    onChange={(patch) => updateDraft(draft.question.id, patch)}
                  />
                ) : (
                  <ReadOnlyQuestionRow
                    key={draft.question.id}
                    index={index}
                    draft={draft}
                  />
                )
              ))}
            </div>
          </FormSection>
        ))
      )}

      {/* Section validation : validateurs + commentaire (visible si pas readOnly) */}
      {canPrepareSubmission && (
        <FormSection
          title={t('conformite.rules.audits.validation_section', 'Soumission pour validation')}
          collapsible
          defaultExpanded
          storageKey={`audit-${audit.id}-validation`}
        >
          <div className="min-w-0 max-w-full space-y-3 overflow-hidden">
            <div className="grid min-w-0 max-w-full gap-2 @[720px]:grid-cols-[minmax(12rem,20rem)_minmax(0,1fr)] @[720px]:items-start">
              <div className="min-w-0">
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {t('conformite.rules.audits.add_validator', 'Ajouter un validateur')}
                </label>
                <UserPicker
                  value={validatorId}
                  onChange={addValidator}
                  placeholder={t('conformite.rules.audits.add_validator', 'Ajouter un validateur')}
                  className="min-w-0 max-w-full"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {t('conformite.rules.audits.validators_selected', 'Validateurs choisis')}
                </label>
                <div className="flex min-w-0 flex-wrap gap-1">
                  {validators.map((validator) => (
                    <button
                      key={validator.id}
                      type="button"
                      onClick={() => setValidators((prev) => prev.filter((row) => row.id !== validator.id))}
                      className="chip chip-info inline-flex max-w-full items-center gap-1 hover:opacity-80"
                      title={t('common.remove', 'Retirer')}
                    >
                      <span className="truncate">{validator.label}</span>
                      <span>×</span>
                    </button>
                  ))}
                  {validators.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t('conformite.rules.audits.validator_required', 'Au moins 1 validateur requis pour soumettre')}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="min-w-0 max-w-full overflow-hidden">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t('conformite.rules.audits.submit_comment', 'Commentaire de soumission (optionnel)')}
              </label>
              <RichTextField
                value={submitComment}
                onChange={setSubmitComment}
                placeholder={t('conformite.rules.audits.submit_comment', 'Commentaire de soumission (optionnel)')}
                rows={3}
                className="min-w-0 max-w-full overflow-hidden"
              />
            </div>
            {!progress.canSubmit && (
              <p className="flex min-w-0 max-w-full items-start gap-1 text-xs text-destructive">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span className="min-w-0 break-words">
                  {t('conformite.rules.audits.submit_blocked', 'Reponses obligatoires/preuves manquantes ou aucun validateur', {
                    missing: progress.missingRequired,
                    evidence: progress.missingEvidence,
                  })}
                </span>
              </p>
            )}
          </div>
        </FormSection>
      )}

      {/* Audit-log timeline — events emis par toutes les actions sur cet
          audit (create / update / update_answers / submit / validated /
          rejected via moc_service). Collapsible et collapsed par defaut
          pour ne pas pousser les sections principales vers le bas. */}
      <ComplianceAuditTimeline auditId={audit.id} />
    </DynamicPanelShell>
  )
}

// ── ComplianceAuditTimeline — mirror des autres timelines ─────────────

const COMPLIANCE_AUDIT_ACTION_LABELS: Record<string, string> = {
  create: 'Création',
  update: 'Modification',
  update_answers: 'Mise à jour des réponses',
  submit: 'Soumission pour validation',
  validate: 'Validation',
  validated: 'Validé',
  reject: 'Rejet',
  rejected: 'Rejeté',
  archive: 'Archivage',
  mark_validated: 'Validation manuelle',
}

const COMPLIANCE_AUDIT_ACTION_CHIPS: Record<string, string> = {
  create: 'chip chip-success',
  update: 'chip',
  update_answers: 'chip',
  submit: 'chip chip-warn',
  validate: 'chip chip-success',
  validated: 'chip chip-success',
  reject: 'chip chip-danger',
  rejected: 'chip chip-danger',
  archive: 'chip chip-danger',
  mark_validated: 'chip chip-highlight',
}

function ComplianceAuditTimeline({ auditId }: { auditId: string }) {
  const { t, i18n } = useTranslation()
  const [limit, setLimit] = useState(50)
  const [period, setPeriod] = useState<HistoryPeriodPreset>('all')
  const sinceFilter = periodToSince(period)
  const filtersToApply = useMemo(() => {
    const f: { since?: string } = {}
    if (sinceFilter) f.since = sinceFilter
    return f
  }, [sinceFilter])
  const { data: events = [], isLoading } = useComplianceAuditAuditLog(auditId, limit, filtersToApply)
  const hasMore = events.length === limit && limit < 200

  const periodBar = (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mr-1">
        {t('conformite.history.period', 'Période')}
      </span>
      {HISTORY_PERIOD_PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setPeriod(p)}
          className={cn(
            'inline-flex items-center h-5 px-1.5 rounded text-[10px] tabular-nums transition-colors border',
            period === p
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-background text-muted-foreground hover:bg-muted',
          )}
        >
          {t(`conformite.history.period_${p}`, HISTORY_PERIOD_LABELS_FR[p])}
        </button>
      ))}
    </div>
  )

  if (isLoading) {
    return (
      <FormSection title="Historique" collapsible defaultExpanded={false} storageKey="compliance-audit-history">
        {periodBar}
        <div className="mt-2 space-y-2 rounded-md border border-dashed border-border p-3" role="status" aria-busy="true">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-start gap-2">
              <Skeleton className="mt-0.5 h-5 w-16 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </FormSection>
    )
  }
  if (events.length === 0) {
    return (
      <FormSection title="Historique" collapsible defaultExpanded={false} storageKey="compliance-audit-history">
        {periodBar}
        <div className="mt-2 rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          {t('conformite.history.empty', 'Aucun évènement enregistré sur cet audit.')}
        </div>
      </FormSection>
    )
  }
  const fmt = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso))
    } catch {
      return iso.slice(0, 16).replace('T', ' ')
    }
  }
  return (
    <FormSection title={`Historique (${events.length})`} collapsible defaultExpanded={false} storageKey="compliance-audit-history">
      {periodBar}
      <ol className="mt-2 relative space-y-2 border-l border-border pl-4">
        {events.map((evt) => {
          const actionLabel = t(
            `conformite.audit_action.${evt.action}`,
            COMPLIANCE_AUDIT_ACTION_LABELS[evt.action] ?? evt.action,
          )
          const chipClass = COMPLIANCE_AUDIT_ACTION_CHIPS[evt.action] ?? 'chip'
          return (
            <li key={evt.id} className="relative">
              <span className="absolute -left-[19px] top-1 inline-block h-2 w-2 rounded-full bg-primary" />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className={chipClass}>{actionLabel}</span>
                <span className="text-xs text-muted-foreground">{t('conformite.history.by', 'par')}</span>
                <span className="text-xs font-semibold text-foreground">{evt.user_name ?? t('conformite.history.system', 'Système')}</span>
                <span className="text-[11px] text-muted-foreground">·</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{fmt(evt.created_at)}</span>
              </div>
              <AuditEventDetails details={evt.details} />
            </li>
          )
        })}
      </ol>
      {hasMore && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setLimit(200)}
            className="text-xs text-primary hover:underline focus:outline-none focus:underline"
          >
            {t('conformite.history.load_more', 'Voir tout l\'historique')} →
          </button>
        </div>
      )}
    </FormSection>
  )
}

function auditAnswerText(draft: ComplianceAuditAnswerDraft, t: ReturnType<typeof useTranslation>['t']) {
  const raw = draft.responseValue?.label ?? draft.responseValue?.value ?? draft.responseValue?.text
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (draft.question.response_type === 'yes_no') {
    if (value === 'yes') return t('conformite.rules.audits.yes', 'Oui')
    if (value === 'no') return t('conformite.rules.audits.no', 'Non')
    if (value === 'partial') return t('conformite.rules.audits.partial', 'Partiel')
  }
  return value
}

function ReadOnlyQuestionRow({
  index,
  draft,
}: {
  index: number
  draft: ComplianceAuditAnswerDraft
}) {
  const { t } = useTranslation()
  const answer = auditAnswerText(draft, t)
  const hasAnswer = draft.score !== null || answer.length > 0
  const missingEvidence = draft.question.attachment_required && draft.attachmentCount <= 0

  return (
    <article className="rounded-md border border-border bg-background/70">
      <div className="grid min-w-0 gap-2 px-3 py-2 @[560px]:grid-cols-[minmax(0,1fr)_auto] @[560px]:items-start">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 text-[11px] font-semibold text-muted-foreground">
              {index + 1}
            </span>
            {draft.question.code && (
              <span className="max-w-full truncate text-[11px] font-semibold uppercase text-primary">
                {draft.question.code}
              </span>
            )}
            {draft.question.required && <span className="chip text-[10px]">{t('conformite.audit_templates.fields.required', 'Obligatoire')}</span>}
            {draft.question.attachment_required && <span className="chip chip-warn text-[10px]">{t('conformite.rules.audits.proof_required', 'Preuve requise')}</span>}
          </div>
          <p className="mt-1.5 text-sm font-semibold leading-snug text-foreground">{draft.question.text}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          {hasAnswer ? <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" /> : <AlertTriangle size={14} className="text-muted-foreground" />}
          <span className={cn('font-semibold tabular-nums', scoreColor(draft.score))}>{draft.score ?? '—'}%</span>
          <span className={cn('inline-flex items-center gap-1 text-muted-foreground', missingEvidence && 'text-destructive')}>
            <FileCheck2 size={13} />
            {draft.attachmentCount}
          </span>
        </div>
      </div>

      <div className="grid gap-2 border-t border-border/60 px-3 py-2 text-sm @[680px]:grid-cols-[minmax(0,1fr)_minmax(10rem,16rem)]">
        <div className="min-w-0 space-y-2">
          <div className="min-w-0 rounded border border-border/50 bg-muted/20 px-2 py-1.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('conformite.rules.audits.answer', 'Réponse')}
            </p>
            {answer ? (
              <RichTextDisplay value={answer} className="text-sm [&_p]:my-0.5" />
            ) : (
              <span className="text-sm text-muted-foreground">{t('conformite.rules.audits.no_answer', 'Aucune réponse')}</span>
            )}
          </div>
          {draft.notes?.trim() && (
            <div className="min-w-0 rounded border border-border/50 bg-muted/10 px-2 py-1.5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('conformite.rules.audits.notes', 'Notes')}
              </p>
              <RichTextDisplay value={draft.notes} className="text-sm [&_p]:my-0.5" />
            </div>
          )}
        </div>
        <div className="min-w-0 rounded border border-border/50 bg-muted/10 p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FileCheck2 size={13} />
              {t('conformite.rules.audits.evidence', 'Preuves')}
            </span>
            <span className={missingEvidence ? 'text-destructive' : 'text-muted-foreground'}>{draft.attachmentCount}</span>
          </div>
          {draft.answerId ? (
            <AttachmentManager
              ownerType="compliance_audit_answer"
              ownerId={draft.answerId}
              compact
              readOnly
            />
          ) : (
            <p className="rounded border border-dashed border-border p-2 text-xs text-muted-foreground">
              {t('conformite.rules.audits.no_evidence', 'Aucune preuve jointe.')}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
