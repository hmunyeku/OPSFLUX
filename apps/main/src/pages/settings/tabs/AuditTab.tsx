/**
 * Audit Log Viewer tab — admin audit trail with filtering and CSV export.
 *
 * API-backed: GET /api/v1/audit-log with query params
 */
import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollText, Download, Search, X, User, Clock, Shield, Monitor, FileText } from 'lucide-react'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { usePageSize } from '@/hooks/usePageSize'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import type { PaginatedResponse, AuditLogEntry } from '@/types/api'
import {
  DataTable,
  BadgeCell,
  DateCell,
  type DataTableFilterDef,
} from '@/components/ui/DataTable'
import type { ColumnDef } from '@tanstack/react-table'

// ── API layer ─────────────────────────────────────────────────

interface AuditFilters {
  page: number
  page_size: number
  action?: string
  resource_type?: string
  date_from?: string
  date_to?: string
  search?: string
}

async function fetchAuditLog(filters: AuditFilters): Promise<PaginatedResponse<AuditLogEntry>> {
  const params: Record<string, string | number> = {
    page: filters.page,
    page_size: filters.page_size,
  }
  if (filters.action) params.action = filters.action
  if (filters.resource_type) params.resource_type = filters.resource_type
  if (filters.date_from) params.date_from = filters.date_from
  if (filters.date_to) params.date_to = filters.date_to
  const { data } = await api.get('/api/v1/audit-log', { params })
  return data
}

function useAuditLog(filters: AuditFilters) {
  return useQuery({
    queryKey: ['audit-log', filters],
    queryFn: () => fetchAuditLog(filters),
    staleTime: 30_000,
  })
}

// ── Column definitions ────────────────────────────────────────

const ACTION_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  create: 'success',
  update: 'info',
  delete: 'danger',
  login: 'neutral',
  archive: 'warning',
}

function useAuditColumns() {
  const { t } = useTranslation()
  return useMemo<ColumnDef<AuditLogEntry, unknown>[]>(() => [
    {
      accessorKey: 'created_at',
      header: t('settings.columns.audit.date'),
      cell: ({ getValue }) => <DateCell value={getValue() as string} />,
      size: 150,
    },
    {
      accessorKey: 'user_id',
      header: t('settings.columns.audit.user'),
      cell: ({ row }) => (
        <span className="text-sm text-foreground truncate max-w-[140px] block">
          {row.original.user_id ? row.original.user_id.slice(0, 8) + '...' : '—'}
        </span>
      ),
      size: 120,
    },
    {
      accessorKey: 'action',
      header: t('settings.columns.audit.action'),
      cell: ({ getValue }) => {
        const action = getValue() as string
        return <BadgeCell value={action} variant={ACTION_VARIANT[action] || 'neutral'} />
      },
      size: 110,
    },
    {
      accessorKey: 'resource_type',
      header: t('settings.columns.audit.module'),
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground">{getValue() as string}</span>
      ),
      size: 120,
    },
    {
      accessorKey: 'resource_id',
      header: t('settings.columns.audit.object'),
      cell: ({ getValue }) => (
        <span className="text-xs text-muted-foreground font-mono truncate max-w-[140px] block">
          {(getValue() as string | null) || '—'}
        </span>
      ),
      size: 140,
    },
    {
      accessorKey: 'details',
      header: t('settings.columns.audit.details'),
      cell: ({ getValue }) => {
        const details = getValue() as Record<string, unknown> | null
        if (!details) return <span className="text-muted-foreground">—</span>
        const summary = Object.entries(details)
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
          .join(', ')
        return (
          <span className="text-xs text-muted-foreground truncate max-w-[200px] block" title={JSON.stringify(details, null, 2)}>
            {summary || '—'}
          </span>
        )
      },
      size: 220,
    },
  ], [t])
}

// ── CSV export ────────────────────────────────────────────────

