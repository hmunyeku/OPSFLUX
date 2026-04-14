import React, { useState } from 'react'
import {
  EuiButton,
  EuiCallOut,
  EuiForm,
  EuiFormRow,
  EuiSelect,
  EuiTextArea,
} from '@elastic/eui'
import { t } from '../lib/i18n'
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
    return <EuiCallOut title={t('wizard_locked_access')} color="warning" iconType="lock" />
  }
  if (!dossier) {
    return <Spinner label={t('loading')} paddingBlock={48} size="xl" />
  }
  if ((dossier?.pax_summary?.total ?? 0) <= 0) {
    return <EuiCallOut title={t('wizard_locked_team')} color="warning" iconType="lock" />
  }

  const ads = dossier.ads
  const blockers = Array.isArray(dossier?.submission_blockers) ? dossier.submission_blockers : []
  const readyForSubmission = Boolean(dossier?.ready_for_submission)

  const handleTransportSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    onUpdateTransport({
      outbound_departure_base_id: String(form.get('outbound_departure_base_id') || '') || null,
      return_departure_base_id: String(form.get('return_departure_base_id') || '') || null,
      outbound_notes: String(form.get('outbound_notes') || '') || null,
      return_notes: String(form.get('return_notes') || '') || null,
    })
  }

  const handleResubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!resubmitReason.trim()) return
    onResubmit(resubmitReason.trim())
  }

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      {/* ── Status banner ── */}
      {readyForSubmission ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-start gap-3">
          <svg className="flex-shrink-0 mt-0.5" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#017d73" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-green-800">{t('dossier_ready')}</p>
            <p className="text-xs text-green-700 mt-0.5">{t('wizard_finalize_ready')}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <svg className="flex-shrink-0 mt-0.5" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b25f00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">{t('dossier_needs_review')}</p>
            <p className="text-xs text-amber-700 mt-0.5">{t('wizard_finalize_blocked')}</p>
          </div>
        </div>
      )}

      {/* ── Blockers checklist ── */}
      {!readyForSubmission && blockers.length > 0 && (
        <div className="section-card">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('submission_blockers_title')}</h4>
          <ul className="flex flex-col gap-1.5">
            {blockers.map((item: string, index: number) => (
              <li key={index} className="flex items-start gap-2 text-sm text-red-700">
                <svg className="flex-shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Transport preferences ── */}
      <div className="section-card">
        <h4 className="text-sm font-semibold text-gray-800 mb-1">{t('transport_preferences')}</h4>
        <p className="text-xs text-gray-500 mb-4">{t('transport_preferences_text')}</p>
        <EuiForm component="form" onSubmit={handleTransportSubmit}>
          <div className="form-grid">
            <EuiFormRow label={t('outbound_departure_base')} fullWidth>
              <EuiSelect
                name="outbound_departure_base_id"
                defaultValue={ads.outbound_departure_base_id || ''}
                options={[
                  { value: '', text: t('not_defined') },
                  ...departureBases.map((db) => ({
                    value: db.id,
                    text: db.code ? `${db.code} \u2014 ${db.name}` : db.name,
                  })),
                ]}
                fullWidth
              />
            </EuiFormRow>
            <EuiFormRow label={t('return_departure_base')} fullWidth>
              <EuiSelect
                name="return_departure_base_id"
                defaultValue={ads.return_departure_base_id || ''}
                options={[
                  { value: '', text: t('not_defined') },
                  ...departureBases.map((db) => ({
                    value: db.id,
                    text: db.code ? `${db.code} \u2014 ${db.name}` : db.name,
                  })),
                ]}
                fullWidth
              />
            </EuiFormRow>
            <EuiFormRow label={t('outbound_notes')} fullWidth>
              <EuiTextArea name="outbound_notes" defaultValue={ads.outbound_notes || ''} rows={2} fullWidth />
            </EuiFormRow>
            <EuiFormRow label={t('return_notes')} fullWidth>
              <EuiTextArea name="return_notes" defaultValue={ads.return_notes || ''} rows={2} fullWidth />
            </EuiFormRow>
          </div>
          <div className="flex justify-end mt-3">
            <EuiButton type="submit" size="s" isLoading={loading}>
              {t('save_transport_preferences')}
            </EuiButton>
          </div>
        </EuiForm>
      </div>

      {/* ── Resubmit section ── */}
      {dossier.can_resubmit && (
        <div className="section-card" style={{ borderColor: '#fec' }}>
          <h4 className="text-sm font-semibold text-amber-800 mb-2">{t('resubmit_reason')}</h4>
          <EuiForm component="form" onSubmit={handleResubmit}>
            <EuiFormRow fullWidth>
              <EuiTextArea
                value={resubmitReason}
                onChange={(event) => setResubmitReason(event.target.value)}
                rows={3}
                fullWidth
              />
            </EuiFormRow>
            <div className="flex justify-end mt-2">
              <EuiButton type="submit" color="warning" size="s" isDisabled={!resubmitReason.trim()} isLoading={loading}>
                {t('resubmit')}
              </EuiButton>
            </div>
          </EuiForm>
        </div>
      )}

      {/* ── Final actions ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={onDownloadTicket}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1.5 justify-center"
          disabled={loading}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {t('download_ticket')}
        </button>

        {dossier.can_submit && (
          <EuiButton fill color={readyForSubmission ? 'success' : 'primary'} onClick={onSubmit} isLoading={loading} style={{ minWidth: 200 }}>
            {t('submit')}
          </EuiButton>
        )}
      </div>
    </div>
  )
}
