import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DynamicPanelShell,
  FormSection,
  ReadOnlyRow,
  PanelContentLayout,
  DetailFieldGrid,
} from '@/components/layout/DynamicPanel'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { usePendingVerifications, useVerifyRecord, useVerificationHistory } from '@/hooks/useConformite'
import { useVerificationRecordTypeLabels } from '../shared'
import { VerificationOwnerSummary } from '../components'

function VerificationHistorySection({ ownerId, recordType, currentId }: { ownerId: string; recordType: string; currentId: string }) {
  const { data } = useVerificationHistory(1, 10, { owner_id: ownerId, record_type: recordType })
  const items = (data?.items ?? []).filter((i) => i.id !== currentId)

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return '—' }
  }

  if (items.length === 0) return null

  return (
    <FormSection title="Historique">
      <div className="space-y-1.5">
        {items.map((h) => (
          <div key={h.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/30 text-xs">
            <span className={cn(
              'h-2 w-2 rounded-full shrink-0',
              h.verification_status === 'verified' ? 'bg-emerald-500' : 'bg-red-400',
            )} />
            <span className="flex-1 min-w-0 truncate text-foreground">{h.description}</span>
            <span className="text-muted-foreground tabular-nums shrink-0">{fmtDate(h.verified_at)}</span>
            <span className="text-muted-foreground shrink-0">{h.verified_by_name || '—'}</span>
          </div>
        ))}
      </div>
    </FormSection>
  )
}

export function VerificationDetailPanel({ id, recordType: _recordType }: { id: string; recordType: string }) {
  const { t } = useTranslation()
  const recordTypeLabels = useVerificationRecordTypeLabels()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data } = usePendingVerifications()
  const verifyRecord = useVerifyRecord()
  const { toast } = useToast()
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)

  const items = data?.items ?? []
  const item = items.find((i) => i.id === id)
  const currentIdx = items.findIndex((i) => i.id === id)

  const { openDynamicPanel } = useUIStore()

  const goTo = (idx: number) => {
    const target = items[idx]
    if (target) {
      openDynamicPanel({
        type: 'detail', module: 'conformite', id: target.id,
        meta: { subtype: 'verification', record_type: target.record_type },
      })
    }
  }

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return '—' }
  }

  const handleVerify = async () => {
    if (!item) return
    const proofMissing = (item.attachment_required !== false) && ((item.attachment_count ?? 0) <= 0)
    if (proofMissing) {
      toast({ title: t('conformite.verifications.proof_required_before_verify'), variant: 'error' })
      return
    }
    try {
      await verifyRecord.mutateAsync({ recordType: item.record_type, recordId: item.id, action: 'verify' })
      toast({ title: t('conformite.toast.document_verified'), variant: 'success' })
      if (currentIdx < items.length - 1) goTo(currentIdx + 1)
      else closeDynamicPanel()
    } catch { toast({ title: t('conformite.toast.error'), variant: 'error' }) }
  }

  const handleReject = async () => {
    if (!item || !rejectReason.trim()) return
    try {
      await verifyRecord.mutateAsync({ recordType: item.record_type, recordId: item.id, action: 'reject', rejectionReason: rejectReason })
      toast({ title: t('conformite.toast.document_rejected'), variant: 'success' })
      setShowReject(false); setRejectReason('')
      if (currentIdx < items.length - 1) goTo(currentIdx + 1)
      else closeDynamicPanel()
    } catch { toast({ title: t('conformite.toast.error'), variant: 'error' }) }
  }

  if (!item) {
    return (
      <DynamicPanelShell title="Vérification" onClose={closeDynamicPanel}>
        <p className="text-sm text-muted-foreground p-4">Document non trouvé ou déjà traité.</p>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={`${recordTypeLabels[item.record_type] || item.record_type}`}
      subtitle={item.owner_name || 'Inconnu'}
      onClose={closeDynamicPanel}
      headerRight={
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground tabular-nums mr-1">{currentIdx + 1}/{items.length}</span>
          <button onClick={() => goTo(currentIdx - 1)} disabled={currentIdx <= 0} className="gl-button-sm gl-button-default disabled:opacity-30">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button onClick={() => goTo(currentIdx + 1)} disabled={currentIdx >= items.length - 1} className="gl-button-sm gl-button-default disabled:opacity-30">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <div className="w-px h-4 bg-border/60 mx-1" />
          <button onClick={handleVerify} disabled={verifyRecord.isPending || ((item.attachment_required !== false) && ((item.attachment_count ?? 0) <= 0))} className="gl-button-sm gl-button-confirm disabled:opacity-50 disabled:cursor-not-allowed">
            {verifyRecord.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Vérifier
          </button>
          <button onClick={() => setShowReject(true)} className="gl-button-sm gl-button-danger">
            <X size={11} /> Rejeter
          </button>
        </div>
      }
    >
        <PanelContentLayout>
          <FormSection title="Propriétaire" collapsible defaultExpanded>
            <VerificationOwnerSummary ownerType={item.owner_type} ownerId={item.owner_id} ownerName={item.owner_name} />
          </FormSection>

          <DetailFieldGrid>
            <ReadOnlyRow label="Personne" value={item.owner_name || 'Inconnu'} />
          <ReadOnlyRow label="Type" value={recordTypeLabels[item.record_type] || item.record_type} />
          <ReadOnlyRow label="Description" value={item.description} />
          <ReadOnlyRow label="Émetteur" value={(item as any).issuer || '—'} />
          <ReadOnlyRow label="Référence" value={(item as any).reference_number || '—'} />
          <ReadOnlyRow label="Date d'émission" value={fmtDate((item as any).issued_at)} />
          <ReadOnlyRow label="Expiration" value={fmtDate((item as any).expires_at)} />
          <ReadOnlyRow label="Soumis le" value={fmtDate(item.submitted_at)} />
        </DetailFieldGrid>

        <FormSection title="Pièces jointes">
          {(item.attachment_required !== false) && ((item.attachment_count ?? 0) <= 0) && (
            <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t('conformite.verifications.proof_required_before_verify')}
            </div>
          )}
          <AttachmentManager ownerType={item.record_type} ownerId={item.id} compact readOnly={item.verification_status !== 'pending'} />
        </FormSection>

        {item.owner_id && (
          <VerificationHistorySection ownerId={item.owner_id} recordType={item.record_type} currentId={item.id} />
        )}

        {showReject && (
          <div className="border border-red-200 dark:border-red-800/40 rounded-lg p-3 bg-red-50/50 dark:bg-red-900/10 space-y-2">
            <label className="gl-label text-red-600">Motif du rejet</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Expliquez pourquoi ce document est rejete..."
              className="gl-form-input min-h-[60px]"
              autoFocus
            />
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => { setShowReject(false); setRejectReason('') }} className="gl-button-sm gl-button-default">{t('common.cancel')}</button>
              <button onClick={handleReject} disabled={!rejectReason.trim() || verifyRecord.isPending} className="gl-button-sm gl-button-danger">
                {verifyRecord.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Confirmer le rejet'}
              </button>
            </div>
          </div>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
