import React from 'react'
import {
  EuiBadge,
  EuiButton,
  EuiDescriptionList,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui'
import { t } from '../lib/i18n'
import Spinner from '../components/Spinner'

interface AdsInfoStepProps {
  dossier: any
  loading: boolean
  onDownloadTicket: () => void
  onContinue: () => void
}

export default function AdsInfoStep({ dossier, loading, onDownloadTicket, onContinue }: AdsInfoStepProps) {
  if (!dossier) {
    return <Spinner label={t('loading')} paddingBlock={48} size="xl" />
  }

  const ads = dossier.ads
  const linkedProjects = Array.isArray(ads.linked_projects) ? ads.linked_projects : []
  const preconfigured = dossier.preconfigured_data || {}
  const preconfiguredEntries = Object.entries(preconfigured).filter(([, value]) => value !== null && value !== '')

  return (
    <EuiFlexGroup direction="column" gutterSize="l">
      <EuiFlexItem grow={false}>
        <EuiPanel hasBorder hasShadow paddingSize="l">
          <EuiFlexGroup justifyContent="spaceBetween" alignItems="flexStart">
            <EuiFlexItem>
              <EuiTitle size="s">
                <h3>{ads.reference}</h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiText color="subdued">
                <p>{ads.visit_purpose || '—'}</p>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton onClick={onDownloadTicket} isLoading={loading}>
                {t('download_ticket')}
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
      </EuiFlexItem>

      <EuiFlexItem grow={false}>
        <EuiFlexGrid columns={3}>
          <EuiFlexItem>
            <EuiPanel hasBorder paddingSize="m">
              <EuiDescriptionList
                type="column"
                compressed
                listItems={[
                  { title: t('company'), description: dossier.allowed_company_name || '—' },
                  { title: t('site'), description: ads.site_name || '—' },
                ]}
              />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel hasBorder paddingSize="m">
              <EuiDescriptionList
                type="column"
                compressed
                listItems={[
                  { title: t('dates'), description: `${ads.start_date || '—'} → ${ads.end_date || '—'}` },
                  { title: t('category'), description: ads.visit_category || '—' },
                ]}
              />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel hasBorder paddingSize="m">
              <EuiDescriptionList
                type="column"
                compressed
                listItems={[
                  { title: t('outbound_transport'), description: ads.outbound_transport_mode || '—' },
                  { title: t('return_transport'), description: ads.return_transport_mode || '—' },
                ]}
              />
            </EuiPanel>
          </EuiFlexItem>
        </EuiFlexGrid>
      </EuiFlexItem>

      {linkedProjects.length > 0 ? (
        <EuiFlexItem grow={false}>
          <EuiPanel hasBorder paddingSize="m">
            <EuiTitle size="xxs">
              <h4>{t('linked_projects')}</h4>
            </EuiTitle>
            <EuiSpacer size="s" />
            <EuiFlexGroup wrap gutterSize="s">
              {linkedProjects.map((item: any, index: number) => (
                <EuiFlexItem key={index} grow={false}>
                  <EuiBadge color="primary">{item.project_name || item.project_id || '—'}</EuiBadge>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlexItem>
      ) : null}

      {preconfiguredEntries.length > 0 ? (
        <EuiFlexItem grow={false}>
          <EuiPanel hasBorder paddingSize="m">
            <EuiTitle size="xxs">
              <h4>{t('preconfigured')}</h4>
            </EuiTitle>
            <EuiSpacer size="s" />
            <EuiFlexGroup wrap gutterSize="s">
              {preconfiguredEntries.map(([key, value]) => (
                <EuiFlexItem key={key} grow={false}>
                  <EuiBadge color="hollow">
                    {key}: {Array.isArray(value) ? value.join(', ') : String(value)}
                  </EuiBadge>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlexItem>
      ) : null}

      {ads.rejection_reason ? (
        <EuiFlexItem grow={false}>
          <EuiPanel color="warning" hasBorder paddingSize="m">
            <EuiText size="s">
              <p><strong>{t('correction_reason')}</strong></p>
              <p>{ads.rejection_reason}</p>
            </EuiText>
          </EuiPanel>
        </EuiFlexItem>
      ) : null}

      <EuiFlexItem grow={false}>
        <EuiFlexGroup justifyContent="flexEnd">
          <EuiFlexItem grow={false}>
            <EuiButton fill onClick={onContinue}>
              {t('continue_to_team')}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  )
}
