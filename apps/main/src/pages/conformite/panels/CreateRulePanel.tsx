import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Scale, Paperclip } from 'lucide-react'
import {
  DynamicPanelShell,
} from '@/components/layout/DynamicPanel'
import type { ActionItem } from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { useComplianceTypes, useJobPositions, useCreateComplianceRule } from '@/hooks/useConformite'
import { RuleFormFields } from './RuleFormFields'

export function CreateRulePanel() {
  const { t } = useTranslation()
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const createRule = useCreateComplianceRule()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()
  const { data: typesData } = useComplianceTypes({ page_size: 200 })
  const { data: jpData } = useJobPositions({ page_size: 200 })

  const preType = dynamicPanel?.meta?.prefill_type_id ?? ''
  const preTarget = dynamicPanel?.meta?.prefill_target_type ?? 'job_position'
  const preTargetValue = dynamicPanel?.meta?.prefill_target_value ?? ''

  const [form, setForm] = useState<Record<string, any>>({
    compliance_type_id: preType,
    target_type: preTarget,
    target_value: preTargetValue,
    description: '',
    priority: 'normal',
    applicability: 'permanent',
    effective_from: null,
    effective_to: null,
    override_validity_days: null,
    grace_period_days: null,
    renewal_reminder_days: null,
    condition_json: null,
  })

  const handleCreate = async () => {
    if (!form.compliance_type_id) return
    try {
      await createRule.mutateAsync({
        compliance_type_id: form.compliance_type_id,
        target_type: form.target_type,
        target_value: form.target_value || undefined,
        description: form.description || undefined,
        priority: form.priority,
        applicability: form.applicability,
        effective_from: form.effective_from || undefined,
        effective_to: form.effective_to || undefined,
        override_validity_days: form.override_validity_days,
        grace_period_days: form.grace_period_days,
        renewal_reminder_days: form.renewal_reminder_days,
        condition_json: form.condition_json,
      })
      toast({ title: t('conformite.toast.rule_created'), variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: t('conformite.toast.error'), variant: 'error' })
    }
  }

  const actionItems = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: 'Annuler', priority: 40, onClick: closeDynamicPanel },
    {
      id: 'create',
      label: 'Creer',
      variant: 'primary',
      priority: 100,
      loading: createRule.isPending,
      disabled: !form.compliance_type_id || createRule.isPending,
      onClick: handleCreate,
    },
  ], [closeDynamicPanel, createRule.isPending, form.compliance_type_id, handleCreate])

  return (
    <DynamicPanelShell
      title="Nouvelle regle"
      subtitle="Conformite"
      icon={<Scale size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <RuleFormFields form={form} setForm={setForm} typesData={typesData} jpData={jpData} />
      <div className="px-4 pb-2">
        <p className="text-xs text-muted-foreground italic flex items-center gap-1.5">
          <Paperclip size={11} /> Les pièces jointes pourront être ajoutées après la création de la règle.
        </p>
      </div>
    </DynamicPanelShell>
  )
}
