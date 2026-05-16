/**
 * AdsDetailPanel.v2.tsx — Pajamas++ refonte du panneau de détail ADS.
 *
 * Architecture inspirée du HTML de référence (ADS Detail Panel v2.html) :
 *   - Header sticky (ref + titre + chips + meta + actions)
 *   - Workflow stepper basé sur le modèle SQL (status check constraint)
 *   - Tabs : Synthèse / Passagers / Conformité / Transport / PJ / Historique
 *   - Footer sticky (actions selon état FSM)
 *
 * Drop-in dans <DynamicPanelShell>. Réutilise :
 *   - useAds(id), useAdsEvents(id), useAdsCompliance(id)
 *   - PanelContentLayout, FormSection (DynamicPanel)
 *   - DataTable pour Passagers / PJ
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FileText, Users, Shield, Truck, Paperclip, History,
  ExternalLink, Printer, X, AlertTriangle,
} from 'lucide-react'
import { useAds, useAdsPax, useAdsEvents } from '@/hooks/usePaxlog'
import { useUIStore } from '@/stores/uiStore'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { DynamicPanelShell } from '@/components/layout/DynamicPanel'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { ADS_STATUS_LABELS_FALLBACK, ADS_STATUS_BADGES, formatDate, formatDateTime } from '../shared'
import { PaxlogStepper, PaxlogStateStrip, type StepperStep } from '../components/PaxlogShell'

// AdS lifecycle steps from the SQL CHECK constraint on ads.status :
//   draft | submitted | pending_initiator_review | pending_project_review |
//   pending_compliance | pending_validation | approved | rejected | cancelled |
//   requires_review | pending_arbitration | in_progress | completed
const STATUS_ORDER = [
  'draft', 'submitted', 'pending_project_review', 'pending_compliance',
  'pending_validation', 'pending_arbitration', 'approved', 'in_progress', 'completed',
]
const TERMINAL_REJECT = ['rejected', 'cancelled']

type TabId = 'synthese' | 'passagers' | 'conformite' | 'transport' | 'pj' | 'historique'

export function AdsDetailPanelV2({ id }: { id: string }) {
  const { t } = useTranslation()
  const closePanel = useUIStore((s) => s.closeDynamicPanel)
  const adsStatusLabels = useDictionaryLabels('pax_ads_status', ADS_STATUS_LABELS_FALLBACK)
  const { data: ads, isLoading } = useAds(id)
  // Onglet Passagers/Conformité : la liste des pax vient d'un endpoint
  // dédié (/pax/ads/{id}/pax), pas du payload ads. Placeholder du package
  // `ads.pax_entries` remplacé par le hook useAdsPax (type AdsPax[]).
  const { data: adsPax } = useAdsPax(id)
  const { data: adsEvents } = useAdsEvents(id)
  const [tab, setTab] = useState<TabId>('synthese')

  if (isLoading || !ads) {
    return (
      <DynamicPanelShell title={t('common.loading')}>
        <div className="p-4 text-xs text-muted-foreground">{t('common.loading')}</div>
      </DynamicPanelShell>
    )
  }

  const steps: StepperStep[] = STATUS_ORDER.map((s) => {
    const i = STATUS_ORDER.indexOf(s)
    const cur = STATUS_ORDER.indexOf(ads.status)
    return {
      id: s,
      label: adsStatusLabels[s] || s,
      state: TERMINAL_REJECT.includes(ads.status) ? (s === 'draft' ? 'done' : 'pending')
        : i < cur ? 'done' : i === cur ? 'current' : 'pending',
    }
  })

  const paxList = adsPax ?? []
  const totalPax = ads.pax_count ?? paxList.length
  // AdsPax expose `compliant?: boolean|null` (enrichi) + `status: string`.
  const compliantPax = paxList.filter((p) => p.compliant === true).length
  const blockedPax = paxList.filter((p) => p.status === 'blocked' || p.status === 'rejected').length
  const toCheckPax = paxList.filter((p) => p.compliant !== true && p.status !== 'blocked' && p.status !== 'rejected').length

  const isArbitration = ads.status === 'pending_arbitration'

  return (
    <DynamicPanelShell title="" hideHeader>
      {/* Sticky header */}
      <header className="paxlog-detail-head">
        <div className="paxlog-detail-head__row">
          <div className="paxlog-detail-head__text">
            <h2 className="paxlog-detail-head__title">
              <span className="paxlog-detail-head__ref">{ads.reference}</span>
              <span className="paxlog-detail-head__name">{ads.visit_purpose}</span>
              <span className={`chip ${ADS_STATUS_BADGES[ads.status] || ''}`}>{adsStatusLabels[ads.status] || ads.status}</span>
              <span className="chip chip-info">{ads.type === 'team' ? `${t('paxlog.ads.type.team', 'Équipe')} · ${totalPax} pax` : t('paxlog.ads.type.individual', 'Individuel')}</span>
            </h2>
            <div className="paxlog-detail-head__meta">
              <strong>{ads.requester_name || '—'}</strong>
              <span className="sep">·</span>
              {ads.site_name}
              <span className="sep">·</span>
              <strong>{formatDate(ads.start_date)} → {formatDate(ads.end_date)}</strong>
            </div>
          </div>
          <div className="paxlog-detail-head__actions">
            <button className="btn-icon btn-sm" title={t('common.external_link', 'Lien externe')}><ExternalLink size={12} /></button>
            <button className="btn-icon btn-sm" title={t('common.print')}><Printer size={12} /></button>
            <button className="btn-icon btn-sm" aria-label={t('common.close')} onClick={() => closePanel()}><X size={12} /></button>
          </div>
        </div>
      </header>

      {/* Stepper */}
      <PaxlogStepper steps={steps} />

      {/* Tabs */}
      <nav className="paxlog-tabs">
        <button className={`paxlog-tab ${tab === 'synthese' ? 'is-active' : ''}`} onClick={() => setTab('synthese')}>
          <FileText size={12} /> {t('paxlog.ads.tabs.synthese', 'Synthèse')}
        </button>
        <button className={`paxlog-tab ${tab === 'passagers' ? 'is-active' : ''}`} onClick={() => setTab('passagers')}>
          <Users size={12} /> {t('paxlog.ads.tabs.passagers', 'Passagers')} <span className="paxlog-tab__badge">{totalPax}</span>
        </button>
        <button className={`paxlog-tab ${tab === 'conformite' ? 'is-active' : ''} ${blockedPax > 0 ? 'has-alert' : ''}`} onClick={() => setTab('conformite')}>
          <Shield size={12} /> {t('paxlog.ads.tabs.conformite', 'Conformité')}
          {blockedPax > 0 && <span className="paxlog-tab__badge">{blockedPax}</span>}
        </button>
        <button className={`paxlog-tab ${tab === 'transport' ? 'is-active' : ''}`} onClick={() => setTab('transport')}>
          <Truck size={12} /> {t('paxlog.ads.tabs.transport', 'Transport')}
        </button>
        <button className={`paxlog-tab ${tab === 'pj' ? 'is-active' : ''}`} onClick={() => setTab('pj')}>
          <Paperclip size={12} /> {t('paxlog.ads.tabs.attachments', 'Pièces jointes')}
        </button>
        <button className={`paxlog-tab ${tab === 'historique' ? 'is-active' : ''}`} onClick={() => setTab('historique')}>
          <History size={12} /> {t('paxlog.ads.tabs.history', 'Historique')}
        </button>
      </nav>

      {/* Body */}
      <div className="paxlog-detail-body">
        {tab === 'synthese' && (
          <div className="p-4 space-y-4">
            <PaxlogStateStrip items={[
              { label: t('paxlog.ads.state.pax', 'Passagers'), value: totalPax },
              { label: t('paxlog.ads.state.compliant', 'Conformes'), value: compliantPax, tone: 'success' },
              { label: t('paxlog.ads.state.tocheck', 'À vérifier'), value: toCheckPax, tone: 'warning' },
              { label: t('paxlog.ads.state.blocked', 'Bloqués'), value: blockedPax, tone: blockedPax > 0 ? 'danger' : undefined },
            ]} />

            <section className="paxlog-section">
              <header className="paxlog-section-head"><h3>{t('paxlog.ads.sections.visit', 'Détails de la visite')}</h3></header>
              <dl className="paxlog-dl">
                <dt>{t('paxlog.ads.fields.purpose', 'Objet')}</dt><dd>{ads.visit_purpose}</dd>
                <dt>{t('paxlog.visit_category')}</dt><dd>{ads.visit_category}</dd>
                <dt>{t('paxlog.ads.fields.entry_site', "Site d'entrée")}</dt><dd>{ads.site_name}</dd>
                <dt>{t('paxlog.ads.fields.dates')}</dt><dd>{formatDate(ads.start_date)} → {formatDate(ads.end_date)}</dd>
                <dt>{t('paxlog.ads.fields.cross_company', 'Cross-company')}</dt><dd>{ads.cross_company_flag ? t('common.yes') : t('common.no')}</dd>
                <dt>{t('paxlog.ads.fields.round_trip', 'A/R sans nuitée')}</dt><dd>{ads.is_round_trip_no_overnight ? t('common.yes') : t('common.no')}</dd>
              </dl>
            </section>

            {isArbitration && (
              <aside className="paxlog-callout paxlog-callout--warning">
                <AlertTriangle size={14} />
                <div>
                  <strong>{t('paxlog.ads.arbitration.required', 'Arbitrage requis')}</strong>
                  <p>{t('paxlog.ads.arbitration.desc', 'Capacité site dépassée. Réduisez la liste ou demandez une extension.')}</p>
                </div>
              </aside>
            )}
          </div>
        )}

        {tab === 'passagers' && (
          <div className="p-4">
            {paxList.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center">
                {t('paxlog.ads.pax.empty', 'Aucun passager sur cet AdS.')}
              </div>
            ) : (
              <table className="paxlog-table w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left">{t('common.name', 'Nom')}</th>
                    <th className="text-left">{t('paxlog.pax.company', 'Société')}</th>
                    <th className="text-left">{t('paxlog.pax.job', 'Poste')}</th>
                    <th className="text-left">{t('paxlog.ads.pax.compliance', 'Conformité')}</th>
                    <th className="text-right">{t('paxlog.ads.pax.priority', 'Priorité')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paxList.map((p) => (
                    <tr key={p.id}>
                      <td>{[p.pax_first_name, p.pax_last_name].filter(Boolean).join(' ') || '—'}</td>
                      <td>{p.pax_company_name || '—'}</td>
                      <td>{p.pax_job_position_name || '—'}</td>
                      <td>
                        <span className={`chip ${p.compliant === true ? 'chip-success' : (p.status === 'blocked' || p.status === 'rejected') ? 'chip-danger' : 'chip-warning'}`}>
                          {p.compliant === true
                            ? t('paxlog.ads.pax.compliant', 'Conforme')
                            : (p.status === 'blocked' || p.status === 'rejected')
                              ? t('paxlog.ads.pax.blocked', 'Bloqué')
                              : t('paxlog.ads.pax.to_check', 'À vérifier')}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{p.priority_score ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {tab === 'conformite' && (
          <div className="p-4 space-y-2">
            <div className="paxlog-stat-rail mb-3">
              <div className="paxlog-stat-rail__item" data-tone="success">
                <div className="paxlog-stat-rail__col"><span className="paxlog-stat-rail__val">{compliantPax}</span><span className="paxlog-stat-rail__lbl">{t('paxlog.ads.pax.compliant', 'Conformes')}</span></div>
              </div>
              <div className="paxlog-stat-rail__item" data-tone="warning">
                <div className="paxlog-stat-rail__col"><span className="paxlog-stat-rail__val">{toCheckPax}</span><span className="paxlog-stat-rail__lbl">{t('paxlog.ads.pax.to_check', 'À vérifier')}</span></div>
              </div>
              <div className="paxlog-stat-rail__item" data-tone="danger">
                <div className="paxlog-stat-rail__col"><span className="paxlog-stat-rail__val">{blockedPax}</span><span className="paxlog-stat-rail__lbl">{t('paxlog.ads.pax.blocked', 'Bloqués')}</span></div>
              </div>
            </div>
            {paxList.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">{t('paxlog.ads.pax.empty', 'Aucun passager.')}</div>
            ) : (
              <ul className="text-xs divide-y divide-border">
                {paxList.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-1.5">
                    <span>{[p.pax_first_name, p.pax_last_name].filter(Boolean).join(' ') || '—'}</span>
                    <span className={`chip ${p.compliant === true ? 'chip-success' : (p.status === 'blocked' || p.status === 'rejected') ? 'chip-danger' : 'chip-warning'}`}>
                      {p.compliant === true ? '✓' : (p.status === 'blocked' || p.status === 'rejected') ? '✕' : '⧖'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {tab === 'transport' && (
          <div className="p-4 space-y-3">
            <dl className="paxlog-dl">
              {/* Le modele Ads expose les modes de transport (helico/bateau/
                  bus…), pas un "nom de base" — les champs base_name du
                  package n'existent pas cote API. On affiche les modes. */}
              <dt>{t('paxlog.ads.transport.outbound', 'Aller')}</dt><dd>{ads.outbound_transport_mode || '—'}</dd>
              <dt>{t('paxlog.ads.transport.return', 'Retour')}</dt><dd>{ads.return_transport_mode || '—'}</dd>
            </dl>
          </div>
        )}
        {tab === 'pj' && (
          <div className="p-4">
            <AttachmentManager ownerType="ads" ownerId={id} />
          </div>
        )}
        {tab === 'historique' && (
          <div className="p-4">
            {(adsEvents ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center">
                {t('paxlog.ads.history.empty', 'Aucun évènement enregistré.')}
              </div>
            ) : (
              <ol className="paxlog-timeline text-xs space-y-2">
                {(adsEvents ?? []).map((ev) => (
                  <li key={ev.id} className="border-l-2 border-border pl-3 py-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{ev.event_type}</span>
                      {ev.old_status && ev.new_status && (
                        <span className="text-muted-foreground">{ev.old_status} → {ev.new_status}</span>
                      )}
                    </div>
                    <div className="text-muted-foreground">{formatDateTime(ev.recorded_at)}</div>
                    {ev.reason && <div className="text-muted-foreground italic">{ev.reason}</div>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <footer className="paxlog-detail-foot">
        <span className="paxlog-detail-foot__left">{t('paxlog.ads.foot.autosaved', 'Auto-enregistré')}</span>
        <div className="paxlog-detail-foot__right">
          {ads.status === 'pending_arbitration' && (
            <>
              <button className="btn-sm btn-secondary">{t('paxlog.ads.actions.request_complements', 'Compléments')}</button>
              <button className="btn-sm btn-danger">{t('common.reject')}</button>
              <button className="btn-sm btn-success">{t('paxlog.ads.actions.arbitrate', 'Arbitrer')}</button>
            </>
          )}
          {ads.status === 'pending_validation' && (
            <>
              <button className="btn-sm btn-danger">{t('common.reject')}</button>
              <button className="btn-sm btn-success">{t('common.approve')}</button>
            </>
          )}
          {ads.status === 'approved' && (
            <button className="btn-sm btn-secondary">{t('paxlog.ads.actions.boarding_scan', 'Scanner embarquement')}</button>
          )}
        </div>
      </footer>
    </DynamicPanelShell>
  )
}
