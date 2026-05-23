import { useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Scale, Trash2 } from 'lucide-react'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormSection,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import type { ActionItem } from '@/components/layout/DynamicPanel'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import type { DynamicPanelView } from '@/stores/uiStore'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { usePermission } from '@/hooks/usePermission'
import {
  useComplianceTypes, useJobPositions,
  useComplianceRules, useUpdateComplianceRule, useDeleteComplianceRule, useRuleHistory,
} from '@/hooks/useConformite'
import type { ComplianceRule } from '@/types/api'
import { RuleFormFields } from './RuleFormFields'
import { formatDate } from '@/lib/i18n'

function buildRuleForm(rule?: ComplianceRule): Record<string, any> {
  return {
    subject_scope: rule?.subject_scope ?? 'person',
    target_type: rule?.target_type ?? 'all',
    target_value: rule?.target_value ?? '',
    description: rule?.description ?? '',
    priority: rule?.priority ?? 'normal',
    applicability: rule?.applicability ?? 'permanent',
    effective_from: rule?.effective_from ?? null,
    effective_to: rule?.effective_to ?? null,
    override_validity_days: rule?.override_validity_days ?? null,
    grace_period_days: rule?.grace_period_days ?? null,
    renewal_reminder_days: rule?.renewal_reminder_days ?? null,
    condition_json: rule?.condition_json ?? null,
    compliance_type_id: rule?.compliance_type_id ?? '',
  }
}

export function EditRulePanel({ view }: { view?: DynamicPanelView }) {
  const { t } = useTranslation()
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const panelView = view ?? dynamicPanel
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const updateRule = useUpdateComplianceRule()
  const deleteRule = useDeleteComplianceRule()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('conformite.rule.update')
  const canDelete = hasPermission('conformite.rule.delete')
  const { toast } = useToast()
  const { data: typesData } = useComplianceTypes({ page_size: 1000 })
  const { data: jpData } = useJobPositions({ page_size: 1000 })
  const { data: rules = [] } = useComplianceRules()
  const panelRule = panelView?.data?.rule as ComplianceRule | undefined
  const ruleId = panelRule?.id ?? (
    panelView?.type === 'edit' && panelView?.meta?.subtype === 'rule'
      ? panelView.id
      : undefined
  )
  const rule = panelRule ?? rules.find((item) => item.id === ruleId)
  const { data: historyData } = useRuleHistory(rule?.id)

  const [form, setForm] = useState<Record<string, any>>(() => buildRuleForm(rule))
  const [changeReason, setChangeReason] = useState('')

  useEffect(() => {
    if (!rule) return
    setForm(buildRuleForm(rule))
    setChangeReason('')
  }, [rule?.id])

  // Bug #88 (Rules of Hooks) : `actionItems = useMemo(...)` etait declare
  // APRES `if (!rule) return null`. Le hook est maintenant declare AVANT
  // le early return ; le mode rule=null le construit avec un set d'items
  // par defaut (jamais utilise car early return juste apres) -- pas
  // d'effet de bord, juste compliance avec les Rules of Hooks.

  const handleSave = useCallback(async () => {
    if (!rule) return
    if (!changeReason.trim()) {
      toast({ title: t('conformite.toast.change_reason_required'), variant: 'error' })
      return
    }
    try {
      await updateRule.mutateAsync({
        id: rule.id,
        payload: {
          subject_scope: form.subject_scope,
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
          change_reason: changeReason,
        },
      })
      toast({ title: t('conformite.toast.rule_updated'), variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: t('conformite.toast.error'), variant: 'error' })
    }
  }, [rule, changeReason, toast, t, updateRule, form, closeDynamicPanel])

  const handleDelete = useCallback(async () => {
    if (!rule) return
    try {
      await deleteRule.mutateAsync({ id: rule.id })
      toast({ title: t('conformite.toast.rule_deleted'), variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: t('conformite.toast.error'), variant: 'error' })
    }
  }, [rule, deleteRule, toast, t, closeDynamicPanel])

  const actionItems = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = [
      { id: 'cancel', label: t('common.cancel'), priority: 40, onClick: closeDynamicPanel },
    ]
    if (canDelete) {
      items.unshift({
        id: 'delete',
        label: t('common.delete'),
        icon: Trash2,
        variant: 'danger',
        priority: 20,
        onClick: handleDelete,
      })
    }
    if (canUpdate) {
      items.push({
        id: 'save',
        label: t('common.save'),
        variant: 'primary',
        priority: 100,
        loading: updateRule.isPending,
        disabled: updateRule.isPending || !changeReason.trim(),
        onClick: handleSave,
      })
    }
    return items
  }, [canDelete, canUpdate, closeDynamicPanel, handleDelete, handleSave, updateRule.isPending, changeReason, t])

  // Early return APRES tous les hooks (cf bug #88)
  if (!rule) return null

  return (
    <DynamicPanelShell
      title={t('conformite.rules.edit_title', 'Modifier la règle')}
      subtitle={`v${rule.version ?? 1}`}
      icon={<Scale size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <RuleFormFields form={form} setForm={canUpdate ? setForm : () => {}} typesData={typesData} jpData={jpData} typeReadOnly />

      {canUpdate && (
        <div className="px-4 pb-2">
          <FormSection title={t('common.modification')}>
            <DynamicPanelField label={t('conformite.rules.change_reason', 'Raison de la modification')} required>
              <input type="text" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} className={panelInputClass} placeholder={t('conformite.rules.change_reason_placeholder', 'Ex: mise à jour de la durée de validité...')} />
            </DynamicPanelField>
          </FormSection>
        </div>
      )}

      <div className="px-4 pb-2">
        <FormSection title={t('common.attachments')} defaultExpanded={false} collapsible>
          <AttachmentManager ownerType="compliance_rule" ownerId={rule.id} compact />
        </FormSection>
      </div>

      <div className="px-4 pb-4">
        <FormSection title={t('common.history')} defaultExpanded={false}>
          {!historyData || historyData.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t('common.no_history_available')}</p>
          ) : (
            <div className="border-l-2 border-border ml-2 space-y-0">
              {historyData.map((h: any, i: number) => (
                <div key={i} className="relative pl-5 py-2">
                  <div className="absolute left-[-5px] top-3 w-2 h-2 rounded-full bg-primary" />
                  <div className="text-xs">
                    <span className="font-medium text-foreground">v{h.version}</span>
                    <span className="text-muted-foreground ml-1.5">
                      {h.action === 'created' ? 'Création' : h.action === 'updated' ? 'Modification' : h.action === 'archived' ? 'Archivé' : h.action}
                    </span>
                    <span className="text-muted-foreground ml-1.5">· {formatDate(h.changed_at)}</span>
                  </div>
                  {h.change_reason && <p className="text-xs text-muted-foreground mt-0.5 italic">{h.change_reason}</p>}
                </div>
              ))}
            </div>
          )}
        </FormSection>
      </div>

    </DynamicPanelShell>
  )
}
