const translations = {
  fr: {
    trackingHint: "Le suivi public n'expose que les informations operationnelles utiles.",
    loading: "Recherche de l'expedition en cours...",
    missingCode: "Saisissez un code de suivi valide.",
    loadError: "Impossible de charger cette expedition pour le moment.",
    notFound: "Aucune expedition publique ne correspond a ce code.",
    genericError: "Le suivi public est momentanement indisponible.",
    unknown: "Non renseigne",
    dimensionsUnknown: "Dimensions non renseignees",
    noVoyage: "Aucun voyage associe",
    noHistory: "Aucun evenement public disponible pour le moment.",
    updatedAt: "Mis a jour",
    received: "Reception confirmee",
  },
  en: {
    trackingHint: "Public tracking only exposes essential operational information.",
    loading: "Loading shipment details...",
    missingCode: "Enter a valid tracking code.",
    loadError: "Unable to load this shipment right now.",
    notFound: "No public shipment matches this tracking code.",
    genericError: "Public tracking is temporarily unavailable.",
    unknown: "Not provided",
    dimensionsUnknown: "Dimensions unavailable",
    noVoyage: "No linked voyage",
    noHistory: "No public event available yet.",
    updatedAt: "Updated",
    received: "Received",
  },
}

const locale = document.documentElement.lang?.startsWith("en") ? "en" : "fr"
const t = translations[locale]

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

