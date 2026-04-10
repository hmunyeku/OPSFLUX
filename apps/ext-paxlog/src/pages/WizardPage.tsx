import React, { useState, useEffect, useCallback, useRef } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, Check, FileText, Users, Shield, Send } from 'lucide-react'
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
  const STEP_DESCS = ['Authentification', 'Détails du dossier', 'Passagers', 'Conformité', 'Finalisation']
  const STEP_LONG = [
    'Vérifiez votre identité par code à usage unique pour ouvrir une session sécurisée et accéder au dossier.',
    'Examinez les informations du séjour : période, destination, objet de la mission et entreprise organisatrice.',
    'Composez la liste des passagers concernés. Chaque entrée déclenche une vérification de doublons et de conformité.',
    'Pour chaque passager, complétez les informations requises et joignez les justificatifs (qualifications, médicaux).',
    'Vérifiez la synthèse et soumettez le dossier pour validation. Un accusé sera envoyé à votre adresse de contact.',
  ]

  const stepContent = [
    <SecurityStep key="s1" linkInfo={linkInfo} authenticated={authenticated} loading={loading} onSendOtp={handleSendOtp} onVerifyOtp={handleVerifyOtp} />,
    <AdsInfoStep key="s2" dossier={dossier} loading={loading} onDownloadTicket={handleDownloadTicket} onContinue={goNext} />,
    <TeamStep key="s3" dossier={dossier} authenticated={authenticated} loading={loading} sessionToken={sessionToken} token={token} jobPositions={jobPositions} onCreatePax={handleCreatePax} onAttachExisting={handleAttachExisting} onContinue={goNext} onOpenCompliance={openComplianceForPax} />,
    <ComplianceStep key="s4" dossier={dossier} authenticated={authenticated} loading={loading} credentialTypes={credentialTypes} jobPositions={jobPositions} onUpdatePax={handleUpdatePax} onAddCredential={handleAddCredential} onContinue={goNext} />,
    <FinalizeStep key="s5" dossier={dossier} authenticated={authenticated} loading={loading} departureBases={departureBases} onSubmit={handleSubmit} onResubmit={handleResubmit} onUpdateTransport={handleUpdateTransport} onDownloadTicket={handleDownloadTicket} />,
  ]

  const progressPct = ((activeStep + 1) / 5) * 100
  const adsRef = dossier?.ads?.reference || dossier?.ads?.ref || linkInfo?.ads_reference

  return (
    <Layout>
      {/* ── Hairline progress strip directly under top bar ── */}
      <div className="sticky top-14 z-40">
        <div className="h-px bg-stone-200/80">
          <div
            className="h-full bg-stone-900 transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="grain relative isolate">
        <div className="gradient-radial absolute inset-0 pointer-events-none" />

        <div className="relative max-w-[1480px] mx-auto px-6 lg:px-12 xl:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-12 lg:gap-20 xl:gap-28 min-h-[calc(100vh-3.5rem-1px)]">

            {/* ──────────── Left rail — context column ──────────── */}
            <aside className="hidden lg:flex flex-col sticky top-[calc(3.5rem+1px)] h-[calc(100vh-3.5rem-1px)] py-16">

              {/* Eyebrow + AdS reference */}
              <div className="mb-14">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone-400 mb-4">
                  Avis de séjour
                </p>
                {adsRef ? (
                  <p className="mono text-[13px] text-stone-700 tabular">{adsRef}</p>
                ) : (
                  <p className="serif-italic text-base text-stone-300">— en cours —</p>
                )}
                {dossier?.ads?.title && (
                  <p className="serif text-2xl text-stone-900 leading-[1.05] mt-3 tracking-[-0.01em]">
                    {dossier.ads.title}
                  </p>
                )}
              </div>

              {/* Step rail */}
              <nav className="flex-1">
                <ul className="space-y-0">
                  {steps.map((step, i) => {
                    const isActive = i === activeStep
                    const isDone = step.done && !isActive
                    const isUpcoming = !isActive && !isDone
                    const isLast = i === steps.length - 1

                    return (
                      <li key={i}>
                        <button
                          onClick={() => goToStep(i)}
                          className={`group relative w-full text-left transition-all duration-300 ${
                            isUpcoming ? 'opacity-55 hover:opacity-90' : ''
                          }`}
                        >
                          <div className="flex items-start gap-5 py-3.5">
                            {/* Numeral + connector */}
                            <div className="relative flex flex-col items-center pt-[3px]">
                              <span
                                className={`mono tabular text-[11px] font-medium leading-none transition-colors duration-300 ${
                                  isActive
                                    ? 'text-blue-600'
                                    : isDone
                                      ? 'text-stone-900'
                                      : 'text-stone-400'
                                }`}
                              >
                                {String(i + 1).padStart(2, '0')}
                              </span>
                              {!isLast && (
                                <span
                                  className={`mt-3 w-px h-7 transition-colors duration-500 ${
                                    isDone || isActive ? 'bg-stone-900' : 'bg-stone-200'
                                  }`}
                                />
                              )}
                            </div>

                            {/* Label */}
                            <div className="flex-1 -mt-1 min-w-0">
                              <p
                                className={`text-[13px] font-medium leading-tight tracking-[-0.005em] transition-colors duration-300 ${
                                  isActive
                                    ? 'text-stone-900'
                                    : isDone
                                      ? 'text-stone-700'
                                      : 'text-stone-500'
                                }`}
                              >
                                {STEP_TITLES[i]}
                              </p>
                              <p
                                className={`text-[11px] mt-1 transition-colors duration-300 ${
                                  isActive ? 'text-stone-500' : 'text-stone-400'
                                }`}
                              >
                                {STEP_DESCS[i]}
                              </p>
                            </div>

                            {/* Active accent */}
                            {isActive && (
                              <span className="absolute -left-3 top-3.5 h-5 w-px bg-blue-600 animate-fade-in" />
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </nav>

              {/* Footer — synthesis */}
              {dossier && (dossier.pax_summary?.total ?? 0) > 0 && (
                <div className="mt-auto pt-8">
                  <hr className="divider-fade mb-6" />
                  <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-stone-400 mb-4">
                    Synthèse
                  </p>
                  <dl className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <dt className="text-[12px] text-stone-500">Total passagers</dt>
                      <dd className="serif text-2xl text-stone-900 tabular leading-none">
                        {String(dossier.pax_summary?.total ?? 0).padStart(2, '0')}
                      </dd>
                    </div>
                    {(dossier.pax_summary?.blocked ?? 0) > 0 && (
                      <div className="flex items-baseline justify-between">
                        <dt className="text-[12px] text-red-600">Bloqués</dt>
                        <dd className="mono text-[13px] font-medium text-red-600 tabular">
                          {String(dossier.pax_summary.blocked).padStart(2, '0')}
                        </dd>
                      </div>
                    )}
                    {(dossier.pax_summary?.pending_check ?? 0) > 0 && (
                      <div className="flex items-baseline justify-between">
                        <dt className="text-[12px] text-amber-700">À vérifier</dt>
                        <dd className="mono text-[13px] font-medium text-amber-700 tabular">
                          {String(dossier.pax_summary.pending_check).padStart(2, '0')}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </aside>

            {/* ──────────── Right column — focused canvas ──────────── */}
            <main className="relative pt-10 lg:pt-20 pb-32 min-w-0">

              {/* ── Mobile compact rail (only < lg) ── */}
              <div className="lg:hidden mb-10">
                <div className="flex items-center gap-1.5 mb-3">
                  {steps.map((step, i) => (
                    <button
                      key={i}
                      onClick={() => goToStep(i)}
                      className={`h-[3px] flex-1 rounded-full transition-all duration-500 ${
                        i === activeStep
                          ? 'bg-stone-900'
                          : step.done
                            ? 'bg-stone-900/70'
                            : 'bg-stone-200'
                      }`}
                      aria-label={STEP_TITLES[i]}
                    />
                  ))}
                </div>
                <p className="mono text-[11px] text-stone-500 tabular">
                  {String(activeStep + 1).padStart(2, '0')} / 05
                  <span className="text-stone-300 mx-2">·</span>
                  <span className="text-stone-700">{STEP_DESCS[activeStep]}</span>
                </p>
              </div>

              {/* ── Decorative ghost numeral background ── */}
              <div
                key={`ghost-${activeStep}`}
                className="absolute top-8 right-[-2rem] xl:right-[-6rem] -z-10 hidden xl:block animate-ghost"
                aria-hidden="true"
              >
                <span className="ghost-numeral block text-[420px] xl:text-[520px]">
                  {activeStep + 1}
                </span>
              </div>

              {/* ── Step header ── */}
              <header key={`h-${activeStep}`} className="mb-12 lg:mb-16 max-w-2xl">
                <p className="mono text-[11px] font-medium uppercase tracking-[0.15em] text-blue-600 mb-5 animate-fade-in tabular">
                  Étape {String(activeStep + 1).padStart(2, '0')}
                  <span className="text-stone-300 mx-1.5">/</span>
                  <span className="text-stone-400">05</span>
                </p>
                <h1
                  className="serif text-[44px] sm:text-[56px] lg:text-[68px] xl:text-[76px] text-stone-900 leading-[0.95] tracking-[-0.025em] animate-slide-up"
                  style={{ animationDelay: '60ms' }}
                >
                  {STEP_TITLES[activeStep]}
                </h1>
                <p
                  className="mt-7 text-[15px] text-stone-500 leading-[1.65] max-w-xl animate-slide-up"
                  style={{ animationDelay: '160ms' }}
                >
                  {STEP_LONG[activeStep]}
                </p>
              </header>

              {/* ── Inline message ── */}
              {message && (
                <div className="mb-8 max-w-2xl animate-slide-up">
                  <Message message={message} onDismiss={() => setMessage(null)} autoHide />
                </div>
              )}

              {/* ── Step content ── */}
              <section
                key={`s-${activeStep}`}
                className="relative max-w-2xl animate-slide-right"
                style={{ animationDelay: '220ms' }}
              >
                {stepContent[activeStep]}
              </section>
            </main>
          </div>
        </div>

        {/* ──────────── Sticky bottom action bar ──────────── */}
        <div className="sticky bottom-0 left-0 right-0 z-40">
          {/* Soft fade above the bar to avoid harsh cut */}
          <div className="h-6 bg-gradient-to-t from-stone-50 via-stone-50/60 to-transparent pointer-events-none" />

          <div className="bg-white/85 backdrop-blur-xl border-t border-stone-200">
            <div className="max-w-[1480px] mx-auto px-6 lg:px-12 xl:px-16 h-16 flex items-center justify-between gap-4">

              {/* Prev */}
              <button
                onClick={goPrev}
                disabled={activeStep === 0}
                className="ext-btn-ghost group"
              >
                <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
                <span className="hidden sm:inline">Précédent</span>
              </button>

              {/* Center dots */}
              <div className="hidden sm:flex items-center gap-2">
                {steps.map((step, i) => {
                  const isActive = i === activeStep
                  const isDone = step.done && !isActive
                  return (
                    <button
                      key={i}
                      onClick={() => goToStep(i)}
                      aria-label={STEP_TITLES[i]}
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        isActive
                          ? 'w-8 bg-stone-900'
                          : isDone
                            ? 'w-1.5 bg-stone-900/70'
                            : 'w-1.5 bg-stone-300 hover:bg-stone-400'
                      }`}
                    />
                  )
                })}
              </div>

              {/* Counter + Next */}
              <div className="flex items-center gap-4">
                <span className="hidden md:inline mono text-[11px] text-stone-400 tabular">
                  {String(activeStep + 1).padStart(2, '0')} / 05
                </span>
                {activeStep < 4 ? (
                  <button onClick={goNext} className="ext-btn-primary group">
                    <span>Continuer</span>
                    <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </button>
                ) : (
                  <span className="mono text-[11px] text-stone-400 uppercase tracking-[0.1em]">
                    Étape finale
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
