import React, { useState } from 'react'
import {
  EuiBadge,
  EuiButton,
  EuiCallOut,
  EuiFieldText,
  EuiForm,
  EuiFormRow,
  EuiSelect,
  EuiTextArea,
} from '@elastic/eui'
import { t } from '../lib/i18n'
import StatusBadge from '../components/StatusBadge'
import Spinner from '../components/Spinner'

interface ComplianceStepProps {
  dossier: any
  authenticated: boolean
  loading: boolean
  credentialTypes: any[]
  jobPositions: any[]
  onUpdatePax: (contactId: string, payload: Record<string, string | null>) => Promise<void>
  onAddCredential: (contactId: string, payload: Record<string, string | null>) => Promise<void>
  onContinue: () => void
}

export default function ComplianceStep({
  dossier, authenticated, loading, credentialTypes, jobPositions,
  onUpdatePax, onAddCredential, onContinue,
}: ComplianceStepProps) {
  if (!authenticated) {
    return <EuiCallOut title={t('wizard_locked_access')} color="warning" iconType="lock" />
  }
  if (!dossier) {
    return <Spinner label={t('loading')} paddingBlock={48} size="xl" />
  }
  const pax = dossier.pax || []
  if (pax.length === 0) {
    return <EuiCallOut title={t('wizard_locked_team')} color="warning" iconType="lock" />
  }

  const summary = dossier?.pax_summary || {}

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* ── Summary badges ── */}
      <div className="flex flex-wrap items-center gap-2">
        {(summary.pending_check ?? 0) > 0 && <EuiBadge color="warning">{t('pending_check')}: {summary.pending_check}</EuiBadge>}
        {(summary.blocked ?? 0) > 0 && <EuiBadge color="danger">{t('blocked')}: {summary.blocked}</EuiBadge>}
        {(summary.approved ?? 0) > 0 && <EuiBadge color="success">{t('approved')}: {summary.approved}</EuiBadge>}
      </div>

      {/* ── Pax accordions ── */}
      {pax.map((item: any) => (
        <PaxDossier
          key={item.contact_id}
          pax={item}
          loading={loading}
          credentialTypes={credentialTypes}
          jobPositions={jobPositions}
          onUpdatePax={onUpdatePax}
          onAddCredential={onAddCredential}
        />
      ))}

      {/* ── Continue ── */}
      <div className="flex justify-end">
        <EuiButton fill onClick={onContinue}>
          {t('continue_to_finalize')}
        </EuiButton>
      </div>
    </div>
  )
}