function formatDate(value) {
  if (!value) {
    return t.unknown
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function formatWeight(weight) {
  return typeof weight === "number" ? `${weight.toFixed(1)} kg` : t.unknown
}

function formatDimensions(data) {
  const values = [data.length_cm, data.width_cm, data.height_cm].filter(value => typeof value === "number" && value > 0)
  if (values.length !== 3) {
    return t.dimensionsUnknown
  }
  return `${data.length_cm} × ${data.width_cm} × ${data.height_cm} cm`
}

function trackingEndpoint(code) {
  return `${getApiBase()}/travelwiz/public/cargo/${encodeURIComponent(code)}`
}

function getElements() {
  return {
    form: document.getElementById("trackingForm"),
    input: document.getElementById("trackingCode"),
    hint: document.getElementById("trackingHint"),
    feedback: document.getElementById("trackingFeedback"),
    result: document.getElementById("trackingResult"),
    title: document.getElementById("trackingResultTitle"),
    statusChip: document.getElementById("trackingStatusChip"),
    code: document.getElementById("trackingCodeValue"),
    destination: document.getElementById("trackingDestinationValue"),
    voyage: document.getElementById("trackingVoyageValue"),
    dimensions: document.getElementById("trackingDimensionsValue"),
    type: document.getElementById("trackingTypeValue"),
    weight: document.getElementById("trackingWeightValue"),
    sender: document.getElementById("trackingSenderValue"),
    receiver: document.getElementById("trackingReceiverValue"),
    lastEvent: document.getElementById("trackingLastEventValue"),
    receivedAt: document.getElementById("trackingReceivedAtValue"),
    timeline: document.getElementById("trackingTimeline"),
    shell: document.getElementById("publicTracking"),
  }
}

function setFeedback(elements, message, variant = "info") {
  if (!message) {
    elements.feedback.hidden = true
    elements.feedback.textContent = ""
    elements.feedback.className = "tracking-feedback"
    return
  }
  elements.feedback.hidden = false
  elements.feedback.textContent = message
  elements.feedback.className = `tracking-feedback tracking-feedback-${variant}`
}

function renderTracking(elements, payload) {
  elements.result.hidden = false
  elements.title.textContent = payload.description || payload.tracking_code
  elements.statusChip.textContent = payload.status_label || payload.status || t.unknown
  elements.statusChip.dataset.status = payload.status || ""
  elements.code.textContent = payload.tracking_code || t.unknown
  elements.destination.textContent = payload.destination_name || t.unknown
  elements.voyage.textContent = payload.voyage_code || t.noVoyage
  elements.dimensions.textContent = formatDimensions(payload)
  elements.type.textContent = payload.cargo_type || t.unknown
  elements.weight.textContent = formatWeight(payload.weight_kg)
  elements.sender.textContent = payload.sender_name || t.unknown
  elements.receiver.textContent = payload.receiver_name || t.unknown
  elements.lastEvent.textContent = formatDate(payload.last_event_at)
  elements.receivedAt.textContent = payload.received_at ? formatDate(payload.received_at) : t.unknown

  elements.timeline.innerHTML = ""
  if (!Array.isArray(payload.events) || payload.events.length === 0) {
    const emptyItem = document.createElement("li")
    emptyItem.className = "tracking-timeline-empty"
    emptyItem.textContent = t.noHistory
    elements.timeline.appendChild(emptyItem)
    return
  }

  payload.events.forEach(event => {
    const item = document.createElement("li")
    item.className = "tracking-timeline-item"

    const marker = document.createElement("span")
    marker.className = "tracking-timeline-marker"

    const content = document.createElement("div")
    content.className = "tracking-timeline-content"

    const heading = document.createElement("div")
    heading.className = "tracking-timeline-heading"

    const title = document.createElement("strong")
    title.textContent = event.label || event.status_label || t.updatedAt

    const date = document.createElement("span")
    date.textContent = formatDate(event.timestamp)

    const meta = document.createElement("p")
    meta.textContent = event.note || event.status_label || t.updatedAt

    heading.append(title, date)
    content.append(heading, meta)
    item.append(marker, content)
    elements.timeline.appendChild(item)
  })
}

async function loadTracking(elements, code) {
  setFeedback(elements, t.loading, "info")
  elements.result.hidden = true

  try {
    const response = await fetch(trackingEndpoint(code), {
      headers: { Accept: "application/json" },
    })

    if (response.status === 404) {
      setFeedback(elements, t.notFound, "error")
      return
    }

    if (!response.ok) {
      setFeedback(elements, t.genericError, "error")
      return
    }

    const payload = await response.json()
    renderTracking(elements, payload)
    setFeedback(elements, "", "info")
    const url = new URL(window.location.href)
    url.searchParams.set("tracking", code)
    window.history.replaceState({}, "", url)
  } catch (error) {
    console.error(error)
    setFeedback(elements, t.loadError, "error")
  }
}

function setupTracking() {
  const elements = getElements()
  if (!elements.form || !elements.input) {
    return
  }

  elements.hint.textContent = t.trackingHint

  elements.form.addEventListener("submit", event => {
    event.preventDefault()
    const code = elements.input.value.trim()
    if (!code) {
      setFeedback(elements, t.missingCode, "error")
      elements.result.hidden = true
      return
    }
    loadTracking(elements, code)
  })

  const initialCode = new URL(window.location.href).searchParams.get("tracking")?.trim()
  if (initialCode) {
    elements.input.value = initialCode
    loadTracking(elements, initialCode)
    elements.shell?.scrollIntoView({ behavior: "smooth", block: "center" })
  }
}

function setupUiChrome() {
  document.getElementById("mobileMenuBtn")?.addEventListener("click", () => {
    document.getElementById("navLinks")?.classList.toggle("open")
  })

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", event => {
      event.preventDefault()
      const target = document.querySelector(anchor.getAttribute("href"))
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" })
        document.getElementById("navLinks")?.classList.remove("open")
      }
    })
  })

  document.getElementById("contactForm")?.addEventListener("submit", event => {
    event.preventDefault()
    document.getElementById("contactForm").style.display = "none"
    document.getElementById("formSuccess").style.display = "flex"
  })

  const navbar = document.getElementById("navbar")
  window.addEventListener("scroll", () => {
    navbar?.classList.toggle("scrolled", window.scrollY > 20)
  })

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = "1"
          entry.target.style.transform = "translateY(0)"
        }
      })
    },
    { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
  )

  document.querySelectorAll(".feature-card, .module-card, .security-card").forEach(element => {
    element.style.opacity = "0"
    element.style.transform = "translateY(20px)"
    element.style.transition = "opacity .5s ease, transform .5s ease"
    observer.observe(element)
  })
}

setupUiChrome()
setupTracking()
