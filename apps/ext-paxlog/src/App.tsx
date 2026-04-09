import React from 'react'
import { isTrackingMode } from './lib/api'
import WizardPage from './pages/WizardPage'
import TrackingPage from './pages/TrackingPage'

export default function App() {
  if (isTrackingMode()) {
    return <TrackingPage />
  }
  return <WizardPage />
}
