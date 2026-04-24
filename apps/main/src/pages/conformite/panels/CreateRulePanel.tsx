import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Scale } from 'lucide-react'
import {
  DynamicPanelShell,
} from '@/components/layout/DynamicPanel'
import {
  SmartFormProvider,
  SmartFormToolbar,
  SmartFormSimpleHint,
  SmartFormInlineHelpDrawer,
  SmartFormWizardNav,
  useSmartForm,
} from '@/components/layout/SmartForm'
import type { ActionItem } from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { useComplianceTypes, useJobPositions, useCreateComplianceRule } from '@/hooks/useConformite'
import { RuleFormFields } from './RuleFormFields'

export function CreateRulePanel() {
  return (
    <SmartFormProvider panelId="create-compliance-rule" defaultMode="simple">
      <CreateRulePanelInner />
    </SmartFormProvider>
  )
}

function CreateRulePanelInner() {
  const _ctx = useSmartForm()
  const { t } = useTranslation()
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const createRule = useCreateComplianceRule()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
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

  // After create, open the rule edit panel so the user can attach
  // supporting docs, notes, sub-conditions — the standard
  // "polymorphic add-ons after save" flow used by every other
  // create panel (compliance records, MOCs, etc.).
  const handleCreate = useCallback(async () => {
    if (!form.compliance_type_id) return
    try {
      const created = await createRule.mutateAsync({
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
      // Reopen on the edit surface — same detail view that already
      // hosts AttachmentManager / NoteManager so operators can add
      // polymorphic children without closing the panel.
      openDynamicPanel({
        type: 'edit',
        module: 'conformite',
        id: created.id,
        meta: { subtype: 'rule' },
      })
    } catch {
      toast({ title: t('conformite.toast.error'), variant: 'error' })
    }
  }, [form, createRule, toast, t, openDynamicPanel])

  const actionItems = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: t('common.cancel'), priority: 40, onClick: closeDynamicPanel },
    {
      id: 'create',
      label: t('common.create'),
      variant: 'primary',
      priority: 100,
      loading: createRule.isPending,
      disabled: !form.compliance_type_id || createRule.isPending,
      onClick: handleCreate,
    },
  ], [closeDynamicPanel, createRule.isPending, form.compliance_type_id, handleCreate, t])

  return (
    <DynamicPanelShell
      title={t('conformite.rules.create', 'Nouvelle règle')}
      subtitle={t('conformite.title', 'Conformité')}
      icon={<Scale size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <SmartFormToolbar />
      <SmartFormSimpleHint />
      <SmartFormInlineHelpDrawer />

      <RuleFormFields form={form} setForm={setForm} typesData={typesData} jpData={jpData} />

      {_ctx?.mode === 'wizard' && (
        <SmartFormWizardNav onSubmit={handleCreate} onCancel={closeDynamicPanel} />
      )}
    </DynamicPanelShell>
  )
}
