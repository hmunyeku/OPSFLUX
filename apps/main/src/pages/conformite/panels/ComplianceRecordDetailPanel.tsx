import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FileCheck, Trash2, Loader2, Info, Paperclip, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TabBar } from '@/components/ui/Tabs'
import {
  DynamicPanelShell,
  FormSection,
  InlineEditableRow,
  ReadOnlyRow,
  PanelContentLayout,
  DetailFieldGrid,
} from '@/components/layout/DynamicPanel'
import type { ActionItem } from '@/components/layout/DynamicPanel'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { usePermission } from '@/hooks/usePermission'
import { normalizeNames } from '@/lib/normalize'
import { useComplianceRecords, useUpdateComplianceRecord, useDeleteComplianceRecord, useVerifyRecord } from '@/hooks/useConformite'
import type { ComplianceRecordUpdate } from '@/types/api'
import { useConformiteDictionaryState } from '../shared'
import { ComplianceOwnerCard } from '../components'

export function ComplianceRecordDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data } = useComplianceRecords({ page: 1, page_size: 200 })
  const updateRecord = useUpdateComplianceRecord()
  const deleteRecord = useDeleteComplianceRecord()
  const verifyRecord = useVerifyRecord()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { hasPermission } = usePermission()
  const canVerify = hasPermission('conformite.record.verify')
  const { statusLabels } = useConformiteDictionaryState()
  const record = data?.items.find((item) => item.id === id)
  const [detailTab, setDetailTab] = useState<'informations' | 'documents'>('informations')

  const handleDelete = useCallback(async () => {
    await deleteRecord.mutateAsync(id)
    closeDynamicPanel()
    toast({ title: t('common.deleted'), variant: 'success' })
  }, [closeDynamicPanel, deleteRecord, id, t, toast])

  const handleVerify = useCallback(async () => {
    try {
      await verifyRecord.mutateAsync({ recordType: 'compliance_record', recordId: id, action: 'verify' })
      toast({ title: t('conformite.toast.verified'), variant: 'success' })
    } catch {
      toast({ title: t('conformite.toast.error'), variant: 'error' })
    }
  }, [verifyRecord, id, toast, t])

  const handleReject = useCallback(async () => {
    const ok = await confirm({
      title: t('conformite.verifications.reject_title'),
      message: t('conformite.verifications.reject_prompt'),
      confirmLabel: t('common.reject'),
      variant: 'danger',
    })
    if (!ok) return
    try {
      await verifyRecord.mutateAsync({ recordType: 'compliance_record', recordId: id, action: 'reject', rejectionReason: 'Rejeté depuis la fiche enregistrement' })
      toast({ title: t('conformite.toast.rejected'), variant: 'success' })
    } catch {
      toast({ title: t('conformite.toast.error'), variant: 'error' })
    }
  }, [verifyRecord, id, confirm, toast, t])

  const handleSave = useCallback((payload: ComplianceRecordUpdate) => {
    updateRecord.mutate({ id, payload: normalizeNames(payload) })
  }, [id, updateRecord])

  const actionItems = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = []
    // Only offer verify/reject when status is pending and user has permission.
    if (record?.status === 'pending' && canVerify) {
      items.push({
        id: 'verify',
        label: t('conformite.verifications.verify'),
        icon: CheckCircle2,
        variant: 'primary',
        priority: 5,
        loading: verifyRecord.isPending,
        onClick: handleVerify,
      })
      items.push({
        id: 'reject',
        label: t('common.reject'),
        icon: XCircle,
        variant: 'danger',
        priority: 10,
        loading: verifyRecord.isPending,
        onClick: handleReject,
      })
    }
    items.push({
      id: 'delete',
      label: t('common.delete'),
      icon: Trash2,
      variant: 'danger',
      priority: 20,
      onClick: handleDelete,
    })
    return items
  }, [t, handleDelete, handleVerify, handleReject, record?.status, canVerify, verifyRecord.isPending])

  if (!record) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<FileCheck size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const statusClass =
    record.status === 'valid'
      ? 'gl-badge-success'
      : record.status === 'expired'
        ? 'gl-badge-danger'
        : record.status === 'pending'
          ? 'gl-badge-warning'
          : 'gl-badge-neutral'

  return (
    <DynamicPanelShell
      title={record.type_name || t('conformite.records.detail_title')}
      subtitle={record.reference_number || record.owner_type}
      icon={<FileCheck size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <TabBar
        items={[
          { id: 'informations', label: 'Informations', icon: Info },
          { id: 'documents', label: 'Documents', icon: Paperclip },
        ]}
        activeId={detailTab}
        onTabChange={(id) => setDetailTab(id as typeof detailTab)}
      />
      {detailTab === 'informations' && (
        <PanelContentLayout>
          <FormSection title={t('conformite.records.sections.owner')}>
            <ComplianceOwnerCard ownerType={record.owner_type} ownerId={record.owner_id} />
          </FormSection>
          <FormSection title={t('conformite.records.sections.general')}>
            <DetailFieldGrid>
              <ReadOnlyRow label={t('conformite.records.fields.type')} value={record.type_name || '—'} />
              <ReadOnlyRow label={t('conformite.records.fields.status')} value={<span className={cn('gl-badge', statusClass)}>{statusLabels[record.status] ?? record.status}</span>} />
              <ReadOnlyRow label={t('common.created_at')} value={record.created_at ? new Date(record.created_at).toLocaleDateString('fr-FR') : '—'} />
            </DetailFieldGrid>
          </FormSection>
          <FormSection title={t('conformite.records.sections.reference')}>
            <DetailFieldGrid>
              <InlineEditableRow label={t('conformite.records.fields.issuer')} value={record.issuer || ''} onSave={(value) => handleSave({ issuer: value || null })} />
              <InlineEditableRow label={t('conformite.records.fields.reference_number')} value={record.reference_number || ''} onSave={(value) => handleSave({ reference_number: value || null })} />
              <ReadOnlyRow label={t('conformite.records.fields.issued_at')} value={record.issued_at ? new Date(record.issued_at).toLocaleDateString('fr-FR') : '—'} />
              <ReadOnlyRow label={t('conformite.records.fields.expires_at')} value={record.expires_at ? new Date(record.expires_at).toLocaleDateString('fr-FR') : '—'} />
            </DetailFieldGrid>
            <div className="mt-3">
              <InlineEditableRow label={t('conformite.records.fields.notes')} value={record.notes || ''} onSave={(value) => handleSave({ notes: value || null })} />
            </div>
          </FormSection>
        </PanelContentLayout>
      )}
      {detailTab === 'documents' && (
        <PanelContentLayout>
          <FormSection title={t('conformite.records.sections.attachments')}>
            <p className="mb-2 text-xs text-muted-foreground">{t('conformite.records.attachments_help')}</p>
            <AttachmentManager ownerType="compliance_record" ownerId={record.id} compact />
          </FormSection>
        </PanelContentLayout>
      )}
    </DynamicPanelShell>
  )
}
