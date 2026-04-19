/**
 * ApiHealthGate — guards the app behind a backend availability check.
 *
 * Polls /api/health on mount and every 5s while the API is down. Renders
 * a clean maintenance/loading screen instead of letting the app try to
 * paint with empty / "User" placeholder data when the backend is
 * restarting (e.g. just after a Dokploy redeploy).
 *
 * Once the API responds 200, the gate fades out and renders the app.
 * If the API goes down later, the gate does NOT re-mount — that would
 * unmount the whole app on a transient hiccup. We rely on per-request
 * error boundaries to handle in-flight failures.
 */
import { useEffect, useState } from 'react'
import { Loader2, Wrench } from 'lucide-react'

interface Props {
  children: React.ReactNode
  /** API health URL. Defaults to ${VITE_API_URL}/api/health. */
  url?: string
  /** Initial check timeout (ms) before showing the maintenance UI. */
  initialDelayMs?: number
}

export function ApiHealthGate({ children, url, initialDelayMs = 800 }: Props) {
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || ''
  const healthUrl = url || `${apiBase}/api/health`

  const [ready, setReady] = useState(false)
  const [showUi, setShowUi] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let uiTimer: ReturnType<typeof setTimeout> | null = null

    // Don't flash the maintenance UI for very fast checks (<800ms).
    uiTimer = setTimeout(() => { if (!cancelled && !ready) setShowUi(true) }, initialDelayMs)

    const ping = async () => {
      if (cancelled) return
      try {
        const res = await fetch(healthUrl, { method: 'GET', cache: 'no-store' })
        if (res.ok) {
          if (!cancelled) {
            setReady(true)
            setShowUi(false)
            setLastError(null)
          }
          return
        }
        throw new Error(`HTTP ${res.status}`)
      } catch (err) {
        if (cancelled) return
        setAttempts((n) => n + 1)
        setLastError(err instanceof Error ? err.message : String(err))
        // Retry every 5s while down.
        timer = setTimeout(ping, 5000)
      }
    }

    ping()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      if (uiTimer) clearTimeout(uiTimer)
    }
  }, [healthUrl, initialDelayMs, ready])

  if (ready) return <>{children}</>

  if (!showUi) {
    // Quiet phase — don't flash the UI for a fast healthy check.
    return <div className="fixed inset-0 bg-background" aria-hidden />
  }

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-8 text-center">
      <div className="flex items-center gap-3 mb-4">
        <Wrench size={28} strokeWidth={1.5} className="text-primary" />
        <Loader2 size={22} strokeWidth={1.5} className="animate-spin text-muted-foreground" />
      </div>
      <h1 className="text-lg font-semibold text-foreground mb-1">
        Service en cours de redémarrage
      </h1>
      <p className="text-sm text-muted-foreground max-w-md">
        L'application revient dans un instant — un déploiement vient d'être
        appliqué et le serveur termine son initialisation.
      </p>
      {attempts > 1 && (
        <p className="mt-3 text-xs text-muted-foreground/70">
          Tentative #{attempts}{lastError ? ` · ${lastError}` : ''}
        </p>
      )}
      <p className="mt-6 text-[11px] text-muted-foreground/60">
        Si cet écran reste affiché plus d'une minute, contactez le support.
      </p>
    </div>
  )
}
