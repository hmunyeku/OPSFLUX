/**
 * MobilePairingCard — QR code login pairing for the OpsFlux mobile app.
 *
 * Flow:
 *  1. User clicks "Connecter l'app mobile".
 *  2. POST /auth/mobile-pair/generate → returns { token, qr_payload, expires_at }.
 *  3. Component displays the QR (built from qr_payload), a countdown, and a
 *     cancel button.
 *  4. Polls GET /auth/mobile-pair/status every 2s until the mobile consumes
 *     the token (status === "consumed") or it expires.
 *  5. On success, shows a confirmation with device info and auto-closes.
 *
 * Security notes:
 *  - The plaintext token lives only in this component's state; it's rebuilt
 *    into the QR on the fly and never persisted.
 *  - Polling interval is 2s so the UX feels instant without hammering the API.
 *  - On unmount, if the token is still pending, we call /revoke to clean up.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { Smartphone, CheckCircle2, XCircle, RefreshCw, X } from 'lucide-react'
import api from '@/lib/api'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

interface PairingState {
  phase: 'idle' | 'generating' | 'waiting' | 'consumed' | 'expired' | 'error'
  token: string | null
  qrPayload: string | null
  expiresAt: Date | null
  error: string | null
  deviceInfo: Record<string, any> | null
}

const INITIAL_STATE: PairingState = {
  phase: 'idle',
  token: null,
  qrPayload: null,
  expiresAt: null,
  error: null,
  deviceInfo: null,
}

const POLL_INTERVAL_MS = 2000

export function MobilePairingCard() {
  const { t } = useTranslation()
  const [state, setState] = useState<PairingState>(INITIAL_STATE)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const pollTimer = useRef<number | null>(null)
  const countdownTimer = useRef<number | null>(null)
  const tokenRef = useRef<string | null>(null)

  // Keep tokenRef synced so the unmount cleanup always has the latest value
  useEffect(() => {
    tokenRef.current = state.token
  }, [state.token])

  const stopTimers = useCallback(() => {
    if (pollTimer.current) {
      window.clearInterval(pollTimer.current)
      pollTimer.current = null
    }
    if (countdownTimer.current) {
      window.clearInterval(countdownTimer.current)
      countdownTimer.current = null
    }
  }, [])

  const cancel = useCallback(
    async (revokeRemote: boolean = true) => {
      stopTimers()
      const tok = tokenRef.current
      if (revokeRemote && tok) {
        try {
          await api.post('/api/v1/auth/mobile-pair/revoke', null, { params: { token: tok } })
        } catch {
          /* non-fatal */
        }
      }
      setState(INITIAL_STATE)
      setSecondsLeft(0)
    },
    [stopTimers]
  )

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopTimers()
      const tok = tokenRef.current
      if (tok) {
        api
          .post('/api/v1/auth/mobile-pair/revoke', null, { params: { token: tok } })
          .catch(() => {})
      }
    }
  }, [stopTimers])

  const startPolling = useCallback((token: string) => {
    const poll = async () => {
      try {
        const { data } = await api.get('/api/v1/auth/mobile-pair/status', {
          params: { token },
        })
        if (data.status === 'consumed') {
          stopTimers()
          setState((prev) => ({
            ...prev,
            phase: 'consumed',
            deviceInfo: data.consumed_device_info ?? null,
          }))
          // Auto-close after 4s
          window.setTimeout(() => {
            setState(INITIAL_STATE)
            setSecondsLeft(0)
          }, 4000)
        } else if (data.status === 'expired' || data.status === 'revoked') {
          stopTimers()
          setState((prev) => ({
            ...prev,
            phase: 'expired',
          }))
        }
      } catch {
        /* transient errors are ignored — next tick retries */
      }
    }
    pollTimer.current = window.setInterval(poll, POLL_INTERVAL_MS)
  }, [stopTimers])

  const startCountdown = useCallback((expiresAt: Date) => {
    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining === 0) {
        stopTimers()
        setState((prev) => (prev.phase === 'waiting' ? { ...prev, phase: 'expired' } : prev))
      }
    }
    tick()
    countdownTimer.current = window.setInterval(tick, 500)
  }, [stopTimers])

  const generate = useCallback(async () => {
    setState({ ...INITIAL_STATE, phase: 'generating' })
    try {
      const { data } = await api.post('/api/v1/auth/mobile-pair/generate')
      const expiresAt = new Date(data.expires_at)
      setState({
        phase: 'waiting',
        token: data.token,
        qrPayload: data.qr_payload,
        expiresAt,
        error: null,
        deviceInfo: null,
      })
      startCountdown(expiresAt)
      startPolling(data.token)
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? 'Impossible de générer le code.'
      setState({ ...INITIAL_STATE, phase: 'error', error: detail })
    }
  }, [startCountdown, startPolling])

  return (
    <CollapsibleSection
      id="mobile-pairing"
      title="App mobile OpsFlux"
      description={t('shared.connectez_vous_sur_votre_telephone_en_sc')}
      storageKey="settings.mobile.collapse"
      defaultExpanded={false}
    >
      <div className="mt-3 max-w-[640px] space-y-4">
        {state.phase === 'idle' && <IdleView onGenerate={generate} />}

        {state.phase === 'generating' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw size={16} className="animate-spin" />
            Génération du code...
          </div>
        )}

        {state.phase === 'waiting' && state.qrPayload && (
          <WaitingView
            qrPayload={state.qrPayload}
            secondsLeft={secondsLeft}
            onCancel={() => cancel(true)}
          />
        )}

        {state.phase === 'consumed' && (
          <ConsumedView deviceInfo={state.deviceInfo} onDone={() => cancel(false)} />
        )}

        {state.phase === 'expired' && (
          <ExpiredView onRetry={generate} onCancel={() => cancel(false)} />
        )}

        {state.phase === 'error' && state.error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
            <XCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Erreur</div>
              <div>{state.error}</div>
              <button
                onClick={generate}
                className="mt-2 text-xs underline hover:no-underline"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}

