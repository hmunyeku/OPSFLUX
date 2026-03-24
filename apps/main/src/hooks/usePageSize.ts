/**
 * usePageSize — shared hook for DataTable page size preference.
 *
 * Resolution order:
 *   1. User preference:   user scope, key "datatable.page_size"
 *   2. Entity default:    entity scope, key "datatable.page_size"
 *   3. Hardcoded fallback: 25
 *
 * setPageSize persists the value to user-scope settings via PUT /api/v1/settings?scope=user
 * and updates the React Query cache immediately for optimistic UX.
 *
 * Both user and entity settings are cached with a long staleTime so repeated
 * hook calls across pages don't cause extra network requests.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { SettingRead } from '@/types/api'

const SETTING_KEY = 'datatable.page_size'
const MAX_PAGE_SIZE_KEY = 'datatable.max_page_size'
const DEFAULT_PAGE_SIZE = 25
const DEFAULT_MAX_PAGE_SIZE = 500
const STALE_TIME = 5 * 60_000 // 5 minutes

/** Fetch a single setting value from a given scope. */
async function fetchSettingValue(scope: string, key: string): Promise<number | null> {
  try {
    const { data } = await api.get<SettingRead[]>('/api/v1/settings', { params: { scope } })
    const setting = data.find((s) => s.key === key)
    if (!setting) return null
    const raw = setting.value?.v ?? setting.value
    const num = Number(raw)
    return Number.isFinite(num) && num > 0 ? num : null
  } catch {
    return null
  }
}

/** Save a setting value to a given scope. */
async function saveSettingValue(scope: string, key: string, value: number): Promise<void> {
  await api.put('/api/v1/settings', { key, value: { v: value } }, { params: { scope } })
}

export function usePageSize() {
  const qc = useQueryClient()

  // ── Fetch user-level preference ──
  const { data: userPageSize } = useQuery({
    queryKey: ['settings', 'user', SETTING_KEY],
    queryFn: () => fetchSettingValue('user', SETTING_KEY),
    staleTime: STALE_TIME,
  })

  // ── Fetch entity-level default ──
  const { data: entityPageSize } = useQuery({
    queryKey: ['settings', 'entity', SETTING_KEY],
    queryFn: () => fetchSettingValue('entity', SETTING_KEY),
    staleTime: STALE_TIME,
  })

  // ── Resolve: user > entity > fallback ──
  const pageSize = userPageSize ?? entityPageSize ?? DEFAULT_PAGE_SIZE

  // ── Persist to user scope ──
  const mutation = useMutation({
    mutationFn: (newSize: number) => saveSettingValue('user', SETTING_KEY, newSize),
    onMutate: async (newSize: number) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await qc.cancelQueries({ queryKey: ['settings', 'user', SETTING_KEY] })
      const previous = qc.getQueryData<number | null>(['settings', 'user', SETTING_KEY])
      qc.setQueryData(['settings', 'user', SETTING_KEY], newSize)
      return { previous }
    },
    onError: (_err, _newSize, context) => {
      // Roll back on error
      if (context?.previous !== undefined) {
        qc.setQueryData(['settings', 'user', SETTING_KEY], context.previous)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'user', SETTING_KEY] })
    },
  })

  const setPageSize = (newSize: number) => {
    mutation.mutate(newSize)
  }

  return { pageSize, setPageSize }
}

/** Returns the admin-configured maximum page size (entity scope), or 500 as default. */
export function useMaxPageSize() {
  const { data: maxSize } = useQuery({
    queryKey: ['settings', 'entity', MAX_PAGE_SIZE_KEY],
    queryFn: () => fetchSettingValue('entity', MAX_PAGE_SIZE_KEY),
    staleTime: STALE_TIME,
  })
  return maxSize ?? DEFAULT_MAX_PAGE_SIZE
}
