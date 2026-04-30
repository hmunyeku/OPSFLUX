/* ===========================================================================
   OpsFlux — Vitrine
   - Sticky header scroll state
   - Mobile menu toggle
   - Smooth scroll for in-page anchors
   - Scroll-triggered reveal (.reveal → .is-visible)
   - Footer year auto-injection

   Note: the public TravelWiz tracker UI was removed from the marketing
   site (it has no place on a sales landing page). The API endpoint
   `api.<DOMAIN>/api/v1/travelwiz/public/cargo/{code}` remains intact —
   another front-end (ext.<DOMAIN> or a dedicated track.<DOMAIN>) can
   consume it later.
=========================================================================== */

function setupHeader() {
  const header = document.getElementById("header")
  const toggle = document.getElementById("menuToggle")

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

  toggle?.addEventListener("click", () => {
    const open = header?.classList.toggle("menu-open")
    toggle.setAttribute("aria-expanded", String(!!open))
  })

  document.querySelectorAll(".primary-nav a, .header-actions a").forEach(a => {
    a.addEventListener("click", () => {
      header?.classList.remove("menu-open")
      toggle?.setAttribute("aria-expanded", "false")
    })
  })
}

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

function setupReveals() {
  const els = document.querySelectorAll(".reveal")
  if (els.length === 0) return

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

function setFooterYear() {
  const el = document.getElementById("year")
  if (el) el.textContent = String(new Date().getFullYear())
}

function boot() {
  setupHeader()
  setupSmoothScroll()
  setupReveals()
  setFooterYear()
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot)
} else {
  boot()
}
