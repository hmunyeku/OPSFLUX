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
import { renderPage } from "./renderers.js"
import { apiDownload, apiRequest, getApiBase, getTokenFromUrl, sessionStorageKey } from "./runtime.js"
import { focusRequiredAction, objectFromFormData } from "./ui.js"

const { lang, t } = createTranslator(navigator.language)

const state = {
  token: getTokenFromUrl(),
  apiBase: getApiBase(),
  sessionToken: null,
  linkInfo: null,
  dossier: null,
  credentialTypes: [],
  jobPositions: [],
  departureBases: [],
  createPaxDraft: {},
  createPaxMatches: [],
  loading: false,
  message: null,
}

let createPaxMatchTimer = null

const app = document.getElementById("app")

bootstrap().catch((error) => {
  console.error(error)
  setMessage(error.message || t("generic_error"), "error")
  render()
})

async function bootstrap() {
  state.sessionToken = state.token ? localStorage.getItem(sessionStorageKey(state.token)) : null
  await loadLinkInfo()
  if (state.sessionToken) {
    const results = await Promise.allSettled([
      loadDossier(),
      loadCredentialTypes(),
      loadJobPositions(),
      loadDepartureBases(),
    ])
    if (
      results.some(
        (result) =>
          result.status === "rejected" &&
          String(result.reason?.message || "").includes("Session externe requise"),
      )
    ) {
      clearExternalSession(true)
      await loadLinkInfo()
    }
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
    await Promise.all([loadLinkInfo(), loadDossier(), loadCredentialTypes(), loadJobPositions(), loadDepartureBases()])
    setMessage(t("action_done"), "success")
  } catch (error) {
    if (String(error?.message || "").includes("Session externe requise")) {
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
  if (!state.token) {
    app.innerHTML = `<div class="page"><div class="message error">${t("public_token_missing")}</div></div>`
    return
  }

  const link = state.linkInfo
  const dossier = state.dossier
  const authenticated = Boolean(link?.authenticated || state.sessionToken)
  app.innerHTML = renderPage({ state, link, dossier, authenticated, t, lang })

  bindEvents()
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
