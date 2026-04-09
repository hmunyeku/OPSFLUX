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

function stepStatusClass(step) {
  if (step.current) return "current"
  if (step.done) return "done"
  return "todo"
}

function renderWizardNav(steps, t) {
  return `
    <nav class="wizard-nav panel pad" aria-label="${escapeHtml(t("wizard_title"))}">
      <div class="wizard-nav-head">
        <div class="eyebrow eyebrow-dark">${t("wizard_title")}</div>
        <h2>${t("wizard_subtitle")}</h2>
      </div>
      <div class="wizard-list">
        ${steps.map((step, index) => `
          <a href="#${step.id}" class="wizard-link ${stepStatusClass(step)}">
            <span class="wizard-index">${index + 1}</span>
            <span class="wizard-copy">
              <strong>${escapeHtml(step.title)}</strong>
              <small>${escapeHtml(step.description)}</small>
            </span>
          </a>
        `).join("")}
      </div>
    </nav>
  `
}

function renderLockedStep(message) {
  return `<div class="step-locked"><div class="message warn">${escapeHtml(message)}</div></div>`
}

function renderStepFooter(nextId, label) {
  if (!nextId) return ""
  return `<div class="step-footer"><a class="primary step-next-link" href="#${nextId}">${escapeHtml(label)}</a></div>`
}

export function renderTrackingPage({ state, t, lang }) {
  const tracking = state.publicTracking
  const voyageTracking = state.publicVoyageTracking
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
                <input name="tracking_code" value="${escapeHtml(state.trackingCode || "")}" placeholder="TW-CARGO-2026-00421" autocomplete="off" spellcheck="false" />
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
          <div class="card"><div class="card-label">${t("status")}</div><div class="card-value" style="font-size:18px">${escapeHtml(tracking.status_label || tracking.status || t("cargo_tracking_unknown"))}</div></div>
          <div class="card"><div class="card-label">${t("cargo_tracking_destination")}</div><div class="card-value" style="font-size:18px">${escapeHtml(tracking.destination_name || t("cargo_tracking_unknown"))}</div></div>
          <div class="card"><div class="card-label">${t("cargo_tracking_voyage")}</div><div class="card-value" style="font-size:18px">${escapeHtml(tracking.voyage_code || t("cargo_tracking_no_voyage"))}</div></div>
          <div class="card"><div class="card-label">${t("cargo_tracking_dimensions")}</div><div class="card-value" style="font-size:18px">${escapeHtml(dimensions)}</div></div>
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
            <ol class="tracking-list">${renderTrackingTimeline(tracking.events, t, lang)}</ol>
          </div>
        </section>
      ` : ""}
      ${voyageTracking ? `
        <section class="grid cards" style="margin-top:18px">
          <div class="card"><div class="card-label">${t("cargo_tracking_voyage")}</div><div class="card-value" style="font-size:18px">${escapeHtml(voyageTracking.voyage_code || t("cargo_tracking_unknown"))}</div></div>
          <div class="card"><div class="card-label">${t("status")}</div><div class="card-value" style="font-size:18px">${escapeHtml(voyageTracking.voyage_status_label || voyageTracking.voyage_status || t("cargo_tracking_unknown"))}</div></div>
          <div class="card"><div class="card-label">${t("dates")}</div><div class="card-value" style="font-size:18px">${escapeHtml(`${formatDateTime(voyageTracking.scheduled_departure, lang) || t("cargo_tracking_unknown")} → ${formatDateTime(voyageTracking.scheduled_arrival, lang) || t("cargo_tracking_unknown")}`)}</div></div>
          <div class="card"><div class="card-label">${t("cargo_tracking_shipments")}</div><div class="card-value" style="font-size:18px">${escapeHtml(String(voyageTracking.cargo_count || 0))}</div></div>
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
    actionButton = `<div style="margin-top:8px"><button type="button" class="secondary required-action-btn" data-contact-id="${escapeHtml(contactId)}" data-action-kind="identity" data-field="${escapeHtml(item?.field || "")}">${t("complete_now")}</button></div>`
  } else if (item?.kind === "credential" && item?.status !== "pending_validation") {
    actionButton = `<div style="margin-top:8px"><button type="button" class="secondary required-action-btn" data-contact-id="${escapeHtml(contactId)}" data-action-kind="credential" data-credential-code="${escapeHtml(item?.credential_type_code || item?.field || "")}">${t("add_credential_now")}</button></div>`
  }
  return `${escapeHtml(label)}${escapeHtml(status)}${escapeHtml(layer)}${item?.message ? ` · ${escapeHtml(item.message)}` : ""}<br/><span class="muted">${escapeHtml(guidance)}</span>${actionButton}`
}

