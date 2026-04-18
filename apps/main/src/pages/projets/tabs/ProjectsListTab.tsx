/**
 * Projects list tab (DataTable view of projects).
 *
 * Extracted from ProjetsPage.tsx — pure restructure, no behavior changes.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderKanban, Layers } from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useFilterPersistence } from '@/hooks/useFilterPersistence'
import { usePageSize } from '@/hooks/usePageSize'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { ProjectSelectorModal } from '@/components/shared/ProjectSelectorModal'
import { useProjectFilter } from '@/hooks/useProjectFilter'
import { useProjects } from '@/hooks/useProjets'
import { isGoutiProject } from '@/services/projetsService'
import type { Project } from '@/types/api'
import {
  PROJECT_STATUS_VALUES, PROJECT_PRIORITY_VALUES,
  PROJECT_STATUS_LABELS_FALLBACK, PROJECT_PRIORITY_LABELS_FALLBACK,
  buildDictionaryOptions,
  GoutiBadge, WeatherIcon,
} from '../shared'

export function ProjectsListView() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useFilterPersistence<Record<string, unknown>>('projets.list.filters', {})
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)
  const { hasPermission } = usePermission()
  const canImport = hasPermission('project.import')
  const canExport = hasPermission('project.export') || hasPermission('project.read')
  const { selection: projSelection, setSelection: setProjSelection, filteredProjectIds: projFilterIds, isFiltered: isProjFiltered } = useProjectFilter()
  const [showProjSelector, setShowProjSelector] = useState(false)
  const projectStatusLabels = useDictionaryLabels('project_status', PROJECT_STATUS_LABELS_FALLBACK)
  const projectPriorityLabels = useDictionaryLabels('project_priority', PROJECT_PRIORITY_LABELS_FALLBACK)
  const projectStatusOptions = useMemo(() => buildDictionaryOptions(projectStatusLabels, PROJECT_STATUS_VALUES), [projectStatusLabels])
  const projectPriorityOptions = useMemo(() => buildDictionaryOptions(projectPriorityLabels, PROJECT_PRIORITY_VALUES), [projectPriorityLabels])

  const statusFilter = typeof activeFilters.status === 'string' ? activeFilters.status : undefined
  const priorityFilter = typeof activeFilters.priority === 'string' ? activeFilters.priority : undefined
  const sourceFilter = activeFilters.source === 'gouti' || activeFilters.source === 'opsflux'
    ? (activeFilters.source as 'gouti' | 'opsflux')
    : undefined

  const { data, isLoading } = useProjects({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter,
    priority: priorityFilter,
    source: sourceFilter,
  })

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters])

  useEffect(() => {
    if (data?.items) setNavItems(data.items.map(i => i.id))
    return () => setNavItems([])
  }, [data?.items, setNavItems])

  const filters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'status', label: 'Statut', type: 'multi-select', operators: ['is', 'is_not'], options: projectStatusOptions },
    { id: 'priority', label: 'Priorité', type: 'select', options: projectPriorityOptions },
    { id: 'source', label: 'Source', type: 'select', options: [
      { value: 'opsflux', label: 'OpsFlux (natif)' },
      { value: 'gouti', label: 'Importé de Gouti' },
    ]},
  ], [projectPriorityOptions, projectStatusOptions])

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters(prev => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])

  const columns = useMemo<ColumnDef<Project, unknown>[]>(() => [
    { accessorKey: 'code', header: t('projets.columns.code'), size: 120, cell: ({ row }) => (
      <div className="flex items-center gap-1">
        {(row.original.children_count ?? 0) > 0 && <Layers size={10} className="text-primary" />}
        <span className="font-medium text-foreground">{row.original.code}</span>
        {isGoutiProject(row.original) && <GoutiBadge />}
      </div>
    )},
    { accessorKey: 'name', header: t('projets.columns.name'), cell: ({ row }) => <span className="text-foreground">{row.original.name}</span> },
    {
      accessorKey: 'status', header: t('projets.columns.status'), size: 100,
      cell: ({ row }) => {
        const s = row.original.status
        const cls = s === 'active' ? 'gl-badge-success' : s === 'completed' ? 'gl-badge-info' : s === 'on_hold' || s === 'cancelled' ? 'gl-badge-danger' : 'gl-badge-neutral'
        return <span className={cn('gl-badge', cls)}>{projectStatusLabels[s] ?? s}</span>
      },
    },
    { accessorKey: 'weather', header: t('projets.columns.weather'), size: 60, cell: ({ row }) => <WeatherIcon weather={row.original.weather} /> },
    {
      accessorKey: 'progress', header: t('projets.columns.progress'), size: 60,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${row.original.progress}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">{row.original.progress}%</span>
        </div>
      ),
    },
    {
      accessorKey: 'priority', header: t('projets.columns.priority'), size: 80,
      cell: ({ row }) => {
        const p = row.original.priority
        const cls = p === 'critical' ? 'gl-badge-danger' : p === 'high' ? 'gl-badge-warning' : 'gl-badge-neutral'
        return <span className={cn('gl-badge', cls)}>{projectPriorityLabels[p] ?? p}</span>
      },
    },
    { accessorKey: 'manager_name', header: t('projets.columns.assignee'), size: 140, cell: ({ row }) => row.original.manager_id
        ? <CrossModuleLink module="users" id={row.original.manager_id} label={row.original.manager_name || row.original.manager_id} showIcon={false} className="text-xs" />
        : <span className="text-muted-foreground/40">--</span>,
    },
    { accessorKey: 'task_count', header: t('projets.columns.task_count'), size: 70, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.task_count ?? 0}</span> },
    {
      accessorKey: 'parent_name', header: t('projets.columns.parent_project'), size: 130,
      cell: ({ row }) => row.original.parent_id
        ? <CrossModuleLink module="projets" id={row.original.parent_id} label={row.original.parent_name || row.original.parent_id} showIcon={false} className="text-xs" />
        : <span className="text-muted-foreground/40">--</span>,
    },
    { accessorKey: 'tier_name', header: t('projets.columns.company'), size: 130, cell: ({ row }) => row.original.tier_id
        ? <CrossModuleLink module="tiers" id={row.original.tier_id} label={row.original.tier_name || row.original.tier_id} showIcon={false} className="text-xs" />
        : <span className="text-muted-foreground/40">--</span>,
    },
    {
      accessorKey: 'end_date', header: t('projets.columns.deadline'), size: 100,
      cell: ({ row }) => row.original.end_date
        ? <span className="text-muted-foreground text-xs">{new Date(row.original.end_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        : <span className="text-muted-foreground/40">--</span>,
    },
  ], [projectPriorityLabels, projectStatusLabels])

  const pagination: DataTablePagination | undefined = data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined

  // Apply shared project filter (client-side since list is paginated)
  const listItems = useMemo(() => {
    const items = data?.items ?? []
    if (!projFilterIds) return items
    return items.filter(p => projFilterIds.has(p.id))
  }, [data, projFilterIds])

  return (
    <>
    <DataTable<Project>
      columns={columns}
      data={listItems}
      isLoading={isLoading}
      toolbarLeft={
        <button
          onClick={() => setShowProjSelector(true)}
          className={cn('px-2 py-1 rounded border text-xs mr-2', isProjFiltered ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted text-muted-foreground')}
        >
          {isProjFiltered ? `${projSelection.projectIds.length} projet(s)` : 'Sélection'}
        </button>
      }
      pagination={pagination}
      onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Rechercher par code ou nom..."
      filters={filters}
      activeFilters={activeFilters}
      onFilterChange={handleFilterChange}
      onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'projets', id: row.id })}
      importExport={(canExport || canImport) ? {
        exportFormats: canExport ? ['csv', 'xlsx'] : undefined,
        advancedExport: true,
        importWizardTarget: canImport ? 'project' : undefined,
        filenamePrefix: 'projets',
      } : undefined}
      emptyIcon={FolderKanban}
      emptyTitle="Aucun projet"
      columnResizing
      columnPinning
      columnVisibility
      defaultPinnedColumns={{ left: ['code'] }}
      defaultHiddenColumns={['tier_name', 'end_date', 'parent_name']}
      storageKey="projets"
    />
    <ProjectSelectorModal open={showProjSelector} onClose={() => setShowProjSelector(false)} selection={projSelection} onSelectionChange={setProjSelection} />
    </>
  )
}
