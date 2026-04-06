import { createTranslator } from "./i18n.js"
import {
  addCredentialAction,
  attachExistingPaxAction,
  createPaxAction,
  downloadExternalAdsPdfAction,
  parseApiErrorDetail,
  resubmitExternalAction,
  sendOtpAction,
  submitExternalAction,
  updatePaxAction,
  updateTransportPreferencesAction,
  verifyOtpAction,
  wrapExternalAction,
} from "./actions.js"
import { loadExternalCredentialTypes, loadExternalDepartureBases, loadExternalDossier, loadExternalJobPositions, loadExternalLinkInfo } from "./dataService.js"
import { renderPage, renderTrackingPage } from "./renderers.js"
import { apiDownload, apiRequest, getApiBase, getPublicTrackingCodeFromUrl, getTokenFromUrl, sessionStorageKey } from "./runtime.js"
import { focusRequiredAction, objectFromFormData } from "./ui.js"

const { lang, t } = createTranslator(navigator.language)
const publicTrackingCode = getPublicTrackingCodeFromUrl()
const publicTrackingMode = window.location.pathname.startsWith("/tracking") || Boolean(publicTrackingCode && !new URL(window.location.href).searchParams.get("token"))

const state = {
  token: getTokenFromUrl(),
  trackingCode: publicTrackingCode,
  apiBase: getApiBase(),
  sessionToken: null,
  linkInfo: null,
  dossier: null,
  publicTracking: null,
  publicVoyageTracking: null,
  credentialTypes: [],
  jobPositions: [],
  departureBases: [],
  createPaxDraft: {},
  createPaxMatches: [],
  loading: false,
  message: null,
}

let createPaxMatchTimer = null
const PROTECTED_RESOURCE_LOADERS = [
  loadDossier,
  loadCredentialTypes,
  loadJobPositions,
  loadDepartureBases,
]

const app = document.getElementById("app")

bootstrap().catch((error) => {
  console.error(error)
  setMessage(error.message || t("generic_error"), "error")
  render()
})

async function bootstrap() {
  if (publicTrackingMode) {
    render()
    if (state.trackingCode) {
      await loadPublicTracking(state.trackingCode)
    }
    return
  }
  state.sessionToken = state.token ? localStorage.getItem(sessionStorageKey(state.token)) : null
  await loadLinkInfo()
  if (state.sessionToken && !state.linkInfo?.authenticated) {
    clearExternalSession()
    await loadLinkInfo()
  }
  if (state.sessionToken) {
    await hydrateProtectedSessionState()
  }
  render()
}

async function api(path, options = {}) {
  return apiRequest(
    { apiBase: state.apiBase, sessionToken: state.sessionToken },
    path,
    options,
  )
}

async function download(path, options = {}) {
  return apiDownload(
    { apiBase: state.apiBase, sessionToken: state.sessionToken },
    path,
    options,
  )
}

async function loadLinkInfo() {
  state.linkInfo = await loadExternalLinkInfo(api, state.token)
}

async function loadDossier() {
  state.dossier = await loadExternalDossier(api, state.token)
}

async function loadCredentialTypes() {
  state.credentialTypes = await loadExternalCredentialTypes(api, state.token, state.sessionToken)
}

async function loadJobPositions() {
  state.jobPositions = await loadExternalJobPositions(api, state.token, state.sessionToken)
}

async function loadDepartureBases() {
  state.departureBases = await loadExternalDepartureBases(api, state.token, state.sessionToken)
}

async function loadPublicTracking(code) {
  clearMessage()
  setLoading(true)
  render()
  try {
    state.publicVoyageTracking = null
    state.publicTracking = await apiRequest(
      { apiBase: state.apiBase, sessionToken: null },
      `/api/v1/travelwiz/public/cargo/${encodeURIComponent(code)}`,
    )
    state.trackingCode = code
    const url = new URL(window.location.href)
    url.searchParams.set("tracking", code)
    window.history.replaceState({}, "", url)
  } catch (error) {
    state.publicTracking = null
    const message = String(error?.message || "")
    if (message.includes("404")) {
      setMessage(t("cargo_tracking_try_voyage"), "subtle")
      try {
        state.publicVoyageTracking = await apiRequest(
          { apiBase: state.apiBase, sessionToken: null },
          `/api/v1/travelwiz/public/voyages/${encodeURIComponent(code)}/cargo`,
        )
        state.trackingCode = code
        const url = new URL(window.location.href)
        url.searchParams.set("tracking", code)
        window.history.replaceState({}, "", url)
        clearMessage()
      } catch (voyageError) {
        state.publicVoyageTracking = null
        const voyageMessage = String(voyageError?.message || "")
        if (voyageMessage.includes("404")) setMessage(t("cargo_tracking_not_found"), "error")
        else setMessage(t("cargo_tracking_unavailable"), "error")
      }
    } else {
      state.publicVoyageTracking = null
      setMessage(t("cargo_tracking_unavailable"), "error")
    }
  } finally {
    setLoading(false)
    render()
  }
}

