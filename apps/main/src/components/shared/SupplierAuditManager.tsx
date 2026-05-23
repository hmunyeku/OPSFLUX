import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, ClipboardCheck, Download, Eye, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useComplianceAudits, useComplianceAuditTemplates, useComplianceRules, useCreateComplianceAudit } from '@/hooks/useConformite'
import { usePermission } from '@/hooks/usePermission'
import { SearchableSelect } from '@/pages/conformite/components'
import { ComplianceAuditDetailModal } from '@/components/shared/ComplianceAuditDetailModal'
import { conformiteService } from '@/services/conformiteService'
import { useToast } from '@/components/ui/Toast'
import type { ComplianceAudit, ComplianceAuditTemplate } from '@/types/api'

interface SupplierAuditManagerProps {
  tierId: string
  compact?: boolean
}

export function SupplierAuditManager({ tierId, compact }: SupplierAuditManagerProps) {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const { hasPermission } = usePermission()
  const { data: audits = [], isLoading } = useComplianceAudits({ target_type: 'tier', target_id: tierId })
  const { data: templates = [] } = useComplianceAuditTemplates()
  const { data: rules = [] } = useComplianceRules()
  const createAudit = useCreateComplianceAudit()
  const [templateId, setTemplateId] = useState('')
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null)
  const [downloadingAuditId, setDownloadingAuditId] = useState<string | null>(null)

  const templateOptions = useMemo(() => templates.map(template => ({
    value: template.id,
    label: `${template.code} - ${template.name}`,
    group: template.audit_type,
  })), [templates])

  const canCreate = hasPermission('conformite.audit.create')
  const selectedTemplate = templates.find(template => template.id === templateId)
  const selectedAudit = audits.find(audit => audit.id === selectedAuditId) ?? null
  const today = new Date().toISOString().slice(0, 10)

  const requiredAudits = useMemo(() => {
    const templatesById = new Map(templates.map(template => [template.id, template]))
    const items = new Map<string, { template: ComplianceAuditTemplate; latestAudit: ComplianceAudit | null; validAudit: ComplianceAudit | null }>()

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

  const handleCreate = async (template: ComplianceAuditTemplate | undefined = selectedTemplate) => {
    if (!template || createAudit.isPending) return
    await createAudit.mutateAsync({
      template_id: template.id,
      target_type: 'tier',
      target_id: tierId,
      title: template.name,
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

  // Status -> chip mapping (token-based, no hardcoded colors)
  const statusToChip = (status: string): { cls: string; label: string } => {
    switch (status) {
      case 'validated':
      case 'closed':
        return { cls: 'chip chip-success', label: t(`conformite.audit_status.${status}`, status === 'validated' ? 'Validé' : 'Clôturé') }
      case 'submitted':
        return { cls: 'chip chip-warn', label: t('conformite.audit_status.submitted', 'Soumis') }
      case 'in_progress':
        return { cls: 'chip chip-info', label: t('conformite.audit_status.in_progress', 'En cours') }
      case 'rejected':
        return { cls: 'chip chip-danger', label: t('conformite.audit_status.rejected', 'Rejeté') }
      default:
        return { cls: 'chip', label: t(`conformite.audit_status.${status}`, status === 'draft' ? 'Brouillon' : status) }
    }
  }

  // Score % vs passing_score -> chip semantique
  const scoreToChip = (score: number | null | undefined, passing: number | null | undefined): { cls: string; label: string } | null => {
    if (score === null || score === undefined) return null
    const p = passing ?? 70
    const s = Number(score)
    if (s >= p) return { cls: 'chip chip-success', label: `${Math.round(s)}%` }
    if (s >= p - 15) return { cls: 'chip chip-warn', label: `${Math.round(s)}%` }
    return { cls: 'chip chip-danger', label: `${Math.round(s)}%` }
  }

  // Capitalize : "metier" -> "Métier" (gère le cas FR commun)
  const capitalize = (s: string | null | undefined) => {
    if (!s) return ''
    // Special-cases pour les types FR qui manquent leurs accents en DB
    const fr = { metier: 'Métier', administratif: 'Administratif', hse: 'HSE', qualite: 'Qualité' }
    const k = s.toLowerCase()
    return fr[k as keyof typeof fr] ?? (s.charAt(0).toUpperCase() + s.slice(1))
  }

  return (
    <section className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex items-center gap-2 text-sm font-semibold text-foreground">
          <ClipboardCheck size={16} className="text-primary shrink-0" />
          <span>{t('conformite.rules.audits.title', 'Audits tiers')}</span>
          {requiredAudits.length > 0 ? (
            <span
              className={`chip ${validRequiredCount === requiredAudits.length ? 'chip-success' : 'chip-warn'}`}
              title={t('conformite.rules.audits.required_tooltip', '{{valid}} validés sur {{total}} audits exigés par les règles', { valid: validRequiredCount, total: requiredAudits.length })}
            >
              {validRequiredCount}/{requiredAudits.length} {t('conformite.rules.audits.required_label', 'exigés')}
            </span>
          ) : audits.length > 0 ? (
            <span className="chip">{audits.length}</span>
          ) : null}
        </div>
        {canCreate && (
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 sm:w-72">
              <SearchableSelect
                value={templateId}
                onChange={setTemplateId}
                options={templateOptions}
                placeholder={t('conformite.rules.audits.select_template', 'Modèle d’audit…')}
              />
            </div>
            <button
              type="button"
              onClick={() => handleCreate()}
              disabled={!templateId || createAudit.isPending}
              className="btn btn-sm btn-primary shrink-0 inline-flex items-center gap-1.5"
              title={t('conformite.rules.audits.create', 'Créer un audit')}
            >
              <Plus size={14} />
              <span>{t('common.create', 'Créer')}</span>
            </button>
          </div>
        )}
      </div>

      {requiredAudits.length > 0 && (
        <div className="grid gap-2 @2xl:grid-cols-3">
          {requiredAudits.map(({ template, latestAudit, validAudit }) => {
            // Etats : validé (success) / en cours (info) / à faire (neutre, pas warning)
            const state = validAudit
              ? { iconCls: 'text-success', Icon: CheckCircle2, title: t('conformite.rules.audits.state_valid', 'Validé') }
              : latestAudit
                ? { iconCls: 'text-primary', Icon: Circle, title: t('conformite.rules.audits.state_in_progress', 'En cours') }
                : { iconCls: 'text-muted-foreground', Icon: Circle, title: t('conformite.rules.audits.state_required', 'À planifier') }
            return (
              <div
                key={template.id}
                className="flex min-w-0 items-center gap-2.5 rounded-md border border-border bg-muted/20 px-3 py-2"
                title={state.title}
              >
                <state.Icon size={16} className={`${state.iconCls} shrink-0`} strokeWidth={validAudit ? 2 : 1.5} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-foreground">{capitalize(template.audit_type)}</div>
                  <div className="truncate text-[10px] text-muted-foreground font-mono">{template.code}</div>
                </div>
                {latestAudit ? (
                  <button
                    type="button"
                    onClick={() => setSelectedAuditId(latestAudit.id)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t('conformite.rules.audits.details')}
                  >
                    <Eye size={14} />
                  </button>
                ) : canCreate ? (
                  <button
                    type="button"
                    onClick={() => handleCreate(template)}
                    disabled={createAudit.isPending}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-primary hover:bg-primary/10 disabled:cursor-wait disabled:opacity-50"
                    title={t('conformite.rules.audits.create_required', 'Créer cet audit requis')}
                  >
                    <Plus size={14} />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      <div className="grid gap-2">
        {isLoading ? (
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">{t('conformite.rules.audits.loading')}</div>
        ) : audits.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            {t('conformite.rules.audits.empty', 'Aucun audit tiers enregistré.')}
          </div>
        ) : audits.map(audit => {
          const totalQuestions = audit.template?.themes?.reduce((sum, theme) => sum + (theme.questions?.length ?? 0), 0) ?? 0
          const answered = audit.answers?.filter(answer => answer.score !== null || answer.response_value !== null).length ?? 0
          const progressPct = totalQuestions > 0 ? Math.round((answered / totalQuestions) * 100) : 0
          const statusChip = statusToChip(audit.status)
          const scoreChip = scoreToChip(audit.score_percent, audit.template?.passing_score)
          return (
          <article key={audit.id} className="rounded-md border border-border bg-card/40 p-3 hover:border-border/80 transition-colors">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate text-sm font-semibold text-foreground">{audit.title}</span>
                  <span className={statusChip.cls} title={t('conformite.rules.audits.status', 'Statut')}>{statusChip.label}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  <span className="font-mono">{audit.reference}</span>
                  {audit.template?.audit_type && <> · {capitalize(audit.template.audit_type)}</>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {scoreChip && <span className={scoreChip.cls} title={t('conformite.rules.audits.score', 'Score')}>{scoreChip.label}</span>}
                {audit.score_category && !scoreChip && (
                  <span className="chip chip-info">{audit.score_category.label}</span>
                )}
                <button
                  type="button"
                  onClick={() => handleDownloadReport(audit.id)}
                  disabled={downloadingAuditId === audit.id}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-50"
                  title={t('conformite.rules.audits.report_pdf', 'Télécharger PDF')}
                >
                  <Download size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAuditId(audit.id)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  title={t('conformite.rules.audits.details', 'Détails')}
                >
                  <Eye size={14} />
                </button>
              </div>
            </div>
            {/* Progress bar visuelle + meta secondaires */}
            <div className="mt-2.5 space-y-1.5">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="tabular-nums font-medium text-foreground/70">{answered}/{totalQuestions}</span>
                <span>{t('conformite.rules.audits.questions', 'questions')}</span>
                <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      progressPct >= 100 ? 'bg-success' : progressPct >= 50 ? 'bg-primary' : 'bg-muted-foreground/40'
                    }`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="tabular-nums text-foreground/60 w-10 text-right">{progressPct}%</span>
              </div>
              {(audit.valid_until || audit.validation_moc_id) && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {audit.valid_until && (
                    <span>
                      {t('conformite.rules.audits.valid_until', 'Valide jusqu’au')}{' '}
                      <span className="text-foreground/70 font-medium">{audit.valid_until}</span>
                    </span>
                  )}
                  {audit.validation_moc_id && (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 size={11} className="text-primary" />
                      {t('conformite.rules.audits.workflow', 'Workflow validation lié')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </article>
        )})}
      </div>
      <ComplianceAuditDetailModal
        audit={selectedAudit}
        open={!!selectedAudit}
        onClose={() => setSelectedAuditId(null)}
      />
    </section>
  )
}
