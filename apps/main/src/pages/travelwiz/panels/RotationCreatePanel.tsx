import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Route } from 'lucide-react'
import {
  DynamicPanelShell, PanelContentLayout, FormSection, FormGrid, DynamicPanelField,
  panelInputClass, type ActionItem,
} from '@/components/layout/DynamicPanel'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { useStagingRef } from '@/hooks/useStagingRef'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import { useCreateRotation, useVectors } from '@/hooks/useTravelWiz'
import type { RotationCreate } from '@/types/api'
import { CronScheduleBuilder } from './CronScheduleBuilder'

export function CreateRotationPanel() {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createRotation = useCreateRotation()
  const { stagingRef, stagingOwnerType } = useStagingRef('rotation')
  const { data: vectorsData } = useVectors({ page: 1, page_size: 100 })
  const { toast } = useToast()
  const { t } = useTranslation()
  const [form, setForm] = useState<RotationCreate>({
    name: '',
    vector_id: '',
    departure_base_id: '',
    schedule_cron: null,
    schedule_description: null,
  })
  const vectors = vectorsData?.items ?? []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createRotation.mutateAsync({ ...form, staging_ref: stagingRef } as RotationCreate & { staging_ref?: string })
      toast({ title: t('travelwiz.toast.rotation_created'), variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: t('travelwiz.toast.rotation_creation_error'), variant: 'error' })
    }
  }

  const createRotationActions = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: 'Annuler', variant: 'default', priority: 40, onClick: closeDynamicPanel },
    { id: 'submit', label: 'Creer', variant: 'primary', priority: 100, loading: createRotation.isPending, disabled: createRotation.isPending, onClick: () => (document.getElementById('create-rotation-form') as HTMLFormElement)?.requestSubmit() },
  ], [closeDynamicPanel, createRotation.isPending])

  return (
    <DynamicPanelShell
      title="Nouvelle rotation"
      subtitle="Programmation recurrente TravelWiz"
      icon={<Route size={14} className="text-primary" />}
      actionItems={createRotationActions}
    >
      <form id="create-rotation-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title={t('common.identification')}>
            <FormGrid>
              <DynamicPanelField label={t('common.name_field')} required>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={panelInputClass}
                  placeholder="Rotation Pointe-Noire Hebdo"
                />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.vector')} required>
                <select
                  required
                  value={form.vector_id}
                  onChange={(e) => setForm({ ...form, vector_id: e.target.value })}
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
              <DynamicPanelField label={t('common.departure_base')} required span="full">
                <AssetPicker
                  value={form.departure_base_id || null}
                  onChange={(assetId) => setForm({ ...form, departure_base_id: assetId ?? '' })}
                  placeholder="Sélectionner la base de départ..."
                />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
          <FormSection title={t('common.periodicity')}>
            <CronScheduleBuilder
              value={form.schedule_cron}
              description={form.schedule_description}
              onChange={(cron, desc) => setForm({ ...form, schedule_cron: cron, schedule_description: desc })}
            />
            <p className="text-xs text-muted-foreground mt-2">
              La rotation définit la cadence nominale. Les voyages opérationnels restent des occurrences concrètes générées ou planifiées sur cette base.
            </p>
          </FormSection>

          <FormSection title={t('common.attachments')} collapsible defaultExpanded={false}>
            <AttachmentManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
          </FormSection>

          <FormSection title={t('common.notes')} collapsible defaultExpanded={false}>
            <NoteManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
          </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}
