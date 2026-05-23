import { useMemo, useState } from 'react'
import { CheckCircle2, ClipboardCheck, Download, Eye, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/components/ui/Toast'
import { useComplianceAudits, useComplianceAuditTemplates, useComplianceRules, useCreateComplianceAudit } from '@/hooks/useConformite'
import { usePermission } from '@/hooks/usePermission'
import { SearchableSelect } from '@/pages/conformite/components'
import { conformiteService } from '@/services/conformiteService'
import type { ComplianceAudit, ComplianceAuditTemplate } from '@/types/api'

interface SupplierAuditManagerProps {
  tierId: string
  compact?: boolean
  onOpenAudit?: (audit: ComplianceAudit) => void
}

type RequiredAuditItem = {
  template: ComplianceAuditTemplate
  latestAudit: ComplianceAudit | null
  validAudit: ComplianceAudit | null
}

function auditTypeLabel(value: string | null | undefined) {
  if (!value) return ''
  const labels: Record<string, string> = {
    administratif: 'Administratif',
    hse: 'HSE',
    metier: 'Metier',
    qualite: 'Qualite',
  }
  const key = value.toLowerCase()
  return labels[key] ?? value.charAt(0).toUpperCase() + value.slice(1)
}

export function SupplierAuditManager({ tierId, compact, onOpenAudit }: SupplierAuditManagerProps) {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const { hasPermission } = usePermission()
  const { data: audits = [], isLoading } = useComplianceAudits({ target_type: 'tier', target_id: tierId })
  const { data: templates = [] } = useComplianceAuditTemplates()
  const { data: rules = [] } = useComplianceRules()
  const createAudit = useCreateComplianceAudit()
  const [templateId, setTemplateId] = useState('')
  const [downloadingAuditId, setDownloadingAuditId] = useState<string | null>(null)

  const canCreate = hasPermission('conformite.audit.create')
  const selectedTemplate = templates.find(template => template.id === templateId)
  const today = new Date().toISOString().slice(0, 10)

  const requiredAudits = useMemo<RequiredAuditItem[]>(() => {
    const templatesById = new Map(templates.map(template => [template.id, template]))
    const items = new Map<string, RequiredAuditItem>()

    for (const rule of rules) {
      const auditTemplateId = typeof rule.condition_json?.audit_template_id === 'string'
        ? rule.condition_json.audit_template_id
        : null
      if (!auditTemplateId || !rule.active) continue
      if (rule.subject_scope !== 'company' && rule.subject_scope !== 'all') continue

      const targetValues = (rule.target_value ?? '').split(',').map(value => value.trim()).filter(Boolean)
      const appliesToTier = rule.target_type === 'all' || (rule.target_type === 'tier' && targetValues.includes(tierId))
      if (!appliesToTier) continue

      const template = templatesById.get(auditTemplateId)
      if (!template) continue
      const matchingAudits = audits
        .filter(audit => audit.template_id === template.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
      const validAudit = matchingAudits.find(audit =>
        ['validated', 'closed'].includes(audit.status)
        && (!audit.valid_until || audit.valid_until >= today)
      ) ?? null
      items.set(template.id, { template, latestAudit: matchingAudits[0] ?? null, validAudit })
    }

    return Array.from(items.values()).sort((a, b) => a.template.audit_type.localeCompare(b.template.audit_type))
  }, [audits, rules, templates, tierId, today])

  const validRequiredCount = requiredAudits.filter(item => item.validAudit).length
  const requiredByTemplateId = useMemo(
    () => new Map(requiredAudits.map(item => [item.template.id, item])),
    [requiredAudits],
  )

  const templateOptions = useMemo(() => templates
    .map(template => {
      const required = requiredByTemplateId.get(template.id)
      const requiredState = required?.validAudit
        ? t('conformite.rules.audits.state_valid', 'Valide')
        : required?.latestAudit
          ? t('conformite.rules.audits.state_in_progress', 'En cours')
          : required
            ? t('conformite.rules.audits.state_required', 'A planifier')
            : null
      return {
        value: template.id,
        label: requiredState
          ? `${auditTypeLabel(template.audit_type)} · ${template.name} · ${requiredState}`
          : `${auditTypeLabel(template.audit_type)} · ${template.name}`,
        group: required
          ? t('conformite.rules.audits.required_group', 'Audits exiges')
          : t('conformite.rules.audits.other_group', 'Autres modeles'),
      }
    })
    .sort((a, b) => {
      const aRequired = requiredByTemplateId.has(a.value)
      const bRequired = requiredByTemplateId.has(b.value)
      if (aRequired !== bRequired) return aRequired ? -1 : 1
      return a.label.localeCompare(b.label)
    }), [requiredByTemplateId, templates, t])

  const statusToChip = (status: string): { cls: string; label: string } => {
    switch (status) {
      case 'validated':
      case 'closed':
        return { cls: 'chip chip-success', label: t(`conformite.audit_status.${status}`, status === 'validated' ? 'Valide' : 'Cloture') }
      case 'submitted':
        return { cls: 'chip chip-warn', label: t('conformite.audit_status.submitted', 'Soumis') }
      case 'in_progress':
        return { cls: 'chip chip-info', label: t('conformite.audit_status.in_progress', 'En cours') }
      case 'rejected':
        return { cls: 'chip chip-danger', label: t('conformite.audit_status.rejected', 'Rejete') }
      default:
        return { cls: 'chip', label: t(`conformite.audit_status.${status}`, status === 'draft' ? 'Brouillon' : status) }
    }
  }

  const scoreToChip = (score: number | null | undefined, passing: number | null | undefined): { cls: string; label: string } | null => {
    if (score === null || score === undefined) return null
    const passingScore = passing ?? 70
    const rounded = Math.round(Number(score))
    if (rounded >= passingScore) return { cls: 'chip chip-success', label: `${rounded}%` }
    if (rounded >= passingScore - 15) return { cls: 'chip chip-warn', label: `${rounded}%` }
    return { cls: 'chip chip-danger', label: `${rounded}%` }
  }

  const handleCreate = async () => {
    if (!selectedTemplate || createAudit.isPending) return
    await createAudit.mutateAsync({
      template_id: selectedTemplate.id,
      target_type: 'tier',
      target_id: tierId,
      title: selectedTemplate.name,
    })
    setTemplateId('')
  }

  const handleDownloadReport = async (auditId: string) => {
    if (downloadingAuditId) return
    setDownloadingAuditId(auditId)
    try {
      await conformiteService.downloadAuditReport(auditId, i18n.language?.startsWith('en') ? 'en' : 'fr')
    } catch {
      toast({ title: t('conformite.rules.audits.report_error'), variant: 'error' })
    } finally {
      setDownloadingAuditId(null)
    }
  }

  return (
    <section className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex items-center gap-2 text-sm font-semibold text-foreground">
          <ClipboardCheck size={16} className="shrink-0 text-primary" />
          <span>{t('conformite.rules.audits.title', 'Audits tiers')}</span>
          {requiredAudits.length > 0 ? (
            <span
              className={`chip ${validRequiredCount === requiredAudits.length ? 'chip-success' : 'chip-warn'}`}
              title={t('conformite.rules.audits.required_tooltip', '{{valid}} valides sur {{total}} audits exiges par les regles', { valid: validRequiredCount, total: requiredAudits.length })}
            >
              {validRequiredCount}/{requiredAudits.length} {t('conformite.rules.audits.required_label', 'exiges')}
            </span>
          ) : audits.length > 0 ? (
            <span className="chip">{audits.length}</span>
          ) : null}
        </div>

        {canCreate && (
          <div className="flex min-w-0 items-center gap-2 sm:max-w-xl">
            <div className="min-w-0 sm:w-80">
              <SearchableSelect
                value={templateId}
                onChange={setTemplateId}
                options={templateOptions}
                placeholder={t('conformite.rules.audits.select_template', 'Modele d audit...')}
              />
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!templateId || createAudit.isPending}
              className="btn btn-sm btn-primary inline-flex shrink-0 items-center gap-1.5"
              title={t('conformite.rules.audits.create', 'Creer un audit')}
            >
              <Plus size={14} />
              <span>{t('common.create', 'Creer')}</span>
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
        {isLoading ? (
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            {t('conformite.rules.audits.loading')}
          </div>
        ) : audits.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            {t('conformite.rules.audits.empty', 'Aucun audit tiers enregistre.')}
          </div>
        ) : audits.map(audit => {
          const totalQuestions = audit.template?.themes?.reduce((sum, theme) => sum + (theme.questions?.length ?? 0), 0) ?? 0
          const answered = audit.answers?.filter(answer => answer.score !== null || answer.response_value !== null).length ?? 0
          const progressPct = totalQuestions > 0 ? Math.round((answered / totalQuestions) * 100) : 0
          const statusChip = statusToChip(audit.status)
          const scoreChip = scoreToChip(audit.score_percent, audit.template?.passing_score)
          return (
            <article key={audit.id} className="flex min-h-[136px] flex-col rounded-md border border-border bg-card/40 p-3 transition-colors hover:border-border/80">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{audit.title}</span>
                    <span className={statusChip.cls} title={t('conformite.rules.audits.status', 'Statut')}>{statusChip.label}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    <span className="font-mono">{audit.reference}</span>
                    {audit.template?.audit_type && <> · {auditTypeLabel(audit.template.audit_type)}</>}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-0.5 self-end sm:self-auto sm:gap-1.5">
                  {scoreChip && <span className={scoreChip.cls} title={t('conformite.rules.audits.score', 'Score')}>{scoreChip.label}</span>}
                  {audit.score_category && !scoreChip && <span className="chip chip-info">{audit.score_category.label}</span>}
                  <button
                    type="button"
                    onClick={() => handleDownloadReport(audit.id)}
                    disabled={downloadingAuditId === audit.id}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-50 sm:h-7 sm:w-7"
                    title={t('conformite.rules.audits.report_pdf', 'Telecharger PDF')}
                  >
                    <Download size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAudit?.(audit)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:h-7 sm:w-7"
                    title={t('conformite.rules.audits.details', 'Details')}
                  >
                    <Eye size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-auto space-y-1.5 pt-3">
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="whitespace-nowrap tabular-nums">
                    <span className="font-medium text-foreground/80">{answered}/{totalQuestions}</span>{' '}
                    {t('conformite.rules.audits.questions', 'questions')}
                  </span>
                  <div className="h-1.5 min-w-0 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${
                        progressPct >= 100 ? 'bg-success' : progressPct >= 50 ? 'bg-primary' : 'bg-muted-foreground/40'
                      }`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="w-9 text-right tabular-nums text-foreground/60">{progressPct}%</span>
                </div>

                {(audit.validated_at || audit.valid_until || audit.validation_moc_id) && (() => {
                  // Calcul jours restants si valid_until presente. Inputs date format YYYY-MM-DD.
                  let daysRemaining: number | null = null
                  let validityChip: { cls: string; label: string } | null = null
                  if (audit.valid_until) {
                    const dueMs = new Date(audit.valid_until + 'T23:59:59').getTime()
                    const nowMs = Date.now()
                    daysRemaining = Math.floor((dueMs - nowMs) / 86_400_000)
                    if (daysRemaining < 0) {
                      validityChip = { cls: 'chip chip-danger', label: t('conformite.rules.audits.expired', 'Expiré il y a {{n}}j', { n: Math.abs(daysRemaining) }) }
                    } else if (daysRemaining <= 30) {
                      validityChip = { cls: 'chip chip-warn', label: t('conformite.rules.audits.expires_soon', 'Expire dans {{n}}j', { n: daysRemaining }) }
                    } else {
                      validityChip = { cls: 'chip', label: t('conformite.rules.audits.valid_n_days', '{{n}}j restants', { n: daysRemaining }) }
                    }
                  }
                  return (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {audit.validated_at && (
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 size={11} className="text-success" />
                          {t('conformite.rules.audits.validated_on', 'Validé le')}{' '}
                          <span className="font-medium text-foreground/80">{audit.validated_at.slice(0, 10)}</span>
                        </span>
                      )}
                      {audit.valid_until && (
                        <span className="inline-flex items-center gap-1">
                          {t('conformite.rules.audits.valid_until', 'Valide jusqu’au')}{' '}
                          <span className="font-medium text-foreground/80">{audit.valid_until}</span>
                          {validityChip && <span className={validityChip.cls}>{validityChip.label}</span>}
                        </span>
                      )}
                      {audit.validation_moc_id && (
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 size={11} className="text-primary" />
                          {t('conformite.rules.audits.workflow', 'Workflow validation lié')}
                        </span>
                      )}
                    </div>
                  )
                })()}
              </div>
            </article>
          )
        })}
      </div>

    </section>
  )
}
