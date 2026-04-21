import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Users, Loader2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelContent } from '@/components/layout/PanelHeader'
import { useUIStore } from '@/stores/uiStore'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useAllManifests, useValidateManifest } from '@/hooks/useTravelWiz'
import {
  MANIFEST_STATUS_LABELS_FALLBACK, MANIFEST_STATUS_BADGES,
  buildStatusOptions, type AnyRow,
} from '../shared'
import { StatusBadge, StatCard } from '../components'

export function ManifestesTab() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')
  const [pendingValidateId, setPendingValidateId] = useState<string | null>(null)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const validateManifest = useValidateManifest()
  const manifestStatusLabels = useDictionaryLabels('travelwiz_manifest_status', MANIFEST_STATUS_LABELS_FALLBACK)
  const manifestStatusOptions = useMemo(
    () => buildStatusOptions(manifestStatusLabels, ['draft', 'pending_validation', 'validated', 'requires_review', 'closed']),
    [manifestStatusLabels],
  )

  const { data, isLoading } = useAllManifests({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
  })

  const items: AnyRow[] = data?.items ?? []
  const total = data?.total ?? 0

  const stats = useMemo(() => {
    const draft = items.filter((m: AnyRow) => m.status === 'draft').length
    const validated = items.filter((m: AnyRow) => m.status === 'validated').length
    const totalPax = items.reduce((sum: number, m: AnyRow) => sum + (m.passenger_count ?? 0), 0)
    return { draft, validated, totalPax, count: items.length }
  }, [items])

  const columns = useMemo<ColumnDef<AnyRow, unknown>[]>(() => [
    {
      accessorKey: 'reference',
      header: t('travelwiz.columns.reference'),
      size: 120,
      cell: ({ row }) => <span className="font-medium font-mono text-xs text-foreground">{row.original.reference || row.original.manifest_type || 'MAN'}</span>,
    },
    {
      accessorKey: 'voyage_code',
      header: t('travelwiz.columns.voyage'),
      size: 110,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.voyage_code || '—'}</span>,
    },
    {
      accessorKey: 'status',
      header: t('travelwiz.columns.status'),
      size: 120,
      cell: ({ row }) => <StatusBadge status={row.original.status} labels={manifestStatusLabels} badges={MANIFEST_STATUS_BADGES} />,
    },
    {
      accessorKey: 'passenger_count',
      header: t('travelwiz.columns.pax_confirmed'),
      size: 100,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs">
          <Users size={11} className="text-muted-foreground" />
          {row.original.passenger_count ?? 0}
        </span>
      ),
    },
    {
      id: 'total_weight',
      header: t('travelwiz.columns.total_weight'),
      size: 100,
      cell: ({ row }) => {
        const w = row.original.total_weight_kg
        return (
          <span className="text-xs text-muted-foreground tabular-nums">
            {w ? `${Number(w).toLocaleString('fr-FR')} kg` : '—'}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      size: 80,
      cell: ({ row }) => {
        if (row.original.status === 'validated' || row.original.status === 'closed') return null
        const isThisRowPending = pendingValidateId === row.original.id
        return (
          <button
            className="gl-button-sm gl-button-default text-xs"
            onClick={(e) => {
              e.stopPropagation()
              setPendingValidateId(row.original.id)
              validateManifest.mutate(
                { voyageId: row.original.voyage_id, manifestId: row.original.id },
                { onSettled: () => setPendingValidateId(null) },
              )
            }}
            disabled={isThisRowPending}
          >
            {isThisRowPending ? <Loader2 size={10} className="animate-spin mr-1" /> : <CheckCircle2 size={10} className="mr-1" />}
            {t('travelwiz.actions.validate')}
          </button>
        )
      },
    },
  ], [manifestStatusLabels, validateManifest, pendingValidateId, t])

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label={t('travelwiz.stats.manifests')} value={stats.count} icon={FileText} />
        <StatCard label={t('travelwiz.stats.drafts')} value={stats.draft} icon={FileText} />
        <StatCard label={t('travelwiz.stats.validated')} value={stats.validated} icon={CheckCircle2} />
        <StatCard label={t('travelwiz.stats.pax_total')} value={stats.totalPax} icon={Users} />
      </div>

      <div className="flex flex-wrap items-center gap-2 gap-y-1.5 border-b border-border px-3.5 py-1.5 min-h-9 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {manifestStatusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap',
                statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto shrink-0">{total} manifestes</span>}
      </div>

      <PanelContent scroll={false}>
        <DataTable<AnyRow>
          columns={columns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Rechercher par référence, voyage..."
          onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'travelwiz', id: row.original.voyage_id, meta: { subtype: 'voyage' } })}
          emptyIcon={FileText}
          emptyTitle="Aucun manifeste"
          storageKey="travelwiz-manifests"
        />
      </PanelContent>
    </>
  )
}
