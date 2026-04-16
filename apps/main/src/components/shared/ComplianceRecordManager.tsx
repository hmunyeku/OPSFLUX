/**
 * ComplianceRecordManager — Polymorphic compliance records component.
 *
 * Shows compliance status + records for any owner (tier, tier_contact, asset, project).
 * Supports checking compliance, viewing/creating/deleting records.
 *
 * Usage:
 *   <ComplianceRecordManager ownerType="tier_contact" ownerId={contact.id} />
 *   <ComplianceRecordManager ownerType="tier" ownerId={tier.id} />
 */
import { useState } from 'react'
import { ShieldCheck, ShieldAlert, Plus, Trash2, Check, X, Loader2, AlertTriangle, Paperclip } from 'lucide-react'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import {
  useComplianceRecords, useCreateComplianceRecord, useDeleteComplianceRecord,
  useComplianceCheck, useComplianceTypes,
} from '@/hooks/useConformite'
import { useGlobalTierContact } from '@/hooks/useTiers'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { cn } from '@/lib/utils'
import { DateRangePicker } from '@/components/shared/DateRangePicker'

interface ComplianceRecordManagerProps {
  ownerType: string
  ownerId: string | undefined
  compact?: boolean
}

const STATUS_STYLES: Record<string, string> = {
  valid: 'gl-badge-success',
  expired: 'gl-badge-danger',
  pending: 'gl-badge-warning',
  rejected: 'gl-badge-danger',
  missing: 'gl-badge-neutral',
}

