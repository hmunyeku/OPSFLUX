import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  EuiBadge,
  EuiButton,
  EuiCallOut,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui'
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
        let info: any
        try {
          info = await apiRequest(sessionToken, `/api/v1/pax/external/${token}`)
        } catch (error) {
          if (sessionToken && isSessionRequiredError(error)) {
            clearSession()
            info = await apiRequest(null, `/api/v1/pax/external/${token}`)
          } else {
            throw error
          }
        }
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
      if (detail?.code === 'EXTERNAL_PAX_DUPLICATE_MATCH' && Array.isArray(detail.matches)) return
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
        <EuiCallOut title={t('public_token_missing')} color="danger" iconType="alert" />
      </Layout>
    )
  }

  if (!bootstrapped) {
    return (
      <Layout>
        <Spinner label={t('loading')} paddingBlock={80} size="xl" />
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
      <div style={{ padding: '0 16px' }}>
        <EuiFlexGroup direction="column" gutterSize="l">
          <EuiFlexItem grow={false}>
            <EuiPanel hasBorder hasShadow paddingSize="m">
              <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                <EuiFlexItem>
                  <EuiText size="s" color="subdued"><p>Dossier externe AdS</p></EuiText>
                  <EuiTitle size="s"><h2>{adsRef || 'Référence en attente'}</h2></EuiTitle>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiBadge color="primary">{STEP_DESCS[activeStep]}</EuiBadge>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="m" />
              <EuiProgress value={progressPct} max={100} size="m" />
            </EuiPanel>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiFlexGrid columns={3}>
              <EuiFlexItem>
                <EuiPanel hasBorder paddingSize="m">
                  <EuiText size="s" color="subdued"><p>Avis de séjour</p></EuiText>
                  <EuiSpacer size="xs" />
                  <EuiText size="s"><p><strong>{adsRef || 'Non communiqué'}</strong></p></EuiText>
                  {dossier?.ads?.title ? (
                    <>
                      <EuiSpacer size="s" />
                      <EuiText size="s"><p>{dossier.ads.title}</p></EuiText>
                    </>
                  ) : null}
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel hasBorder paddingSize="m">
                  <EuiTitle size="xxs"><h4>{STEP_TITLES[activeStep]}</h4></EuiTitle>
                  <EuiSpacer size="s" />
                  <EuiText size="s" color="subdued"><p>{STEP_LONG[activeStep]}</p></EuiText>
                </EuiPanel>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiPanel hasBorder paddingSize="m">
                  <EuiFlexGrid columns={2}>
                    <EuiFlexItem><Metric label="Passagers" value={dossier?.pax_summary?.total ?? 0} /></EuiFlexItem>
                    <EuiFlexItem><Metric label="À vérifier" value={dossier?.pax_summary?.pending_check ?? 0} /></EuiFlexItem>
                    <EuiFlexItem><Metric label="Approuvés" value={dossier?.pax_summary?.approved ?? 0} /></EuiFlexItem>
                    <EuiFlexItem><Metric label="Bloqués" value={dossier?.pax_summary?.blocked ?? 0} /></EuiFlexItem>
                  </EuiFlexGrid>
                </EuiPanel>
              </EuiFlexItem>
            </EuiFlexGrid>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiPanel hasBorder paddingSize="m">
              <EuiFlexGroup gutterSize="s" wrap responsive={false}>
                {steps.map((step, index) => (
                  <EuiFlexItem key={step.id} grow={false}>
                    <EuiButton
                      size="s"
                      fill={index === activeStep}
                      color={step.done ? 'success' : index === activeStep ? 'primary' : 'text'}
                      onClick={() => goToStep(index)}
                    >
                      {index + 1}. {STEP_DESCS[index]}
                    </EuiButton>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            </EuiPanel>
          </EuiFlexItem>

          {message ? (
            <EuiFlexItem grow={false}>
              <Message message={message} onDismiss={() => setMessage(null)} />
            </EuiFlexItem>
          ) : null}

          <EuiFlexItem grow={false}>
            {stepContent[activeStep]}
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiButton onClick={goPrev} isDisabled={activeStep === 0}>
                  Précédent
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                {activeStep < 4 ? (
                  <EuiButton fill onClick={goNext}>
                    Continuer
                  </EuiButton>
                ) : (
                  <EuiBadge color="hollow">Étape finale</EuiBadge>
                )}
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </div>
    </Layout>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <EuiPanel color="subdued" paddingSize="s" hasBorder>
      <EuiText size="xs" color="subdued"><p>{label}</p></EuiText>
      <EuiSpacer size="xs" />
      <EuiTitle size="s"><h3>{value}</h3></EuiTitle>
    </EuiPanel>
  )
}
