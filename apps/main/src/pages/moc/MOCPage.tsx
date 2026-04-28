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
import { useOpenDetailFromPath } from '@/hooks/useOpenDetailFromPath'
import { useTranslation } from 'react-i18next'
import type { ColumnDef } from '@tanstack/react-table'
import {
  ClipboardList,
  LayoutDashboard,
  Plus,
  Rocket,
  UserCircle2,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
  { id: 'dashboard', labelKey: 'common.tab_dashboard', icon: LayoutDashboard },
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
  // Deep link: /moc/{uuid} → open that MOC's detail panel.
  useOpenDetailFromPath({ matchers: [{ prefix: '/moc/', module: 'moc' }] })
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
  const [showStats, setShowStats] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth >= 768,
  )

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

  const managerFilterOptions = useMemo(
    () => [
      { value: 'true', label: t('moc.filters.mine_as_manager') },
    ],
    [t],
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

  // KPIs computed from the visible page — same approach as the
  // Planner Activities pattern. They double as quick filters when the
  // user clicks them. The "Total" card clears the status filter; the
  // others toggle a specific status set.
  const items = data?.items ?? []
  const stats = useMemo(() => {
    const inProgress = items.filter((m) =>
      ['execution', 'approved_to_study', 'under_study', 'study_in_validation'].includes(m.status),
    ).length
    const pending = items.filter((m) =>
      ['created', 'submitted_to_confirm'].includes(m.status),
    ).length
    const closed = items.filter((m) =>
      ['closed', 'executed_docs_pending'].includes(m.status),
    ).length
    return { total: data?.total ?? 0, pending, inProgress, closed }
  }, [data?.total, items])

  // 8-week sparklines from created_at — cheap trend, no extra API call.
  const sparklines = useMemo(() => {
    const WEEKS = 8
    const total = new Array(WEEKS).fill(0) as number[]
    const pending = new Array(WEEKS).fill(0) as number[]
    const inProgress = new Array(WEEKS).fill(0) as number[]
    const closed = new Array(WEEKS).fill(0) as number[]
    const now = Date.now()
    const weekMs = 7 * 86_400_000
    for (const m of items) {
      const ref = m.created_at ? new Date(m.created_at).getTime() : null
      if (ref == null) continue
      const idx = WEEKS - 1 - Math.min(WEEKS - 1, Math.max(0, Math.floor((now - ref) / weekMs)))
      total[idx]++
      if (['created', 'submitted_to_confirm'].includes(m.status)) pending[idx]++
      if (['execution', 'approved_to_study', 'under_study', 'study_in_validation'].includes(m.status)) inProgress[idx]++
      if (['closed', 'executed_docs_pending'].includes(m.status)) closed[idx]++
    }
    return { total, pending, inProgress, closed }
  }, [items])

  return (
    <>
    {/* Stats strip — same pattern as Planner / PaxLog / PackLog. */}
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setShowStats((v) => !v)}
        className="md:hidden w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/5 transition-colors"
      >
        <span className="flex items-center gap-2">
          <BarChart3 size={14} className="text-muted-foreground" />
          {t('common.stats', 'Statistiques')}
        </span>
        {showStats ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      <div className={cn('@container/stats', showStats ? 'block' : 'hidden md:block')}>
        <div className="flex gap-2 overflow-x-auto px-4 py-3 snap-x snap-mandatory @md/stats:grid @md/stats:grid-cols-4 @md/stats:gap-3 @md/stats:overflow-visible @md/stats:snap-none">
          <MOCStatCard
            label={t('moc.stats.total', 'Total')}
            value={stats.total}
            icon={ClipboardList}
            sparkline={sparklines.total}
            onClick={() => { setStatusFilter(undefined); setPage(1) }}
            active={!statusFilter}
          />
          <MOCStatCard
            label={t('moc.stats.pending', 'En attente')}
            value={stats.pending}
            icon={Clock}
            accent="text-amber-600 dark:text-amber-400"
            sparkline={sparklines.pending}
          />
          <MOCStatCard
            label={t('moc.stats.in_progress', 'En cours')}
            value={stats.inProgress}
            icon={AlertTriangle}
            accent="text-blue-600 dark:text-blue-400"
            sparkline={sparklines.inProgress}
          />
          <MOCStatCard
            label={t('moc.stats.closed', 'Clôturées')}
            value={stats.closed}
            icon={CheckCircle2}
            accent="text-emerald-600 dark:text-emerald-400"
            sparkline={sparklines.closed}
          />
        </div>
      </div>
    </div>
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
      filters={[
        {
          id: 'mine_as_manager',
          label: t('moc.filters.mine_as_manager'),
          type: 'select',
          options: managerFilterOptions,
        },
      ]}
      toolbarLeft={
        <div className="flex items-center gap-2">
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
        mine_as_manager: mineAsManager ? 'true' : undefined,
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
        } else if (id === 'mine_as_manager') {
          setMineAsManager(value === 'true')
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
    </>
  )
}

// ─── Local KPI card (matches Planner / PaxLog / PackLog pattern) ──────────

function MOCStatCard({ label, value, icon: Icon, accent, sparkline, onClick, active }: {
  label: string
  value: string | number
  icon: typeof ClipboardList
  accent?: string
  sparkline?: number[]
  onClick?: () => void
  active?: boolean
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        '@container/kpi group relative flex items-center gap-2 rounded-lg border bg-gradient-to-br from-background to-background/60 px-3 py-1.5 overflow-hidden transition-all text-left shrink-0 snap-start w-[160px] @md/stats:w-full',
        onClick && 'cursor-pointer hover:border-primary/50 hover:shadow-sm',
        active ? 'border-primary/60 ring-1 ring-primary/30 bg-primary/5' : 'border-border/70 hover:border-border',
      )}
    >
      <div className={cn(
        'absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b',
        accent?.includes('amber') || accent?.includes('yellow')  ? 'from-amber-500/80 to-amber-400/40'
        : accent?.includes('emerald') || accent?.includes('green') ? 'from-emerald-500/80 to-emerald-400/40'
        : accent?.includes('blue') ? 'from-blue-500/80 to-blue-400/40'
        : 'from-primary/80 to-highlight/40',
      )} />
      <Icon size={13} className="text-muted-foreground shrink-0 ml-0.5" />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{label}</span>
      <span className="flex-1" />
      {sparkline && sparkline.length >= 2 && sparkline.some((v) => v > 0) && (
        <span className="hidden @[180px]/kpi:inline-flex shrink-0">
          <MOCSparkline values={sparkline} accent={accent} />
        </span>
      )}
      <span className={cn('text-lg font-bold tabular-nums tracking-tight leading-none', accent || 'text-foreground')}>
        {value}
      </span>
    </Tag>
  )
}

function MOCSparkline({ values, accent }: { values: number[]; accent?: string }) {
  const W = 64, H = 18
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(1, max - min)
  const step = W / Math.max(1, values.length - 1)
  const pts = values.map((v, i) => [i * step, H - 2 - ((v - min) / range) * (H - 4)] as const)
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  const tone = accent?.includes('amber') || accent?.includes('yellow') ? '#f59e0b'
    : accent?.includes('emerald') || accent?.includes('green') ? '#10b981'
    : accent?.includes('blue') ? '#3b82f6'
    : 'hsl(var(--primary))'
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 ml-auto">
      <path d={area} fill={tone} fillOpacity={0.15} />
      <path d={line} fill="none" stroke={tone} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default MOCPage
