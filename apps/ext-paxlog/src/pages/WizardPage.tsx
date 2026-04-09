import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Users, AlertCircle } from 'lucide-react'
import { t, getLang } from '../lib/i18n'
import { apiRequest, apiDownload, getTokenFromUrl, isSessionRequiredError, parseApiErrorDetail } from '../lib/api'
import { sessionStorageKey, formatDateTime } from '../lib/utils'
import Layout from '../components/Layout'
import WizardNav, { buildSteps } from '../components/WizardNav'
import Message, { type MessageData } from '../components/Message'
import Spinner from '../components/Spinner'
import SecurityStep from '../steps/SecurityStep'
import AdsInfoStep from '../steps/AdsInfoStep'
import TeamStep from '../steps/TeamStep'
import ComplianceStep from '../steps/ComplianceStep'
import FinalizeStep from '../steps/FinalizeStep'

export default function WizardPage() {
  const lang = getLang()
  const token = useRef(getTokenFromUrl()).current
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    token ? localStorage.getItem(sessionStorageKey(token)) : null
  )
  const [linkInfo, setLinkInfo] = useState<any>(null)
  const [dossier, setDossier] = useState<any>(null)
  const [credentialTypes, setCredentialTypes] = useState<any[]>([])
  const [jobPositions, setJobPositions] = useState<any[]>([])
  const [departureBases, setDepartureBases] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<MessageData | null>(null)
  const [activeStep, setActiveStep] = useState(0)
  const [bootstrapped, setBootstrapped] = useState(false)

  const stepRefs = useRef<(HTMLDivElement | null)[]>([])

  // API helper bound to current session
  const api = useCallback(
    (path: string, options?: RequestInit) => apiRequest(sessionToken, path, options),
    [sessionToken],
  )

  const download = useCallback(
    (path: string, options?: RequestInit) => apiDownload(sessionToken, path, options),
    [sessionToken],
  )

  // Load functions
  const loadLinkInfo = useCallback(async () => {
    if (!token) return null
    const info = await api(`/api/v1/pax/external/${token}`)
    setLinkInfo(info)
    return info
  }, [token, api])

  const loadDossier = useCallback(async () => {
    if (!token) return
    const d = await api(`/api/v1/pax/external/${token}/dossier`)
    setDossier(d)
  }, [token, api])

  const loadCredentialTypes = useCallback(async () => {
    if (!token || !sessionToken) return
    const ct = await api(`/api/v1/pax/external/${token}/credential-types`)
    setCredentialTypes(ct)
  }, [token, sessionToken, api])

  const loadJobPositions = useCallback(async () => {
    if (!token || !sessionToken) return
    const jp = await api(`/api/v1/pax/external/${token}/job-positions`)
    setJobPositions(jp)
  }, [token, sessionToken, api])

  const loadDepartureBases = useCallback(async () => {
    if (!token || !sessionToken) return
    const db = await api(`/api/v1/pax/external/${token}/departure-bases`)
    setDepartureBases(db)
  }, [token, sessionToken, api])

  function clearSession(showMessage = false) {
    setSessionToken(null)
    if (token) localStorage.removeItem(sessionStorageKey(token))
    setDossier(null)
    setCredentialTypes([])
    setJobPositions([])
    setDepartureBases([])
    if (showMessage) {
      setMessage({ text: t('session_expired_reauthenticate'), tone: 'warn' })
    }
  }

  async function hydrateProtected() {
    const results = await Promise.allSettled([loadDossier(), loadCredentialTypes(), loadJobPositions(), loadDepartureBases()])
    if (results.some((r) => r.status === 'rejected' && isSessionRequiredError((r as PromiseRejectedResult).reason))) {
      clearSession(true)
      await loadLinkInfo()
      return false
    }
    return true
  }

  // Bootstrap
  useEffect(() => {
    if (!token) {
      setBootstrapped(true)
      return
    }

    ;(async () => {
      try {
        const info = await apiRequest(sessionToken, `/api/v1/pax/external/${token}`)
        setLinkInfo(info)

        let currentSession = sessionToken
        if (currentSession && !info?.authenticated) {
          clearSession()
          currentSession = null
          const info2 = await apiRequest(null, `/api/v1/pax/external/${token}`)
          setLinkInfo(info2)
        }

        if (currentSession) {
          const results = await Promise.allSettled([
            apiRequest(currentSession, `/api/v1/pax/external/${token}/dossier`).then(setDossier),
            apiRequest(currentSession, `/api/v1/pax/external/${token}/credential-types`).then(setCredentialTypes),
            apiRequest(currentSession, `/api/v1/pax/external/${token}/job-positions`).then(setJobPositions),
            apiRequest(currentSession, `/api/v1/pax/external/${token}/departure-bases`).then(setDepartureBases),
          ])
          if (results.some((r) => r.status === 'rejected' && isSessionRequiredError((r as PromiseRejectedResult).reason))) {
            clearSession(true)
            const info3 = await apiRequest(null, `/api/v1/pax/external/${token}`)
            setLinkInfo(info3)
          }
        }
      } catch (err: any) {
        setMessage({ text: err.message || t('generic_error'), tone: 'error' })
      } finally {
        setBootstrapped(true)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Wrap action pattern
  async function wrapAction(fn: () => Promise<void>, onError?: (error: any) => void) {
    setMessage(null)
    setLoading(true)
    try {
      await fn()
      setMessage({ text: t('action_done'), tone: 'success' })
    } catch (error: any) {
      if (onError) onError(error)
      setMessage({ text: error.message || t('generic_error'), tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  // Action handlers
  const handleSendOtp = async () => {
    await wrapAction(async () => {
      const result = await api(`/api/v1/pax/external/${token}/otp/send`, { method: 'POST' })
      setMessage({ text: `${t('otp_destination')}: ${result.destination_masked}`, tone: 'success' })
    })
  }

  const handleVerifyOtp = async (code: string) => {
    await wrapAction(async () => {
      const result = await api(`/api/v1/pax/external/${token}/otp/verify`, {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      const newSession = result.session_token
      setSessionToken(newSession)
      localStorage.setItem(sessionStorageKey(token), newSession)

      // Reload with new session
      const info = await apiRequest(newSession, `/api/v1/pax/external/${token}`)
      setLinkInfo(info)
      const results = await Promise.allSettled([
        apiRequest(newSession, `/api/v1/pax/external/${token}/dossier`).then(setDossier),
        apiRequest(newSession, `/api/v1/pax/external/${token}/credential-types`).then(setCredentialTypes),
        apiRequest(newSession, `/api/v1/pax/external/${token}/job-positions`).then(setJobPositions),
        apiRequest(newSession, `/api/v1/pax/external/${token}/departure-bases`).then(setDepartureBases),
      ])
      if (results.some((r) => r.status === 'rejected' && isSessionRequiredError((r as PromiseRejectedResult).reason))) {
        clearSession(true)
        await apiRequest(null, `/api/v1/pax/external/${token}`).then(setLinkInfo)
      }
    })
  }

  const handleCreatePax = async (payload: Record<string, string | null>) => {
    await wrapAction(async () => {
      await api(`/api/v1/pax/external/${token}/pax`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      await loadDossier()
    }, (error) => {
      const detail = parseApiErrorDetail(error)
      if (detail?.code === 'EXTERNAL_PAX_DUPLICATE_MATCH' && Array.isArray(detail.matches)) {
        // Matches will be handled by TeamStep's own match detection
      }
    })
  }

  const handleAttachExisting = async (contactId: string) => {
    await wrapAction(async () => {
      await api(`/api/v1/pax/external/${token}/pax/${contactId}/attach-existing`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      await loadDossier()
    })
  }

  const handleUpdatePax = async (contactId: string, payload: Record<string, string | null>) => {
    await wrapAction(async () => {
      await api(`/api/v1/pax/external/${token}/pax/${contactId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      await loadDossier()
    })
  }

  const handleAddCredential = async (contactId: string, payload: Record<string, string | null>) => {
    await wrapAction(async () => {
      await api(`/api/v1/pax/external/${token}/pax/${contactId}/credentials`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      await loadDossier()
    })
  }

  const handleSubmit = async () => {
    if ((dossier?.pax_summary?.total ?? 0) <= 0) {
      setMessage({ text: t('no_submit_without_pax'), tone: 'warn' })
      return
    }
    await wrapAction(async () => {
      await api(`/api/v1/pax/external/${token}/submit`, { method: 'POST' })
      await loadLinkInfo()
      await loadDossier()
    }, (error) => {
      const detail = parseApiErrorDetail(error)
      if (detail?.blockers?.length) {
        setMessage({ text: [detail.message || t('submission_blocked'), ...detail.blockers].join(' '), tone: 'warn' })
      }
    })
  }

  const handleResubmit = async (reason: string) => {
    await wrapAction(async () => {
      await api(`/api/v1/pax/external/${token}/resubmit`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      await loadLinkInfo()
      await loadDossier()
    }, (error) => {
      const detail = parseApiErrorDetail(error)
      if (detail?.blockers?.length) {
        setMessage({ text: [detail.message || t('submission_blocked'), ...detail.blockers].join(' '), tone: 'warn' })
      }
    })
  }

  const handleUpdateTransport = async (payload: Record<string, string | null>) => {
    await wrapAction(async () => {
      await api(`/api/v1/pax/external/${token}/transport-preferences`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      await loadDossier()
    })
  }

  const handleDownloadTicket = async () => {
    await wrapAction(async () => {
      const blob = await download(`/api/v1/pax/external/${token}/pdf`)
      const url = window.URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => window.URL.revokeObjectURL(url), 10000)
    })
  }

  // No token
  if (!token) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <AlertCircle className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-4" />
          <p className="text-sm text-[var(--text-secondary)]">{t('public_token_missing')}</p>
        </div>
      </Layout>
    )
  }

  // Loading bootstrap
  if (!bootstrapped) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" label={t('loading')} />
        </div>
      </Layout>
    )
  }

  const authenticated = Boolean(linkInfo?.authenticated)
  const steps = buildSteps(authenticated, dossier)

  const scrollToStep = (index: number) => {
    setActiveStep(index)
    stepRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const openComplianceForPax = (contactId: string) => {
    setActiveStep(3) // compliance step
    setTimeout(() => {
      const el = document.getElementById(`pax-${contactId}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  return (
    <Layout>
      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-3.5rem)]">
        <WizardNav steps={steps} onStepClick={scrollToStep} />

        <div className="flex-1 min-w-0">
          {/* Hero section */}
          <div className="bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800 text-white">
            <div className="max-w-4xl mx-auto px-6 py-8 lg:py-10">
              <p className="text-[10px] uppercase tracking-widest text-brand-200 font-semibold mb-2">OpsFlux External AdS</p>
              <h1 className="text-2xl lg:text-3xl font-bold mb-2">{t('app_title')}</h1>
              <p className="text-sm text-brand-100 max-w-2xl mb-6">{t('app_intro')}</p>

              {/* Quick stats */}
              <div className="flex flex-wrap gap-6">
                <HeroStat label={t('pax_count')} value={String(dossier?.pax_summary?.total ?? 0)} />
                <HeroStat label={t('pending_check')} value={String(dossier?.pax_summary?.pending_check ?? 0)} />
                <HeroStat label={t('blocked')} value={String(dossier?.pax_summary?.blocked ?? 0)} />
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="max-w-4xl mx-auto px-6 py-6 space-y-8">
            {/* Message */}
            {message && (
              <Message message={message} onDismiss={() => setMessage(null)} autoHide />
            )}

            {/* Step 1: Security */}
            <StepSection
              ref={(el) => { stepRefs.current[0] = el }}
              number={1}
              title={t('wizard_access_title')}
              subtitle={t('wizard_access_text')}
            >
              <SecurityStep
                linkInfo={linkInfo}
                authenticated={authenticated}
                loading={loading}
                onSendOtp={handleSendOtp}
                onVerifyOtp={handleVerifyOtp}
              />
            </StepSection>

            {/* Step 2: AdS Info */}
            <StepSection
              ref={(el) => { stepRefs.current[1] = el }}
              number={2}
              title={t('wizard_ads_title')}
              subtitle={t('wizard_ads_text')}
            >
              <AdsInfoStep
                dossier={dossier}
                loading={loading}
                onDownloadTicket={handleDownloadTicket}
                onContinue={() => scrollToStep(2)}
              />
            </StepSection>

            {/* Step 3: Team */}
            <StepSection
              ref={(el) => { stepRefs.current[2] = el }}
              number={3}
              title={t('wizard_team_title')}
              subtitle={t('wizard_team_text')}
            >
              <TeamStep
                dossier={dossier}
                authenticated={authenticated}
                loading={loading}
                sessionToken={sessionToken}
                token={token}
                jobPositions={jobPositions}
                onCreatePax={handleCreatePax}
                onAttachExisting={handleAttachExisting}
                onContinue={() => scrollToStep(3)}
                onOpenCompliance={openComplianceForPax}
              />
            </StepSection>

            {/* Step 4: Compliance */}
            <StepSection
              ref={(el) => { stepRefs.current[3] = el }}
              number={4}
              title={t('wizard_compliance_title')}
              subtitle={t('wizard_compliance_text')}
            >
              <ComplianceStep
                dossier={dossier}
                authenticated={authenticated}
                loading={loading}
                credentialTypes={credentialTypes}
                jobPositions={jobPositions}
                onUpdatePax={handleUpdatePax}
                onAddCredential={handleAddCredential}
                onContinue={() => scrollToStep(4)}
              />
            </StepSection>

            {/* Step 5: Finalize */}
            <StepSection
              ref={(el) => { stepRefs.current[4] = el }}
              number={5}
              title={t('wizard_finalize_title')}
              subtitle={t('wizard_finalize_text')}
            >
              <FinalizeStep
                dossier={dossier}
                authenticated={authenticated}
                loading={loading}
                departureBases={departureBases}
                onSubmit={handleSubmit}
                onResubmit={handleResubmit}
                onUpdateTransport={handleUpdateTransport}
                onDownloadTicket={handleDownloadTicket}
              />
            </StepSection>
          </div>
        </div>
      </div>
    </Layout>
  )
}

// Step section wrapper
const StepSection = React.forwardRef<HTMLDivElement, {
  number: number
  title: string
  subtitle: string
  children: React.ReactNode
}>(({ number, title, subtitle, children }, ref) => (
  <section ref={ref} id={`step-${['access', 'ads', 'team', 'compliance', 'finalize'][number - 1]}`} className="scroll-mt-32">
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-soft">
      {/* Step header */}
      <div className="flex items-center gap-4 px-6 py-5 border-b border-[var(--border)] bg-[var(--surface-raised)]">
        <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center shrink-0 shadow-sm shadow-brand-500/20">
          <span className="text-sm font-bold text-white">{number}</span>
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{subtitle}</p>
        </div>
      </div>
      {/* Step body */}
      <div className="p-6">
        {children}
      </div>
    </div>
  </section>
))
StepSection.displayName = 'StepSection'

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-brand-200">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}
