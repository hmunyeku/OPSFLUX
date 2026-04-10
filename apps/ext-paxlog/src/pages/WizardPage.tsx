import React, { useState, useEffect, useCallback, useRef } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, Check, FileText, Users, Shield, Send } from 'lucide-react'
import { t } from '../lib/i18n'
import { apiRequest, apiDownload, getTokenFromUrl, isSessionRequiredError, parseApiErrorDetail } from '../lib/api'
import { sessionStorageKey } from '../lib/utils'
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

  const api = useCallback(
    (path: string, options?: RequestInit) => apiRequest(sessionToken, path, options),
    [sessionToken],
  )

  const download = useCallback(
    (path: string, options?: RequestInit) => apiDownload(sessionToken, path, options),
    [sessionToken],
  )

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
        return
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

  const STEP_TITLES = [t('wizard_access_title'), t('wizard_ads_title'), t('wizard_team_title'), t('wizard_compliance_title'), t('wizard_finalize_title')]
  const STEP_DESCS = ['Authentification', 'Informations dossier', 'Collaborateurs', 'Conformité', 'Soumission']
  const STEP_LONG = [
    'Authentifiez-vous par code à usage unique pour ouvrir une session sécurisée et accéder au dossier.',
    'Vérifiez les informations publiques de l’avis de séjour avant d’engager le traitement opérationnel.',
    'Déclarez ou rattachez les collaborateurs concernés. Les correspondances existantes sont proposées automatiquement.',
    'Complétez le dossier de conformité de chaque passager avec les justificatifs et informations exigés.',
    'Contrôlez le récapitulatif final, ajustez les préférences de transport puis soumettez le dossier.',
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
      <div className="sticky top-16 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-blue-700">Dossier externe AdS</p>
              <p className="mono text-[12px] text-slate-500 truncate">{adsRef || 'Référence en attente'}</p>
            </div>
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              <span className="mono text-[11px] text-slate-400">{String(activeStep + 1).padStart(2, '0')}</span>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-blue-600 transition-[width] duration-500" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="text-[11px] font-medium text-slate-600">{STEP_DESCS[activeStep]}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 py-6 lg:py-8">
        <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
          <aside className="xl:sticky xl:top-[9rem] self-start space-y-4">
            <div className="ext-shell-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Avis de séjour</p>
                  <p className="mono mt-2 text-[13px] text-slate-700">{adsRef || 'Non communiqué'}</p>
                  {dossier?.ads?.title && (
                    <p className="mt-3 text-lg font-semibold tracking-[-0.02em] text-slate-950">{dossier.ads.title}</p>
                  )}
                </div>
                <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-blue-700">
                  sécurisé
                </span>
              </div>
            </div>

            <nav className="ext-shell-card p-3">
              <div className="space-y-1">
                {steps.map((step, i) => {
                  const isActive = i === activeStep
                  return (
                    <button
                      key={step.id}
                      onClick={() => goToStep(i)}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${
                        isActive
                          ? 'border-blue-200 bg-blue-50 shadow-sm'
                          : step.done
                            ? 'border-emerald-200 bg-emerald-50/70 hover:bg-emerald-50'
                            : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold ${
                          isActive
                            ? 'bg-blue-600 text-white'
                            : step.done
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 text-slate-500'
                        }`}>
                          {step.done && !isActive ? <Check className="h-4 w-4" /> : i + 1}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold ${isActive ? 'text-blue-900' : 'text-slate-900'}`}>{STEP_TITLES[i]}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{STEP_DESCS[i]}</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </nav>
          </aside>

          <main className="min-w-0">
            <div className="ext-shell-card p-5 sm:p-7 lg:p-8">
              <div className="lg:hidden mb-6">
                <div className="mb-3 flex gap-2">
                  {steps.map((step, i) => (
                    <button
                      key={step.id}
                      onClick={() => goToStep(i)}
                      className={`h-2 flex-1 rounded-full transition-all ${
                        i === activeStep ? 'bg-blue-600' : step.done ? 'bg-emerald-500' : 'bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <header className="mb-8 border-b border-slate-100 pb-6">
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
                    Étape {String(activeStep + 1).padStart(2, '0')} / 05
                  </span>
                  <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-700">
                    {STEP_DESCS[activeStep]}
                  </span>
                </div>
                <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-semibold tracking-[-0.03em] text-slate-950">
                  {STEP_TITLES[activeStep]}
                </h1>
                <p className="mt-4 max-w-3xl text-sm sm:text-[15px] leading-7 text-slate-600">
                  {STEP_LONG[activeStep]}
                </p>
              </header>

              {message && (
                <div className="mb-6">
                  <Message message={message} onDismiss={() => setMessage(null)} autoHide />
                </div>
              )}

              <section key={`s-${activeStep}`} className="animate-slide-up">
                {stepContent[activeStep]}
              </section>
            </div>
          </main>

          <aside className="xl:sticky xl:top-[9rem] self-start space-y-4">
            <div className="ext-shell-card p-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Progression</p>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                    <span>Avancement du dossier</span>
                    <span>{Math.round(progressPct)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-blue-600 transition-[width] duration-500" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <dt className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Passagers</dt>
                    <dd className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{dossier?.pax_summary?.total ?? 0}</dd>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <dt className="text-[10px] uppercase tracking-[0.08em] text-amber-700">À vérifier</dt>
                    <dd className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-amber-900">{dossier?.pax_summary?.pending_check ?? 0}</dd>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <dt className="text-[10px] uppercase tracking-[0.08em] text-emerald-700">Approuvés</dt>
                    <dd className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-emerald-900">{dossier?.pax_summary?.approved ?? 0}</dd>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                    <dt className="text-[10px] uppercase tracking-[0.08em] text-red-700">Bloqués</dt>
                    <dd className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-red-900">{dossier?.pax_summary?.blocked ?? 0}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="ext-shell-card p-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Parcours guidé</p>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-3">
                  <Shield className="mt-0.5 h-4 w-4 text-blue-600" />
                  <p>Accès vérifié par OTP avant toute action sensible.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 h-4 w-4 text-slate-500" />
                  <p>Les collaborateurs sont reconnus ou créés avant le contrôle conformité.</p>
                </div>
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-4 w-4 text-slate-500" />
                  <p>Chaque étape apporte les informations utiles sans surcharger l’utilisateur.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Send className="mt-0.5 h-4 w-4 text-slate-500" />
                  <p>La soumission finale reste bloquée tant que les points critiques ne sont pas levés.</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/92 backdrop-blur-xl">
        <div className="max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 h-16 flex items-center justify-between gap-4">
          <button onClick={goPrev} disabled={activeStep === 0} className="ext-btn-ghost group">
            <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
            <span className="hidden sm:inline">Précédent</span>
          </button>

          <div className="hidden md:flex items-center gap-2">
            {steps.map((step, i) => (
              <button
                key={step.id}
                onClick={() => goToStep(i)}
                aria-label={STEP_TITLES[i]}
                className={`h-2 rounded-full transition-all ${
                  i === activeStep ? 'w-10 bg-blue-600' : step.done ? 'w-2 bg-emerald-500' : 'w-2 bg-slate-300'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden md:inline mono text-[11px] text-slate-400 tabular">
              {String(activeStep + 1).padStart(2, '0')} / 05
            </span>
            {activeStep < 4 ? (
              <button onClick={goNext} className="ext-btn-primary group">
                <span>Continuer</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            ) : (
              <span className="mono text-[11px] text-slate-400 uppercase tracking-[0.1em]">Étape finale</span>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
