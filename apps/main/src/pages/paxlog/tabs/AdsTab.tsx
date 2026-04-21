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
import { Users, ClipboardList, Clock, Shield, CheckCircle2 } from 'lucide-react'
import { PanelContent } from '@/components/layout/PanelHeader'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { ADS_STATUS_LABELS_FALLBACK, buildStatusFilterOptions, formatDate, StatusBadge, ADS_STATUS_BADGES, StatCard } from '../shared'

export function AdsTab({ openDetail, requesterOnly = false, validatorOnly = false }: { openDetail: (id: string) => void; requesterOnly?: boolean; validatorOnly?: boolean }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState(validatorOnly ? 'pending_validation' : '')
  const visitCategoryLabels = useDictionaryLabels('visit_category')
  const adsStatusLabels = useDictionaryLabels('pax_ads_status', ADS_STATUS_LABELS_FALLBACK)
  const adsStatusOptions = useMemo(
    () => buildStatusFilterOptions(adsStatusLabels, ['draft', 'submitted', 'pending_project_review', 'pending_compliance', 'pending_validation', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled'], t('common.all')),
    [adsStatusLabels, t],
  )

  const { data, isLoading } = useAdsList({
    page,
    page_size: pageSize,
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
    scope: requesterOnly ? 'my' : undefined,
  })

  const items: AdsSummary[] = data?.items ?? []

  const stats = useMemo(() => {
    const pending = items.filter((a) => ['submitted', 'pending_project_review', 'pending_compliance', 'pending_validation'].includes(a.status)).length
    const review = items.filter((a) => ['requires_review', 'pending_project_review', 'pending_compliance'].includes(a.status)).length
    const approved = items.filter((a) => a.status === 'approved').length
    const totalPax = items.reduce((sum, a) => sum + (a.pax_count ?? 0), 0)
    return { pending, review, approved, totalPax }
  }, [items])

  const adsColumns = useMemo<ColumnDef<AdsSummary, unknown>[]>(() => [
    {
      accessorKey: 'reference',
      header: t('paxlog.reference'),
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
      accessorKey: 'type',
      header: t('common.type'),
      cell: ({ row }) => (
        <span className={cn('gl-badge', row.original.type === 'team' ? 'gl-badge-info' : 'gl-badge-neutral')}>
          {row.original.type === 'individual' ? t('paxlog.create_ads.type.individual') : t('paxlog.create_ads.type.team')}
        </span>
      ),
      size: 90,
    },
    {
      id: 'pax_name',
      header: t('paxlog.columns.pax_name'),
      cell: ({ row }) => <span className="text-xs font-medium truncate">{row.original.pax_display_name || '\u2014'}</span>,
      size: 160,
    },
    {
      id: 'imputation',
      header: t('paxlog.columns.imputation'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground truncate">{row.original.imputation_label || '\u2014'}</span>,
      size: 120,
    },
    {
      accessorKey: 'visit_category',
      header: t('paxlog.visit_category'),
      cell: ({ row }) => (
        <span className="gl-badge gl-badge-neutral">
          {visitCategoryLabels[row.original.visit_category] || row.original.visit_category}
        </span>
      ),
    },
    {
      id: 'dates',
      header: t('paxlog.ads_detail.fields.dates'),
      cell: ({ row }) => <span className="text-muted-foreground text-xs tabular-nums">{formatDate(row.original.start_date)} → {formatDate(row.original.end_date)}</span>,
    },
    {
      accessorKey: 'requester_name',
      header: t('paxlog.ads_detail.fields.requester'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground truncate block max-w-[120px]">{row.original.requester_name || '—'}</span>,
    },
    {
      accessorKey: 'pax_count',
      header: t('paxlog.columns.pax'),
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs"><Users size={11} className="text-muted-foreground" /> {row.original.pax_count}</span>
      ),
      size: 60,
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} labels={adsStatusLabels} badges={ADS_STATUS_BADGES} />,
      size: 110,
    },
  ], [adsStatusLabels, t, visitCategoryLabels])

  return (
    <>
      {validatorOnly && (
        <div className="px-4 py-3 border-b border-border bg-amber-500/[0.06]">
          <p className="text-xs text-muted-foreground">
            {t('paxlog.ads.validator_hint_prefix')} <span className="font-medium text-foreground">{adsStatusLabels.pending_validation || 'pending_validation'}</span>, <span className="font-medium text-foreground">{adsStatusLabels.pending_project_review || 'pending_project_review'}</span>, {t('paxlog.ads.validator_hint_middle')} <span className="font-medium text-foreground">{adsStatusLabels.pending_compliance || 'pending_compliance'}</span> {t('paxlog.ads.validator_hint_or')} <span className="font-medium text-foreground">{adsStatusLabels.requires_review || 'requires_review'}</span>.
          </p>
        </div>
      )}
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label={requesterOnly ? t('paxlog.ads.kpis.my_ads') : validatorOnly ? t('paxlog.ads.kpis.queue_ads') : t('common.total')} value={data?.total ?? 0} icon={ClipboardList} />
        <StatCard label={validatorOnly ? t('paxlog.ads.kpis.validation') : t('paxlog.ads.kpis.pending')} value={stats.pending} icon={Clock} accent="text-amber-600 dark:text-amber-400" />
        <StatCard label={validatorOnly ? t('paxlog.ads.kpis.review_gaps') : t('paxlog.ads.kpis.approved')} value={validatorOnly ? stats.review : stats.approved} icon={validatorOnly ? Shield : CheckCircle2} accent={validatorOnly ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'} />
        <StatCard label={t('paxlog.ads.kpis.total_pax')} value={stats.totalPax} icon={Users} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 gap-y-1.5 border-b border-border px-3.5 py-1.5 min-h-9 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {adsStatusOptions.map((opt) => (
            <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap', statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto shrink-0">{t('paxlog.ads.count', { count: data.total, scope: requesterOnly ? t('paxlog.ads.count_scope.requester') : validatorOnly ? t('paxlog.ads.count_scope.validator') : t('paxlog.ads.count_scope.default') })}</span>}
      </div>

      <PanelContent scroll={false}>
        <DataTable<AdsSummary>
          columns={adsColumns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder={validatorOnly ? t('paxlog.ads.search.validator') : t('paxlog.ads.search.default')}
          onRowClick={(row) => openDetail(row.id)}
          emptyIcon={ClipboardList}
          emptyTitle={validatorOnly ? t('paxlog.ads.empty.validator') : t('paxlog.ads.empty.default')}
          storageKey="paxlog-ads"
        />
      </PanelContent>
    </>
  )
}

