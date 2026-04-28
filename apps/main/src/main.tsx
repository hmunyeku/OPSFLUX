import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'

import { queryClient } from '@/lib/queryClient'
import { wireQueryClientBroadcast } from '@/lib/popupBroadcast'
import { AuthProvider } from '@/stores/authStore'
import { ThemeProvider } from '@/stores/themeStore'
import { ToastProvider } from '@/components/ui/Toast'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { ConfirmProvider, PromptProvider } from '@/components/ui/ConfirmDialog'
import { PWAUpdater } from '@/components/pwa/PWAUpdater'
import App from './App'
import './index.css'
import 'flag-icons/css/flag-icons.min.css'
import 'tippy.js/dist/tippy.css'
import './lib/i18n'
// Initialize offline queue auto-sync listeners
import '@/lib/offlineQueue'

// Auto-reload when a stale chunk 404s after a redeployment
window.addEventListener('vite:preloadError', () => {
  window.location.reload()
})

// Cross-window React Query cache sync — every BrowserRouter root
// (main app + detached popup windows) wires its QueryClient to the
// shared BroadcastChannel so a mutation in one window invalidates
// the other's cache automatically. Auth + localStorage are already
// shared via same-origin cookies, only the in-memory React Query
// cache needs explicit broadcasting.
wireQueryClientBroadcast(queryClient)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
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
  </React.StrictMode>,
)
