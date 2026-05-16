/**
 * DashboardTab.v2.tsx — Pajamas++ refonte du dashboard PaxLog.
 *
 * Drop-in remplacement de DashboardTab.tsx. Mêmes hooks que l'existant
 * (useAdsList, usePaxProfiles, useComplianceStats, useExpiringCredentials,
 * usePaxIncidents). Pattern Pajamas++ : page header + stat rail + 2 colonnes
 * (alertes + activité récente).
 */
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { Users, ClipboardList, AlertTriangle, Shield, Clock, FileText, Activity, ChevronRight } from 'lucide-react'
import {
  useAdsList, usePaxProfiles, useComplianceStats,
  useExpiringCredentials, usePaxIncidents,
} from '@/hooks/usePaxlog'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { PanelContent } from '@/components/layout/PanelHeader'
import { ADS_STATUS_LABELS_FALLBACK, ADS_STATUS_BADGES, StatusBadge, CountdownBadge, formatDate } from '../shared'
import { PaxlogPageHeader, PaxlogStatRail } from '../components/PaxlogShell'

export function DashboardTabV2() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: adsData } = useAdsList({ page: 1, page_size: 20 })
  const { data: profilesData } = usePaxProfiles({ page: 1, page_size: 5 })
  const { data: complianceStats } = useComplianceStats()
  const { data: expiringCreds } = useExpiringCredentials(30)
  const { data: incidentsData } = usePaxIncidents({ page: 1, page_size: 5, active_only: true })
  const adsStatusLabels = useDictionaryLabels('pax_ads_status', ADS_STATUS_LABELS_FALLBACK)
  const visitCategoryLabels = useDictionaryLabels('visit_category')

  const paxOnSite = profilesData?.total ?? 0
  const adsPending = useMemo(() => {
    if (!adsData?.items) return 0
    return adsData.items.filter((a) => ['submitted', 'pending_compliance', 'pending_validation', 'pending_arbitration'].includes(a.status)).length
  }, [adsData])
  const activeSignalements = incidentsData?.total ?? 0
  const complianceRate = complianceStats?.compliance_rate ?? 0
  const expiringCount = expiringCreds?.length ?? 0
  const recentAds = adsData?.items?.slice(0, 6) ?? []

  return (
    <>
      <PaxlogPageHeader
        title={t('paxlog.tabs.dashboard', 'Tableau de bord')}
        subtitle={t('paxlog.dashboard.subtitle', 'Vue d’ensemble — opérations PaxLog')}
      />

      <PaxlogStatRail items={[
        { id: 'pax',  label: t('paxlog.dashboard.kpi.registered_pax'), value: paxOnSite, icon: Users,
          onClick: () => navigate('/paxlog?tab=profiles') },
        { id: 'ads',  label: t('paxlog.dashboard.kpi.pending_ads'), value: adsPending,
          icon: ClipboardList, tone: adsPending > 0 ? 'warning' : undefined,
          onClick: () => navigate('/paxlog?tab=ads&status=pending_validation') },
        { id: 'sig',  label: t('paxlog.dashboard.kpi.active_incidents'), value: activeSignalements,
          icon: AlertTriangle, tone: activeSignalements > 0 ? 'danger' : undefined,
          onClick: () => navigate('/paxlog?tab=signalements') },
        { id: 'exp',  label: t('paxlog.dashboard.kpi.expiring_30d', 'Habilitations < 30 j'), value: expiringCount,
          icon: Clock, tone: expiringCount > 0 ? 'warning' : undefined,
          onClick: () => navigate('/paxlog?tab=compliance') },
        { id: 'rate', label: t('paxlog.dashboard.kpi.compliance_rate'), value: `${complianceRate}%`,
          icon: Shield,
          tone: complianceRate >= 90 ? 'success' : complianceRate >= 70 ? 'warning' : 'danger' },
      ]} />

      <PanelContent>
        <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* AdS récents — colspan 2 */}
          <section className="lg:col-span-2 paxlog-card">
            <header className="paxlog-card__head">
              <h3>{t('paxlog.dashboard.sections.recent_ads', 'AdS récents')}</h3>
              <span className="paxlog-card__count">{recentAds.length}</span>
              <button className="paxlog-card__more" onClick={() => navigate('/paxlog?tab=ads')}>
                {t('common.see_all', 'Tout voir')} <ChevronRight size={11} />
              </button>
            </header>
            <ul className="paxlog-list">
              {recentAds.length === 0 && (
                <li className="paxlog-list__empty">{t('paxlog.no_ads_recent')}</li>
              )}
              {recentAds.map((ads) => (
                <li key={ads.id} className="paxlog-list__row" onClick={() => navigate(`/paxlog/ads/${ads.id}`)}>
                  <div className="paxlog-list__main">
                    <span className="paxlog-list__ref">{ads.reference}</span>
                    <span className="paxlog-list__title">
                      {visitCategoryLabels[ads.visit_category] || ads.visit_category}
                    </span>
                    <span className="paxlog-list__meta">
                      {formatDate(ads.start_date)} → {formatDate(ads.end_date)}
                    </span>
                  </div>
                  <div className="paxlog-list__aside">
                    <span className="paxlog-list__pax"><Users size={11} /> {ads.pax_count}</span>
                    <StatusBadge status={ads.status} labels={adsStatusLabels} badges={ADS_STATUS_BADGES} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Habilitations expirantes */}
          <section className="paxlog-card">
            <header className="paxlog-card__head">
              <h3>{t('paxlog.dashboard.sections.expiring_credentials', 'Habilitations à renouveler')}</h3>
              <span className="paxlog-card__count">{expiringCount}</span>
            </header>
            <ul className="paxlog-list">
              {(expiringCreds ?? []).slice(0, 6).map((c) => (
                <li key={c.id} className="paxlog-list__row">
                  <div className="paxlog-list__main">
                    <span className="paxlog-list__title">{c.pax_last_name} {c.pax_first_name}</span>
                    <span className="paxlog-list__meta">{c.credential_type_name}</span>
                  </div>
                  <CountdownBadge days={c.days_remaining} />
                </li>
              ))}
              {expiringCount === 0 && <li className="paxlog-list__empty">{t('paxlog.no_certification_expiring_soon')}</li>}
            </ul>
          </section>

          {/* Activité — incidents récents */}
          <section className="paxlog-card">
            <header className="paxlog-card__head">
              <h3>{t('paxlog.dashboard.sections.incidents', 'Signalements actifs')}</h3>
              <span className="paxlog-card__count">{activeSignalements}</span>
              <button className="paxlog-card__more" onClick={() => navigate('/paxlog?tab=signalements')}>
                {t('common.see_all')} <ChevronRight size={11} />
              </button>
            </header>
            <ul className="paxlog-list">
              {(incidentsData?.items ?? []).slice(0, 5).map((i) => (
                <li key={i.id} className="paxlog-list__row">
                  <div className="paxlog-list__main">
                    <span className="paxlog-list__title">
                      <AlertTriangle size={11} style={{ color: 'hsl(var(--warning))' }} /> {i.pax_last_name || i.company_name || '—'}
                    </span>
                    <span className="paxlog-list__meta">{i.description}</span>
                  </div>
                  <span className="paxlog-list__meta">{formatDate(i.incident_date)}</span>
                </li>
              ))}
              {activeSignalements === 0 && <li className="paxlog-list__empty">{t('paxlog.no_incident')}</li>}
            </ul>
          </section>

          {/* Quick links */}
          <section className="paxlog-card lg:col-span-2">
            <header className="paxlog-card__head">
              <h3>{t('paxlog.dashboard.sections.quick_links', 'Accès rapides')}</h3>
            </header>
            <div className="paxlog-quicklinks">
              <button onClick={() => navigate('/paxlog?tab=ads&action=new')}>
                <ClipboardList size={14} /> {t('paxlog.actions.new_ads', 'Nouvel AdS')}
              </button>
              <button onClick={() => navigate('/paxlog?tab=avm&action=new')}>
                <FileText size={14} /> {t('paxlog.actions.new_avm', 'Nouvel AVM')}
              </button>
              <button onClick={() => navigate('/paxlog?tab=signalements&action=new')}>
                <AlertTriangle size={14} /> {t('paxlog.actions.new_incident', 'Nouveau signalement')}
              </button>
              <button onClick={() => navigate('/paxlog?tab=rotations')}>
                <Activity size={14} /> {t('paxlog.tabs.rotations', 'Rotations')}
              </button>
            </div>
          </section>
        </div>
      </PanelContent>
    </>
  )
}
