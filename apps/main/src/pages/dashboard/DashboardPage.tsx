/**
 * Dashboard page — Pajamas Pattern: PanelHeader + tabs + stats + activity + quick actions + widgets.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useDashboardStats } from '@/hooks/useDashboard'
import { useAuditLog } from '@/hooks/useSettings'
import { PanelHeader, PanelContent } from '@/components/layout/PanelHeader'
import { Banner } from '@/components/ui/Banner'
import {
  LayoutDashboard,
  MapPin,
  Users,
  Building2,
  Plus,
  ClipboardList,
  BarChart3,
  RefreshCw,
  GripVertical,
  Loader2,
  TrendingUp,
} from 'lucide-react'

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

// ── Tabs ──────────────────────────────────────────────────────

type TabId = 'overview' | 'activity'

export function DashboardPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const {
    data: auditData,
    isLoading: auditLoading,
    refetch: refetchAudit,
    isFetching: auditFetching,
  } = useAuditLog({ page: 1, page_size: 5 })

  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const lang = i18n.language?.startsWith('fr') ? 'fr' : 'en'

  // ── Stat cards ──────────────────────────────────────────────

  const cards = [
    {
      labelKey: 'dashboard.active_assets',
      value: stats?.assets_count,
      icon: MapPin,
      trendKey: 'dashboard.trend_assets',
    },
    {
      labelKey: 'dashboard.users',
      value: stats?.users_count,
      icon: Users,
      sublabelKey: 'dashboard.users_active',
    },
    {
      labelKey: 'dashboard.companies',
      value: stats?.tiers_count,
      icon: Building2,
      sublabelKey: 'dashboard.tiers_active',
    },
  ]

  // ── Quick actions ───────────────────────────────────────────

  const quickActions = [
    {
      labelKey: 'dashboard.qa_new_asset',
      icon: MapPin,
      path: '/assets',
    },
    {
      labelKey: 'dashboard.qa_new_tier',
      icon: Building2,
      path: '/tiers',
    },
    {
      labelKey: 'dashboard.qa_my_tasks',
      icon: ClipboardList,
      path: '/workflow',
    },
    {
      labelKey: 'dashboard.qa_reports',
      icon: BarChart3,
      path: '/settings',
    },
  ]

  // ── Tabs config ─────────────────────────────────────────────

  const tabs: { id: TabId; labelKey: string }[] = [
    { id: 'overview', labelKey: 'dashboard.tab_overview' },
    { id: 'activity', labelKey: 'dashboard.tab_activity' },
  ]

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        icon={LayoutDashboard}
        title={t('dashboard.title')}
        subtitle={`${t('dashboard.welcome')}, ${user?.first_name || 'User'}`}
      />

      {/* ── Tab bar ──────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-border bg-background px-4 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              relative h-9 px-3 text-sm font-medium transition-colors
              ${activeTab === tab.id
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
              }
            `}
          >
            {t(tab.labelKey)}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />
            )}
          </button>
        ))}
        <button
          className="h-9 px-2 text-muted-foreground hover:text-foreground transition-colors"
          title={t('dashboard.add_tab')}
          disabled
        >
          <Plus size={14} />
        </button>
      </div>

      <PanelContent className="p-4">
        <div className="space-y-3 mb-4">
          <Banner
            variant="promo"
            title="Bienvenue sur OpsFlux"
            description="Explorez les fonctionnalites de gestion d'assets, tiers et workflows. Utilisez Ctrl+K pour la recherche rapide."
            action={{ label: 'Decouvrir', onClick: () => navigate('/search') }}
            dismissKey="banner:welcome-v1"
          />
          <Banner
            variant="info"
            title="Recherche avancee"
            description="Une nouvelle page de recherche est disponible. Recherchez des assets, tiers et utilisateurs depuis un seul endroit."
            action={{ label: 'Essayer', onClick: () => navigate('/search') }}
            dismissKey="banner:search-feature-v1"
            compact
          />
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* ── Stats cards ────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {cards.map((card) => {
                const Icon = card.icon
                return (
                  <div
                    key={card.labelKey}
                    className="rounded border border-border bg-card p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t(card.labelKey)}
                      </span>
                      <Icon size={16} className="text-muted-foreground" />
                    </div>
                    <div className="mt-2">
                      {statsLoading ? (
                        <Loader2 size={16} className="animate-spin text-muted-foreground" />
                      ) : (
                        <p className="text-3xl font-semibold text-foreground">
                          {card.value ?? 0}
                        </p>
                      )}
                    </div>
                    {card.sublabelKey && !statsLoading && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(card.sublabelKey)}
                      </p>
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

            {/* ── Activité récente ───────────────────────────── */}
            <div className="rounded border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">
                  {t('dashboard.recent_activity')}
                </h2>
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
                      <span
                        className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${getActionDotClass(entry.action)}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground truncate">
                          {formatAction(entry.action, entry.resource_type, entry.resource_id, t)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {getRelativeTime(entry.created_at, lang)}
                        </p>
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
                  <button
                    onClick={() => navigate('/settings')}
                    className="text-xs text-primary hover:underline"
                  >
                    {t('dashboard.view_all')}
                  </button>
                </div>
              )}
            </div>

            {/* ── Quick actions ──────────────────────────────── */}
            <div className="rounded border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">
                  {t('dashboard.quick_actions')}
                </h2>
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

            {/* ── Widget zone placeholder ────────────────────── */}
            <div className="rounded border border-dashed border-border p-8 text-center">
              <GripVertical size={32} className="mx-auto text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">
                {t('dashboard.widgets_zone')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                {t('dashboard.widgets_hint')}
              </p>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="space-y-4">
            {/* ── Full activity feed on the "Mon activité" tab ── */}
            <div className="rounded border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">
                  {t('dashboard.tab_activity')}
                </h2>
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
                      <span
                        className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${getActionDotClass(entry.action)}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground">
                          {formatAction(entry.action, entry.resource_type, entry.resource_id, t)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {getRelativeTime(entry.created_at, lang)}
                        </p>
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
                  <button
                    onClick={() => navigate('/settings')}
                    className="text-xs text-primary hover:underline"
                  >
                    {t('dashboard.view_all')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </PanelContent>
    </div>
  )
}
