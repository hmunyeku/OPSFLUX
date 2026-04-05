import { createTranslator } from "./i18n.js"
import {
  addCredentialAction,
  attachExistingPaxAction,
  createPaxAction,
  parseApiErrorDetail,
  resubmitExternalAction,
  sendOtpAction,
  submitExternalAction,
  updatePaxAction,
  verifyOtpAction,
  wrapExternalAction,
} from "./actions.js"
import { loadExternalCredentialTypes, loadExternalDossier, loadExternalLinkInfo } from "./dataService.js"
import { apiRequest, getApiBase, getTokenFromUrl, sessionStorageKey } from "./runtime.js"

const { lang, t } = createTranslator(navigator.language)

const state = {
  token: getTokenFromUrl(),
  apiBase: getApiBase(),
  sessionToken: null,
  linkInfo: null,
  dossier: null,
  credentialTypes: [],
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
    await Promise.allSettled([loadDossier(), loadCredentialTypes()])
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

async function loadLinkInfo() {
  state.linkInfo = await loadExternalLinkInfo(api, state.token)
}

async function loadDossier() {
  state.dossier = await loadExternalDossier(api, state.token)
}

async function loadCredentialTypes() {
  state.credentialTypes = await loadExternalCredentialTypes(api, state.token, state.sessionToken)
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
    await Promise.all([loadLinkInfo(), loadDossier(), loadCredentialTypes()])
    setMessage(t("action_done"), "success")
  } catch (error) {
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

function objectFromFormData(formData) {
  const payload = {}
  for (const [key, value] of formData.entries()) {
    const normalized = value.toString().trim()
    payload[key] = normalized === "" ? null : normalized
  }
  return payload
}

function render() {
  if (!state.token) {
    app.innerHTML = `<div class="page"><div class="message error">${t("public_token_missing")}</div></div>`
    return
  }

  const link = state.linkInfo
  const dossier = state.dossier
  const authenticated = Boolean(link?.authenticated || state.sessionToken)

  app.innerHTML = `
    <div class="page">
      <section class="hero">
        <article class="panel hero-main">
          <div class="eyebrow">OpsFlux External Flow</div>
          <h1>${t("app_title")}</h1>
          <p>${t("app_intro")}</p>
          <div class="hero-stats">
            <div class="hero-stat">
              <div class="hero-stat-label">${t("pax_count")}</div>
              <div class="hero-stat-value">${escapeHtml(String(dossier?.pax_summary?.total ?? 0))}</div>
            </div>
            <div class="hero-stat">
              <div class="hero-stat-label">${t("pending_check")}</div>
              <div class="hero-stat-value">${escapeHtml(String(dossier?.pax_summary?.pending_check ?? 0))}</div>
            </div>
            <div class="hero-stat">
              <div class="hero-stat-label">${t("blocked")}</div>
              <div class="hero-stat-value">${escapeHtml(String(dossier?.pax_summary?.blocked ?? 0))}</div>
            </div>
          </div>
        </article>
        <aside class="panel pad top-panel">
          <section class="top-section">
            <div class="top-section-title">${t("access_state")}</div>
            <div class="status-chip ${authenticated ? "success" : "warn"}">
              ${authenticated ? t("authenticated") : (link?.otp_required ? t("otp_required") : t("otp_not_required"))}
            </div>
          </section>
          <section class="top-section">
            <div class="top-section-title">${t("security")}</div>
            <div class="meta-list">
              <div class="meta-item"><strong>${t("token_info")}</strong><span class="mono">${state.token}</span></div>
              <div class="meta-item"><strong>${t("remaining_uses")}</strong>${link?.remaining_uses ?? "—"}</div>
              <div class="meta-item"><strong>${t("expires_at")}</strong>${formatDateTime(link?.expires_at)}</div>
            </div>
          </section>
        </aside>
      </section>

      ${state.message ? `<div class="message ${state.message.tone}">${escapeHtml(state.message.text)}</div>` : ""}

      <section class="grid two" style="margin-top:18px">
        <div class="panel pad">
          ${renderSecurity(link, authenticated)}
        </div>
        <div class="panel pad">
          ${renderDossierSummary(dossier)}
        </div>
      </section>

      <section style="margin-top:18px" class="panel pad">
        ${renderPaxArea(dossier, authenticated)}
      </section>
    </div>
  `

  bindEvents()
}

function renderSecurity(link, authenticated) {
  return `
    <h2 class="section-title">${t("security")}</h2>
    <p class="section-subtitle">${authenticated ? t("authenticated") : t("session_needed")}</p>
    <div class="stack">
      ${link?.otp_required ? `
        <div class="message warn">${t("otp_destination")}: ${link?.otp_destination_masked || "—"}</div>
        <div class="button-row">
          <button class="secondary" id="send-otp" ${state.loading ? "disabled" : ""}>${t("send_code")}</button>
        </div>
        <form id="verify-otp-form" class="stack">
          <label>${t("otp_code")}<input name="code" inputmode="numeric" maxlength="6" placeholder="123456" /></label>
          <div class="button-row">
            <button class="primary" ${state.loading ? "disabled" : ""}>${t("verify_code")}</button>
          </div>
        </form>
      ` : `
        <div class="message success">${t("otp_not_required")}</div>
      `}
    </div>
  `
}

function renderDossierSummary(dossier) {
  if (!dossier) {
    return `<h2 class="section-title">${t("dossier")}</h2><p class="muted">${t("loading")}</p>`
  }
  const ads = dossier.ads
  return `
    <h2 class="section-title">${t("dossier")}</h2>
    <p class="section-subtitle">${escapeHtml(ads.reference)} · ${escapeHtml(ads.status)}</p>
    <div class="summary-strip">
      <div class="summary-pill">
        <strong>${t("company")}</strong>
        <span>${escapeHtml(dossier.allowed_company_name || "—")}</span>
      </div>
      <div class="summary-pill">
        <strong>${t("site")}</strong>
        <span>${escapeHtml(ads.site_name || "—")}</span>
      </div>
      <div class="summary-pill">
        <strong>${t("project")}</strong>
        <span>${escapeHtml(ads.project_name || "—")}</span>
      </div>
    </div>
    <div class="grid cards">
      <div class="card clean"><div class="card-label">${t("purpose")}</div><div class="card-value" style="font-size:16px">${escapeHtml(ads.visit_purpose || "—")}</div></div>
      <div class="card clean"><div class="card-label">${t("category")}</div><div class="card-value" style="font-size:16px">${escapeHtml(ads.visit_category || "—")}</div></div>
      <div class="card clean"><div class="card-label">${t("dates")}</div><div class="card-value" style="font-size:16px">${escapeHtml(`${ads.start_date} → ${ads.end_date}`)}</div></div>
      <div class="card clean"><div class="card-label">${t("outbound_transport")}</div><div class="card-value" style="font-size:16px">${escapeHtml(ads.outbound_transport_mode || "—")}</div></div>
      <div class="card clean"><div class="card-label">${t("return_transport")}</div><div class="card-value" style="font-size:16px">${escapeHtml(ads.return_transport_mode || "—")}</div></div>
      <div class="card clean"><div class="card-label">${t("pax_count")}</div><div class="card-value" style="font-size:16px">${escapeHtml(String(dossier?.pax_summary?.total ?? 0))}</div></div>
    </div>
    <div class="review-banner ${(dossier?.pax_summary?.blocked ?? 0) > 0 || (dossier?.pax_summary?.pending_check ?? 0) > 0 ? "warn" : "success"}" style="margin-top:14px">
      <strong>${t("review_summary")}</strong><br/>
      ${((dossier?.pax_summary?.blocked ?? 0) > 0 || (dossier?.pax_summary?.pending_check ?? 0) > 0) ? t("dossier_needs_review") : t("dossier_ready")}
    </div>
    ${ads.rejection_reason ? `<div class="message warn" style="margin-top:14px"><strong>${t("correction_reason")}</strong><br/>${escapeHtml(ads.rejection_reason)}</div>` : ""}
    <div class="divider"></div>
    <h3 class="section-title">${t("preconfigured")}</h3>
    <pre class="code-block">${escapeHtml(JSON.stringify(dossier.preconfigured_data || {}, null, 2))}</pre>
  `
}

function renderPaxArea(dossier, authenticated) {
  if (!authenticated) {
    return `<h2 class="section-title">${t("pax")}</h2><div class="message warn">${t("session_needed")}</div>`
  }
  if (!dossier) {
    return `<h2 class="section-title">${t("pax")}</h2><p class="muted">${t("loading")}</p>`
  }
  return `
    <div class="stack">
      <div class="button-row" style="justify-content:space-between; align-items:center">
        <div>
          <h2 class="section-title" style="margin-bottom:4px">${t("pax")}</h2>
          <p class="section-subtitle">${dossier.allowed_company_name || dossier.allowed_company_id || t("scope")}</p>
        </div>
        <div class="button-row">
          ${dossier.can_submit ? `<button class="primary" id="submit-dossier" ${state.loading ? "disabled" : ""}>${t("submit")}</button>` : ""}
        </div>
      </div>

      <div class="summary-strip">
        <div class="meta-item"><strong>${t("pending_check")}</strong>${dossier?.pax_summary?.pending_check ?? 0}</div>
        <div class="meta-item"><strong>${t("approved")}</strong>${dossier?.pax_summary?.approved ?? 0}</div>
        <div class="meta-item"><strong>${t("blocked")}</strong>${dossier?.pax_summary?.blocked ?? 0}</div>
      </div>

      ${dossier.can_resubmit ? `
        <form id="resubmit-form" class="message warn stack">
          <label>${t("resubmit_reason")}<textarea name="reason"></textarea></label>
          <div class="button-row">
            <button class="warning" ${state.loading ? "disabled" : ""}>${t("resubmit")}</button>
          </div>
        </form>
      ` : ""}

      <form id="create-pax-form" class="panel pad" style="background:var(--panel-strong)">
        <h3 class="section-title">${t("add_pax")}</h3>
        <div class="field-grid">
          ${renderPaxFields("", state.createPaxDraft || {})}
        </div>
        <div class="button-row" style="margin-top:12px">
          <button class="primary" ${state.loading ? "disabled" : ""}>${t("add_pax")}</button>
        </div>
      </form>

      ${renderCreatePaxMatches()}

      ${(dossier.pax || []).length === 0 ? `<div class="message">${t("no_pax")}</div>` : dossier.pax.map(renderPaxCard).join("")}
    </div>
  `
}

function renderPaxFields(prefix = "", values = {}) {
  const field = (name, label, type = "text", required = false) => `
    <label>${label}<input type="${type}" name="${prefix}${name}" value="${escapeHtml(values[name] || "")}" ${required ? "required" : ""} /></label>
  `
  return [
    field("first_name", t("first_name"), "text", true),
    field("last_name", t("last_name"), "text", true),
    field("birth_date", t("birth_date"), "date"),
    field("nationality", t("nationality")),
    field("badge_number", t("badge_number")),
    field("photo_url", t("photo_url")),
    field("email", t("email"), "email"),
    field("phone", t("phone")),
    field("position", t("position")),
  ].join("")
}

function renderPaxCard(pax) {
  const missingIdentityFields = [
    !pax.birth_date ? t("birth_date") : null,
    !pax.nationality ? t("nationality") : null,
    !pax.badge_number ? t("badge_number") : null,
  ].filter(Boolean)
  const credentialOptions = state.credentialTypes
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.code)})</option>`)
    .join("")
  const paxStatus = pax.status || "pending_check"
  const paxStatusTone =
    paxStatus === "blocked" ? "danger" :
    paxStatus === "pending_check" ? "warn" :
    "success"
  return `
    <article class="pax-item">
      <div class="pax-stack">
      <div class="pax-head">
        <div>
          <div class="pax-name">${escapeHtml(`${pax.first_name} ${pax.last_name}`)}</div>
          <div class="pax-subhead">
            <div class="pax-role">${escapeHtml(pax.position || "—")}</div>
            <div class="status-chip ${paxStatusTone}">${escapeHtml(t(paxStatus))}</div>
          </div>
        </div>
      </div>
      <div class="meta-list">
        <div class="meta-item"><strong>${t("birth_date")}</strong>${escapeHtml(pax.birth_date || "—")}</div>
        <div class="meta-item"><strong>${t("nationality")}</strong>${escapeHtml(pax.nationality || "—")}</div>
        <div class="meta-item"><strong>${t("badge_number")}</strong>${escapeHtml(pax.badge_number || "—")}</div>
        <div class="meta-item"><strong>${t("email")}</strong>${escapeHtml(pax.email || "—")}</div>
        <div class="meta-item"><strong>${t("phone")}</strong>${escapeHtml(pax.phone || "—")}</div>
        <div class="meta-item"><strong>${t("photo_url")}</strong>${escapeHtml(pax.photo_url || "—")}</div>
        <div class="meta-item"><strong>${t("compliance")}</strong>${pax.compliance_ok ? t("compliance_ok") : `${t("compliance_blockers")}: ${escapeHtml(String(pax.compliance_blocker_count || 0))}`}</div>
      </div>
      ${(pax.compliance_blockers || []).length > 0 ? `
        <div class="message warn">
          <strong>${t("compliance_issues")}</strong>
          <ul>
            ${pax.compliance_blockers.map((item) => `<li>${escapeHtml(item.credential_type_name || item.credential_type_code || "—")} · ${escapeHtml(t(item.status || "—"))}${item.message ? ` · ${escapeHtml(item.message)}` : ""}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${(pax.required_actions || []).length > 0 ? `
        <div class="message warn">
          <strong>${t("required_actions")}</strong>
          <ul>
            ${(pax.required_actions || []).map((item) => `<li>${renderRequiredAction(item, pax.contact_id)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${missingIdentityFields.length > 0 ? `
        <div class="message warn">
          <strong>${t("identity_missing")}</strong>
          <div>${escapeHtml(missingIdentityFields.join(", "))}</div>
        </div>
      ` : ""}
      <div class="info-panel">
        <h4>${t("current_credentials")}</h4>
        <strong>${t("current_credentials")}</strong>
        ${(pax.credentials || []).length > 0 ? `
          <ul>
            ${pax.credentials.map((item) => `<li>${escapeHtml(item.credential_type_name || item.credential_type_code || "—")} · ${escapeHtml(t(item.status || "—"))}${item.expiry_date ? ` · ${escapeHtml(item.expiry_date)}` : ""}</li>`).join("")}
          </ul>
        ` : `<div>${t("no_credentials")}</div>`}
      </div>
      <form class="stack pax-update-form form-panel" data-contact-id="${pax.contact_id}">
        <h3 class="section-title">${t("save_changes")}</h3>
        <div class="field-grid">${renderPaxFields("", pax)}</div>
        <div class="button-row">
          <button class="secondary" ${state.loading ? "disabled" : ""}>${t("save_changes")}</button>
        </div>
      </form>
      <form class="stack credential-form form-panel" data-contact-id="${pax.contact_id}">
        <h3 class="section-title">${t("credentials")}</h3>
        <div class="field-grid">
          <label>${t("credential_type")}
            <select name="credential_type_id" required>
              <option value=""></option>
              ${credentialOptions}
            </select>
          </label>
          <label>${t("obtained_date")}<input type="date" name="obtained_date" required /></label>
          <label>${t("expiry_date")}<input type="date" name="expiry_date" /></label>
          <label>${t("proof_url")}<input type="url" name="proof_url" /></label>
          <label>${t("notes")}<textarea name="notes"></textarea></label>
        </div>
        <div class="button-row">
          <button class="secondary" ${state.loading ? "disabled" : ""}>${t("add_credential")}</button>
        </div>
      </form>
      </div>
    </article>
  `
}

function renderRequiredAction(item, contactId) {
  const label = item?.label || item?.field || "—"
  const status = item?.status ? ` · ${t(item.status)}` : ""
  const layer = item?.layer_label ? ` · ${item.layer_label}` : ""
  let guidance = ""
  let actionButton = ""
  if (item?.kind === "identity") guidance = t("update_identity_action")
  else if (item?.status === "pending_validation") guidance = t("wait_validation_action")
  else guidance = t("add_credential_action")

  if (item?.kind === "identity") {
    actionButton = `
      <div style="margin-top:8px">
        <button
          type="button"
          class="secondary required-action-btn"
          data-contact-id="${escapeHtml(contactId)}"
          data-action-kind="identity"
          data-field="${escapeHtml(item?.field || "")}"
        >${t("complete_now")}</button>
      </div>
    `
  } else if (item?.kind === "credential" && item?.status !== "pending_validation") {
    actionButton = `
      <div style="margin-top:8px">
        <button
          type="button"
          class="secondary required-action-btn"
          data-contact-id="${escapeHtml(contactId)}"
          data-action-kind="credential"
          data-credential-code="${escapeHtml(item?.credential_type_code || item?.field || "")}"
        >${t("add_credential_now")}</button>
      </div>
    `
  }
  const message = item?.message ? ` · ${item.message}` : ""
  return `${escapeHtml(label)}${escapeHtml(status)}${escapeHtml(layer)}${message ? ` · ${escapeHtml(item.message)}` : ""}<br/><span class="muted">${escapeHtml(guidance)}</span>${actionButton}`
}

function focusRequiredAction(button) {
  const contactId = button?.dataset?.contactId
  const actionKind = button?.dataset?.actionKind
  if (!contactId || !actionKind) return

  if (actionKind === "identity") {
    const form = document.querySelector(`.pax-update-form[data-contact-id="${contactId}"]`)
    if (!form) return
    form.scrollIntoView({ behavior: "smooth", block: "center" })
    const fieldName = button.dataset.field
    const targetField = fieldName ? form.querySelector(`[name="${fieldName}"]`) : form.querySelector("input, textarea, select")
    targetField?.focus()
    return
  }

  if (actionKind === "credential") {
    const form = document.querySelector(`.credential-form[data-contact-id="${contactId}"]`)
    if (!form) return
    form.scrollIntoView({ behavior: "smooth", block: "center" })
    const select = form.querySelector('select[name="credential_type_id"]')
    const code = button.dataset.credentialCode
    if (select && code) {
      const option = Array.from(select.options).find((item) => item.textContent?.includes(`(${code})`))
      if (option) select.value = option.value
    }
    select?.focus()
  }
}

function renderCreatePaxMatches() {
  if (!Array.isArray(state.createPaxMatches) || state.createPaxMatches.length === 0) return ""
  return `
    <div class="message warn">
      <strong>${t("duplicate_candidates")}</strong><br/>
      ${t("duplicate_candidates_hint")}
      <div class="stack" style="margin-top:12px">
        ${state.createPaxMatches.map((match) => `
          <div class="panel pad" style="background:var(--panel-strong)">
            <div class="button-row" style="justify-content:space-between; align-items:flex-start">
              <div>
                <div class="pax-name">${escapeHtml(`${match.first_name} ${match.last_name}`)}</div>
                <div class="muted">${escapeHtml(match.position || "—")}</div>
              </div>
              <button class="secondary attach-existing-pax" data-contact-id="${match.contact_id}" ${state.loading ? "disabled" : ""}>
                ${t("confirm_existing_candidate")}
              </button>
            </div>
            <div class="meta-list" style="margin-top:10px">
              <div class="meta-item"><strong>${t("match_score")}</strong>${escapeHtml(String(match.match_score))}</div>
              <div class="meta-item"><strong>${t("match_reasons")}</strong>${escapeHtml((match.match_reasons || []).join(", ") || "—")}</div>
              <div class="meta-item"><strong>${t("birth_date")}</strong>${escapeHtml(match.birth_date || "—")}</div>
              <div class="meta-item"><strong>${t("badge_number")}</strong>${escapeHtml(match.badge_number || "—")}</div>
              <div class="meta-item"><strong>${t("email")}</strong>${escapeHtml(match.email || "—")}</div>
              <div class="meta-item"><strong>${t("phone")}</strong>${escapeHtml(match.phone || "—")}</div>
            </div>
            ${match.already_linked_to_ads ? `<div class="message">${t("already_linked")}</div>` : ""}
          </div>
        `).join("")}
      </div>
    </div>
  `
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

function formatDateTime(value) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(lang === "fr" ? "fr-FR" : "en-US")
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}
