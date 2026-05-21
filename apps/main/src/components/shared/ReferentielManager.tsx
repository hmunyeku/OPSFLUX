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
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  ShieldCheck, ShieldAlert, Plus, Trash2, X,
  Loader2, AlertTriangle, Pencil, GraduationCap, Paperclip,
  History, Search, Eye,
} from 'lucide-react'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { EmptyState } from '@/components/ui/EmptyState'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import {
  useComplianceRecords, useCreateComplianceRecord, useUpdateComplianceRecord,
  useDeleteComplianceRecord, useComplianceCheck, useComplianceTypes,
} from '@/hooks/useConformite'
import { useAttachments } from '@/hooks/useSettings'
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
  valid: 'chip-success',
  expired: 'chip-danger',
  pending: 'chip-warn',
  unverified: 'chip-warn',
  rejected: 'chip-danger',
  missing: '',
  exempted: 'chip-info',
}

const STATUS_LABELS: Record<string, string> = {
  valid: 'Valide',
  expired: 'Expiré',
  pending: 'En attente',
  unverified: 'À vérifier',
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
  status: 'pending',
  issued_at: '',
  expires_at: '',
  issuer: '',
  reference_number: '',
  notes: '',
}

const STAGING_OWNER_TYPE = 'compliance_record_staging'

const createStagingRef = () => globalThis.crypto?.randomUUID?.() ?? ''

