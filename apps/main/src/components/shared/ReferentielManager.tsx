/**
 * ReferentielManager — Polymorphic compliance records manager.
 *
 * Displays compliance records (formations, certifications, habilitations, audits, EPI)
 * for any owner (user, tier_contact, tier, asset) with conformity status badge,
 * required/missing items from ComplianceRules, inline create/edit/delete.
 *
 * Usage:
 *   <ReferentielManager ownerType="user" ownerId={user.id} />
 *   <ReferentielManager ownerType="tier_contact" ownerId={contact.id} category="certification" />
 */
import { useState, useMemo } from 'react'
import {
  ShieldCheck, ShieldAlert, Plus, Trash2, X,
  Loader2, AlertTriangle, Pencil, GraduationCap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { EmptyState } from '@/components/ui/EmptyState'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import {
  useComplianceRecords, useCreateComplianceRecord, useUpdateComplianceRecord,
  useDeleteComplianceRecord, useComplianceCheck, useComplianceTypes,
} from '@/hooks/useConformite'
import type { ComplianceRecord } from '@/types/api'

interface ReferentielManagerProps {
  ownerType: 'user' | 'tier_contact' | 'tier' | 'asset'
  ownerId: string | undefined
  compact?: boolean
  /** Filter to a single category */
  category?: string
}

const CATEGORY_LABELS: Record<string, string> = {
  formation: 'Formations',
  certification: 'Certifications',
  habilitation: 'Habilitations',
  audit: 'Audits',
  medical: 'Médical',
  epi: 'EPI',
}

const CATEGORY_ORDER = ['formation', 'certification', 'habilitation', 'audit', 'epi']

const STATUS_STYLES: Record<string, string> = {
  valid: 'gl-badge-success',
  expired: 'gl-badge-danger',
  pending: 'gl-badge-warning',
  rejected: 'gl-badge-danger',
  missing: 'gl-badge-neutral',
  exempted: 'gl-badge-info',
}

const STATUS_LABELS: Record<string, string> = {
  valid: 'Valide',
  expired: 'Expiré',
  pending: 'En attente',
  rejected: 'Rejeté',
  exempted: 'Exempté',
}

type FormData = {
  compliance_type_id: string
  status: string
  issued_at: string
  expires_at: string
  issuer: string
  reference_number: string
  notes: string
}

const EMPTY_FORM: FormData = {
  compliance_type_id: '',
  status: 'valid',
  issued_at: '',
  expires_at: '',
  issuer: '',
  reference_number: '',
  notes: '',
}

export function ReferentielManager({ ownerType, ownerId, compact, category }: ReferentielManagerProps) {
  const { toast } = useToast()
  const { data: records, isLoading: recordsLoading } = useComplianceRecords({
    owner_type: ownerType, owner_id: ownerId, page_size: 200, category,
  })
  const { data: checkResult, isLoading: checkLoading } = useComplianceCheck(ownerType, ownerId)
  const { data: typesData } = useComplianceTypes({ page_size: 200 })
  const createRecord = useCreateComplianceRecord()
  const updateRecord = useUpdateComplianceRecord()
  const deleteRecord = useDeleteComplianceRecord()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // Group records by category
  const grouped = useMemo(() => {
    const items = records?.items ?? []
    const map: Record<string, ComplianceRecord[]> = {}
    for (const rec of items) {
      const cat = rec.type_category || 'autre'
      if (!map[cat]) map[cat] = []
      map[cat].push(rec)
    }
    return map
  }, [records])

  // Visible categories (based on records + check details)
  const visibleCategories = useMemo(() => {
    const cats = new Set(Object.keys(grouped))
    if (checkResult?.details) {
      for (const d of checkResult.details) {
        const cat = String(d.category || '')
        if (cat) cats.add(cat)
      }
    }
    // Filter to single category if specified
    if (category) return [category]
    return CATEGORY_ORDER.filter(c => cats.has(c)).concat(
      [...cats].filter(c => !CATEGORY_ORDER.includes(c))
    )
  }, [grouped, checkResult, category])

  // Missing required types from check
  const missingTypes = useMemo(() => {
    if (!checkResult?.details) return []
    return checkResult.details.filter((d) => d.status === 'missing' || d.status === 'expired')
  }, [checkResult])

  // Types filtered for the form combobox
  const typeOptions = useMemo(() => {
    const items = typesData?.items ?? []
    if (activeCategory) return items.filter(t => t.category === activeCategory)
    if (category) return items.filter(t => t.category === category)
    return items
  }, [typesData, activeCategory, category])

  const formatDate = (d: string | null | undefined) => {
    if (!d) return null
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
  }

  const openCreate = (cat?: string) => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setActiveCategory(cat || null)
    setShowForm(true)
  }

  const openEdit = (rec: ComplianceRecord) => {
    setForm({
      compliance_type_id: rec.compliance_type_id,
      status: rec.status,
      issued_at: rec.issued_at?.slice(0, 10) || '',
      expires_at: rec.expires_at?.slice(0, 10) || '',
      issuer: rec.issuer || '',
      reference_number: rec.reference_number || '',
      notes: rec.notes || '',
    })
    setEditingId(rec.id)
    setActiveCategory(rec.type_category || null)
    setShowForm(true)
  }

  const openCreateForMissing = (detail: Record<string, unknown>) => {
    const typeId = String(detail.type_id || '')
    setForm({ ...EMPTY_FORM, compliance_type_id: typeId })
    setEditingId(null)
    setActiveCategory(String(detail.category || '') || null)
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!ownerId) return
    try {
      if (editingId) {
        await updateRecord.mutateAsync({
          id: editingId,
          payload: {
            status: form.status,
            issued_at: form.issued_at || null,
            expires_at: form.expires_at || null,
            issuer: form.issuer || null,
            reference_number: form.reference_number || null,
            notes: form.notes || null,
          },
        })
        toast({ title: 'Enregistrement mis à jour', variant: 'success' })
      } else {
        if (!form.compliance_type_id) return
        await createRecord.mutateAsync({
          compliance_type_id: form.compliance_type_id,
          owner_type: ownerType,
          owner_id: ownerId,
          status: form.status,
          issued_at: form.issued_at || null,
          expires_at: form.expires_at || null,
          issuer: form.issuer || null,
          reference_number: form.reference_number || null,
          notes: form.notes || null,
        })
        toast({ title: 'Référentiel ajouté', variant: 'success' })
      }
      setShowForm(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
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

  const totalRecords = records?.items?.length ?? 0

  return (
    <div className={cn('space-y-2', compact && 'text-xs')}>
      {/* Compliance summary badge */}
      {checkResult && !checkLoading && (
        <div className={cn(
          'flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs',
          checkResult.is_compliant
            ? 'bg-green-500/5 border-green-500/20 text-green-700 dark:text-green-400'
            : 'bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-400'
        )}>
          {checkResult.is_compliant
            ? <ShieldCheck size={14} />
            : <ShieldAlert size={14} />}
          <span className="font-medium">
            {checkResult.is_compliant ? 'Conforme' : 'Non conforme'}
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {checkResult.total_valid}/{checkResult.total_required} valides
            {checkResult.total_expired > 0 && ` · ${checkResult.total_expired} expirés`}
            {checkResult.total_missing > 0 && ` · ${checkResult.total_missing} manquants`}
            {checkResult.details?.filter((d: Record<string, unknown>) => d.status === 'exempted').length > 0 &&
              ` · ${checkResult.details.filter((d: Record<string, unknown>) => d.status === 'exempted').length} exemptés`}
          </span>
        </div>
      )}

      {/* Missing required items */}
      {missingTypes.length > 0 && (
        <div className="space-y-1">
          {missingTypes.map((detail, i) => (
            <button
              key={i}
              onClick={() => openCreateForMissing(detail)}
              className="w-full flex items-center gap-2 text-[11px] px-2 py-1.5 rounded bg-amber-500/5 border border-amber-500/20 hover:bg-amber-500/10 transition-colors text-left"
            >
              {detail.status === 'expired'
                ? <AlertTriangle size={10} className="text-red-500 shrink-0" />
                : <X size={10} className="text-muted-foreground shrink-0" />}
              <span className="flex-1 truncate">{String(detail.type_name || '?')}</span>
              <span className={cn('gl-badge text-[9px]', STATUS_STYLES[String(detail.status)] || 'gl-badge-neutral')}>
                {String(detail.status) === 'missing' ? 'Manquant' : STATUS_LABELS[String(detail.status)] || String(detail.status)}
              </span>
              <Plus size={10} className="text-primary shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Exempted items (informational) */}
      {checkResult?.details?.some((d: Record<string, unknown>) => d.status === 'exempted') && (
        <div className="space-y-1">
          {checkResult.details.filter((d: Record<string, unknown>) => d.status === 'exempted').map((detail: Record<string, unknown>, i: number) => (
            <div key={i} className="flex items-center gap-2 text-[11px] px-2 py-1.5 rounded bg-blue-500/5 border border-blue-500/20 text-left">
              <ShieldCheck size={10} className="text-blue-500 shrink-0" />
              <span className="flex-1 truncate">{String(detail.type_name || '?')}</span>
              <span className="gl-badge gl-badge-info text-[9px]">Exempté</span>
            </div>
          ))}
        </div>
      )}

      {/* Records grouped by category */}
      {recordsLoading ? (
        <div className="flex items-center justify-center py-4"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>
      ) : totalRecords > 0 ? (
        <div className="space-y-2">
          {visibleCategories.map((cat) => {
            const catRecords = grouped[cat]
            if (!catRecords?.length) return null
            return (
              <div key={cat}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {CATEGORY_LABELS[cat] || cat}
                  </span>
                  <span className="text-[9px] text-muted-foreground/60">({catRecords.length})</span>
                </div>
                <div className="border border-border rounded-md overflow-hidden">
                  {catRecords.map((rec) => (
                    <div
                      key={rec.id}
                      className="group flex items-center gap-2 px-2.5 py-1.5 text-xs border-b border-border/50 last:border-0 hover:bg-muted/30"
                    >
                      <span className={cn('gl-badge text-[9px] shrink-0', STATUS_STYLES[rec.status] || 'gl-badge-neutral')}>
                        {STATUS_LABELS[rec.status] || rec.status}
                      </span>
                      <span className="flex-1 truncate font-medium">{rec.type_name || rec.compliance_type_id}</span>
                      {rec.issued_at && (
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0" title="Date émission">
                          {formatDate(rec.issued_at)}
                        </span>
                      )}
                      {rec.expires_at && (
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0" title="Date expiration">
                          → {formatDate(rec.expires_at)}
                        </span>
                      )}
                      {rec.issuer && <span className="text-[10px] text-muted-foreground truncate max-w-[80px]" title={rec.issuer}>{rec.issuer}</span>}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => openEdit(rec)} className="p-0.5 rounded hover:bg-muted text-muted-foreground" title="Modifier">
                          <Pencil size={10} />
                        </button>
                        <button onClick={() => handleDelete(rec.id)} className="p-0.5 rounded hover:bg-muted text-muted-foreground" title="Supprimer">
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : !missingTypes.length ? (
        <EmptyState icon={GraduationCap} title="Aucun référentiel enregistré" variant="search" size="compact" />
      ) : null}

      {/* Create / Edit form */}
      {showForm ? (
        <div className="border border-primary/30 rounded-md bg-primary/5 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-primary">
              {editingId ? 'Modifier l\'enregistrement' : 'Nouvel enregistrement'}
            </span>
            <button onClick={() => { setShowForm(false); setEditingId(null) }} className="p-0.5 rounded hover:bg-muted text-muted-foreground">
              <X size={10} />
            </button>
          </div>

          {/* Type selector (only for create, locked for edit) */}
          {!editingId && (
            <select
              value={form.compliance_type_id}
              onChange={(e) => setForm({ ...form, compliance_type_id: e.target.value })}
              className="w-full text-xs border border-border rounded px-2 py-1 bg-background"
            >
              <option value="">Sélectionner un type...</option>
              {typeOptions.map(t => (
                <option key={t.id} value={t.id}>
                  [{CATEGORY_LABELS[t.category] || t.category}] {t.code} — {t.name}
                </option>
              ))}
            </select>
          )}

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
            startLabel="Date émission"
            endLabel="Date expiration"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-muted-foreground block mb-0.5">N° référence</label>
              <input type="text" value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} className="w-full text-xs border border-border rounded px-2 py-1 bg-background" placeholder="REF-2024-001..." />
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground block mb-0.5">Notes</label>
              <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full text-xs border border-border rounded px-2 py-1 bg-background" placeholder="Commentaire..." />
            </div>
          </div>

          <div className="flex justify-end gap-1.5">
            <button onClick={() => { setShowForm(false); setEditingId(null) }} className="px-2 py-0.5 text-[10px] rounded border border-border hover:bg-muted text-muted-foreground">
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={(!editingId && !form.compliance_type_id) || createRecord.isPending || updateRecord.isPending}
              className="px-2 py-0.5 text-[10px] rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {(createRecord.isPending || updateRecord.isPending) ? <Loader2 size={10} className="animate-spin inline mr-1" /> : null}
              {editingId ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => openCreate(category)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1">
          <Plus size={12} /> Ajouter un référentiel
        </button>
      )}
    </div>
  )
}
