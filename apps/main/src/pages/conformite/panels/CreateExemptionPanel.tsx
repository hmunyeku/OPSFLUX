import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldOff } from 'lucide-react'
import { DynamicPanelShell, DynamicPanelField, panelInputClass, PanelContentLayout } from '@/components/layout/DynamicPanel'
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
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { useComplianceRecords, useCreateExemption } from '@/hooks/useConformite'
import type { ComplianceExemptionCreate } from '@/types/api'

export function CreateExemptionPanel() {
  return (
    <SmartFormProvider panelId="create-exemption" defaultMode="simple">
      <CreateExemptionInner />
    </SmartFormProvider>
  )
}

function CreateExemptionInner() {
  const _ctx = useSmartForm()
  const { t } = useTranslation()
  const createExemption = useCreateExemption()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { toast } = useToast()

  const { data: recordsData } = useComplianceRecords({ page: 1, page_size: 200 })

  const [form, setForm] = useState<ComplianceExemptionCreate>({
    compliance_record_id: '',
    reason: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    conditions: null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.compliance_record_id) {
      toast({ title: t('conformite.toast.select_record'), variant: 'error' })
      return
    }
    try {
      const created = await createExemption.mutateAsync(form)
      openDynamicPanel({ type: 'detail', module: 'conformite', id: created.id, meta: { subtype: 'exemption' } })
      toast({ title: t('conformite.toast.exemption_created'), variant: 'success' })
    } catch {
      toast({ title: t('conformite.toast.exemption_creation_error'), variant: 'error' })
    }
  }

  const actionItems = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: t('common.cancel'), priority: 40, onClick: closeDynamicPanel },
    {
      id: 'create',
      label: t('common.create'),
      variant: 'primary',
      priority: 100,
      loading: createExemption.isPending,
      disabled: createExemption.isPending,
      onClick: () => (document.getElementById('create-exemption-form') as HTMLFormElement)?.requestSubmit(),
    },
  ], [t, closeDynamicPanel, createExemption.isPending])

  return (
    <DynamicPanelShell
      title="Nouvelle exemption"
      subtitle="Derogation de conformite"
      icon={<ShieldOff size={14} className="text-amber-500" />}
      actionItems={actionItems}
    >
      <form id="create-exemption-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
        <SmartFormToolbar />
        <SmartFormSimpleHint />
        <SmartFormInlineHelpDrawer />
          <SmartFormSection id="section" title={'Section'} level="essential" help={{ description: 'Section' }}>
            <DynamicPanelField label="Enregistrement" required>
              <select
                required
                value={form.compliance_record_id}
                onChange={(e) => setForm({ ...form, compliance_record_id: e.target.value })}
                className={panelInputClass}
              >
                <option value="">-- Selectionnez --</option>
                {recordsData?.items.map((rec) => (
                  <option key={rec.id} value={rec.id}>
                    {rec.type_name || rec.compliance_type_id.slice(0, 8)} - {rec.owner_type} ({rec.status})
                  </option>
                ))}
              </select>
            </DynamicPanelField>
          </SmartFormSection>

          <SmartFormSection id="t_common_reason" title={t('common.reason')} level="essential" help={{ description: t('common.reason') }}>
            <DynamicPanelField label="Raison de l'exemption" required>
              <textarea
                required
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className={`${panelInputClass} min-h-[80px] resize-y`}
                placeholder="Certification expiree mais mission critique en cours..."
                rows={3}
              />
            </DynamicPanelField>
          </SmartFormSection>

          <SmartFormSection id="t_common_period" title={t('common.period')} level="essential" help={{ description: t('common.period') }}>
            <DateRangePicker
              startDate={form.start_date || null}
              endDate={form.end_date || null}
              onStartChange={(v) => setForm({ ...form, start_date: v })}
              onEndChange={(v) => setForm({ ...form, end_date: v })}
              required
            />
          </SmartFormSection>

          <SmartFormSection id="t_common_conditions" title={t('common.conditions')} level="essential" help={{ description: t('common.conditions') }}>
            <textarea
              value={form.conditions ?? ''}
              onChange={(e) => setForm({ ...form, conditions: e.target.value || null })}
              className={`${panelInputClass} min-h-[60px] resize-y`}
              placeholder="Conditions sous lesquelles l'exemption est valide (optionnel)..."
              rows={2}
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
