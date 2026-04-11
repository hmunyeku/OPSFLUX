import React from 'react'
import { isPapyrusFormMode, isTrackingMode } from './lib/api'
import WizardPage from './pages/WizardPage'
import TrackingPage from './pages/TrackingPage'
import PapyrusExternalFormPage from './pages/PapyrusExternalFormPage'

export default function App() {
  if (isTrackingMode()) {
    return <TrackingPage />
  }
  if (isPapyrusFormMode()) {
    return <PapyrusExternalFormPage />
  }
  return <WizardPage />
}
