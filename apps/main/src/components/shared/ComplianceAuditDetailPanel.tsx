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
import { AlertTriangle, ArrowLeft, ClipboardCheck, Loader2, Save, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DynamicPanelShell, FormSection } from '@/components/layout/DynamicPanel'
import { QuestionCard, scoreColor } from '@/components/shared/ComplianceAuditDetailModal'
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
  const updateAnswers = useUpdateComplianceAuditAnswers()
  const submitAudit = useSubmitComplianceAudit()
  const [drafts, setDrafts] = useState<ComplianceAuditAnswerDraft[]>([])
  const [validatorId, setValidatorId] = useState<string | null>(null)
  const [validators, setValidators] = useState<Array<{ id: string; label: string }>>([])
  const [submitComment, setSubmitComment] = useState('')

  useEffect(() => {
    setDrafts(buildAuditAnswerDrafts(audit))
    setValidators([])
    setValidatorId(null)
    setSubmitComment('')
  }, [audit.id, audit.updated_at])

  const progress = useMemo(() => getDraftProgress(drafts), [drafts])
  const readOnly = ['submitted', 'in_review', 'validated', 'closed'].includes(audit.status)
  const canSubmit = progress.canSubmit && validators.length > 0 && !readOnly && !audit.validation_moc_id

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
    await updateAnswers.mutateAsync({ id: audit.id, payload: draftsToUpsertPayload(drafts) })
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
  const kpiCardClass = 'min-w-0 rounded-md border border-border bg-card px-2 py-1.5'
  const kpiLabelClass = 'text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground break-all'
  const kpiValueClass = 'mt-1 truncate text-sm font-bold leading-none tabular-nums'

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
          <button
            type="button"
            onClick={save}
            disabled={readOnly || updateAnswers.isPending}
            className="btn-sm btn-secondary inline-flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
            title={t('conformite.rules.audits.save', 'Enregistrer')}
          >
            {updateAnswers.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            <span>{t('conformite.rules.audits.save', 'Enregistrer')}</span>
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit || submitAudit.isPending}
              className="btn-sm btn-primary inline-flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
              title={canSubmit
                ? t('conformite.rules.audits.submit_for_validation', 'Soumettre pour validation')
                : t('conformite.rules.audits.submit_blocked', 'Reponses obligatoires/preuves manquantes ou aucun validateur')}
            >
              {submitAudit.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              <span>{t('conformite.rules.audits.submit_short', 'Soumettre')}</span>
            </button>
          )}
        </div>
      }
    >
      {/* KPI strip cohérent avec patterns paxlog/projets */}
      <div className="grid grid-cols-3 gap-1.5 px-1 @[420px]:grid-cols-5">
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
                <QuestionCard
                  key={draft.question.id}
                  index={index}
                  draft={draft}
                  readOnly={readOnly}
                  onChange={(patch) => updateDraft(draft.question.id, patch)}
                />
              ))}
            </div>
          </FormSection>
        ))
      )}

      {/* Section validation : validateurs + commentaire (visible si pas readOnly) */}
      {!readOnly && (
        <FormSection
          title={t('conformite.rules.audits.validation_section', 'Soumission pour validation')}
          collapsible
          defaultExpanded
          storageKey={`audit-${audit.id}-validation`}
        >
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-[minmax(12rem,24rem)_1fr] md:items-start">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {t('conformite.rules.audits.add_validator', 'Ajouter un validateur')}
                </label>
                <UserPicker
                  value={validatorId}
                  onChange={addValidator}
                  placeholder={t('conformite.rules.audits.add_validator', 'Ajouter un validateur')}
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
                      className="chip chip-info inline-flex items-center gap-1 hover:opacity-80"
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
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t('conformite.rules.audits.submit_comment', 'Commentaire de soumission (optionnel)')}
              </label>
              <RichTextField
                value={submitComment}
                onChange={setSubmitComment}
                placeholder={t('conformite.rules.audits.submit_comment', 'Commentaire de soumission (optionnel)')}
                rows={3}
              />
            </div>
            {!progress.canSubmit && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle size={13} />
                {t('conformite.rules.audits.submit_blocked', 'Reponses obligatoires/preuves manquantes ou aucun validateur', {
                  missing: progress.missingRequired,
                  evidence: progress.missingEvidence,
                })}
              </p>
            )}
          </div>
        </FormSection>
      )}
    </DynamicPanelShell>
  )
}