function setMessage(text, tone = "success") {
  state.message = { text, tone }
  render()
}

function clearMessage() {
  state.message = null
}

function setLoading(value) {
  state.loading = value
}

function clearExternalSession(showMessage = false) {
  state.sessionToken = null
  if (state.token) {
    localStorage.removeItem(sessionStorageKey(state.token))
  }
  state.dossier = null
  state.credentialTypes = []
  state.jobPositions = []
  state.departureBases = []
  if (showMessage) {
    state.message = { text: t("session_expired_reauthenticate"), tone: "warn" }
  }
}

async function handleTrackingSearch(event) {
  event.preventDefault()
  const code = new FormData(event.currentTarget).get("tracking_code")?.toString().trim()
  state.trackingCode = code || ""
  if (!code) {
    state.publicTracking = null
    state.publicVoyageTracking = null
    setMessage(t("cargo_tracking_missing"), "error")
    render()
    return
  }
  setMessage(t("cargo_tracking_loading"), "subtle")
  await loadPublicTracking(code)
}

function isSessionRequiredError(error) {
  return String(error?.message || "").includes("Session externe requise")
}

async function hydrateProtectedSessionState() {
  const results = await Promise.allSettled(PROTECTED_RESOURCE_LOADERS.map((loader) => loader()))
  if (results.some((result) => result.status === "rejected" && isSessionRequiredError(result.reason))) {
    clearExternalSession(true)
    await loadLinkInfo()
    return false
  }
  return true
}

async function handleSendOtp() {
  clearMessage()
  setLoading(true)
  render()
  try {
    const result = await sendOtpAction(api, state.token)
    setMessage(`${t("otp_destination")}: ${result.destination_masked}`, "success")
  } catch (error) {
    setMessage(error.message || t("generic_error"), "error")
  } finally {
    setLoading(false)
    render()
  }
}

async function handleVerifyOtp(event) {
  event.preventDefault()
  const code = new FormData(event.currentTarget).get("code")?.toString().trim()
  if (!code) return
  clearMessage()
  setLoading(true)
  render()
  try {
    const result = await verifyOtpAction(api, state.token, code)
    state.sessionToken = result.session_token
    localStorage.setItem(sessionStorageKey(state.token), result.session_token)
    await loadLinkInfo()
    await hydrateProtectedSessionState()
    setMessage(t("action_done"), "success")
  } catch (error) {
    if (isSessionRequiredError(error)) {
      clearExternalSession(true)
      await loadLinkInfo()
    }
    setMessage(error.message || t("generic_error"), "error")
  } finally {
    setLoading(false)
    render()
  }
}

async function handleCreatePax(event) {
  event.preventDefault()
  const formData = new FormData(event.currentTarget)
  const payload = objectFromFormData(formData)
  await wrapAction(async () => {
    await createPaxAction(api, state.token, payload)
    state.createPaxDraft = {}
    state.createPaxMatches = []
    await loadDossier()
  }, async (error) => {
    const detail = parseApiErrorDetail(error)
    if (detail?.code === "EXTERNAL_PAX_DUPLICATE_MATCH" && Array.isArray(detail.matches)) {
      state.createPaxMatches = detail.matches
    }
  })
}

async function handleUpdatePax(event, contactId) {
  event.preventDefault()
  const payload = objectFromFormData(new FormData(event.currentTarget))
  await wrapAction(async () => {
    await updatePaxAction(api, state.token, contactId, payload)
    await loadDossier()
  })
}

async function handleAttachExistingPax(contactId) {
  await wrapAction(async () => {
    await attachExistingPaxAction(api, state.token, contactId, state.createPaxDraft || {})
    state.createPaxDraft = {}
    state.createPaxMatches = []
    await loadDossier()
  })
}

async function handleAddCredential(event, contactId) {
  event.preventDefault()
  const formData = new FormData(event.currentTarget)
  const payload = objectFromFormData(formData)
  await wrapAction(async () => {
    await addCredentialAction(api, state.token, contactId, payload)
    await loadDossier()
  })
}

async function handleSubmitExternal() {
  if ((state.dossier?.pax_summary?.total ?? 0) <= 0) {
    setMessage(t("no_submit_without_pax"), "warn")
    return
  }
  await wrapAction(async () => {
    await submitExternalAction(api, state.token)
    await loadLinkInfo()
    await loadDossier()
  })
}

async function handleResubmitExternal(event) {
  event.preventDefault()
  const reason = new FormData(event.currentTarget).get("reason")?.toString().trim()
  if (!reason) return
  await wrapAction(async () => {
    await resubmitExternalAction(api, state.token, reason)
    await loadLinkInfo()
    await loadDossier()
  })
}

