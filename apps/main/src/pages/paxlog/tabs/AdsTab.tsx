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
import { Users, ClipboardList, Clock, Shield, CheckCircle2, BarChart3, ChevronDown, ChevronUp } from 'lucide-react'
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
  // Mobile-only stats collapse (mirrors ActivitiesTab — saves space
  // on phones where the strip would push the table off-screen).
  const [showStats, setShowStats] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth >= 768,
  )
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

  // 8-week sparklines bucketed by ADS start_date — gives the user a
  // sense of trend on each KPI without an extra API call. Empty arrays
  // when items haven't loaded; the StatCard auto-hides the spark when
  // every value is zero.
  const sparklines = useMemo(() => {
    const WEEKS = 8
    const totalArr = new Array(WEEKS).fill(0) as number[]
    const pendingArr = new Array(WEEKS).fill(0) as number[]
    const approvedArr = new Array(WEEKS).fill(0) as number[]
    const paxArr = new Array(WEEKS).fill(0) as number[]
    const now = Date.now()
    const weekMs = 7 * 86_400_000
    for (const a of items) {
      const ref = a.start_date ? new Date(a.start_date).getTime() : (a.created_at ? new Date(a.created_at).getTime() : null)
      if (ref == null) continue
      const idx = WEEKS - 1 - Math.min(WEEKS - 1, Math.max(0, Math.floor((now - ref) / weekMs)))
      totalArr[idx]++
      if (['submitted', 'pending_project_review', 'pending_compliance', 'pending_validation'].includes(a.status)) pendingArr[idx]++
      if (a.status === 'approved') approvedArr[idx]++
      paxArr[idx] += a.pax_count ?? 0
    }
    return { total: totalArr, pending: pendingArr, approved: approvedArr, pax: paxArr }
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
      {/* Stats strip — mirrors ActivitiesTab pattern:
          mobile collapsible toggle + horizontal scroll-snap strip
          below md, 4-column grid above md, sparklines that hide on
          narrow @container/kpi widths. Cards drive the status
          filter where applicable. */}
      <div className="border-b border-border">
        <button
          type="button"
          onClick={() => setShowStats((v) => !v)}
          className="md:hidden w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/5 transition-colors"
        >
          <span className="flex items-center gap-2">
            <BarChart3 size={14} className="text-muted-foreground" />
            {t('paxlog.stats.label', 'Statistiques')}
          </span>
          {showStats ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <div
          className={cn(
            '@container/stats',
            showStats ? 'block' : 'hidden md:block',
          )}
        >
          <div className="flex gap-2 overflow-x-auto px-4 py-3 snap-x snap-mandatory @md/stats:grid @md/stats:grid-cols-4 @md/stats:gap-3 @md/stats:overflow-visible @md/stats:snap-none">
            <StatCard
              label={requesterOnly ? t('paxlog.ads.kpis.my_ads') : validatorOnly ? t('paxlog.ads.kpis.queue_ads') : t('common.total')}
              value={data?.total ?? 0}
              icon={ClipboardList}
              sparkline={sparklines.total}
              onClick={() => { setStatusFilter(''); setPage(1) }}
              active={!statusFilter}
            />
            <StatCard
              label={validatorOnly ? t('paxlog.ads.kpis.validation') : t('paxlog.ads.kpis.pending')}
              value={stats.pending}
              icon={Clock}
              accent="text-amber-600 dark:text-amber-400"
              sparkline={sparklines.pending}
              onClick={() => {
                const next = statusFilter === 'pending_validation' ? '' : 'pending_validation'
                setStatusFilter(next); setPage(1)
              }}
              active={statusFilter === 'pending_validation'}
            />
            <StatCard
              label={validatorOnly ? t('paxlog.ads.kpis.review_gaps') : t('paxlog.ads.kpis.approved')}
              value={validatorOnly ? stats.review : stats.approved}
              icon={validatorOnly ? Shield : CheckCircle2}
              accent={validatorOnly ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}
              sparkline={sparklines.approved}
              onClick={validatorOnly ? undefined : () => {
                const next = statusFilter === 'approved' ? '' : 'approved'
                setStatusFilter(next); setPage(1)
              }}
              active={!validatorOnly && statusFilter === 'approved'}
            />
            <StatCard
              label={t('paxlog.ads.kpis.total_pax')}
              value={stats.totalPax}
              icon={Users}
              sparkline={sparklines.pax}
            />
          </div>
        </div>
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
          filters={[{
            id: 'status',
            label: t('common.status'),
            type: 'multi-select',
            operators: ['is', 'is_not'],
            options: adsStatusOptions.filter(o => o.value).map(o => ({ value: o.value, label: o.label })),
          }]}
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