/* ── Sub-views ─────────────────────────────────────────────────────── */

function IdleView({ onGenerate }: { onGenerate: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border border-border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
          <Smartphone size={20} />
        </div>
        <div className="text-sm">
          <div className="font-medium text-foreground">{t('shared.coupler_un_appareil')}</div>
          <div className="text-muted-foreground mt-0.5">
            Affichez un QR code à scanner depuis l'app mobile OpsFlux. Valable 2 minutes.
          </div>
        </div>
      </div>
      <button
        onClick={onGenerate}
        className="gl-button-sm gl-button-confirm shrink-0 sm:ml-4"
      >
        Générer un code
      </button>
    </div>
  )
}

function WaitingView({
  qrPayload,
  secondsLeft,
  onCancel,
}: {
  qrPayload: string
  secondsLeft: number
  onCancel: () => void
}) {
  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const label = minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`
  const expiring = secondsLeft <= 20

  return (
    <div className="flex flex-col sm:flex-row gap-6 rounded-md border border-border bg-background p-4">
      <div className="flex flex-col items-center gap-2">
        <div className="rounded-lg border border-border bg-white p-3">
          <QRCodeSVG
            value={qrPayload}
            size={192}
            level="M"
            includeMargin={false}
            bgColor="#ffffff"
            fgColor="#0f172a"
          />
        </div>
        <div
          className={`text-xs font-mono tabular-nums ${
            expiring ? 'text-destructive' : 'text-muted-foreground'
          }`}
        >
          Expire dans {label}
        </div>
      </div>

      <div className="flex-1 text-sm space-y-3">
        <div>
          <div className="font-medium text-foreground">Scannez depuis l'app mobile</div>
          <ol className="mt-2 space-y-2 text-muted-foreground list-decimal list-inside">
            <li>{t('shared.ouvrez_l_app_opsflux_sur_votre_telephone')}</li>
            <li>
              Sur l'écran de connexion, tapotez{' '}
              <span className="font-medium text-foreground">{t('shared.scanner_un_qr')}</span>.
            </li>
            <li>{t('shared.pointez_la_camera_vers_ce_qr_code')}</li>
          </ol>
        </div>

        <div className="rounded border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t('shared.securite')}</span> ce code est à
          usage unique et n'est valable que depuis votre appareil web. Ne le partagez
          pas.
        </div>

        <button
          onClick={onCancel}
          className="gl-button-sm gl-button-default text-xs items-center gap-1.5"
        >
          <X size={14} />
          Annuler
        </button>
      </div>
    </div>
  )
}

function ConsumedView({
  deviceInfo,
  onDone,
}: {
  deviceInfo: Record<string, any> | null
  onDone: () => void
}) {
  const { t } = useTranslation()
  const deviceLabel = (() => {
    if (!deviceInfo) return 'un appareil'
    const model = deviceInfo.model || deviceInfo.device_model
    const os = deviceInfo.os || deviceInfo.os_name
    if (model && os) return `${model} · ${os}`
    return model || os || 'un appareil'
  })()

  return (
    <div className="flex items-start gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4">
      <CheckCircle2 size={20} className="shrink-0 mt-0.5 text-emerald-600" />
      <div className="text-sm flex-1">
        <div className="font-medium text-foreground">{t('shared.appareil_connecte')}</div>
        <div className="text-muted-foreground mt-0.5">
          Votre app mobile est maintenant authentifiée depuis {deviceLabel}.
        </div>
      </div>
      <button onClick={onDone} className="gl-button-sm gl-button-default text-xs">
        OK
      </button>
    </div>
  )
}

function ExpiredView({ onRetry, onCancel }: { onRetry: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
      <XCircle size={20} className="shrink-0 mt-0.5 text-amber-600" />
      <div className="text-sm flex-1">
        <div className="font-medium text-foreground">{t('shared.code_expire')}</div>
        <div className="text-muted-foreground mt-0.5">
          Le QR code n'a pas été scanné à temps. Générez-en un nouveau.
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={onCancel} className="gl-button-sm gl-button-default text-xs">
          Fermer
        </button>
        <button onClick={onRetry} className="gl-button-sm gl-button-confirm text-xs">
          Nouveau code
        </button>
      </div>
    </div>
  )
}
