import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldOff, Trash2, Loader2, Info, Paperclip, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TabBar } from '@/components/ui/Tabs'
import {
  DynamicPanelShell,
  FormSection,
  ReadOnlyRow,
  PanelActionButton,
  PanelContentLayout,
  DetailFieldGrid,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import type { ActionItem } from '@/components/layout/DynamicPanel'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { useExemptions, useApproveExemption, useRejectExemption, useDeleteExemption } from '@/hooks/useConformite'
import { useConformiteDictionaryState } from '../shared'
import { formatDate } from '@/lib/i18n'

export function ExemptionDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data } = useExemptions({ page: 1, page_size: 200 })
  const exemption = data?.items.find((ex) => ex.id === id)
  const approveExemption = useApproveExemption()
  const rejectExemption = useRejectExemption()
  const deleteExemption = useDeleteExemption()
  const { toast } = useToast()
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [detailTab, setDetailTab] = useState<'informations' | 'documents'>('informations')

  const handleApprove = useCallback(async () => {
    try {
      await approveExemption.mutateAsync(id)
      toast({ title: t('conformite.toast.exemption_approved'), variant: 'success' })
    } catch {
      toast({ title: t('conformite.toast.error'), variant: 'error' })
    }
  }, [id, approveExemption, toast, t])

  const handleReject = useCallback(async () => {
    if (!rejectReason.trim()) {
      toast({ title: t('conformite.toast.reject_reason_required'), variant: 'error' })
      return
    }
    try {
      await rejectExemption.mutateAsync({ id, reason: rejectReason })
      setShowRejectForm(false)
      toast({ title: t('conformite.toast.exemption_rejected'), variant: 'success' })
    } catch {
      toast({ title: t('conformite.toast.error'), variant: 'error' })
    }
  }, [id, rejectReason, rejectExemption, toast, t])

  const handleDelete = useCallback(async () => {
    await deleteExemption.mutateAsync(id)
    closeDynamicPanel()
    toast({ title: t('conformite.toast.exemption_archived'), variant: 'success' })
  }, [id, deleteExemption, closeDynamicPanel, toast, t])
  const { exemptionStatusLabels } = useConformiteDictionaryState()

  const actionItems = useMemo<ActionItem[]>(() => [
    {
      id: 'delete',
      label: t('common.delete'),
      icon: Trash2,
      variant: 'danger',
      priority: 20,
      onClick: handleDelete,
    },
  ], [t, handleDelete])

  if (!exemption) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<ShieldOff size={14} className="text-amber-500" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const statusBadge = (() => {
    const s = exemption.status
    const cls = s === 'approved' ? 'gl-badge-success' : s === 'rejected' ? 'gl-badge-danger' : s === 'pending' ? 'gl-badge-warning' : 'gl-badge-neutral'
    const label = exemptionStatusLabels[s] ?? s
    return <span className={cn('gl-badge', cls)}>{label}</span>
  })()

  return (
    <DynamicPanelShell
      title="Exemption"
      subtitle={exemption.record_type_name || 'Detail'}
      icon={<ShieldOff size={14} className="text-amber-500" />}
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
          <FormSection title={t('common.information')}>
            <DetailFieldGrid>
              <ReadOnlyRow label={t('common.status')} value={statusBadge} />
              <ReadOnlyRow label="Type de conformité" value={exemption.record_type_name || '--'} />
              <ReadOnlyRow label="Catégorie" value={exemption.record_type_category ? <span className="gl-badge gl-badge-neutral">{exemption.record_type_category}</span> : '--'} />
              <ReadOnlyRow label="Propriétaire" value={exemption.owner_name || '--'} />
              <ReadOnlyRow label="Date de début" value={formatDate(exemption.start_date)} />
              <ReadOnlyRow label="Date de fin" value={formatDate(exemption.end_date)} />
              <ReadOnlyRow label="Approuvé par" value={exemption.approver_name || '--'} />
              <ReadOnlyRow label={t('common.created_by')} value={exemption.creator_name || '--'} />
              <ReadOnlyRow label={t('common.created_at_label')} value={formatDate(exemption.created_at)} />
            </DetailFieldGrid>
          </FormSection>
          <FormSection title="Motif">
            <p className="text-sm text-foreground whitespace-pre-wrap">{exemption.reason}</p>
          </FormSection>
          {exemption.conditions && (
            <FormSection title="Conditions">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{exemption.conditions}</p>
            </FormSection>
          )}
          {exemption.rejection_reason && (
            <FormSection title="Motif du rejet">
              <p className="text-sm text-red-600 whitespace-pre-wrap">{exemption.rejection_reason}</p>
            </FormSection>
          )}
          {exemption.status === 'pending' && (
            <FormSection title={t('common.actions')}>
              <div className="flex gap-2">
                <PanelActionButton variant="primary" onClick={handleApprove} disabled={approveExemption.isPending}>
                  {approveExemption.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  <span className="ml-1">{t('common.approve')}</span>
                </PanelActionButton>
                <PanelActionButton onClick={() => setShowRejectForm(!showRejectForm)}>
                  <X size={12} />
                  <span className="ml-1">{t('common.reject')}</span>
                </PanelActionButton>
              </div>
              {showRejectForm && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className={`${panelInputClass} min-h-[60px] resize-y`}
                    placeholder="Motif du rejet..."
                    rows={2}
                  />
                  <PanelActionButton onClick={handleReject} disabled={rejectExemption.isPending || !rejectReason.trim()}>
                    {rejectExemption.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Confirmer le rejet'}
                  </PanelActionButton>
                </div>
              )}
            </FormSection>
          )}
        </PanelContentLayout>
      )}
      {detailTab === 'documents' && (
        <PanelContentLayout>
          <FormSection title={t('common.attachments')}>
            <AttachmentManager ownerType="compliance_exemption" ownerId={exemption.id} compact />
          </FormSection>
        </PanelContentLayout>
      )}
    </DynamicPanelShell>
  )
}
