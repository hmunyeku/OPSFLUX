import React, { useState } from 'react'
import { CheckCircle2, AlertTriangle, Download, Send, RotateCcw, Truck } from 'lucide-react'
import { t } from '../lib/i18n'
import { cn, objectFromFormData } from '../lib/utils'
import Spinner from '../components/Spinner'

interface FinalizeStepProps {
  dossier: any
  authenticated: boolean
  loading: boolean
  departureBases: any[]
  onSubmit: () => Promise<void>
  onResubmit: (reason: string) => Promise<void>
  onUpdateTransport: (payload: Record<string, string | null>) => Promise<void>
  onDownloadTicket: () => void
}

export default function FinalizeStep({
  dossier, authenticated, loading, departureBases,
  onSubmit, onResubmit, onUpdateTransport, onDownloadTicket,
}: FinalizeStepProps) {
  const [resubmitReason, setResubmitReason] = useState('')

  if (!authenticated) {
    return <LockedMessage text={t('wizard_locked_access')} />
  }
  if (!dossier) {
    return <Spinner label={t('loading')} className="py-12" size="lg" />
  }
  if ((dossier?.pax_summary?.total ?? 0) <= 0) {
    return <LockedMessage text={t('wizard_locked_team')} />
  }

  const ads = dossier.ads
  const blockers = Array.isArray(dossier?.submission_blockers) ? dossier.submission_blockers : []
  const readyForSubmission = Boolean(dossier?.ready_for_submission)

  const handleTransportSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const payload = objectFromFormData(new FormData(e.currentTarget))
    onUpdateTransport(payload)
  }

  const handleResubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!resubmitReason.trim()) return
    onResubmit(resubmitReason.trim())
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('wizard_finalize_title')}</h3>
        <p className="text-sm text-[var(--text-secondary)] mt-1">{t('wizard_finalize_text')}</p>
      </div>

      {/* Review banner */}
      <div className={cn(
        'rounded-xl p-5 flex items-start gap-4 border',
        readyForSubmission
          ? 'bg-[var(--success-bg)] border-[var(--success-border)]'
          : 'bg-[var(--warning-bg)] border-[var(--warning-border)]',
      )}>
        {readyForSubmission
          ? <CheckCircle2 className="w-6 h-6 text-[var(--success-text)] shrink-0 mt-0.5" />
          : <AlertTriangle className="w-6 h-6 text-[var(--warning-text)] shrink-0 mt-0.5" />
        }
        <div>
          <p className={cn(
            'text-sm font-semibold',
            readyForSubmission ? 'text-[var(--success-text)]' : 'text-[var(--warning-text)]',
          )}>
            {t('review_summary')}
          </p>
          <p className={cn(
            'text-sm mt-1',
            readyForSubmission ? 'text-[var(--success-text)]' : 'text-[var(--warning-text)]',
          )}>
            {readyForSubmission ? t('dossier_ready') : t('dossier_needs_review')}
          </p>
        </div>
      </div>

      {/* Blockers */}
      {!readyForSubmission && blockers.length > 0 && (
        <div className="bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-xl p-5">
          <p className="text-sm font-semibold text-[var(--warning-text)] mb-2">{t('submission_blockers_title')}</p>
          <ul className="space-y-1 text-sm text-[var(--warning-text)]">
            {blockers.map((item: string, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning-text)] mt-1.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <p className="text-xs text-[var(--warning-text)] opacity-70 mt-3">{t('submission_blockers_hint')}</p>
        </div>
      )}

      {/* Status message */}
      <div className={cn(
        'rounded-xl p-4 border text-sm',
        readyForSubmission
          ? 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-text)]'
          : 'bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning-text)]',
      )}>
        {readyForSubmission ? t('wizard_finalize_ready') : t('wizard_finalize_blocked')}
      </div>

      {/* Transport preferences form */}
      <form onSubmit={handleTransportSubmit} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border)] bg-[var(--surface-raised)] flex items-center gap-2">
          <Truck className="w-4 h-4 text-brand-500" />
          <div>
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">{t('transport_preferences')}</h4>
            <p className="text-xs text-[var(--text-tertiary)]">{t('transport_preferences_text')}</p>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{t('outbound_departure_base')}</label>
              <select
                name="outbound_departure_base_id"
                defaultValue={ads.outbound_departure_base_id || ''}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
              >
                <option value="">{t('not_defined')}</option>
                {departureBases.map((db) => (
                  <option key={db.id} value={db.id}>{db.code ? `${db.code} \u2014 ${db.name}` : db.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{t('return_departure_base')}</label>
              <select
                name="return_departure_base_id"
                defaultValue={ads.return_departure_base_id || ''}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
              >
                <option value="">{t('not_defined')}</option>
                {departureBases.map((db) => (
                  <option key={db.id} value={db.id}>{db.code ? `${db.code} \u2014 ${db.name}` : db.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{t('outbound_notes')}</label>
              <textarea
                name="outbound_notes"
                rows={3}
                defaultValue={ads.outbound_notes || ''}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{t('return_notes')}</label>
              <textarea
                name="return_notes"
                rows={3}
                defaultValue={ads.return_notes || ''}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors disabled:opacity-50"
            >
              {t('save_transport_preferences')}
            </button>
          </div>
        </div>
      </form>

      {/* Resubmit form */}
      {dossier.can_resubmit && (
        <form onSubmit={handleResubmit} className="bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-xl p-5 space-y-3">
          <label className="block text-sm font-medium text-[var(--warning-text)]">{t('resubmit_reason')}</label>
          <textarea
            value={resubmitReason}
            onChange={(e) => setResubmitReason(e.target.value)}
            rows={3}
            className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--warning-border)] bg-white dark:bg-gray-900 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all resize-none"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || !resubmitReason.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              {t('resubmit')}
            </button>
          </div>
        </form>
      )}

      {/* Final actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
        <button
          onClick={onDownloadTicket}
          disabled={loading}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {t('download_ticket')}
        </button>
        {dossier.can_submit && (
          <button
            onClick={onSubmit}
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
          >
            {loading ? <Spinner size="sm" /> : <Send className="w-4 h-4" />}
            {t('submit')}
          </button>
        )}
      </div>
    </div>
  )
}

function LockedMessage({ text }: { text: string }) {
  return (
    <div className="bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-xl p-6 text-center">
      <p className="text-sm text-[var(--warning-text)]">{text}</p>
    </div>
  )
}
