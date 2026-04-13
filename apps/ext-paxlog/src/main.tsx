import React from 'react'
import ReactDOM from 'react-dom/client'
import { EuiProvider } from '@elastic/eui'
import App from './App'
import './index.css'

// Auto-reload when a stale chunk 404s after a redeployment
window.addEventListener('vite:preloadError', () => {
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EuiProvider colorMode="light">
      <App />
    </EuiProvider>
  </React.StrictMode>,
)
