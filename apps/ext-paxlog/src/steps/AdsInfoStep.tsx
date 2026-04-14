import React from 'react'
import { EuiBadge, EuiButton } from '@elastic/eui'
import { t } from '../lib/i18n'
import Spinner from '../components/Spinner'

interface AdsInfoStepProps {
  dossier: any
  loading: boolean
  onDownloadTicket: () => void
  onContinue: () => void
}

export default function AdsInfoStep({ dossier, loading, onDownloadTicket, onContinue }: AdsInfoStepProps) {
  if (!dossier) {
    return <Spinner label={t('loading')} paddingBlock={48} size="xl" />
  }

  const ads = dossier.ads
  const linkedProjects = Array.isArray(ads.linked_projects) ? ads.linked_projects : []
  const preconfigured = dossier.preconfigured_data || {}
  const preconfiguredEntries = Object.entries(preconfigured).filter(([, value]) => value !== null && value !== '')

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      {/* ── Rejection reason banner ── */}
      {ads.rejection_reason && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">{t('correction_reason')}</p>
          <p className="text-sm text-amber-800">{ads.rejection_reason}</p>
        </div>
      )}

      {/* ── Info grid ── */}
      <div className="section-card">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{ads.reference}</h3>
            {ads.visit_purpose && <p className="text-sm text-gray-500 mt-0.5">{ads.visit_purpose}</p>}
          </div>
          <button
            type="button"
            onClick={onDownloadTicket}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium flex-shrink-0"
            disabled={loading}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t('download_ticket')}
          </button>
        </div>

        <dl className="label-value-grid">
          <div>
            <dt>{t('company')}</dt>
            <dd>{dossier.allowed_company_name || '\u2014'}</dd>
          </div>
          <div>
            <dt>{t('site')}</dt>
            <dd>{ads.site_name || '\u2014'}</dd>
          </div>
          <div>
            <dt>{t('dates')}</dt>
            <dd>{ads.start_date || '\u2014'} &rarr; {ads.end_date || '\u2014'}</dd>
          </div>
          <div>
            <dt>{t('category')}</dt>
            <dd>{ads.visit_category || '\u2014'}</dd>
          </div>
          <div>
            <dt>{t('outbound_transport')}</dt>
            <dd>{ads.outbound_transport_mode || '\u2014'}</dd>
          </div>
          <div>
            <dt>{t('return_transport')}</dt>
            <dd>{ads.return_transport_mode || '\u2014'}</dd>
          </div>
        </dl>
      </div>

      {/* ── Linked projects ── */}
      {linkedProjects.length > 0 && (
        <div className="section-card">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('linked_projects')}</h4>
          <div className="flex flex-wrap gap-1.5">
            {linkedProjects.map((item: any, index: number) => (
              <EuiBadge key={index} color="primary">{item.project_name || item.project_id || '\u2014'}</EuiBadge>
            ))}
          </div>
        </div>
      )}

      {/* ── Preconfigured data ── */}
      {preconfiguredEntries.length > 0 && (
        <div className="section-card">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('preconfigured')}</h4>
          <div className="flex flex-wrap gap-1.5">
            {preconfiguredEntries.map(([key, value]) => (
              <EuiBadge key={key} color="hollow">
                {key}: {Array.isArray(value) ? value.join(', ') : String(value)}
              </EuiBadge>
            ))}
          </div>
        </div>
      )}

      {/* ── Continue ── */}
      <div className="flex justify-end">
        <EuiButton fill onClick={onContinue}>
          {t('continue_to_team')}
        </EuiButton>
      </div>
    </div>
  )
}
