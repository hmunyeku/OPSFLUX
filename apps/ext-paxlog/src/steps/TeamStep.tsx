import React, { useCallback, useRef, useState } from 'react'
import {
  EuiBadge,
  EuiButton,
  EuiCallOut,
  EuiCard,
  EuiDescriptionList,
  EuiFieldText,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
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
    })
  }

  return (
    <EuiFlexGroup direction="column" gutterSize="l">
      <EuiFlexItem grow={false}>
        <EuiPanel hasBorder hasShadow paddingSize="m">
          <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
            <EuiFlexItem>
              <EuiTitle size="s">
                <h3>{t('wizard_team_title')}</h3>
              </EuiTitle>
              <EuiSpacer size="xs" />
              <EuiText size="s" color="subdued">
                <p>{t('wizard_team_text')}</p>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" wrap responsive={false}>
                <EuiFlexItem grow={false}><EuiBadge color="primary">{t('pax_count')}: {summary.total ?? 0}</EuiBadge></EuiFlexItem>
                <EuiFlexItem grow={false}><EuiBadge color="success">{t('approved')}: {summary.approved ?? 0}</EuiBadge></EuiFlexItem>
                {(summary.pending_check ?? 0) > 0 ? <EuiFlexItem grow={false}><EuiBadge color="warning">{t('pending_check')}: {summary.pending_check}</EuiBadge></EuiFlexItem> : null}
                {(summary.blocked ?? 0) > 0 ? <EuiFlexItem grow={false}><EuiBadge color="danger">{t('blocked')}: {summary.blocked}</EuiBadge></EuiFlexItem> : null}
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem grow={false}>
        <EuiPanel hasBorder paddingSize="l">
          <EuiTitle size="s">
            <h3>{t('add_pax')}</h3>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiText size="s" color="subdued">
            <p>{t('wizard_team_helper')}</p>
          </EuiText>
          <EuiSpacer size="m" />
          <EuiForm component="form" onSubmit={handleSubmit}>
            <EuiFlexGrid columns={3}>
              <EuiFlexItem><EuiFormRow label={t('first_name')}><EuiFieldText name="first_name" required value={draft.first_name || ''} onChange={(e) => updateDraft('first_name', e.target.value)} /></EuiFormRow></EuiFlexItem>
              <EuiFlexItem><EuiFormRow label={t('last_name')}><EuiFieldText name="last_name" required value={draft.last_name || ''} onChange={(e) => updateDraft('last_name', e.target.value)} /></EuiFormRow></EuiFlexItem>
              <EuiFlexItem><EuiFormRow label={t('birth_date')}><EuiFieldText type="date" name="birth_date" value={draft.birth_date || ''} onChange={(e) => updateDraft('birth_date', e.target.value)} /></EuiFormRow></EuiFlexItem>
              <EuiFlexItem><EuiFormRow label={t('nationality')}><EuiFieldText name="nationality" value={draft.nationality || ''} onChange={(e) => updateDraft('nationality', e.target.value)} /></EuiFormRow></EuiFlexItem>
              <EuiFlexItem><EuiFormRow label={t('badge_number')}><EuiFieldText name="badge_number" value={draft.badge_number || ''} onChange={(e) => updateDraft('badge_number', e.target.value)} /></EuiFormRow></EuiFlexItem>
              <EuiFlexItem><EuiFormRow label={t('photo_url')}><EuiFieldText type="url" name="photo_url" value={draft.photo_url || ''} onChange={(e) => updateDraft('photo_url', e.target.value)} /></EuiFormRow></EuiFlexItem>
              <EuiFlexItem><EuiFormRow label={t('email')}><EuiFieldText type="email" name="email" value={draft.email || ''} onChange={(e) => updateDraft('email', e.target.value)} /></EuiFormRow></EuiFlexItem>
              <EuiFlexItem><EuiFormRow label={t('phone')}><EuiFieldText name="phone" value={draft.phone || ''} onChange={(e) => updateDraft('phone', e.target.value)} /></EuiFormRow></EuiFlexItem>
              <EuiFlexItem><EuiFormRow label={t('position')}><EuiSelect name="job_position_id" value={draft.job_position_id || ''} onChange={(e) => updateDraft('job_position_id', e.target.value)} options={[{ value: '', text: t('position') }, ...jobPositions.map((jp) => ({ value: jp.id, text: `${jp.name}${jp.code ? ` (${jp.code})` : ''}` }))]} /></EuiFormRow></EuiFlexItem>
              <EuiFlexItem><EuiFormRow label={t('pickup_address_line1')}><EuiFieldText name="pickup_address_line1" value={draft.pickup_address_line1 || ''} onChange={(e) => updateDraft('pickup_address_line1', e.target.value)} /></EuiFormRow></EuiFlexItem>
              <EuiFlexItem><EuiFormRow label={t('pickup_address_line2')}><EuiFieldText name="pickup_address_line2" value={draft.pickup_address_line2 || ''} onChange={(e) => updateDraft('pickup_address_line2', e.target.value)} /></EuiFormRow></EuiFlexItem>
              <EuiFlexItem><EuiFormRow label={t('pickup_city')}><EuiFieldText name="pickup_city" value={draft.pickup_city || ''} onChange={(e) => updateDraft('pickup_city', e.target.value)} /></EuiFormRow></EuiFlexItem>
              <EuiFlexItem><EuiFormRow label={t('pickup_state_province')}><EuiFieldText name="pickup_state_province" value={draft.pickup_state_province || ''} onChange={(e) => updateDraft('pickup_state_province', e.target.value)} /></EuiFormRow></EuiFlexItem>
              <EuiFlexItem><EuiFormRow label={t('pickup_postal_code')}><EuiFieldText name="pickup_postal_code" value={draft.pickup_postal_code || ''} onChange={(e) => updateDraft('pickup_postal_code', e.target.value)} /></EuiFormRow></EuiFlexItem>
              <EuiFlexItem><EuiFormRow label={t('pickup_country')}><EuiFieldText name="pickup_country" value={draft.pickup_country || ''} onChange={(e) => updateDraft('pickup_country', e.target.value)} /></EuiFormRow></EuiFlexItem>
            </EuiFlexGrid>
            <EuiSpacer size="m" />
            <EuiFlexGroup justifyContent="flexEnd">
              <EuiFlexItem grow={false}>
                <EuiButton type="submit" fill isLoading={loading}>
                  {t('add_pax')}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiForm>
        </EuiPanel>
      </EuiFlexItem>

      {matchesLoading ? (
        <EuiFlexItem grow={false}>
          <Spinner label={t('searching_existing_pax')} size="m" />
        </EuiFlexItem>
      ) : null}

      {matches.length > 0 ? (
        <EuiFlexItem grow={false}>
          <EuiPanel color="warning" hasBorder paddingSize="m">
            <EuiTitle size="xxs">
              <h4>{t('duplicate_candidates')}</h4>
            </EuiTitle>
            <EuiSpacer size="s" />
            <EuiText size="s" color="subdued">
              <p>{t('duplicate_candidates_hint')}</p>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiFlexGroup direction="column" gutterSize="s">
              {matches.map((match: any) => (
                <EuiFlexItem key={match.contact_id} grow={false}>
                  <EuiCard
                    title={`${match.first_name} ${match.last_name}`}
                    description={match.job_position_name || match.position || '—'}
                    onClick={() => onAttachExisting(match.contact_id)}
                    footer={<EuiBadge color="warning">{match.match_score}</EuiBadge>}
                  />
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlexItem>
      ) : null}

      {pax.length === 0 ? (
        <EuiFlexItem grow={false}>
          <EuiCallOut title={t('no_pax')} color="primary" iconType="users" />
        </EuiFlexItem>
      ) : (
        <EuiFlexItem grow={false}>
          <EuiFlexGroup direction="column" gutterSize="s">
            {pax.map((item: any) => (
              <EuiFlexItem key={item.contact_id} grow={false}>
                <EuiPanel hasBorder paddingSize="m">
                  <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
                    <EuiFlexItem>
                      <EuiTitle size="xxs">
                        <h4>{item.first_name} {item.last_name}</h4>
                      </EuiTitle>
                      <EuiSpacer size="xs" />
                      <EuiDescriptionList
                        compressed
                        type="inline"
                        listItems={[
                          { title: t('position'), description: item.job_position_name || item.position || '—' },
                          { title: t('birth_date'), description: item.birth_date || '—' },
                          { title: t('badge_number'), description: item.badge_number || '—' },
                        ]}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                        <EuiFlexItem grow={false}><StatusBadge status={item.status || 'pending_check'} /></EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiButton size="s" onClick={() => onOpenCompliance(item.contact_id)}>
                            {t('open_compliance_dossier')}
                          </EuiButton>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiPanel>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </EuiFlexItem>
      )}

      {pax.length > 0 ? (
        <EuiFlexItem grow={false}>
          <EuiFlexGroup justifyContent="flexEnd">
            <EuiFlexItem grow={false}>
              <EuiButton fill onClick={onContinue}>
                {t('continue_to_compliance')}
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      ) : null}
    </EuiFlexGroup>
  )
}
