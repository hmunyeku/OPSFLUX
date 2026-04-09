import React, { useState, useEffect, useCallback, useRef } from 'react'
import { AlertCircle, ChevronLeft, ChevronRight, Check, Lock, FileText, Users, Shield, Send } from 'lucide-react'
import { t, getLang } from '../lib/i18n'
import { apiRequest, apiDownload, getTokenFromUrl, isSessionRequiredError, parseApiErrorDetail } from '../lib/api'
import { sessionStorageKey, formatDateTime } from '../lib/utils'
import Layout from '../components/Layout'
import { buildSteps } from '../components/WizardNav'
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

  const goToStep = (index: number) => {
    setActiveStep(index)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goNext = () => goToStep(Math.min(activeStep + 1, 4))
  const goPrev = () => goToStep(Math.max(activeStep - 1, 0))

  const openComplianceForPax = (contactId: string) => {
    goToStep(3)
    setTimeout(() => {
      const el = document.getElementById(`pax-${contactId}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 200)
  }

  const STEP_ICONS = [Shield, FileText, Users, Check, Send]
  const STEP_TITLES = [t('wizard_access_title'), t('wizard_ads_title'), t('wizard_team_title'), t('wizard_compliance_title'), t('wizard_finalize_title')]
  const STEP_DESCS = ['Ouvrir la session OTP', 'Lire l\'AdS', 'Equipe', 'Conformite', 'Finaliser']

  const stepContent = [
    <SecurityStep key="s1" linkInfo={linkInfo} authenticated={authenticated} loading={loading} onSendOtp={handleSendOtp} onVerifyOtp={handleVerifyOtp} />,
    <AdsInfoStep key="s2" dossier={dossier} loading={loading} onDownloadTicket={handleDownloadTicket} onContinue={goNext} />,
    <TeamStep key="s3" dossier={dossier} authenticated={authenticated} loading={loading} sessionToken={sessionToken} token={token} jobPositions={jobPositions} onCreatePax={handleCreatePax} onAttachExisting={handleAttachExisting} onContinue={goNext} onOpenCompliance={openComplianceForPax} />,
    <ComplianceStep key="s4" dossier={dossier} authenticated={authenticated} loading={loading} credentialTypes={credentialTypes} jobPositions={jobPositions} onUpdatePax={handleUpdatePax} onAddCredential={handleAddCredential} onContinue={goNext} />,
    <FinalizeStep key="s5" dossier={dossier} authenticated={authenticated} loading={loading} departureBases={departureBases} onSubmit={handleSubmit} onResubmit={handleResubmit} onUpdateTransport={handleUpdateTransport} onDownloadTicket={handleDownloadTicket} />,
  ]

  return (
    <Layout>
      <div className="flex min-h-[calc(100vh-3.5rem)]">

        {/* ── Left sidebar — step rail ── */}
        <aside className="hidden lg:flex flex-col w-[280px] shrink-0 bg-white border-r border-slate-200 sticky top-14 h-[calc(100vh-3.5rem)]">
          {/* Sidebar header */}
          <div className="px-6 pt-6 pb-4">
            <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-blue-600 mb-1">Parcours dossier</p>
            <p className="text-xs text-slate-400 leading-relaxed">Suivez les etapes pour completer l'AdS.</p>
          </div>

          {/* Step list */}
          <nav className="flex-1 px-4 pb-6">
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[19px] top-4 bottom-4 w-px bg-slate-200" />
              {/* Progress line */}
              <div
                className="absolute left-[19px] top-4 w-px bg-blue-500 transition-all duration-500"
                style={{ height: `${(activeStep / 4) * (100 - 16)}%` }}
              />

              <div className="relative space-y-1">
                {steps.map((step, i) => {
                  const Icon = STEP_ICONS[i]
                  const isActive = i === activeStep
                  const isDone = step.done && !isActive

                  return (
                    <button
                      key={i}
                      onClick={() => goToStep(i)}
                      className={`
                        w-full flex items-center gap-3 px-2 py-3 rounded-lg text-left transition-all duration-200
                        ${isActive
                          ? 'bg-blue-50'
                          : 'hover:bg-slate-50'
                        }
                      `}
                    >
                      {/* Circle indicator */}
                      <div className={`
                        w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold
                        transition-all duration-300 relative z-10
                        ${isActive
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30 scale-110'
                          : isDone
                            ? 'bg-emerald-500 text-white'
                            : 'bg-white border-2 border-slate-200 text-slate-400'
                        }
                      `}>
                        {isDone ? <Check className="w-3 h-3" /> : i + 1}
                      </div>

                      {/* Label */}
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${
                          isActive ? 'text-blue-700' : isDone ? 'text-slate-700' : 'text-slate-400'
                        }`}>
                          {STEP_TITLES[i]}
                        </p>
                        <p className={`text-[11px] truncate ${
                          isActive ? 'text-blue-500' : 'text-slate-400'
                        }`}>
                          {STEP_DESCS[i]}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </nav>

          {/* Sidebar footer — stats */}
          {dossier && (
            <div className="px-6 py-4 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">PAX total</span>
                <span className="font-semibold text-slate-700 mono">{dossier.pax_summary?.total ?? 0}</span>
              </div>
              {(dossier.pax_summary?.blocked ?? 0) > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-red-500">Bloques</span>
                  <span className="ext-badge-danger">{dossier.pax_summary.blocked}</span>
                </div>
              )}
              {(dossier.pax_summary?.pending_check ?? 0) > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-amber-600">A verifier</span>
                  <span className="ext-badge-warning">{dossier.pax_summary.pending_check}</span>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ── Mobile step bar (horizontal) ── */}
        <div className="lg:hidden sticky top-14 z-30 bg-white border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-1 overflow-x-auto">
            {steps.map((step, i) => (
              <button key={i} onClick={() => goToStep(i)} className="flex items-center gap-1.5 shrink-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  i === activeStep ? 'bg-blue-600 text-white' : step.done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
                }`}>
                  {step.done && i !== activeStep ? <Check className="w-3 h-3" /> : i + 1}
                </div>
                {i < 4 && <div className={`w-4 h-px ${i < activeStep ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
              </button>
            ))}
            <span className="ml-2 text-xs text-slate-500 truncate">{STEP_TITLES[activeStep]}</span>
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-8">
            {/* Message */}
            {message && (
              <div className="mb-6 animate-fade-in-up">
                <Message message={message} onDismiss={() => setMessage(null)} autoHide />
              </div>
            )}

            {/* Step header */}
            <div className="mb-6" key={`h-${activeStep}`}>
              <p className="text-[10px] mono uppercase tracking-[0.15em] text-slate-400 mb-1">
                Etape {activeStep + 1}/5
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{STEP_TITLES[activeStep]}</h1>
            </div>

            {/* Step content — one at a time */}
            <div key={`s-${activeStep}`} className="animate-fade-in-up">
              {stepContent[activeStep]}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-slate-200">
              <button onClick={goPrev} disabled={activeStep === 0}
                className="ext-btn-secondary disabled:opacity-20 disabled:cursor-not-allowed">
                <ChevronLeft className="w-4 h-4" /> Precedent
              </button>
              {activeStep < 4 ? (
                <button onClick={goNext} className="ext-btn-primary">
                  Continuer <ChevronRight className="w-4 h-4" />
                </button>
              ) : <div />}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
