import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Briefcase, Trash2, Loader2, Info, Paperclip, Shield, Scale } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TabBar } from '@/components/ui/Tabs'
import {
  DynamicPanelShell,
  FormSection,
  InlineEditableRow,
  ReadOnlyRow,
  PanelContentLayout,
  DetailFieldGrid,
} from '@/components/layout/DynamicPanel'
import type { ActionItem } from '@/components/layout/DynamicPanel'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { usePermission } from '@/hooks/usePermission'
import { normalizeNames } from '@/lib/normalize'
import {
  useJobPositions, useUpdateJobPosition, useDeleteJobPosition,
  useComplianceRules, useComplianceTypes,
} from '@/hooks/useConformite'
import type { ComplianceType } from '@/types/api'
import { useConformiteDictionaryState, CATEGORY_COLORS_MAP, PRIORITY_COLORS } from '../shared'

export function JobPositionDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { hasPermission } = usePermission()
  // 'conformite.read' was never registered — gate on the rule-read
  // perm since that's what the panel actually displays.
  const canReadRules = hasPermission('conformite.rule.read')
  const { data } = useJobPositions({ page: 1, page_size: 100 })
  const jp = data?.items.find((j) => j.id === id)
  const updateJP = useUpdateJobPosition()
  const deleteJP = useDeleteJobPosition()
  const { toast } = useToast()
  const { categoryLabels, rulePriorityLabels } = useConformiteDictionaryState()
  const [detailTab, setDetailTab] = useState<'fiche' | 'regles' | 'documents'>('fiche')

  const { data: allRules } = useComplianceRules(undefined)
  const { data: typesData } = useComplianceTypes({ page: 1, page_size: 200 })

  const handleSave = useCallback((field: string, value: string) => {
    updateJP.mutate({ id, payload: normalizeNames({ [field]: value }) })
  }, [id, updateJP])

  const handleDelete = useCallback(async () => {
    await deleteJP.mutateAsync(id)
    closeDynamicPanel()
    toast({ title: t('conformite.toast.job_position_archived'), variant: 'success' })
  }, [id, deleteJP, closeDynamicPanel, toast, t])

  const typesMap = useMemo(() => {
    const m = new Map<string, ComplianceType>()
    for (const ct of typesData?.items ?? []) m.set(ct.id, ct)
    return m
  }, [typesData?.items])

  const actionItems = useMemo<ActionItem[]>(() => [
    {
      id: 'delete',
      label: t('common.delete'),
      icon: Trash2,
      variant: 'danger',
      priority: 20,
      onClick: handleDelete,
    },
  ], [t, handleDelete])

  if (!jp) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<Briefcase size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const linkedRules = allRules?.filter(
    r => r.active && (
      (r.target_type === 'job_position' && (r.target_value === jp.code || r.target_value === jp.id)) ||
      r.target_type === 'all'
    )
  ) ?? []

  return (
    <DynamicPanelShell
      title={jp.code}
      subtitle={jp.name}
      icon={<Briefcase size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <TabBar
        items={[
          { id: 'fiche', label: 'Fiche de poste', icon: Info },
          { id: 'regles', label: `Exigences (${linkedRules.length})`, icon: Shield },
          { id: 'documents', label: 'Documents', icon: Paperclip },
        ]}
        activeId={detailTab}
        onTabChange={(id) => setDetailTab(id as typeof detailTab)}
      />
      {detailTab === 'fiche' && (
        <PanelContentLayout>
          <FormSection title={t('common.information')}>
            <DetailFieldGrid>
              <ReadOnlyRow label={t('common.code_field')} value={<span className="text-sm font-mono font-medium text-foreground">{jp.code || '—'}</span>} />
              <InlineEditableRow label="Intitulé" value={jp.name} onSave={(v) => handleSave('name', v)} />
              <InlineEditableRow label="Departement" value={jp.department || ''} onSave={(v) => handleSave('department', v)} />
            </DetailFieldGrid>
          </FormSection>
          <FormSection title={t('common.description')}>
            <InlineEditableRow label="Description" value={jp.description || ''} onSave={(v) => handleSave('description', v)} />
          </FormSection>
        </PanelContentLayout>
      )}
      {detailTab === 'regles' && (
        <PanelContentLayout>
          <FormSection title={`Exigences de conformité (${linkedRules.length})`}>
          {linkedRules.length > 0 ? (
            <div className="space-y-1.5">
              {linkedRules.map(r => {
                const ct = typesMap.get(r.compliance_type_id)
                const validityDays = r.override_validity_days ?? ct?.validity_days
                const isClickable = canReadRules
                return (
                  <div
                    key={r.id}
                    className={cn(
                      'flex items-center gap-2 text-xs py-1.5 px-2.5 bg-muted/30 rounded border border-border/50',
                      isClickable && 'cursor-pointer hover:bg-primary/5 hover:border-primary/30 transition-colors',
                    )}
                    onClick={isClickable ? () => openDynamicPanel({ type: 'edit', module: 'conformite', id: r.id, meta: { subtype: 'rule' }, data: { rule: r } }) : undefined}
                    role={isClickable ? 'button' : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                  >
                    <Scale size={10} className="text-muted-foreground shrink-0" />
                    <span className={cn('flex-1 font-medium truncate', isClickable ? 'text-primary' : 'text-foreground')}>
                      {ct ? ct.name : r.description || r.compliance_type_id}
                    </span>
                    {ct && (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white shrink-0 ${CATEGORY_COLORS_MAP[ct.category] ?? 'bg-zinc-500'}`}>
                        {categoryLabels[ct.category] ?? ct.category}
                      </span>
                    )}
                    {validityDays != null && (
                      <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{validityDays}j</span>
                    )}
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white shrink-0 ${PRIORITY_COLORS[r.priority] ?? 'bg-zinc-500'}`}>
                      {rulePriorityLabels[r.priority] ?? r.priority}
                    </span>
                    {r.target_type === 'all' && (
                      <span className="text-[10px] text-muted-foreground italic shrink-0">(global)</span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Aucune exigence de conformité définie pour ce poste.</p>
          )}
        </FormSection>
        </PanelContentLayout>
      )}
      {detailTab === 'documents' && (
        <PanelContentLayout>
          <FormSection title={t('common.attachments')}>
            <AttachmentManager ownerType="job_position" ownerId={jp.id} compact />
          </FormSection>
        </PanelContentLayout>
      )}
    </DynamicPanelShell>
  )
}
