import React, { useState } from 'react'
import {
  EuiAccordion,
  EuiBadge,
  EuiButton,
  EuiCallOut,
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
  EuiTextArea,
  EuiTitle,
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
    <EuiFlexGroup direction="column" gutterSize="l">
      <EuiFlexItem grow={false}>
        <EuiPanel hasBorder hasShadow paddingSize="m">
          <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
            <EuiFlexItem>
              <EuiTitle size="s">
                <h3>{t('wizard_compliance_title')}</h3>
              </EuiTitle>
              <EuiSpacer size="xs" />
              <EuiText size="s" color="subdued">
                <p>{t('wizard_compliance_text')}</p>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" wrap responsive={false}>
                {(summary.pending_check ?? 0) > 0 ? <EuiFlexItem grow={false}><EuiBadge color="warning">{t('pending_check')}: {summary.pending_check}</EuiBadge></EuiFlexItem> : null}
                {(summary.blocked ?? 0) > 0 ? <EuiFlexItem grow={false}><EuiBadge color="danger">{t('blocked')}: {summary.blocked}</EuiBadge></EuiFlexItem> : null}
                {(summary.approved ?? 0) > 0 ? <EuiFlexItem grow={false}><EuiBadge color="success">{t('approved')}: {summary.approved}</EuiBadge></EuiFlexItem> : null}
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem grow={false}>
        <EuiFlexGroup direction="column" gutterSize="m">
          {pax.map((item: any) => (
            <EuiFlexItem key={item.contact_id} grow={false}>
              <PaxDossier
                pax={item}
                loading={loading}
                credentialTypes={credentialTypes}
                jobPositions={jobPositions}
                onUpdatePax={onUpdatePax}
                onAddCredential={onAddCredential}
              />
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      </EuiFlexItem>

      <EuiFlexItem grow={false}>
        <EuiFlexGroup justifyContent="flexEnd">
          <EuiFlexItem grow={false}>
            <EuiButton fill onClick={onContinue}>
              {t('continue_to_finalize')}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
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

  return (
    <EuiAccordion
      id={`pax-${pax.contact_id}`}
      buttonContent={
        <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
          <EuiFlexItem grow={false}><StatusBadge status={complianceOk ? 'compliance_ok' : (blockers.length > 0 ? 'blocked' : 'pending_check')} /></EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="xxs"><h4>{pax.first_name} {pax.last_name}</h4></EuiTitle>
            <EuiText size="s" color="subdued"><p>{pax.job_position_name || pax.position || '—'}</p></EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      }
      initialIsOpen={!complianceOk}
    >
      <EuiPanel hasBorder paddingSize="m">
        <EuiDescriptionList
          compressed
          type="column"
          listItems={[
            { title: t('birth_date'), description: pax.birth_date || '—' },
            { title: t('nationality'), description: pax.nationality || '—' },
            { title: t('badge_number'), description: pax.badge_number || '—' },
            { title: t('compliance'), description: pax.compliance_ok ? t('compliance_ok') : `${pax.compliance_blocker_count || 0} ${t('compliance_blockers')}` },
          ]}
        />
        <EuiSpacer size="m" />

        {requiredActions.length > 0 ? (
          <>
            <EuiCallOut title={t('required_actions')} color="warning" iconType="warning">
              {requiredActions.map((item: any, index: number) => <p key={index}>{item.message || item.action || String(item)}</p>)}
            </EuiCallOut>
            <EuiSpacer size="m" />
          </>
        ) : null}

        {blockers.length > 0 ? (
          <>
            <EuiCallOut title={t('compliance_issues')} color="danger" iconType="alert">
              {blockers.map((item: any, index: number) => (
                <p key={index}>
                  {(item.credential_type_name || item.credential_type_code || '—')} · {t(item.status || 'blocked')}
                  {item.message ? ` · ${item.message}` : ''}
                </p>
              ))}
            </EuiCallOut>
            <EuiSpacer size="m" />
          </>
        ) : null}

        {missingIdentityFields.length > 0 ? (
          <>
            <EuiCallOut title={t('identity_missing')} color="warning" iconType="user">
              <p>{missingIdentityFields.join(', ')}</p>
            </EuiCallOut>
            <EuiSpacer size="m" />
          </>
        ) : null}

        <EuiFlexGroup gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiButton size="s" onClick={() => setShowIdentityForm((current) => !current)}>
              {t('identity_and_logistics')}
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" onClick={() => setShowCredentialForm((current) => !current)}>
              {t('credentials')}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>

        {showIdentityForm ? (
          <>
            <EuiSpacer size="m" />
            <EuiPanel color="subdued" paddingSize="m">
              <EuiTitle size="xxs"><h4>{t('identity_and_logistics')}</h4></EuiTitle>
              <EuiSpacer size="s" />
              <EuiForm component="form" onSubmit={handleIdentitySubmit}>
                <EuiFlexGrid columns={2}>
                  <EuiFlexItem><EuiFormRow label={t('first_name')}><EuiFieldText name="first_name" defaultValue={pax.first_name || ''} /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('last_name')}><EuiFieldText name="last_name" defaultValue={pax.last_name || ''} /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('birth_date')}><EuiFieldText type="date" name="birth_date" defaultValue={pax.birth_date || ''} /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('nationality')}><EuiFieldText name="nationality" defaultValue={pax.nationality || ''} /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('badge_number')}><EuiFieldText name="badge_number" defaultValue={pax.badge_number || ''} /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('photo_url')}><EuiFieldText type="url" name="photo_url" defaultValue={pax.photo_url || ''} /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('email')}><EuiFieldText type="email" name="email" defaultValue={pax.email || ''} /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('phone')}><EuiFieldText name="phone" defaultValue={pax.phone || ''} /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('position')}><EuiSelect name="job_position_id" defaultValue={pax.job_position_id || ''} options={[{ value: '', text: t('position') }, ...jobPositions.map((jp) => ({ value: jp.id, text: `${jp.name}${jp.code ? ` (${jp.code})` : ''}` }))]} /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('pickup_address_line1')}><EuiFieldText name="pickup_address_line1" defaultValue={pax.pickup_address_line1 || ''} /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('pickup_address_line2')}><EuiFieldText name="pickup_address_line2" defaultValue={pax.pickup_address_line2 || ''} /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('pickup_city')}><EuiFieldText name="pickup_city" defaultValue={pax.pickup_city || ''} /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('pickup_state_province')}><EuiFieldText name="pickup_state_province" defaultValue={pax.pickup_state_province || ''} /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('pickup_postal_code')}><EuiFieldText name="pickup_postal_code" defaultValue={pax.pickup_postal_code || ''} /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('pickup_country')}><EuiFieldText name="pickup_country" defaultValue={pax.pickup_country || ''} /></EuiFormRow></EuiFlexItem>
                </EuiFlexGrid>
                <EuiSpacer size="m" />
                <EuiFlexGroup justifyContent="flexEnd"><EuiFlexItem grow={false}><EuiButton type="submit" isLoading={loading}>{t('save_changes')}</EuiButton></EuiFlexItem></EuiFlexGroup>
              </EuiForm>
            </EuiPanel>
          </>
        ) : null}

        {showCredentialForm ? (
          <>
            <EuiSpacer size="m" />
            <EuiPanel color="subdued" paddingSize="m">
              <EuiTitle size="xxs"><h4>{t('credentials')}</h4></EuiTitle>
              <EuiSpacer size="s" />
              <EuiForm component="form" onSubmit={handleCredentialSubmit}>
                <EuiFlexGrid columns={2}>
                  <EuiFlexItem><EuiFormRow label={t('credential_type')}><EuiSelect name="credential_type_id" defaultValue="" options={[{ value: '', text: '' }, ...credentialTypes.map((ct) => ({ value: ct.id, text: `${ct.name} (${ct.code})` }))]} /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('obtained_date')}><EuiFieldText type="date" name="obtained_date" /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('expiry_date')}><EuiFieldText type="date" name="expiry_date" /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('proof_url')}><EuiFieldText type="url" name="proof_url" /></EuiFormRow></EuiFlexItem>
                  <EuiFlexItem><EuiFormRow label={t('notes')}><EuiTextArea name="notes" rows={2} /></EuiFormRow></EuiFlexItem>
                </EuiFlexGrid>
                <EuiSpacer size="m" />
                <EuiFlexGroup justifyContent="flexEnd"><EuiFlexItem grow={false}><EuiButton type="submit" isLoading={loading}>{t('add_credential')}</EuiButton></EuiFlexItem></EuiFlexGroup>
              </EuiForm>
            </EuiPanel>
          </>
        ) : null}

        <EuiSpacer size="m" />
        <EuiTitle size="xxs"><h4>{t('current_credentials')}</h4></EuiTitle>
        <EuiSpacer size="s" />
        {credentials.length > 0 ? (
          <EuiFlexGroup direction="column" gutterSize="s">
            {credentials.map((credential: any, index: number) => (
              <EuiFlexItem key={index} grow={false}>
                <EuiPanel hasBorder paddingSize="s">
                  <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                    <EuiFlexItem>
                      <EuiText size="s">
                        <p><strong>{credential.credential_type_name || credential.credential_type_code || '—'}</strong></p>
                        {credential.expiry_date ? <p>{credential.expiry_date}</p> : null}
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}><StatusBadge status={credential.status || 'pending_check'} /></EuiFlexItem>
                  </EuiFlexGroup>
                </EuiPanel>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        ) : (
          <EuiText size="s" color="subdued"><p>{t('no_credentials')}</p></EuiText>
        )}
      </EuiPanel>
    </EuiAccordion>
  )
}
