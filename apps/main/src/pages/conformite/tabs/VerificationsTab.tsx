import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardCheck, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef } from '@/components/ui/DataTable/types'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { usePendingVerifications, useVerifyRecord, useVerificationHistory } from '@/hooks/useConformite'
import { useConformiteDictionaryState, useVerificationRecordTypeLabels } from '../shared'
import { VerificationOwnerSummary } from '../components'

export function VerificationsTab() {
  const { t } = useTranslation()
  const { verificationStatusOptions, verificationStatusLabels } = useConformiteDictionaryState()
  const recordTypeLabels = useVerificationRecordTypeLabels()
  const { data: pendingData, isLoading: pendingLoading } = usePendingVerifications()
  const { data: historyData, isLoading: historyLoading } = useVerificationHistory(1, 200)
  const verifyRecord = useVerifyRecord()
  const { toast } = useToast()
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [verSearch, setVerSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const { openDynamicPanel } = useUIStore()

  const allItems = useMemo(() => {
    const pending = (pendingData?.items ?? []).map((item) => ({
      ...item,
      verification_status: 'pending' as string,
      verified_by_name: null as string | null,
      verified_at: null as string | null,
      verification_notes: null as string | null,
    }))
    const history = (historyData?.items ?? []).map((item) => ({
      ...item,
      submitted_at: item.verified_at || '',
      attachment_count: 0,
    }))
    const seen = new Set<string>()
    const merged: typeof pending = []
    for (const item of pending) { seen.add(item.id); merged.push(item) }
    for (const item of history) { if (!seen.has(item.id)) merged.push(item as any) }
    return merged
  }, [pendingData, historyData])

  const filteredItems = useMemo(() => {
    if (!statusFilter) return allItems
    return allItems.filter((i) => i.verification_status === statusFilter)
  }, [allItems, statusFilter])

  const isLoading = pendingLoading || historyLoading

  const handleVerify = async (recordType: string, recordId: string) => {
    try {
      await verifyRecord.mutateAsync({ recordType, recordId, action: 'verify' })
      toast({ title: t('conformite.toast.verified'), variant: 'success' })
    } catch { toast({ title: t('conformite.toast.error'), variant: 'error' }) }
  }

  const handleReject = async (recordType: string, recordId: string) => {
    if (!rejectReason.trim()) return
    try {
      await verifyRecord.mutateAsync({ recordType, recordId, action: 'reject', rejectionReason: rejectReason })
      toast({ title: t('conformite.toast.rejected'), variant: 'success' })
      setRejectingId(null); setRejectReason('')
    } catch { toast({ title: t('conformite.toast.error'), variant: 'error' }) }
  }

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return '—' }
  }

  const verFilters: DataTableFilterDef[] = useMemo(() => [
    { id: 'verification_status', label: 'Statut', type: 'select', options: verificationStatusOptions },
  ], [verificationStatusOptions])

  const verColumns: ColumnDef<Record<string, any>>[] = useMemo(() => [
    {
      accessorKey: 'owner_name',
      header: t('conformite.columns.person'),
      size: 160,
      cell: ({ row }) => (
        <VerificationOwnerSummary
          ownerType={row.original.owner_type}
          ownerId={row.original.owner_id}
          ownerName={row.original.owner_name}
          compact
        />
      ),
    },
    {
      accessorKey: 'record_type',
      header: t('conformite.columns.type'),
      size: 120,
      cell: ({ row }) => (
        <span className="gl-badge gl-badge-neutral text-[9px]">{recordTypeLabels[row.original.record_type] || row.original.record_type}</span>
      ),
    },
    { accessorKey: 'description', header: t('conformite.columns.description'), size: 220 },
    {
      accessorKey: 'verification_status',
      header: t('conformite.columns.status'),
      size: 100,
      cell: ({ row }) => {
        const s = row.original.verification_status
        const cls = s === 'pending' ? 'gl-badge-warning' : s === 'verified' ? 'gl-badge-success' : 'gl-badge-danger'
        const label = verificationStatusLabels[s] ?? s
        return <span className={cn('gl-badge text-[9px]', cls)}>{label}</span>
      },
    },
    {
      accessorKey: 'issuer',
      header: t('conformite.columns.issuer'),
      size: 130,
      cell: ({ row }) => <span className="truncate">{(row.original.issuer as string) || '—'}</span>,
    },
    {
      accessorKey: 'submitted_at',
      header: t('conformite.columns.date'),
      size: 100,
      cell: ({ row }) => fmtDate((row.original.issued_at as string) || row.original.submitted_at),
    },
    {
      accessorKey: 'expires_at',
      header: t('conformite.columns.expiration'),
      size: 100,
      cell: ({ row }) => {
        const exp = row.original.expires_at as string | null
        if (!exp) return <span className="text-muted-foreground">—</span>
        const d = new Date(exp)
        const now = new Date()
        const days = Math.ceil((d.getTime() - now.getTime()) / 86400000)
        const color = days < 0 ? 'text-red-500' : days < 30 ? 'text-orange-500' : 'text-foreground'
        return <span className={color}>{fmtDate(exp)}</span>
      },
    },
    {
      accessorKey: 'attachment_count',
      header: t('conformite.columns.attachment'),
      size: 110,
      cell: ({ row }) => {
        const count = row.original.attachment_count ?? 0
        const required = row.original.attachment_required !== false
        if (count > 0) {
          return <span className="gl-badge gl-badge-success text-[9px]">{t('conformite.verifications.proof_present', { count })}</span>
        }
        if (required) {
          return <span className="gl-badge gl-badge-warning text-[9px]">{t('conformite.verifications.proof_missing')}</span>
        }
        return <span className="text-muted-foreground">—</span>
      },
    },
    {
      accessorKey: 'verified_by_name',
      header: t('conformite.columns.verified_by'),
      size: 120,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.verified_by_name || '—'}</span>,
    },
    {
      id: 'actions',
      header: '',
      size: 70,
      cell: ({ row }) => {
        const item = row.original
        if (item.verification_status !== 'pending') return null
        const proofMissing = (item.attachment_required !== false) && ((item.attachment_count ?? 0) <= 0)
        const isRejecting = rejectingId === item.id
        if (isRejecting) {
          return (
            <div className="flex items-center gap-1">
              <input
                type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t('common.motive_ellipsis')} className="text-[10px] border border-border rounded px-1.5 py-0.5 bg-background w-24" autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleReject(item.record_type, item.id) }}
              />
              <button onClick={() => handleReject(item.record_type, item.id)} disabled={!rejectReason.trim()} className="p-0.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Check size={11} /></button>
              <button onClick={() => { setRejectingId(null); setRejectReason('') }} className="p-0.5 rounded text-muted-foreground hover:bg-muted"><X size={11} /></button>
            </div>
          )
        }
        return (
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); if (!proofMissing) handleVerify(item.record_type, item.id) }} disabled={proofMissing} className="gl-button-sm gl-button-default text-green-600 hover:text-green-700 disabled:opacity-40" title={proofMissing ? t('conformite.verifications.proof_required_before_verify') : 'Vérifier'}><Check size={12} /></button>
            <button onClick={(e) => { e.stopPropagation(); setRejectingId(item.id) }} className="gl-button-sm gl-button-default text-destructive hover:text-destructive" title={t('common.reject')}><X size={12} /></button>
          </div>
        )
      },
    },
  ], [recordTypeLabels, rejectingId, rejectReason, verificationStatusLabels])

  const verPagination: DataTablePagination = {
    page: 1,
    pageSize: filteredItems.length || 50,
    total: filteredItems.length,
    pages: 1,
  }

  return (
    <DataTable<Record<string, any>>
      columns={verColumns}
      data={filteredItems}
      isLoading={isLoading}
      pagination={verPagination}
      searchValue={verSearch}
      onSearchChange={setVerSearch}
            searchPlaceholder={t('conformite.verifications.search')}
      filters={verFilters}
      activeFilters={{ verification_status: statusFilter || undefined } as Record<string, unknown>}
      onFilterChange={(id, value) => { if (id === 'verification_status') setStatusFilter(value as string || '') }}
      onRowClick={(row) => {
        if (row.verification_status === 'pending') {
          openDynamicPanel({
            type: 'detail', module: 'conformite', id: row.id,
            meta: { subtype: 'verification', record_type: row.record_type },
          })
        }
      }}
      emptyIcon={ClipboardCheck}
      emptyTitle={statusFilter === 'pending' ? 'Aucune vérification en attente' : 'Aucun résultat'}
      columnResizing
      columnVisibility
      storageKey="conformite-verifications"
    />
  )
}
