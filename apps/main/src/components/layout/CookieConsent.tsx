/**
 * CookieConsent — Slim bottom banner for cookie consent (GDPR).
 *
 * - Shows only when no consent has been recorded in localStorage.
 * - Stores decision in localStorage key `opsflux:cookie-consent`.
 * - Sends consent to backend: POST /api/v1/gdpr/consent.
 * - Dark-theme compatible, mobile responsive, z-60.
 */
import { useState, useEffect, useCallback } from 'react'
import { Cookie, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

const STORAGE_KEY = 'opsflux:cookie-consent'

type ConsentValue = 'accepted' | 'refused'

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) setVisible(true)
  }, [])

  const handleConsent = useCallback(async (granted: boolean) => {
    const value: ConsentValue = granted ? 'accepted' : 'refused'
    localStorage.setItem(STORAGE_KEY, value)
    setVisible(false)

    try {
      await api.post('/api/v1/gdpr/consent', {
        consent_type: 'cookies',
        granted,
      })
    } catch {
      // Consent is stored locally even if the API call fails.
      // The server can reconcile on next authenticated request.
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className={cn(
        'fixed bottom-0 inset-x-0 z-[60]',
        'border-t border-border bg-card text-foreground',
        'px-4 py-3 shadow-lg',
      )}
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 sm:flex-row sm:gap-4">
        <Cookie className="hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" />

        <p className="text-sm leading-snug text-center sm:text-left flex-1">
          OpsFlux utilise des cookies essentiels au fonctionnement.{' '}
          <Link
            to="/privacy"
            className="underline underline-offset-2 text-primary hover:text-primary/80"
          >
            En savoir plus
          </Link>
        </p>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleConsent(false)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-border',
              'px-3 py-1.5 text-sm font-medium',
              'text-muted-foreground hover:bg-muted transition-colors',
            )}
          >
            <X className="h-3.5 w-3.5" />
            Refuser
          </button>

          <button
            type="button"
            onClick={() => handleConsent(true)}
            className={cn(
              'inline-flex items-center rounded-md',
              'bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground',
              'hover:bg-primary/90 transition-colors',
            )}
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  )
}
