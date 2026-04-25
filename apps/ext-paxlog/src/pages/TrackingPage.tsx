import React, { useEffect, useState } from 'react'
import {
  EuiButton,
  EuiCallOut,
  EuiDescriptionList,
  EuiFieldSearch,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui'
import { t, getLang } from '../lib/i18n'
import { apiRequest, getPublicTrackingCodeFromUrl } from '../lib/api'
import { formatDateTime } from '../lib/utils'
import Layout from '../components/Layout'

export default function TrackingPage() {
  const lang = getLang()
  const [trackingCode, setTrackingCode] = useState(getPublicTrackingCodeFromUrl())
  const [tracking, setTracking] = useState<any>(null)
  const [voyageTracking, setVoyageTracking] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; color: 'danger' | 'primary' } | null>(null)

  useEffect(() => {
    if (trackingCode) {
      loadTracking(trackingCode)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTracking(code: string) {
    setMessage(null)
    setLoading(true)
    setVoyageTracking(null)
    try {
      // Canonical PackLog tracking endpoint. The legacy /travelwiz path
      // still exists server-side for backwards compat but PackLog now
      // owns the cargo + tracking domain end-to-end.
      const result = await apiRequest(null, `/api/v1/packlog/public/cargo/${encodeURIComponent(code)}`)
      setTracking(result)
      const url = new URL(window.location.href)
      url.searchParams.set('tracking', code)
      window.history.replaceState({}, '', url.toString())
    } catch (error: any) {
      setTracking(null)
      const msg = String(error?.message || '')
      if (msg.includes('404')) {
        setMessage({ text: t('cargo_tracking_try_voyage'), color: 'primary' })
        try {
          const vResult = await apiRequest(null, `/api/v1/packlog/public/voyages/${encodeURIComponent(code)}/cargo`)
          setVoyageTracking(vResult)
          const url = new URL(window.location.href)
          url.searchParams.set('tracking', code)
          window.history.replaceState({}, '', url.toString())
          setMessage(null)
        } catch (ve: any) {
          setVoyageTracking(null)
          const vMsg = String(ve?.message || '')
          setMessage({
            text: vMsg.includes('404') ? t('cargo_tracking_not_found') : t('cargo_tracking_unavailable'),
            color: 'danger',
          })
        }
      } else {
        setVoyageTracking(null)
        setMessage({ text: t('cargo_tracking_unavailable'), color: 'danger' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    const code = trackingCode.trim()
    if (!code) {
      setTracking(null)
      setVoyageTracking(null)
      setMessage({ text: t('cargo_tracking_missing'), color: 'danger' })
      return
    }
    loadTracking(code)
  }

  const dimensions = tracking && [tracking.length_cm, tracking.width_cm, tracking.height_cm].every((v: any) => typeof v === 'number')
    ? `${tracking.length_cm} x ${tracking.width_cm} x ${tracking.height_cm} cm`
    : t('cargo_tracking_dimensions_unknown')
  const weight = typeof tracking?.weight_kg === 'number' ? `${tracking.weight_kg.toFixed(1)} kg` : t('cargo_tracking_unknown')

  return (
    <Layout>
      <div style={{ padding: '0 16px' }}>
        <EuiFlexGroup direction="column" gutterSize="l">
          <EuiFlexItem grow={false}>
            <EuiPanel hasBorder hasShadow paddingSize="l">
              <EuiTitle size="l"><h1>{t('cargo_tracking_title')}</h1></EuiTitle>
              <EuiSpacer size="s" />
              <EuiText color="subdued"><p>{t('cargo_tracking_intro')}</p></EuiText>
              <EuiSpacer size="m" />
              <form onSubmit={handleSearch}>
                <EuiFlexGroup>
                  <EuiFlexItem>
                    <EuiFieldSearch
                      value={trackingCode}
                      onChange={(event) => setTrackingCode(event.target.value)}
                      placeholder="TW-CARGO-2026-00421"
                      isLoading={loading}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButton type="submit" fill isLoading={loading}>
                      {t('cargo_tracking_search')}
                    </EuiButton>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </form>
              <EuiSpacer size="s" />
              <EuiText size="s" color="subdued"><p>{t('cargo_tracking_hint')}</p></EuiText>
            </EuiPanel>
          </EuiFlexItem>

          {message ? (
            <EuiFlexItem grow={false}>
              <EuiCallOut title={message.text} color={message.color} iconType={message.color === 'danger' ? 'alert' : 'iInCircle'} />
            </EuiFlexItem>
          ) : null}

          {tracking ? (
            <EuiFlexItem grow={false}>
              <EuiFlexGroup alignItems="flexStart">
                <EuiFlexItem grow={2}>
                  <EuiFlexGroup direction="column" gutterSize="m">
                    <EuiFlexItem grow={false}>
                      <EuiFlexGrid columns={4}>
                        <EuiFlexItem><MetricPanel label={t('status')} value={tracking.status_label || tracking.status || t('cargo_tracking_unknown')} /></EuiFlexItem>
                        <EuiFlexItem><MetricPanel label={t('cargo_tracking_destination')} value={tracking.destination_name || t('cargo_tracking_unknown')} /></EuiFlexItem>
                        <EuiFlexItem><MetricPanel label={t('cargo_tracking_voyage')} value={tracking.voyage_code || t('cargo_tracking_no_voyage')} /></EuiFlexItem>
                        <EuiFlexItem><MetricPanel label={t('cargo_tracking_dimensions')} value={dimensions} /></EuiFlexItem>
                      </EuiFlexGrid>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiPanel hasBorder paddingSize="l">
                        <EuiTitle size="s"><h2>{t('cargo_tracking_history')}</h2></EuiTitle>
                        <EuiSpacer size="m" />
                        {Array.isArray(tracking.events) && tracking.events.length > 0 ? (
                          <EuiFlexGroup direction="column" gutterSize="s">
                            {tracking.events.map((event: any, index: number) => (
                              <EuiFlexItem key={index} grow={false}>
                                <EuiPanel color="subdued" paddingSize="m">
                                  <EuiText size="s">
                                    <p><strong>{event.label || event.status_label || t('cargo_tracking_updated')}</strong></p>
                                    <p>{event.note || event.status_label || t('cargo_tracking_updated')}</p>
                                    <p>{formatDateTime(event.timestamp, lang) || t('cargo_tracking_unknown')}</p>
                                  </EuiText>
                                </EuiPanel>
                              </EuiFlexItem>
                            ))}
                          </EuiFlexGroup>
                        ) : (
                          <EuiText size="s" color="subdued"><p>{t('cargo_tracking_no_history')}</p></EuiText>
                        )}
                      </EuiPanel>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>

                <EuiFlexItem grow={1}>
                  <EuiPanel hasBorder paddingSize="l">
                    <EuiTitle size="s"><h2>{t('cargo_tracking_summary')}</h2></EuiTitle>
                    <EuiSpacer size="m" />
                    <EuiDescriptionList
                      compressed
                      type="column"
                      listItems={[
                        { title: t('cargo_tracking_code'), description: tracking.tracking_code || t('cargo_tracking_unknown') },
                        { title: t('cargo_tracking_type'), description: tracking.cargo_type || t('cargo_tracking_unknown') },
                        { title: t('cargo_tracking_weight'), description: weight },
                        { title: t('cargo_tracking_sender'), description: tracking.sender_name || t('cargo_tracking_unknown') },
                        { title: t('cargo_tracking_receiver'), description: tracking.receiver_name || t('cargo_tracking_unknown') },
                        { title: t('cargo_tracking_updated'), description: formatDateTime(tracking.last_event_at, lang) || t('cargo_tracking_unknown') },
                        { title: t('cargo_tracking_received'), description: formatDateTime(tracking.received_at, lang) || t('cargo_tracking_unknown') },
                      ]}
                    />
                  </EuiPanel>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          ) : null}

          {voyageTracking ? (
            <EuiFlexItem grow={false}>
              <EuiPanel hasBorder paddingSize="l">
                <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                  <EuiFlexItem>
                    <EuiTitle size="s"><h2>{voyageTracking.voyage_code || t('cargo_tracking_unknown')}</h2></EuiTitle>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButton onClick={handleSearch}>{t('cargo_tracking_search')}</EuiButton>
                  </EuiFlexItem>
                </EuiFlexGroup>
                <EuiSpacer size="m" />
                <EuiFlexGrid columns={4}>
                  <EuiFlexItem><MetricPanel label={t('cargo_tracking_voyage')} value={voyageTracking.voyage_code || t('cargo_tracking_unknown')} /></EuiFlexItem>
                  <EuiFlexItem><MetricPanel label={t('status')} value={voyageTracking.voyage_status_label || voyageTracking.voyage_status || t('cargo_tracking_unknown')} /></EuiFlexItem>
                  <EuiFlexItem><MetricPanel label={t('dates')} value={`${formatDateTime(voyageTracking.scheduled_departure, lang) || t('cargo_tracking_unknown')} → ${formatDateTime(voyageTracking.scheduled_arrival, lang) || t('cargo_tracking_unknown')}`} /></EuiFlexItem>
                  <EuiFlexItem><MetricPanel label={t('cargo_tracking_shipments')} value={String(voyageTracking.cargo_count || 0)} /></EuiFlexItem>
                </EuiFlexGrid>
              </EuiPanel>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      </div>
    </Layout>
  )
}

function MetricPanel({ label, value }: { label: string; value: string }) {
  return (
    <EuiPanel hasBorder color="subdued" paddingSize="m">
      <EuiText size="xs" color="subdued"><p>{label}</p></EuiText>
      <EuiSpacer size="xs" />
      <EuiText size="s"><strong>{value}</strong></EuiText>
    </EuiPanel>
  )
}
