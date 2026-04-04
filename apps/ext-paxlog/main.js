const translations = {
  fr: {
    app_title: "Portail externe PaxLog",
    app_intro: "Complétez les informations de séjour demandées par OpsFlux, ajoutez votre équipe et soumettez le dossier sans naviguer dans des menus complexes.",
    access_state: "État d'accès",
    authenticated: "Session ouverte",
    otp_required: "OTP requis",
    otp_not_required: "OTP non requis",
    remaining_uses: "Utilisations restantes",
    expires_at: "Expire le",
    security: "Sécurité",
    send_code: "Envoyer le code OTP",
    verify_code: "Valider le code",
    otp_code: "Code OTP",
    otp_destination: "Code envoyé vers",
    dossier: "Dossier",
    scope: "Périmètre",
    purpose: "Objet",
    category: "Catégorie",
    dates: "Dates",
    site: "Site",
    project: "Projet",
    status: "Statut",
    correction_reason: "Motif de correction",
    preconfigured: "Éléments préconfigurés",
    pax: "Équipe externe",
    add_pax: "Ajouter un PAX",
    save_changes: "Enregistrer les changements",
    credentials: "Certifications",
    add_credential: "Ajouter une certification",
    credential_type: "Type de certification",
    obtained_date: "Date d'obtention",
    expiry_date: "Date d'expiration",
    proof_url: "URL du justificatif",
    notes: "Notes",
    submit: "Soumettre le dossier",
    resubmit: "Re-soumettre le dossier",
    resubmit_reason: "Corrections apportées",
    first_name: "Prénom",
    last_name: "Nom",
    birth_date: "Date de naissance",
    nationality: "Nationalité",
    badge_number: "Badge",
    photo_url: "URL photo",
    email: "Email",
    phone: "Téléphone",
    position: "Fonction",
    no_pax: "Aucun PAX externe n'est encore rattaché à ce dossier.",
    session_needed: "Ouvrez d'abord la session OTP pour accéder au dossier.",
    loading: "Chargement…",
    public_token_missing: "Aucun token externe n'a été détecté dans l'URL.",
    generic_error: "Une erreur est survenue.",
    token_info: "Jeton",
    action_done: "Action effectuée.",
  },
  en: {
    app_title: "PaxLog external portal",
    app_intro: "Complete the required stay information, add your crew, and submit the dossier without digging through tabs.",
    access_state: "Access state",
    authenticated: "Session open",
    otp_required: "OTP required",
    otp_not_required: "OTP not required",
    remaining_uses: "Remaining uses",
    expires_at: "Expires at",
    security: "Security",
    send_code: "Send OTP code",
    verify_code: "Verify code",
    otp_code: "OTP code",
    otp_destination: "Code sent to",
    dossier: "Dossier",
    scope: "Scope",
    purpose: "Purpose",
    category: "Category",
    dates: "Dates",
    site: "Site",
    project: "Project",
    status: "Status",
    correction_reason: "Correction reason",
    preconfigured: "Preconfigured items",
    pax: "External crew",
    add_pax: "Add PAX",
    save_changes: "Save changes",
    credentials: "Credentials",
    add_credential: "Add credential",
    credential_type: "Credential type",
    obtained_date: "Obtained date",
    expiry_date: "Expiry date",
    proof_url: "Proof URL",
    notes: "Notes",
    submit: "Submit dossier",
    resubmit: "Resubmit dossier",
    resubmit_reason: "Corrections made",
    first_name: "First name",
    last_name: "Last name",
    birth_date: "Birth date",
    nationality: "Nationality",
    badge_number: "Badge",
    photo_url: "Photo URL",
    email: "Email",
    phone: "Phone",
    position: "Position",
    no_pax: "No external PAX is linked to this dossier yet.",
    session_needed: "Open the OTP session first to access the dossier.",
    loading: "Loading…",
    public_token_missing: "No external token was found in the URL.",
    generic_error: "Something went wrong.",
    token_info: "Token",
    action_done: "Action completed.",
  },
}

const lang = navigator.language?.toLowerCase().startsWith("en") ? "en" : "fr"
const t = (key) => translations[lang][key] || key

const state = {
  token: getTokenFromUrl(),
  apiBase: getApiBase(),
  sessionToken: null,
  linkInfo: null,
  dossier: null,
  credentialTypes: [],
  loading: false,
  message: null,
}

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

function getTokenFromUrl() {
  const queryToken = new URLSearchParams(window.location.search).get("token")
  if (queryToken) return queryToken
  const parts = window.location.pathname.split("/").filter(Boolean)
  return parts.at(-1) || ""
}

function getApiBase() {
  const envBase = import.meta.env.VITE_API_URL
  if (envBase) return envBase.replace(/\/$/, "")
  const { protocol, hostname, port } = window.location
  if (hostname.startsWith("ext.")) {
    return `${protocol}//api.${hostname.slice(4)}`
  }
  if (hostname.startsWith("web.") || hostname.startsWith("app.")) {
    return `${protocol}//api.${hostname.split(".").slice(1).join(".")}`
  }
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}:${port === "5175" ? "8000" : port || "8000"}`
  }
  return `${protocol}//${hostname}`
}