export function ComplianceRecordManager({ ownerType, ownerId, compact }: ComplianceRecordManagerProps) {
  const { toast } = useToast()
  const { data: records, isLoading: recordsLoading } = useComplianceRecords({ owner_type: ownerType, owner_id: ownerId, page_size: 100 })
  const { data: checkResult, isLoading: checkLoading } = useComplianceCheck(ownerType, ownerId)
  const { data: typesData } = useComplianceTypes({})
  const { data: linkedContact } = useGlobalTierContact(ownerType === 'tier_contact' ? ownerId : undefined)
  const createRecord = useCreateComplianceRecord()
  const deleteRecord = useDeleteComplianceRecord()

  const [showForm, setShowForm] = useState(false)
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null)
  const [form, setForm] = useState({ compliance_type_id: '', status: 'pending', issued_at: '', expires_at: '', issuer: '', reference_number: '' })

  const handleCreate = async () => {
    if (!form.compliance_type_id || !ownerId) return
    try {
      await createRecord.mutateAsync({
        compliance_type_id: form.compliance_type_id,
        owner_type: ownerType,
        owner_id: ownerId,
        status: form.status,
        issued_at: form.issued_at || null,
        expires_at: form.expires_at || null,
        issuer: form.issuer || null,
        reference_number: form.reference_number || null,
      })
      toast({ title: 'Enregistrement créé', variant: 'success' })
      setShowForm(false)
      setForm({ compliance_type_id: '', status: 'valid', issued_at: '', expires_at: '', issuer: '', reference_number: '' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteRecord.mutateAsync(id)
      toast({ title: 'Supprimé', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  if (!ownerId) return null

    return (
      <div className={cn('space-y-2', compact && 'text-xs')}>
        {ownerType === 'tier_contact' && linkedContact && (
          <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 rounded-md border bg-muted/30 text-xs">
            <CrossModuleLink
              module="tiers"
              id={linkedContact.tier_id}
              label={linkedContact.tier_name || linkedContact.tier_code || linkedContact.tier_id}
              showIcon={false}
              className="font-medium"
            />
            {linkedContact.linked_user_id && (
              <CrossModuleLink
                module="users"
                id={linkedContact.linked_user_id}
                label={linkedContact.linked_user_email || linkedContact.linked_user_id}
                showIcon={false}
                className="text-muted-foreground"
              />
            )}
          </div>
        )}
        {/* Compliance summary badge */}
        {checkResult && !checkLoading && (
        <div className={cn(
          'flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs',
          checkResult.is_compliant
            ? 'bg-green-500/5 border-green-500/20 text-green-700'
            : 'bg-red-500/5 border-red-500/20 text-red-700'
        )}>
          {checkResult.is_compliant
            ? <ShieldCheck size={14} />
            : <ShieldAlert size={14} />}
          <span className="font-medium">
            {checkResult.is_compliant ? 'Conforme' : 'Non conforme'}
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {checkResult.total_valid}/{checkResult.total_required} valides
            {checkResult.total_expired > 0 && ` · ${checkResult.total_expired} expires`}
            {checkResult.total_missing > 0 && ` · ${checkResult.total_missing} manquants`}
          </span>
        </div>
      )}

      {/* Compliance check details */}
      {checkResult?.details && checkResult.details.length > 0 && (
        <div className="space-y-1">
          {checkResult.details.map((detail: Record<string, unknown>, i: number) => (
            <div key={i} className="flex items-center gap-2 text-[11px] px-2 py-1 rounded bg-muted/30">
              {detail.status === 'valid'
                ? <Check size={10} className="text-green-500" />
                : detail.status === 'expired'
                  ? <AlertTriangle size={10} className="text-red-500" />
                  : <X size={10} className="text-muted-foreground" />}
              <span className="flex-1 truncate">{String(detail.type_name || '?')}</span>
              <span className={cn('gl-badge text-[9px]', STATUS_STYLES[String(detail.status)] || 'gl-badge-neutral')}>
                {String(detail.status)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Records list */}
      {recordsLoading ? (
        <div className="flex items-center justify-center py-4"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>
      ) : records?.items && records.items.length > 0 ? (
        <div className="border border-border rounded-md overflow-hidden">
          {records.items.map((rec) => (
            <div key={rec.id}>
              <div
                className="group flex items-center gap-2 px-2.5 py-1.5 text-xs border-b border-border/50 last:border-0 hover:bg-muted/30 cursor-pointer"
                onClick={() => setExpandedRecordId(expandedRecordId === rec.id ? null : rec.id)}
              >
                <span className={cn('gl-badge text-[9px]', STATUS_STYLES[rec.status] || 'gl-badge-neutral')}>{rec.status}</span>
                <span className="flex-1 truncate font-medium">{rec.type_name || rec.compliance_type_id}</span>
                {rec.expires_at && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    exp. {new Date(rec.expires_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </span>
                )}
                {rec.issuer && <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{rec.issuer}</span>}
                <button onClick={(e) => { e.stopPropagation(); setExpandedRecordId(expandedRecordId === rec.id ? null : rec.id) }} className="p-0.5 rounded hover:bg-muted text-muted-foreground shrink-0" title="Pièces jointes">
                  <Paperclip size={10} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(rec.id) }} className="p-0.5 rounded hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100"><Trash2 size={10} /></button>
              </div>
              {expandedRecordId === rec.id && (
                <div className="px-3 py-2 bg-muted/20 border-b border-border/50">
                  <AttachmentManager ownerType="compliance_record" ownerId={rec.id} compact />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={ShieldCheck} title="Aucun enregistrement" variant="search" size="compact" />
      )}

      {/* Create form */}
      {showForm ? (
        <div className="border border-primary/30 rounded-md bg-primary/5 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-primary">Nouvel enregistrement</span>
            <button onClick={() => setShowForm(false)} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={10} /></button>
          </div>
          <select
            value={form.compliance_type_id}
            onChange={(e) => setForm({ ...form, compliance_type_id: e.target.value })}
            className="w-full text-xs border border-border rounded px-2 py-1 bg-background"
          >
            <option value="">Sélectionner un type...</option>
            {typesData?.items?.map(t => (
              <option key={t.id} value={t.id}>{t.code} — {t.name}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-muted-foreground block mb-0.5">Statut</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full text-xs border border-border rounded px-2 py-1 bg-background">
                <option value="valid">Valide</option>
                <option value="pending">En attente</option>
                <option value="expired">Expiré</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground block mb-0.5">Émetteur</label>
              <input type="text" value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} className="w-full text-xs border border-border rounded px-2 py-1 bg-background" placeholder="Organisme..." />
            </div>
          </div>
          <DateRangePicker
            startDate={form.issued_at || null}
            endDate={form.expires_at || null}
            onStartChange={(v) => setForm({ ...form, issued_at: v })}
            onEndChange={(v) => setForm({ ...form, expires_at: v })}
            startLabel="Date emission"
            endLabel="Date expiration"
          />
          <input type="text" value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} className="w-full text-xs border border-border rounded px-2 py-1 bg-background" placeholder="N° référence..." />
          <div className="flex justify-end gap-1.5">
            <button onClick={() => setShowForm(false)} className="px-2 py-0.5 text-[10px] rounded border border-border hover:bg-muted text-muted-foreground">Annuler</button>
            <button onClick={handleCreate} disabled={!form.compliance_type_id || createRecord.isPending} className="px-2 py-0.5 text-[10px] rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              {createRecord.isPending ? <Loader2 size={10} className="animate-spin inline mr-1" /> : null}
              Créer
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1">
          <Plus size={12} /> Ajouter un enregistrement
        </button>
      )}
    </div>
  )
}
