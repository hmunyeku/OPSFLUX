import { useTranslation } from 'react-i18next'
import { useState, useMemo } from 'react'
import { usePageSize } from '@/hooks/usePageSize'
import { useDictionaryOptions, useDictionaryLabels } from '@/hooks/useDictionary'
import { useEndRotationCycle, useRotationCycles } from '@/hooks/usePaxlog'
import type { RotationCycle } from '@/services/paxlogService'
import type { ColumnDef } from '@tanstack/react-table'
import { PanelContent } from '@/components/layout/PanelHeader'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { RefreshCw, Activity, AlertTriangle, CalendarClock, Users, BarChart3, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROTATION_STATUS_LABELS_FALLBACK, formatDateShort, daysUntil, CountdownBadge, StatusBadge, ROTATION_STATUS_BADGES, StatCard } from '../shared'

export function RotationsTab() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showStats, setShowStats] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth >= 768,
  )
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

  // Stats: active cycles, dues within 7 days, blocked compliance,
  // total PAX in rotation. Computed from the visible page — when
  // pagination is active these are sample-level (cheap, no extra
  // API call); the user can step into the dashboard for global stats.
  const stats = useMemo(() => {
    const items = data?.items || []
    const active = items.filter((r) => r.status === 'active').length
    const dueSoon = items.filter((r) => {
      if (!r.next_rotation_date || r.status !== 'active') return false
      const days = daysUntil(r.next_rotation_date)
      return days >= 0 && days <= 7
    }).length
    const blocked = items.filter((r) => (r.compliance_issue_count ?? 0) > 0).length
    const totalPax = items.length
    return { active, dueSoon, blocked, totalPax }
  }, [data?.items])

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
      {/* Stats strip — same pattern as ActivitiesTab / AdsTab. */}
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
              label={t('paxlog.rotations_kpis.active', 'Actifs')}
              value={stats.active}
              icon={Activity}
              accent="text-emerald-600 dark:text-emerald-400"
              onClick={() => { setStatusFilter(statusFilter === 'active' ? '' : 'active'); setPage(1) }}
              active={statusFilter === 'active'}
            />
            <StatCard
              label={t('paxlog.rotations_kpis.due_soon', 'À venir 7j')}
              value={stats.dueSoon}
              icon={CalendarClock}
              accent="text-amber-600 dark:text-amber-400"
            />
            <StatCard
              label={t('paxlog.rotations_kpis.blocked', 'Conformité bloquée')}
              value={stats.blocked}
              icon={AlertTriangle}
              accent="text-destructive"
            />
            <StatCard
              label={t('paxlog.rotations_kpis.total', 'Total PAX')}
              value={stats.totalPax}
              icon={Users}
            />
          </div>
        </div>
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
          filters={[{
            id: 'status',
            label: t('common.status'),
            type: 'multi-select',
            operators: ['is', 'is_not'],
            options: rotationStatusFilterOptions.filter(o => o.value).map(o => ({ value: o.value, label: o.label })),
          }]}
          activeFilters={statusFilter ? { status: [statusFilter] } : {}}
          onFilterChange={(id, v) => {
            if (id !== 'status') return
            const arr = Array.isArray(v) ? v : v != null ? [v] : []
            setStatusFilter(arr.length > 0 ? String(arr[0]) : '')
            setPage(1)
          }}
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

