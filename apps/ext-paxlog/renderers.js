import { escapeHtml, formatDateTime } from "./ui.js"

function renderTrackingTimeline(events, t, lang) {
  if (!Array.isArray(events) || events.length === 0) {
    return `<li class="tracking-empty">${escapeHtml(t("cargo_tracking_no_history"))}</li>`
  }
  return events.map((event) => `
    <li class="tracking-item">
      <span class="tracking-item-marker"></span>
      <div class="tracking-item-content">
        <div class="tracking-item-head">
          <strong>${escapeHtml(event.label || event.status_label || t("cargo_tracking_updated"))}</strong>
          <span>${escapeHtml(formatDateTime(event.timestamp, lang) || t("cargo_tracking_unknown"))}</span>
        </div>
        <p>${escapeHtml(event.note || event.status_label || t("cargo_tracking_updated"))}</p>
      </div>
    </li>
  `).join("")
}

export function renderTrackingPage({ state, t, lang }) {
  const tracking = state.publicTracking
  const dimensions = tracking && [tracking.length_cm, tracking.width_cm, tracking.height_cm].every((value) => typeof value === "number")
    ? `${tracking.length_cm} × ${tracking.width_cm} × ${tracking.height_cm} cm`
    : t("cargo_tracking_dimensions_unknown")
  const weight = typeof tracking?.weight_kg === "number" ? `${tracking.weight_kg.toFixed(1)} kg` : t("cargo_tracking_unknown")
  return `
    <div class="page">
      <section class="hero tracking-hero">
        <article class="panel hero-main">
          <div class="eyebrow">OpsFlux Public Tracking</div>
          <h1>${t("cargo_tracking_title")}</h1>
          <p>${t("cargo_tracking_intro")}</p>
        </article>
        <aside class="panel pad top-panel">
          <section class="top-section">
            <div class="top-section-title">${t("cargo_tracking_code")}</div>
            <form id="tracking-form" class="stack">
              <label>
                <input
                  name="tracking_code"
                  value="${escapeHtml(state.trackingCode || "")}"
                  placeholder="TW-CARGO-2026-00421"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>
              <div class="button-row">
                <button class="primary" ${state.loading ? "disabled" : ""}>${t("cargo_tracking_search")}</button>
              </div>
            </form>
            <div class="muted">${escapeHtml(t("cargo_tracking_hint"))}</div>
          </section>
        </aside>
      </section>

      ${state.message ? `<div class="message ${state.message.tone}">${escapeHtml(state.message.text)}</div>` : ""}

      ${tracking ? `
        <section class="grid cards" style="margin-top:18px">
          <div class="card">
            <div class="card-label">${t("status")}</div>
            <div class="card-value" style="font-size:18px">${escapeHtml(tracking.status_label || tracking.status || t("cargo_tracking_unknown"))}</div>
          </div>
          <div class="card">
            <div class="card-label">${t("cargo_tracking_destination")}</div>
            <div class="card-value" style="font-size:18px">${escapeHtml(tracking.destination_name || t("cargo_tracking_unknown"))}</div>
          </div>
          <div class="card">
            <div class="card-label">${t("cargo_tracking_voyage")}</div>
            <div class="card-value" style="font-size:18px">${escapeHtml(tracking.voyage_code || t("cargo_tracking_no_voyage"))}</div>
          </div>
          <div class="card">
            <div class="card-label">${t("cargo_tracking_dimensions")}</div>
            <div class="card-value" style="font-size:18px">${escapeHtml(dimensions)}</div>
          </div>
        </section>

        <section class="grid two" style="margin-top:18px">
          <div class="panel pad">
            <h2 class="section-title">${t("cargo_tracking_summary")}</h2>
            <div class="meta-list">
              <div class="meta-item"><strong>${t("cargo_tracking_code")}</strong>${escapeHtml(tracking.tracking_code || t("cargo_tracking_unknown"))}</div>
              <div class="meta-item"><strong>${t("cargo_tracking_type")}</strong>${escapeHtml(tracking.cargo_type || t("cargo_tracking_unknown"))}</div>
              <div class="meta-item"><strong>${t("cargo_tracking_weight")}</strong>${escapeHtml(weight)}</div>
              <div class="meta-item"><strong>${t("cargo_tracking_sender")}</strong>${escapeHtml(tracking.sender_name || t("cargo_tracking_unknown"))}</div>
              <div class="meta-item"><strong>${t("cargo_tracking_receiver")}</strong>${escapeHtml(tracking.receiver_name || t("cargo_tracking_unknown"))}</div>
              <div class="meta-item"><strong>${t("cargo_tracking_updated")}</strong>${escapeHtml(formatDateTime(tracking.last_event_at, lang) || t("cargo_tracking_unknown"))}</div>
              <div class="meta-item"><strong>${t("cargo_tracking_received")}</strong>${escapeHtml(formatDateTime(tracking.received_at, lang) || t("cargo_tracking_unknown"))}</div>
            </div>
          </div>
          <div class="panel pad">
            <h2 class="section-title">${t("cargo_tracking_history")}</h2>
            <ol class="tracking-list">
              ${renderTrackingTimeline(tracking.events, t, lang)}
            </ol>
          </div>
        </section>
      ` : ""}
    </div>
  `
}

