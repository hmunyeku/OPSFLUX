import React, { useState } from 'react'
import {
  CheckCircle2, AlertTriangle, Download, Send, RotateCcw, Truck,
  Lock, XCircle, ArrowRight, Plane, MessageSquare, ClipboardCheck,
} from 'lucide-react'
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
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-8 text-center animate-fade-in-up">
        <Lock className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm font-semibold text-amber-800">{t('wizard_locked_access')}</p>
      </div>
    )
  }
  if (!dossier) {
    return <Spinner label={t('loading')} className="py-12" size="lg" />
  }
  if ((dossier?.pax_summary?.total ?? 0) <= 0) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-8 text-center animate-fade-in-up">
        <Lock className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm font-semibold text-amber-800">{t('wizard_locked_team')}</p>
      </div>
    )
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
    <div className="animate-fade-in-up space-y-6">
      {/* ── Review summary card ── */}
      <div className={cn(
        'ext-card overflow-hidden',
        readyForSubmission ? 'border-emerald-200' : 'border-amber-200',
      )}>
        <div className={cn(
          'px-6 py-5 flex items-start gap-4',
          readyForSubmission ? 'bg-emerald-50' : 'bg-amber-50',
        )}>
          <div className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
            readyForSubmission ? 'bg-emerald-100' : 'bg-amber-100',
          )}>
            {readyForSubmission
              ? <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              : <AlertTriangle className="w-6 h-6 text-amber-600" />
            }
          </div>
          <div className="flex-1">
            <h3 className={cn(
              'text-base font-bold',
              readyForSubmission ? 'text-emerald-800' : 'text-amber-800',
            )}>
              {t('review_summary')}
            </h3>
            <p className={cn(
              'text-sm mt-1',
              readyForSubmission ? 'text-emerald-700' : 'text-amber-700',
            )}>
              {readyForSubmission ? t('dossier_ready') : t('dossier_needs_review')}
            </p>
          </div>
        </div>

        {/* Status message bar */}
        <div className={cn(
          'px-6 py-3 border-t text-sm font-medium flex items-center gap-2',
          readyForSubmission
            ? 'bg-emerald-50/50 border-emerald-200 text-emerald-700'
            : 'bg-amber-50/50 border-amber-200 text-amber-700',
        )}>
          {readyForSubmission
            ? <CheckCircle2 className="w-4 h-4" />
            : <AlertTriangle className="w-4 h-4" />
          }
          {readyForSubmission ? t('wizard_finalize_ready') : t('wizard_finalize_blocked')}
        </div>
      </div>

      {/* ── Submission blockers checklist ── */}
      {!readyForSubmission && blockers.length > 0 && (
        <div className="ext-card overflow-hidden border-red-200 animate-fade-in-up">
          <div className="px-5 py-3 bg-red-50 border-b border-red-200 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-red-600" />
            <p className="text-sm font-bold text-red-800">{t('submission_blockers_title')}</p>
          </div>
          <div className="divide-y divide-red-100">
            {blockers.map((item: string, i: number) => (
              <div key={i} className="px-5 py-3 flex items-start gap-3">
                <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{item}</p>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-red-50/50 border-t border-red-100">
            <p className="text-xs text-red-600">{t('submission_blockers_hint')}</p>
          </div>
        </div>
      )}

      {/* ── Transport preferences ── */}
      <form onSubmit={handleTransportSubmit} className="ext-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
            <Truck className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">{t('transport_preferences')}</h4>
            <p className="text-xs text-slate-500">{t('transport_preferences_text')}</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Outbound departure base */}
            <div>
              <label className="ext-label flex items-center gap-1.5">
                <Plane className="w-3.5 h-3.5 text-slate-400" />
                {t('outbound_departure_base')}
              </label>
              <select
                name="outbound_departure_base_id"
                defaultValue={ads.outbound_departure_base_id || ''}
                className="ext-select"
              >
                <option value="">{t('not_defined')}</option>
                {departureBases.map((db) => (
                  <option key={db.id} value={db.id}>{db.code ? `${db.code} \u2014 ${db.name}` : db.name}</option>
                ))}
              </select>
            </div>

            {/* Return departure base */}
            <div>
              <label className="ext-label flex items-center gap-1.5">
                <Plane className="w-3.5 h-3.5 text-slate-400 rotate-180" />
                {t('return_departure_base')}
              </label>
              <select
                name="return_departure_base_id"
                defaultValue={ads.return_departure_base_id || ''}
                className="ext-select"
              >
                <option value="">{t('not_defined')}</option>
                {departureBases.map((db) => (
                  <option key={db.id} value={db.id}>{db.code ? `${db.code} \u2014 ${db.name}` : db.name}</option>
                ))}
              </select>
            </div>

            {/* Outbound notes */}
            <div>
              <label className="ext-label flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                {t('outbound_notes')}
              </label>
              <textarea
                name="outbound_notes"
                rows={3}
                defaultValue={ads.outbound_notes || ''}
                className="ext-input resize-none"
              />
            </div>

            {/* Return notes */}
            <div>
              <label className="ext-label flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                {t('return_notes')}
              </label>
              <textarea
                name="return_notes"
                rows={3}
                defaultValue={ads.return_notes || ''}
                className="ext-input resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button type="submit" disabled={loading} className="ext-btn-secondary disabled:opacity-50">
              {t('save_transport_preferences')}
            </button>
          </div>
        </div>
      </form>

      {/* ── Resubmit form ── */}
      {dossier.can_resubmit && (
        <form onSubmit={handleResubmit} className="ext-card overflow-hidden border-amber-200 animate-fade-in-up">
          <div className="px-5 py-4 border-b border-amber-200 bg-amber-50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
              <RotateCcw className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-800">{t('resubmit_reason')}</h4>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <textarea
              value={resubmitReason}
              onChange={(e) => setResubmitReason(e.target.value)}
              rows={3}
              placeholder="..."
              className="ext-input resize-none"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading || !resubmitReason.trim()}
                className="ext-btn bg-amber-500 hover:bg-amber-600 text-white shadow-sm disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                {t('resubmit')}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── Final action buttons ── */}
      <div className="space-y-3 pt-2">
        {/* Download ticket - secondary */}
        <button
          onClick={onDownloadTicket}
          disabled={loading}
          className="ext-btn-secondary w-full disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {t('download_ticket')}
        </button>

        {/* Submit - primary, full width */}
        {dossier.can_submit && (
          <button
            onClick={onSubmit}
            disabled={loading}
            className={cn(
              'ext-btn w-full text-white shadow-md disabled:opacity-50',
              readyForSubmission
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-blue-600 hover:bg-blue-700',
            )}
          >
            {loading ? <Spinner size="sm" /> : <Send className="w-4 h-4" />}
            {t('submit')}
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
