/**
 * i18n catalog store — fetches & caches server-driven translations.
 *
 * Architecture:
 *  - The server owns all translation strings (see backend /api/v1/i18n).
 *  - On bootstrap, the mobile receives the catalog inline (hash + messages).
 *  - The catalog is persisted to AsyncStorage so offline cold-starts show
 *    the right language immediately.
 *  - A periodic refresh (or on-demand) calls GET /i18n/catalog with the
 *    `if_none_match` hash and only refetches on change (304 otherwise).
 *  - Local fallback files (fr.ts / en.ts / ...) are seed data used only
 *    when the device has never contacted the server.
 *
 * Usage:
 *   // After bootstrap:
 *   applyCatalog({ language: 'fr', hash: 'abc', messages: { ... } })
 *
 *   // Later, to refresh:
 *   await refreshCatalog('fr')
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import i18n from '../locales/i18n'
import { api } from '../services/api'

const STORAGE_KEY = '@opsflux:i18n-catalog:v1'
const NAMESPACE = 'mobile'

interface CatalogPayload {
  language: string
  namespace?: string
  hash: string
  messages: Record<string, string>
}

interface PersistedCatalog {
  [language: string]: {
    hash: string
    messages: Record<string, string>
    updatedAt: number
  }
}

interface I18nStore {
  /** Current language the app is using (may differ from user.language during transitions). */
  currentLanguage: string
  /** Hash of the currently-loaded catalog. Compared with server to skip refetch. */
  currentHash: string
  /** Has the store finished its initial hydration from AsyncStorage? */
  hydrated: boolean

  /** Apply a catalog delivered inline (typically by /mobile/bootstrap). */
  applyCatalog: (payload: CatalogPayload) => Promise<void>
  /** Actively fetch a catalog from /api/v1/i18n/catalog (uses If-None-Match). */
  refreshCatalog: (language?: string) => Promise<boolean>
  /** Switch the displayed language. Will fetch the catalog if not cached. */
  changeLanguage: (language: string) => Promise<void>
  /** Hydrate from AsyncStorage at app start. */
  hydrate: () => Promise<void>
}

export const useI18nStore = create<I18nStore>((set, get) => ({
  currentLanguage: 'fr',
  currentHash: '',
  hydrated: false,

  async applyCatalog(payload) {
    const lang = (payload.language || 'fr').toLowerCase().slice(0, 2)
    const msgs = payload.messages || {}
    const hash = payload.hash || ''

    if (Object.keys(msgs).length > 0) {
      // Replace the resource bundle for this language, preserving i18next
      // fallbacks for any key not overridden by the server.
      i18n.addResourceBundle(lang, 'translation', _inflate(msgs), true, true)
    }

    if (i18n.language !== lang) {
      await i18n.changeLanguage(lang).catch(() => {})
    }

    set({ currentLanguage: lang, currentHash: hash })

    // Persist so a cold start still shows the server-driven strings.
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      const existing: PersistedCatalog = raw ? JSON.parse(raw) : {}
      existing[lang] = { hash, messages: msgs, updatedAt: Date.now() }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
    } catch {
      /* non-fatal */
    }
  },

  async refreshCatalog(language) {
    const lang = (language ?? get().currentLanguage ?? 'fr').toLowerCase().slice(0, 2)
    try {
      const { data, status } = await api.get('/api/v1/i18n/catalog', {
        params: {
          lang,
          namespace: NAMESPACE,
          if_none_match: get().currentHash || undefined,
        },
        validateStatus: (s) => s === 200 || s === 304,
      })
      if (status === 304) return false
      await get().applyCatalog(data as CatalogPayload)
      return true
    } catch {
      return false
    }
  },

  async changeLanguage(language) {
    const lang = language.toLowerCase().slice(0, 2)
    const current = get().currentLanguage
    if (lang === current) return

    // Try to load from cache first for an instant switch
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      const existing: PersistedCatalog = raw ? JSON.parse(raw) : {}
      if (existing[lang]) {
        await get().applyCatalog({
          language: lang,
          hash: existing[lang].hash,
          messages: existing[lang].messages,
        })
      } else {
        // No cache — switch language first (fallbacks will kick in), then
        // fetch to get the real catalog.
        await i18n.changeLanguage(lang).catch(() => {})
        set({ currentLanguage: lang, currentHash: '' })
      }
    } catch {
      set({ currentLanguage: lang, currentHash: '' })
    }

    // Always re-verify against the server in the background
    get().refreshCatalog(lang).catch(() => {})
  },

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      if (raw) {
        const existing: PersistedCatalog = JSON.parse(raw)
        const lang = i18n.language || 'fr'
        const short = lang.toLowerCase().slice(0, 2)
        if (existing[short]) {
          i18n.addResourceBundle(
            short,
            'translation',
            _inflate(existing[short].messages),
            true,
            true
          )
          set({ currentLanguage: short, currentHash: existing[short].hash })
        }
      }
    } catch {
      /* ignore */
    } finally {
      set({ hydrated: true })
    }
  },
}))

/**
 * Turn a flat dot-notation dict { "a.b.c": "v" } into the nested shape
 * i18next expects: { a: { b: { c: "v" } } }. Flat lookups also work via
 * i18next's keySeparator but we inflate for consistency with the existing
 * fr.ts/en.ts files.
 */
function _inflate(flat: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.')
    let node: Record<string, any> = out
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]
      if (typeof node[p] !== 'object' || node[p] === null) {
        node[p] = {}
      }
      node = node[p]
    }
    node[parts[parts.length - 1]] = value
  }
  return out
}
