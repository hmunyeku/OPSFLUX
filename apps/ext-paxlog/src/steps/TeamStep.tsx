import React, { useCallback, useRef, useState } from 'react'
import {
  EuiBadge,
  EuiButton,
  EuiCallOut,
  EuiFieldText,
  EuiForm,
  EuiFormRow,
  EuiSelect,
} from '@elastic/eui'
import { t } from '../lib/i18n'
import { apiRequest } from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import Spinner from '../components/Spinner'

interface TeamStepProps {
  dossier: any
  authenticated: boolean
  loading: boolean
  sessionToken: string | null
  token: string
  jobPositions: any[]
  onCreatePax: (payload: Record<string, string | null>) => Promise<void>
  onAttachExisting: (contactId: string) => Promise<void>
  onContinue: () => void
  onOpenCompliance: (contactId: string) => void
}

export default function TeamStep({
  dossier, authenticated, loading, sessionToken, token,
  jobPositions, onCreatePax, onAttachExisting, onContinue, onOpenCompliance,
}: TeamStepProps) {
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [matches, setMatches] = useState<any[]>([])
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showMoreInfo, setShowMoreInfo] = useState(false)
  const matchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (!authenticated) {
    return <EuiCallOut title={t('wizard_locked_access')} color="warning" iconType="lock" />
  }
  if (!dossier) {
    return <Spinner label={t('loading')} paddingBlock={48} size="xl" />
  }

  const pax = dossier.pax || []
  const summary = dossier?.pax_summary || {}

  const updateDraft = useCallback((name: string, value: string) => {
    setDraft((prev) => {
      const next = { ...prev, [name]: value }
      scheduleLookup(next)
      return next
    })
  }, [sessionToken, token])

  function scheduleLookup(currentDraft: Record<string, string>) {
    if (matchTimerRef.current) clearTimeout(matchTimerRef.current)
    matchTimerRef.current = setTimeout(() => {
      lookupMatches(currentDraft)
    }, 350)
  }

  async function lookupMatches(currentDraft: Record<string, string>) {
    if (!token || !sessionToken) return
    const firstName = currentDraft.first_name?.trim()
    const lastName = currentDraft.last_name?.trim()
    const badge = currentDraft.badge_number?.trim()
    const email = currentDraft.email?.trim()
    const phone = currentDraft.phone?.trim()
    const hasEnough = (firstName && lastName) || badge || email || phone
    if (!hasEnough) {
      setMatches([])
      setMatchesLoading(false)
      return
    }
    setMatchesLoading(true)
    try {
      const result = await apiRequest(sessionToken, `/api/v1/pax/external/${token}/pax/matches`, {
        method: 'POST',
        body: JSON.stringify({
          first_name: currentDraft.first_name || '',
          last_name: currentDraft.last_name || '',
          ...currentDraft,
        }),
      })
      setMatches(result)
    } catch {
      setMatches([])
    }
    setMatchesLoading(false)
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget as HTMLFormElement)
    const payload: Record<string, string | null> = {}
    Array.from(form.entries()).forEach(([key, value]) => {
      payload[key] = String(value || '') || null
    })
    onCreatePax(payload).then(() => {
      setDraft({})
      setMatches([])
      setShowCreateForm(false)
    })
  }

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      {/* ── Summary bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <EuiBadge color="primary">{t('pax_count')}: {summary.total ?? 0}</EuiBadge>
        <EuiBadge color="success">{t('approved')}: {summary.approved ?? 0}</EuiBadge>
        {(summary.pending_check ?? 0) > 0 && <EuiBadge color="warning">{t('pending_check')}: {summary.pending_check}</EuiBadge>}
        {(summary.blocked ?? 0) > 0 && <EuiBadge color="danger">{t('blocked')}: {summary.blocked}</EuiBadge>}
      </div>

      {/* ── Create new pax: collapsible ── */}
      <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          className="collapsible-toggle"
          aria-expanded={showCreateForm}
          onClick={() => setShowCreateForm((v) => !v)}
          style={{ borderRadius: showCreateForm ? '8px 8px 0 0' : undefined }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          {t('create_new_pax')}
        </button>

        {showCreateForm && (
          <div className="px-4 pb-4 pt-3 sm:px-5">
            <p className="text-xs text-gray-500 mb-3">{t('wizard_team_helper')}</p>

            <EuiForm component="form" onSubmit={handleSubmit}>
              {/* Essential fields */}
              <div className="form-grid">
                <EuiFormRow label={t('first_name')} fullWidth>
                  <EuiFieldText name="first_name" required value={draft.first_name || ''} onChange={(e) => updateDraft('first_name', e.target.value)} fullWidth />
                </EuiFormRow>
                <EuiFormRow label={t('last_name')} fullWidth>
                  <EuiFieldText name="last_name" required value={draft.last_name || ''} onChange={(e) => updateDraft('last_name', e.target.value)} fullWidth />
                </EuiFormRow>
                <EuiFormRow label={t('birth_date')} fullWidth>
                  <EuiFieldText type="date" name="birth_date" value={draft.birth_date || ''} onChange={(e) => updateDraft('birth_date', e.target.value)} fullWidth />
                </EuiFormRow>
                <EuiFormRow label={t('badge_number')} fullWidth>
                  <EuiFieldText name="badge_number" value={draft.badge_number || ''} onChange={(e) => updateDraft('badge_number', e.target.value)} fullWidth />
                </EuiFormRow>
                <EuiFormRow label={t('email')} fullWidth>
                  <EuiFieldText type="email" name="email" value={draft.email || ''} onChange={(e) => updateDraft('email', e.target.value)} fullWidth />
                </EuiFormRow>
                <EuiFormRow label={t('phone')} fullWidth>
                  <EuiFieldText name="phone" value={draft.phone || ''} onChange={(e) => updateDraft('phone', e.target.value)} fullWidth />
                </EuiFormRow>
              </div>

              {/* ── Matches inline ── */}
              {matchesLoading && (
                <div className="mt-3">
                  <Spinner label={t('searching_existing_pax')} size="s" />
                </div>
              )}
              {matches.length > 0 && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-700 mb-2">{t('duplicate_candidates')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {matches.map((match: any) => (
                      <button
                        key={match.contact_id}
                        type="button"
                        className="flex flex-col items-start gap-1 px-3 py-2.5 rounded-lg border border-amber-200 bg-white hover:bg-amber-50 hover:border-amber-300 text-left transition-colors shadow-sm"
                        onClick={() => onAttachExisting(match.contact_id)}
                      >
                        <span className="text-sm font-semibold text-gray-800">{match.first_name} {match.last_name}</span>
                        <span className="text-[11px] text-gray-500">{match.job_position_name || match.position || '\u2014'}</span>
                        {match.badge_number && <span className="text-[10px] text-gray-400 font-mono">{match.badge_number}</span>}
                        <EuiBadge color="warning" className="mt-1">{t('attach_pax')}</EuiBadge>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── More info: collapsible ── */}
              <div className="mt-3">
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                  onClick={() => setShowMoreInfo((v) => !v)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: showMoreInfo ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  {t('more_info')}
                </button>
                {showMoreInfo && (
                  <div className="form-grid mt-2">
                    <EuiFormRow label={t('nationality')} fullWidth>
                      <EuiFieldText name="nationality" value={draft.nationality || ''} onChange={(e) => updateDraft('nationality', e.target.value)} fullWidth />
                    </EuiFormRow>
                    <EuiFormRow label={t('photo_url')} fullWidth>
                      <EuiFieldText type="url" name="photo_url" value={draft.photo_url || ''} onChange={(e) => updateDraft('photo_url', e.target.value)} fullWidth />
                    </EuiFormRow>
                    <EuiFormRow label={t('position')} fullWidth>
                      <EuiSelect name="job_position_id" value={draft.job_position_id || ''} onChange={(e) => updateDraft('job_position_id', e.target.value)} options={[{ value: '', text: t('position') }, ...jobPositions.map((jp) => ({ value: jp.id, text: `${jp.name}${jp.code ? ` (${jp.code})` : ''}` }))]} fullWidth />
                    </EuiFormRow>
                    <EuiFormRow label={t('pickup_address_line1')} fullWidth>
                      <EuiFieldText name="pickup_address_line1" value={draft.pickup_address_line1 || ''} onChange={(e) => updateDraft('pickup_address_line1', e.target.value)} fullWidth />
                    </EuiFormRow>
                    <EuiFormRow label={t('pickup_address_line2')} fullWidth>
                      <EuiFieldText name="pickup_address_line2" value={draft.pickup_address_line2 || ''} onChange={(e) => updateDraft('pickup_address_line2', e.target.value)} fullWidth />
                    </EuiFormRow>
                    <EuiFormRow label={t('pickup_city')} fullWidth>
                      <EuiFieldText name="pickup_city" value={draft.pickup_city || ''} onChange={(e) => updateDraft('pickup_city', e.target.value)} fullWidth />
                    </EuiFormRow>
                    <EuiFormRow label={t('pickup_state_province')} fullWidth>
                      <EuiFieldText name="pickup_state_province" value={draft.pickup_state_province || ''} onChange={(e) => updateDraft('pickup_state_province', e.target.value)} fullWidth />
                    </EuiFormRow>
                    <EuiFormRow label={t('pickup_postal_code')} fullWidth>
                      <EuiFieldText name="pickup_postal_code" value={draft.pickup_postal_code || ''} onChange={(e) => updateDraft('pickup_postal_code', e.target.value)} fullWidth />
                    </EuiFormRow>
                    <EuiFormRow label={t('pickup_country')} fullWidth>
                      <EuiFieldText name="pickup_country" value={draft.pickup_country || ''} onChange={(e) => updateDraft('pickup_country', e.target.value)} fullWidth />
                    </EuiFormRow>
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-4">
                <EuiButton type="submit" fill isLoading={loading} size="s">
                  {t('add_pax')}
                </EuiButton>
              </div>
            </EuiForm>
          </div>
        )}
      </div>

      {/* ── Pax table ── */}
      {pax.length === 0 ? (
        <div className="section-card text-center py-8">
          <svg className="mx-auto mb-3 text-gray-300" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <p className="text-sm text-gray-500">{t('no_pax')}</p>
        </div>
      ) : (
        <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="pax-table">
            <thead>
              <tr>
                <th>{t('pax_table_name')}</th>
                <th>{t('pax_table_position')}</th>
                <th>{t('pax_table_badge')}</th>
                <th>{t('pax_table_status')}</th>
                <th style={{ textAlign: 'right' }}>{t('pax_table_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {pax.map((item: any) => (
                <tr key={item.contact_id}>
                  <td className="font-medium text-gray-800">
                    {item.first_name} {item.last_name}
                  </td>
                  <td className="text-gray-600">
                    {item.job_position_name || item.position || '\u2014'}
                  </td>
                  <td className="font-mono text-xs text-gray-500">
                    {item.badge_number || '\u2014'}
                  </td>
                  <td>
                    <StatusBadge status={item.status || 'pending_check'} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => onOpenCompliance(item.contact_id)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {t('open_compliance_dossier')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Continue ── */}
      {pax.length > 0 && (
        <div className="flex justify-end">
          <EuiButton fill onClick={onContinue}>
            {t('continue_to_compliance')}
          </EuiButton>
        </div>
      )}
    </div>
  )
}
