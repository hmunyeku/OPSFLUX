import { useTranslation } from 'react-i18next'
import { useState, useMemo } from 'react'
import { usePageSize } from '@/hooks/usePageSize'
import { useDictionaryOptions, useDictionaryLabels } from '@/hooks/useDictionary'
import { useEndRotationCycle, useRotationCycles } from '@/hooks/usePaxlog'
import type { RotationCycle } from '@/services/paxlogService'
import type { ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { PanelContent } from '@/components/layout/PanelHeader'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { RefreshCw } from 'lucide-react'
import { ROTATION_STATUS_LABELS_FALLBACK, formatDateShort, daysUntil, CountdownBadge, StatusBadge, ROTATION_STATUS_BADGES } from '../shared'

export function RotationsTab() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const rotationStatusOptions = useDictionaryOptions('pax_rotation_status')
  const rotationStatusLabels = useDictionaryLabels('pax_rotation_status', ROTATION_STATUS_LABELS_FALLBACK)
  const endCycle = useEndRotationCycle()

  const { data, isLoading } = useRotationCycles({
    page,
    page_size: pageSize,
    status: statusFilter || undefined,
  })

  const filtered = useMemo(() => {
    if (!data?.items || !search) return data?.items || []
    const q = search.toLowerCase()
    return data.items.filter((r: RotationCycle) =>
      (r.pax_first_name || '').toLowerCase().includes(q) ||
      (r.pax_last_name || '').toLowerCase().includes(q) ||
      (r.site_name || '').toLowerCase().includes(q) ||
      (r.company_name || '').toLowerCase().includes(q)
    )
  }, [data?.items, search])

  const rotationStatusFilterOptions = useMemo(
    () => [
      { value: '', label: t('common.all') },
      ...rotationStatusOptions.map((opt) => ({
        value: String(opt.value),
        label: rotationStatusLabels[String(opt.value)] || opt.label,
      })),
    ],
    [rotationStatusLabels, rotationStatusOptions, t],
  )

  const rotationColumns = useMemo<ColumnDef<RotationCycle, unknown>[]>(() => [
    {
      id: 'pax',
      header: t('paxlog.rotations_tab.columns.pax'),
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground text-xs">
            {row.original.pax_last_name} {row.original.pax_first_name}
          </div>
          {row.original.company_name && (
            <div className="text-[11px] text-muted-foreground truncate">{row.original.company_name}</div>
          )}
        </div>
      ),
    },
    {
      id: 'site',
      header: t('assets.site'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.site_name || '—'}</span>,
    },
    {
      id: 'cycle',
      header: t('paxlog.rotations_tab.cycle'),
      cell: ({ row }) => (
        <span className="text-xs text-foreground tabular-nums">
          {row.original.days_on}j on / {row.original.days_off}j off
        </span>
      ),
      size: 110,
    },
    {
      accessorKey: 'start_date',
      header: t('paxlog.rotations_tab.start'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{formatDateShort(row.original.start_date)}</span>,
      size: 100,
    },
    {
      id: 'next_rotation',
      header: t('paxlog.rotations_tab.next_rotation'),
      cell: ({ row }) => {
        if (!row.original.next_rotation_date) return <span className="text-muted-foreground text-xs">—</span>
        const days = daysUntil(row.original.next_rotation_date)
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground tabular-nums">{formatDateShort(row.original.next_rotation_date)}</span>
            {days >= 0 && <CountdownBadge days={days} />}
          </div>
        )
      },
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} labels={rotationStatusLabels} badges={ROTATION_STATUS_BADGES} />,
      size: 90,
    },
    {
      id: 'compliance',
      header: t('paxlog.rotations_tab.columns.compliance'),
      cell: ({ row }) => {
        const count = row.original.compliance_issue_count ?? 0
        const preview = row.original.compliance_issue_preview ?? []
        if (count === 0) {
          return <span className="text-xs text-emerald-700">{t('paxlog.rotations_tab.compliance.clear')}</span>
        }
        return (
          <div className="min-w-0">
            <span className="gl-badge gl-badge-danger text-[11px]">
              {t('paxlog.rotations_tab.compliance.blocked', { count })}
            </span>
            {preview[0] && <div className="text-[11px] text-muted-foreground truncate mt-1">{preview[0]}</div>}
          </div>
        )
      },
      size: 180,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => row.original.status === 'active' ? (
        <button
          className="gl-button-sm gl-button-default text-xs"
          onClick={(e) => { e.stopPropagation(); endCycle.mutate(row.original.id) }}
          disabled={endCycle.isPending}
        >
          {t('paxlog.rotations_tab.finish')}
        </button>
      ) : null,
      size: 80,
    },
  ], [endCycle, rotationStatusLabels, t])

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 gap-y-1.5 border-b border-border px-3.5 py-1.5 sm:h-9 sm:py-0 sm:flex-nowrap shrink-0">
        <div className="flex items-center gap-1">
          {rotationStatusFilterOptions.map((opt) => (
            <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap', statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto">{t('paxlog.rotations_tab.count', { count: data.total })}</span>}
      </div>

      <PanelContent scroll={false}>
        <DataTable<RotationCycle>
          columns={rotationColumns}
          data={filtered}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder={t('paxlog.search_rotation')}
          emptyIcon={RefreshCw}
          emptyTitle={t('paxlog.no_rotation')}
          storageKey="paxlog-rotations"
        />
      </PanelContent>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// DYNAMIC PANELS
// ═══════════════════════════════════════════════════════════════

// ── Create PAX Profile Panel ──────────────────────────────────