function renderRequiredAction(item, contactId, t) {
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
  return `${escapeHtml(label)}${escapeHtml(status)}${escapeHtml(layer)}${item?.message ? ` · ${escapeHtml(item.message)}` : ""}<br/><span class="muted">${escapeHtml(guidance)}</span>${actionButton}`
}

function renderPaxFields(prefix, values, t, jobPositions) {
  const field = (name, label, type = "text", required = false) => `
    <label>${label}<input type="${type}" name="${prefix}${name}" value="${escapeHtml(values[name] || "")}" ${required ? "required" : ""} /></label>
  `
  const selectedJobPositionId = values.job_position_id || ""
  const jobPositionOptions = [
    `<option value="">${escapeHtml(t("position"))}</option>`,
    ...jobPositions.map((item) => `<option value="${item.id}" ${String(item.id) === String(selectedJobPositionId) ? "selected" : ""}>${escapeHtml(item.name)}${item.code ? ` (${escapeHtml(item.code)})` : ""}</option>`),
  ].join("")
  return [
    field("first_name", t("first_name"), "text", true),
    field("last_name", t("last_name"), "text", true),
    field("birth_date", t("birth_date"), "date"),
    field("nationality", t("nationality")),
    field("badge_number", t("badge_number")),
    field("photo_url", t("photo_url"), "url"),
    field("email", t("email"), "email"),
    field("phone", t("phone")),
    `<label>${t("position")}<select name="${prefix}job_position_id">${jobPositionOptions}</select></label>`,
    `<div class="form-section-title">${escapeHtml(t("pickup_address"))}</div>`,
    field("pickup_address_line1", t("pickup_address_line1")),
    field("pickup_address_line2", t("pickup_address_line2")),
    field("pickup_city", t("pickup_city")),
    field("pickup_state_province", t("pickup_state_province")),
    field("pickup_postal_code", t("pickup_postal_code")),
    field("pickup_country", t("pickup_country")),
  ].join("")
}

function renderPaxCard(pax, state, t) {
  const missingIdentityFields = [
    !pax.birth_date ? t("birth_date") : null,
    !pax.nationality ? t("nationality") : null,
    !pax.badge_number ? t("badge_number") : null,
  ].filter(Boolean)
  const credentialOptions = state.credentialTypes
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.code)})</option>`)
    .join("")
  const paxStatus = pax.status || "pending_check"
  const paxStatusTone = paxStatus === "blocked" ? "danger" : paxStatus === "pending_check" ? "warn" : "success"
  return `
    <article class="pax-item">
      <div class="pax-stack">
      <div class="pax-head">
        <div>
          <div class="pax-name">${escapeHtml(`${pax.first_name} ${pax.last_name}`)}</div>
          <div class="pax-subhead">
            <div class="pax-role">${escapeHtml(pax.job_position_name || pax.position || "—")}</div>
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
      <div class="info-panel">
        <h4>${t("pickup_address")}</h4>
        <div class="meta-list">
          <div class="meta-item"><strong>${t("pickup_address_line1")}</strong>${escapeHtml(pax.pickup_address_line1 || "—")}</div>
          <div class="meta-item"><strong>${t("pickup_address_line2")}</strong>${escapeHtml(pax.pickup_address_line2 || "—")}</div>
          <div class="meta-item"><strong>${t("pickup_city")}</strong>${escapeHtml(pax.pickup_city || "—")}</div>
          <div class="meta-item"><strong>${t("pickup_state_province")}</strong>${escapeHtml(pax.pickup_state_province || "—")}</div>
          <div class="meta-item"><strong>${t("pickup_postal_code")}</strong>${escapeHtml(pax.pickup_postal_code || "—")}</div>
          <div class="meta-item"><strong>${t("pickup_country")}</strong>${escapeHtml(pax.pickup_country || "—")}</div>
        </div>
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
            ${(pax.required_actions || []).map((item) => `<li>${renderRequiredAction(item, pax.contact_id, t)}</li>`).join("")}
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
        <div class="field-grid">${renderPaxFields("", pax, t, state.jobPositions)}</div>
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

