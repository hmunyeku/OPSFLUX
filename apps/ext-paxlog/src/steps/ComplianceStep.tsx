import React, { useState } from 'react'
import {
  ChevronDown, ChevronUp, ShieldCheck, AlertTriangle, ArrowRight,
  User, Award, Lock, FileWarning, CheckCircle2, XCircle, Clock,
  CreditCard, Calendar, Globe, Hash, MapPin, Briefcase,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { cn, objectFromFormData } from '../lib/utils'
import StatusBadge, { StatusDot } from '../components/StatusBadge'
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
  const pax = dossier.pax || []
  if (pax.length === 0) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-8 text-center animate-fade-in-up">
        <Lock className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm font-semibold text-amber-800">{t('wizard_locked_team')}</p>
      </div>
    )
  }

  const summary = dossier?.pax_summary || {}

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* ── Header ── */}
      <div className="ext-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{t('wizard_compliance_title')}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{t('wizard_compliance_text')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(summary.pending_check ?? 0) > 0 && (
              <span className="ext-badge-warning">
                <Clock className="w-3 h-3" />
                {t('pending_check')}: {summary.pending_check}
              </span>
            )}
            {(summary.blocked ?? 0) > 0 && (
              <span className="ext-badge-danger">
                <XCircle className="w-3 h-3" />
                {t('blocked')}: {summary.blocked}
              </span>
            )}
            {(summary.approved ?? 0) > 0 && (
              <span className="ext-badge-success">
                <CheckCircle2 className="w-3 h-3" />
                {t('approved')}: {summary.approved}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Per-passenger accordion ── */}
      <div className="space-y-4 stagger">
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

      {/* ── Continue ── */}
      <div className="flex justify-end pt-2">
        <button onClick={onContinue} className="ext-btn-primary">
          {t('continue_to_finalize')}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

/* ── Per-passenger accordion card ── */

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
  const [showIdentityForm, setShowIdentityForm] = useState(false)
  const [showCredentialForm, setShowCredentialForm] = useState(false)

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
    <div id={`pax-${pax.contact_id}`} className="ext-card">
      {/* ── Accordion header ── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 transition-colors duration-150"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            'w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-sm font-bold',
            complianceOk ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
          )}>
            {complianceOk
              ? <ShieldCheck className="w-5 h-5" />
              : <>{(pax.first_name?.[0] || '').toUpperCase()}{(pax.last_name?.[0] || '').toUpperCase()}</>
            }
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm font-bold text-slate-900">{pax.first_name} {pax.last_name}</p>
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
              <Briefcase className="w-3 h-3" />
              {pax.job_position_name || pax.position || '\u2014'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={complianceOk ? 'compliance_ok' : (blockers.length > 0 ? 'blocked' : 'pending_check')} />
          {expanded
            ? <ChevronUp className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />
          }
        </div>
      </button>

      {/* ── Expanded content ── */}
      {expanded && (
        <div className="border-t border-slate-100 animate-fade-in">
          {/* Identity facts grid */}
          <div className="px-5 pt-5 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <FactCard icon={Calendar} label={t('birth_date')} value={pax.birth_date || '\u2014'} />
              <FactCard icon={Globe} label={t('nationality')} value={pax.nationality || '\u2014'} />
              <FactCard icon={Hash} label={t('badge_number')} value={pax.badge_number || '\u2014'} mono />
              <FactCard
                icon={ShieldCheck}
                label={t('compliance')}
                value={pax.compliance_ok ? t('compliance_ok') : `${pax.compliance_blocker_count || 0} ${t('compliance_blockers')}`}
                variant={pax.compliance_ok ? 'success' : 'warning'}
              />
            </div>
          </div>

          {/* Required actions */}
          {requiredActions.length > 0 && (
            <div className="mx-5 mb-4 rounded-xl bg-amber-50 border border-amber-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <p className="text-sm font-bold text-amber-800">{t('required_actions')}</p>
              </div>
              <div className="divide-y divide-amber-100">
                {requiredActions.map((item: any, i: number) => (
                  <RequiredActionItem key={i} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* Compliance blockers */}
          {blockers.length > 0 && (
            <div className="mx-5 mb-4 rounded-xl bg-red-50 border border-red-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-red-200 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-600" />
                <p className="text-sm font-bold text-red-800">{t('compliance_issues')}</p>
              </div>
              <div className="divide-y divide-red-100">
                {blockers.map((item: any, i: number) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-3">
                    <StatusDot status="blocked" className="mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-800">
                        {item.credential_type_name || item.credential_type_code || '\u2014'}
                      </p>
                      <p className="text-xs text-red-600 mt-0.5">
                        {t(item.status || '\u2014')}
                        {item.message && <> &middot; {item.message}</>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing identity warning */}
          {missingIdentityFields.length > 0 && (
            <div className="mx-5 mb-4 rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
              <FileWarning className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">{t('identity_missing')}</p>
                <p className="text-xs text-amber-600 mt-0.5">{missingIdentityFields.join(', ')}</p>
              </div>
            </div>
          )}

          {/* ── Action buttons to toggle forms ── */}
          <div className="px-5 pb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowIdentityForm(!showIdentityForm)}
              className={cn(
                'ext-btn text-xs',
                showIdentityForm
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              <User className="w-3.5 h-3.5" />
              {t('identity_and_logistics')}
              {showIdentityForm ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={() => setShowCredentialForm(!showCredentialForm)}
              className={cn(
                'ext-btn text-xs',
                showCredentialForm
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              <Award className="w-3.5 h-3.5" />
              {t('credentials')}
              {showCredentialForm ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* ── Identity form (collapsible) ── */}
          {showIdentityForm && (
            <div className="mx-5 mb-4 animate-fade-in">
              <form onSubmit={handleIdentitySubmit} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-600" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{t('identity_and_logistics')}</h4>
                    <p className="text-xs text-slate-500">{t('identity_and_logistics_text')}</p>
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
                      <label className="ext-label">{t('position')}</label>
                      <select name="job_position_id" defaultValue={pax.job_position_id || ''} className="ext-select">
                        <option value="">{t('position')}</option>
                        {jobPositions.map((jp) => (
                          <option key={jp.id} value={jp.id}>{jp.name}{jp.code ? ` (${jp.code})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Pickup address */}
                  <div>
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100 mb-3">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{t('pickup_address')}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <PaxFormField name="pickup_address_line1" label={t('pickup_address_line1')} defaultValue={pax.pickup_address_line1 || ''} />
                      <PaxFormField name="pickup_address_line2" label={t('pickup_address_line2')} defaultValue={pax.pickup_address_line2 || ''} />
                      <PaxFormField name="pickup_city" label={t('pickup_city')} defaultValue={pax.pickup_city || ''} />
                      <PaxFormField name="pickup_state_province" label={t('pickup_state_province')} defaultValue={pax.pickup_state_province || ''} />
                      <PaxFormField name="pickup_postal_code" label={t('pickup_postal_code')} defaultValue={pax.pickup_postal_code || ''} />
                      <PaxFormField name="pickup_country" label={t('pickup_country')} defaultValue={pax.pickup_country || ''} />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button type="submit" disabled={loading} className="ext-btn-primary disabled:opacity-50">
                      {t('save_changes')}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* ── Credential form (collapsible) ── */}
          {showCredentialForm && (
            <div className="mx-5 mb-4 animate-fade-in">
              <form onSubmit={handleCredentialSubmit} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                  <Award className="w-4 h-4 text-blue-600" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{t('credentials')}</h4>
                    <p className="text-xs text-slate-500">{t('credentials_step_text')}</p>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="ext-label">{t('credential_type')}</label>
                      <select name="credential_type_id" required className="ext-select">
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
                      <label className="ext-label">{t('notes')}</label>
                      <textarea
                        name="notes"
                        rows={2}
                        className="ext-input resize-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button type="submit" disabled={loading} className="ext-btn-primary disabled:opacity-50">
                      <Award className="w-4 h-4" />
                      {t('add_credential')}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* ── Current credentials list ── */}
          <div className="px-5 pb-5">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{t('current_credentials')}</p>
            </div>
            {credentials.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {credentials.map((c: any, i: number) => (
                  <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3 hover:bg-white transition-colors duration-150">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {c.credential_type_name || c.credential_type_code || '\u2014'}
                      </p>
                      {c.expiry_date && (
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {c.expiry_date}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={c.status || 'pending_check'} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">{t('no_credentials')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Sub-components ── */

function RequiredActionItem({ item }: { item: any }) {
  const label = item?.label || item?.field || '\u2014'
  const status = item?.status ? ` \u00b7 ${t(item.status)}` : ''
  const layer = item?.layer_label ? ` \u00b7 ${item.layer_label}` : ''
  let guidance = ''
  if (item?.kind === 'identity') guidance = t('update_identity_action')
  else if (item?.status === 'pending_validation') guidance = t('wait_validation_action')
  else guidance = t('add_credential_action')

  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-amber-800">
          {label}{status}{layer}
          {item?.message && <span className="font-normal"> &middot; {item.message}</span>}
        </p>
        <p className="text-xs text-amber-600 mt-0.5">{guidance}</p>
      </div>
    </div>
  )
}

function PaxFormField({ name, label, type = 'text', required = false, defaultValue = '' }: {
  name: string; label: string; type?: string; required?: boolean; defaultValue?: string
}) {
  return (
    <div>
      <label className="ext-label">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="ext-input"
      />
    </div>
  )
}

function FactCard({ icon: Icon, label, value, variant, mono: isMono }: {
  icon: React.ElementType; label: string; value: string; variant?: 'success' | 'warning'; mono?: boolean
}) {
  return (
    <div className={cn(
      'rounded-lg border p-3',
      variant === 'success' ? 'bg-emerald-50 border-emerald-200' :
      variant === 'warning' ? 'bg-amber-50 border-amber-200' :
      'bg-slate-50 border-slate-200',
    )}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn(
          'w-3 h-3',
          variant === 'success' ? 'text-emerald-500' :
          variant === 'warning' ? 'text-amber-500' :
          'text-slate-400',
        )} />
        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
      </div>
      <p className={cn(
        'text-sm font-semibold mt-0.5',
        variant === 'success' ? 'text-emerald-700' :
        variant === 'warning' ? 'text-amber-700' :
        'text-slate-900',
        isMono && 'mono',
      )}>
        {value}
      </p>
    </div>
  )
}
