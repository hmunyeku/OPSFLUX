import React, { useState, useEffect } from 'react'
import { Search, Package, Ship, MapPin, Scale, Ruler, Clock, User, ArrowRight } from 'lucide-react'
import { t, getLang } from '../lib/i18n'
import { apiRequest, getPublicTrackingCodeFromUrl } from '../lib/api'
import { formatDateTime } from '../lib/utils'
import Layout from '../components/Layout'
import Message, { type MessageData } from '../components/Message'
import Spinner from '../components/Spinner'

export default function TrackingPage() {
  const lang = getLang()
  const [trackingCode, setTrackingCode] = useState(getPublicTrackingCodeFromUrl())
  const [tracking, setTracking] = useState<any>(null)
  const [voyageTracking, setVoyageTracking] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<MessageData | null>(null)

  useEffect(() => {
    if (trackingCode) {
      loadTracking(trackingCode)
    }
  }, [])

  async function loadTracking(code: string) {
    setMessage(null)
    setLoading(true)
    setVoyageTracking(null)
    try {
      const result = await apiRequest(null, `/api/v1/travelwiz/public/cargo/${encodeURIComponent(code)}`)
      setTracking(result)
      const url = new URL(window.location.href)
      url.searchParams.set('tracking', code)
      window.history.replaceState({}, '', url.toString())
    } catch (error: any) {
      setTracking(null)
      const msg = String(error?.message || '')
      if (msg.includes('404')) {
        setMessage({ text: t('cargo_tracking_try_voyage'), tone: 'subtle' })
        try {
          const vResult = await apiRequest(null, `/api/v1/travelwiz/public/voyages/${encodeURIComponent(code)}/cargo`)
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
            tone: 'error',
          })
        }
      } else {
        setVoyageTracking(null)
        setMessage({ text: t('cargo_tracking_unavailable'), tone: 'error' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const code = trackingCode.trim()
    if (!code) {
      setTracking(null)
      setVoyageTracking(null)
      setMessage({ text: t('cargo_tracking_missing'), tone: 'error' })
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero */}
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 rounded-2xl p-8 text-white">
          <p className="text-[10px] uppercase tracking-widest text-brand-200 font-semibold mb-2">OpsFlux Public Tracking</p>
          <h1 className="text-2xl font-bold mb-2">{t('cargo_tracking_title')}</h1>
          <p className="text-sm text-brand-100 mb-6 max-w-xl">{t('cargo_tracking_intro')}</p>

          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 max-w-lg">
            <input
              type="text"
              value={trackingCode}
              onChange={(e) => setTrackingCode(e.target.value)}
              placeholder="TW-CARGO-2026-00421"
              className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/40 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-white/30 backdrop-blur-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 rounded-xl bg-white text-brand-700 text-sm font-semibold hover:bg-brand-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Spinner size="sm" /> : <Search className="w-4 h-4" />}
              {t('cargo_tracking_search')}
            </button>
          </form>
          <p className="text-xs text-brand-200 mt-3">{t('cargo_tracking_hint')}</p>
        </div>

        {/* Message */}
        {message && (
          <Message message={message} onDismiss={() => setMessage(null)} />
        )}

        {/* Cargo tracking result */}
        {tracking && (
          <div className="animate-fade-in space-y-6">
            {/* Status cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <TrackingCard icon={Package} label={t('status')} value={tracking.status_label || tracking.status || t('cargo_tracking_unknown')} />
              <TrackingCard icon={MapPin} label={t('cargo_tracking_destination')} value={tracking.destination_name || t('cargo_tracking_unknown')} />
              <TrackingCard icon={Ship} label={t('cargo_tracking_voyage')} value={tracking.voyage_code || t('cargo_tracking_no_voyage')} />
              <TrackingCard icon={Ruler} label={t('cargo_tracking_dimensions')} value={dimensions} />
            </div>

            {/* Details and timeline */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Summary */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">{t('cargo_tracking_summary')}</h2>
                <dl className="space-y-3">
                  <MetaRow label={t('cargo_tracking_code')} value={tracking.tracking_code || t('cargo_tracking_unknown')} />
                  <MetaRow label={t('cargo_tracking_type')} value={tracking.cargo_type || t('cargo_tracking_unknown')} />
                  <MetaRow label={t('cargo_tracking_weight')} value={weight} />
                  <MetaRow label={t('cargo_tracking_sender')} value={tracking.sender_name || t('cargo_tracking_unknown')} />
                  <MetaRow label={t('cargo_tracking_receiver')} value={tracking.receiver_name || t('cargo_tracking_unknown')} />
                  <MetaRow label={t('cargo_tracking_updated')} value={formatDateTime(tracking.last_event_at, lang) || t('cargo_tracking_unknown')} />
                  <MetaRow label={t('cargo_tracking_received')} value={formatDateTime(tracking.received_at, lang) || t('cargo_tracking_unknown')} />
                </dl>
              </div>

              {/* Timeline */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">{t('cargo_tracking_history')}</h2>
                {Array.isArray(tracking.events) && tracking.events.length > 0 ? (
                  <div className="relative space-y-0">
                    {tracking.events.map((event: any, i: number) => (
                      <div key={i} className="relative flex gap-4 pb-6 last:pb-0">
                        {/* Timeline line */}
                        {i < tracking.events.length - 1 && (
                          <div className="absolute left-[11px] top-6 bottom-0 w-px bg-[var(--border)]" />
                        )}
                        {/* Dot */}
                        <div className="relative z-10 w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-950/40 border-2 border-brand-500 flex items-center justify-center shrink-0 mt-0.5">
                          <div className="w-2 h-2 rounded-full bg-brand-500" />
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-[var(--text-primary)]">
                              {event.label || event.status_label || t('cargo_tracking_updated')}
                            </p>
                            <p className="text-xs text-[var(--text-tertiary)] shrink-0">
                              {formatDateTime(event.timestamp, lang) || t('cargo_tracking_unknown')}
                            </p>
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            {event.note || event.status_label || t('cargo_tracking_updated')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-tertiary)]">{t('cargo_tracking_no_history')}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Voyage tracking result */}
        {voyageTracking && (
          <div className="animate-fade-in space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <TrackingCard icon={Ship} label={t('cargo_tracking_voyage')} value={voyageTracking.voyage_code || t('cargo_tracking_unknown')} />
              <TrackingCard icon={Package} label={t('status')} value={voyageTracking.voyage_status_label || voyageTracking.voyage_status || t('cargo_tracking_unknown')} />
              <TrackingCard icon={Clock} label={t('dates')} value={`${formatDateTime(voyageTracking.scheduled_departure, lang) || t('cargo_tracking_unknown')} \u2192 ${formatDateTime(voyageTracking.scheduled_arrival, lang) || t('cargo_tracking_unknown')}`} />
              <TrackingCard icon={Package} label={t('cargo_tracking_shipments')} value={String(voyageTracking.cargo_count || 0)} />
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

function TrackingCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-[var(--text-tertiary)]" />
        <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
      </div>
      <p className="text-sm font-semibold text-[var(--text-primary)] break-words">{value}</p>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs text-[var(--text-tertiary)] shrink-0">{label}</dt>
      <dd className="text-sm text-[var(--text-primary)] text-right">{value}</dd>
    </div>
  )
}
