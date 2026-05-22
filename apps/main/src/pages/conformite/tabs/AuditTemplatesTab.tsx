import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardPenLine, FileText, Plus } from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import { useComplianceAuditTemplates } from '@/hooks/useConformite'
import { useUIStore } from '@/stores/uiStore'

export function AuditTemplatesTab() {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const { data: templates = [], isLoading } = useComplianceAuditTemplates({ include_inactive: true })
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const canCreate = hasPermission('conformite.audit.template.create')

  const sortedTemplates = useMemo(
    () => [...templates].sort((a, b) => `${a.audit_type}-${a.code}`.localeCompare(`${b.audit_type}-${b.code}`)),
    [templates],
  )

  const stats = useMemo(() => {
    const questions = templates.reduce((total, template) => (
      total + template.themes.reduce((sum, theme) => sum + theme.questions.length, 0)
    ), 0)
    return {
      templates: templates.length,
      themes: templates.reduce((total, template) => total + template.themes.length, 0),
      questions,
    }
  }, [templates])

  const openCreatePanel = () => openDynamicPanel({
    type: 'create',
    module: 'conformite',
    meta: { subtype: 'audit-template' },
  })

  return (
    <div className="h-full overflow-auto p-3 sm:p-4">
      <div className="mb-3 grid grid-cols-3 gap-2">
        <MetricCard label={t('conformite.audit_templates.metrics.templates')} value={stats.templates} />
        <MetricCard label={t('conformite.audit_templates.metrics.themes')} value={stats.themes} />
        <MetricCard label={t('conformite.audit_templates.metrics.questions')} value={stats.questions} />
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ClipboardPenLine size={16} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">{t('conformite.audit_templates.title')}</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('conformite.audit_templates.subtitle')}</p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={openCreatePanel}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              <Plus size={14} />
              {t('conformite.audit_templates.create')}
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">{t('common.loading')}</div>
        ) : sortedTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
            <FileText size={24} className="text-muted-foreground" />
            <div className="text-sm font-semibold text-foreground">{t('conformite.audit_templates.empty_title')}</div>
            <p className="max-w-md text-xs text-muted-foreground">{t('conformite.audit_templates.empty_description')}</p>
            {canCreate && (
              <button type="button" onClick={openCreatePanel} className="mt-2 btn btn-primary btn-sm">
                <Plus size={12} />
                {t('conformite.audit_templates.create')}
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedTemplates.map(template => {
              const questionCount = template.themes.reduce((sum, theme) => sum + theme.questions.length, 0)
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => openDynamicPanel({ type: 'detail', module: 'conformite', id: template.id, meta: { subtype: 'audit-template' } })}
                  className="grid w-full gap-3 p-3 text-left transition hover:bg-accent/40 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">{template.audit_type}</span>
                      <span className="truncate text-sm font-semibold text-foreground">{template.name}</span>
                      <span className="text-[11px] text-muted-foreground">{template.code}</span>
                      {!template.active && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t('conformite.audit_templates.inactive')}</span>}
                    </span>
                    {template.description && <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{template.description}</span>}
                    <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{template.themes.length} {t('conformite.audit_templates.theme_count')}</span>
                      <span>{questionCount} {t('conformite.audit_templates.question_count')}</span>
                      <span>{t('conformite.audit_templates.passing_score_short', { score: template.passing_score })}</span>
                      <span>{template.validity_days ? t('conformite.audit_templates.validity_days', { count: template.validity_days }) : t('conformite.audit_templates.validity_permanent')}</span>
                    </span>
                  </span>
                  <span className="text-[11px] text-primary">{t('conformite.audit_templates.open_detail')}</span>
                </button>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  )
}
