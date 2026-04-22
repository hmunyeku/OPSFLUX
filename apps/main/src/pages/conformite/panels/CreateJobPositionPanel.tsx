import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Briefcase } from 'lucide-react'
import { DynamicPanelShell, DynamicPanelField, FormGrid, panelInputClass, PanelContentLayout } from '@/components/layout/DynamicPanel'
import {
  SmartFormProvider,
  SmartFormSection,
  SmartFormToolbar,
  SmartFormSimpleHint,
  SmartFormWizardNav,
  SmartFormInlineHelpDrawer,
  useSmartForm,
} from '@/components/layout/SmartForm'
import type { ActionItem } from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { normalizeNames } from '@/lib/normalize'
import { useCreateJobPosition } from '@/hooks/useConformite'
import type { JobPositionCreate } from '@/types/api'

export function CreateJobPositionPanel() {
  return (
    <SmartFormProvider panelId="create-job-position" defaultMode="simple">
      <CreateJobPositionInner />
    </SmartFormProvider>
  )
}

function CreateJobPositionInner() {
  const _ctx = useSmartForm()
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
        <SmartFormToolbar />
        <SmartFormSimpleHint />
        <SmartFormInlineHelpDrawer />
          <SmartFormSection id="t_common_information" title={t('common.information')} level="essential" help={{ description: t('common.information') }}>
            <FormGrid>
              <DynamicPanelField label={t('common.code_field')}>
                <span className="text-sm font-mono text-muted-foreground italic">Auto-généré à la création</span>
              </DynamicPanelField>
              <DynamicPanelField label="Intitulé du poste" required>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={panelInputClass} placeholder="Opérateur de production" />
              </DynamicPanelField>
              <DynamicPanelField label="Departement">
                <input type="text" value={form.department ?? ''} onChange={(e) => setForm({ ...form, department: e.target.value || null })} className={panelInputClass} placeholder="Production, HSE, Maintenance..." />
              </DynamicPanelField>
            </FormGrid>
          </SmartFormSection>

          <SmartFormSection id="t_common_description" title={t('common.description')} level="essential" help={{ description: t('common.description') }}>
            <textarea
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value || null })}
              className={`${panelInputClass} min-h-[60px] resize-y`}
              placeholder="Description du poste et exigences HSE..."
              rows={3}
            />
          </SmartFormSection>
        {_ctx?.mode === 'wizard' && (

          <SmartFormWizardNav

            onSubmit={() => document.querySelector('form')?.requestSubmit()}

            onCancel={() => {}}

          />

        )}

        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}
