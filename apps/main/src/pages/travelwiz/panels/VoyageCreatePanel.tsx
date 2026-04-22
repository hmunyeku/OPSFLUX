import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plane } from 'lucide-react'
import {
  DynamicPanelShell, PanelContentLayout, FormSection, FormGrid, DynamicPanelField,
  panelInputClass, type ActionItem,
} from '@/components/layout/DynamicPanel'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import { useCreateVoyage, useVectors, useRotations } from '@/hooks/useTravelWiz'
import type { VoyageCreate } from '@/types/api'

export function CreateVoyagePanel() {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createVoyage = useCreateVoyage()
  const { data: vectorsData } = useVectors({ page: 1, page_size: 100 })
  const { data: rotationsData } = useRotations({ page: 1, page_size: 100 })
  const { toast } = useToast()
  const { t } = useTranslation()
  const [form, setForm] = useState<VoyageCreate>({
    vector_id: '',
    departure_base_id: '',
    scheduled_departure: '',
    scheduled_arrival: null,
    rotation_id: null,
  })
  const vectors = vectorsData?.items ?? []
  const rotations = useMemo(
    () => (rotationsData?.items ?? []).filter((rotation) => !form.vector_id || rotation.vector_id === form.vector_id),
    [rotationsData?.items, form.vector_id],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createVoyage.mutateAsync(form)
      toast({ title: t('travelwiz.toast.voyage_created'), variant: 'success' })
      closeDynamicPanel()
    } catch { toast({ title: t('travelwiz.toast.voyage_creation_error'), variant: 'error' }) }
  }

  const createVoyageActions = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: 'Annuler', variant: 'default', priority: 40, onClick: closeDynamicPanel },
    { id: 'submit', label: 'Creer', variant: 'primary', priority: 100, loading: createVoyage.isPending, disabled: createVoyage.isPending, onClick: () => (document.getElementById('create-voyage-form') as HTMLFormElement)?.requestSubmit() },
  ], [closeDynamicPanel, createVoyage.isPending])

  return (
    <DynamicPanelShell title="Nouveau voyage" subtitle="TravelWiz" icon={<Plane size={14} className="text-primary" />}
      actionItems={createVoyageActions}
    >
      <form id="create-voyage-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title={t('common.identification')}>
            <FormGrid>
              <DynamicPanelField label={t('common.reference')}>
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Générée automatiquement par la numérotation TravelWiz au moment de la création.
                </div>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.vector')} required>
                <select
                  required
                  value={form.vector_id}
                  onChange={(e) => setForm({ ...form, vector_id: e.target.value, rotation_id: null })}
                  className={panelInputClass}
                >
                  <option value="">Sélectionner un vecteur...</option>
                  {vectors.map((vector) => (
                    <option key={vector.id} value={vector.id}>
                      {vector.registration} - {vector.name}
                    </option>
                  ))}
                </select>
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <FormSection title={t('common.scheduling')}>
            <FormGrid>
              <DynamicPanelField label="Rotation">
                <select
                  value={form.rotation_id ?? ''}
                  onChange={(e) => setForm({ ...form, rotation_id: e.target.value || null })}
                  className={panelInputClass}
                >
                  <option value="">Voyage ponctuel</option>
                  {rotations.map((rotation) => (
                    <option key={rotation.id} value={rotation.id}>
                      {rotation.name}{rotation.schedule_description ? ` - ${rotation.schedule_description}` : ''}
                    </option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Base de départ" required span="full">
                <AssetPicker
                  value={form.departure_base_id || null}
                  onChange={(assetId) => setForm({ ...form, departure_base_id: assetId ?? '' })}
                  placeholder="Sélectionner une base de départ..."
                />
              </DynamicPanelField>
            </FormGrid>
            <p className="text-xs text-muted-foreground">
              La périodicité régulière se configure sur une rotation. Un voyage créé ici est une occurrence planifiée, éventuellement rattachée à une rotation existante.
            </p>
          </FormSection>
          <FormSection title="Horaires">
            <FormGrid>
              <DynamicPanelField label="Départ prévu" required>
                <input
                  type="datetime-local"
                  required
                  value={form.scheduled_departure}
                  onChange={(e) => setForm({ ...form, scheduled_departure: e.target.value })}
                  className={panelInputClass}
                />
              </DynamicPanelField>
              <DynamicPanelField label="Arrivée prévue">
                <input
                  type="datetime-local"
                  value={form.scheduled_arrival ?? ''}
                  onChange={(e) => setForm({ ...form, scheduled_arrival: e.target.value || null })}
                  className={panelInputClass}
                />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}
