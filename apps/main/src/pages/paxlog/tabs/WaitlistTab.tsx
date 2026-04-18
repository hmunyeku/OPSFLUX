import { useTranslation } from 'react-i18next'
import { useState, useCallback, useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { usePageSize } from '@/hooks/usePageSize'
import { useDebounce } from '@/hooks/useDebounce'
import { useDecideAdsPax, useUpdateAdsWaitlistPriority, useAdsWaitlist } from '@/hooks/usePaxlog'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useToast } from '@/components/ui/Toast'
import { ThumbsUp, ThumbsDown, Clock, Shield } from 'lucide-react'
import { PanelContent } from '@/components/layout/PanelHeader'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { AdsWaitlistItem } from '@/services/paxlogService'
import { ADS_STATUS_LABELS_FALLBACK, formatDateTime, StatusBadge, ADS_STATUS_BADGES, StatCard } from '../shared'

export function WaitlistTab({ openDetail }: { openDetail: (id: string) => void }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [editingPriorityId, setEditingPriorityId] = useState<string | null>(null)
  const [editingPriorityValue, setEditingPriorityValue] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const decideAdsPax = useDecideAdsPax()
  const updateWaitlistPriority = useUpdateAdsWaitlistPriority()
  const adsStatusLabels = useDictionaryLabels('pax_ads_status', ADS_STATUS_LABELS_FALLBACK)
  const { toast } = useToast()

  const { data, isLoading } = useAdsWaitlist({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
  })

  const items = data?.items ?? []
  const waitlistedCount = items.length
  const highestPriority = items[0]?.priority_score ?? 0

  const getPrioritySourceLabel = useCallback((source: string | null) => {
    if (!source) return '—'
    if (source === 'auto_computed' || source === 'manual_override') {
      return t(`paxlog.waitlist.sources.${source}`)
    }
    return source
  }, [t])

  const getCapacityScopeLabel = useCallback((scope: string | null) => {
    if (!scope) return '—'
    if (scope === 'planner_activity' || scope === 'site') {
      return t(`paxlog.waitlist.capacity.scope.${scope}`)
    }
    return scope
  }, [t])

  const handleDecision = (row: AdsWaitlistItem, action: 'approve' | 'reject') => {
    decideAdsPax.mutate(
      {
        adsId: row.ads_id,
        entryId: row.ads_pax_id,
        payload: {
          action,
          reason: action === 'approve'
            ? t('paxlog.waitlist.actions.approve_reason')
            : t('paxlog.waitlist.actions.reject_reason'),
        },
      },
      {
        onSuccess: () => {
          toast({
            title: action === 'approve'
              ? t('paxlog.waitlist.toasts.approved')
              : t('paxlog.waitlist.toasts.rejected'),
            variant: 'success',
          })
        },
      },
    )
  }

  const startPriorityEdit = useCallback((row: AdsWaitlistItem) => {
    setEditingPriorityId(row.ads_pax_id)
    setEditingPriorityValue(String(row.priority_score ?? 0))
  }, [])

  const cancelPriorityEdit = useCallback(() => {
    setEditingPriorityId(null)
    setEditingPriorityValue('')
  }, [])

  const savePriorityEdit = useCallback((row: AdsWaitlistItem) => {
    const nextValue = Number.parseInt(editingPriorityValue, 10)
    if (!Number.isFinite(nextValue) || nextValue < 0) {
      toast({
        title: t('paxlog.waitlist.validation.invalid_priority'),
        variant: 'error',
      })
      return
    }
    updateWaitlistPriority.mutate(
      {
        entryId: row.ads_pax_id,
        payload: {
          priority_score: nextValue,
          reason: t('paxlog.waitlist.actions.priority_reason'),
        },
      },
      {
        onSuccess: () => {
          toast({
            title: t('paxlog.waitlist.toasts.priority_updated'),
            variant: 'success',
          })
          cancelPriorityEdit()
        },
      },
    )
  }, [cancelPriorityEdit, editingPriorityValue, t, toast, updateWaitlistPriority])

  const waitlistColumns = useMemo<ColumnDef<AdsWaitlistItem, unknown>[]>(() => [
    {
      accessorKey: 'ads_reference',
      header: t('paxlog.waitlist.columns.ads'),
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-medium text-foreground font-mono text-xs">{row.original.ads_reference}</span>
          {row.original.planner_activity_title && (
            <span className="text-[10px] text-muted-foreground block truncate">{row.original.planner_activity_title}</span>
          )}
          <span className="text-[10px] text-muted-foreground block truncate">
            {t('paxlog.waitlist.capacity.summary', {
              scope: getCapacityScopeLabel(row.original.capacity_scope),
              remaining: row.original.remaining_capacity ?? '—',
              limit: row.original.capacity_limit ?? '—',
            })}
          </span>
        </div>
      ),
    },
    {
      id: 'pax',
      header: t('paxlog.waitlist.columns.pax'),
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-medium text-foreground text-xs block truncate">
            {`${row.original.pax_last_name} ${row.original.pax_first_name}`.trim()}
          </span>
          <span className="text-[10px] text-muted-foreground block truncate">{row.original.pax_company_name || '—'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'priority_score',
      header: t('paxlog.waitlist.columns.priority'),
      cell: ({ row }) => (
        <div className="text-xs min-w-[180px]">
          {editingPriorityId === row.original.ads_pax_id ? (
            <div className="flex flex-col gap-1">
              <input
                type="number"
                min={0}
                step={1}
                value={editingPriorityValue}
                onChange={(e) => setEditingPriorityValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="h-8 rounded border border-border bg-background px-2 text-xs tabular-nums"
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); savePriorityEdit(row.original) }}
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-accent"
                >
                  {t('common.save')}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); cancelPriorityEdit() }}
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-accent"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium tabular-nums">{row.original.priority_score}</div>
                <div className="text-[10px] text-muted-foreground">{getPrioritySourceLabel(row.original.priority_source)}</div>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); startPriorityEdit(row.original) }}
                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-accent"
              >
                {t('paxlog.waitlist.actions.edit_priority')}
              </button>
            </div>
          )}
        </div>
      ),
      size: 210,
    },
    {
      accessorKey: 'submitted_at',
      header: t('paxlog.waitlist.columns.submitted_at'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateTime(row.original.submitted_at)}</span>,
    },
    {
      accessorKey: 'ads_status',
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.ads_status} labels={adsStatusLabels} badges={ADS_STATUS_BADGES} />,
      size: 120,
    },
    {
      id: 'actions',
      header: t('common.actions'),
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleDecision(row.original, 'approve') }}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-accent"
          >
            <ThumbsUp size={11} />
            {t('common.approve')}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleDecision(row.original, 'reject') }}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-accent"
          >
            <ThumbsDown size={11} />
            {t('common.reject')}
          </button>
        </div>
      ),
      size: 180,
    },
  ], [adsStatusLabels, cancelPriorityEdit, decideAdsPax, editingPriorityId, editingPriorityValue, getCapacityScopeLabel, getPrioritySourceLabel, savePriorityEdit, startPriorityEdit, t])

  return (
    <>
      <div className="grid grid-cols-2 gap-3 px-4 py-3 border-b border-border">
        <StatCard label={t('paxlog.waitlist.kpis.items')} value={data?.total ?? 0} icon={Clock} />
        <StatCard label={t('paxlog.waitlist.kpis.priority_peak')} value={highestPriority} icon={Shield} accent="text-amber-600 dark:text-amber-400" />
      </div>
      <div className="px-4 py-3 border-b border-border bg-amber-500/[0.06]">
        <p className="text-xs text-muted-foreground">
          {t('paxlog.waitlist.hint', { count: waitlistedCount })}
        </p>
      </div>
      <PanelContent scroll={false}>
        <DataTable<AdsWaitlistItem>
          columns={waitlistColumns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder={t('paxlog.waitlist.search')}
          onRowClick={(row) => openDetail(row.ads_id)}
          emptyIcon={Clock}
          emptyTitle={t('paxlog.waitlist.empty')}
          storageKey="paxlog-waitlist"
        />
      </PanelContent>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 3: PROFILS PAX
// ═══════════════════════════════════════════════════════════════

