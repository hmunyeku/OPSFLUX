import React, { useState, useCallback, useRef } from 'react'
import {
  UserPlus, Users, ArrowRight, Search, CheckCircle2, Lock, User,
  Mail, Phone, Briefcase, MapPin, ChevronRight, Percent,
} from 'lucide-react'
import { t } from '../lib/i18n'
import { cn, objectFromFormData } from '../lib/utils'
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
  const matchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const payload = objectFromFormData(formData)
    onCreatePax(payload).then(() => {
      setDraft({})
      setMatches([])
    })
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* ── Summary bar ── */}
      <div className="ext-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{t('wizard_team_title')}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{t('wizard_team_text')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatChip label={t('pax_count')} value={summary.total ?? 0} color="blue" />
            <StatChip label={t('approved')} value={summary.approved ?? 0} color="emerald" />
            {(summary.pending_check ?? 0) > 0 && (
              <StatChip label={t('pending_check')} value={summary.pending_check} color="amber" />
            )}
            {(summary.blocked ?? 0) > 0 && (
              <StatChip label={t('blocked')} value={summary.blocked} color="red" />
            )}
          </div>
        </div>
      </div>

      {/* ── Add PAX form ── */}
      <form onSubmit={handleSubmit} className="ext-card">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">{t('add_pax')}</h4>
              <p className="text-xs text-slate-500">{t('wizard_team_helper')}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Section: Identity */}
          <div>
            <SectionHeader icon={User} title={t('first_name') + ' / ' + t('last_name')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
              <FormField name="first_name" label={t('first_name')} required value={draft.first_name || ''} onChange={updateDraft} />
              <FormField name="last_name" label={t('last_name')} required value={draft.last_name || ''} onChange={updateDraft} />
              <FormField name="birth_date" label={t('birth_date')} type="date" value={draft.birth_date || ''} onChange={updateDraft} />
              <FormField name="nationality" label={t('nationality')} value={draft.nationality || ''} onChange={updateDraft} />
              <FormField name="badge_number" label={t('badge_number')} value={draft.badge_number || ''} onChange={updateDraft} />
              <FormField name="photo_url" label={t('photo_url')} type="url" value={draft.photo_url || ''} onChange={updateDraft} />
            </div>
          </div>

          {/* Section: Contact */}
          <div>
            <SectionHeader icon={Mail} title={t('email') + ' / ' + t('phone')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
              <FormField name="email" label={t('email')} type="email" value={draft.email || ''} onChange={updateDraft} />
              <FormField name="phone" label={t('phone')} value={draft.phone || ''} onChange={updateDraft} />
              <div>
                <label className="ext-label">{t('position')}</label>
                <select
                  name="job_position_id"
                  value={draft.job_position_id || ''}
                  onChange={(e) => updateDraft('job_position_id', e.target.value)}
                  className="ext-select"
                >
                  <option value="">{t('position')}</option>
                  {jobPositions.map((jp) => (
                    <option key={jp.id} value={jp.id}>{jp.name}{jp.code ? ` (${jp.code})` : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Pickup address */}
          <div>
            <SectionHeader icon={MapPin} title={t('pickup_address')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
              <FormField name="pickup_address_line1" label={t('pickup_address_line1')} value={draft.pickup_address_line1 || ''} onChange={updateDraft} />
              <FormField name="pickup_address_line2" label={t('pickup_address_line2')} value={draft.pickup_address_line2 || ''} onChange={updateDraft} />
              <FormField name="pickup_city" label={t('pickup_city')} value={draft.pickup_city || ''} onChange={updateDraft} />
              <FormField name="pickup_state_province" label={t('pickup_state_province')} value={draft.pickup_state_province || ''} onChange={updateDraft} />
              <FormField name="pickup_postal_code" label={t('pickup_postal_code')} value={draft.pickup_postal_code || ''} onChange={updateDraft} />
              <FormField name="pickup_country" label={t('pickup_country')} value={draft.pickup_country || ''} onChange={updateDraft} />
            </div>
          </div>

          {/* Duplicate matches */}
          {matchesLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
              <Search className="w-4 h-4 animate-pulse" />
              {t('searching_existing_pax')}
            </div>
          )}
          {matches.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-5 space-y-3 animate-fade-in-up">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-amber-600" />
                <div>
                  <p className="text-sm font-bold text-amber-800">{t('duplicate_candidates')}</p>
                  <p className="text-xs text-amber-600 mt-0.5">{t('duplicate_candidates_hint')}</p>
                </div>
              </div>
              <div className="space-y-2">
                {matches.map((match: any) => (
                  <button
                    key={match.contact_id}
                    type="button"
                    onClick={() => onAttachExisting(match.contact_id)}
                    disabled={loading}
                    className="w-full ext-card p-4 flex items-center justify-between gap-3 hover:border-blue-300 hover:shadow-sm transition-all duration-150 disabled:opacity-50 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-amber-700">
                          {(match.first_name?.[0] || '').toUpperCase()}{(match.last_name?.[0] || '').toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{match.first_name} {match.last_name}</p>
                        <p className="text-xs text-slate-500 truncate">{match.job_position_name || match.position || '\u2014'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-xs font-semibold text-amber-700">
                          <Percent className="w-3 h-3" />
                          {match.match_score}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">{(match.match_reasons || []).join(', ') || '\u2014'}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end pt-1">
            <button type="submit" disabled={loading} className="ext-btn-primary disabled:opacity-50">
              <UserPlus className="w-4 h-4" />
              {t('add_pax')}
            </button>
          </div>
        </div>
      </form>

      {/* ── PAX list ── */}
      {pax.length === 0 ? (
        <div className="ext-card p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Users className="w-7 h-7 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-600">{t('no_pax')}</p>
          <p className="text-xs text-slate-400 mt-1">{t('wizard_team_helper')}</p>
        </div>
      ) : (
        <div className="space-y-3 stagger">
          {pax.map((item: any) => (
            <div
              key={item.contact_id}
              className="ext-card p-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:shadow-sm hover:border-slate-300 transition-all duration-150"
            >
              {/* Avatar */}
              <div className={cn(
                'w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-sm font-bold',
                item.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                item.status === 'blocked' ? 'bg-red-100 text-red-700' :
                'bg-blue-100 text-blue-700'
              )}>
                {(item.first_name?.[0] || '').toUpperCase()}{(item.last_name?.[0] || '').toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-slate-900">{item.first_name} {item.last_name}</p>
                  <StatusBadge status={item.status || 'pending_check'} />
                </div>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <Briefcase className="w-3 h-3" />
                  {item.job_position_name || item.position || '\u2014'}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-400">
                  {item.birth_date && <span>{t('birth_date')}: {item.birth_date}</span>}
                  {item.badge_number && <span className="mono">{t('badge_number')}: {item.badge_number}</span>}
                  {item.email && <span>{item.email}</span>}
                </div>
              </div>

              {/* Action */}
              <button
                onClick={() => onOpenCompliance(item.contact_id)}
                className="ext-btn-secondary text-xs shrink-0"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t('open_compliance_dossier')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Continue ── */}
      {pax.length > 0 && (
        <div className="flex justify-end pt-2">
          <button onClick={onContinue} className="ext-btn-primary">
            {t('continue_to_compliance')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Sub-components ── */

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
      <Icon className="w-3.5 h-3.5 text-slate-400" />
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
    </div>
  )
}

function FormField({ name, label, type = 'text', required = false, value, onChange }: {
  name: string; label: string; type?: string; required?: boolean; value: string; onChange: (name: string, val: string) => void
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
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        className="ext-input"
      />
    </div>
  )
}

function StatChip({ label, value, color }: { label: string; value: number; color: 'blue' | 'emerald' | 'amber' | 'red' }) {
  const styles: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border', styles[color])}>
      {label}
      <span className="font-bold">{value}</span>
    </span>
  )
}
