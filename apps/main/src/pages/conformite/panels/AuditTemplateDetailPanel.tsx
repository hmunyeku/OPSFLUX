import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ClipboardPenLine, Loader2, Power } from 'lucide-react'
import {
  DynamicPanelShell,
  DetailFieldGrid,
  FormSection,
  PanelContentLayout,
  ReadOnlyRow,
  type ActionItem,
} from '@/components/layout/DynamicPanel'
import { useToast } from '@/components/ui/Toast'
import { usePermission } from '@/hooks/usePermission'
import { useComplianceAuditTemplates, useUpdateComplianceAuditTemplate } from '@/hooks/useConformite'
import { getAuditScoreThresholds } from '@/lib/complianceAudit'
import { cn } from '@/lib/utils'

export function AuditTemplateDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { hasPermission } = usePermission()
  const { data: templates = [], isLoading } = useComplianceAuditTemplates({ include_inactive: true })
  const updateTemplate = useUpdateComplianceAuditTemplate()
  const template = templates.find(item => item.id === id)
  const canUpdate = hasPermission('conformite.audit.template.update')

  const actionItems = useMemo<ActionItem[]>(() => {
    if (!template || !canUpdate) return []
    return [{
      id: 'toggle-active',
      label: template.active ? t('conformite.audit_templates.disable') : t('conformite.audit_templates.enable'),
      icon: template.active ? Power : CheckCircle2,
      variant: template.active ? 'default' : 'primary',
      priority: 70,
      loading: updateTemplate.isPending,
      disabled: updateTemplate.isPending,
      onClick: async () => {
        try {
          await updateTemplate.mutateAsync({ id: template.id, payload: { active: !template.active } })
          toast({ title: t(template.active ? 'conformite.audit_templates.disabled' : 'conformite.audit_templates.enabled'), variant: 'success' })
        } catch {
          toast({ title: t('conformite.toast.error'), variant: 'error' })
        }
      },
    }]
  }, [canUpdate, template, t, toast, updateTemplate])

  if (isLoading || !template) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<ClipboardPenLine size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  const questionCount = template.themes.reduce((sum, theme) => sum + theme.questions.length, 0)
  const scoreThresholds = getAuditScoreThresholds(template.score_thresholds)

  return (
    <DynamicPanelShell
      title={template.code}
      subtitle={template.name}
      icon={<ClipboardPenLine size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <PanelContentLayout>
        <FormSection title={t('common.information')}>
          <DetailFieldGrid>
            <ReadOnlyRow label={t('conformite.audit_templates.fields.name')} value={template.name} />
            <ReadOnlyRow label={t('conformite.audit_templates.fields.audit_type')} value={<span className="chip chip-info">{template.audit_type}</span>} />
            <ReadOnlyRow label={t('conformite.audit_templates.fields.passing_score')} value={`${template.passing_score}%`} />
            <ReadOnlyRow label={t('conformite.audit_templates.thresholds.title')} value={t('conformite.audit_templates.thresholds.count', { count: scoreThresholds.length })} />
            <ReadOnlyRow label={t('conformite.audit_templates.fields.validity_days')} value={template.validity_days ? t('conformite.audit_templates.validity_days', { count: template.validity_days }) : t('conformite.audit_templates.validity_permanent')} />
            <ReadOnlyRow label={t('conformite.audit_templates.metrics.themes')} value={template.themes.length} />
            <ReadOnlyRow label={t('conformite.audit_templates.metrics.questions')} value={questionCount} />
            <ReadOnlyRow
              label={t('conformite.columns.status')}
              value={<span className={cn('chip', template.active ? 'chip-success' : '')}>{template.active ? t('conformite.audit_templates.enabled') : t('conformite.audit_templates.inactive')}</span>}
            />
          </DetailFieldGrid>
          {template.description && (
            <p className="mt-3 rounded-md border border-border bg-background/60 p-3 text-sm text-muted-foreground">
              {template.description}
            </p>
          )}
          {scoreThresholds.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {scoreThresholds.map((threshold) => (
                <span key={threshold.code} className={cn('chip text-[10px]', threshold.blocks_assignment ? 'chip-danger' : 'chip-info')}>
                  {threshold.label} · ≥{threshold.min_score}%
                </span>
              ))}
            </div>
          )}
        </FormSection>

        <FormSection title={t('conformite.audit_templates.themes')}>
          <div className="space-y-3">
            {template.themes.map((theme, themeIndex) => (
              <div key={theme.id} className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase text-primary">{t('conformite.audit_templates.theme_label', { count: themeIndex + 1 })}</span>
                    <h3 className="text-sm font-semibold text-foreground">{theme.title}</h3>
                    <span className="text-[11px] text-muted-foreground">{t('conformite.audit_templates.fields.weight')}: {theme.weight}</span>
                  </div>
                  {theme.description && <p className="mt-1 text-xs text-muted-foreground">{theme.description}</p>}
                </div>
                <div className="divide-y divide-border">
                  {theme.questions.map((question, questionIndex) => (
                    <div key={question.id} className="grid gap-2 px-3 py-2 text-xs @2xl:grid-cols-[minmax(0,1fr)_7rem_4rem_8rem] @2xl:items-center">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground">{question.code || `Q${questionIndex + 1}`}</span>
                          <span className="font-medium text-foreground">{question.text}</span>
                        </div>
                      </div>
                      <span className="text-muted-foreground">{t(`conformite.audit_templates.response_types.${question.response_type === 'yes_no' ? 'yes_no' : question.response_type}`)}</span>
                      <span className="text-muted-foreground">{t('conformite.audit_templates.fields.weight')}: {question.weight}</span>
                      <div className="flex flex-wrap gap-1">
                        {question.required && <span className="chip text-[10px]">{t('conformite.audit_templates.fields.required')}</span>}
                        {question.attachment_required && <span className="chip chip-warn text-[10px]">{t('conformite.audit_templates.fields.evidence')}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
