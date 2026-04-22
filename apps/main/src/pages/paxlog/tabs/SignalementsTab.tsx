import { useTranslation } from 'react-i18next'
import { useState, useMemo } from 'react'
import { usePageSize } from '@/hooks/usePageSize'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { useResolvePaxIncident, usePaxIncidents } from '@/hooks/usePaxlog'
import type { PaxIncident } from '@/services/paxlogService'
import type { ColumnDef } from '@tanstack/react-table'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
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
      {/* Active-only + severity filters moved into the DataTable visual-search toolbar. */}

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
          filters={[
            {
              id: 'severity',
              label: t('paxlog.signalements.severity') !== 'paxlog.signalements.severity' ? t('paxlog.signalements.severity') : 'Gravité',
              type: 'multi-select',
              operators: ['is', 'is_not'],
              options: severityOptions.filter(o => o.value).map(o => ({ value: o.value, label: o.label })),
            },
            {
              id: 'active_only',
              label: t('paxlog.signalements.active_only'),
              type: 'boolean',
              operators: ['is'],
            },
          ]}
          activeFilters={{
            ...(severityFilter ? { severity: [severityFilter] } : {}),
            ...(activeOnly ? { active_only: true } : {}),
          }}
          onFilterChange={(id, v) => {
            if (id === 'severity') {
              const arr = Array.isArray(v) ? v : v != null ? [v] : []
              setSeverityFilter(arr.length > 0 ? String(arr[0]) : '')
              setPage(1)
            } else if (id === 'active_only') {
              setActiveOnly(v === true)
            }
          }}
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

