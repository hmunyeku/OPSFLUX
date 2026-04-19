import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Ship, MapPin, Loader2, Pencil, Trash2, Save,
  Info, Settings, Paperclip,
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
  const [detailTab, setDetailTab] = useState<'fiche' | 'operationnel' | 'documents'>('fiche')

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

  const vectorDetailActions = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = []
    if (!editing && canUpdate) items.push({ id: 'edit', label: 'Modifier', icon: Pencil, variant: 'default', priority: 80, onClick: startEdit })
    if (editing) {
      items.push({ id: 'cancel', label: 'Annuler', variant: 'default', priority: 40, onClick: () => setEditing(false) })
      items.push({ id: 'save', label: 'Enregistrer', icon: Save, variant: 'primary', priority: 100, loading: updateVector.isPending, disabled: updateVector.isPending, onClick: handleSave })
    }
    if (!editing && canDelete) {
      items.push({ id: 'delete', label: 'Supprimer', icon: Trash2, variant: 'danger', priority: 20, confirm: { title: 'Supprimer le vecteur', message: 'Supprimer ce vecteur ?', confirmLabel: 'Supprimer', variant: 'danger' }, onClick: handleDelete })
    }
    return items
  }, [editing, canUpdate, canDelete, startEdit, updateVector.isPending, handleSave, handleDelete])

  if (isLoading || !vector) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<Ship size={14} className="text-primary" />}>
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
          { id: 'documents', label: 'Documents', icon: Paperclip },
        ]}
        activeId={detailTab}
        onTabChange={setDetailTab}
      />
      <PanelContentLayout>
        {detailTab === 'fiche' && (
          editing ? (
            <>
              <FormSection title="Identification">
                <FormGrid>
                  <DynamicPanelField label="Immatriculation"><input type="text" value={editForm.registration ?? ''} onChange={(e) => setEditForm({ ...editForm, registration: e.target.value })} className={panelInputClass} /></DynamicPanelField>
                  <DynamicPanelField label="Nom"><input type="text" value={editForm.name ?? ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={panelInputClass} /></DynamicPanelField>
                  <DynamicPanelField label="Type">
                    <select value={editForm.type ?? ''} onChange={(e) => handleEditTypeChange(e.target.value)} className={panelInputClass}>
                      {Object.entries(VECTOR_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label="Mode">
                    <select value={editForm.mode ?? ''} onChange={(e) => setEditForm({ ...editForm, mode: e.target.value })} className={panelInputClass}>
                      <option value="air">Aerien</option>
                      <option value="sea">Maritime</option>
                      <option value="road">Routier</option>
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label="Base d'attache" span="full">
                    <AssetPicker
                      value={editForm.home_base_id}
                      onChange={(assetId) => setEditForm({ ...editForm, home_base_id: assetId })}
                      placeholder="Selectionner une base..."
                      clearable
                    />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
              <FormSection title="Capacites">
                <FormGrid>
                  <DynamicPanelField label="Capacite PAX"><input type="number" min={0} value={editForm.pax_capacity ?? ''} onChange={(e) => setEditForm({ ...editForm, pax_capacity: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
                  <DynamicPanelField label="Capacite poids (kg)"><input type="number" min={0} step="any" value={editForm.weight_capacity_kg ?? ''} onChange={(e) => setEditForm({ ...editForm, weight_capacity_kg: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
                  <DynamicPanelField label="Volume (m3)"><input type="number" min={0} step="any" value={editForm.volume_capacity_m3 ?? ''} onChange={(e) => setEditForm({ ...editForm, volume_capacity_m3: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
                </FormGrid>
              </FormSection>
            </>
          ) : (
            <SectionColumns>
              <div className="@container space-y-4">
                <FormSection title="Identification">
                  <DetailFieldGrid>
                    <ReadOnlyRow label="Immatriculation" value={<span className="font-mono">{vector.registration}</span>} />
                    <ReadOnlyRow label="Nom" value={vector.name} />
                    <ReadOnlyRow label="Type" value={<span className={cn('gl-badge inline-flex items-center gap-1', typeEntry?.badge || 'gl-badge-neutral')}>{typeEntry?.label || vector.type}</span>} />
                    <ReadOnlyRow label="Mode" value={modeLabels[vector.mode] || vector.mode} />
                    <ReadOnlyRow label="Base d'attache" value={vector.home_base_name ?? '—'} />
                    <ReadOnlyRow label="Actif" value={vector.active ? 'Oui' : 'Non'} />
                  </DetailFieldGrid>
                </FormSection>
              </div>
              <div className="@container space-y-4">
                <FormSection title="Capacites">
                  <DetailFieldGrid>
                    <ReadOnlyRow label="Capacite PAX" value={vector.pax_capacity} />
                    <ReadOnlyRow label="Capacite poids" value={vector.weight_capacity_kg ? `${vector.weight_capacity_kg.toLocaleString('fr-FR')} kg` : '—'} />
                    <ReadOnlyRow label="Volume" value={vector.volume_capacity_m3 ? `${vector.volume_capacity_m3.toLocaleString('fr-FR')} m³` : '—'} />
                  </DetailFieldGrid>
                </FormSection>
              </div>
            </SectionColumns>
          )
        )}

        {detailTab === 'operationnel' && (
          editing ? (
            <FormSection title="Operationnel">
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
              <FormSection title="Operationnel" collapsible defaultExpanded>
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

        {detailTab === 'documents' && (
          <FormSection title="Fichiers" collapsible defaultExpanded>
            <AttachmentManager ownerType="vector" ownerId={vector.id} compact />
          </FormSection>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
