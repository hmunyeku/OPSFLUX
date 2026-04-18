import { useTranslation } from 'react-i18next'
import { useState, useMemo } from 'react'
import { usePageSize } from '@/hooks/usePageSize'
import { useDebounce } from '@/hooks/useDebounce'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useAvmList } from '@/hooks/usePaxlog'
import type { ColumnDef } from '@tanstack/react-table'
import type { MissionNoticeSummary } from '@/services/paxlogService'
import { Briefcase, Clock, CheckCircle2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PanelContent } from '@/components/layout/PanelHeader'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { AVM_STATUS_LABELS_FALLBACK, buildStatusFilterOptions, formatDateShort, StatusBadge, AVM_STATUS_BADGES, CompletenessBar, StatCard } from '../shared'

export function AvmTab({ openDetail, requesterOnly = false, validatorOnly = false }: { openDetail: (id: string) => void; requesterOnly?: boolean; validatorOnly?: boolean }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState(validatorOnly ? 'in_preparation' : '')
  const missionTypeLabels = useDictionaryLabels('mission_type')
  const avmStatusLabels = useDictionaryLabels('pax_avm_status', AVM_STATUS_LABELS_FALLBACK)
  const avmStatusOptions = useMemo(
    () => buildStatusFilterOptions(avmStatusLabels, ['draft', 'in_preparation', 'active', 'ready', 'completed', 'cancelled'], t('common.all')),
    [avmStatusLabels, t],
  )

  const { data, isLoading } = useAvmList({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    scope: requesterOnly ? 'my' : undefined,
  })
  const items = data?.items || []
  const avmStats = useMemo(() => {
    const toArbitrate = items.filter((item) => ['in_preparation', 'active', 'ready'].includes(item.status)).length
    const ready = items.filter((item) => item.status === 'ready').length
    const paxPlanned = items.reduce((sum, item) => sum + (item.pax_quota ?? 0), 0)
    return { toArbitrate, ready, paxPlanned }
  }, [items])

  const avmColumns = useMemo<ColumnDef<MissionNoticeSummary, unknown>[]>(() => [
    {
      accessorKey: 'reference',
      header: t('paxlog.reference'),
      cell: ({ row }) => (
        <button className="font-medium text-primary hover:underline text-xs" onClick={() => openDetail(row.original.id)}>
          {row.original.reference}
        </button>
      ),
      size: 140,
    },
    {
      accessorKey: 'title',
      header: t('common.title'),
      cell: ({ row }) => <span className="text-xs text-foreground truncate max-w-[200px] block">{row.original.title}</span>,
    },
    {
      id: 'creator',
      header: t('paxlog.avm_detail.fields.creator'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.creator_name || '—'}</span>,
      size: 130,
    },
    {
      id: 'dates',
      header: t('paxlog.avm_detail.fields.planned_dates'),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDateShort(row.original.planned_start_date)} {'—'} {formatDateShort(row.original.planned_end_date)}
        </span>
      ),
      size: 180,
    },
    {
      accessorKey: 'mission_type',
      header: t('common.type'),
      cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{missionTypeLabels[row.original.mission_type] || row.original.mission_type}</span>,
      size: 110,
    },
    {
      id: 'pax_count',
      header: t('paxlog.columns.pax'),
      cell: ({ row }) => <span className="text-xs text-foreground tabular-nums">{row.original.pax_count}</span>,
      size: 60,
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} labels={avmStatusLabels} badges={AVM_STATUS_BADGES} />,
      size: 120,
    },
    {
      id: 'preparation',
      header: t('paxlog.avm_table.preparation_percent'),
      cell: ({ row }) => <CompletenessBar value={row.original.preparation_progress} />,
      size: 110,
    },
  ], [avmStatusLabels, missionTypeLabels, openDetail, t])

  return (
    <>
      {validatorOnly && (
        <div className="px-4 py-3 border-b border-border bg-emerald-500/[0.06]">
          <p className="text-xs text-muted-foreground">
            {t('paxlog.avm.validator_hint_prefix')} <span className="font-medium text-foreground">in_preparation</span>, {t('paxlog.avm.validator_hint_middle')} <span className="font-medium text-foreground">ready</span> {t('paxlog.avm.validator_hint_suffix')}
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label={requesterOnly ? t('paxlog.avm.kpis.my_avm') : validatorOnly ? t('paxlog.avm.kpis.queue_avm') : t('common.total')} value={data?.total ?? 0} icon={Briefcase} />
        <StatCard label={validatorOnly ? t('paxlog.avm.kpis.to_arbitrate') : t('paxlog.avm.kpis.in_progress')} value={avmStats.toArbitrate} icon={Clock} accent="text-amber-600 dark:text-amber-400" />
        <StatCard label={t('paxlog.avm.kpis.ready')} value={avmStats.ready} icon={CheckCircle2} accent="text-emerald-600 dark:text-emerald-400" />
        <StatCard label={t('paxlog.avm.kpis.planned_pax')} value={avmStats.paxPlanned} icon={Users} />
      </div>
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1">
          {avmStatusOptions.map((opt) => (
            <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap', statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto">{t('paxlog.avm.count', { count: data.total, scope: requesterOnly ? t('paxlog.avm.count_scope.requester') : validatorOnly ? t('paxlog.avm.count_scope.validator') : t('paxlog.avm.count_scope.default') })}</span>}
      </div>

      <PanelContent scroll={false}>
        <DataTable<MissionNoticeSummary>
          columns={avmColumns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder={validatorOnly ? t('paxlog.avm.search.validator') : t('paxlog.avm.search.default')}
          emptyIcon={Briefcase}
          emptyTitle={validatorOnly ? t('paxlog.avm.empty.validator') : t('paxlog.avm.empty.default')}
          onRowClick={(row) => openDetail(row.id)}
          storageKey="paxlog-avm"
        />
      </PanelContent>
    </>
  )
}


// ── Create AVM Panel ─────────────────────────────────────────

