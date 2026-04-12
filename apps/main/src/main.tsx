import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'

import { initSentry } from '@/lib/sentry'
import { queryClient } from '@/lib/queryClient'

// Initialize Sentry before rendering (must be first)
initSentry()
import { AuthProvider } from '@/stores/authStore'
import { ThemeProvider } from '@/stores/themeStore'
import { ToastProvider } from '@/components/ui/Toast'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { ConfirmProvider, PromptProvider } from '@/components/ui/ConfirmDialog'
import { PWAUpdater } from '@/components/pwa/PWAUpdater'
import App from './App'
import './index.css'
import 'flag-icons/css/flag-icons.min.css'
import './lib/i18n'
// Initialize offline queue auto-sync listeners
import '@/lib/offlineQueue'

function SentryFallback() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h1>Something went wrong</h1>
      <p>An unexpected error occurred. The error has been reported.</p>
      <button onClick={() => window.location.reload()} style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
        Reload
      </button>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<SentryFallback />}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ThemeProvider>
            <AuthProvider>
              <TooltipProvider>
                <ToastProvider>
                  <ConfirmProvider>
                    <PromptProvider>
                      <PWAUpdater />
                      <App />
                    </PromptProvider>
                  </ConfirmProvider>
                </ToastProvider>
              </TooltipProvider>
            </AuthProvider>
          </ThemeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)