function renderPaxFields(prefix, values, t, jobPositions) {
  const field = (name, label, type = "text", required = false) => `<label>${label}<input type="${type}" name="${prefix}${name}" value="${escapeHtml(values[name] || "")}" ${required ? "required" : ""} /></label>`
  const selectedJobPositionId = values.job_position_id || ""
  const jobPositionOptions = [`<option value="">${escapeHtml(t("position"))}</option>`, ...jobPositions.map((item) => `<option value="${item.id}" ${String(item.id) === String(selectedJobPositionId) ? "selected" : ""}>${escapeHtml(item.name)}${item.code ? ` (${escapeHtml(item.code)})` : ""}</option>`)].join("")
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

function renderCreatePaxMatches(state, t) {
  if (state.createPaxMatchesLoading) {
    return `<div class="message subtle">${t("searching_existing_pax")}</div>`
  }
  if (!Array.isArray(state.createPaxMatches) || state.createPaxMatches.length === 0) return ""
  return `
    <div class="match-suggestions">
      <div class="match-suggestions-head">
        <strong>${t("duplicate_candidates")}</strong>
        <span>${t("duplicate_candidates_hint")}</span>
      </div>
      <div class="match-suggestions-list">
        ${state.createPaxMatches.map((match) => `
          <button type="button" class="match-card attach-existing-pax" data-contact-id="${match.contact_id}" ${state.loading ? "disabled" : ""}>
            <span class="match-card-main">
              <strong>${escapeHtml(`${match.first_name} ${match.last_name}`)}</strong>
              <small>${escapeHtml(match.job_position_name || match.position || "—")}</small>
            </span>
            <span class="match-card-meta">
              <span>${t("match_score")}: ${escapeHtml(String(match.match_score))}</span>
              <span>${escapeHtml((match.match_reasons || []).join(", ") || "—")}</span>
            </span>
          </button>
        `).join("")}
      </div>
    </div>
  `
}

function renderSecurityStep(link, authenticated, t, state) {
  return `
    <div class="step-grid">
      <div class="step-copy">
        <h3>${t("wizard_access_title")}</h3>
        <p>${t("wizard_access_text")}</p>
        <div class="stack">
          <div class="status-chip ${authenticated ? "success" : "warn"}">
            ${authenticated ? t("authenticated") : (link?.otp_required ? t("otp_required") : t("otp_not_required"))}
          </div>
          <div class="mini-meta">
            <div><strong>${t("remaining_uses")}</strong><span>${link?.remaining_uses ?? "—"}</span></div>
            <div><strong>${t("expires_at")}</strong><span>${escapeHtml(formatDateTime(link?.expires_at))}</span></div>
            <div><strong>${t("otp_destination")}</strong><span>${escapeHtml(link?.otp_destination_masked || "—")}</span></div>
          </div>
        </div>
      </div>
      <div class="step-panel">
        ${link?.otp_required ? `
          <div class="message warn">${t("otp_destination")}: ${link?.otp_destination_masked || "—"}</div>
          <div class="button-row">
            <button class="secondary" id="send-otp" ${state.loading ? "disabled" : ""}>${t("send_code")}</button>
          </div>
          <form id="verify-otp-form" class="stack form-panel">
            <label>${t("otp_code")}<input name="code" inputmode="numeric" maxlength="6" placeholder="123456" /></label>
            <div class="button-row">
              <button class="primary" ${state.loading ? "disabled" : ""}>${t("verify_code")}</button>
            </div>
          </form>
        ` : `<div class="message success">${t("otp_not_required")}</div>`}
      </div>
    </div>
  `
}

function renderPublicInfoStep(dossier, state, t) {
  if (!dossier) return `<p class="muted">${t("loading")}</p>`
  const ads = dossier.ads
  const linkedProjects = Array.isArray(ads.linked_projects) ? ads.linked_projects : []
  const preconfigured = dossier.preconfigured_data || {}
  const preconfiguredEntries = Object.entries(preconfigured).filter(([, value]) => value !== null && value !== "")
  return `
    <div class="stack">
      <div class="section-header">
        <div>
          <h3>${t("wizard_ads_title")}</h3>
          <p>${t("wizard_ads_text")}</p>
        </div>
        <div class="button-row">
          <button class="secondary" id="download-ticket" ${state.loading ? "disabled" : ""}>${t("download_ticket")}</button>
        </div>
      </div>
      <div class="overview-grid">
        <div class="overview-card accent">
          <div class="eyebrow eyebrow-dark">${t("dossier")}</div>
          <h4>${escapeHtml(ads.reference)}</h4>
          <p>${escapeHtml(ads.visit_purpose || "—")}</p>
        </div>
        <div class="overview-card"><strong>${t("company")}</strong><span>${escapeHtml(dossier.allowed_company_name || "—")}</span></div>
        <div class="overview-card"><strong>${t("site")}</strong><span>${escapeHtml(ads.site_name || "—")}</span></div>
        <div class="overview-card"><strong>${t("dates")}</strong><span>${escapeHtml(`${ads.start_date || "—"} → ${ads.end_date || "—"}`)}</span></div>
      </div>
      <div class="facts-grid">
        <div class="fact-card"><strong>${t("status")}</strong><span>${escapeHtml(ads.status || "—")}</span></div>
        <div class="fact-card"><strong>${t("category")}</strong><span>${escapeHtml(ads.visit_category || "—")}</span></div>
        <div class="fact-card"><strong>${t("outbound_transport")}</strong><span>${escapeHtml(ads.outbound_transport_mode || "—")}</span></div>
        <div class="fact-card"><strong>${t("return_transport")}</strong><span>${escapeHtml(ads.return_transport_mode || "—")}</span></div>
        <div class="fact-card"><strong>${t("outbound_departure_base")}</strong><span>${escapeHtml(ads.outbound_departure_base_name || "—")}</span></div>
        <div class="fact-card"><strong>${t("return_departure_base")}</strong><span>${escapeHtml(ads.return_departure_base_name || "—")}</span></div>
      </div>
      ${linkedProjects.length > 0 ? `<div class="info-panel"><h4>${t("linked_projects")}</h4><div class="tag-row">${linkedProjects.map((item) => `<span class="tag">${escapeHtml(item.project_name || item.project_id || "—")}</span>`).join("")}</div></div>` : ""}
      ${preconfiguredEntries.length > 0 ? `<div class="info-panel"><h4>${t("preconfigured")}</h4><div class="tag-row">${preconfiguredEntries.map(([key, value]) => `<span class="tag">${escapeHtml(key)}: ${escapeHtml(Array.isArray(value) ? value.join(", ") : String(value))}</span>`).join("")}</div></div>` : ""}
      ${ads.rejection_reason ? `<div class="message warn"><strong>${t("correction_reason")}</strong><br/>${escapeHtml(ads.rejection_reason)}</div>` : ""}
      ${renderStepFooter("step-team", t("continue_to_team"))}
    </div>
  `
}

function renderCollaboratorStep(dossier, authenticated, state, t) {
  if (!authenticated) return renderLockedStep(t("wizard_locked_access"))
  if (!dossier) return `<p class="muted">${t("loading")}</p>`
  const pax = dossier.pax || []
  return `
    <div class="stack">
      <div class="section-header">
        <div>
          <h3>${t("wizard_team_title")}</h3>
          <p>${t("wizard_team_text")}</p>
        </div>
        <div class="summary-pills compact">
          <div class="summary-pill"><strong>${t("pax_count")}</strong><span>${escapeHtml(String(dossier?.pax_summary?.total ?? 0))}</span></div>
          <div class="summary-pill"><strong>${t("approved")}</strong><span>${escapeHtml(String(dossier?.pax_summary?.approved ?? 0))}</span></div>
        </div>
      </div>
      <form id="create-pax-form" class="step-form-card">
        <div class="step-form-head">
          <div>
            <h4>${t("add_pax")}</h4>
            <p>${t("wizard_team_helper")}</p>
          </div>
        </div>
        <div class="field-grid">${renderPaxFields("", state.createPaxDraft || {}, t, state.jobPositions)}</div>
        ${renderCreatePaxMatches(state, t)}
        <div class="button-row" style="margin-top:12px">
          <button class="primary" ${state.loading ? "disabled" : ""}>${t("add_pax")}</button>
        </div>
      </form>
      ${pax.length === 0 ? `<div class="message">${t("no_pax")}</div>` : `
        <div class="person-grid">
          ${pax.map((item) => `
            <article class="person-card">
              <div class="person-card-head">
                <div>
                  <div class="pax-name">${escapeHtml(`${item.first_name} ${item.last_name}`)}</div>
                  <div class="muted">${escapeHtml(item.job_position_name || item.position || "—")}</div>
                </div>
                <span class="status-chip ${(item.status === "blocked" ? "danger" : item.status === "pending_check" ? "warn" : "success")}">${escapeHtml(t(item.status || "pending_check"))}</span>
              </div>
              <div class="person-facts">
                <span>${t("birth_date")}: ${escapeHtml(item.birth_date || "—")}</span>
                <span>${t("badge_number")}: ${escapeHtml(item.badge_number || "—")}</span>
                <span>${t("email")}: ${escapeHtml(item.email || "—")}</span>
                <span>${t("phone")}: ${escapeHtml(item.phone || "—")}</span>
              </div>
              <a href="#pax-${item.contact_id}" class="secondary person-card-link">${t("open_compliance_dossier")}</a>
            </article>
          `).join("")}
        </div>
      `}
      ${pax.length > 0 ? renderStepFooter("step-compliance", t("continue_to_compliance")) : ""}
    </div>
  `
}

function renderSinglePaxDossier(pax, state, t) {
  const missingIdentityFields = [
    !pax.birth_date ? t("birth_date") : null,
    !pax.nationality ? t("nationality") : null,
    !pax.badge_number ? t("badge_number") : null,
  ].filter(Boolean)
  const credentialOptions = state.credentialTypes
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.code)})</option>`)
    .join("")
  const blockers = pax.compliance_blockers || []
  const requiredActions = pax.required_actions || []
  const credentials = pax.credentials || []
  const complianceOk = pax.compliance_ok && blockers.length === 0 && requiredActions.length === 0
  const statusClass = complianceOk ? "success" : blockers.length > 0 ? "danger" : "warn"
  return `
    <details class="pax-dossier" id="pax-${pax.contact_id}" ${!complianceOk ? "open" : ""}>
      <summary class="pax-dossier-summary">
        <div>
          <div class="pax-name">${escapeHtml(`${pax.first_name} ${pax.last_name}`)}</div>
          <div class="muted">${escapeHtml(pax.job_position_name || pax.position || "—")}</div>
        </div>
        <div class="pax-dossier-state">
          <span class="status-chip ${statusClass}">${complianceOk ? t("compliance_ok") : t("dossier_needs_review_short")}</span>
        </div>
      </summary>
      <div class="pax-dossier-body">
        <div class="facts-grid">
          <div class="fact-card"><strong>${t("birth_date")}</strong><span>${escapeHtml(pax.birth_date || "—")}</span></div>
          <div class="fact-card"><strong>${t("nationality")}</strong><span>${escapeHtml(pax.nationality || "—")}</span></div>
          <div class="fact-card"><strong>${t("badge_number")}</strong><span>${escapeHtml(pax.badge_number || "—")}</span></div>
          <div class="fact-card"><strong>${t("compliance")}</strong><span>${pax.compliance_ok ? t("compliance_ok") : `${t("compliance_blockers")}: ${escapeHtml(String(pax.compliance_blocker_count || 0))}`}</span></div>
        </div>
        ${requiredActions.length > 0 ? `<div class="message warn"><strong>${t("required_actions")}</strong><ul>${requiredActions.map((item) => `<li>${renderRequiredAction(item, pax.contact_id, t)}</li>`).join("")}</ul></div>` : ""}
        ${blockers.length > 0 ? `<div class="message warn"><strong>${t("compliance_issues")}</strong><ul>${blockers.map((item) => `<li>${escapeHtml(item.credential_type_name || item.credential_type_code || "—")} · ${escapeHtml(t(item.status || "—"))}${item.message ? ` · ${escapeHtml(item.message)}` : ""}</li>`).join("")}</ul></div>` : ""}
        ${missingIdentityFields.length > 0 ? `<div class="message warn"><strong>${t("identity_missing")}</strong><div>${escapeHtml(missingIdentityFields.join(", "))}</div></div>` : ""}
        <div class="compliance-grid">
          <form class="stack pax-update-form step-form-card" data-contact-id="${pax.contact_id}">
            <div class="step-form-head"><div><h4>${t("identity_and_logistics")}</h4><p>${t("identity_and_logistics_text")}</p></div></div>
            <div class="field-grid">${renderPaxFields("", pax, t, state.jobPositions)}</div>
            <div class="button-row"><button class="secondary" ${state.loading ? "disabled" : ""}>${t("save_changes")}</button></div>
          </form>
          <form class="stack credential-form step-form-card" data-contact-id="${pax.contact_id}">
            <div class="step-form-head"><div><h4>${t("credentials")}</h4><p>${t("credentials_step_text")}</p></div></div>
            <div class="field-grid">
              <label>${t("credential_type")}<select name="credential_type_id" required><option value=""></option>${credentialOptions}</select></label>
              <label>${t("obtained_date")}<input type="date" name="obtained_date" required /></label>
              <label>${t("expiry_date")}<input type="date" name="expiry_date" /></label>
              <label>${t("proof_url")}<input type="url" name="proof_url" /></label>
              <label>${t("notes")}<textarea name="notes"></textarea></label>
            </div>
            <div class="button-row"><button class="secondary" ${state.loading ? "disabled" : ""}>${t("add_credential")}</button></div>
            <div class="info-panel">
              <h4>${t("current_credentials")}</h4>
              ${credentials.length > 0 ? `<ul>${credentials.map((item) => `<li>${escapeHtml(item.credential_type_name || item.credential_type_code || "—")} · ${escapeHtml(t(item.status || "—"))}${item.expiry_date ? ` · ${escapeHtml(item.expiry_date)}` : ""}</li>`).join("")}</ul>` : `<div>${t("no_credentials")}</div>`}
            </div>
          </form>
        </div>
      </div>
    </details>
  `
}

function renderComplianceStep(dossier, authenticated, state, t) {
  if (!authenticated) return renderLockedStep(t("wizard_locked_access"))
  if (!dossier) return `<p class="muted">${t("loading")}</p>`
  const pax = dossier.pax || []
  if (pax.length === 0) return renderLockedStep(t("wizard_locked_team"))
  return `
    <div class="stack">
      <div class="section-header">
        <div>
          <h3>${t("wizard_compliance_title")}</h3>
          <p>${t("wizard_compliance_text")}</p>
        </div>
        <div class="summary-pills compact">
          <div class="summary-pill"><strong>${t("pending_check")}</strong><span>${escapeHtml(String(dossier?.pax_summary?.pending_check ?? 0))}</span></div>
          <div class="summary-pill"><strong>${t("blocked")}</strong><span>${escapeHtml(String(dossier?.pax_summary?.blocked ?? 0))}</span></div>
        </div>
      </div>
      ${pax.map((item) => renderSinglePaxDossier(item, state, t)).join("")}
      ${renderStepFooter("step-finalize", t("continue_to_finalize"))}
    </div>
  `
}

function renderFinalStep(dossier, authenticated, state, t) {
  if (!authenticated) return renderLockedStep(t("wizard_locked_access"))
  if (!dossier) return `<p class="muted">${t("loading")}</p>`
  if ((dossier?.pax_summary?.total ?? 0) <= 0) return renderLockedStep(t("wizard_locked_team"))
  const ads = dossier.ads
  const blockers = Array.isArray(dossier?.submission_blockers) ? dossier.submission_blockers : []
  const readyForSubmission = Boolean(dossier?.ready_for_submission)
  const outboundBaseOptions = [`<option value="">${escapeHtml(t("not_defined"))}</option>`, ...state.departureBases.map((item) => `<option value="${item.id}" ${String(item.id) === String(ads.outbound_departure_base_id || "") ? "selected" : ""}>${escapeHtml(item.code ? `${item.code} — ${item.name}` : item.name)}</option>`)].join("")
  const returnBaseOptions = [`<option value="">${escapeHtml(t("not_defined"))}</option>`, ...state.departureBases.map((item) => `<option value="${item.id}" ${String(item.id) === String(ads.return_departure_base_id || "") ? "selected" : ""}>${escapeHtml(item.code ? `${item.code} — ${item.name}` : item.name)}</option>`)].join("")
  return `
    <div class="stack">
      <div class="section-header"><div><h3>${t("wizard_finalize_title")}</h3><p>${t("wizard_finalize_text")}</p></div></div>
      <div class="review-banner ${readyForSubmission ? "success" : "warn"}">
        <strong>${t("review_summary")}</strong><br/>
        ${readyForSubmission ? t("dossier_ready") : t("dossier_needs_review")}
      </div>
      ${!readyForSubmission && blockers.length > 0 ? `<div class="message warn"><strong>${t("submission_blockers_title")}</strong><ul>${blockers.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><p class="muted" style="margin-top:10px">${t("submission_blockers_hint")}</p></div>` : ""}
      ${readyForSubmission ? `<div class="message success">${t("wizard_finalize_ready")}</div>` : `<div class="message warn">${t("wizard_finalize_blocked")}</div>`}
      <form id="transport-preferences-form" class="step-form-card">
        <div class="step-form-head"><div><h4>${t("transport_preferences")}</h4><p>${t("transport_preferences_text")}</p></div></div>
        <div class="field-grid">
          <label>${t("outbound_departure_base")}<select name="outbound_departure_base_id">${outboundBaseOptions}</select></label>
          <label>${t("return_departure_base")}<select name="return_departure_base_id">${returnBaseOptions}</select></label>
          <label>${t("outbound_notes")}<textarea name="outbound_notes">${escapeHtml(ads.outbound_notes || "")}</textarea></label>
          <label>${t("return_notes")}<textarea name="return_notes">${escapeHtml(ads.return_notes || "")}</textarea></label>
        </div>
        <div class="button-row"><button class="secondary" ${state.loading ? "disabled" : ""}>${t("save_transport_preferences")}</button></div>
      </form>
      ${dossier.can_resubmit ? `<form id="resubmit-form" class="message warn stack"><label>${t("resubmit_reason")}<textarea name="reason"></textarea></label><div class="button-row"><button class="warning" ${state.loading ? "disabled" : ""}>${t("resubmit")}</button></div></form>` : ""}
      <div class="final-actions">
        <button class="secondary" id="download-ticket" ${state.loading ? "disabled" : ""}>${t("download_ticket")}</button>
        ${dossier.can_submit ? `<button class="primary" id="submit-dossier" ${state.loading ? "disabled" : ""}>${t("submit")}</button>` : ""}
      </div>
    </div>
  `
}

function buildSteps({ authenticated, dossier, t }) {
  const totalPax = dossier?.pax_summary?.total ?? 0
  const blocked = dossier?.pax_summary?.blocked ?? 0
  const pending = dossier?.pax_summary?.pending_check ?? 0
  const accessDone = authenticated
  const publicInfoDone = authenticated && Boolean(dossier)
  const teamDone = publicInfoDone && totalPax > 0
  const complianceDone = teamDone && blocked === 0 && pending === 0
  const finalizeDone = Boolean(dossier?.can_submit || dossier?.can_resubmit)
  const steps = [
    { id: "step-access", title: t("wizard_access_title"), description: t("wizard_access_nav"), done: accessDone, current: !accessDone },
    { id: "step-ads", title: t("wizard_ads_title"), description: t("wizard_ads_nav"), done: publicInfoDone, current: accessDone && !publicInfoDone },
    { id: "step-team", title: t("wizard_team_title"), description: t("wizard_team_nav"), done: teamDone, current: publicInfoDone && !teamDone },
    { id: "step-compliance", title: t("wizard_compliance_title"), description: t("wizard_compliance_nav"), done: complianceDone, current: teamDone && !complianceDone },
    { id: "step-finalize", title: t("wizard_finalize_title"), description: t("wizard_finalize_nav"), done: finalizeDone, current: complianceDone && !finalizeDone },
  ]
  if (!steps.some((step) => step.current)) {
    const fallback = steps.find((step) => !step.done)
    if (fallback) fallback.current = true
    else steps[steps.length - 1].current = true
  }
  return steps
}

export function renderPage({ state, link, dossier, authenticated, t, lang }) {
  const steps = buildSteps({ authenticated, dossier, t })
  return `
    <div class="page">
      <section class="hero wizard-hero">
        <article class="panel hero-main">
          <div class="eyebrow">OpsFlux External AdS</div>
          <h1>${t("app_title")}</h1>
          <p>${t("app_intro")}</p>
          <div class="hero-stats">
            <div class="hero-stat"><div class="hero-stat-label">${t("pax_count")}</div><div class="hero-stat-value">${escapeHtml(String(dossier?.pax_summary?.total ?? 0))}</div></div>
            <div class="hero-stat"><div class="hero-stat-label">${t("pending_check")}</div><div class="hero-stat-value">${escapeHtml(String(dossier?.pax_summary?.pending_check ?? 0))}</div></div>
            <div class="hero-stat"><div class="hero-stat-label">${t("blocked")}</div><div class="hero-stat-value">${escapeHtml(String(dossier?.pax_summary?.blocked ?? 0))}</div></div>
          </div>
        </article>
        <aside class="panel pad top-panel">
          <section class="top-section">
            <div class="top-section-title">${t("access_state")}</div>
            <div class="status-chip ${authenticated ? "success" : "warn"}">${authenticated ? t("authenticated") : (link?.otp_required ? t("otp_required") : t("otp_not_required"))}</div>
          </section>
          <section class="top-section">
            <div class="top-section-title">${t("token_info")}</div>
            <div class="mono token-box">${escapeHtml(state.token || "—")}</div>
          </section>
          <section class="top-section">
            <div class="top-section-title">${t("expires_at")}</div>
            <div>${escapeHtml(formatDateTime(link?.expires_at, lang))}</div>
          </section>
        </aside>
      </section>
      ${state.message ? `<div class="message ${state.message.tone}">${escapeHtml(state.message.text)}</div>` : ""}
      <section class="wizard-shell">
        <div class="wizard-rail">${renderWizardNav(steps, t)}</div>
        <div class="wizard-content">
          <section class="panel pad wizard-step" id="step-access">
            <div class="step-head"><span class="step-number">1</span><div><h2>${t("wizard_access_title")}</h2><p>${t("wizard_access_text")}</p></div></div>
            ${renderSecurityStep(link, authenticated, t, state)}
          </section>
          <section class="panel pad wizard-step" id="step-ads">
            <div class="step-head"><span class="step-number">2</span><div><h2>${t("wizard_ads_title")}</h2><p>${t("wizard_ads_text")}</p></div></div>
            ${renderPublicInfoStep(dossier, state, t)}
          </section>
          <section class="panel pad wizard-step" id="step-team">
            <div class="step-head"><span class="step-number">3</span><div><h2>${t("wizard_team_title")}</h2><p>${t("wizard_team_text")}</p></div></div>
            ${renderCollaboratorStep(dossier, authenticated, state, t)}
          </section>
          <section class="panel pad wizard-step" id="step-compliance">
            <div class="step-head"><span class="step-number">4</span><div><h2>${t("wizard_compliance_title")}</h2><p>${t("wizard_compliance_text")}</p></div></div>
            ${renderComplianceStep(dossier, authenticated, state, t)}
          </section>
          <section class="panel pad wizard-step" id="step-finalize">
            <div class="step-head"><span class="step-number">5</span><div><h2>${t("wizard_finalize_title")}</h2><p>${t("wizard_finalize_text")}</p></div></div>
            ${renderFinalStep(dossier, authenticated, state, t)}
          </section>
        </div>
      </section>
    </div>
  `
}
