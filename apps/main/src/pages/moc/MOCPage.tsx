/**
 * MOCPage — Management of Change module.
 *
 * Two tabs only:
 *   - Dashboard  — ModuleDashboard with all MOC widgets (statistics live here)
 *   - Liste      — DataTable with visual search/filter tokens per column
 *
 * The dynamic panel hosts Create/Detail views. Detail is itself tabbed
 * (Fiche | Validation | Commentaires | Documents | Historique) — see
 * MOCDetailPanel.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ColumnDef } from '@tanstack/react-table'
import { ClipboardList, LayoutDashboard, Plus, Rocket, UserCircle2 } from 'lucide-react'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import {
  renderRegisteredPanel,
  registerPanelRenderer,
} from '@/components/layout/DetachedPanelRenderer'
import { PageNavBar } from '@/components/ui/Tabs'
import { DataTable, BadgeCell } from '@/components/ui/DataTable'
import { useMOCList } from '@/hooks/useMOC'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { formatDate } from '@/lib/i18n'
import {
  MOC_STATUS_COLOURS,
  MOC_STATUS_LABELS,
  type MOC,
  type MOCStatus,
} from '@/services/mocService'
import { MOCDetailPanel } from './panels/MOCDetailPanel'
import { MOCCreatePanel } from './panels/MOCCreatePanel'

type MOCTab = 'dashboard' | 'list'

const TABS: { id: MOCTab; labelKey: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', labelKey: 'moc.tabs.dashboard', icon: LayoutDashboard },
  { id: 'list', labelKey: 'moc.tabs.list', icon: ClipboardList },
]

registerPanelRenderer('moc', (view) => {
  if (view.type === 'create') return <MOCCreatePanel />
  if (view.type === 'detail' && 'id' in view) return <MOCDetailPanel id={view.id} />
  return null
})

export function MOCPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { hasPermission } = usePermission()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  // Full-panel takes over the main area (auto on mobile < 768px via the
  // DynamicPanelShell itself). Hide the page content side-by-side so the
  // detail / create panel actually gets the full width.
  const isFullPanel =
    panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'moc'

  const urlTab = (searchParams.get('tab') as MOCTab) || 'dashboard'
  const activeTab = (['dashboard', 'list'] as MOCTab[]).includes(urlTab)
    ? urlTab
    : 'dashboard'
  const setActiveTab = (tab: MOCTab) => {
    setSearchParams(tab === 'dashboard' ? {} : { tab }, { replace: true })
  }

  const tabItems = useMemo(
    () => TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey), icon: tab.icon })),
    [t],
  )

  const canCreate = hasPermission('moc.create')

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
          <PanelHeader
            icon={ClipboardList}
            title={t('moc.page_title')}
            subtitle={t('moc.page_subtitle')}
          >
            {canCreate && (
              <ToolbarButton
                icon={Plus}
                label={t('moc.actions.new')}
                onClick={() => openDynamicPanel({ type: 'create', module: 'moc' })}
              />
            )}
          </PanelHeader>

          <PageNavBar
            items={tabItems}
            activeId={activeTab}
            onTabChange={setActiveTab}
            rightSlot={activeTab === 'dashboard' ? <div id="dash-toolbar-moc" /> : null}
          />

          <PanelContent scroll={activeTab === 'dashboard'}>
            {activeTab === 'dashboard' && (
              <ModuleDashboard module="moc" toolbarPortalId="dash-toolbar-moc" />
            )}
            {activeTab === 'list' && <MOCListTab />}
          </PanelContent>
        </div>
      )}

      {dynamicPanel?.module === 'moc' && renderRegisteredPanel(dynamicPanel)}
    </div>
  )
}

// ─── Liste tab ──────────────────────────────────────────────────────────────

function MOCListTab() {
  const { t } = useTranslation()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const [siteFilter, setSiteFilter] = useState<string | undefined>(undefined)
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined)
  const [mineAsManager, setMineAsManager] = useState(false)
  const [projectFilter, setProjectFilter] = useState<'all' | 'promoted' | 'not_promoted'>('all')

  const siteOptions = useDictionaryOptions('moc_site')
  const priorityOptions = useDictionaryOptions('moc_priority')

  const { data, isLoading } = useMOCList({
    page,
    page_size: pageSize,
    status: statusFilter as MOCStatus | undefined,
    site_label: siteFilter,
    priority: priorityFilter as '1' | '2' | '3' | undefined,
    search: search || undefined,
    mine_as_manager: mineAsManager || undefined,
    has_project:
      projectFilter === 'promoted' ? true
      : projectFilter === 'not_promoted' ? false
      : undefined,
  })

  // Feed the currently-visible row IDs to the dynamic panel so its header
  // exposes the prev/next/first/last navigation (convention used by every
  // other module — projets, tiers, packlog…).
  useEffect(() => {
    if (data?.items) setNavItems(data.items.map((i) => i.id))
    return () => setNavItems([])
  }, [data?.items, setNavItems])

  const statusOptions = useMemo(
    () =>
      Object.entries(MOC_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
    [],
  )

  const columns: ColumnDef<MOC>[] = useMemo(
    () => [
      {
        accessorKey: 'reference',
        header: t('moc.columns.reference'),
        size: 160,
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium text-foreground">
            {row.original.reference}
          </span>
        ),
        meta: {
          filterType: 'text' as const,
          filterLabel: t('moc.columns.reference') as string,
        },
      },
      {
        accessorKey: 'objectives',
        header: t('moc.columns.objectives'),
        size: 320,
        cell: ({ row }) => (
          <span className="text-xs text-foreground line-clamp-2">
            {row.original.objectives || row.original.description || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'site_label',
        header: t('moc.columns.site'),
        size: 110,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.site_label}
          </span>
        ),
        meta: {
          filterType: 'select' as const,
          filterLabel: t('moc.columns.site') as string,
          filterOptions: siteOptions,
        },
      },
      {
        accessorKey: 'platform_code',
        header: t('moc.columns.platform'),
        size: 90,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.platform_code}
          </span>
        ),
        meta: {
          filterType: 'text' as const,
          filterLabel: t('moc.columns.platform') as string,
        },
      },
      {
        accessorKey: 'status',
        header: t('moc.columns.status'),
        size: 160,
        cell: ({ row }) => (
          <BadgeCell
            value={MOC_STATUS_LABELS[row.original.status]}
            variant={MOC_STATUS_COLOURS[row.original.status]}
          />
        ),
        meta: {
          filterType: 'select' as const,
          filterLabel: t('moc.columns.status') as string,
          filterOptions: statusOptions,
        },
      },
      {
        accessorKey: 'priority',
        header: t('moc.columns.priority'),
        size: 80,
        cell: ({ row }) =>
          row.original.priority ? (
            <BadgeCell
              value={`P${row.original.priority}`}
              variant={
                row.original.priority === '1'
                  ? 'danger'
                  : row.original.priority === '2'
                    ? 'warning'
                    : 'neutral'
              }
            />
          ) : (
            <span className="text-muted-foreground/40 text-xs">—</span>
          ),
        meta: {
          filterType: 'select' as const,
          filterLabel: t('moc.columns.priority') as string,
          filterOptions: priorityOptions,
        },
      },
      {
        accessorKey: 'initiator_display',
        header: t('moc.columns.initiator'),
        size: 140,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.initiator_display || row.original.initiator_name || '—'}
          </span>
        ),
      },
      {
        // Chef de projet MOC — only the UUID is in the list payload, so we
        // fall back to an "assigné" chip when present and a dash otherwise.
        // Clicking the full MOC detail resolves the name via the users list.
        accessorKey: 'manager_id',
        header: t('moc.columns.manager'),
        size: 120,
        cell: ({ row }) =>
          row.original.manager_id ? (
            <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              <UserCircle2 size={11} />
              {t('moc.columns.manager_assigned')}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground italic">—</span>
          ),
      },
      {
        // Link to the promoted project (if any). Shown as a rocket chip.
        id: 'project',
        header: t('moc.columns.linked_project'),
        size: 110,
        cell: ({ row }) =>
          row.original.project_id ? (
            <a
              href={`/projets?id=${row.original.project_id}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
            >
              <Rocket size={11} /> {t('moc.columns.linked_project_chip')}
            </a>
          ) : (
            <span className="text-[10px] text-muted-foreground italic">—</span>
          ),
      },
      {
        accessorKey: 'created_at',
        header: t('moc.columns.created_at'),
        size: 110,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
    ],
    [t, siteOptions, statusOptions, priorityOptions],
  )

  return (
    <DataTable<MOC>
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      getRowId={(row) => row.id}
      storageKey="moc-list"
      searchValue={search}
      onSearchChange={(v: string) => {
        setSearch(v)
        setPage(1)
      }}
      toolbarLeft={
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={mineAsManager}
              onChange={(e) => {
                setMineAsManager(e.target.checked)
                setPage(1)
              }}
            />
            {t('moc.filters.mine_as_manager')}
          </label>
          <select
            className="gl-form-input h-6 text-[11px] px-1.5 py-0"
            value={projectFilter}
            onChange={(e) => {
              setProjectFilter(e.target.value as 'all' | 'promoted' | 'not_promoted')
              setPage(1)
            }}
          >
            <option value="all">{t('moc.filters.all_projects')}</option>
            <option value="promoted">{t('moc.filters.only_promoted')}</option>
            <option value="not_promoted">{t('moc.filters.only_not_promoted')}</option>
          </select>
        </div>
      }
      pagination={
        data
          ? {
              page: data.page,
              pageSize: data.page_size,
              total: data.total,
              pages: data.pages,
            }
          : undefined
      }
      onPaginationChange={(p: number, size: number) => {
        setPage(p)
        setPageSize(size)
      }}
      sortable
      autoColumnFilters
      activeFilters={{
        status: statusFilter,
        site_label: siteFilter,
        priority: priorityFilter,
      }}
      onFilterChange={(id: string, value: unknown) => {
        if (id === 'status') {
          setStatusFilter(value as string | undefined)
          setPage(1)
        } else if (id === 'site_label') {
          setSiteFilter(value as string | undefined)
          setPage(1)
        } else if (id === 'priority') {
          setPriorityFilter(value as string | undefined)
          setPage(1)
        }
      }}
      columnVisibility
      importExport={{
        exportFormats: ['csv', 'xlsx', 'pdf'],
        filenamePrefix: 'moc',
        exportHeaders: {
          reference: t('moc.columns.reference'),
          objectives: t('moc.columns.objectives'),
          site_label: t('moc.columns.site'),
          platform_code: t('moc.columns.platform'),
          status: t('moc.columns.status'),
          priority: t('moc.columns.priority'),
          initiator_display: t('moc.columns.initiator'),
          created_at: t('moc.columns.created_at'),
        },
      }}
      onRowClick={(row: MOC) =>
        openDynamicPanel({ type: 'detail', module: 'moc', id: row.id })
      }
    />
  )
}

export default MOCPage
