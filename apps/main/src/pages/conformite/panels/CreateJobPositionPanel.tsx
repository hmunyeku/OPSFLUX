import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Briefcase } from 'lucide-react'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  panelInputClass,
  PanelContentLayout,
} from '@/components/layout/DynamicPanel'
import type { ActionItem } from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { normalizeNames } from '@/lib/normalize'
import { useCreateJobPosition } from '@/hooks/useConformite'
import type { JobPositionCreate } from '@/types/api'

export function CreateJobPositionPanel() {
  const { t } = useTranslation()
  const createJP = useCreateJobPosition()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()
  const [form, setForm] = useState<JobPositionCreate>({
    name: '',
    description: null,
    department: null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createJP.mutateAsync(normalizeNames(form))
      closeDynamicPanel()
      toast({ title: t('conformite.toast.job_position_created'), variant: 'success' })
    } catch {
      toast({ title: t('conformite.toast.error'), variant: 'error' })
    }
  }

  const actionItems = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: t('common.cancel'), priority: 40, onClick: closeDynamicPanel },
    {
      id: 'create',
      label: t('common.create'),
      variant: 'primary',
      priority: 100,
      loading: createJP.isPending,
      disabled: createJP.isPending,
      onClick: () => (document.getElementById('create-jp-form') as HTMLFormElement)?.requestSubmit(),
    },
  ], [t, closeDynamicPanel, createJP.isPending])

  return (
    <DynamicPanelShell
      title="Nouvelle fiche de poste"
      subtitle="Conformite HSE"
      icon={<Briefcase size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <form id="create-jp-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title="Informations">
            <FormGrid>
              <DynamicPanelField label="Code">
                <span className="text-sm font-mono text-muted-foreground italic">Auto-généré à la création</span>
              </DynamicPanelField>
              <DynamicPanelField label="Intitulé du poste" required>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={panelInputClass} placeholder="Opérateur de production" />
              </DynamicPanelField>
              <DynamicPanelField label="Departement">
                <input type="text" value={form.department ?? ''} onChange={(e) => setForm({ ...form, department: e.target.value || null })} className={panelInputClass} placeholder="Production, HSE, Maintenance..." />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>

          <FormSection title="Description">
            <textarea
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value || null })}
              className={`${panelInputClass} min-h-[60px] resize-y`}
              placeholder="Description du poste et exigences HSE..."
              rows={3}
            />
          </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}
