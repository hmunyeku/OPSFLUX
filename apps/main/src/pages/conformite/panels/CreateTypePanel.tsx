import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { DynamicPanelShell, DynamicPanelField, FormGrid, SectionColumns, TagSelector, panelInputClass, PanelContentLayout } from '@/components/layout/DynamicPanel'
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
import { useCreateComplianceType } from '@/hooks/useConformite'
import type { ComplianceTypeCreate } from '@/types/api'
import { useConformiteDictionaryState } from '../shared'

export function CreateTypePanel() {
  return (
    <SmartFormProvider panelId="create-type" defaultMode="simple">
      <CreateTypeInner />
    </SmartFormProvider>
  )
}

function CreateTypeInner() {
  const _ctx = useSmartForm()
  const { t } = useTranslation()
  const createType = useCreateComplianceType()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()
  const { categoryOptions } = useConformiteDictionaryState()
  const [form, setForm] = useState<ComplianceTypeCreate>({
    category: 'formation',
    name: '',
    description: null,
    validity_days: null,
    is_mandatory: false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createType.mutateAsync(normalizeNames(form))
      closeDynamicPanel()
      toast({ title: t('conformite.toast.type_created'), variant: 'success' })
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
      loading: createType.isPending,
      disabled: createType.isPending,
      onClick: () => (document.getElementById('create-ct-form') as HTMLFormElement)?.requestSubmit(),
    },
  ], [t, closeDynamicPanel, createType.isPending])

  return (
    <DynamicPanelShell
      title="Nouveau type"
      subtitle="Conformite"
      icon={<ShieldCheck size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <form id="create-ct-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
        <SmartFormToolbar />
        <SmartFormSimpleHint />
        <SmartFormInlineHelpDrawer />
          <SmartFormSection id="t_common_category" title={t('common.category')} level="essential" help={{ description: t('common.category') }}>
            <TagSelector
              options={categoryOptions}
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
            />
          </SmartFormSection>

          <SectionColumns>
            <div className="@container space-y-5">
              <SmartFormSection id="t_common_information" title={t('common.information')} level="essential" help={{ description: t('common.information') }}>
                <FormGrid>
                  <DynamicPanelField label={t('common.code_field')}>
                    <span className="text-sm font-mono text-muted-foreground italic">Auto-généré à la création</span>
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.name_field')} required>
                    <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={panelInputClass} placeholder="Formation HSE Niveau 1" />
                  </DynamicPanelField>
                  <DynamicPanelField label="Validité (jours)">
                    <input type="number" value={form.validity_days ?? ''} onChange={(e) => setForm({ ...form, validity_days: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="365 (vide = permanent)" />
                  </DynamicPanelField>
                </FormGrid>
              </SmartFormSection>
            </div>

            <div className="@container space-y-5">
              <SmartFormSection id="t_common_description" title={t('common.description')} level="essential" help={{ description: t('common.description') }}>
                <textarea
                  value={form.description ?? ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                  className={`${panelInputClass} min-h-[60px] resize-y`}
                  placeholder="Description du type de conformité..."
                  rows={3}
                />
              </SmartFormSection>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_mandatory} onChange={(e) => setForm({ ...form, is_mandatory: e.target.checked })} className="rounded border-border" />
                Obligatoire par défaut
              </label>
            </div>
          </SectionColumns>
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
