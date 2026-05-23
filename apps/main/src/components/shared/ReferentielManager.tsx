/**
 * ReferentielManager — Polymorphic compliance records manager.
 *
 * Displays compliance records (formations, certifications, habilitations, EPI)
 * for any owner (user, tier_contact, tier, asset) with conformity status badge,
 * required/missing items from ComplianceRules, inline create/edit/delete.
 *
 * Usage:
 *   <ReferentielManager ownerType="user" ownerId={user.id} />
 *   <ReferentielManager ownerType="tier_contact" ownerId={contact.id} category="certification" />
 */
import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  ShieldCheck, ShieldAlert, Plus, Trash2, X,
  Loader2, AlertTriangle, Pencil, GraduationCap, Paperclip,
  History, Search, Eye, RefreshCw,
} from 'lucide-react'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { EmptyState } from '@/components/ui/EmptyState'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import {
  useComplianceRecords, useCreateComplianceRecord, useUpdateComplianceRecord,
  useDeleteComplianceRecord, useComplianceCheck, useComplianceTypes, useAuthorizationCenters,
  useVerifyComplianceRecordExternally, useComplianceRules,
} from '@/hooks/useConformite'
import { useAttachments } from '@/hooks/useSettings'
import type { ComplianceRecord, ComplianceType } from '@/types/api'

interface ReferentielManagerProps {
  ownerType: 'user' | 'tier_contact' | 'tier' | 'asset'
  ownerId: string | undefined
  compact?: boolean
  /** Filter to a single category */
  category?: string
}

const CATEGORY_ORDER = ['formation', 'certification', 'habilitation', 'medical', 'epi']
const AUDIT_CATEGORY = 'audit'

type ComplianceSubjectScope = 'person' | 'company' | 'asset' | 'cargo' | 'all'

const ownerTypeToSubjectScope = (ownerType: ReferentielManagerProps['ownerType']): ComplianceSubjectScope => {
  switch (ownerType) {
    case 'tier':
      return 'company'
    case 'asset':
      return 'asset'
    case 'user':
    case 'tier_contact':
    default:
      return 'person'
  }
}

const isAuditComplianceType = (type: ComplianceType | null | undefined) => {
  if (!type) return false
  const category = String(type.category || '').toLowerCase()
  const code = String(type.code || '').toLowerCase()
  return category === AUDIT_CATEGORY || code.startsWith('audit-') || code.includes('-audit-')
}

const isAuditRecord = (record: ComplianceRecord) => String(record.type_category || '').toLowerCase() === AUDIT_CATEGORY

const STATUS_STYLES: Record<string, string> = {
  valid: 'chip-success',
  expired: 'chip-danger',
  pending: 'chip-warn',
  unverified: 'chip-warn',
  rejected: 'chip-danger',
  missing: '',
  exempted: 'chip-info',
}

const STATUS_TRANSLATION_KEYS: Record<string, string> = {
  valid: 'conformite.records.valid',
  expired: 'conformite.records.expired',
  pending: 'conformite.records.pending',
  unverified: 'conformite.records.unverified',
  rejected: 'conformite.records.rejected',
  missing: 'conformite.records.missing',
  exempted: 'conformite.records.exempted',
}

type FormData = {
  compliance_type_id: string
  status: string
  title: string
  issued_at: string
  expires_at: string
  issuer_tier_id: string
  issuer: string
  reference_number: string
  notes: string
}

const EMPTY_FORM: FormData = {
  compliance_type_id: '',
  status: 'pending',
  title: '',
  issued_at: '',
  expires_at: '',
  issuer_tier_id: '',
  issuer: '',
  reference_number: '',
  notes: '',
}

const STAGING_OWNER_TYPE = 'compliance_record_staging'
const RISEUP_ISSUER_VALUE = '__provider:riseup'
const LEGACY_ISSUER_VALUE = '__legacy'

const createStagingRef = () => globalThis.crypto?.randomUUID?.() ?? ''

