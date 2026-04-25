import React, { useState } from 'react'
import {
  EuiButton,
  EuiCallOut,
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
    <EuiFlexGroup direction="column" gutterSize="l">
      <EuiFlexItem grow={false}>
        <EuiCallOut
          title={readyForSubmission ? t('dossier_ready') : t('dossier_needs_review')}
          color={readyForSubmission ? 'success' : 'warning'}
          iconType={readyForSubmission ? 'checkInCircleFilled' : 'warning'}
        >
          <p>{readyForSubmission ? t('wizard_finalize_ready') : t('wizard_finalize_blocked')}</p>
        </EuiCallOut>
      </EuiFlexItem>

      {!readyForSubmission && blockers.length > 0 ? (
        <EuiFlexItem grow={false}>
          <EuiPanel hasBorder color="danger" paddingSize="m">
            <EuiTitle size="xxs">
              <h4>{t('submission_blockers_title')}</h4>
            </EuiTitle>
            <EuiSpacer size="s" />
            <EuiText size="s">
              {blockers.map((item: string, index: number) => <p key={index}>{item}</p>)}
            </EuiText>
          </EuiPanel>
        </EuiFlexItem>
      ) : null}

      <EuiFlexItem grow={false}>
        <EuiPanel hasBorder paddingSize="l">
          <EuiTitle size="s">
            <h3>{t('transport_preferences')}</h3>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiText size="s" color="subdued">
            <p>{t('transport_preferences_text')}</p>
          </EuiText>
          <EuiSpacer size="m" />
          <EuiForm component="form" onSubmit={handleTransportSubmit}>
            <EuiFlexGrid columns={2}>
              <EuiFlexItem>
                <EuiFormRow label={t('outbound_departure_base')}>
                  <EuiSelect
                    name="outbound_departure_base_id"
                    defaultValue={ads.outbound_departure_base_id || ''}
                    options={[
                      { value: '', text: t('not_defined') },
                      ...departureBases.map((db) => ({
                        value: db.id,
                        text: db.code ? `${db.code} — ${db.name}` : db.name,
                      })),
                    ]}
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFormRow label={t('return_departure_base')}>
                  <EuiSelect
                    name="return_departure_base_id"
                    defaultValue={ads.return_departure_base_id || ''}
                    options={[
                      { value: '', text: t('not_defined') },
                      ...departureBases.map((db) => ({
                        value: db.id,
                        text: db.code ? `${db.code} — ${db.name}` : db.name,
                      })),
                    ]}
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFormRow label={t('outbound_notes')}>
                  <EuiTextArea name="outbound_notes" defaultValue={ads.outbound_notes || ''} rows={3} />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFormRow label={t('return_notes')}>
                  <EuiTextArea name="return_notes" defaultValue={ads.return_notes || ''} rows={3} />
                </EuiFormRow>
              </EuiFlexItem>
            </EuiFlexGrid>
            <EuiSpacer size="m" />
            <EuiFlexGroup justifyContent="flexEnd">
              <EuiFlexItem grow={false}>
                <EuiButton type="submit" isLoading={loading}>
                  {t('save_transport_preferences')}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiForm>
        </EuiPanel>
      </EuiFlexItem>

      {dossier.can_resubmit ? (
        <EuiFlexItem grow={false}>
          <EuiPanel hasBorder color="warning" paddingSize="m">
            <EuiTitle size="xxs">
              <h4>{t('resubmit_reason')}</h4>
            </EuiTitle>
            <EuiSpacer size="m" />
            <EuiForm component="form" onSubmit={handleResubmit}>
              <EuiFormRow>
                <EuiTextArea
                  value={resubmitReason}
                  onChange={(event) => setResubmitReason(event.target.value)}
                  rows={3}
                />
              </EuiFormRow>
              <EuiFlexGroup justifyContent="flexEnd">
                <EuiFlexItem grow={false}>
                  <EuiButton type="submit" color="warning" isDisabled={!resubmitReason.trim()} isLoading={loading}>
                    {t('resubmit')}
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiForm>
          </EuiPanel>
        </EuiFlexItem>
      ) : null}

      <EuiFlexItem grow={false}>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButton onClick={onDownloadTicket} isLoading={loading}>
              {t('download_ticket')}
            </EuiButton>
          </EuiFlexItem>
          {dossier.can_submit ? (
            <EuiFlexItem grow={false}>
              <EuiButton fill color={readyForSubmission ? 'success' : 'primary'} onClick={onSubmit} isLoading={loading}>
                {t('submit')}
              </EuiButton>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  )
}
