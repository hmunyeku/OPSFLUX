import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Route, Loader2,
  Info, Paperclip,
} from 'lucide-react'
import { TabBar } from '@/components/ui/Tabs'
import {
  DynamicPanelShell, PanelContentLayout, FormSection, FormGrid, DynamicPanelField,
  DetailFieldGrid, ReadOnlyRow, SectionColumns, panelInputClass, type ActionItem,
} from '@/components/layout/DynamicPanel'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import {
  useRotations,
  useUpdateRotation,
  useVectors,
} from '@/hooks/useTravelWiz'
import type { RotationUpdate } from '@/types/api'

export function RotationDetailPanel({ id }: { id: string }) {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data: rotationsData, isLoading } = useRotations({ page: 1, page_size: 100 })
  const { data: vectorsData } = useVectors({ page: 1, page_size: 100 })
  const updateRotation = useUpdateRotation()
  const { toast } = useToast()
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<RotationUpdate>({})
  const [detailTab, setDetailTab] = useState<'informations' | 'documents'>('informations')

  const rotation = useMemo(
    () => (rotationsData?.items ?? []).find((item) => item.id === id),
    [rotationsData?.items, id],
  )

  const startEdit = useCallback(() => {
    if (!rotation) return
    setEditForm({
      name: rotation.name,
      vector_id: rotation.vector_id,
      departure_base_id: rotation.departure_base_id,
      schedule_cron: rotation.schedule_cron,
      schedule_description: rotation.schedule_description,
      active: rotation.active,
    })
    setEditing(true)
  }, [rotation])

  const handleSave = async () => {
    try {
      await updateRotation.mutateAsync({ id, payload: editForm })
      toast({ title: t('travelwiz.toast.rotation_updated'), variant: 'success' })
      setEditing(false)
    } catch {
      toast({ title: t('travelwiz.toast.rotation_update_error'), variant: 'error' })
    }
  }

  // OpsFlux pattern: no "Modifier" button — inline editing on
  // permissioned fields only. Removed edit/cancel/save trio.
  // Silence unused-var warnings on helpers kept for future re-wire.
  void startEdit
  void handleSave
  void closeDynamicPanel
  const rotationDetailActions = useMemo<ActionItem[]>(() => {
    return [] as ActionItem[]
  }, [])

  if (isLoading || !rotation) {
    return (
      <DynamicPanelShell title={t('common.loading_ellipsis')} icon={<Route size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={rotation.name}
      subtitle={rotation.vector_name ?? 'Rotation TravelWiz'}
      icon={<Route size={14} className="text-primary" />}
      actionItems={rotationDetailActions}
    >
      <TabBar
        items={[
          { id: 'informations', label: 'Informations', icon: Info },
          { id: 'documents', label: 'Documents', icon: Paperclip },
        ]}
        activeId={detailTab}
        onTabChange={setDetailTab}
      />
      <PanelContentLayout>
        {detailTab === 'informations' && (
          editing ? (
            <>
              <FormSection title={t('common.identification')}>
                <FormGrid>
                  <DynamicPanelField label={t('common.name_field')}>
                    <input type="text" value={editForm.name ?? ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.vector')}>
                    <select value={editForm.vector_id ?? ''} onChange={(e) => setEditForm({ ...editForm, vector_id: e.target.value || null })} className={panelInputClass}>
                      <option value="">{t('common.select')}</option>
                      {(vectorsData?.items ?? []).map((vector) => (
                        <option key={vector.id} value={vector.id}>{vector.registration} - {vector.name}</option>
                      ))}
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.departure_base')} span="full">
                    <AssetPicker
                      value={editForm.departure_base_id ?? null}
                      onChange={(assetId) => setEditForm({ ...editForm, departure_base_id: assetId ?? null })}
                      placeholder="Selectionner la base de depart..."
                    />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
              <FormSection title={t('common.scheduling')}>
                <FormGrid>
                  <DynamicPanelField label="Expression CRON">
                    <input type="text" value={editForm.schedule_cron ?? ''} onChange={(e) => setEditForm({ ...editForm, schedule_cron: e.target.value || null })} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label="Description metier" span="full">
                    <textarea value={editForm.schedule_description ?? ''} onChange={(e) => setEditForm({ ...editForm, schedule_description: e.target.value || null })} className={`${panelInputClass} min-h-[72px] resize-y`} rows={3} />
                  </DynamicPanelField>
                  <DynamicPanelField label="Active">
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={editForm.active ?? true} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} />
                      Rotation active
                    </label>
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
            </>
          ) : (
            <SectionColumns>
              <div className="@container space-y-4">
                <FormSection title={t('common.identification')}>
                  <DetailFieldGrid>
                    <ReadOnlyRow label={t('common.name_field')} value={rotation.name} />
                    <ReadOnlyRow label={t('common.vector')} value={rotation.vector_name ?? '\u2014'} />
                    <ReadOnlyRow label="Base de depart" value={rotation.departure_base_name ?? '\u2014'} />
                    <ReadOnlyRow label="Active" value={rotation.active ? 'Oui' : 'Non'} />
                  </DetailFieldGrid>
                </FormSection>
              </div>
              <div className="@container space-y-4">
                <FormSection title={t('common.scheduling')}>
                  <DetailFieldGrid>
                    <ReadOnlyRow label="Expression CRON" value={rotation.schedule_cron ?? '\u2014'} />
                    <ReadOnlyRow label="Description metier" value={rotation.schedule_description ?? '\u2014'} />
                  </DetailFieldGrid>
                </FormSection>
              </div>
            </SectionColumns>
          )
        )}

        {detailTab === 'documents' && (
          <FormSection title={t('common.files')} collapsible defaultExpanded>
            <AttachmentManager ownerType="rotation" ownerId={rotation.id} compact />
          </FormSection>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
