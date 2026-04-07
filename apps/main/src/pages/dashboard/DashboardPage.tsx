/**
 * Dashboard page — Widget-based dashboard with tabs, grid layout, and widget catalog.
 *
 * Tab bar: [Mandatory tabs (locked)] [Personal tabs (closable)] [+ Add]
 * Content area: CSS Grid 12-column widget layout
 * Edit mode: toggle to add/remove/rearrange widgets
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Settings2,
  Check,
  Plus,
  X,
  Lock,
  Pencil,
  MapPin,
  Users,
  Building2,
  RefreshCw,
  Loader2,
  TrendingUp,
  ClipboardList,
  BarChart3,
  GripVertical,
  Undo2,
  Redo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PanelHeader, PanelContent } from '@/components/layout/PanelHeader'
import { Banner } from '@/components/ui/Banner'
import { usePermission } from '@/hooks/usePermission'
import { useAuthStore } from '@/stores/authStore'
import {
  useDashboardTabs,
  useDashboardStats,
  useCreateDashboardTab,
  useUpdateDashboardTab,
  useDeleteDashboardTab,
  useWidgetCatalog,
} from '@/hooks/useDashboard'
import { useAuditLog } from '@/hooks/useSettings'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { DashboardEditorLayout } from '@/components/dashboard/DashboardEditorLayout'
import type { DashboardEditorHandle } from '@/components/dashboard/DashboardEditorLayout'
import type { DashboardWidget, DashboardTab, UserDashboardTab } from '@/services/dashboardService'

// ── Relative time formatting ──────────────────────────────────

const DIVISIONS: { amount: number; name: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, name: 'seconds' },
  { amount: 60, name: 'minutes' },
  { amount: 24, name: 'hours' },
  { amount: 7, name: 'days' },
  { amount: 4.34524, name: 'weeks' },
  { amount: 12, name: 'months' },
  { amount: Number.POSITIVE_INFINITY, name: 'years' },
]

function getRelativeTime(dateStr: string, lang: string): string {
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  let duration = (new Date(dateStr).getTime() - Date.now()) / 1000

  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.name)
    }
    duration /= division.amount
  }
  return rtf.format(Math.round(duration), 'years')
}

// ── Action color mapping ──────────────────────────────────────

function getActionDotClass(action: string): string {
  const a = action.toLowerCase()
  if (a.includes('create') || a.includes('add')) return 'bg-green-500'
  if (a.includes('update') || a.includes('modify') || a.includes('edit')) return 'bg-blue-500'
  if (a.includes('delete') || a.includes('remove') || a.includes('archive')) return 'bg-red-500'
  return 'bg-gray-400'
}

function formatAction(action: string, resourceType: string, resourceId: string | null, t: (key: string) => string): string {
  const verb = t(`dashboard.action_${action.toLowerCase()}`) || action
  const type = resourceType || t('dashboard.unknown_resource')
  const id = resourceId ? ` ${resourceId}` : ''
  return `${verb} ${type}${id}`
}

// ── Unified Tab type ──────────────────────────────────────────

interface UnifiedTab {
  id: string
  name: string
  is_mandatory: boolean
  is_closable: boolean
  tab_order: number
  widgets: DashboardWidget[]
  icon: string | null
}

function unifyTabs(
  mandatory: DashboardTab[],
  personal: UserDashboardTab[],
): UnifiedTab[] {
  const mandatoryUnified: UnifiedTab[] = (mandatory || []).map((t) => ({
    id: t.id,
    name: t.name,
    is_mandatory: true,
    is_closable: false,
    tab_order: t.tab_order,
    widgets: t.widgets || [],
    icon: t.icon || null,
  }))

  const personalUnified: UnifiedTab[] = (personal || []).map((t) => ({
    id: t.id,
    name: t.name,
    is_mandatory: false,
    is_closable: true,
    tab_order: t.tab_order,
    widgets: t.widgets || [],
    icon: null,
  }))

  return [...mandatoryUnified, ...personalUnified].sort((a, b) => a.tab_order - b.tab_order)
}


// ── Main Page ─────────────────────────────────────────────────

export function DashboardPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { hasPermission } = usePermission()
  const canCustomize = hasPermission('dashboard.customize')
  const canAdmin = hasPermission('dashboard.admin') // reserved for system-wide dashboard management
  void canAdmin
  const lang = i18n.language?.startsWith('fr') ? 'fr' : 'en'

  // Data fetching
  const { data: tabsData } = useDashboardTabs()
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: catalog } = useWidgetCatalog()
  const {
    data: auditData,
    isLoading: auditLoading,
    refetch: refetchAudit,
    isFetching: auditFetching,
  } = useAuditLog({ page: 1, page_size: 5 })

  // Mutations
  const createTab = useCreateDashboardTab()
  const updateTab = useUpdateDashboardTab()
  const deleteTab = useDeleteDashboardTab()

  // Editor ref
  const editorRef = useRef<DashboardEditorHandle>(null)

  // State
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editingTabName, setEditingTabName] = useState<string | null>(null)
  const [tabNameDraft, setTabNameDraft] = useState('')

  // Unify tabs
  const allTabs = useMemo(() => {
    if (!tabsData) return []
    return unifyTabs(tabsData.mandatory, tabsData.personal)
  }, [tabsData])

  // If we have no tabs from the API, show built-in "Overview" + "My activity" tabs
  const hasApiTabs = allTabs.length > 0
  const builtinTabs: UnifiedTab[] = useMemo(() => {
    if (hasApiTabs) return []
    return [
      {
        id: '__builtin_overview',
        name: t('dashboard.tab_overview'),
        is_mandatory: true,
        is_closable: false,
        tab_order: 0,
        widgets: [],
        icon: null,
      },
      {
        id: '__builtin_activity',
        name: t('dashboard.tab_activity'),
        is_mandatory: true,
        is_closable: false,
        tab_order: 1,
        widgets: [],
        icon: null,
      },
    ]
  }, [hasApiTabs, t])

  const displayTabs = hasApiTabs ? allTabs : builtinTabs

  // Auto-select first tab
  useEffect(() => {
    if (!activeTabId && displayTabs.length > 0) {
      setActiveTabId(displayTabs[0].id)
    }
  }, [displayTabs, activeTabId])

  const activeTab = displayTabs.find((tab) => tab.id === activeTabId) || displayTabs[0]

  // Handlers
  const handleAddTab = useCallback(() => {
    const newName = `${t('dashboard.personal_tab')} ${(tabsData?.personal?.length || 0) + 1}`
    createTab.mutate({ name: newName }, {
      onSuccess: (newTab) => {
        setActiveTabId(newTab.id)
      },
    })
  }, [createTab, tabsData, t])

  const confirm = useConfirm()
  const handleDeleteTab = useCallback(async (tabId: string) => {
    const ok = await confirm({
      title: 'Supprimer cet onglet ?',
      message: 'Cette action est irréversible. Tous les widgets de cet onglet seront perdus.',
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    deleteTab.mutate(tabId, {
      onSuccess: () => {
        if (activeTabId === tabId) {
          setActiveTabId(displayTabs[0]?.id || null)
        }
      },
    })
  }, [confirm, deleteTab, activeTabId, displayTabs])

  const handleStartRenameTab = useCallback((tabId: string, currentName: string) => {
    setEditingTabName(tabId)
    setTabNameDraft(currentName)
  }, [])

  const handleFinishRenameTab = useCallback(() => {
    if (editingTabName && tabNameDraft.trim()) {
      updateTab.mutate({ id: editingTabName, name: tabNameDraft.trim() })
    }
    setEditingTabName(null)
    setTabNameDraft('')
  }, [editingTabName, tabNameDraft, updateTab])

  // Widget add/remove is now handled by DashboardEditorLayout

  // Quick actions (used in built-in overview)
  const quickActions = [
    { labelKey: 'dashboard.qa_new_asset', icon: MapPin, path: '/assets' },
    { labelKey: 'dashboard.qa_new_tier', icon: Building2, path: '/tiers' },
    { labelKey: 'dashboard.qa_my_tasks', icon: ClipboardList, path: '/workflow' },
    { labelKey: 'dashboard.qa_reports', icon: BarChart3, path: '/settings' },
  ]

  // Stats cards for built-in overview
  const statsCards = [
    { labelKey: 'dashboard.active_assets', value: stats?.assets_count, icon: MapPin, trendKey: 'dashboard.trend_assets' },
    { labelKey: 'dashboard.users', value: stats?.users_count, icon: Users, sublabelKey: 'dashboard.users_active' },
    { labelKey: 'dashboard.companies', value: stats?.tiers_count, icon: Building2, sublabelKey: 'dashboard.tiers_active' },
    { labelKey: 'dashboard.active_workflows', value: stats?.active_workflows, icon: ClipboardList },
    { labelKey: 'dashboard.recent_activity', value: stats?.recent_activity_count, icon: BarChart3 },
  ]

  // Determine what to render in content area
  const isBuiltinOverview = activeTab?.id === '__builtin_overview'
  const isBuiltinActivity = activeTab?.id === '__builtin_activity'
  const isBuiltin = isBuiltinOverview || isBuiltinActivity

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        icon={LayoutDashboard}
        title={t('dashboard.title')}
        subtitle={`${t('dashboard.welcome')}, ${user?.first_name || 'User'}`}
      />

      {/* Tab bar */}
      <div className="flex items-center h-10 border-b border-border bg-background px-4 gap-0 flex-shrink-0">
        {displayTabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            active={activeTab?.id === tab.id}
            editMode={editMode}
            isRenaming={editingTabName === tab.id}
            renameDraft={tabNameDraft}
            onRenameDraftChange={setTabNameDraft}
            onFinishRename={handleFinishRenameTab}
            onClick={() => setActiveTabId(tab.id)}
            onClose={canCustomize && tab.is_closable ? () => handleDeleteTab(tab.id) : undefined}
            onStartRename={
              canCustomize && !tab.is_mandatory && editMode
                ? () => handleStartRenameTab(tab.id, tab.name)
                : undefined
            }
          />
        ))}

        {/* Add tab button */}
        {canCustomize && (
          <button
            type="button"
            onClick={handleAddTab}
            disabled={createTab.isPending}
            className="h-9 px-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title={t('dashboard.add_tab')}
          >
            {createTab.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
          </button>
        )}

        {/* Right side: edit mode toggle */}
        <div className="ml-auto flex items-center gap-1.5">
          {canCustomize && !isBuiltin && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors hover:bg-muted text-muted-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" />
              {t('dashboard.edit_dashboard')}
            </button>
          )}
          {canCustomize && !isBuiltin && editMode && (
            <>
              <button
                onClick={() => editorRef.current?.undo()}
                disabled={!editorRef.current?.canUndo}
                className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium transition-colors hover:bg-muted text-muted-foreground disabled:opacity-30"
                title="Annuler (Ctrl+Z)"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => editorRef.current?.redo()}
                disabled={!editorRef.current?.canRedo}
                className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium transition-colors hover:bg-muted text-muted-foreground disabled:opacity-30"
                title="Refaire (Ctrl+Y)"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
              <div className="w-px h-4 bg-border mx-1" />
            </>
          )}
          {canCustomize && !isBuiltin && editMode && (
            <button
              onClick={() => {
                editorRef.current?.flushSave()
                setEditMode(false)
              }}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Check className="h-3.5 w-3.5" />
              {t('dashboard.save_dashboard')}
            </button>
          )}
          {canCustomize && !isBuiltin && editMode && (
            <button
              onClick={() => {
                editorRef.current?.discardChanges()
                setEditMode(false)
              }}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors hover:bg-muted text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Annuler
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <PanelContent className="p-4">
        {/* Banners (only on built-in overview) */}
        {isBuiltinOverview && (
          <div className="space-y-3 mb-4">
            <Banner
              variant="promo"
              title="Bienvenue sur OpsFlux"
              description="Explorez les fonctionnalites de gestion d'assets, tiers et workflows. Utilisez Ctrl+K pour la recherche rapide."
              action={{ label: 'Découvrir', onClick: () => navigate('/search') }}
              dismissKey="banner:welcome-v1"
            />
          </div>
        )}

        {/* Built-in Overview content */}
        {isBuiltinOverview && (
          <div className="space-y-6">
            {/* Stats cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {statsCards.map((card) => {
                const Icon = card.icon
                return (
                  <div key={card.labelKey} className="rounded border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t(card.labelKey)}</span>
                      <Icon size={16} className="text-muted-foreground" />
                    </div>
                    <div className="mt-2">
                      {statsLoading ? (
                        <Loader2 size={16} className="animate-spin text-muted-foreground" />
                      ) : (
                        <p className="text-3xl font-semibold text-foreground">{card.value ?? 0}</p>
                      )}
                    </div>
                    {card.sublabelKey && !statsLoading && (
                      <p className="mt-1 text-xs text-muted-foreground">{t(card.sublabelKey)}</p>
                    )}
                    {card.trendKey && !statsLoading && (card.value ?? 0) > 0 && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <TrendingUp size={12} />
                        <span>{t(card.trendKey)}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Recent activity */}
            <div className="rounded border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">{t('dashboard.recent_activity')}</h2>
                <button
                  onClick={() => refetchAudit()}
                  disabled={auditFetching}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} className={auditFetching ? 'animate-spin' : ''} />
                  {t('dashboard.refresh')}
                </button>
              </div>
              <div className="divide-y divide-border">
                {auditLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={16} className="animate-spin text-muted-foreground" />
                  </div>
                ) : auditData?.items && auditData.items.length > 0 ? (
                  auditData.items.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${getActionDotClass(entry.action)}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground truncate">
                          {formatAction(entry.action, entry.resource_type, entry.resource_id, t)}
                        </p>
                        <p className="text-xs text-muted-foreground">{getRelativeTime(entry.created_at, lang)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {t('dashboard.no_activity')}
                  </div>
                )}
              </div>
              {auditData?.items && auditData.items.length > 0 && (
                <div className="border-t border-border px-4 py-2">
                  <button onClick={() => navigate('/settings')} className="text-xs text-primary hover:underline">
                    {t('dashboard.view_all')}
                  </button>
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div className="rounded border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">{t('dashboard.quick_actions')}</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                {quickActions.map((action) => {
                  const Icon = action.icon
                  return (
                    <button
                      key={action.labelKey}
                      onClick={() => navigate(action.path)}
                      className="flex items-center gap-2 rounded border border-border p-3 text-sm text-foreground transition-colors hover:bg-accent"
                    >
                      <Icon size={16} className="text-muted-foreground shrink-0" />
                      <span className="truncate">{t(action.labelKey)}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Widget zone placeholder */}
            <div className="rounded border border-dashed border-border p-8 text-center">
              <GripVertical size={32} className="mx-auto text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">{t('dashboard.widgets_zone')}</p>
              <p className="mt-1 text-xs text-muted-foreground/70">{t('dashboard.widgets_hint')}</p>
            </div>
          </div>
        )}

        {/* Built-in Activity tab */}
        {isBuiltinActivity && (
          <div className="space-y-4">
            <div className="rounded border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">{t('dashboard.tab_activity')}</h2>
                <button
                  onClick={() => refetchAudit()}
                  disabled={auditFetching}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} className={auditFetching ? 'animate-spin' : ''} />
                  {t('dashboard.refresh')}
                </button>
              </div>
              <div className="divide-y divide-border">
                {auditLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={16} className="animate-spin text-muted-foreground" />
                  </div>
                ) : auditData?.items && auditData.items.length > 0 ? (
                  auditData.items.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${getActionDotClass(entry.action)}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground">
                          {formatAction(entry.action, entry.resource_type, entry.resource_id, t)}
                        </p>
                        <p className="text-xs text-muted-foreground">{getRelativeTime(entry.created_at, lang)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {t('dashboard.no_activity')}
                  </div>
                )}
              </div>
              {auditData?.items && auditData.items.length > 0 && (
                <div className="border-t border-border px-4 py-2">
                  <button onClick={() => navigate('/settings')} className="text-xs text-primary hover:underline">
                    {t('dashboard.view_all')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Widget grid for API-backed tabs (view mode) */}
        {!isBuiltin && !editMode && (
          <DashboardGrid
            widgets={activeTab?.widgets || []}
            mode="view"
          />
        )}
      </PanelContent>

      {/* Full-height editor layout (edit mode) — replaces PanelContent */}
      {canCustomize && !isBuiltin && editMode && activeTab && catalog && (
        <DashboardEditorLayout
          ref={editorRef}
          tabId={activeTab.id}
          initialWidgets={activeTab.widgets || []}
          catalog={catalog}
          onExitEdit={() => setEditMode(false)}
        />
      )}
    </div>
  )
}

// ── Tab Button Component ──────────────────────────────────────

interface TabButtonProps {
  tab: UnifiedTab
  active: boolean
  editMode: boolean
  isRenaming: boolean
  renameDraft: string
  onRenameDraftChange: (val: string) => void
  onFinishRename: () => void
  onClick: () => void
  onClose?: () => void
  onStartRename?: () => void
}

function TabButton({
  tab,
  active,
  editMode,
  isRenaming,
  renameDraft,
  onRenameDraftChange,
  onFinishRename,
  onClick,
  onClose,
  onStartRename,
}: TabButtonProps) {
  return (
    <div className="relative flex items-center group pointer-events-none">
      <button
        onClick={onClick}
        className={cn(
          'pointer-events-auto relative h-9 px-3 text-sm font-medium transition-colors flex items-center gap-1.5',
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {tab.is_mandatory && <Lock size={10} className="text-muted-foreground/50 shrink-0" />}

        {isRenaming ? (
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => onRenameDraftChange(e.target.value)}
            onBlur={onFinishRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onFinishRename()
              if (e.key === 'Escape') onFinishRename()
            }}
            className="bg-transparent border-b border-primary text-sm font-medium outline-none w-24 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate max-w-[120px]">{tab.name}</span>
        )}

        {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />}
      </button>

      {/* Edit actions — sibling outside tab button */}
      {editMode && !tab.is_mandatory && !isRenaming && onStartRename && (
        <button
          onClick={(e) => { e.stopPropagation(); onStartRename() }}
          className="pointer-events-auto h-5 w-5 -ml-1 inline-flex items-center justify-center rounded hover:bg-muted"
          title="Renommer"
        >
          <Pencil size={9} className="text-muted-foreground" />
        </button>
      )}

      {/* Close button — sibling outside tab button, with confirmation */}
      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onClose()
          }}
          className="pointer-events-auto h-5 w-5 ml-0.5 inline-flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          title="Supprimer cet onglet"
        >
          <X size={11} className="text-muted-foreground hover:text-destructive" />
        </button>
      )}
    </div>
  )
}
