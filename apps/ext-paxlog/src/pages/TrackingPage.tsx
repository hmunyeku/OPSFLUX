import React, { useState, useEffect } from 'react'
import { Search, Package, Ship, MapPin, Ruler, Clock, ArrowRight } from 'lucide-react'
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 py-8 lg:py-10 space-y-6">
        <section className="ext-shell-card overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_380px]">
            <div className="relative p-6 sm:p-8 lg:p-10 bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_90%)] text-white">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_30%)]" />
              <div className="relative">
                <p className="text-[11px] uppercase tracking-[0.18em] font-medium text-blue-100 mb-3">Suivi public OpsFlux</p>
                <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em]">Suivre un colis ou un voyage</h1>
                <p className="mt-4 max-w-2xl text-sm sm:text-[15px] leading-7 text-blue-50/90">
                  Recherchez un colis ou un code voyage pour obtenir son statut, son historique et les dernières informations de traitement.
                </p>

                <form onSubmit={handleSearch} className="mt-8 flex flex-col sm:flex-row gap-3 max-w-2xl">
                  <input
                    type="text"
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value)}
                    placeholder="TW-CARGO-2026-00421"
                    className="flex-1 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-mono text-white placeholder:text-white/45 backdrop-blur-sm focus:outline-none focus:ring-4 focus:ring-white/10"
                  />
                  <button type="submit" disabled={loading} className="ext-btn bg-white text-slate-950 hover:bg-slate-100 disabled:opacity-50">
                    {loading ? <Spinner size="sm" /> : <Search className="w-4 h-4" />}
                    {t('cargo_tracking_search')}
                  </button>
                </form>
                <p className="mt-3 text-xs text-blue-100/80">{t('cargo_tracking_hint')}</p>
              </div>
            </div>

            <div className="p-6 sm:p-8 bg-slate-50 border-t lg:border-t-0 lg:border-l border-slate-200">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Lecture rapide</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <InfoPanel label={t('status')} value={tracking?.status_label || tracking?.status || voyageTracking?.voyage_status_label || voyageTracking?.voyage_status || '—'} />
                <InfoPanel label={t('cargo_tracking_voyage')} value={tracking?.voyage_code || voyageTracking?.voyage_code || '—'} />
                <InfoPanel label={t('cargo_tracking_destination')} value={tracking?.destination_name || '—'} />
                <InfoPanel label={t('cargo_tracking_shipments')} value={String(voyageTracking?.cargo_count || 0)} />
              </div>
            </div>
          </div>
        </section>

        {message && <Message message={message} onDismiss={() => setMessage(null)} />}

        {tracking && (
          <div className="tracking-grid">
            <section className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <TrackingCard icon={Package} label={t('status')} value={tracking.status_label || tracking.status || t('cargo_tracking_unknown')} />
                <TrackingCard icon={MapPin} label={t('cargo_tracking_destination')} value={tracking.destination_name || t('cargo_tracking_unknown')} />
                <TrackingCard icon={Ship} label={t('cargo_tracking_voyage')} value={tracking.voyage_code || t('cargo_tracking_no_voyage')} />
                <TrackingCard icon={Ruler} label={t('cargo_tracking_dimensions')} value={dimensions} />
              </div>

              <div className="ext-shell-card p-6 sm:p-7">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{t('cargo_tracking_history')}</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Historique de traitement</h2>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
                    {tracking.tracking_code || 'Code inconnu'}
                  </span>
                </div>

                {Array.isArray(tracking.events) && tracking.events.length > 0 ? (
                  <div className="space-y-0">
                    {tracking.events.map((event: any, i: number) => (
                      <div key={i} className="relative flex gap-4 pb-6 last:pb-0">
                        {i < tracking.events.length - 1 && (
                          <div className="absolute left-[15px] top-8 bottom-0 w-px bg-slate-200" />
                        )}
                        <div className="relative z-10 mt-1 flex h-8 w-8 items-center justify-center rounded-full border border-blue-200 bg-blue-50">
                          <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                        </div>
                        <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-950">
                                {event.label || event.status_label || t('cargo_tracking_updated')}
                              </p>
                              <p className="mt-1 text-sm text-slate-600">
                                {event.note || event.status_label || t('cargo_tracking_updated')}
                              </p>
                            </div>
                            <p className="mono text-[11px] text-slate-400 whitespace-nowrap">
                              {formatDateTime(event.timestamp, lang) || t('cargo_tracking_unknown')}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{t('cargo_tracking_no_history')}</p>
                )}
              </div>
            </section>

            <aside className="space-y-6">
              <div className="ext-shell-card p-6">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{t('cargo_tracking_summary')}</p>
                <dl className="mt-5 space-y-4">
                  <MetaRow label={t('cargo_tracking_code')} value={tracking.tracking_code || t('cargo_tracking_unknown')} />
                  <MetaRow label={t('cargo_tracking_type')} value={tracking.cargo_type || t('cargo_tracking_unknown')} />
                  <MetaRow label={t('cargo_tracking_weight')} value={weight} />
                  <MetaRow label={t('cargo_tracking_sender')} value={tracking.sender_name || t('cargo_tracking_unknown')} />
                  <MetaRow label={t('cargo_tracking_receiver')} value={tracking.receiver_name || t('cargo_tracking_unknown')} />
                  <MetaRow label={t('cargo_tracking_updated')} value={formatDateTime(tracking.last_event_at, lang) || t('cargo_tracking_unknown')} />
                  <MetaRow label={t('cargo_tracking_received')} value={formatDateTime(tracking.received_at, lang) || t('cargo_tracking_unknown')} />
                </dl>
              </div>

              <div className="ext-shell-card p-6">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Conseils</p>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="flex items-start gap-3">
                    <Clock className="mt-0.5 h-4 w-4 text-blue-600" />
                    <p>Le dernier événement horodaté reflète l’état opérationnel actuellement connu.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Package className="mt-0.5 h-4 w-4 text-slate-500" />
                    <p>En cas d’écart, communiquez le code de suivi affiché dans le panneau de synthèse.</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}

        {voyageTracking && (
          <section className="ext-shell-card p-6 sm:p-7">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{t('cargo_tracking_voyage')}</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-slate-950">
                  {voyageTracking.voyage_code || t('cargo_tracking_unknown')}
                </h2>
              </div>
              <button onClick={handleSearch} className="ext-btn-secondary">
                Rechercher à nouveau
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <TrackingCard icon={Ship} label={t('cargo_tracking_voyage')} value={voyageTracking.voyage_code || t('cargo_tracking_unknown')} />
              <TrackingCard icon={Package} label={t('status')} value={voyageTracking.voyage_status_label || voyageTracking.voyage_status || t('cargo_tracking_unknown')} />
              <TrackingCard icon={Clock} label={t('dates')} value={`${formatDateTime(voyageTracking.scheduled_departure, lang) || t('cargo_tracking_unknown')} → ${formatDateTime(voyageTracking.scheduled_arrival, lang) || t('cargo_tracking_unknown')}`} />
              <TrackingCard icon={Package} label={t('cargo_tracking_shipments')} value={String(voyageTracking.cargo_count || 0)} />
            </div>
          </section>
        )}
      </div>
    </Layout>
  )
}

function TrackingCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="ext-shell-card-soft p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 border border-blue-100">
          <Icon className="w-4 h-4 text-blue-700" />
        </div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
      </div>
      <p className="text-sm font-semibold text-slate-950 break-words">{value}</p>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs text-slate-500 shrink-0">{label}</dt>
      <dd className="text-sm text-slate-950 text-right">{value}</dd>
    </div>
  )
}

function InfoPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-950 break-words">{value}</p>
    </div>
  )
}
