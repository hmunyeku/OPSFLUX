import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, ClipboardCheck, Download, Eye, History, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/components/ui/Toast'
import { useComplianceAudits, useComplianceAuditTemplates, useComplianceRules, useCreateComplianceAudit } from '@/hooks/useConformite'
import { usePermission } from '@/hooks/usePermission'
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
  const createMenuRef = useRef<HTMLDivElement>(null)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')
  const [downloadingAuditId, setDownloadingAuditId] = useState<string | null>(null)
  const [showAuditHistory, setShowAuditHistory] = useState(false)
  const [auditHistorySearch, setAuditHistorySearch] = useState('')

  const canCreate = hasPermission('conformite.audit.create')
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setShowCreateMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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

  const filteredTemplateOptions = useMemo(() => {
    const query = templateSearch.trim().toLowerCase()
    if (!query) return templateOptions
    return templateOptions.filter(option =>
      option.label.toLowerCase().includes(query) ||
      option.group?.toLowerCase().includes(query)
    )
  }, [templateOptions, templateSearch])

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

  const formatAuditDate = (audit: ComplianceAudit) => {
    const rawDate = audit.planned_at || audit.started_at || audit.submitted_at || audit.validated_at || audit.created_at
    if (!rawDate) return '—'
    try {
      return new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: 'short', year: '2-digit' }).format(new Date(rawDate))
    } catch {
      return rawDate.slice(0, 10)
    }
  }

  const auditBuckets = useMemo(() => {
    const auditDate = (audit: ComplianceAudit) => audit.planned_at || audit.started_at || audit.submitted_at || audit.validated_at || audit.created_at || ''
    const isValid = (audit: ComplianceAudit) =>
      ['validated', 'closed'].includes(audit.status)
      && (!audit.valid_until || audit.valid_until >= today)
    const isOpen = (audit: ComplianceAudit) => ['draft', 'in_progress', 'submitted'].includes(audit.status)
    const sorted = [...audits].sort((a, b) => {
      const aValid = isValid(a)
      const bValid = isValid(b)
      if (aValid !== bValid) return aValid ? -1 : 1
      return auditDate(b).localeCompare(auditDate(a))
    })
    const current = sorted.filter(audit => isValid(audit) || isOpen(audit))
    const history = sorted.filter(audit => !current.includes(audit))
    return { current, history }
  }, [audits, today])

  const filteredAuditHistory = useMemo(() => {
    const query = auditHistorySearch.trim().toLowerCase()
    if (!query) return auditBuckets.history
    return auditBuckets.history.filter(audit => [
      audit.title,
      audit.reference,
      audit.template?.name,
      audit.template?.audit_type,
      audit.status,
      audit.score_category?.label,
    ].some(value => String(value ?? '').toLowerCase().includes(query)))
  }, [auditBuckets.history, auditHistorySearch])

  const renderAuditCard = (audit: ComplianceAudit) => {
    const totalQuestions = audit.template?.themes?.reduce((sum, theme) => sum + (theme.questions?.length ?? 0), 0) ?? 0
    const answered = audit.answers?.filter(answer => answer.score !== null || answer.response_value !== null).length ?? 0
    const progressPct = totalQuestions > 0 ? Math.round((answered / totalQuestions) * 100) : 0
    const statusChip = statusToChip(audit.status)
    const scoreChip = scoreToChip(audit.score_percent, audit.template?.passing_score)
    return (
      <article key={audit.id} className="flex min-w-0 max-w-full flex-[1_1_15rem] flex-col overflow-hidden rounded-md border border-border bg-card/40 p-3 transition-colors hover:border-border/80 @[900px]:flex-[1_1_18rem] @[1200px]:flex-[1_1_20rem]">
        <div className="flex flex-col gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
              <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                <CalendarDays size={10} />
                {formatAuditDate(audit)}
              </span>
              <span className="min-w-0 max-w-full flex-1 break-words text-sm font-semibold text-foreground">{audit.title}</span>
              <span className={statusChip.cls} title={t('conformite.rules.audits.status', 'Statut')}>{statusChip.label}</span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              <span className="font-mono">{audit.reference}</span>
              {audit.template?.audit_type && <> - {auditTypeLabel(audit.template.audit_type)}</>}
            </div>
          </div>

          <div className="flex w-full min-w-0 items-center justify-between gap-2">
            <div className="min-w-0">
              {scoreChip && <span className={scoreChip.cls} title={t('conformite.rules.audits.score', 'Score')}>{scoreChip.label}</span>}
              {audit.score_category && !scoreChip && <span className="chip chip-info">{audit.score_category.label}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleDownloadReport(audit.id)}
                disabled={downloadingAuditId === audit.id}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-50"
                title={t('conformite.rules.audits.report_pdf', 'Telecharger PDF')}
              >
                <Download size={14} />
              </button>
              <button
                type="button"
                onClick={() => onOpenAudit?.(audit)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title={t('conformite.rules.audits.details', 'Details')}
              >
                <Eye size={14} />
              </button>
            </div>
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
            let daysRemaining: number | null = null
            let validityChip: { cls: string; label: string } | null = null
            if (audit.valid_until) {
              const dueMs = new Date(audit.valid_until + 'T23:59:59').getTime()
              const nowMs = Date.now()
              daysRemaining = Math.floor((dueMs - nowMs) / 86_400_000)
              if (daysRemaining < 0) {
                validityChip = { cls: 'chip chip-danger', label: t('conformite.rules.audits.expired', 'Expire il y a {{n}}j', { n: Math.abs(daysRemaining) }) }
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
                    {t('conformite.rules.audits.validated_on', 'Valide le')}{' '}
                    <span className="font-medium text-foreground/80">{audit.validated_at.slice(0, 10)}</span>
                  </span>
                )}
                {audit.valid_until && (
                  <span className="inline-flex items-center gap-1">
                    {t('conformite.rules.audits.valid_until', "Valide jusqu'au")}{' '}
                    <span className="font-medium text-foreground/80">{audit.valid_until}</span>
                    {validityChip && <span className={validityChip.cls}>{validityChip.label}</span>}
                  </span>
                )}
                {audit.validation_moc_id && (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 size={11} className="text-primary" />
                    {t('conformite.rules.audits.workflow', 'Workflow validation lie')}
                  </span>
                )}
              </div>
            )
          })()}
        </div>
      </article>
    )
  }

  const handleCreate = async (template: ComplianceAuditTemplate | undefined) => {
    if (!template || createAudit.isPending) return
    await createAudit.mutateAsync({
      template_id: template.id,
      target_type: 'tier',
      target_id: tierId,
      title: template.name,
    })
    setShowCreateMenu(false)
    setTemplateSearch('')
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
    <section className={compact ? '@container space-y-3' : '@container space-y-4'}>
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
          <div ref={createMenuRef} className="relative flex shrink-0 justify-end">
            <button
              type="button"
              onClick={() => setShowCreateMenu(open => !open)}
              disabled={createAudit.isPending || templateOptions.length === 0}
              className="btn btn-sm btn-primary inline-flex shrink-0 items-center gap-1.5"
              title={t('conformite.rules.audits.create', 'Creer un audit')}
            >
              <Plus size={14} />
              <span>{t('common.create', 'Creer')}</span>
            </button>

            {showCreateMenu && (
              <div className="absolute right-0 top-full z-50 mt-1 w-[min(88vw,28rem)] overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                <div className="border-b border-border p-2">
                  <label className="sr-only">{t('conformite.rules.audits.select_template', 'Modele d audit...')}</label>
                  <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2">
                    <Search size={14} className="shrink-0 text-muted-foreground" />
                    <input
                      type="text"
                      value={templateSearch}
                      onChange={(event) => setTemplateSearch(event.target.value)}
                      placeholder={t('conformite.rules.audits.select_template', 'Modele d audit...')}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto py-1">
                  {filteredTemplateOptions.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">{t('common.no_results')}</div>
                  ) : filteredTemplateOptions.map(option => {
                    const template = templates.find(item => item.id === option.value)
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleCreate(template)}
                        disabled={createAudit.isPending}
                        className="flex w-full min-w-0 items-start gap-2 px-3 py-2 text-left text-xs hover:bg-accent disabled:cursor-wait disabled:opacity-60"
                      >
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-foreground">{option.label}</span>
                          {option.group && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{option.group}</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {isLoading ? (
          <div className="w-full rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            {t('conformite.rules.audits.loading')}
          </div>
        ) : audits.length === 0 ? (
          <div className="w-full rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            {t('conformite.rules.audits.empty', 'Aucun audit tiers enregistre.')}
          </div>
        ) : auditBuckets.current.length === 0 ? (
          <div className="w-full rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            {t('conformite.rules.audits.no_current', "Aucun audit valide ou en cours. Consultez l'historique ci-dessous.")}
          </div>
        ) : auditBuckets.current.map(renderAuditCard)}
      </div>

      {!isLoading && auditBuckets.history.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border">
          <button
            type="button"
            onClick={() => setShowAuditHistory((value) => !value)}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted/30"
            title={t('conformite.rules.audits.history_tooltip', 'Afficher les audits expires, rejetes ou remplaces')}
          >
            <History size={12} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 font-medium">{t('conformite.rules.audits.history_title', 'Historique des audits')}</span>
            <span className="chip">{auditBuckets.history.length}</span>
            <span className="text-[10px] text-muted-foreground">
              {showAuditHistory
                ? t('conformite.rules.audits.history_hide', 'Masquer')
                : t('conformite.rules.audits.history_show', 'Afficher')}
            </span>
          </button>

          {showAuditHistory && (
            <div className="space-y-2 border-t border-border bg-muted/10 p-2">
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={auditHistorySearch}
                  onChange={(event) => setAuditHistorySearch(event.target.value)}
                  className="h-8 w-full rounded border border-border bg-background pl-7 pr-2 text-xs"
                  placeholder={t('conformite.rules.audits.history_search_placeholder', 'Rechercher dans les anciens audits...')}
                />
              </div>

              {filteredAuditHistory.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  {t('common.no_results')}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {filteredAuditHistory.map(renderAuditCard)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </section>
  )
}