function sessionStorageKey(token) {
  return `opsflux-ext-paxlog-session:${token}`
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  }
  if (state.sessionToken) {
    headers["X-External-Session"] = state.sessionToken
  }
  const response = await fetch(`${state.apiBase}${path}`, {
    ...options,
    headers,
  })
  const contentType = response.headers.get("content-type") || ""
  const payload = contentType.includes("application/json") ? await response.json() : await response.text()
  if (!response.ok) {
    const detail = typeof payload === "object" && payload?.detail ? payload.detail : payload
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail))
  }
  return payload
}

async function loadLinkInfo() {
  if (!state.token) return
  state.linkInfo = await api(`/api/v1/pax/external/${state.token}`)
}

async function loadDossier() {
  if (!state.token) return
  state.dossier = await api(`/api/v1/pax/external/${state.token}/dossier`)
}

async function loadCredentialTypes() {
  state.credentialTypes = await api(`/api/v1/pax/credential-types`)
}

function setMessage(text, tone = "success") {
  state.message = { text, tone }
  render()
}

function clearMessage() {
  state.message = null
}

async function handleSendOtp() {
  clearMessage()
  state.loading = true
  render()
  try {
    const result = await api(`/api/v1/pax/external/${state.token}/otp/send`, { method: "POST" })
    setMessage(`${t("otp_destination")}: ${result.destination_masked}`, "success")
  } catch (error) {
    setMessage(error.message || t("generic_error"), "error")
  } finally {
    state.loading = false
    render()
  }
}

async function handleVerifyOtp(event) {
  event.preventDefault()
  const code = new FormData(event.currentTarget).get("code")?.toString().trim()
  if (!code) return
  clearMessage()
  state.loading = true
  render()
  try {
    const result = await api(`/api/v1/pax/external/${state.token}/otp/verify`, {
      method: "POST",
      body: JSON.stringify({ code }),
    })
    state.sessionToken = result.session_token
    localStorage.setItem(sessionStorageKey(state.token), result.session_token)
    await Promise.all([loadLinkInfo(), loadDossier(), loadCredentialTypes()])
    setMessage(t("action_done"), "success")
  } catch (error) {
    setMessage(error.message || t("generic_error"), "error")
  } finally {
    state.loading = false
    render()
  }
}

async function handleCreatePax(event) {
  event.preventDefault()
  const formData = new FormData(event.currentTarget)
  const payload = objectFromFormData(formData)
  await wrapAction(async () => {
    await api(`/api/v1/pax/external/${state.token}/pax`, {
      method: "POST",
      body: JSON.stringify(payload),
    })
    await loadDossier()
  })
}

