/**
 * SignalementsTab.v2.tsx — Pajamas++ refonte. Mêmes hooks que SignalementsTab.tsx :
 *   usePaxIncidents, useResolvePaxIncident, useDictionaryOptions('pax_incident_severity').
 */
import { useTranslation } from 'react-i18next'
import { useState, useMemo } from 'react'
import { usePageSize } from '@/hooks/usePageSize'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { useResolvePaxIncident, usePaxIncidents } from '@/hooks/usePaxlog'
import type { PaxIncident } from '@/services/paxlogService'
import type { ColumnDef } from '@tanstack/react-table'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { CheckCircle2, Clock, AlertTriangle, ShieldAlert, Plus } from 'lucide-react'
import { PanelContent } from '@/components/layout/PanelHeader'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { SeverityBadge, formatDate } from '../shared'
import { PaxlogPageHeader, PaxlogStatRail } from '../components/PaxlogShell'

export function SignalementsTabV2({ openCreate }: { openCreate?: () => void }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [severityFilter, setSeverityFilter] = useState('')
  const severityOptions = useDictionaryOptions('pax_incident_severity')
  const resolveIncident = useResolvePaxIncident()

  const { data, isLoading } = usePaxIncidents({
    page, page_size: pageSize,
    active_only: activeOnly, severity: severityFilter || undefined,
  })

  const items = data?.items ?? []
  const filtered = useMemo(() => {
    if (!items || !search) return items
    const q = search.toLowerCase()
    return items.filter((i: PaxIncident) =>
      i.description.toLowerCase().includes(q) ||
      (i.pax_first_name || '').toLowerCase().includes(q) ||
      (i.pax_last_name || '').toLowerCase().includes(q),
    )
  }, [items, search])

  const stats = useMemo(() => {
    const active = items.filter((i) => !i.resolved_at).length
    const bans = items.filter((i) => ['site_ban', 'temp_ban', 'permanent_ban'].includes(i.severity)).length
    const warnings = items.filter((i) => i.severity === 'warning').length
    const resolved = items.filter((i) => !!i.resolved_at).length
    return { total: items.length, active, bans, warnings, resolved }
  }, [items])

  const incidentColumns = useMemo<ColumnDef<PaxIncident, unknown>[]>(() => [
    { id: 'pax', header: t('paxlog.columns.pax'),
      cell: ({ row }) => {
        const p = row.original
        const label = p.pax_first_name || p.pax_last_name
          ? `${p.pax_last_name} ${p.pax_first_name}`
          : p.group_name || p.company_name || '—'
        return <span className="text-xs font-medium text-foreground">{label}</span>
      } },
    { id: 'asset', header: t('assets.title'),
      cell: ({ row }) => row.original.asset_id
        ? <CrossModuleLink module="assets" id={row.original.asset_id} label={row.original.asset_name || row.original.asset_id} showIcon={false} className="text-xs" />
        : <span className="text-xs text-muted-foreground">—</span> },
    { accessorKey: 'severity', header: t('paxlog.severity'),
      cell: ({ row }) => <SeverityBadge severity={row.original.severity} />, size: 120 },
    { accessorKey: 'incident_date', header: t('common.date'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">{formatDate(row.original.incident_date)}</span>, size: 100 },
    { accessorKey: 'description', header: t('common.description'),
      cell: ({ row }) => <span className="text-foreground max-w-[250px] truncate block text-xs">{row.original.description}</span> },
    { id: 'resolved', header: t('common.status'),
      cell: ({ row }) => row.original.resolved_at
        ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 size={12} /> {t('paxlog.signalements.status.resolved')}</span>
        : <span className="inline-flex items-center gap-1 text-xs text-amber-500"><Clock size={12} /> {t('paxlog.signalements.status.active')}</span>, size: 90 },
    { id: 'actions', header: '',
      cell: ({ row }) => !row.original.resolved_at && (
        <button className="btn-xs btn-secondary"
          onClick={(e) => { e.stopPropagation(); resolveIncident.mutate({ id: row.original.id, payload: {} }) }}
          disabled={resolveIncident.isPending}>
          {t('paxlog.resolve')}
        </button>
      ), size: 90 },
  ], [resolveIncident, t])

  return (
    <>
      <PaxlogPageHeader
        title={t('paxlog.tabs.signalements', 'Signalements')}
        count={stats.total}
        subtitle={<span><strong>{stats.active}</strong> actifs · <strong>{stats.bans}</strong> sanctions en cours</span>}
        actions={openCreate && (
          <button className="btn-sm btn-primary" onClick={openCreate}><Plus size={12} /> {t('paxlog.actions.new_incident', 'Nouveau signalement')}</button>
        )}
      />

      <PaxlogStatRail items={[
        { id: 'all', label: t('common.total'), value: stats.total, icon: AlertTriangle },
        { id: 'active', label: t('paxlog.signalements.kpi.active', 'Actifs'), value: stats.active, icon: Clock,
          tone: stats.active > 0 ? 'warning' : undefined,
          onClick: () => setActiveOnly(true), active: activeOnly },
        { id: 'bans', label: t('paxlog.signalements.kpi.bans', 'Sanctions'), value: stats.bans, icon: ShieldAlert,
          tone: stats.bans > 0 ? 'danger' : undefined },
        { id: 'warnings', label: t('paxlog.signalements.kpi.warnings', 'Avertissements'), value: stats.warnings, icon: AlertTriangle,
          tone: stats.warnings > 0 ? 'warning' : undefined },
        { id: 'resolved', label: t('paxlog.signalements.kpi.resolved', 'Résolus'), value: stats.resolved, icon: CheckCircle2,
          tone: stats.resolved > 0 ? 'success' : undefined,
          onClick: () => setActiveOnly(false), active: !activeOnly },
      ]} />

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
            { id: 'severity', label: t('paxlog.signalements.severity', 'Gravité'), type: 'multi-select',
              operators: ['is', 'is_not'],
              options: severityOptions.filter((o) => o.value).map((o) => ({ value: o.value, label: o.label })) },
            { id: 'active_only', label: t('paxlog.signalements.active_only'), type: 'boolean', operators: ['is'] },
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
          storageKey="paxlog-signalements-v2"
        />
      </PanelContent>
    </>
  )
}