export function ReferentielManager({ ownerType, ownerId, compact, category }: ReferentielManagerProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: records, isLoading: recordsLoading } = useComplianceRecords({
    owner_type: ownerType, owner_id: ownerId, page_size: 200, category,
  })
  const [showHistory, setShowHistory] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const historyQuery = historySearch.trim()
  const { data: historyRecords, isLoading: historyLoading } = useComplianceRecords({
    owner_type: ownerType,
    owner_id: ownerId,
    page_size: 200,
    category,
    history: true,
    search: historyQuery || undefined,
    enabled: showHistory,
  })
  const { data: checkResult, isLoading: checkLoading } = useComplianceCheck(ownerType, ownerId)
  const { data: typesData } = useComplianceTypes({ page_size: 200 })
  const createRecord = useCreateComplianceRecord()
  const updateRecord = useUpdateComplianceRecord()
  const deleteRecord = useDeleteComplianceRecord()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null)
  const [historyExpandedRecordId, setHistoryExpandedRecordId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [stagingRef, setStagingRef] = useState(createStagingRef)
  const { data: stagedAttachments } = useAttachments(
    STAGING_OWNER_TYPE,
    showForm && !editingId ? stagingRef : undefined,
  )
  const stagedAttachmentCount = stagedAttachments?.length ?? 0

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

  const getRecordStatusLabel = (rec: ComplianceRecord) => {
    if (!rec.active) return 'Invalidé'
    return STATUS_LABELS[rec.status] || rec.status
  }

  const getRecordStatusStyle = (rec: ComplianceRecord) => {
    if (!rec.active) return 'bg-muted/40 text-muted-foreground border-border'
    return STATUS_STYLES[rec.status] || ''
  }

  const resetCreateSession = () => {
    setStagingRef(createStagingRef())
  }

  const openCreate = (cat?: string) => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setActiveCategory(cat || null)
    resetCreateSession()
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
    resetCreateSession()
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!ownerId) return
    if (!editingId && stagedAttachmentCount <= 0) {
      toast({
        title: 'Pièce justificative obligatoire',
        description: 'Déposez au moins une PJ avant de créer le référentiel afin qu’il puisse être vérifié.',
        variant: 'error',
      })
      return
    }
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
        const created = await createRecord.mutateAsync({
          compliance_type_id: form.compliance_type_id,
          owner_type: ownerType,
          owner_id: ownerId,
          status: form.status,
          issued_at: form.issued_at || null,
          expires_at: form.expires_at || null,
          issuer: form.issuer || null,
          reference_number: form.reference_number || null,
          notes: form.notes || null,
          staging_ref: stagingRef,
        }) as any
        await queryClient.invalidateQueries({ queryKey: ['compliance-records'] })
        await queryClient.invalidateQueries({ queryKey: ['compliance-check', ownerType, ownerId] })
        toast({ title: 'Référentiel ajouté avec sa pièce justificative', variant: 'success' })
        if (created?.id) setExpandedRecordId(created.id)
      }
      setShowForm(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      resetCreateSession()
    } catch {
      toast({ title: t('common.error'), variant: 'error' })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteRecord.mutateAsync(id)
      toast({ title: t('common.deleted'), variant: 'success' })
    } catch {
      toast({ title: t('common.error'), variant: 'error' })
    }
  }

  if (!ownerId) return null

  const totalRecords = records?.items?.length ?? 0
  const historyItems = historyRecords?.items ?? []

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
              <span className={cn('chip text-[9px]', STATUS_STYLES[String(detail.status)] || '')}>
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
              <span className="chip chip-info text-[9px]">{t('shared.exempte')}</span>
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
                    <div key={rec.id}>
                      <div
                        className="group flex items-center gap-2 px-2.5 py-1.5 text-xs border-b border-border/50 last:border-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => setExpandedRecordId(expandedRecordId === rec.id ? null : rec.id)}
                      >
                        <span className={cn('chip text-[9px] shrink-0', STATUS_STYLES[rec.status] || '')}>
                          {STATUS_LABELS[rec.status] || rec.status}
                        </span>
                        <span className="flex-1 truncate font-medium">{rec.type_name || rec.compliance_type_id}</span>
                        {rec.issued_at && (
                          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0" title={t('shared.date_emission')}>
                            {formatDate(rec.issued_at)}
                          </span>
                        )}
                        {rec.expires_at && (
                          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0" title="Date d'expiration">
                            → {formatDate(rec.expires_at)}
                          </span>
                        )}
                        {rec.issuer && <span className="text-[10px] text-muted-foreground truncate max-w-[80px]" title={rec.issuer}>{rec.issuer}</span>}
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedRecordId(expandedRecordId === rec.id ? null : rec.id) }}
                          className="p-0.5 rounded hover:bg-muted text-muted-foreground shrink-0"
                          title={t('common.attachments')}
                        >
                          <Paperclip size={10} />
                        </button>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); openEdit(rec) }} className="p-0.5 rounded hover:bg-muted text-muted-foreground" title="Modifier">
                            <Pencil size={10} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(rec.id) }} className="p-0.5 rounded hover:bg-muted text-muted-foreground" title="Supprimer">
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                      {expandedRecordId === rec.id && (
                        <div className="px-3 py-2 bg-muted/20 border-b border-border/50">
                          <AttachmentManager ownerType="compliance_record" ownerId={rec.id} compact />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : !missingTypes.length ? (
        <EmptyState icon={GraduationCap} title={t('shared.aucun_referentiel_enregistre')} variant="search" size="compact" />
      ) : null}

      <div className="border border-border rounded-md overflow-hidden">
        <button
          type="button"
          onClick={() => setShowHistory((value) => !value)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-muted/30 text-left"
          title="Afficher les référentiels expirés, rejetés ou invalidés"
        >
          <History size={12} className="text-muted-foreground shrink-0" />
          <span className="font-medium flex-1">Historique des référentiels</span>
          <span className="text-[10px] text-muted-foreground">{showHistory ? 'Masquer' : 'Afficher'}</span>
        </button>

        {showHistory && (
          <div className="border-t border-border bg-muted/10 p-2 space-y-2">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full h-8 pl-7 pr-2 rounded border border-border bg-background text-xs"
                placeholder="Rechercher type, référence, émetteur, note..."
              />
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
              </div>
            ) : historyItems.length > 0 ? (
              <div className="border border-border rounded-md overflow-hidden bg-background">
                <div className="hidden md:grid grid-cols-[minmax(180px,1.5fr)_90px_110px_110px_110px_minmax(120px,1fr)_50px] gap-2 px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <span>Référentiel</span>
                  <span>Statut</span>
                  <span>Référence</span>
                  <span>Émission</span>
                  <span>Expiration</span>
                  <span>Émetteur</span>
                  <span className="text-right">PJ</span>
                </div>
                {historyItems.map((rec) => (
                  <div key={rec.id} className="border-b border-border/50 last:border-0">
                    <button
                      type="button"
                      onClick={() => setHistoryExpandedRecordId(historyExpandedRecordId === rec.id ? null : rec.id)}
                      className="w-full grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(180px,1.5fr)_90px_110px_110px_110px_minmax(120px,1fr)_50px] gap-2 items-center px-2.5 py-2 text-xs text-left hover:bg-muted/30"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium truncate">{rec.type_name || rec.compliance_type_id}</span>
                        <span className="md:hidden block text-[10px] text-muted-foreground truncate">
                          {rec.reference_number || 'Sans référence'} · {rec.issuer || 'Émetteur non renseigné'}
                        </span>
                      </span>
                      <span className={cn('chip text-[9px] shrink-0 justify-self-end md:justify-self-start', getRecordStatusStyle(rec))}>
                        {getRecordStatusLabel(rec)}
                      </span>
                      <span className="hidden md:block text-muted-foreground truncate">{rec.reference_number || '—'}</span>
                      <span className="hidden md:block text-muted-foreground tabular-nums">{formatDate(rec.issued_at) || '—'}</span>
                      <span className="hidden md:block text-muted-foreground tabular-nums">{formatDate(rec.expires_at) || '—'}</span>
                      <span className="hidden md:block text-muted-foreground truncate">{rec.issuer || '—'}</span>
                      <span className="hidden md:flex items-center justify-end gap-1 text-muted-foreground">
                        <Paperclip size={11} />
                        {rec.attachment_count ?? 0}
                      </span>
                    </button>
                    {historyExpandedRecordId === rec.id && (
                      <div className="px-3 py-2 bg-muted/20 border-t border-border/50 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                          <div><span className="font-medium text-foreground">Référence :</span> {rec.reference_number || '—'}</div>
                          <div><span className="font-medium text-foreground">Émetteur :</span> {rec.issuer || '—'}</div>
                          <div><span className="font-medium text-foreground">Émission :</span> {formatDate(rec.issued_at) || '—'}</div>
                          <div><span className="font-medium text-foreground">Expiration :</span> {formatDate(rec.expires_at) || '—'}</div>
                          {rec.notes && <div className="sm:col-span-2"><span className="font-medium text-foreground">Notes :</span> {rec.notes}</div>}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Eye size={11} />
                          Lecture seule
                        </div>
                        <AttachmentManager ownerType="compliance_record" ownerId={rec.id} compact />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={History} title="Aucun historique trouvé" variant="search" size="compact" />
            )}
          </div>
        )}
      </div>

      {/* Create / Edit form */}
      {showForm ? (
        <div className="border border-primary/30 rounded-md bg-primary/5 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-primary">
              {editingId ? 'Modifier l\'enregistrement' : 'Nouvel enregistrement'}
            </span>
            <button onClick={() => { setShowForm(false); setEditingId(null); resetCreateSession() }} className="p-0.5 rounded hover:bg-muted text-muted-foreground">
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
              <option value="">{t('shared.selectionner_un_type')}</option>
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
                <option value="expired">{t('conformite.records.expired')}</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground block mb-0.5">{t('conformite.columns.issuer')}</label>
              <input type="text" value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} className="w-full text-xs border border-border rounded px-2 py-1 bg-background" placeholder="Organisme..." />
            </div>
          </div>

          <DateRangePicker
            startDate={form.issued_at || null}
            endDate={form.expires_at || null}
            onStartChange={(v) => setForm({ ...form, issued_at: v })}
            onEndChange={(v) => setForm({ ...form, expires_at: v })}
            startLabel="Date d'émission"
            endLabel="Date d'expiration"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-muted-foreground block mb-0.5">{t('conformite.records.reference_number')}</label>
              <input type="text" value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} className="w-full text-xs border border-border rounded px-2 py-1 bg-background" placeholder="REF-2024-001..." />
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground block mb-0.5">Notes</label>
              <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full text-xs border border-border rounded px-2 py-1 bg-background" placeholder="Commentaire..." />
            </div>
          </div>

          {!editingId && (
            <div className="rounded-md border border-border/70 bg-muted/20 p-2 space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                <Paperclip size={11} />
                <span>Pièce justificative obligatoire pour vérification et validation</span>
              </div>
              <AttachmentManager ownerType={STAGING_OWNER_TYPE} ownerId={stagingRef} compact />
            </div>
          )}

          <div className="flex justify-end gap-1.5">
            <button onClick={() => { setShowForm(false); setEditingId(null); resetCreateSession() }} className="btn btn-secondary">
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={(!editingId && (!form.compliance_type_id || stagedAttachmentCount <= 0)) || createRecord.isPending || updateRecord.isPending}
              className="btn btn-primary"
              title={!editingId && stagedAttachmentCount <= 0 ? 'Déposez la PJ obligatoire avant de créer le référentiel' : undefined}
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
