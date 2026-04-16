/**
 * CaptainPortalPage -- Simplified portal for captains / vehicle commanders.
 *
 * Accessible via 6-digit code authentication.
 * Shows trip summary, PAX & cargo manifests, event log form, and weather report form.
 * Mobile-first design with large touch-friendly buttons.
 */
import { useState, useCallback } from 'react'
import {
  Ship, Users, Package, Loader2, LogIn, MapPin,
  Clock, CheckSquare, Send, CloudSun, ArrowRight,
  AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useAuthenticateCaptain,
  useCaptainManifest,
  useCaptainRecordEvent,
  useCaptainReportWeather,
} from '@/hooks/useTravelWiz'
import type { VoyageEventCreate, CaptainWeatherReport } from '@/types/api'

// ── Constants ────────────────────────────────────────────────

const EVENT_TYPES = [
  { value: 'departure', label: 'Départ' },
  { value: 'arrival', label: 'Arrivée' },
  { value: 'stop_arrival', label: 'Arrivée escale' },
  { value: 'stop_departure', label: 'Départ escale' },
  { value: 'pax_boarding', label: 'Embarquement PAX' },
  { value: 'pax_disembark', label: 'Débarquement PAX' },
  { value: 'cargo_loaded', label: 'Cargo chargé' },
  { value: 'cargo_unloaded', label: 'Cargo déchargé' },
  { value: 'delay', label: 'Retard' },
  { value: 'incident', label: 'Incident' },
  { value: 'weather_change', label: 'Changement météo' },
  { value: 'custom', label: 'Autre' },
]

const SEA_STATES = [
  { value: 'calm', label: 'Calme' },
  { value: 'slight', label: 'Peu agitée' },
  { value: 'moderate', label: 'Agitée' },
  { value: 'rough', label: 'Forte' },
  { value: 'very_rough', label: 'Tres forte' },
  { value: 'high', label: 'Grosse' },
]

// ── Helpers ──────────────────────────────────────────────────

