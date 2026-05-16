/**
 * AdsTab.v2.tsx — Pajamas++ refonte. Drop-in remplacement de AdsTab.tsx.
 *
 * Mêmes hooks, mêmes props, mêmes statuts. Changement visuel uniquement :
 *  - PaxlogPageHeader (titre + sous-titre + actions)
 *  - PaxlogStatRail (5 KPI cliquables remplaçant StatCard grid)
 *  - DataTable inchangé — bénéficie déjà des classes Pajamas++.
 */
import { useTranslation } from 'react-i18next'
import { useState, useMemo } from 'react'
import { usePageSize } from '@/hooks/usePageSize'
import { useDebounce } from '@/hooks/useDebounce'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useAdsList } from '@/hooks/usePaxlog'
import type { AdsSummary } from '@/services/paxlogService'
import type { ColumnDef } from '@tanstack/react-table'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { cn } from '@/lib/utils'
import { Users, ClipboardList, Clock, Shield, CheckCircle2, Plus, Download } from 'lucide-react'
import { PanelContent } from '@/components/layout/PanelHeader'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { ADS_STATUS_LABELS_FALLBACK, buildStatusFilterOptions, formatDate, StatusBadge, ADS_STATUS_BADGES } from '../shared'
import { PaxlogPageHeader, PaxlogStatRail } from '../components/PaxlogShell'

