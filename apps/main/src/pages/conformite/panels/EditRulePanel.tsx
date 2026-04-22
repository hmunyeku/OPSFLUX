import { useState, useMemo } from 'react'
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
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { usePermission } from '@/hooks/usePermission'
import {
  useComplianceTypes, useJobPositions,
  useUpdateComplianceRule, useDeleteComplianceRule, useRuleHistory,
} from '@/hooks/useConformite'
import type { ComplianceRule } from '@/types/api'
import { RuleFormFields } from './RuleFormFields'
import { formatDate } from '@/lib/i18n'

export function EditRulePanel() {
  const { t } = useTranslation()
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const updateRule = useUpdateComplianceRule()
  const deleteRule = useDeleteComplianceRule()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('conformite.rule.update')
  const canDelete = hasPermission('conformite.rule.delete')
  const { toast } = useToast()
  const { data: typesData } = useComplianceTypes({ page_size: 200 })
  const { data: jpData } = useJobPositions({ page_size: 200 })
  const rule = dynamicPanel?.data?.rule as ComplianceRule | undefined
  const { data: historyData } = useRuleHistory(rule?.id)

  const [form, setForm] = useState<Record<string, any>>({
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
  })
  const [changeReason, setChangeReason] = useState('')

  if (!rule) return null

  const handleSave = async () => {
    if (!changeReason.trim()) {
      toast({ title: t('conformite.toast.change_reason_required'), variant: 'error' })
      return
    }
    try {
      await updateRule.mutateAsync({
        id: rule.id,
        payload: {
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
  }

  const handleDelete = async () => {
    try {
      await deleteRule.mutateAsync({ id: rule.id })
      toast({ title: t('conformite.toast.rule_deleted'), variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: t('conformite.toast.error'), variant: 'error' })
    }
  }

  const actionItems = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = [
      { id: 'cancel', label: 'Annuler', priority: 40, onClick: closeDynamicPanel },
    ]
    if (canDelete) {
      items.unshift({
        id: 'delete',
        label: 'Supprimer',
        icon: Trash2,
        variant: 'danger',
        priority: 20,
        onClick: handleDelete,
      })
    }
    if (canUpdate) {
      items.push({
        id: 'save',
        label: 'Enregistrer',
        variant: 'primary',
        priority: 100,
        loading: updateRule.isPending,
        disabled: updateRule.isPending || !changeReason.trim(),
        onClick: handleSave,
      })
    }
    return items
  }, [canDelete, canUpdate, closeDynamicPanel, handleDelete, handleSave, updateRule.isPending, changeReason])

  return (
    <DynamicPanelShell
      title="Modifier la regle"
      subtitle={`v${rule.version ?? 1}`}
      icon={<Scale size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <RuleFormFields form={form} setForm={canUpdate ? setForm : () => {}} typesData={typesData} jpData={jpData} typeReadOnly />

      {canUpdate && (
        <div className="px-4 pb-2">
          <FormSection title="Modification">
            <DynamicPanelField label="Raison de la modification" required>
              <input type="text" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} className={panelInputClass} placeholder="Ex: Mise à jour durée de validité..." />
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
        <FormSection title="Historique" defaultExpanded={false}>
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
