import { useTranslation } from 'react-i18next'
import { useState, useMemo } from 'react'
import { usePageSize } from '@/hooks/usePageSize'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { useResolvePaxIncident, usePaxIncidents } from '@/hooks/usePaxlog'
import type { PaxIncident } from '@/services/paxlogService'
import type { ColumnDef } from '@tanstack/react-table'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PanelContent } from '@/components/layout/PanelHeader'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { SeverityBadge, formatDate } from '../shared'

export function SignalementsTab() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [severityFilter, setSeverityFilter] = useState('')
  const severityOptions = useDictionaryOptions('pax_incident_severity')
  const resolveIncident = useResolvePaxIncident()

  const { data, isLoading } = usePaxIncidents({
    page,
    page_size: pageSize,
    active_only: activeOnly,
    severity: severityFilter || undefined,
  })

  const filtered = useMemo(() => {
    if (!data?.items || !search) return data?.items || []
    const q = search.toLowerCase()
    return data.items.filter((i: PaxIncident) =>
      i.description.toLowerCase().includes(q) ||
      (i.pax_first_name || '').toLowerCase().includes(q) ||
      (i.pax_last_name || '').toLowerCase().includes(q)
    )
  }, [data?.items, search])

  const incidentColumns = useMemo<ColumnDef<PaxIncident, unknown>[]>(() => [
    {
      id: 'pax',
      header: t('paxlog.columns.pax'),
      cell: ({ row }) => {
        const pax = row.original
        if (pax.pax_first_name || pax.pax_last_name) {
          return <span className="text-xs font-medium text-foreground">{pax.pax_last_name} {pax.pax_first_name}</span>
        }
        if (pax.group_name) {
          return <span className="text-xs font-medium text-foreground">{pax.group_name}</span>
        }
        if (pax.company_name) {
          return <span className="text-xs font-medium text-foreground">{pax.company_name}</span>
        }
        return <span className="text-xs text-muted-foreground">—</span>
      },
    },
    {
      id: 'asset',
      header: t('assets.title'),
      cell: ({ row }) => row.original.asset_id
        ? <CrossModuleLink module="assets" id={row.original.asset_id} label={row.original.asset_name || row.original.asset_id} showIcon={false} className="text-xs" />
        : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'severity',
      header: t('paxlog.severity'),
      cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
      size: 120,
    },
    {
      accessorKey: 'incident_date',
      header: t('common.date'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">{formatDate(row.original.incident_date)}</span>,
      size: 100,
    },
    {
      accessorKey: 'description',
      header: t('common.description'),
      cell: ({ row }) => <span className="text-foreground max-w-[250px] truncate block text-xs">{row.original.description}</span>,
    },
    {
      id: 'resolved',
      header: t('common.status'),
      cell: ({ row }) => row.original.resolved_at
        ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 size={12} /> {t('paxlog.signalements.status.resolved')}</span>
        : <span className="inline-flex items-center gap-1 text-xs text-amber-500"><Clock size={12} /> {t('paxlog.signalements.status.active')}</span>,
      size: 80,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => !row.original.resolved_at ? (
        <button
          className="gl-button-sm gl-button-default text-xs"
          onClick={(e) => { e.stopPropagation(); resolveIncident.mutate({ id: row.original.id, payload: {} }) }}
          disabled={resolveIncident.isPending}
        >
          {t('paxlog.resolve')}
        </button>
      ) : null,
      size: 80,
    },
  ], [resolveIncident])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <button onClick={() => setActiveOnly(!activeOnly)}
          className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors', activeOnly ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          {t('paxlog.signalements.active_only')}
        </button>
        <span className="mx-1 h-3 w-px bg-border" />
        {severityOptions.map((opt) => (
          <button key={opt.value} onClick={() => { setSeverityFilter(severityFilter === opt.value ? '' : opt.value); setPage(1) }}
            className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap', severityFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {opt.label}
          </button>
        ))}
        {data && <span className="text-xs text-muted-foreground ml-auto">{t('paxlog.signalements.count', { count: data.total })}</span>}
      </div>

      <PanelContent scroll={false}>
        <DataTable<PaxIncident>
          columns={incidentColumns}
          data={filtered}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder={t('paxlog.search_incident')}
          emptyIcon={AlertTriangle}
          emptyTitle={t('paxlog.no_incident')}
          storageKey="paxlog-signalements"
        />
      </PanelContent>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 6: ROTATIONS
// ═══════════════════════════════════════════════════════════════

