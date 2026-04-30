/* ===========================================================================
   OpsFlux — Vitrine
   - Public TravelWiz tracker (live API call to api.<DOMAIN>/.../public/cargo/{code})
   - Header scroll state
   - Mobile menu toggle
   - Scroll-triggered reveal (.reveal → .is-visible)
   - Smooth scroll for in-page anchors
=========================================================================== */

// ─── i18n strings (minimal — just for the tracker) ───────────────────────
const TRANSLATIONS = {
  fr: {
    trackingHint: "Le suivi public n'expose que les informations opérationnelles utiles.",
    loading: "Recherche de l'expédition en cours…",
    missingCode: "Saisissez un code de suivi valide.",
    loadError: "Impossible de charger cette expédition pour le moment.",
    notFound: "Aucune expédition publique ne correspond à ce code.",
    genericError: "Le suivi public est momentanément indisponible.",
    unknown: "Non renseigné",
    dimensionsUnknown: "Dimensions non renseignées",
    noVoyage: "Aucun voyage associé",
    noHistory: "Aucun événement public disponible pour le moment.",
    updatedAt: "Mis à jour",
  },
  en: {
    trackingHint: "Public tracking only exposes essential operational information.",
    loading: "Loading shipment details…",
    missingCode: "Enter a valid tracking code.",
    loadError: "Unable to load this shipment right now.",
    notFound: "No public shipment matches this tracking code.",
    genericError: "Public tracking is temporarily unavailable.",
    unknown: "Not provided",
    dimensionsUnknown: "Dimensions unavailable",
    noVoyage: "No linked voyage",
    noHistory: "No public event available yet.",
    updatedAt: "Updated",
  },
}
const locale = document.documentElement.lang?.startsWith("en") ? "en" : "fr"
const t = TRANSLATIONS[locale]

// ─── Public tracker — API ─────────────────────────────────────────────────
function getApiBase() {
  const { hostname, protocol } = window.location
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:8000/api/v1"
  }
  if (hostname.startsWith("www.")) {
    return `${protocol}//api.${hostname.slice(4)}/api/v1`
  }
  if (hostname === "opsflux.io") {
    return `${protocol}//api.opsflux.io/api/v1`
  }
  return `${protocol}//api.${hostname}/api/v1`
}

const trackingEndpoint = (code) =>
  `${getApiBase()}/travelwiz/public/cargo/${encodeURIComponent(code)}`