async function handleUpdateTransportPreferences(event) {
  event.preventDefault()
  const payload = objectFromFormData(new FormData(event.currentTarget))
  await wrapAction(async () => {
    await updateTransportPreferencesAction(api, state.token, payload)
    await loadDossier()
  })
}

async function handleDownloadTicket() {
  await wrapAction(async () => {
    const blob = await downloadExternalAdsPdfAction(download, state.token)
    const url = window.URL.createObjectURL(blob)
    window.open(url, "_blank", "noopener,noreferrer")
    window.setTimeout(() => window.URL.revokeObjectURL(url), 10000)
  })
}

async function wrapAction(fn, onError = null) {
  return wrapExternalAction(
    {
      clearMessage,
      setLoading,
      render,
      setMessage,
      successMessage: t("action_done"),
    },
    fn,
    onError,
  )
}

async function lookupCreatePaxMatches() {
  if (!state.token || !state.sessionToken) return
  const draft = state.createPaxDraft || {}
  const firstName = draft.first_name?.trim()
  const lastName = draft.last_name?.trim()
  const badge = draft.badge_number?.trim()
  const email = draft.email?.trim()
  const phone = draft.phone?.trim()
  const hasEnoughSignals = (firstName && lastName) || badge || email || phone
  if (!hasEnoughSignals) {
    state.createPaxMatches = []
    render()
    return
  }
  try {
    state.createPaxMatches = await api(`/api/v1/pax/external/${state.token}/pax/matches`, {
      method: "POST",
      body: JSON.stringify(draft),
    })
  } catch {
    state.createPaxMatches = []
  }
  render()
}

function scheduleCreatePaxMatchLookup() {
  if (createPaxMatchTimer) window.clearTimeout(createPaxMatchTimer)
  createPaxMatchTimer = window.setTimeout(() => {
    lookupCreatePaxMatches().catch(() => {})
  }, 350)
}

function render() {
  if (publicTrackingMode) {
    app.innerHTML = renderTrackingPage({ state, t, lang })
    bindTrackingEvents()
    return
  }

  if (!state.token) {
    app.innerHTML = `<div class="page"><div class="message error">${t("public_token_missing")}</div></div>`
    return
  }

  const link = state.linkInfo
  const dossier = state.dossier
  const authenticated = Boolean(link?.authenticated)
  app.innerHTML = renderPage({ state, link, dossier, authenticated, t, lang })

  bindEvents()
}

function bindTrackingEvents() {
  document.getElementById("tracking-form")?.addEventListener("submit", handleTrackingSearch)
}

function bindEvents() {
  const sendOtpBtn = document.getElementById("send-otp")
  if (sendOtpBtn) sendOtpBtn.addEventListener("click", handleSendOtp)

  const verifyForm = document.getElementById("verify-otp-form")
  if (verifyForm) verifyForm.addEventListener("submit", handleVerifyOtp)

  const createPaxForm = document.getElementById("create-pax-form")
  if (createPaxForm) createPaxForm.addEventListener("submit", handleCreatePax)
  if (createPaxForm) {
    createPaxForm.querySelectorAll("input, textarea, select").forEach((field) => {
      field.addEventListener("input", (event) => {
        const target = event.target
        if (!target?.name) return
        state.createPaxDraft = { ...(state.createPaxDraft || {}), [target.name]: target.value }
        scheduleCreatePaxMatchLookup()
      })
    })
  }

  const submitBtn = document.getElementById("submit-dossier")
  if (submitBtn) submitBtn.addEventListener("click", handleSubmitExternal)

  const resubmitForm = document.getElementById("resubmit-form")
  if (resubmitForm) resubmitForm.addEventListener("submit", handleResubmitExternal)

  const transportPreferencesForm = document.getElementById("transport-preferences-form")
  if (transportPreferencesForm) transportPreferencesForm.addEventListener("submit", handleUpdateTransportPreferences)

  const downloadTicketBtn = document.getElementById("download-ticket")
  if (downloadTicketBtn) downloadTicketBtn.addEventListener("click", handleDownloadTicket)

  document.querySelectorAll(".pax-update-form").forEach((form) => {
    form.addEventListener("submit", (event) => handleUpdatePax(event, form.dataset.contactId))
  })

  document.querySelectorAll(".credential-form").forEach((form) => {
    form.addEventListener("submit", (event) => handleAddCredential(event, form.dataset.contactId))
  })

  document.querySelectorAll(".attach-existing-pax").forEach((button) => {
    button.addEventListener("click", () => handleAttachExistingPax(button.dataset.contactId))
  })

  document.querySelectorAll(".required-action-btn").forEach((button) => {
    button.addEventListener("click", () => focusRequiredAction(button))
  })
}
