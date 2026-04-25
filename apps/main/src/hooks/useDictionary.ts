import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'

export interface DictionaryEntry {
  id: string
  category: string
  code: string
  label: string
  sort_order: number
  active: boolean
  metadata_json?: Record<string, unknown> | null
  translations?: Record<string, string> | null
}

/**
 * Fetch dictionary entries for a given category.
 * Returns only active entries, sorted by sort_order.
 */
export function useDictionary(category: string | null) {
  return useQuery({
    queryKey: ['dictionary', category],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (category) params.category = category
      const { data } = await api.get('/api/v1/dictionary', { params })
      return (data as DictionaryEntry[]).filter((e) => e.active).sort((a, b) => a.sort_order - b.sort_order)
    },
    enabled: !!category,
  })
}

/** Resolve the label for a dictionary entry based on current language. */
function resolveLabel(entry: DictionaryEntry, lang: string): string {
  return entry.translations?.[lang] || entry.label
}

/**
 * Returns dictionary entries as {value, label} options for select fields.
 * Uses the translation for the current language if available, falls back to main label.
 */
export function useDictionaryOptions(category: string) {
  const { i18n } = useTranslation()
  const lang = i18n.language
  const { data } = useDictionary(category)
  return (data ?? []).map((e) => ({ value: e.code, label: resolveLabel(e, lang) }))
}

/**
 * Returns dictionary entries as {value, label} options using a specific
 * metadata column as the display label. Falls back to the main label if
 * the column is missing in metadata_json.
 *
 * Example: useDictionaryColumnOptions('nationality', 'nationality')
 *   → [{value: 'FR', label: 'Française'}, ...]
 * Example: useDictionaryColumnOptions('nationality', 'country')
 *   → [{value: 'FR', label: 'France'}, ...]
 */
/**
 * Returns a Record<code, label> map for a category.
 * Merges with optional fallback to ensure values are always available
 * even if dictionary is not yet loaded.
 */
export function useDictionaryLabels(category: string, fallback: Record<string, string> = {}): Record<string, string> {
  const { i18n } = useTranslation()
  const lang = i18n.language
  const { data } = useDictionary(category)
  if (!data || data.length === 0) return fallback
  const map: Record<string, string> = { ...fallback }
  for (const e of data) {
    // Prefer the dictionary's translation for the current language. If the
    // admin hasn't translated this entry (no `translations[lang]`), keep the
    // built-in fallback rather than falling back to `entry.label` — many
    // dictionaries are seeded in English (e.g. "Draft") which would override
    // the curated FR fallback ("Brouillon"). cf E2E bug #17/#18.
    const translated = e.translations?.[lang]
    if (translated) {
      map[e.code] = translated
    } else if (!(e.code in map)) {
      map[e.code] = e.label
    }
  }
  return map
}

export function useDictionaryColumnOptions(category: string, column: string) {
  const { data } = useDictionary(category)
  return (data ?? []).map((e) => ({
    value: e.code,
    label: (e.metadata_json?.[column] as string) ?? e.label,
  }))
}