function formatDateTime(d: string | null | undefined) {
  if (!d) return '--'
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ── Login Screen ─────────────────────────────────────────────

function CaptainLogin({ onLogin }: { onLogin: (voyageId: string, captainName: string) => void }) {
  const [code, setCode] = useState('')
  const auth = useAuthenticateCaptain()
  const [error, setError] = useState('')

  const handleSubmit = useCallback(async () => {
    if (code.length !== 6) return
    setError('')
    try {
      const result = await auth.mutateAsync(code)
      onLogin(result.voyage_id, result.captain_name)
    } catch {
      setError('Code invalide ou expire')
    }
  }, [code, auth, onLogin])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-2">
            <Ship size={32} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Portail Capitaine</h1>
          <p className="text-sm text-muted-foreground">Entrez votre code d'acces a 6 chiffres</p>
        </div>

        {/* Code input */}
        <div className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            className="w-full text-center text-3xl tracking-[0.5em] font-mono py-4 border-2 border-border rounded-xl bg-background text-foreground focus:border-primary focus:outline-none transition-colors"
            placeholder="------"
            autoFocus
          />

          {error && (
            <p className="text-sm text-destructive text-center flex items-center justify-center gap-1">
              <AlertTriangle size={14} /> {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={code.length !== 6 || auth.isPending}
            className="w-full py-4 rounded-xl bg-primary text-primary-foreground text-lg font-semibold transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {auth.isPending ? <Loader2 size={20} className="animate-spin" /> : <LogIn size={20} />}
            Acceder
          </button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          OpsFlux TravelWiz -- Portail Capitaine
        </p>
      </div>
    </div>
  )
}

// ── Main Portal ──────────────────────────────────────────────

function CaptainDashboard({ voyageId, captainName }: { voyageId: string; captainName: string }) {
  const { data: manifest, isLoading } = useCaptainManifest(voyageId)
  const recordEvent = useCaptainRecordEvent()
  const reportWeather = useCaptainReportWeather()

  const [activeSection, setActiveSection] = useState<'summary' | 'pax' | 'cargo' | 'event' | 'weather'>('summary')

  // Event form
  const [eventCode, setEventCode] = useState('departure')
  const [eventNotes, setEventNotes] = useState('')

  // Weather form
  const [weatherForm, setWeatherForm] = useState<CaptainWeatherReport>({
    wind_speed_knots: null,
    wind_direction: null,
    sea_state: null,
    visibility_nm: null,
    notes: null,
  })

  // Boarding/loading checkboxes (local state)
  const [boardedPax, setBoardedPax] = useState<Set<string>>(new Set())
  const [loadedCargo, setLoadedCargo] = useState<Set<string>>(new Set())

  const togglePax = (id: string) => {
    setBoardedPax((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCargo = (id: string) => {
    setLoadedCargo((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleRecordEvent = async () => {
    if (!eventCode) return
    const payload: VoyageEventCreate = {
      event_code: eventCode,
      recorded_at: new Date().toISOString(),
      notes: eventNotes || null,
    }
    try {
      await recordEvent.mutateAsync({ tripId: voyageId, payload })
      setEventNotes('')
    } catch {
      // handled
    }
  }

  const handleWeatherReport = async () => {
    try {
      await reportWeather.mutateAsync({ tripId: voyageId, payload: weatherForm })
      setWeatherForm({ wind_speed_knots: null, wind_direction: null, sea_state: null, visibility_nm: null, notes: null })
    } catch {
      // handled
    }
  }

  if (isLoading || !manifest) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  const voyage = manifest.voyage
  const passengers = manifest.manifests.flatMap((m) => (m as unknown as { passengers?: { id: string; contact_name: string; seat_number?: string }[] }).passengers || [])
  const cargoItems = manifest.cargo_items

  // Section toggle helper
  const SectionButton = ({ id, label, icon: Icon, count }: { id: typeof activeSection; label: string; icon: typeof Ship; count?: number }) => (
    <button
      onClick={() => setActiveSection(activeSection === id ? 'summary' : id)}
      className={cn(
        'flex items-center gap-2 px-4 py-3 rounded-xl text-left transition-colors w-full',
        activeSection === id ? 'bg-primary/10 border-2 border-primary' : 'bg-card border-2 border-border hover:border-primary/50',
      )}
    >
      <Icon size={20} className={activeSection === id ? 'text-primary' : 'text-muted-foreground'} />
      <span className="flex-1 font-medium text-sm text-foreground">{label}</span>
      {count != null && <span className="text-xs bg-muted rounded-full px-2 py-0.5 text-muted-foreground">{count}</span>}
      {activeSection === id ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
    </button>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Ship size={20} className="text-primary" />
              {voyage.code || 'Voyage'}
            </h1>
            <p className="text-xs text-muted-foreground">Capitaine: {captainName}</p>
          </div>
          <span className={cn(
            'gl-badge text-xs',
            (voyage.status as string) === 'departed' ? 'gl-badge-warning' : (voyage.status as string) === 'arrived' ? 'gl-badge-success' : 'gl-badge-info',
          )}>
            {voyage.status}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3 max-w-lg mx-auto">
        {/* Trip summary (always visible) */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <MapPin size={14} className="text-muted-foreground" />
            <span>{voyage.origin || '?'}</span>
            <ArrowRight size={14} className="text-muted-foreground" />
            <span>{voyage.destination || '?'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock size={12} />
            <span>Départ : {formatDateTime(voyage.departure_at)}</span>
          </div>
          {voyage.arrival_at && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock size={12} />
              <span>Arrivée : {formatDateTime(voyage.arrival_at)}</span>
            </div>
          )}
        </div>

        {/* Sections */}
        <SectionButton id="pax" label="Manifeste PAX" icon={Users} count={passengers.length} />
        {activeSection === 'pax' && (
          <div className="bg-card border border-border rounded-xl p-3 space-y-1">
            {passengers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Aucun passager</p>
            ) : (
              passengers.map((pax) => (
                <label key={pax.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={boardedPax.has(pax.id)}
                    onChange={() => togglePax(pax.id)}
                    className="w-5 h-5 rounded border-2 border-border text-primary focus:ring-primary"
                  />
                  <span className="flex-1 text-sm text-foreground">{pax.contact_name}</span>
                  {pax.seat_number && <span className="text-xs text-muted-foreground font-mono">{pax.seat_number}</span>}
                  {boardedPax.has(pax.id) && <CheckSquare size={16} className="text-green-500" />}
                </label>
              ))
            )}
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              {boardedPax.size}/{passengers.length} embarques
            </p>
          </div>
        )}

        <SectionButton id="cargo" label="Manifeste Cargo" icon={Package} count={cargoItems.length} />
        {activeSection === 'cargo' && (
          <div className="bg-card border border-border rounded-xl p-3 space-y-1">
            {cargoItems.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Aucun colis</p>
            ) : (
              cargoItems.map((item) => (
                <label key={item.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={loadedCargo.has(item.id)}
                    onChange={() => toggleCargo(item.id)}
                    className="w-5 h-5 rounded border-2 border-border text-primary focus:ring-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{item.description || item.code}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {item.weight_kg ? `${item.weight_kg} kg` : '--'}
                      {item.hazmat_class && <span className="text-destructive ml-1">HAZMAT {item.hazmat_class}</span>}
                    </p>
                  </div>
                  {loadedCargo.has(item.id) && <CheckSquare size={16} className="text-green-500" />}
                </label>
              ))
            )}
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              {loadedCargo.size}/{cargoItems.length} charges
            </p>
          </div>
        )}

        <SectionButton id="event" label="Journal de bord" icon={Send} />
        {activeSection === 'event' && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <select
              value={eventCode}
              onChange={(e) => setEventCode(e.target.value)}
              className="w-full py-3 px-3 text-sm border-2 border-border rounded-xl bg-background text-foreground"
            >
              {EVENT_TYPES.map((et) => (
                <option key={et.value} value={et.value}>{et.label}</option>
              ))}
            </select>
            <textarea
              value={eventNotes}
              onChange={(e) => setEventNotes(e.target.value)}
              placeholder="Notes (optionnel)..."
              rows={3}
              className="w-full py-3 px-3 text-sm border-2 border-border rounded-xl bg-background text-foreground resize-y"
            />
            <button
              onClick={handleRecordEvent}
              disabled={recordEvent.isPending}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {recordEvent.isPending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              Enregistrer l'evenement
            </button>
            {recordEvent.isSuccess && (
              <p className="text-xs text-green-600 text-center">Événement enregistré</p>
            )}
          </div>
        )}

        <SectionButton id="weather" label="Rapport météo" icon={CloudSun} />
        {activeSection === 'weather' && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Vent (noeuds)</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={weatherForm.wind_speed_knots ?? ''}
                  onChange={(e) => setWeatherForm({ ...weatherForm, wind_speed_knots: e.target.value ? Number(e.target.value) : null })}
                  className="w-full py-3 px-3 text-sm border-2 border-border rounded-xl bg-background text-foreground"
                  placeholder="--"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Direction</label>
                <input
                  type="text"
                  value={weatherForm.wind_direction ?? ''}
                  onChange={(e) => setWeatherForm({ ...weatherForm, wind_direction: e.target.value || null })}
                  className="w-full py-3 px-3 text-sm border-2 border-border rounded-xl bg-background text-foreground"
                  placeholder="NNE"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Etat de mer</label>
                <select
                  value={weatherForm.sea_state ?? ''}
                  onChange={(e) => setWeatherForm({ ...weatherForm, sea_state: e.target.value || null })}
                  className="w-full py-3 px-3 text-sm border-2 border-border rounded-xl bg-background text-foreground"
                >
                  <option value="">--</option>
                  {SEA_STATES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Visibilite (NM)</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={weatherForm.visibility_nm ?? ''}
                  onChange={(e) => setWeatherForm({ ...weatherForm, visibility_nm: e.target.value ? Number(e.target.value) : null })}
                  className="w-full py-3 px-3 text-sm border-2 border-border rounded-xl bg-background text-foreground"
                  placeholder="--"
                />
              </div>
            </div>
            <textarea
              value={weatherForm.notes ?? ''}
              onChange={(e) => setWeatherForm({ ...weatherForm, notes: e.target.value || null })}
              placeholder="Notes supplementaires..."
              rows={2}
              className="w-full py-3 px-3 text-sm border-2 border-border rounded-xl bg-background text-foreground resize-y"
            />
            <button
              onClick={handleWeatherReport}
              disabled={reportWeather.isPending}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {reportWeather.isPending ? <Loader2 size={18} className="animate-spin" /> : <CloudSun size={18} />}
              Envoyer rapport météo
            </button>
            {reportWeather.isSuccess && (
              <p className="text-xs text-green-600 text-center">Rapport envoyé</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────

export function CaptainPortalPage() {
  const [session, setSession] = useState<{ voyageId: string; captainName: string } | null>(null)

  if (!session) {
    return <CaptainLogin onLogin={(voyageId, captainName) => setSession({ voyageId, captainName })} />
  }

  return <CaptainDashboard voyageId={session.voyageId} captainName={session.captainName} />
}