export function ReferentielManager({ ownerType, ownerId, compact, category }: ReferentielManagerProps) {
  const { t, i18n } = useTranslation()
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
  const { data: typesData } = useComplianceTypes({ page_size: 200, owner_type: ownerType, include_audit: false })
  const { data: rules = [] } = useComplianceRules()
  const createRecord = useCreateComplianceRecord()
  const updateRecord = useUpdateComplianceRecord()
  const verifyExternalRecord = useVerifyComplianceRecordExternally()
  const deleteRecord = useDeleteComplianceRecord()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null)
  const [historyExpandedRecordId, setHistoryExpandedRecordId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [stagingRef, setStagingRef] = useState(createStagingRef)
  const { data: authorizationCentersData } = useAuthorizationCenters({
    compliance_type_id: form.compliance_type_id || undefined,
    page_size: 100,
    enabled: showForm && !!form.compliance_type_id,
  })
  const { data: stagedAttachments } = useAttachments(
    STAGING_OWNER_TYPE,
    showForm && !editingId ? stagingRef : undefined,
  )
  const stagedAttachmentCount = stagedAttachments?.length ?? 0
  const authorizationCenters = authorizationCentersData?.items ?? []
  const hasStructuredIssuers = authorizationCenters.length > 0
  const subjectScope = ownerTypeToSubjectScope(ownerType)

  const referentialTypeOptions = useMemo(() => {
    const items = (typesData?.items ?? []).filter((item) => !isAuditComplianceType(item))

    if (category) return items.filter((item) => item.category === category)

    const ruleTypeIdsForScope = new Set(
      rules
        .filter((rule) => {
          if (!rule.active) return false
          if (rule.subject_scope !== subjectScope && rule.subject_scope !== 'all') return false
          if (typeof rule.condition_json?.audit_template_id === 'string') return false
          const linkedType = items.find((item) => item.id === rule.compliance_type_id)
          return !!linkedType
        })
        .map((rule) => rule.compliance_type_id),
    )

    if (subjectScope === 'company' || subjectScope === 'asset' || subjectScope === 'cargo') {
      return items.filter((item) => ruleTypeIdsForScope.has(item.id))
    }

    return items
  }, [category, rules, subjectScope, typesData?.items])

  const checkDetails = useMemo(() => (
    (checkResult?.details ?? []).filter((detail: Record<string, unknown>) => (
      String(detail.category || detail.type_category || '').toLowerCase() !== AUDIT_CATEGORY
    ))
  ), [checkResult?.details])

  // Group records by category
  const grouped = useMemo(() => {
    const items = (records?.items ?? []).filter((record) => !isAuditRecord(record))
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
    if (checkDetails.length) {
      for (const d of checkDetails) {
        const cat = String(d.category || '')
        if (cat) cats.add(cat)
      }
    }
    // Filter to single category if specified
    if (category) return [category]
    return CATEGORY_ORDER.filter(c => cats.has(c)).concat(
      [...cats].filter(c => !CATEGORY_ORDER.includes(c))
    )
  }, [grouped, checkDetails, category])

  // Missing required types from check
  const missingTypes = useMemo(() => {
    return checkDetails.filter((d) => d.status === 'missing' || d.status === 'expired')
  }, [checkDetails])

  // Types filtered for the form combobox
  const typeOptions = useMemo(() => {
    if (activeCategory) return referentialTypeOptions.filter(t => t.category === activeCategory)
    return referentialTypeOptions
  }, [activeCategory, referentialTypeOptions])
  const selectedComplianceType = useMemo(
    () => (typesData?.items ?? []).find((item) => item.id === form.compliance_type_id),
    [form.compliance_type_id, typesData?.items],
  )
  const canUseRiseUpIssuer = selectedComplianceType?.external_provider === 'riseup'
    && ['external', 'both'].includes(selectedComplianceType.compliance_source)
  const issuerSelectValue = form.issuer_tier_id
    || (form.issuer === 'RiseUp' ? RISEUP_ISSUER_VALUE : form.issuer ? LEGACY_ISSUER_VALUE : '')

  useEffect(() => {
    if (!form.compliance_type_id) return
    if (editingId) return
    if (typeOptions.some((item) => item.id === form.compliance_type_id)) return
    setForm((current) => ({ ...current, compliance_type_id: '', issuer_tier_id: '', issuer: '' }))
  }, [editingId, form.compliance_type_id, typeOptions])

  const formatDate = (d: string | null | undefined) => {
    if (!d) return null
    const locale = i18n.language?.startsWith('en') ? 'en-US' : 'fr-FR'
    return new Date(d).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: '2-digit' })
  }

  const getCategoryLabel = (value: string) => t(`conformite.types.${value}`, { defaultValue: value })

  const getStatusLabel = (status: string) => {
    const key = STATUS_TRANSLATION_KEYS[status]
    return key ? t(key) : status
  }

  const getRecordStatusLabel = (rec: ComplianceRecord) => {
    if (!rec.active) return t('conformite.records.invalidated')
    return getStatusLabel(rec.status)
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
      title: rec.title || '',
      issued_at: rec.issued_at?.slice(0, 10) || '',
      expires_at: rec.expires_at?.slice(0, 10) || '',
      issuer_tier_id: rec.issuer_tier_id || '',
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
        title: t('conformite.records.attachment_required_title'),
        description: t('conformite.records.attachment_required_description'),
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
            title: form.title || null,
            issued_at: form.issued_at || null,
            expires_at: form.expires_at || null,
            issuer_tier_id: form.issuer_tier_id || null,
            issuer: form.issuer || null,
            reference_number: form.reference_number || null,
            notes: form.notes || null,
          },
        })
        toast({ title: t('conformite.records.updated_success'), variant: 'success' })
      } else {
        if (!form.compliance_type_id) return
        const created = await createRecord.mutateAsync({
          compliance_type_id: form.compliance_type_id,
          owner_type: ownerType,
          owner_id: ownerId,
          status: form.status,
          title: form.title || null,
          issued_at: form.issued_at || null,
          expires_at: form.expires_at || null,
          issuer_tier_id: form.issuer_tier_id || null,
          issuer: form.issuer || null,
          reference_number: form.reference_number || null,
          notes: form.notes || null,
          staging_ref: stagingRef,
        }) as any
        await queryClient.invalidateQueries({ queryKey: ['compliance-records'] })
        await queryClient.invalidateQueries({ queryKey: ['compliance-check', ownerType, ownerId] })
        toast({ title: t('conformite.records.reference_added_with_proof'), variant: 'success' })
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

  const canVerifyExternally = (rec: ComplianceRecord) => {
    const source = rec.type_compliance_source || ''
    return rec.type_external_provider === 'riseup' && ['external', 'both'].includes(source)
  }

  const handleExternalVerify = async (rec: ComplianceRecord) => {
    try {
      const updated = await verifyExternalRecord.mutateAsync(rec.id)
      toast({
        title: t('conformite.records.external_verify_success'),
        description: updated.title || updated.type_name || undefined,
        variant: 'success',
      })
    } catch (err) {
      const typed = err as { response?: { data?: { detail?: string } } }
      toast({
        title: t('conformite.records.external_verify_error'),
        description: typed?.response?.data?.detail || undefined,
        variant: 'error',
      })
    }
  }

  if (!ownerId) return null

  const totalRecords = Object.values(grouped).reduce((sum, items) => sum + items.length, 0)
  const historyItems = (historyRecords?.items ?? []).filter((record) => !isAuditRecord(record))
  const validCount = checkDetails.filter((d) => d.status === 'valid').length
  const expiredCount = checkDetails.filter((d) => d.status === 'expired').length
  const missingCount = checkDetails.filter((d) => d.status === 'missing').length
  const unverifiedCount = checkDetails.filter((d) => d.status === 'unverified').length
  const exemptedCount = checkDetails.filter((d: Record<string, unknown>) => d.status === 'exempted').length
  const isReferenceCompliant = checkDetails.length === 0
    || (missingCount === 0 && expiredCount === 0 && unverifiedCount === 0)
  const complianceSummaryParts = checkResult ? [
    t('conformite.check.valid_count', { valid: validCount, total: checkDetails.length }),
    ...(expiredCount > 0 ? [t('conformite.check.expired_count', { count: expiredCount })] : []),
    ...(missingCount > 0 ? [t('conformite.check.missing_count', { count: missingCount })] : []),
    ...(exemptedCount > 0 ? [t('conformite.check.exempted_count', { count: exemptedCount })] : []),
  ] : []

  return (
    <div className={cn('space-y-2', compact && 'text-xs')}>
      {/* Compliance summary badge */}
      {checkResult && !checkLoading && (
        <div className={cn(
          'flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs',
          isReferenceCompliant
            ? 'bg-green-500/5 border-green-500/20 text-green-700 dark:text-green-400'
            : 'bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-400'
        )}>
          {isReferenceCompliant
            ? <ShieldCheck size={14} />
            : <ShieldAlert size={14} />}
          <span className="font-medium">
            {isReferenceCompliant ? t('conformite.check.compliant') : t('conformite.check.non_compliant')}
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {complianceSummaryParts.join(' · ')}
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
                {getStatusLabel(String(detail.status))}
              </span>
              <Plus size={10} className="text-primary shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Exempted items (informational) */}
      {checkDetails.some((d: Record<string, unknown>) => d.status === 'exempted') && (
        <div className="space-y-1">
          {checkDetails.filter((d: Record<string, unknown>) => d.status === 'exempted').map((detail: Record<string, unknown>, i: number) => (
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
                    {getCategoryLabel(cat)}
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
                          {getStatusLabel(rec.status)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate font-medium">{rec.title || rec.type_name || rec.compliance_type_id}</span>
                          {rec.title && rec.type_name && rec.title !== rec.type_name && (
                            <span className="block truncate text-[10px] text-muted-foreground">{rec.type_name}</span>
                          )}
                        </span>
                        {rec.issued_at && (
                          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0" title={t('shared.date_emission')}>
                            {formatDate(rec.issued_at)}
                          </span>
                        )}
                        {rec.expires_at && (
                          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0" title={t('conformite.records.fields.expires_at')}>
                            → {formatDate(rec.expires_at)}
                          </span>
                        )}
                        {(rec.issuer_tier_name || rec.issuer) && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[80px]" title={rec.issuer_tier_name || rec.issuer || undefined}>
                            {rec.issuer_tier_name || rec.issuer}
                          </span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedRecordId(expandedRecordId === rec.id ? null : rec.id) }}
                          className="p-0.5 rounded hover:bg-muted text-muted-foreground shrink-0"
                          title={t('common.attachments')}
                        >
                          <Paperclip size={10} />
                        </button>
                        <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                          {canVerifyExternally(rec) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleExternalVerify(rec) }}
                              className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                              title={t('conformite.records.verify_external')}
                              disabled={verifyExternalRecord.isPending}
                            >
                              {verifyExternalRecord.isPending ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                            </button>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); openEdit(rec) }} className="p-0.5 rounded hover:bg-muted text-muted-foreground" title={t('common.edit')}>
                            <Pencil size={10} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(rec.id) }} className="p-0.5 rounded hover:bg-muted text-muted-foreground" title={t('common.delete')}>
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
          title={t('conformite.records.history_tooltip')}
        >
          <History size={12} className="text-muted-foreground shrink-0" />
          <span className="font-medium flex-1">{t('conformite.records.history_title')}</span>
          <span className="text-[10px] text-muted-foreground">{showHistory ? t('conformite.records.history_hide') : t('conformite.records.history_show')}</span>
        </button>

        {showHistory && (
          <div className="border-t border-border bg-muted/10 p-2 space-y-2">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full h-8 pl-7 pr-2 rounded border border-border bg-background text-xs"
                placeholder={t('conformite.records.history_search_placeholder')}
              />
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
              </div>
            ) : historyItems.length > 0 ? (
              <div className="border border-border rounded-md overflow-hidden bg-background">
                <div className="hidden md:grid grid-cols-[minmax(180px,1.5fr)_90px_110px_110px_110px_minmax(120px,1fr)_50px] gap-2 px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <span>{t('conformite.records.fields.type')}</span>
                  <span>{t('conformite.records.fields.status')}</span>
                  <span>{t('conformite.records.fields.reference_number')}</span>
                  <span>{t('conformite.records.fields.issued_at')}</span>
                  <span>{t('conformite.records.fields.expires_at')}</span>
                  <span>{t('conformite.records.fields.issuer')}</span>
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
                        <span className="block font-medium truncate">{rec.title || rec.type_name || rec.compliance_type_id}</span>
                        {rec.title && rec.type_name && rec.title !== rec.type_name && (
                          <span className="block text-[10px] text-muted-foreground truncate">{rec.type_name}</span>
                        )}
                        <span className="md:hidden block text-[10px] text-muted-foreground truncate">
                          {rec.reference_number || t('conformite.records.no_reference')} · {rec.issuer_tier_name || rec.issuer || t('conformite.records.issuer_missing')}
                        </span>
                      </span>
                      <span className={cn('chip text-[9px] shrink-0 justify-self-end md:justify-self-start', getRecordStatusStyle(rec))}>
                        {getRecordStatusLabel(rec)}
                      </span>
                      <span className="hidden md:block text-muted-foreground truncate">{rec.reference_number || '—'}</span>
                      <span className="hidden md:block text-muted-foreground tabular-nums">{formatDate(rec.issued_at) || '—'}</span>
                      <span className="hidden md:block text-muted-foreground tabular-nums">{formatDate(rec.expires_at) || '—'}</span>
                      <span className="hidden md:block text-muted-foreground truncate">{rec.issuer_tier_name || rec.issuer || '—'}</span>
                      <span className="hidden md:flex items-center justify-end gap-1 text-muted-foreground">
                        <Paperclip size={11} />
                        {rec.attachment_count ?? 0}
                      </span>
                    </button>
                    {historyExpandedRecordId === rec.id && (
                      <div className="px-3 py-2 bg-muted/20 border-t border-border/50 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                          <div><span className="font-medium text-foreground">{t('conformite.records.fields.reference_number')} :</span> {rec.reference_number || '—'}</div>
                          <div><span className="font-medium text-foreground">{t('conformite.records.fields.issuer')} :</span> {rec.issuer_tier_name || rec.issuer || '—'}</div>
                          <div><span className="font-medium text-foreground">{t('conformite.records.fields.issued_at')} :</span> {formatDate(rec.issued_at) || '—'}</div>
                          <div><span className="font-medium text-foreground">{t('conformite.records.fields.expires_at')} :</span> {formatDate(rec.expires_at) || '—'}</div>
                          {rec.notes && <div className="sm:col-span-2"><span className="font-medium text-foreground">{t('conformite.records.fields.notes')} :</span> {rec.notes}</div>}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Eye size={11} />
                          {t('conformite.records.readonly')}
                        </div>
                        <AttachmentManager ownerType="compliance_record" ownerId={rec.id} compact />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={History} title={t('conformite.records.no_history_found')} variant="search" size="compact" />
            )}
          </div>
        )}
      </div>

      {/* Create / Edit form */}
      {showForm ? (
        <div className="border border-primary/30 rounded-md bg-primary/5 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-primary">
              {editingId ? t('conformite.records.edit_record') : t('conformite.records.new_record')}
            </span>
            <button onClick={() => { setShowForm(false); setEditingId(null); resetCreateSession() }} className="p-0.5 rounded hover:bg-muted text-muted-foreground">
              <X size={10} />
            </button>
          </div>

          {/* Type selector (only for create, locked for edit) */}
          {!editingId && (
            <select
              value={form.compliance_type_id}
              onChange={(e) => setForm({ ...form, compliance_type_id: e.target.value, issuer_tier_id: '', issuer: '' })}
              className="w-full text-xs border border-border rounded px-2 py-1 bg-background"
            >
              <option value="">{t('shared.selectionner_un_type')}</option>
              {typeOptions.length === 0 && (
                <option value="" disabled>
                  {t('conformite.records.no_applicable_type', 'Aucun type applicable dans ce contexte')}
                </option>
              )}
              {typeOptions.map(t => (
                <option key={t.id} value={t.id}>
                  [{getCategoryLabel(t.category)}] {t.code} — {t.name}
                </option>
              ))}
            </select>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-[9px] text-muted-foreground block mb-0.5">{t('conformite.records.fields.title')}</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full text-xs border border-border rounded px-2 py-1 bg-background"
                placeholder={t('conformite.records.placeholders.title')}
              />
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground block mb-0.5">{t('conformite.records.fields.status')}</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full text-xs border border-border rounded px-2 py-1 bg-background">
                <option value="valid">{t('conformite.records.valid')}</option>
                <option value="pending">{t('conformite.records.pending')}</option>
                <option value="expired">{t('conformite.records.expired')}</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground block mb-0.5">{t('conformite.columns.issuer')}</label>
              <select
                value={issuerSelectValue}
                onChange={(e) => {
                  const value = e.target.value
                  if (!value) {
                    setForm({ ...form, issuer_tier_id: '', issuer: '' })
                    return
                  }
                  if (value === RISEUP_ISSUER_VALUE) {
                    setForm({ ...form, issuer_tier_id: '', issuer: 'RiseUp' })
                    return
                  }
                  if (value === LEGACY_ISSUER_VALUE) return
                  const center = authorizationCenters.find((item) => item.id === value)
                  setForm({ ...form, issuer_tier_id: value, issuer: center?.name || '' })
                }}
                className="w-full text-xs border border-border rounded px-2 py-1 bg-background"
              >
                <option value="">{t('common.choose_short')}</option>
                {canUseRiseUpIssuer && <option value={RISEUP_ISSUER_VALUE}>RiseUp</option>}
                {authorizationCenters.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.name}{center.authorization_center_code ? ` · ${center.authorization_center_code}` : ''}
                  </option>
                ))}
                {form.issuer && form.issuer !== 'RiseUp' && !form.issuer_tier_id && (
                  <option value={LEGACY_ISSUER_VALUE}>{form.issuer} ({t('conformite.records.legacy')})</option>
                )}
              </select>
              {!hasStructuredIssuers && selectedComplianceType && !canUseRiseUpIssuer ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t('conformite.records.riseup_type_not_linked')}
                </p>
              ) : !hasStructuredIssuers && !canUseRiseUpIssuer && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t('conformite.records.no_configured_issuer')}
                </p>
              )}
            </div>
          </div>

          <DateRangePicker
            startDate={form.issued_at || null}
            endDate={form.expires_at || null}
            onStartChange={(v) => setForm({ ...form, issued_at: v })}
            onEndChange={(v) => setForm({ ...form, expires_at: v })}
            startLabel={t('conformite.records.fields.issued_at')}
            endLabel={t('conformite.records.fields.expires_at')}
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-muted-foreground block mb-0.5">{t('conformite.records.fields.reference_number')}</label>
              <input type="text" value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} className="w-full text-xs border border-border rounded px-2 py-1 bg-background" placeholder="REF-2024-001..." />
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground block mb-0.5">{t('conformite.records.fields.notes')}</label>
              <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full text-xs border border-border rounded px-2 py-1 bg-background" placeholder={t('conformite.records.placeholders.note_short')} />
            </div>
          </div>

          {!editingId && (
            <div className="rounded-md border border-border/70 bg-muted/20 p-2 space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                <Paperclip size={11} />
                <span>{t('conformite.records.proof_required_inline')}</span>
              </div>
              <AttachmentManager ownerType={STAGING_OWNER_TYPE} ownerId={stagingRef} compact />
            </div>
          )}

          <div className="flex justify-end gap-1.5">
            <button onClick={() => { setShowForm(false); setEditingId(null); resetCreateSession() }} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={(!editingId && (!form.compliance_type_id || stagedAttachmentCount <= 0)) || createRecord.isPending || updateRecord.isPending}
              className="btn btn-primary"
              title={!editingId && stagedAttachmentCount <= 0 ? t('conformite.records.drop_required_proof_title') : undefined}
            >
              {(createRecord.isPending || updateRecord.isPending) ? <Loader2 size={10} className="animate-spin inline mr-1" /> : null}
              {editingId ? t('common.save') : t('common.create')}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => openCreate(category)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1">
          <Plus size={12} /> {t('conformite.records.add_reference')}
        </button>
      )}
    </div>
  )
}
