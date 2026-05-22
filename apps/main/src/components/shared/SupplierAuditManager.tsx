import { useMemo, useState } from 'react'
import { ClipboardCheck, Plus, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useComplianceAudits, useComplianceAuditTemplates, useCreateComplianceAudit } from '@/hooks/useConformite'
import { usePermission } from '@/hooks/usePermission'
import { SearchableSelect } from '@/pages/conformite/components'

interface SupplierAuditManagerProps {
  tierId: string
  compact?: boolean
}

export function SupplierAuditManager({ tierId, compact }: SupplierAuditManagerProps) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const { data: audits = [], isLoading } = useComplianceAudits({ target_type: 'tier', target_id: tierId })
  const { data: templates = [] } = useComplianceAuditTemplates()
  const createAudit = useCreateComplianceAudit()
  const [templateId, setTemplateId] = useState('')

  const templateOptions = useMemo(() => templates.map(template => ({
    value: template.id,
    label: `${template.code} - ${template.name}`,
    group: template.audit_type,
  })), [templates])

  const canCreate = hasPermission('conformite.audit.create')
  const selectedTemplate = templates.find(template => template.id === templateId)

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
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">{t('common.loading')}</div>
        ) : audits.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            {t('conformite.rules.audits.empty', 'Aucun audit tiers enregistré.')}
          </div>
        ) : audits.map(audit => (
          <article key={audit.id} className="rounded-md border border-border bg-card/40 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{audit.title}</div>
                <div className="text-[11px] text-muted-foreground">{audit.reference} · {audit.template?.audit_type ?? audit.status}</div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                <ShieldCheck size={12} />
                {audit.score_percent ?? '—'}%
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span>{t('common.status')}: <strong className="text-foreground">{audit.status}</strong></span>
              {audit.valid_until && <span>{t('conformite.rules.audits.valid_until', 'Valide jusqu’au')}: {audit.valid_until}</span>}
              {audit.validation_moc_id && <span>{t('conformite.rules.audits.workflow', 'Workflow validation lié')}</span>}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
