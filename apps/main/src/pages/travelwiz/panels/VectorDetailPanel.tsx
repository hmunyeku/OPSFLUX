import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '@/lib/i18n'

const numLocale = (): string => (i18n.language === 'en' ? 'en-US' : 'fr-FR')
import {
  Ship, MapPin, Loader2, Trash2,
  Info, Settings, Paperclip, Map as MapIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
  useVector,
  useUpdateVector,
  useDeleteVector,
  useVectorZones,
} from '@/hooks/useTravelWiz'
import { usePermission } from '@/hooks/usePermission'
import type { TravelVectorUpdate } from '@/types/api'
import { VECTOR_TYPE_MAP, deriveModeFromType } from '../shared'
import { VectorDeckPlanTab } from './VectorDeckPlanTab'

export function VectorDetailPanel({ id }: { id: string }) {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data: vector, isLoading } = useVector(id)
  const updateVector = useUpdateVector()
  const deleteVector = useDeleteVector()
  const { data: zones } = useVectorZones(id)
  const { toast } = useToast()
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('travelwiz.voyage.update')
  const canDelete = hasPermission('travelwiz.voyage.delete')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<TravelVectorUpdate>({})
  const [detailTab, setDetailTab] = useState<'fiche' | 'operationnel' | 'plan' | 'documents'>('fiche')

  const startEdit = useCallback(() => {
    if (!vector) return
    setEditForm({
      registration: vector.registration, name: vector.name, type: vector.type, mode: vector.mode,
      pax_capacity: vector.pax_capacity, weight_capacity_kg: vector.weight_capacity_kg,
      volume_capacity_m3: vector.volume_capacity_m3, home_base_id: vector.home_base_id,
      requires_weighing: vector.requires_weighing, mmsi_number: vector.mmsi_number, active: vector.active,
    })
    setEditing(true)
  }, [vector])

  const handleEditTypeChange = (type: string) => {
    const mode = deriveModeFromType(type)
    setEditForm((prev) => ({
      ...prev,
      type,
      mode,
      mmsi_number: mode === 'sea' ? prev.mmsi_number : null,
    }))
  }

  const handleSave = async () => {
    try { await updateVector.mutateAsync({ id, payload: editForm }); toast({ title: t('travelwiz.toast.vector_updated'), variant: 'success' }); setEditing(false) }
    catch { toast({ title: t('travelwiz.toast.vector_update_error'), variant: 'error' }) }
  }

  const handleDelete = async () => {
    try { await deleteVector.mutateAsync(id); toast({ title: t('travelwiz.toast.vector_deleted'), variant: 'success' }); closeDynamicPanel() }
    catch { toast({ title: t('travelwiz.toast.vector_deletion_error'), variant: 'error' }) }
  }

  // NOTE: the "Modifier" button was removed — OpsFlux pattern is
  // inline edit on permissioned fields (double-click InlineEditable
  // rows). Annuler/Enregistrer were the paired form-mode buttons
  // and are no longer needed either. If fields on this panel are
  // still ReadOnlyRow they need migrating to InlineEditableRow to
  // restore editability. Helpers kept for easy re-wire.
  void startEdit
  void handleSave
  void canUpdate
  const vectorDetailActions = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = []
    if (canDelete) {
      items.push({ id: 'delete', label: 'Supprimer', icon: Trash2, variant: 'danger', priority: 20, confirm: { title: 'Supprimer le vecteur', message: 'Supprimer ce vecteur ?', confirmLabel: 'Supprimer', variant: 'danger' }, onClick: handleDelete })
    }
    return items
  }, [canDelete, handleDelete])

  if (isLoading || !vector) {
    return (
      <DynamicPanelShell title={t('common.loading_ellipsis')} icon={<Ship size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const typeEntry = VECTOR_TYPE_MAP[vector.type]
  const modeLabels: Record<string, string> = { air: 'Aerien', sea: 'Maritime', road: 'Routier' }

  return (
    <DynamicPanelShell title={vector.name} subtitle={vector.registration} icon={<Ship size={14} className="text-primary" />}
      actionItems={vectorDetailActions}
    >
      <TabBar
        items={[
          { id: 'fiche', label: 'Fiche', icon: Info },
          { id: 'operationnel', label: 'Operationnel', icon: Settings },
          { id: 'plan', label: t('travelwiz.vector.deck_plan.tab', 'Plan'), icon: MapIcon },
          { id: 'documents', label: 'Documents', icon: Paperclip },
        ]}
        activeId={detailTab}
        onTabChange={setDetailTab}
      />
      <PanelContentLayout>
        {detailTab === 'fiche' && (
          editing ? (
            <>
              <FormSection title={t('common.identification')}>
                <FormGrid>
                  <DynamicPanelField label={t('common.registration')}><input type="text" value={editForm.registration ?? ''} onChange={(e) => setEditForm({ ...editForm, registration: e.target.value })} className={panelInputClass} /></DynamicPanelField>
                  <DynamicPanelField label={t('common.name_field')}><input type="text" value={editForm.name ?? ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={panelInputClass} /></DynamicPanelField>
                  <DynamicPanelField label={t('common.type_field')}>
                    <select value={editForm.type ?? ''} onChange={(e) => handleEditTypeChange(e.target.value)} className={panelInputClass}>
                      {Object.entries(VECTOR_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.mode')}>
                    <select value={editForm.mode ?? ''} onChange={(e) => setEditForm({ ...editForm, mode: e.target.value })} className={panelInputClass}>
                      <option value="air">Aerien</option>
                      <option value="sea">Maritime</option>
                      <option value="road">Routier</option>
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.home_base')} span="full">
                    <AssetPicker
                      value={editForm.home_base_id}
                      onChange={(assetId) => setEditForm({ ...editForm, home_base_id: assetId })}
                      placeholder="Selectionner une base..."
                      clearable
                    />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
              <FormSection title={t('common.capacities')}>
                <FormGrid>
                  <DynamicPanelField label="Capacite PAX"><input type="number" min={0} value={editForm.pax_capacity ?? ''} onChange={(e) => setEditForm({ ...editForm, pax_capacity: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
                  <DynamicPanelField label="Capacite poids (kg)"><input type="number" min={0} step="any" value={editForm.weight_capacity_kg ?? ''} onChange={(e) => setEditForm({ ...editForm, weight_capacity_kg: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
                  <DynamicPanelField label={t('common.volume_m3')}><input type="number" min={0} step="any" value={editForm.volume_capacity_m3 ?? ''} onChange={(e) => setEditForm({ ...editForm, volume_capacity_m3: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
                </FormGrid>
              </FormSection>
            </>
          ) : (
            <SectionColumns>
              <div className="@container space-y-4">
                <FormSection title={t('common.identification')}>
                  <DetailFieldGrid>
                    <ReadOnlyRow label="Immatriculation" value={<span className="font-mono">{vector.registration}</span>} />
                    <ReadOnlyRow label={t('common.name_field')} value={vector.name} />
                    <ReadOnlyRow label={t('common.type_field')} value={<span className={cn('gl-badge inline-flex items-center gap-1', typeEntry?.badge || 'gl-badge-neutral')}>{typeEntry?.label || vector.type}</span>} />
                    <ReadOnlyRow label="Mode" value={modeLabels[vector.mode] || vector.mode} />
                    <ReadOnlyRow label="Base d'attache" value={vector.home_base_name ?? '—'} />
                    <ReadOnlyRow label={t('common.active')} value={vector.active ? 'Oui' : 'Non'} />
                  </DetailFieldGrid>
                </FormSection>
              </div>
              <div className="@container space-y-4">
                <FormSection title={t('common.capacities')}>
                  <DetailFieldGrid>
                    <ReadOnlyRow label="Capacite PAX" value={vector.pax_capacity} />
                    <ReadOnlyRow label="Capacite poids" value={vector.weight_capacity_kg ? `${vector.weight_capacity_kg.toLocaleString(numLocale())} kg` : '—'} />
                    <ReadOnlyRow label="Volume" value={vector.volume_capacity_m3 ? `${vector.volume_capacity_m3.toLocaleString(numLocale())} m³` : '—'} />
                  </DetailFieldGrid>
                </FormSection>
              </div>
            </SectionColumns>
          )
        )}

        {detailTab === 'operationnel' && (
          editing ? (
            <FormSection title={t('common.operational')}>
              <FormGrid>
                <DynamicPanelField label="Pesee requise">
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={editForm.requires_weighing ?? false} onChange={(e) => setEditForm({ ...editForm, requires_weighing: e.target.checked })} />
                    Activer la pesee obligatoire
                  </label>
                </DynamicPanelField>
                {(editForm.mode === 'sea') && (
                  <DynamicPanelField label="Numero MMSI"><input type="text" value={editForm.mmsi_number ?? ''} onChange={(e) => setEditForm({ ...editForm, mmsi_number: e.target.value || null })} className={panelInputClass} placeholder="123456789" /></DynamicPanelField>
                )}
                <DynamicPanelField label="Actif">
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={editForm.active ?? true} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} />
                    Vecteur actif
                  </label>
                </DynamicPanelField>
              </FormGrid>
            </FormSection>
          ) : (
            <>
              <FormSection title={t('common.operational')} collapsible defaultExpanded>
                <DetailFieldGrid>
                  <ReadOnlyRow label="Pesee requise" value={vector.requires_weighing ? 'Oui' : 'Non'} />
                  {vector.mode === 'sea' && <ReadOnlyRow label="Numero MMSI" value={vector.mmsi_number ?? '—'} />}
                </DetailFieldGrid>
              </FormSection>

              <FormSection title={`Zones / Surfaces pont (${zones?.length ?? 0})`} collapsible defaultExpanded>
                {zones && zones.length > 0 ? (
                  <div className="space-y-2">
                    {zones.map((zone) => (
                      <div key={zone.id} className="flex items-center gap-3 p-2 rounded-lg border border-border/60 bg-card">
                        <MapPin size={14} className="text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{zone.name}</p>
                          <p className="text-xs text-muted-foreground">{zone.zone_type}{zone.capacity ? ` • Capacite: ${zone.capacity}` : ''}</p>
                        </div>
                        <span className={cn('gl-badge', zone.active ? 'gl-badge-success' : 'gl-badge-neutral')}>{zone.active ? 'Actif' : 'Inactif'}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-muted-foreground py-2">Aucune zone configuree.</p>}
              </FormSection>

              <FormSection title="Certifications" collapsible defaultExpanded={false}>
                <p className="text-xs text-muted-foreground py-2">Les certifications vehicule seront disponibles prochainement.</p>
              </FormSection>
            </>
          )
        )}

        {detailTab === 'plan' && <VectorDeckPlanTab vectorId={vector.id} />}

        {detailTab === 'documents' && (
          <FormSection title={t('common.files')} collapsible defaultExpanded>
            <AttachmentManager ownerType="vector" ownerId={vector.id} compact />
          </FormSection>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
