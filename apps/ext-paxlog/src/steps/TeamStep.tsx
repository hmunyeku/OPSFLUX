import React, { useState, useCallback, useRef, useEffect } from 'react'
import { UserPlus, Users, ArrowRight, Search, CheckCircle } from 'lucide-react'
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
    return <LockedMessage text={t('wizard_locked_access')} />
  }
  if (!dossier) {
    return <Spinner label={t('loading')} className="py-12" size="lg" />
  }

  const pax = dossier.pax || []

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
        body: JSON.stringify(currentDraft),
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
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('wizard_team_title')}</h3>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{t('wizard_team_text')}</p>
        </div>
        <div className="flex gap-3">
          <StatPill label={t('pax_count')} value={dossier?.pax_summary?.total ?? 0} />
          <StatPill label={t('approved')} value={dossier?.pax_summary?.approved ?? 0} variant="success" />
        </div>
      </div>

      {/* Add PAX form */}
      <form onSubmit={handleSubmit} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-raised)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center">
              <UserPlus className="w-4.5 h-4.5 text-brand-500" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">{t('add_pax')}</h4>
              <p className="text-xs text-[var(--text-tertiary)]">{t('wizard_team_helper')}</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField name="first_name" label={t('first_name')} required value={draft.first_name || ''} onChange={updateDraft} />
            <FormField name="last_name" label={t('last_name')} required value={draft.last_name || ''} onChange={updateDraft} />
            <FormField name="birth_date" label={t('birth_date')} type="date" value={draft.birth_date || ''} onChange={updateDraft} />
            <FormField name="nationality" label={t('nationality')} value={draft.nationality || ''} onChange={updateDraft} />
            <FormField name="badge_number" label={t('badge_number')} value={draft.badge_number || ''} onChange={updateDraft} />
            <FormField name="photo_url" label={t('photo_url')} type="url" value={draft.photo_url || ''} onChange={updateDraft} />
            <FormField name="email" label={t('email')} type="email" value={draft.email || ''} onChange={updateDraft} />
            <FormField name="phone" label={t('phone')} value={draft.phone || ''} onChange={updateDraft} />
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{t('position')}</label>
              <select
                name="job_position_id"
                value={draft.job_position_id || ''}
                onChange={(e) => updateDraft('job_position_id', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
              >
                <option value="">{t('position')}</option>
                {jobPositions.map((jp) => (
                  <option key={jp.id} value={jp.id}>{jp.name}{jp.code ? ` (${jp.code})` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Pickup address */}
          <div>
            <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">{t('pickup_address')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Search className="w-4 h-4 animate-pulse-soft" />
              {t('searching_existing_pax')}
            </div>
          )}
          {matches.length > 0 && (
            <div className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t('duplicate_candidates')}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{t('duplicate_candidates_hint')}</p>
              </div>
              <div className="space-y-2">
                {matches.map((match: any) => (
                  <button
                    key={match.contact_id}
                    type="button"
                    onClick={() => onAttachExisting(match.contact_id)}
                    disabled={loading}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800 hover:border-brand-400 transition-colors disabled:opacity-50"
                  >
                    <div className="text-left">
                      <p className="text-sm font-medium text-[var(--text-primary)]">{match.first_name} {match.last_name}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">{match.job_position_name || match.position || '\u2014'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-[var(--text-tertiary)]">{t('match_score')}: {match.match_score}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">{(match.match_reasons || []).join(', ') || '\u2014'}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              {t('add_pax')}
            </button>
          </div>
        </div>
      </form>

      {/* PAX list */}
      {pax.length === 0 ? (
        <div className="text-center py-10">
          <Users className="w-10 h-10 text-[var(--text-tertiary)] mx-auto mb-3" />
          <p className="text-sm text-[var(--text-secondary)]">{t('no_pax')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pax.map((item: any) => (
            <div
              key={item.contact_id}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-[var(--border-strong)] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{item.first_name} {item.last_name}</p>
                  <StatusBadge status={item.status || 'pending_check'} />
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">{item.job_position_name || item.position || '\u2014'}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-[var(--text-secondary)]">
                  <span>{t('birth_date')}: {item.birth_date || '\u2014'}</span>
                  <span>{t('badge_number')}: {item.badge_number || '\u2014'}</span>
                  <span>{t('email')}: {item.email || '\u2014'}</span>
                </div>
              </div>
              <button
                onClick={() => onOpenCompliance(item.contact_id)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors shrink-0"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {t('open_compliance_dossier')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Continue */}
      {pax.length > 0 && (
        <div className="flex justify-end pt-2">
          <button
            onClick={onContinue}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
          >
            {t('continue_to_compliance')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

function FormField({ name, label, type = 'text', required = false, value, onChange }: {
  name: string; label: string; type?: string; required?: boolean; value: string; onChange: (name: string, val: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{label}</label>
      <input
        type={type}
        name={name}
        required={required}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
      />
    </div>
  )
}

function StatPill({ label, value, variant }: { label: string; value: number; variant?: 'success' }) {
  return (
    <div className={cn(
      'px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-2',
      variant === 'success'
        ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
        : 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)]',
    )}>
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
