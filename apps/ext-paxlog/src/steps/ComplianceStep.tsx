import React, { useState } from 'react'
import { ChevronDown, ChevronUp, ShieldCheck, AlertTriangle, ArrowRight, FileCheck, User, Award } from 'lucide-react'
import { t } from '../lib/i18n'
import { cn, objectFromFormData } from '../lib/utils'
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
    return <LockedMessage text={t('wizard_locked_access')} />
  }
  if (!dossier) {
    return <Spinner label={t('loading')} className="py-12" size="lg" />
  }
  const pax = dossier.pax || []
  if (pax.length === 0) {
    return <LockedMessage text={t('wizard_locked_team')} />
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('wizard_compliance_title')}</h3>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{t('wizard_compliance_text')}</p>
        </div>
        <div className="flex gap-3">
          <StatPill label={t('pending_check')} value={dossier?.pax_summary?.pending_check ?? 0} variant="warning" />
          <StatPill label={t('blocked')} value={dossier?.pax_summary?.blocked ?? 0} variant="danger" />
        </div>
      </div>

      <div className="space-y-4">
        {pax.map((p: any) => (
          <PaxDossier
            key={p.contact_id}
            pax={p}
            loading={loading}
            credentialTypes={credentialTypes}
            jobPositions={jobPositions}
            onUpdatePax={onUpdatePax}
            onAddCredential={onAddCredential}
          />
        ))}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={onContinue}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
        >
          {t('continue_to_finalize')}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function PaxDossier({ pax, loading, credentialTypes, jobPositions, onUpdatePax, onAddCredential }: {
  pax: any; loading: boolean; credentialTypes: any[]; jobPositions: any[]
  onUpdatePax: (contactId: string, payload: Record<string, string | null>) => Promise<void>
  onAddCredential: (contactId: string, payload: Record<string, string | null>) => Promise<void>
}) {
  const blockers = pax.compliance_blockers || []
  const requiredActions = pax.required_actions || []
  const credentials = pax.credentials || []
  const complianceOk = pax.compliance_ok && blockers.length === 0 && requiredActions.length === 0
  const [expanded, setExpanded] = useState(!complianceOk)

  const missingIdentityFields = [
    !pax.birth_date ? t('birth_date') : null,
    !pax.nationality ? t('nationality') : null,
    !pax.badge_number ? t('badge_number') : null,
  ].filter(Boolean)

  const handleIdentitySubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const payload = objectFromFormData(new FormData(e.currentTarget))
    onUpdatePax(pax.contact_id, payload)
  }

  const handleCredentialSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const payload = objectFromFormData(new FormData(e.currentTarget))
    onAddCredential(pax.contact_id, payload)
  }

  return (
    <div
      id={`pax-${pax.contact_id}`}
      className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-[var(--surface-raised)] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
            complianceOk ? 'bg-emerald-100 dark:bg-emerald-950/40' : 'bg-amber-100 dark:bg-amber-950/40',
          )}>
            {complianceOk
              ? <ShieldCheck className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
              : <AlertTriangle className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" />
            }
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{pax.first_name} {pax.last_name}</p>
            <p className="text-xs text-[var(--text-tertiary)]">{pax.job_position_name || pax.position || '\u2014'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={complianceOk ? 'compliance_ok' : 'pending_check'} />
          {expanded ? <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)] px-5 py-5 space-y-5 animate-fade-in">
          {/* Identity facts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FactCard label={t('birth_date')} value={pax.birth_date || '\u2014'} />
            <FactCard label={t('nationality')} value={pax.nationality || '\u2014'} />
            <FactCard label={t('badge_number')} value={pax.badge_number || '\u2014'} />
            <FactCard
              label={t('compliance')}
              value={pax.compliance_ok ? t('compliance_ok') : `${t('compliance_blockers')}: ${pax.compliance_blocker_count || 0}`}
            />
          </div>

          {/* Required actions */}
          {requiredActions.length > 0 && (
            <div className="bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-[var(--warning-text)]">{t('required_actions')}</p>
              <ul className="space-y-2">
                {requiredActions.map((item: any, i: number) => (
                  <RequiredActionItem key={i} item={item} contactId={pax.contact_id} />
                ))}
              </ul>
            </div>
          )}

          {/* Compliance blockers */}
          {blockers.length > 0 && (
            <div className="bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-[var(--warning-text)]">{t('compliance_issues')}</p>
              <ul className="space-y-1 text-sm text-[var(--warning-text)]">
                {blockers.map((item: any, i: number) => (
                  <li key={i}>
                    {item.credential_type_name || item.credential_type_code || '\u2014'} &middot; {t(item.status || '\u2014')}
                    {item.message && <span> &middot; {item.message}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Missing identity */}
          {missingIdentityFields.length > 0 && (
            <div className="bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-xl p-4">
              <p className="text-sm font-semibold text-[var(--warning-text)] mb-1">{t('identity_missing')}</p>
              <p className="text-sm text-[var(--warning-text)]">{missingIdentityFields.join(', ')}</p>
            </div>
          )}

          {/* Two-column forms */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* Identity form */}
            <form onSubmit={handleIdentitySubmit} className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center gap-2">
                <User className="w-4 h-4 text-brand-500" />
                <div>
                  <h4 className="text-sm font-semibold text-[var(--text-primary)]">{t('identity_and_logistics')}</h4>
                  <p className="text-xs text-[var(--text-tertiary)]">{t('identity_and_logistics_text')}</p>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <PaxFormField name="first_name" label={t('first_name')} defaultValue={pax.first_name || ''} required />
                  <PaxFormField name="last_name" label={t('last_name')} defaultValue={pax.last_name || ''} required />
                  <PaxFormField name="birth_date" label={t('birth_date')} type="date" defaultValue={pax.birth_date || ''} />
                  <PaxFormField name="nationality" label={t('nationality')} defaultValue={pax.nationality || ''} />
                  <PaxFormField name="badge_number" label={t('badge_number')} defaultValue={pax.badge_number || ''} />
                  <PaxFormField name="photo_url" label={t('photo_url')} type="url" defaultValue={pax.photo_url || ''} />
                  <PaxFormField name="email" label={t('email')} type="email" defaultValue={pax.email || ''} />
                  <PaxFormField name="phone" label={t('phone')} defaultValue={pax.phone || ''} />
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{t('position')}</label>
                    <select
                      name="job_position_id"
                      defaultValue={pax.job_position_id || ''}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                    >
                      <option value="">{t('position')}</option>
                      {jobPositions.map((jp) => (
                        <option key={jp.id} value={jp.id}>{jp.name}{jp.code ? ` (${jp.code})` : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">{t('pickup_address')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <PaxFormField name="pickup_address_line1" label={t('pickup_address_line1')} defaultValue={pax.pickup_address_line1 || ''} />
                    <PaxFormField name="pickup_address_line2" label={t('pickup_address_line2')} defaultValue={pax.pickup_address_line2 || ''} />
                    <PaxFormField name="pickup_city" label={t('pickup_city')} defaultValue={pax.pickup_city || ''} />
                    <PaxFormField name="pickup_state_province" label={t('pickup_state_province')} defaultValue={pax.pickup_state_province || ''} />
                    <PaxFormField name="pickup_postal_code" label={t('pickup_postal_code')} defaultValue={pax.pickup_postal_code || ''} />
                    <PaxFormField name="pickup_country" label={t('pickup_country')} defaultValue={pax.pickup_country || ''} />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors disabled:opacity-50"
                  >
                    {t('save_changes')}
                  </button>
                </div>
              </div>
            </form>

            {/* Credential form */}
            <form onSubmit={handleCredentialSubmit} className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center gap-2">
                <Award className="w-4 h-4 text-brand-500" />
                <div>
                  <h4 className="text-sm font-semibold text-[var(--text-primary)]">{t('credentials')}</h4>
                  <p className="text-xs text-[var(--text-tertiary)]">{t('credentials_step_text')}</p>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{t('credential_type')}</label>
                    <select
                      name="credential_type_id"
                      required
                      className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                    >
                      <option value=""></option>
                      {credentialTypes.map((ct) => (
                        <option key={ct.id} value={ct.id}>{ct.name} ({ct.code})</option>
                      ))}
                    </select>
                  </div>
                  <PaxFormField name="obtained_date" label={t('obtained_date')} type="date" required />
                  <PaxFormField name="expiry_date" label={t('expiry_date')} type="date" />
                  <PaxFormField name="proof_url" label={t('proof_url')} type="url" />
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{t('notes')}</label>
                    <textarea
                      name="notes"
                      rows={2}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all resize-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors disabled:opacity-50"
                  >
                    {t('add_credential')}
                  </button>
                </div>

                {/* Existing credentials */}
                <div className="border-t border-[var(--border)] pt-4">
                  <h5 className="text-xs font-semibold text-[var(--text-secondary)] mb-2">{t('current_credentials')}</h5>
                  {credentials.length > 0 ? (
                    <div className="space-y-2">
                      {credentials.map((c: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm">
                          <span className="text-[var(--text-primary)]">{c.credential_type_name || c.credential_type_code || '\u2014'}</span>
                          <div className="flex items-center gap-2">
                            {c.expiry_date && <span className="text-xs text-[var(--text-tertiary)]">{c.expiry_date}</span>}
                            <StatusBadge status={c.status || 'pending_check'} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-tertiary)]">{t('no_credentials')}</p>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function RequiredActionItem({ item, contactId }: { item: any; contactId: string }) {
  const label = item?.label || item?.field || '\u2014'
  const status = item?.status ? ` \u00b7 ${t(item.status)}` : ''
  const layer = item?.layer_label ? ` \u00b7 ${item.layer_label}` : ''
  let guidance = ''
  if (item?.kind === 'identity') guidance = t('update_identity_action')
  else if (item?.status === 'pending_validation') guidance = t('wait_validation_action')
  else guidance = t('add_credential_action')

  return (
    <li className="text-sm text-[var(--warning-text)]">
      <span>{label}{status}{layer}</span>
      {item?.message && <span> &middot; {item.message}</span>}
      <br />
      <span className="text-xs opacity-80">{guidance}</span>
    </li>
  )
}

function PaxFormField({ name, label, type = 'text', required = false, defaultValue = '' }: {
  name: string; label: string; type?: string; required?: boolean; defaultValue?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{label}</label>
      <input
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
      />
    </div>
  )
}

function FactCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)]">
      <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
      <p className="text-sm font-medium text-[var(--text-primary)] mt-0.5">{value}</p>
    </div>
  )
}

function StatPill({ label, value, variant }: { label: string; value: number; variant: 'warning' | 'danger' }) {
  const styles = variant === 'danger'
    ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
    : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
  return (
    <div className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-2', styles)}>
      <span>{label}</span>
      <span className="font-bold">{value}</span>
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
