import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'

import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/stores/authStore'
import { ThemeProvider } from '@/stores/themeStore'
import { ToastProvider } from '@/components/ui/Toast'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import { PWAUpdater } from '@/components/pwa/PWAUpdater'
import App from './App'
import './index.css'
import 'flag-icons/css/flag-icons.min.css'
import './lib/i18n'
// Initialize offline queue auto-sync listeners
import '@/lib/offlineQueue'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <TooltipProvider>
              <ToastProvider>
                <ConfirmProvider>
                  <PWAUpdater />
                  <App />
                </ConfirmProvider>
              </ToastProvider>
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