async function handleUpdatePax(event, contactId) {
  event.preventDefault()
  const payload = objectFromFormData(new FormData(event.currentTarget))
  await wrapAction(async () => {
    await api(`/api/v1/pax/external/${state.token}/pax/${contactId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    })
    await loadDossier()
  })
}

async function handleAddCredential(event, contactId) {
  event.preventDefault()
  const formData = new FormData(event.currentTarget)
  const payload = objectFromFormData(formData)
  await wrapAction(async () => {
    await api(`/api/v1/pax/external/${state.token}/pax/${contactId}/credentials`, {
      method: "POST",
      body: JSON.stringify(payload),
    })
    setMessage(t("action_done"), "success")
  })
}

async function handleSubmitExternal() {
  await wrapAction(async () => {
    await api(`/api/v1/pax/external/${state.token}/submit`, { method: "POST" })
    await loadLinkInfo()
    await loadDossier()
  })
}

async function handleResubmitExternal(event) {
  event.preventDefault()
  const reason = new FormData(event.currentTarget).get("reason")?.toString().trim()
  if (!reason) return
  await wrapAction(async () => {
    await api(`/api/v1/pax/external/${state.token}/resubmit`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    })
    await loadLinkInfo()
    await loadDossier()
  })
}

async function wrapAction(fn) {
  clearMessage()
  state.loading = true
  render()
  try {
    await fn()
    setMessage(t("action_done"), "success")
  } catch (error) {
    setMessage(error.message || t("generic_error"), "error")
  } finally {
    state.loading = false
    render()
  }
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
        </article>
        <aside class="panel pad stack">
          <div>
            <div class="card-label">${t("access_state")}</div>
            <div style="margin-top:10px" class="status-chip ${authenticated ? "success" : "warn"}">
              ${authenticated ? t("authenticated") : (link?.otp_required ? t("otp_required") : t("otp_not_required"))}
            </div>
          </div>
          <div class="meta-list">
            <div class="meta-item"><strong>${t("token_info")}</strong><span class="mono">${state.token}</span></div>
            <div class="meta-item"><strong>${t("remaining_uses")}</strong>${link?.remaining_uses ?? "—"}</div>
            <div class="meta-item"><strong>${t("expires_at")}</strong>${formatDateTime(link?.expires_at)}</div>
          </div>
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
    <div class="grid cards">
      <div class="card"><div class="card-label">${t("purpose")}</div><div class="card-value" style="font-size:16px">${escapeHtml(ads.visit_purpose || "—")}</div></div>
      <div class="card"><div class="card-label">${t("category")}</div><div class="card-value" style="font-size:16px">${escapeHtml(ads.visit_category || "—")}</div></div>
      <div class="card"><div class="card-label">${t("dates")}</div><div class="card-value" style="font-size:16px">${escapeHtml(`${ads.start_date} → ${ads.end_date}`)}</div></div>
      <div class="card"><div class="card-label">${t("project")}</div><div class="card-value" style="font-size:16px">${escapeHtml(ads.project_id || "—")}</div></div>
    </div>
    ${ads.rejection_reason ? `<div class="message warn" style="margin-top:14px"><strong>${t("correction_reason")}</strong><br/>${escapeHtml(ads.rejection_reason)}</div>` : ""}
    <div class="divider"></div>
    <h3 class="section-title">${t("preconfigured")}</h3>
    <pre class="message">${escapeHtml(JSON.stringify(dossier.preconfigured_data || {}, null, 2))}</pre>
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
          <p class="section-subtitle">${dossier.allowed_company_id || t("scope")}</p>
        </div>
        <div class="button-row">
          ${dossier.can_submit ? `<button class="primary" id="submit-dossier" ${state.loading ? "disabled" : ""}>${t("submit")}</button>` : ""}
        </div>
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
          ${renderPaxFields()}
        </div>
        <div class="button-row" style="margin-top:12px">
          <button class="primary" ${state.loading ? "disabled" : ""}>${t("add_pax")}</button>
        </div>
      </form>

      ${(dossier.pax || []).length === 0 ? `<div class="message">${t("no_pax")}</div>` : dossier.pax.map(renderPaxCard).join("")}
    </div>
  `
}

function renderPaxFields(prefix = "", values = {}) {
  const field = (name, label, type = "text") => `
    <label>${label}<input type="${type}" name="${prefix}${name}" value="${escapeHtml(values[name] || "")}" /></label>
  `
  return [
    field("first_name", t("first_name")),
    field("last_name", t("last_name")),
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
  const credentialOptions = state.credentialTypes
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.code)})</option>`)
    .join("")
  return `
    <article class="pax-item">
      <div class="pax-head">
        <div>
          <div class="pax-name">${escapeHtml(`${pax.first_name} ${pax.last_name}`)}</div>
          <div class="muted">${escapeHtml(pax.position || "—")} · ${escapeHtml(pax.status || "pending_check")}</div>
        </div>
        <div class="status-chip ${pax.status === "blocked" ? "danger" : "success"}">${escapeHtml(pax.status || "pending_check")}</div>
      </div>
      <div class="meta-list">
        <div class="meta-item"><strong>${t("birth_date")}</strong>${escapeHtml(pax.birth_date || "—")}</div>
        <div class="meta-item"><strong>${t("nationality")}</strong>${escapeHtml(pax.nationality || "—")}</div>
        <div class="meta-item"><strong>${t("badge_number")}</strong>${escapeHtml(pax.badge_number || "—")}</div>
        <div class="meta-item"><strong>${t("email")}</strong>${escapeHtml(pax.email || "—")}</div>
        <div class="meta-item"><strong>${t("phone")}</strong>${escapeHtml(pax.phone || "—")}</div>
        <div class="meta-item"><strong>${t("photo_url")}</strong>${escapeHtml(pax.photo_url || "—")}</div>
      </div>
      <div class="divider"></div>
      <form class="stack pax-update-form" data-contact-id="${pax.contact_id}">
        <h3 class="section-title">${t("save_changes")}</h3>
        <div class="field-grid">${renderPaxFields("", pax)}</div>
        <div class="button-row">
          <button class="secondary" ${state.loading ? "disabled" : ""}>${t("save_changes")}</button>
        </div>
      </form>
      <div class="divider"></div>
      <form class="stack credential-form" data-contact-id="${pax.contact_id}">
        <h3 class="section-title">${t("credentials")}</h3>
        <div class="field-grid">
          <label>${t("credential_type")}
            <select name="credential_type_id">
              <option value=""></option>
              ${credentialOptions}
            </select>
          </label>
          <label>${t("obtained_date")}<input type="date" name="obtained_date" /></label>
          <label>${t("expiry_date")}<input type="date" name="expiry_date" /></label>
          <label>${t("proof_url")}<input type="url" name="proof_url" /></label>
          <label>${t("notes")}<textarea name="notes"></textarea></label>
        </div>
        <div class="button-row">
          <button class="secondary" ${state.loading ? "disabled" : ""}>${t("add_credential")}</button>
        </div>
      </form>
    </article>
  `
}

function bindEvents() {
  const sendOtpBtn = document.getElementById("send-otp")
  if (sendOtpBtn) sendOtpBtn.addEventListener("click", handleSendOtp)

  const verifyForm = document.getElementById("verify-otp-form")
  if (verifyForm) verifyForm.addEventListener("submit", handleVerifyOtp)

  const createPaxForm = document.getElementById("create-pax-form")
  if (createPaxForm) createPaxForm.addEventListener("submit", handleCreatePax)

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