function renderCreatePaxMatches(state, t) {
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
                <div class="muted">${escapeHtml(match.job_position_name || match.position || "—")}</div>
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

export function renderSecurity(link, authenticated, t, state) {
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

export function renderDossierSummary(dossier, authenticated, state, t) {
  if (!dossier) {
    return `<h2 class="section-title">${t("dossier")}</h2><p class="muted">${t("loading")}</p>`
  }
  const ads = dossier.ads
  const outboundBaseOptions = [
    `<option value="">${escapeHtml(t("not_defined"))}</option>`,
    ...state.departureBases.map((item) => `<option value="${item.id}" ${String(item.id) === String(ads.outbound_departure_base_id || "") ? "selected" : ""}>${escapeHtml(item.code ? `${item.code} — ${item.name}` : item.name)}</option>`),
  ].join("")
  const returnBaseOptions = [
    `<option value="">${escapeHtml(t("not_defined"))}</option>`,
    ...state.departureBases.map((item) => `<option value="${item.id}" ${String(item.id) === String(ads.return_departure_base_id || "") ? "selected" : ""}>${escapeHtml(item.code ? `${item.code} — ${item.name}` : item.name)}</option>`),
  ].join("")
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
    <div class="meta-list" style="margin-top:14px">
      <div class="meta-item"><strong>${t("outbound_departure_base")}</strong>${escapeHtml(ads.outbound_departure_base_name || "—")}</div>
      <div class="meta-item"><strong>${t("return_departure_base")}</strong>${escapeHtml(ads.return_departure_base_name || "—")}</div>
    </div>
    <div class="review-banner ${(dossier?.pax_summary?.blocked ?? 0) > 0 || (dossier?.pax_summary?.pending_check ?? 0) > 0 ? "warn" : "success"}" style="margin-top:14px">
      <strong>${t("review_summary")}</strong><br/>
      ${((dossier?.pax_summary?.blocked ?? 0) > 0 || (dossier?.pax_summary?.pending_check ?? 0) > 0) ? t("dossier_needs_review") : t("dossier_ready")}
    </div>
    ${ads.rejection_reason ? `<div class="message warn" style="margin-top:14px"><strong>${t("correction_reason")}</strong><br/>${escapeHtml(ads.rejection_reason)}</div>` : ""}
    ${authenticated ? `
      <div class="divider"></div>
      <form id="transport-preferences-form" class="stack">
        <h3 class="section-title">${t("transport_preferences")}</h3>
        <div class="field-grid">
          <label>${t("outbound_departure_base")}
            <select name="outbound_departure_base_id">${outboundBaseOptions}</select>
          </label>
          <label>${t("return_departure_base")}
            <select name="return_departure_base_id">${returnBaseOptions}</select>
          </label>
          <label>${t("outbound_notes")}<textarea name="outbound_notes">${escapeHtml(ads.outbound_notes || "")}</textarea></label>
          <label>${t("return_notes")}<textarea name="return_notes">${escapeHtml(ads.return_notes || "")}</textarea></label>
        </div>
        <div class="button-row">
          <button class="secondary" ${state.loading ? "disabled" : ""}>${t("save_transport_preferences")}</button>
        </div>
      </form>
    ` : ""}
    <div class="divider"></div>
    <h3 class="section-title">${t("preconfigured")}</h3>
    <pre class="code-block">${escapeHtml(JSON.stringify(dossier.preconfigured_data || {}, null, 2))}</pre>
  `
}

export function renderPaxArea(dossier, authenticated, state, t) {
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
          <button class="secondary" id="download-ticket" ${!authenticated || state.loading ? "disabled" : ""}>${t("download_ticket")}</button>
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
          ${renderPaxFields("", state.createPaxDraft || {}, t, state.jobPositions)}
        </div>
        <div class="button-row" style="margin-top:12px">
          <button class="primary" ${state.loading ? "disabled" : ""}>${t("add_pax")}</button>
        </div>
      </form>

      ${renderCreatePaxMatches(state, t)}

      ${(dossier.pax || []).length === 0 ? `<div class="message">${t("no_pax")}</div>` : dossier.pax.map((pax) => renderPaxCard(pax, state, t)).join("")}
    </div>
  `
}

export function renderPage({ state, link, dossier, authenticated, t, lang }) {
  return `
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
              <div class="meta-item"><strong>${t("expires_at")}</strong>${formatDateTime(link?.expires_at, lang)}</div>
            </div>
          </section>
        </aside>
      </section>

      ${state.message ? `<div class="message ${state.message.tone}">${escapeHtml(state.message.text)}</div>` : ""}

      <section class="grid two" style="margin-top:18px">
        <div class="panel pad">
          ${renderSecurity(link, authenticated, t, state)}
        </div>
        <div class="panel pad">
          ${renderDossierSummary(dossier, authenticated, state, t)}
        </div>
      </section>

      <section style="margin-top:18px" class="panel pad">
        ${renderPaxArea(dossier, authenticated, state, t)}
      </section>
    </div>
  `
}