// ─── Formatting helpers ──────────────────────────────────────────────────
function formatDate(value) {
  if (!value) return t.unknown
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function formatWeight(weight) {
  return typeof weight === "number" ? `${weight.toFixed(1)} kg` : t.unknown
}

function formatDimensions(data) {
  const values = [data.length_cm, data.width_cm, data.height_cm]
    .filter(v => typeof v === "number" && v > 0)
  if (values.length !== 3) return t.dimensionsUnknown
  return `${data.length_cm} × ${data.width_cm} × ${data.height_cm} cm`
}

// ─── Tracker rendering ───────────────────────────────────────────────────
function $(id) { return document.getElementById(id) }

function trackerEls() {
  return {
    form:        $("trackingForm"),
    input:       $("trackingCode"),
    hint:        $("trackingHint"),
    feedback:    $("trackingFeedback"),
    result:      $("trackingResult"),
    title:       $("trackingResultTitle"),
    statusChip:  $("trackingStatusChip"),
    code:        $("trackingCodeValue"),
    destination: $("trackingDestinationValue"),
    voyage:      $("trackingVoyageValue"),
    dimensions:  $("trackingDimensionsValue"),
    type:        $("trackingTypeValue"),
    weight:      $("trackingWeightValue"),
    sender:      $("trackingSenderValue"),
    receiver:    $("trackingReceiverValue"),
    lastEvent:   $("trackingLastEventValue"),
    receivedAt:  $("trackingReceivedAtValue"),
    timeline:    $("trackingTimeline"),
  }
}

function setFeedback(els, message, state) {
  if (!message) {
    els.feedback.hidden = true
    els.feedback.textContent = ""
    delete els.feedback.dataset.state
    return
  }
  els.feedback.hidden = false
  els.feedback.textContent = message
  if (state) els.feedback.dataset.state = state
  else delete els.feedback.dataset.state
}

function renderTracking(els, payload) {
  els.result.hidden = false
  els.title.textContent       = payload.description || payload.tracking_code
  els.statusChip.textContent  = payload.status_label || payload.status || t.unknown
  els.statusChip.dataset.status = payload.status || ""
  els.code.textContent        = payload.tracking_code || t.unknown
  els.destination.textContent = payload.destination_name || t.unknown
  els.voyage.textContent      = payload.voyage_code || t.noVoyage
  els.dimensions.textContent  = formatDimensions(payload)
  els.type.textContent        = payload.cargo_type || t.unknown
  els.weight.textContent      = formatWeight(payload.weight_kg)
  els.sender.textContent      = payload.sender_name || t.unknown
  els.receiver.textContent    = payload.receiver_name || t.unknown
  els.lastEvent.textContent   = formatDate(payload.last_event_at)
  els.receivedAt.textContent  = payload.received_at ? formatDate(payload.received_at) : t.unknown

  els.timeline.innerHTML = ""
  const events = Array.isArray(payload.events) ? payload.events : []

  if (events.length === 0) {
    const empty = document.createElement("li")
    empty.textContent = t.noHistory
    els.timeline.appendChild(empty)
    return
  }

  events.forEach(event => {
    const li = document.createElement("li")
    const strong = document.createElement("strong")
    strong.textContent = event.label || event.status_label || t.updatedAt
    const span = document.createElement("span")
    span.textContent = formatDate(event.timestamp)
    const note = document.createElement("p")
    note.textContent = event.note || event.status_label || ""
    note.style.marginTop = "4px"
    note.style.color = "rgba(255,255,255,.65)"
    note.style.fontSize = "13px"
    li.append(strong, span)
    if (event.note) li.append(note)
    els.timeline.appendChild(li)
  })
}

async function loadTracking(els, code) {
  setFeedback(els, t.loading, "loading")
  els.result.hidden = true

  try {
    const response = await fetch(trackingEndpoint(code), {
      headers: { Accept: "application/json" },
    })

    if (response.status === 404) {
      setFeedback(els, t.notFound)
      return
    }
    if (!response.ok) {
      setFeedback(els, t.genericError)
      return
    }

    const payload = await response.json()
    renderTracking(els, payload)
    setFeedback(els, "")

    // Persist the search in the URL — sharable link.
    const url = new URL(window.location.href)
    url.searchParams.set("tracking", code)
    window.history.replaceState({}, "", url)
  } catch (error) {
    console.error("[tracker]", error)
    setFeedback(els, t.loadError)
  }
}

function setupTracker() {
  const els = trackerEls()
  if (!els.form || !els.input) return

  els.hint.textContent = t.trackingHint

  els.form.addEventListener("submit", event => {
    event.preventDefault()
    const code = els.input.value.trim()
    if (!code) {
      setFeedback(els, t.missingCode)
      els.result.hidden = true
      return
    }
    loadTracking(els, code)
  })

  // Auto-load if ?tracking=... is present (sharable links).
  const initial = new URL(window.location.href).searchParams.get("tracking")?.trim()
  if (initial) {
    els.input.value = initial
    loadTracking(els, initial)
    setTimeout(() => {
      document.getElementById("tracker")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 100)
  }
}

// ─── Header & nav ────────────────────────────────────────────────────────
function setupHeader() {
  const header = document.getElementById("header")
  const toggle = document.getElementById("menuToggle")

  // Sticky header drop-shadow on scroll.
  let scrolled = false
  const onScroll = () => {
    const isScrolled = window.scrollY > 8
    if (isScrolled !== scrolled) {
      scrolled = isScrolled
      header?.classList.toggle("is-scrolled", scrolled)
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true })
  onScroll()

  // Mobile menu — toggles `.menu-open` on the header element. CSS handles
  // the actual show/hide of the .primary-nav at < 920px.
  toggle?.addEventListener("click", () => {
    const open = header?.classList.toggle("menu-open")
    toggle.setAttribute("aria-expanded", String(!!open))
  })

  // Close mobile menu on any nav link click.
  document.querySelectorAll(".primary-nav a, .header-actions a").forEach(a => {
    a.addEventListener("click", () => {
      header?.classList.remove("menu-open")
      toggle?.setAttribute("aria-expanded", "false")
    })
  })
}

// ─── Smooth scroll ───────────────────────────────────────────────────────
function setupSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", event => {
      const href = anchor.getAttribute("href")
      if (!href || href === "#") return
      const target = document.querySelector(href)
      if (!target) return
      event.preventDefault()
      const headerH = document.getElementById("header")?.offsetHeight ?? 64
      const top = target.getBoundingClientRect().top + window.scrollY - headerH - 8
      window.scrollTo({ top, behavior: "smooth" })
    })
  })
}

// ─── Reveal-on-scroll animations ─────────────────────────────────────────
function setupReveals() {
  const els = document.querySelectorAll(".reveal")
  if (els.length === 0) return

  // Reduced-motion users — show everything immediately.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    els.forEach(el => el.classList.add("is-visible"))
    return
  }

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible")
          observer.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.12, rootMargin: "0px 0px -60px 0px" },
  )
  els.forEach(el => observer.observe(el))
}

// ─── Footer year ─────────────────────────────────────────────────────────
function setFooterYear() {
  const el = document.getElementById("year")
  if (el) el.textContent = String(new Date().getFullYear())
}

// ─── Boot ────────────────────────────────────────────────────────────────
function boot() {
  setupHeader()
  setupSmoothScroll()
  setupReveals()
  setupTracker()
  setFooterYear()
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot)
} else {
  boot()
}
