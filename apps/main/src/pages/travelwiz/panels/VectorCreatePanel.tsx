import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Ship } from 'lucide-react'
import {
  DynamicPanelShell, PanelContentLayout, FormSection, FormGrid, DynamicPanelField,
  panelInputClass, type ActionItem,
} from '@/components/layout/DynamicPanel'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import { useCreateVector } from '@/hooks/useTravelWiz'
import type { TravelVectorCreate } from '@/types/api'
import { deriveModeFromType } from '../shared'

export function CreateVectorPanel() {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createVector = useCreateVector()
  const { toast } = useToast()
  const [form, setForm] = useState<TravelVectorCreate>({
    registration: '', name: '', type: 'helicopter', mode: 'air',
    pax_capacity: 0, weight_capacity_kg: null, volume_capacity_m3: null,
    home_base_id: null, requires_weighing: false, mmsi_number: null, description: null,
  })

  const handleTypeChange = (type: string) => {
    const mode = deriveModeFromType(type)
    setForm((prev) => ({
      ...prev,
      type,
      mode,
      // Clear MMSI when mode is not sea
      mmsi_number: mode === 'sea' ? prev.mmsi_number : null,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createVector.mutateAsync(form)
      toast({ title: t('travelwiz.toast.vector_created'), variant: 'success' })
      closeDynamicPanel()
    } catch { toast({ title: t('travelwiz.toast.vector_creation_error'), variant: 'error' }) }
  }

  const createVectorActions = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: 'Annuler', variant: 'default', priority: 40, onClick: closeDynamicPanel },
    { id: 'submit', label: 'Creer', variant: 'primary', priority: 100, loading: createVector.isPending, disabled: createVector.isPending, onClick: () => (document.getElementById('create-vector-form') as HTMLFormElement)?.requestSubmit() },
  ], [closeDynamicPanel, createVector.isPending])

  return (
    <DynamicPanelShell title="Nouveau vecteur" subtitle="TravelWiz" icon={<Ship size={14} className="text-primary" />}
      actionItems={createVectorActions}
    >
      <form id="create-vector-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title={t('common.identification')}>
            <FormGrid>
              <DynamicPanelField label="Immatriculation" required>
                <input type="text" required value={form.registration} onChange={(e) => setForm({ ...form, registration: e.target.value })} className={panelInputClass} placeholder="TJ-ABC" />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.name_field')} required>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={panelInputClass} placeholder="Nom du vecteur" />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.type_field')} required>
                <select value={form.type} onChange={(e) => handleTypeChange(e.target.value)} className={panelInputClass}>
                  <option value="helicopter">{t('travelwiz.vector_types.helicopter')}</option>
                  <option value="boat">{t('travelwiz.vector_types.ship')}</option>
                  <option value="surfer">{t('travelwiz.vector_types.surfer')}</option>
                  <option value="bus">{t('travelwiz.vector_types.bus')}</option>
                  <option value="4x4">4x4</option>
                  <option value="commercial_flight">{t('travelwiz.vector_types.commercial_flight')}</option>
                  <option value="barge">{t('travelwiz.vector_types.barge')}</option>
                  <option value="tug">Remorqueur</option>
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Mode" required>
                <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className={panelInputClass}>
                  <option value="air">Aerien</option>
                  <option value="sea">Maritime</option>
                  <option value="road">Routier</option>
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Base d'attache" span="full">
                <AssetPicker
                  value={form.home_base_id}
                  onChange={(assetId) => setForm({ ...form, home_base_id: assetId })}
                  placeholder="Sélectionner une base..."
                  clearable
                />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <FormSection title={t('common.capacities')}>
            <FormGrid>
              <DynamicPanelField label="Capacité PAX" required>
                <input type="number" min={0} required value={form.pax_capacity ?? 0} onChange={(e) => setForm({ ...form, pax_capacity: e.target.value ? Number(e.target.value) : 0 })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Capacité poids (kg)">
                <input type="number" min={0} step="any" value={form.weight_capacity_kg ?? ''} onChange={(e) => setForm({ ...form, weight_capacity_kg: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.volume_m3')}>
                <input type="number" min={0} step="any" value={form.volume_capacity_m3 ?? ''} onChange={(e) => setForm({ ...form, volume_capacity_m3: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <FormSection title={t('common.operational')} collapsible defaultExpanded={false}>
            <FormGrid>
              <DynamicPanelField label="Pesée requise">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.requires_weighing ?? false} onChange={(e) => setForm({ ...form, requires_weighing: e.target.checked })} />
                  Activer la pesee obligatoire
                </label>
              </DynamicPanelField>
              {form.mode === 'sea' && (
                <DynamicPanelField label="Numéro MMSI">
                  <input type="text" value={form.mmsi_number ?? ''} onChange={(e) => setForm({ ...form, mmsi_number: e.target.value || null })} className={panelInputClass} placeholder="123456789" />
                </DynamicPanelField>
              )}
              <DynamicPanelField label={t('common.description')} span="full">
                <textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                  className={`${panelInputClass} min-h-[60px] resize-y`} placeholder="Description du vecteur..." rows={3} />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}
