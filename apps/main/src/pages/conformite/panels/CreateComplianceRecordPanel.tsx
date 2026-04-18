import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FileCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  TagSelector,
  panelInputClass,
  PanelContentLayout,
} from '@/components/layout/DynamicPanel'
import type { ActionItem } from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { useComplianceTypes, useCreateComplianceRecord } from '@/hooks/useConformite'
import type { ComplianceRecordCreate } from '@/types/api'
import { useConformiteDictionaryState } from '../shared'
import { SearchableSelect } from '../components'

export function CreateComplianceRecordPanel() {
  const { t } = useTranslation()
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const createRecord = useCreateComplianceRecord()
  const { toast } = useToast()
  const { data: typesData } = useComplianceTypes({ page: 1, page_size: 200 })
  const { statusOptions } = useConformiteDictionaryState()

  const prefillOwnerType = (dynamicPanel?.meta?.prefill_owner_type as string | undefined) ?? ''
  const prefillOwnerId = (dynamicPanel?.meta?.prefill_owner_id as string | undefined) ?? ''
  const prefillOwnerLabel = (dynamicPanel?.meta?.prefill_owner_label as string | undefined) ?? ''

  const [form, setForm] = useState<ComplianceRecordCreate>({
    compliance_type_id: '',
    owner_type: prefillOwnerType,
    owner_id: prefillOwnerId,
    status: 'pending',
    issued_at: null,
    expires_at: null,
    issuer: null,
    reference_number: null,
    notes: null,
  })

  const typeOptions = useMemo(
    () =>
      (typesData?.items ?? []).map((ct) => ({
        value: ct.id,
        label: `${ct.code} — ${ct.name}`,
        group: ct.category,
      })),
    [typesData?.items],
  )

  const ownerTypeOptions = useMemo(
    () => [
      { value: 'user', label: t('conformite.records.owner_types.user') },
      { value: 'tier_contact', label: t('conformite.records.owner_types.tier_contact') },
      { value: 'asset', label: t('conformite.records.owner_types.asset') },
      { value: 'job_position', label: t('conformite.records.owner_types.job_position') },
    ],
    [t],
  )

  const handleCreate = async () => {
    if (!form.compliance_type_id || !form.owner_type || !form.owner_id) {
      toast({ title: t('conformite.records.errors.missing_required'), variant: 'error' })
      return
    }
    try {
      const created = await createRecord.mutateAsync(form)
      toast({ title: t('conformite.records.create_success'), variant: 'success' })
      openDynamicPanel({ type: 'detail', module: 'conformite', id: created.id, meta: { subtype: 'record' } })
    } catch {
      toast({ title: t('common.error'), variant: 'error' })
    }
  }

  const actionItems = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: t('common.cancel'), priority: 40, onClick: closeDynamicPanel },
    {
      id: 'create',
      label: t('common.create'),
      variant: 'primary',
      priority: 100,
      loading: createRecord.isPending,
      disabled: createRecord.isPending,
      onClick: handleCreate,
    },
  ], [t, closeDynamicPanel, createRecord.isPending, handleCreate])

  return (
    <DynamicPanelShell
      title={t('conformite.records.create')}
      subtitle={t('conformite.title')}
      icon={<FileCheck size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <PanelContentLayout>
        <FormSection title={t('conformite.records.sections.general')}>
          <FormGrid>
            <DynamicPanelField label={t('conformite.records.fields.type')} required span="full">
              <SearchableSelect
                value={form.compliance_type_id}
                onChange={(value) => setForm({ ...form, compliance_type_id: value })}
                options={typeOptions}
                placeholder={t('conformite.records.placeholders.type')}
              />
            </DynamicPanelField>
            <DynamicPanelField label={t('conformite.records.fields.owner_type')} required>
              <TagSelector
                options={ownerTypeOptions}
                value={form.owner_type}
                onChange={(value) => setForm({ ...form, owner_type: value })}
              />
            </DynamicPanelField>
            <DynamicPanelField label={t('conformite.records.fields.status')}>
              <TagSelector
                options={statusOptions}
                value={form.status || 'pending'}
                onChange={(value) => setForm({ ...form, status: value })}
              />
            </DynamicPanelField>
            <DynamicPanelField label={t('conformite.records.fields.owner_id')} required span="full">
              <input
                type="text"
                value={form.owner_id}
                onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
                className={panelInputClass}
                placeholder={t('conformite.records.placeholders.owner_id')}
              />
              {prefillOwnerLabel && (
                <p className="mt-1 text-[10px] text-muted-foreground">{prefillOwnerLabel}</p>
              )}
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        <FormSection title={t('conformite.records.sections.reference')}>
          <FormGrid>
            <DynamicPanelField label={t('conformite.records.fields.issued_at')}>
              <input type="date" value={form.issued_at ?? ''} onChange={(e) => setForm({ ...form, issued_at: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('conformite.records.fields.expires_at')}>
              <input type="date" value={form.expires_at ?? ''} onChange={(e) => setForm({ ...form, expires_at: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('conformite.records.fields.issuer')}>
              <input type="text" value={form.issuer ?? ''} onChange={(e) => setForm({ ...form, issuer: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('conformite.records.fields.reference_number')}>
              <input type="text" value={form.reference_number ?? ''} onChange={(e) => setForm({ ...form, reference_number: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('conformite.records.fields.notes')} span="full">
              <textarea
                value={form.notes ?? ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
                className={cn(panelInputClass, 'min-h-[72px] resize-y')}
                placeholder={t('conformite.records.placeholders.notes')}
              />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        <p className="px-1 text-xs text-muted-foreground italic">
          {t('conformite.records.create_attachment_hint')}
        </p>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
