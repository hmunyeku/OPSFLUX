import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, Trash2, Loader2, Info, Paperclip } from 'lucide-react'
import { TabBar } from '@/components/ui/Tabs'
import {
  DynamicPanelShell,
  FormSection,
  InlineEditableRow,
  ReadOnlyRow,
  PanelContentLayout,
  DetailFieldGrid,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { cn } from '@/lib/utils'
import type { ActionItem } from '@/components/layout/DynamicPanel'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { normalizeNames } from '@/lib/normalize'
import { useComplianceTypes, useUpdateComplianceType, useDeleteComplianceType } from '@/hooks/useConformite'
import { useConformiteDictionaryState } from '../shared'

export function TypeDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data } = useComplianceTypes({ page: 1, page_size: 100 })
  const ct = data?.items.find((c) => c.id === id)
  const updateType = useUpdateComplianceType()
  const deleteType = useDeleteComplianceType()
  const { toast } = useToast()
  const { categoryLabels } = useConformiteDictionaryState()
  const [detailTab, setDetailTab] = useState<'fiche' | 'documents'>('fiche')

  const handleSave = useCallback((field: string, value: string) => {
    updateType.mutate({ id, payload: normalizeNames({ [field]: value }) })
  }, [id, updateType])

  const handleDelete = useCallback(async () => {
    await deleteType.mutateAsync(id)
    closeDynamicPanel()
    toast({ title: t('conformite.toast.type_archived'), variant: 'success' })
  }, [id, deleteType, closeDynamicPanel, toast, t])

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

  if (!ct) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<ShieldCheck size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={ct.code}
      subtitle={ct.name}
      icon={<ShieldCheck size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <TabBar
        items={[
          { id: 'fiche', label: 'Informations', icon: Info },
          { id: 'documents', label: 'Documents', icon: Paperclip },
        ]}
        activeId={detailTab}
        onTabChange={(id) => setDetailTab(id as typeof detailTab)}
      />
      {detailTab === 'fiche' && (
        <PanelContentLayout>
          <FormSection title={t('common.information')}>
            <DetailFieldGrid>
              <ReadOnlyRow label="Catégorie" value={<span className="gl-badge gl-badge-info">{categoryLabels[ct.category] ?? ct.category}</span>} />
              <ReadOnlyRow label={t('common.code_field')} value={<span className="text-sm font-mono font-medium text-foreground">{ct.code || '—'}</span>} />
              <InlineEditableRow label="Nom" value={ct.name} onSave={(v) => handleSave('name', v)} />
              <ReadOnlyRow label="Validité" value={ct.validity_days ? `${ct.validity_days} jours` : 'Permanent'} />
              <ReadOnlyRow label="Obligatoire" value={ct.is_mandatory ? 'Oui' : 'Non'} />
            </DetailFieldGrid>
          </FormSection>
          <FormSection title={t('common.description')}>
            {/* Full-width — FormSection labels this block already,
                the inner label row was cramping multiline content. */}
            <textarea
              defaultValue={ct.description || ''}
              onBlur={(e) => {
                const next = e.target.value.trim()
                if (next !== (ct.description || '').trim()) {
                  handleSave('description', next)
                }
              }}
              rows={5}
              className={cn(panelInputClass, 'w-full min-h-[120px] text-sm leading-relaxed whitespace-pre-wrap')}
              placeholder={t('common.description') as string}
            />
          </FormSection>
        </PanelContentLayout>
      )}
      {detailTab === 'documents' && (
        <PanelContentLayout>
          <FormSection title={t('common.attachments')}>
            <AttachmentManager ownerType="compliance_type" ownerId={ct.id} compact />
          </FormSection>
        </PanelContentLayout>
      )}
    </DynamicPanelShell>
  )
}

