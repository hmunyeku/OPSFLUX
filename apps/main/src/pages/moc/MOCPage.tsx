/**
 * MOCPage — Management of Change module.
 *
 * Tabs: Dashboard | Liste | Statistiques
 * Panel: detail (read + transition actions) or create.
 */
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ColumnDef } from '@tanstack/react-table'
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  Plus,
} from 'lucide-react'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import { renderRegisteredPanel, registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { PageNavBar } from '@/components/ui/Tabs'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { BadgeCell } from '@/components/ui/DataTable'
import { useMOCList, useMOCStats } from '@/hooks/useMOC'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'
import { formatDate } from '@/lib/i18n'
import {
  MOC_STATUS_COLOURS,
  MOC_STATUS_LABELS,
  type MOC,
  type MOCStatus,
} from '@/services/mocService'
import { MOCDetailPanel } from './panels/MOCDetailPanel'
import { MOCCreatePanel } from './panels/MOCCreatePanel'

type MOCTab = 'dashboard' | 'list' | 'stats'

const TABS: { id: MOCTab; labelKey: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', labelKey: 'moc.tabs.dashboard', icon: LayoutDashboard },
  { id: 'list', labelKey: 'moc.tabs.list', icon: ClipboardList },
  { id: 'stats', labelKey: 'moc.tabs.stats', icon: BarChart3 },
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

  const urlTab = (searchParams.get('tab') as MOCTab) || 'dashboard'
  const activeTab = (['dashboard', 'list', 'stats'] as MOCTab[]).includes(urlTab)
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
    <div className="flex h-full min-h-0 w-full min-w-0 gap-3">
      <div className="flex flex-1 min-w-0 flex-col">
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

        <PanelContent scroll={activeTab !== 'list'}>
          {activeTab === 'dashboard' && (
            <ModuleDashboard module="moc" toolbarPortalId="dash-toolbar-moc" />
          )}
          {activeTab === 'list' && <MOCListTab />}
          {activeTab === 'stats' && <MOCStatsTab />}
        </PanelContent>
      </div>

      {dynamicPanel?.module === 'moc' && renderRegisteredPanel(dynamicPanel)}
    </div>
  )
}

// ─── Liste tab ──────────────────────────────────────────────────────────────

function MOCListTab() {
  const { t } = useTranslation()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [statusFilter, setStatusFilter] = useState<MOCStatus | ''>('')

  const { data, isLoading } = useMOCList({
    page,
    page_size: pageSize,
    status: statusFilter || undefined,
  })

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
          <span className="text-xs text-muted-foreground">{row.original.site_label}</span>
        ),
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
    [t],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <label className="text-xs font-medium text-muted-foreground">
          {t('moc.columns.status')}
        </label>
        <select
          className="gl-form-input h-7 text-xs"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as MOCStatus | '')
            setPage(1)
          }}
        >
          <option value="">{t('common.all')}</option>
          {Object.entries(MOC_STATUS_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-h-0">
        <DataTable<MOC>
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          pagination={
            data
              ? { page: data.page, pageSize: data.page_size, total: data.total, pages: data.pages }
              : undefined
          }
          onPaginationChange={(p: number, size: number) => {
            setPage(p)
            setPageSize(size)
          }}
          onRowClick={(row: MOC) =>
            openDynamicPanel({ type: 'detail', module: 'moc', id: row.id })
          }
        />
      </div>
    </div>
  )
}

// ─── Stats tab ──────────────────────────────────────────────────────────────

function MOCStatsTab() {
  const { t } = useTranslation()
  const { data, isLoading } = useMOCStats()

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
  }
  if (!data) return null

  return (
    <div className="space-y-4 p-4">
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
        <StatCard label={t('moc.stats.total')} value={data.total} icon={ClipboardList} />
        <StatCard
          label={t('moc.stats.avg_cycle')}
          value={data.avg_cycle_time_days != null ? `${data.avg_cycle_time_days}j` : '—'}
          icon={BarChart3}
        />
        <StatCard
          label={t('moc.stats.open')}
          value={data.by_status
            .filter((s) => !['closed', 'cancelled'].includes(s.status))
            .reduce((acc, s) => acc + s.count, 0)}
          icon={AlertTriangle}
        />
      </div>
      <BreakdownTable
        title={t('moc.stats.by_status')}
        rows={data.by_status.map((s) => ({
          label: MOC_STATUS_LABELS[s.status as MOCStatus] || s.status,
          count: s.count,
        }))}
      />
      <BreakdownTable
        title={t('moc.stats.by_site')}
        rows={data.by_site.map((s) => ({
          label: s.site_label,
          count: s.count,
          percentage: s.percentage,
        }))}
      />
      <BreakdownTable
        title={t('moc.stats.by_type')}
        rows={data.by_type.map((s) => ({
          label: s.modification_type === 'permanent' ? t('moc.type_permanent') : s.modification_type === 'temporary' ? t('moc.type_temporary') : '—',
          count: s.count,
          percentage: s.percentage,
        }))}
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string | number
  icon: typeof LayoutDashboard
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-muted-foreground" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string
  rows: { label: string; count: number; percentage?: number }[]
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="divide-y divide-border/50">
        {rows.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground/60">Aucune donnée</div>
        ) : (
          rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2">
              <span className="text-xs text-foreground">{r.label}</span>
              <div className="flex items-center gap-3">
                {r.percentage !== undefined && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {r.percentage}%
                  </span>
                )}
                <span className="text-xs font-semibold tabular-nums">{r.count}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default MOCPage
