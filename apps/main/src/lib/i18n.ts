/**
 * i18n configuration — DB-driven with JSON fallback.
 *
 * Priority:
 *   1. Server catalog (GET /api/v1/i18n/catalog?lang=XX&namespace=app)
 *   2. Local JSON files (bundled, always available offline)
 *
 * The server catalog is fetched once at startup and cached via ETag.
 * If the API is unreachable (offline, first load before auth), the
 * bundled JSON files are used immediately — no blank screen.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import fr from '@/locales/fr/common.json'
import en from '@/locales/en/common.json'
import { safeLocal } from '@/lib/safeStorage'

const I18N_NAMESPACE = 'app'
const I18N_HASH_KEY = 'i18n_catalog_hash'
const I18N_CACHE_KEY = 'i18n_catalog_cache'

/**
 * Flatten a nested object into dot-notation keys.
 * { nav: { dashboard: "X" } } → { "nav.dashboard": "X" }
 */
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flatten(v as Record<string, unknown>, key))
    } else {
      result[key] = String(v ?? '')
    }
  }
  return result
}

/**
 * Unflatten dot-notation keys back into nested object.
 * { "nav.dashboard": "X" } → { nav: { dashboard: "X" } }
 */
function unflatten(flat: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.')
    let current = result
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
        current[parts[i]] = {}
      }
      current = current[parts[i]] as Record<string, unknown>
    }
    current[parts[parts.length - 1]] = value
  }
  return result
}

/**
 * Try to load the server catalog. Returns flat key→value map or null on failure.
 */
async function fetchServerCatalog(lang: string): Promise<Record<string, string> | null> {
  try {
    const apiBase = import.meta.env.VITE_API_URL || ''
    const token = safeLocal.getItem('access_token')
    if (!token) return null // Not authenticated yet — use bundled

    // Normalize lang code: "fr-FR" → "fr", "en-US" → "en"
    const shortLang = lang.split('-')[0].toLowerCase()
    const savedHash = safeLocal.getItem(`${I18N_HASH_KEY}_${shortLang}`) || ''
    const url = `${apiBase}/api/v1/i18n/catalog?lang=${shortLang}&namespace=${I18N_NAMESPACE}&if_none_match=${savedHash}`

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })

    if (resp.status === 304) {
      // Cache still valid — use cached version
      const cached = safeLocal.getItem(`${I18N_CACHE_KEY}_${shortLang}`)
      return cached ? JSON.parse(cached) : null
    }

    if (!resp.ok) return null

    const data = await resp.json()
    const messages: Record<string, string> = data.messages || {}
    const hash: string = data.hash || ''

    if (Object.keys(messages).length > 0) {
      safeLocal.setItem(`${I18N_HASH_KEY}_${shortLang}`, hash)
      safeLocal.setItem(`${I18N_CACHE_KEY}_${shortLang}`, JSON.stringify(messages))
      return messages
    }
    return null
  } catch {
    // Network error, timeout, etc. — use bundled
    return null
  }
}

/**
 * Merge server catalog (flat) over bundled translations (nested).
 * Server values win; bundled fills gaps.
 */
function mergeTranslations(
  bundled: Record<string, unknown>,
  serverFlat: Record<string, string> | null,
): Record<string, unknown> {
  if (!serverFlat || Object.keys(serverFlat).length === 0) return bundled

  // Flatten bundled, merge server on top, unflatten
  const bundledFlat = flatten(bundled)
  const merged = { ...bundledFlat, ...serverFlat }
  return unflatten(merged)
}

// ── Init with bundled translations (instant, no async) ──────────

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    fallbackLng: 'fr',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'language',
    },
  })

// ── Async: overlay server catalog when available ─────────────────

export async function loadServerTranslations(): Promise<void> {
  const lang = i18n.language || 'fr'
  const serverCatalog = await fetchServerCatalog(lang)
  if (serverCatalog && Object.keys(serverCatalog).length > 0) {
    const bundled = lang === 'fr' ? fr : en
    const merged = mergeTranslations(bundled as Record<string, unknown>, serverCatalog)
    i18n.addResourceBundle(lang, 'translation', merged, true, true)
  }
}

// Fire-and-forget at module load — doesn't block rendering
loadServerTranslations().catch(() => {})

// Re-load when language changes
i18n.on('languageChanged', (lang) => {
  fetchServerCatalog(lang).then((catalog) => {
    if (catalog && Object.keys(catalog).length > 0) {
      const bundled = lang === 'fr' ? fr : (lang === 'en' ? en : {})
      const merged = mergeTranslations(bundled as Record<string, unknown>, catalog)
      i18n.addResourceBundle(lang, 'translation', merged, true, true)
    }
  }).catch(() => {})
})

// Re-load after login (token becomes available)
export function reloadTranslationsAfterAuth(): void {
  loadServerTranslations().catch(() => {})
}

// ─── Locale-aware formatting helpers ────────────────────────────────────────
//
// Always use these instead of hardcoded `toLocaleDateString('fr-FR')`. The
// locale follows i18n.language so the same call works correctly in FR, EN,
// ES, etc. — no user-visible dates break when we flip languages.

function currentLocale(): string {
  // i18n.language can be 'fr', 'fr-FR', etc. Intl accepts both.
  return i18n.language || i18n.options.lng as string || 'fr'
}

/** Format an ISO/Date as a short localised date. Returns '' for null/undefined/invalid. */
export function formatDate(
  value: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' },
): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(currentLocale(), opts)
}

/** Format an ISO/Date as a short date + time. */
export function formatDateTime(
  value: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  },
): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(currentLocale(), opts)
}

/** Format a number with the current locale's grouping/decimal conventions. */
export function formatNumber(value: number | null | undefined, opts?: Intl.NumberFormatOptions): string {
  if (value == null || Number.isNaN(value)) return ''
  return new Intl.NumberFormat(currentLocale(), opts).format(value)
}

export default i18n
