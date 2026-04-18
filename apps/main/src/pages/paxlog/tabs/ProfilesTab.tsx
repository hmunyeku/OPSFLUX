import { useTranslation } from 'react-i18next'
import { useState, useMemo } from 'react'
import { usePageSize } from '@/hooks/usePageSize'
import { useDebounce } from '@/hooks/useDebounce'
import { usePermission } from '@/hooks/usePermission'
import { useDictionaryLabels, useDictionaryOptions } from '@/hooks/useDictionary'
import { usePaxProfiles } from '@/hooks/usePaxlog'
import type { ColumnDef } from '@tanstack/react-table'
import type { PaxProfileSummary } from '@/services/paxlogService'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { Building2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PanelContent } from '@/components/layout/PanelHeader'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { PAX_STATUS_LABELS_FALLBACK, buildStatusFilterOptions, StatusBadge } from '../shared'

export function ProfilesTab({ openDetail }: { openDetail: (id: string, meta?: Record<string, unknown>) => void }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const { hasPermission } = usePermission()
  const paxStatusLabels = useDictionaryLabels('pax_profile_status', PAX_STATUS_LABELS_FALLBACK)
  const paxStatusOptions = useMemo(
    () => buildStatusFilterOptions(paxStatusLabels, ['active', 'incomplete', 'suspended', 'archived'], t('common.all')),
    [paxStatusLabels, t],
  )
  const paxTypeOptions = useDictionaryOptions('pax_type')
  const paxTypeLabels = useDictionaryLabels('pax_type', { internal: t('paxlog.internal'), external: t('paxlog.external') })
  const canImport = hasPermission('paxlog.import')
  const canExport = hasPermission('paxlog.export') || hasPermission('paxlog.profile.read')

  const { data, isLoading } = usePaxProfiles({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    type: typeFilter || undefined,
  })

  const profileColumns = useMemo<ColumnDef<PaxProfileSummary, unknown>[]>(() => [
    {
      id: 'name',
      header: t('common.name'),
      accessorFn: (row) => `${row.last_name} ${row.first_name}`,
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.last_name} {row.original.first_name}</span>,
    },
    {
      accessorKey: 'company_name',
      header: t('tiers.title'),
      cell: ({ row }) => row.original.company_id
        ? <CrossModuleLink module="tiers" id={row.original.company_id} label={row.original.company_name || row.original.company_id} showIcon={false} className="text-xs" />
        : row.original.company_name
          ? <span className="flex items-center gap-1 text-muted-foreground text-xs"><Building2 size={11} /> {row.original.company_name}</span>
          : <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'pax_type',
      header: t('common.type'),
      cell: ({ row }) => (
        <span className={cn('gl-badge', row.original.pax_type === 'internal' ? 'gl-badge-info' : 'gl-badge-neutral')}>
          {paxTypeLabels[row.original.pax_type] || row.original.pax_type}
        </span>
      ),
      size: 80,
    },
    {
      accessorKey: 'badge_number',
      header: t('paxlog.badge_number'),
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.badge_number || '—'}</span>,
    },
    {
      accessorKey: 'active',
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.active ? 'active' : 'inactive'} />,
      size: 90,
    },
  ], [paxTypeLabels, t])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1">
          {paxStatusOptions.map((opt) => (
            <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors', statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {opt.label}
            </button>
          ))}
          <span className="mx-1 h-3 w-px bg-border" />
          {paxTypeOptions.map((opt) => (
            <button key={opt.value} onClick={() => { setTypeFilter(typeFilter === opt.value ? '' : opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors', typeFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto">{t('paxlog.profiles_count', { count: data.total })}</span>}
      </div>

      <PanelContent scroll={false}>
        <DataTable<PaxProfileSummary>
          columns={profileColumns}
          data={data?.items ?? []}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder={t('paxlog.search_profile')}
          onRowClick={(row) => openDetail(row.id, { pax_source: row.pax_source })}
          importExport={(canExport || canImport) ? {
            exportFormats: canExport ? ['csv', 'xlsx'] : undefined,
            advancedExport: true,
            importWizardTarget: canImport ? 'pax_profile' : undefined,
            filenamePrefix: 'pax-profiles',
          } : undefined}
          emptyIcon={Users}
          emptyTitle={t('paxlog.no_profile')}
          storageKey="paxlog-profiles"
        />
      </PanelContent>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 4: COMPLIANCE
// ═══════════════════════════════════════════════════════════════