export function AdsTabV2({ openDetail, openCreate, requesterOnly = false, validatorOnly = false }: {
  openDetail: (id: string) => void
  openCreate?: () => void
  requesterOnly?: boolean
  validatorOnly?: boolean
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState(validatorOnly ? 'pending_validation' : '')
  const visitCategoryLabels = useDictionaryLabels('visit_category')
  const adsStatusLabels = useDictionaryLabels('pax_ads_status', ADS_STATUS_LABELS_FALLBACK)
  const adsStatusOptions = useMemo(
    () => buildStatusFilterOptions(adsStatusLabels,
      ['draft', 'submitted', 'pending_project_review', 'pending_compliance', 'pending_validation', 'pending_arbitration', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled'],
      t('common.all')),
    [adsStatusLabels, t],
  )

  const { data, isLoading } = useAdsList({
    page, page_size: pageSize,
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
    scope: requesterOnly ? 'my' : undefined,
  })
  const items: AdsSummary[] = data?.items ?? []

  const stats = useMemo(() => {
    const pending = items.filter((a) => ['submitted', 'pending_project_review', 'pending_compliance', 'pending_validation', 'pending_arbitration'].includes(a.status)).length
    const review = items.filter((a) => ['requires_review', 'pending_project_review', 'pending_compliance'].includes(a.status)).length
    const approved = items.filter((a) => a.status === 'approved').length
    const totalPax = items.reduce((sum, a) => sum + (a.pax_count ?? 0), 0)
    return { pending, review, approved, totalPax }
  }, [items])

  const adsColumns = useMemo<ColumnDef<AdsSummary, unknown>[]>(() => [
    {
      accessorKey: 'reference', header: t('paxlog.reference'),
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-medium text-foreground font-mono text-xs">{row.original.reference}</span>
          {row.original.site_name && row.original.site_entry_asset_id && (
            <CrossModuleLink module="assets" id={row.original.site_entry_asset_id} label={row.original.site_name} showIcon={false} className="text-[10px] block truncate" />
          )}
          {row.original.site_name && !row.original.site_entry_asset_id && (
            <span className="text-[10px] text-muted-foreground block truncate">{row.original.site_name}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'type', header: t('common.type'),
      cell: ({ row }) => <span className={cn('chip', row.original.type === 'team' ? 'chip-info' : '')}>
        {row.original.type === 'individual' ? t('paxlog.create_ads.type.individual') : t('paxlog.create_ads.type.team')}
      </span>,
      size: 90,
    },
    { id: 'pax_name', header: t('paxlog.columns.pax_name'),
      cell: ({ row }) => <span className="text-xs font-medium truncate">{row.original.pax_display_name || '—'}</span>, size: 160 },
    { id: 'imputation', header: t('paxlog.columns.imputation'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground truncate">{row.original.imputation_label || '—'}</span>, size: 120 },
    { accessorKey: 'visit_category', header: t('paxlog.visit_category'),
      cell: ({ row }) => <span className="chip">{visitCategoryLabels[row.original.visit_category] || row.original.visit_category}</span> },
    { id: 'dates', header: t('paxlog.ads_detail.fields.dates'),
      cell: ({ row }) => <span className="text-muted-foreground text-xs tabular-nums">{formatDate(row.original.start_date)} → {formatDate(row.original.end_date)}</span> },
    { accessorKey: 'requester_name', header: t('paxlog.ads_detail.fields.requester'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground truncate block max-w-[120px]">{row.original.requester_name || '—'}</span> },
    { accessorKey: 'pax_count', header: t('paxlog.columns.pax'),
      cell: ({ row }) => <span className="inline-flex items-center gap-1 text-xs"><Users size={11} className="text-muted-foreground" /> {row.original.pax_count}</span>, size: 60 },
    { accessorKey: 'status', header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} labels={adsStatusLabels} badges={ADS_STATUS_BADGES} />, size: 110 },
  ], [adsStatusLabels, t, visitCategoryLabels])

  return (
    <>
      <PaxlogPageHeader
        title={requesterOnly ? t('paxlog.ads.title.requester', 'Mes avis de séjour')
             : validatorOnly ? t('paxlog.ads.title.validator', 'AdS à valider')
             : t('paxlog.tabs.ads', 'Avis de séjour')}
        count={data?.total}
        subtitle={
          <span>
            <strong>{stats.pending}</strong> en attente · <strong>{stats.approved}</strong> approuvés · <strong>{stats.totalPax}</strong> pax au total
          </span>
        }
        actions={
          <>
            <button className="btn-sm btn-secondary"><Download size={12} /> {t('common.export')}</button>
            {openCreate && (
              <button className="btn-sm btn-primary" onClick={openCreate}>
                <Plus size={12} /> {t('paxlog.actions.new_ads', 'Nouvel AdS')}
              </button>
            )}
          </>
        }
      />

      <PaxlogStatRail items={[
        { id: 'all',     label: t('common.total'), value: data?.total ?? 0, icon: ClipboardList,
          onClick: () => { setStatusFilter(''); setPage(1) }, active: !statusFilter },
        { id: 'pending', label: t('paxlog.ads.kpis.pending'), value: stats.pending, icon: Clock,
          tone: stats.pending > 0 ? 'warning' : undefined,
          onClick: () => { setStatusFilter(statusFilter === 'pending_validation' ? '' : 'pending_validation'); setPage(1) },
          active: statusFilter === 'pending_validation' },
        { id: 'review',  label: t('paxlog.ads.kpis.review_gaps'), value: stats.review, icon: Shield,
          tone: stats.review > 0 ? 'danger' : undefined },
        { id: 'approved', label: t('paxlog.ads.kpis.approved'), value: stats.approved, icon: CheckCircle2,
          tone: stats.approved > 0 ? 'success' : undefined,
          onClick: () => { setStatusFilter(statusFilter === 'approved' ? '' : 'approved'); setPage(1) },
          active: statusFilter === 'approved' },
        { id: 'pax',     label: t('paxlog.ads.kpis.total_pax'), value: stats.totalPax, icon: Users },
      ]} />

      <PanelContent scroll={false}>
        <DataTable<AdsSummary>
          columns={adsColumns} data={items} isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search} onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder={validatorOnly ? t('paxlog.ads.search.validator') : t('paxlog.ads.search.default')}
          filters={[{ id: 'status', label: t('common.status'), type: 'multi-select', operators: ['is', 'is_not'],
            options: adsStatusOptions.filter((o) => o.value).map((o) => ({ value: o.value, label: o.label })) }]}
          activeFilters={statusFilter ? { status: [statusFilter] } : {}}
          onFilterChange={(id, v) => {
            if (id !== 'status') return
            const arr = Array.isArray(v) ? v : v != null ? [v] : []
            setStatusFilter(arr.length > 0 ? String(arr[0]) : '')
            setPage(1)
          }}
          onRowClick={(row) => openDetail(row.id)}
          emptyIcon={ClipboardList}
          emptyTitle={validatorOnly ? t('paxlog.ads.empty.validator') : t('paxlog.ads.empty.default')}
          storageKey="paxlog-ads"
        />
      </PanelContent>
    </>
  )
}
