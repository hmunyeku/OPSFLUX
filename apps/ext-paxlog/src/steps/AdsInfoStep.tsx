import React from 'react'
import { FileText, Download, Building2, MapPin, Calendar, Tag, Plane, ArrowRight } from 'lucide-react'
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
    return <Spinner label={t('loading')} className="py-12" size="lg" />
  }

  const ads = dossier.ads
  const linkedProjects = Array.isArray(ads.linked_projects) ? ads.linked_projects : []
  const preconfigured = dossier.preconfigured_data || {}
  const preconfiguredEntries = Object.entries(preconfigured).filter(([, value]) => value !== null && value !== '')

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header with download */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('wizard_ads_title')}</h3>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{t('wizard_ads_text')}</p>
        </div>
        <button
          onClick={onDownloadTicket}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors disabled:opacity-50 shrink-0"
        >
          <Download className="w-4 h-4" />
          {t('download_ticket')}
        </button>
      </div>

      {/* Main reference card */}
      <div className="bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl p-6 text-white shadow-elevated">
        <p className="text-[10px] uppercase tracking-widest text-brand-200 font-semibold mb-2">{t('dossier')}</p>
        <h4 className="text-xl font-bold mb-1">{ads.reference}</h4>
        <p className="text-sm text-brand-100">{ads.visit_purpose || '\u2014'}</p>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InfoCard icon={Building2} label={t('company')} value={dossier.allowed_company_name || '\u2014'} />
        <InfoCard icon={MapPin} label={t('site')} value={ads.site_name || '\u2014'} />
        <InfoCard icon={Calendar} label={t('dates')} value={`${ads.start_date || '\u2014'} \u2192 ${ads.end_date || '\u2014'}`} />
        <InfoCard icon={Tag} label={t('status')} value={ads.status || '\u2014'} />
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <DetailCard label={t('category')} value={ads.visit_category || '\u2014'} />
        <DetailCard label={t('outbound_transport')} value={ads.outbound_transport_mode || '\u2014'} />
        <DetailCard label={t('return_transport')} value={ads.return_transport_mode || '\u2014'} />
        <DetailCard label={t('outbound_departure_base')} value={ads.outbound_departure_base_name || '\u2014'} />
        <DetailCard label={t('return_departure_base')} value={ads.return_departure_base_name || '\u2014'} />
      </div>

      {/* Linked projects */}
      {linkedProjects.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">{t('linked_projects')}</h4>
          <div className="flex flex-wrap gap-2">
            {linkedProjects.map((item: any, i: number) => (
              <span key={i} className="px-3 py-1.5 rounded-lg bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400 text-xs font-medium border border-brand-200 dark:border-brand-800">
                {item.project_name || item.project_id || '\u2014'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Preconfigured data */}
      {preconfiguredEntries.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">{t('preconfigured')}</h4>
          <div className="flex flex-wrap gap-2">
            {preconfiguredEntries.map(([key, value]) => (
              <span key={key} className="px-3 py-1.5 rounded-lg bg-[var(--surface-raised)] text-[var(--text-secondary)] text-xs font-medium border border-[var(--border)]">
                {key}: {Array.isArray(value) ? (value as string[]).join(', ') : String(value)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rejection reason */}
      {ads.rejection_reason && (
        <div className="bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-xl p-5">
          <p className="text-sm font-semibold text-[var(--warning-text)] mb-1">{t('correction_reason')}</p>
          <p className="text-sm text-[var(--warning-text)]">{ads.rejection_reason}</p>
        </div>
      )}

      {/* Continue button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onContinue}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
        >
          {t('continue_to_team')}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function InfoCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
      <div className="w-8 h-8 rounded-lg bg-[var(--surface-raised)] flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-[var(--text-tertiary)]" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[var(--text-tertiary)] truncate">{label}</p>
        <p className="text-sm font-medium text-[var(--text-primary)] mt-0.5 break-words">{value}</p>
      </div>
    </div>
  )
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
      <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
      <p className="text-sm font-medium text-[var(--text-primary)] mt-1">{value}</p>
    </div>
  )
}
