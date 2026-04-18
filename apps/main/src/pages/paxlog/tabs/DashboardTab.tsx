import { useTranslation } from 'react-i18next'
import { useAdsList, usePaxProfiles, useComplianceStats, useExpiringCredentials, usePaxIncidents } from '@/hooks/usePaxlog'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useMemo } from 'react'
import { PanelContent } from '@/components/layout/PanelHeader'
import { Users, ClipboardList, AlertTriangle, Percent, Shield, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { ADS_STATUS_LABELS_FALLBACK, ADS_STATUS_BADGES, StatCard, StatusBadge, CountdownBadge, formatDate } from '../shared'

export function DashboardTab() {
  const { t } = useTranslation()
  const { data: adsData } = useAdsList({ page: 1, page_size: 10 })
  const { data: profilesData } = usePaxProfiles({ page: 1, page_size: 5 })
  const { data: complianceStats } = useComplianceStats()
  const { data: expiringCreds } = useExpiringCredentials(30)
  const { data: incidentsData } = usePaxIncidents({ page: 1, page_size: 5, active_only: true })
  const visitCategoryLabels = useDictionaryLabels('visit_category')
  const adsStatusLabels = useDictionaryLabels('pax_ads_status', ADS_STATUS_LABELS_FALLBACK)

  const paxOnSite = profilesData?.total ?? 0
  const adsPending = useMemo(() => {
    if (!adsData?.items) return 0
    return adsData.items.filter((a) => ['submitted', 'pending_compliance', 'pending_validation'].includes(a.status)).length
  }, [adsData])
  const activeSignalements = incidentsData?.total ?? 0
  const complianceRate = complianceStats?.compliance_rate ?? 0

  // ADS by status for display
  const recentAds = adsData?.items ?? []
  const expiringList = expiringCreds?.slice(0, 8) ?? []

  const adsStatusCounts = useMemo(() => {
    if (!adsData?.items) return {} as Record<string, number>
    const counts: Record<string, number> = {}
    adsData.items.forEach((a) => { counts[a.status] = (counts[a.status] || 0) + 1 })
    return counts
  }, [adsData])

  return (
    <PanelContent>
      <div className="p-4 space-y-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={t('paxlog.dashboard.kpi.registered_pax')} value={paxOnSite} icon={Users} />
          <StatCard label={t('paxlog.dashboard.kpi.pending_ads')} value={adsPending} icon={ClipboardList} accent={adsPending > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
          <StatCard label={t('paxlog.dashboard.kpi.active_incidents')} value={activeSignalements} icon={AlertTriangle} accent={activeSignalements > 0 ? 'text-destructive' : undefined} />
          <StatCard label={t('paxlog.dashboard.kpi.compliance_rate')} value={`${complianceRate}%`} icon={Shield} accent={complianceRate >= 90 ? 'text-emerald-600 dark:text-emerald-400' : complianceRate >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-destructive'} />
        </div>

        {/* AdS by status visual */}
        <CollapsibleSection id="dash-ads-status" title={t('paxlog.dashboard.sections.ads_by_status')} defaultExpanded>
          <div className="flex flex-wrap gap-2">
            {Object.entries(adsStatusCounts).map(([status, count]) => {
              return (
                <div key={status} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-background">
                  <span className={cn('gl-badge', ADS_STATUS_BADGES[status] || 'gl-badge-neutral')}>{adsStatusLabels[status] ?? status}</span>
                  <span className="text-sm font-semibold tabular-nums">{count}</span>
                </div>
              )
            })}
            {Object.keys(adsStatusCounts).length === 0 && (
              <p className="text-xs text-muted-foreground italic">{t('paxlog.no_ads_registered')}</p>
            )}
          </div>
        </CollapsibleSection>

        {/* Recent AdS */}
        <CollapsibleSection id="dash-recent-ads" title={t('paxlog.dashboard.sections.recent_ads')} defaultExpanded>
          {recentAds.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">{t('paxlog.no_ads_recent')}</p>
          ) : (
            <div className="space-y-1">
              {recentAds.slice(0, 6).map((ads) => (
                <div key={ads.id} className="flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-accent/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium font-mono text-foreground">{ads.reference}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {visitCategoryLabels[ads.visit_category] || ads.visit_category}
                      {' — '}
                      {formatDate(ads.start_date)} → {formatDate(ads.end_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Users size={11} /> {ads.pax_count}
                    </span>
                    <StatusBadge status={ads.status} labels={adsStatusLabels} badges={ADS_STATUS_BADGES} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Expiring credentials */}
        <CollapsibleSection id="dash-expiring-creds" title={t('paxlog.dashboard.sections.expiring_credentials')} defaultExpanded>
          {expiringList.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">{t('paxlog.no_certification_expiring')}</p>
          ) : (
            <div className="space-y-1">
              {expiringList.map((cred) => (
                <div key={cred.id} className="flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-accent/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">{cred.pax_last_name} {cred.pax_first_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {cred.credential_type_name}
                      {cred.pax_company_name && ` — ${cred.pax_company_name}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{formatDate(cred.expiry_date)}</span>
                    <CountdownBadge days={cred.days_remaining} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Compliance stats */}
        {complianceStats && (
          <CollapsibleSection id="dash-compliance-stats" title={t('paxlog.dashboard.sections.compliance_stats')}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label={t('paxlog.dashboard.kpi.total_pax')} value={complianceStats.total_pax} icon={Users} />
              <StatCard label={t('paxlog.dashboard.kpi.compliant')} value={complianceStats.compliant_pax} icon={CheckCircle2} accent="text-emerald-600 dark:text-emerald-400" />
              <StatCard label={t('paxlog.dashboard.kpi.non_compliant')} value={complianceStats.non_compliant_pax} icon={XCircle} accent={complianceStats.non_compliant_pax > 0 ? 'text-destructive' : undefined} />
              <StatCard label={t('paxlog.dashboard.kpi.expiring_soon')} value={complianceStats.expiring_soon} icon={Clock} accent="text-amber-600 dark:text-amber-400" />
              <StatCard label={t('paxlog.dashboard.kpi.expired')} value={complianceStats.expired} icon={AlertTriangle} accent={complianceStats.expired > 0 ? 'text-destructive' : undefined} />
              <StatCard label={t('paxlog.dashboard.kpi.compliance_rate')} value={`${complianceStats.compliance_rate}%`} icon={Percent} />
            </div>
          </CollapsibleSection>
        )}
      </div>
    </PanelContent>
  )
}

void DashboardTab

