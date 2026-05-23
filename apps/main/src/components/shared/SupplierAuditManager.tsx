import { useMemo, useState } from 'react'
import { ClipboardCheck, Download, Eye, Plus, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useComplianceAudits, useComplianceAuditTemplates, useCreateComplianceAudit } from '@/hooks/useConformite'
import { usePermission } from '@/hooks/usePermission'
import { SearchableSelect } from '@/pages/conformite/components'
import { ComplianceAuditDetailModal } from '@/components/shared/ComplianceAuditDetailModal'
import { conformiteService } from '@/services/conformiteService'
import { useToast } from '@/components/ui/Toast'

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

  const handleCreate = async () => {
    if (!templateId || createAudit.isPending) return
    await createAudit.mutateAsync({
      template_id: templateId,
      target_type: 'tier',
      target_id: tierId,
      title: selectedTemplate?.name,
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
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ClipboardCheck size={16} className="text-primary" />
            {t('conformite.rules.audits.title', 'Audits tiers')}
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{audits.length}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('conformite.rules.audits.subtitle', 'Audits fournisseur, score, preuves et validation.')}
          </p>
        </div>
        {canCreate && (
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 sm:w-72">
              <SearchableSelect
                value={templateId}
                onChange={setTemplateId}
                options={templateOptions}
                placeholder={t('conformite.rules.audits.select_template', 'Modèle d’audit...')}
              />
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!templateId || createAudit.isPending}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
              title={t('conformite.rules.audits.create', 'Créer un audit')}
            >
              <Plus size={16} />
            </button>
          </div>
        )}
      </div>

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
          return (
          <article key={audit.id} className="rounded-md border border-border bg-card/40 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{audit.title}</div>
                <div className="text-[11px] text-muted-foreground">{audit.reference} · {audit.template?.audit_type ?? audit.status}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  <ShieldCheck size={12} />
                  {audit.score_percent ?? '—'}%
                </span>
                {audit.score_category && (
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                    {audit.score_category.label}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleDownloadReport(audit.id)}
                  disabled={downloadingAuditId === audit.id}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-50"
                  title={t('conformite.rules.audits.report_pdf')}
                >
                  <Download size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAuditId(audit.id)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  title={t('conformite.rules.audits.details')}
                >
                  <Eye size={14} />
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span>{t('conformite.rules.audits.status')}: <strong className="text-foreground">{audit.status}</strong></span>
              <span>{answered}/{totalQuestions} {t('conformite.rules.audits.questions')}</span>
              {audit.valid_until && <span>{t('conformite.rules.audits.valid_until', 'Valide jusqu’au')}: {audit.valid_until}</span>}
              {audit.validation_moc_id && <span>{t('conformite.rules.audits.workflow', 'Workflow validation lié')}</span>}
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
