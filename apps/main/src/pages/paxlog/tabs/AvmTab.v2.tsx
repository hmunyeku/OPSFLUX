/**
 * AvmTab.v2.tsx — Pajamas++ refonte. Mêmes hooks/API que AvmTab.tsx :
 *   useAvmList, useDictionaryLabels('mission_type'/'pax_avm_status').
 */
import { useTranslation } from 'react-i18next'
import { useState, useMemo } from 'react'
import { usePageSize } from '@/hooks/usePageSize'
import { useDebounce } from '@/hooks/useDebounce'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useAvmList } from '@/hooks/usePaxlog'
import type { ColumnDef } from '@tanstack/react-table'
import type { MissionNoticeSummary } from '@/services/paxlogService'
import { Briefcase, Clock, CheckCircle2, Users, Plus, Download } from 'lucide-react'
import { PanelContent } from '@/components/layout/PanelHeader'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import {
  AVM_STATUS_LABELS_FALLBACK, buildStatusFilterOptions, formatDateShort,
  StatusBadge, AVM_STATUS_BADGES, CompletenessBar,
} from '../shared'
import { PaxlogPageHeader, PaxlogStatRail } from '../components/PaxlogShell'

export function AvmTabV2({ openDetail, openCreate, requesterOnly = false, validatorOnly = false }: {
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
  const [statusFilter, setStatusFilter] = useState(validatorOnly ? 'in_preparation' : '')
  const missionTypeLabels = useDictionaryLabels('mission_type')
  const avmStatusLabels = useDictionaryLabels('pax_avm_status', AVM_STATUS_LABELS_FALLBACK)
  const avmStatusOptions = useMemo(
    () => buildStatusFilterOptions(avmStatusLabels, ['draft', 'in_preparation', 'active', 'ready', 'completed', 'cancelled'], t('common.all')),
    [avmStatusLabels, t],
  )

  const { data, isLoading } = useAvmList({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    scope: requesterOnly ? 'my' : undefined,
  })
  const items = data?.items || []
  const stats = useMemo(() => {
    const inProgress = items.filter((it) => ['in_preparation', 'active'].includes(it.status)).length
    const ready = items.filter((it) => it.status === 'ready').length
    const completed = items.filter((it) => it.status === 'completed').length
    const paxPlanned = items.reduce((s, it) => s + (it.pax_quota ?? 0), 0)
    return { inProgress, ready, completed, paxPlanned }
  }, [items])

  const avmColumns = useMemo<ColumnDef<MissionNoticeSummary, unknown>[]>(() => [
    { accessorKey: 'reference', header: t('paxlog.reference'),
      cell: ({ row }) => <span className="font-medium text-foreground text-xs font-mono">{row.original.reference}</span>, size: 130 },
    { accessorKey: 'title', header: t('common.title'),
      cell: ({ row }) => <span className="text-xs text-foreground truncate max-w-[220px] block">{row.original.title}</span> },
    { id: 'creator', header: t('paxlog.avm_detail.fields.creator'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.creator_name || '—'}</span>, size: 130 },
    { id: 'dates', header: t('paxlog.avm_detail.fields.planned_dates'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{formatDateShort(row.original.planned_start_date)} → {formatDateShort(row.original.planned_end_date)}</span>, size: 180 },
    { accessorKey: 'mission_type', header: t('common.type'),
      cell: ({ row }) => <span className="chip">{missionTypeLabels[row.original.mission_type] || row.original.mission_type}</span>, size: 110 },
    { id: 'pax_count', header: t('paxlog.columns.pax'),
      cell: ({ row }) => <span className="text-xs text-foreground tabular-nums">{row.original.pax_count}</span>, size: 60 },
    { accessorKey: 'status', header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} labels={avmStatusLabels} badges={AVM_STATUS_BADGES} />, size: 120 },
    { id: 'preparation', header: t('paxlog.avm_table.preparation_percent'),
      cell: ({ row }) => <CompletenessBar value={row.original.preparation_progress} />, size: 110 },
  ], [avmStatusLabels, missionTypeLabels, t])

  return (
    <>
      <PaxlogPageHeader
        title={requesterOnly ? t('paxlog.avm.title.requester', 'Mes avis de mission')
             : validatorOnly ? t('paxlog.avm.title.validator', 'AVM à arbitrer')
             : t('paxlog.tabs.avm', 'Avis de mission')}
        count={data?.total}
        subtitle={<span><strong>{stats.inProgress}</strong> en préparation · <strong>{stats.ready}</strong> prêts · <strong>{stats.paxPlanned}</strong> pax planifiés</span>}
        actions={
          <>
            <button className="btn-sm btn-secondary"><Download size={12} /> {t('common.export')}</button>
            {openCreate && <button className="btn-sm btn-primary" onClick={openCreate}><Plus size={12} /> {t('paxlog.actions.new_avm', 'Nouvelle AVM')}</button>}
          </>
        }
      />

      <PaxlogStatRail items={[
        { id: 'all', label: t('common.total'), value: data?.total ?? 0, icon: Briefcase,
          onClick: () => { setStatusFilter(''); setPage(1) }, active: !statusFilter },
        { id: 'inProgress', label: t('paxlog.avm.kpis.in_progress'), value: stats.inProgress, icon: Clock, tone: 'warning' },
        { id: 'ready', label: t('paxlog.avm.kpis.ready'), value: stats.ready, icon: CheckCircle2, tone: 'success',
          onClick: () => { setStatusFilter(statusFilter === 'ready' ? '' : 'ready'); setPage(1) },
          active: statusFilter === 'ready' },
        { id: 'completed', label: t('paxlog.avm.kpis.completed', 'Terminées'), value: stats.completed, icon: CheckCircle2 },
        { id: 'pax', label: t('paxlog.avm.kpis.planned_pax'), value: stats.paxPlanned, icon: Users },
      ]} />

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
          filters={[{ id: 'status', label: t('common.status'), type: 'multi-select', operators: ['is', 'is_not'],
            options: avmStatusOptions.filter((o) => o.value).map((o) => ({ value: o.value, label: o.label })) }]}
          activeFilters={statusFilter ? { status: [statusFilter] } : {}}
          onFilterChange={(id, v) => {
            if (id !== 'status') return
            const arr = Array.isArray(v) ? v : v != null ? [v] : []
            setStatusFilter(arr.length > 0 ? String(arr[0]) : '')
            setPage(1)
          }}
          emptyIcon={Briefcase}
          emptyTitle={validatorOnly ? t('paxlog.avm.empty.validator') : t('paxlog.avm.empty.default')}
          onRowClick={(row) => openDetail(row.id)}
          storageKey="paxlog-avm-v2"
        />
      </PanelContent>
    </>
  )
}
