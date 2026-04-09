import React from 'react'
import {
  Download, Building2, MapPin, Calendar, Tag, Plane, ArrowRight,
  Briefcase, AlertTriangle, FolderOpen, CornerDownRight,
} from 'lucide-react'
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
    <div className="animate-fade-in-up space-y-6">
      {/* ── Boarding pass card ── */}
      <div className="ext-card overflow-hidden">
        {/* Top gradient header */}
        <div className="bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 px-6 py-6 relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/5" />
          <div className="absolute -right-4 top-12 w-20 h-20 rounded-full bg-white/5" />

          <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-blue-200 text-[10px] font-semibold uppercase tracking-[0.2em] mb-1">{t('dossier')}</p>
              <h3 className="text-white text-2xl sm:text-3xl font-bold mono tracking-wide">{ads.reference}</h3>
              <p className="text-blue-100 text-sm mt-1.5 font-medium">{ads.visit_purpose || '\u2014'}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onDownloadTicket}
                disabled={loading}
                className="ext-btn bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm border border-white/20 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {t('download_ticket')}
              </button>
            </div>
          </div>
        </div>

        {/* Ticket tear line */}
        <div className="relative h-4 bg-white">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-50 -ml-2" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-50 -mr-2" />
          <div className="absolute left-4 right-4 top-1/2 border-t border-dashed border-slate-200" />
        </div>

        {/* Info grid — boarding pass style */}
        <div className="px-6 py-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-5 gap-x-6">
            <InfoCell
              icon={Building2}
              label={t('company')}
              value={dossier.allowed_company_name || '\u2014'}
            />
            <InfoCell
              icon={MapPin}
              label={t('site')}
              value={ads.site_name || '\u2014'}
              highlight
            />
            <InfoCell
              icon={Calendar}
              label={t('dates')}
              value={`${ads.start_date || '\u2014'} \u2192 ${ads.end_date || '\u2014'}`}
            />
            <InfoCell
              icon={Tag}
              label={t('status')}
              value={ads.status || '\u2014'}
            />
          </div>
        </div>
      </div>

      {/* ── Details grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
        <DetailCard
          icon={Briefcase}
          label={t('category')}
          value={ads.visit_category || '\u2014'}
        />
        <DetailCard
          icon={Plane}
          label={t('outbound_transport')}
          value={ads.outbound_transport_mode || '\u2014'}
        />
        <DetailCard
          icon={Plane}
          label={t('return_transport')}
          value={ads.return_transport_mode || '\u2014'}
          iconClass="rotate-180"
        />
        <DetailCard
          icon={CornerDownRight}
          label={t('outbound_departure_base')}
          value={ads.outbound_departure_base_name || '\u2014'}
        />
        <DetailCard
          icon={CornerDownRight}
          label={t('return_departure_base')}
          value={ads.return_departure_base_name || '\u2014'}
        />
      </div>

      {/* ── Linked projects ── */}
      {linkedProjects.length > 0 && (
        <div className="ext-card p-5 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-3">
            <FolderOpen className="w-4 h-4 text-blue-600" />
            <h4 className="text-sm font-bold text-slate-900">{t('linked_projects')}</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {linkedProjects.map((item: any, i: number) => (
              <span
                key={i}
                className="ext-badge-info"
              >
                <FolderOpen className="w-3 h-3" />
                {item.project_name || item.project_id || '\u2014'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Preconfigured data ── */}
      {preconfiguredEntries.length > 0 && (
        <div className="ext-card p-5">
          <h4 className="text-sm font-bold text-slate-900 mb-3">{t('preconfigured')}</h4>
          <div className="flex flex-wrap gap-2">
            {preconfiguredEntries.map(([key, value]) => (
              <span key={key} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 text-xs font-medium border border-slate-200">
                <span className="text-slate-400">{key}:</span>
                {Array.isArray(value) ? (value as string[]).join(', ') : String(value)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Rejection reason ── */}
      {ads.rejection_reason && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-5 flex items-start gap-3 animate-fade-in-up">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="w-4.5 h-4.5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-800 mb-1">{t('correction_reason')}</p>
            <p className="text-sm text-amber-700 leading-relaxed">{ads.rejection_reason}</p>
          </div>
        </div>
      )}

      {/* ── Continue button ── */}
      <div className="flex justify-end pt-2">
        <button onClick={onContinue} className="ext-btn-primary">
          {t('continue_to_team')}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

/* ── Sub-components ── */

function InfoCell({ icon: Icon, label, value, highlight = false }: {
  icon: React.ElementType; label: string; value: string; highlight?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-sm font-bold ${highlight ? 'text-blue-600' : 'text-slate-900'} break-words`}>{value}</p>
    </div>
  )
}

function DetailCard({ icon: Icon, label, value, iconClass }: {
  icon: React.ElementType; label: string; value: string; iconClass?: string
}) {
  return (
    <div className="ext-card p-4 flex items-start gap-3 hover:shadow-sm transition-shadow duration-150">
      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
        <Icon className={`w-4 h-4 text-slate-500 ${iconClass || ''}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-slate-900 mt-0.5 break-words">{value}</p>
      </div>
    </div>
  )
}