function exportAuditCSV(items: AuditLogEntry[]) {
  const headers = ['Date', 'Utilisateur', 'Action', 'Module', 'Objet', 'Details', 'IP']
  const rows = items.map((entry) => [
    entry.created_at,
    entry.user_id || '',
    entry.action,
    entry.resource_type,
    entry.resource_id || '',
    entry.details ? JSON.stringify(entry.details) : '',
    entry.ip_address || '',
  ])
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Detail Modal ─────────────────────────────────────────────

function AuditDetailModal({ entry, onClose }: { entry: AuditLogEntry; onClose: () => void }) {
  const formatDate = (d: string) => new Date(d).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in-0 duration-150"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-in zoom-in-95 duration-150 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <ScrollText size={16} className="text-primary" />
            <h3 className="text-sm font-semibold">Détail de l&apos;entrée d&apos;audit</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground"><X size={14} /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2">
              <Clock size={13} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Date</p>
                <p className="text-sm">{formatDate(entry.created_at)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User size={13} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Utilisateur</p>
                <p className="text-sm font-mono">{entry.user_id || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Shield size={13} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Action</p>
                <BadgeCell value={entry.action} variant={ACTION_VARIANT[entry.action] || 'neutral'} />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FileText size={13} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Module</p>
                <p className="text-sm">{entry.resource_type}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Monitor size={13} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Adresse IP</p>
                <p className="text-sm font-mono">{entry.ip_address || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FileText size={13} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">ID Objet</p>
                <p className="text-sm font-mono break-all">{entry.resource_id || '—'}</p>
              </div>
            </div>
          </div>

          {/* Details JSON */}
          {entry.details && Object.keys(entry.details).length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium mb-1.5">Détails</p>
              <div className="bg-muted/30 border border-border rounded-lg p-3 overflow-x-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground">
                  {JSON.stringify(entry.details, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

export function AuditTab() {
  const { t } = useTranslation()
  const auditColumns = useAuditColumns()
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null)
  const [action, setAction] = useState<string>('')
  const [resourceType, setResourceType] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [localSearch, setLocalSearch] = useState('')

  const filters: AuditFilters = useMemo(() => ({
    page,
    page_size: pageSize,
    action: action || undefined,
    resource_type: resourceType || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    search: localSearch || undefined,
  }), [page, pageSize, action, resourceType, dateFrom, dateTo, localSearch])

  const { data, isLoading } = useAuditLog(filters)

  const handleExport = useCallback(() => {
    if (data?.items) exportAuditCSV(data.items)
  }, [data])

  const filterDefs: DataTableFilterDef[] = useMemo(() => [
    {
      id: 'action',
      label: t('settings.audit.action'),
      type: 'select' as const,
      options: [
        { value: '', label: t('common.all') },
        { value: 'create', label: t('settings.audit.action_create') },
        { value: 'update', label: t('settings.audit.action_update') },
        { value: 'delete', label: t('settings.audit.action_delete') },
        { value: 'login', label: t('settings.audit.action_login') },
        { value: 'archive', label: t('settings.audit.action_archive') },
      ],
    },
    {
      id: 'resource_type',
      label: t('settings.audit.module'),
      type: 'select' as const,
      options: [
        { value: '', label: t('common.all') },
        { value: 'asset', label: 'Asset' },
        { value: 'tier', label: 'Tier' },
        { value: 'user', label: 'User' },
        { value: 'workflow', label: 'Workflow' },
        { value: 'paxlog', label: 'PaxLog' },
        { value: 'project', label: 'Projet' },
        { value: 'planner', label: 'Planner' },
        { value: 'travelwiz', label: 'TravelWiz' },
      ],
    },
  ], [t])

  return (
    <CollapsibleSection
      id="audit-log"
      title={t('settings.audit.title')}
      description={t('settings.audit.description')}
      storageKey="settings.audit.collapse"
      showSeparator={false}
    >
      {/* Filters bar */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('common.search')}
            value={localSearch}
            onChange={(e) => { setLocalSearch(e.target.value); setPage(1) }}
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Date range filter */}
        <DateRangePicker
          startDate={dateFrom || null}
          endDate={dateTo || null}
          onStartChange={(v) => { setDateFrom(v); setPage(1) }}
          onEndChange={(v) => { setDateTo(v); setPage(1) }}
          startLabel={t('common.start_date')}
          endLabel={t('common.due_date')}
        />

        {/* Export CSV */}
        <button
          className="gl-button-sm gl-button-confirm flex items-center gap-1.5"
          onClick={handleExport}
          disabled={!data?.items?.length}
        >
          <Download size={13} />
          {t('settings.audit.export_csv')}
        </button>
      </div>

      {/* DataTable */}
      <div className="mt-4">
        <DataTable<AuditLogEntry>
          columns={auditColumns}
          data={data?.items ?? []}
          isLoading={isLoading}
          getRowId={(row) => row.id}
          storageKey="audit-log"

          pagination={data ? {
            page: data.page,
            pageSize: data.page_size,
            total: data.total,
            pages: data.pages,
          } : undefined}
          onPaginationChange={(p, size) => {
            setPage(p)
            setPageSize(size)
          }}

          sortable
          filters={filterDefs}
          activeFilters={{ action, resource_type: resourceType }}
          onFilterChange={(id, value) => {
            if (id === 'action') { setAction(value as string); setPage(1) }
            if (id === 'resource_type') { setResourceType(value as string); setPage(1) }
          }}

          emptyIcon={ScrollText}
          emptyTitle={t('settings.audit.empty')}
          onRowClick={(row) => setSelectedEntry(row)}
        />
      </div>

      {/* Detail modal */}
      {selectedEntry && (
        <AuditDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}
    </CollapsibleSection>
  )
}
