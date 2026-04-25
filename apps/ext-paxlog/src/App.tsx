import React, { Suspense, lazy } from 'react'
import { EuiEmptyPrompt, EuiLoadingSpinner } from '@elastic/eui'
import { isPapyrusFormMode, isTrackingMode } from './lib/api'

const WizardPage = lazy(() => import('./pages/WizardPage'))
const TrackingPage = lazy(() => import('./pages/TrackingPage'))
const PapyrusExternalFormPage = lazy(() => import('./pages/PapyrusExternalFormPage'))

function AppLoadingFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <EuiEmptyPrompt
        icon={<EuiLoadingSpinner size="xl" />}
        title={<h2>Chargement du portail</h2>}
        body={<p>Préparation de l’espace externe…</p>}
      />
    </div>
  )
}

export default function App() {
  let page = <WizardPage />
  if (isTrackingMode()) {
    page = <TrackingPage />
  } else if (isPapyrusFormMode()) {
    page = <PapyrusExternalFormPage />
  }

  return <Suspense fallback={<AppLoadingFallback />}>{page}</Suspense>
}