function PaxDossier({
  pax, loading, credentialTypes, jobPositions, onUpdatePax, onAddCredential,
}: {
  pax: any
  loading: boolean
  credentialTypes: any[]
  jobPositions: any[]
  onUpdatePax: (contactId: string, payload: Record<string, string | null>) => Promise<void>
  onAddCredential: (contactId: string, payload: Record<string, string | null>) => Promise<void>
}) {
  const blockers = pax.compliance_blockers || []
  const requiredActions = pax.required_actions || []
  const credentials = pax.credentials || []
  const complianceOk = pax.compliance_ok && blockers.length === 0 && requiredActions.length === 0
  const [expanded, setExpanded] = useState(!complianceOk)
  const [showIdentityForm, setShowIdentityForm] = useState(false)
  const [showCredentialForm, setShowCredentialForm] = useState(false)

  const missingIdentityFields = [
    !pax.birth_date ? t('birth_date') : null,
    !pax.nationality ? t('nationality') : null,
    !pax.badge_number ? t('badge_number') : null,
  ].filter(Boolean)

  const handleIdentitySubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget as HTMLFormElement)
    const payload: Record<string, string | null> = {}
    Array.from(form.entries()).forEach(([key, value]) => { payload[key] = String(value || '') || null })
    onUpdatePax(pax.contact_id, payload)
  }

  const handleCredentialSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget as HTMLFormElement)
    const payload: Record<string, string | null> = {}
    Array.from(form.entries()).forEach(([key, value]) => { payload[key] = String(value || '') || null })
    onAddCredential(pax.contact_id, payload)
  }

  const statusLabel = complianceOk ? 'compliance_ok' : (blockers.length > 0 ? 'blocked' : 'pending_check')

  return (
    <div id={`pax-${pax.contact_id}`} className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* ── Accordion header ── */}
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-4 py-3 sm:px-5 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3 min-w-0">
          <StatusBadge status={statusLabel} />
          <div className="min-w-0">
            <span className="text-sm font-semibold text-gray-800 block truncate">{pax.first_name} {pax.last_name}</span>
            <span className="text-xs text-gray-500">{pax.job_position_name || pax.position || '\u2014'}</span>
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#69707d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 sm:px-5 flex flex-col gap-4">
          {/* ── Identity summary ── */}
          <dl className="label-value-grid">
            <div>
              <dt>{t('birth_date')}</dt>
              <dd>{pax.birth_date || '\u2014'}</dd>
            </div>
            <div>
              <dt>{t('nationality')}</dt>
              <dd>{pax.nationality || '\u2014'}</dd>
            </div>
            <div>
              <dt>{t('badge_number')}</dt>
              <dd>{pax.badge_number || '\u2014'}</dd>
            </div>
            <div>
              <dt>{t('compliance')}</dt>
              <dd>{pax.compliance_ok ? t('compliance_ok') : `${pax.compliance_blocker_count || 0} ${t('compliance_blockers')}`}</dd>
            </div>
          </dl>

          {/* ── Alerts ── */}
          {requiredActions.length > 0 && (
            <EuiCallOut size="s" title={t('required_actions')} color="warning" iconType="warning">
              {requiredActions.map((item: any, index: number) => <p key={index}>{item.message || item.action || String(item)}</p>)}
            </EuiCallOut>
          )}

          {blockers.length > 0 && (
            <EuiCallOut size="s" title={t('compliance_issues')} color="danger" iconType="alert">
              {blockers.map((item: any, index: number) => (
                <p key={index}>
                  {(item.credential_type_name || item.credential_type_code || '\u2014')} &middot; {t(item.status || 'blocked')}
                  {item.message ? ` \u00b7 ${item.message}` : ''}
                </p>
              ))}
            </EuiCallOut>
          )}

          {missingIdentityFields.length > 0 && (
            <EuiCallOut size="s" title={t('identity_missing')} color="warning" iconType="user">
              <p>{missingIdentityFields.join(', ')}</p>
            </EuiCallOut>
          )}

          {/* ── Action buttons ── */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 rounded px-3 py-1.5 hover:bg-blue-50 transition-colors"
              onClick={() => setShowIdentityForm((v) => !v)}
            >
              {t('identity_and_logistics')}
            </button>
            <button
              type="button"
              className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 rounded px-3 py-1.5 hover:bg-blue-50 transition-colors"
              onClick={() => setShowCredentialForm((v) => !v)}
            >
              {t('add_credential')}
            </button>
          </div>

          {/* ── Identity form ── */}
          {showIdentityForm && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
              <h5 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">{t('identity_and_logistics')}</h5>
              <EuiForm component="form" onSubmit={handleIdentitySubmit}>
                <div className="form-grid">
                  <EuiFormRow label={t('first_name')} fullWidth><EuiFieldText name="first_name" defaultValue={pax.first_name || ''} fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('last_name')} fullWidth><EuiFieldText name="last_name" defaultValue={pax.last_name || ''} fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('birth_date')} fullWidth><EuiFieldText type="date" name="birth_date" defaultValue={pax.birth_date || ''} fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('nationality')} fullWidth><EuiFieldText name="nationality" defaultValue={pax.nationality || ''} fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('badge_number')} fullWidth><EuiFieldText name="badge_number" defaultValue={pax.badge_number || ''} fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('photo_url')} fullWidth><EuiFieldText type="url" name="photo_url" defaultValue={pax.photo_url || ''} fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('email')} fullWidth><EuiFieldText type="email" name="email" defaultValue={pax.email || ''} fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('phone')} fullWidth><EuiFieldText name="phone" defaultValue={pax.phone || ''} fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('position')} fullWidth><EuiSelect name="job_position_id" defaultValue={pax.job_position_id || ''} options={[{ value: '', text: t('position') }, ...jobPositions.map((jp) => ({ value: jp.id, text: `${jp.name}${jp.code ? ` (${jp.code})` : ''}` }))]} fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('pickup_address_line1')} fullWidth><EuiFieldText name="pickup_address_line1" defaultValue={pax.pickup_address_line1 || ''} fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('pickup_address_line2')} fullWidth><EuiFieldText name="pickup_address_line2" defaultValue={pax.pickup_address_line2 || ''} fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('pickup_city')} fullWidth><EuiFieldText name="pickup_city" defaultValue={pax.pickup_city || ''} fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('pickup_state_province')} fullWidth><EuiFieldText name="pickup_state_province" defaultValue={pax.pickup_state_province || ''} fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('pickup_postal_code')} fullWidth><EuiFieldText name="pickup_postal_code" defaultValue={pax.pickup_postal_code || ''} fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('pickup_country')} fullWidth><EuiFieldText name="pickup_country" defaultValue={pax.pickup_country || ''} fullWidth /></EuiFormRow>
                </div>
                <div className="flex justify-end mt-3">
                  <EuiButton type="submit" size="s" isLoading={loading}>{t('save_changes')}</EuiButton>
                </div>
              </EuiForm>
            </div>
          )}

          {/* ── Credential form ── */}
          {showCredentialForm && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
              <h5 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">{t('add_credential')}</h5>
              <EuiForm component="form" onSubmit={handleCredentialSubmit}>
                <div className="form-grid">
                  <EuiFormRow label={t('credential_type')} fullWidth><EuiSelect name="credential_type_id" defaultValue="" options={[{ value: '', text: '' }, ...credentialTypes.map((ct) => ({ value: ct.id, text: `${ct.name} (${ct.code})` }))]} fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('obtained_date')} fullWidth><EuiFieldText type="date" name="obtained_date" fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('expiry_date')} fullWidth><EuiFieldText type="date" name="expiry_date" fullWidth /></EuiFormRow>
                  <EuiFormRow label={t('proof_url')} fullWidth><EuiFieldText type="url" name="proof_url" fullWidth /></EuiFormRow>
                </div>
                <EuiFormRow label={t('notes')} fullWidth>
                  <EuiTextArea name="notes" rows={2} fullWidth />
                </EuiFormRow>
                <div className="flex justify-end mt-3">
                  <EuiButton type="submit" size="s" isLoading={loading}>{t('add_credential')}</EuiButton>
                </div>
              </EuiForm>
            </div>
          )}

          {/* ── Existing credentials ── */}
          <div>
            <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('current_credentials')}</h5>
            {credentials.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {credentials.map((credential: any, index: number) => (
                  <div key={index} className="flex items-center justify-between px-3 py-2 rounded border border-gray-100 bg-gray-50">
                    <div>
                      <span className="text-sm font-medium text-gray-700">{credential.credential_type_name || credential.credential_type_code || '\u2014'}</span>
                      {credential.expiry_date && <span className="text-xs text-gray-400 ml-2">{credential.expiry_date}</span>}
                    </div>
                    <StatusBadge status={credential.status || 'pending_check'} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">{t('no_credentials')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
