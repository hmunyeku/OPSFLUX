import * as Sentry from '@sentry/react'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT as string | undefined
const VERSION = import.meta.env.VITE_VERSION as string | undefined

export function initSentry() {
  if (!SENTRY_DSN) return

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT || 'development',
    release: VERSION ? `opsflux-frontend@${VERSION}` : undefined,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    // Performance: sample 10% in production, 100% in dev
    tracesSampleRate: ENVIRONMENT === 'production' ? 0.1 : 1.0,
    // Session replay: 10% of sessions, 100% on error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    // Don't send PII
    sendDefaultPii: false,
    // Ignore common non-actionable errors
    ignoreErrors: [
      'ResizeObserver loop',
      'Non-Error promise rejection captured',
      'AbortError',
      'Network Error',
      'Load failed',
    ],
  })
}
