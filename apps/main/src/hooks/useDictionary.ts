import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

export interface DictionaryEntry {
  id: string
  category: string
  code: string
  label: string
  sort_order: number
  active: boolean
  metadata_json?: Record<string, unknown> | null
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

/**
 * Returns dictionary entries as {value, label} options for select fields.
 */
export function useDictionaryOptions(category: string) {
  const { data } = useDictionary(category)
  return (data ?? []).map((e) => ({ value: e.code, label: e.label }))
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
export function useDictionaryColumnOptions(category: string, column: string) {
  const { data } = useDictionary(category)
  return (data ?? []).map((e) => ({
    value: e.code,
    label: (e.metadata_json?.[column] as string) ?? e.label,
  }))
}
