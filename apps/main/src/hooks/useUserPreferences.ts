/**
 * useUserPreferences — DB-backed user preferences with localStorage cache.
 *
 * Architecture:
 * 1. On mount: load from localStorage immediately (instant render), then
 *    fetch from API in background. If API returns newer data, update both
 *    state and localStorage.
 * 2. On mutation: optimistic update to state + localStorage, then PATCH
 *    to API. If PATCH fails, the optimistic state stays (localStorage is
 *    the fallback until next successful sync).
 * 3. Each namespace (gantt, datatable, panels, theme, ...) is a top-level
 *    key in the preferences JSON. Components read/write their own namespace.
 *
 * Usage:
 *   const { prefs, setPref, loading } = useUserPreferences()
 *   const gantt = prefs.gantt as GanttSettings | undefined
 *   setPref('gantt', { ...gantt, barH: 20 })
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { safeLocal } from '@/lib/safeStorage'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

const CACHE_KEY = 'opsflux:user-preferences'
const API_PATH = '/api/v1/users/me/preferences'

type Prefs = Record<string, unknown>

function loadCache(): Prefs {
  try {
    return JSON.parse(safeLocal.getItem(CACHE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveCache(p: Prefs) {
  try {
    safeLocal.setItem(CACHE_KEY, JSON.stringify(p))
  } catch { /* quota / privacy mode */ }
}

export function useUserPreferences() {
  const qc = useQueryClient()
  const [prefs, setPrefs] = useState<Prefs>(loadCache)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Accumulate partials between debounce ticks so multiple synchronous setPref
  // calls (e.g. setPref('a', ...); setPref('b', ...); setPref('c', ...)) all
  // make it into the eventual PATCH instead of only the last one.
  const pendingPartialRef = useRef<Prefs>({})

  // Background fetch from API
  const { data: remote, isLoading } = useQuery({
    queryKey: ['user-preferences'],
    queryFn: async () => {
      const { data } = await api.get<Prefs>(API_PATH)
      return data
    },
    staleTime: 60_000,
  })

  // Merge remote into local when it arrives (remote wins on conflict)
  useEffect(() => {
    if (remote && typeof remote === 'object') {
      setPrefs(prev => {
        const merged = { ...prev, ...remote }
        saveCache(merged)
        return merged
      })
    }
  }, [remote])

  // PATCH mutation (debounced)
  const patchMut = useMutation({
    mutationFn: async (partial: Prefs) => {
      const { data } = await api.patch<Prefs>(API_PATH, partial)
      return data
    },
    onSuccess: (data) => {
      qc.setQueryData(['user-preferences'], data)
    },
  })

  // Set a single namespace
  const setPref = useCallback((namespace: string, value: unknown) => {
    const partial = { [namespace]: value }
    setPrefs(prev => {
      const next = { ...prev, ...partial }
      saveCache(next)
      return next
    })
    // Accumulate this change into the pending partial so any concurrent
    // setPref calls within the debounce window are flushed together.
    pendingPartialRef.current = { ...pendingPartialRef.current, ...partial }
    // Debounce API sync (300ms) to avoid spamming on slider drags
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const toSend = pendingPartialRef.current
      pendingPartialRef.current = {}
      if (Object.keys(toSend).length > 0) {
        patchMut.mutate(toSend)
      }
    }, 300)
  }, [patchMut])

  // Get a single namespace with type safety
  const getPref = useCallback(<T = unknown>(namespace: string, fallback: T): T => {
    const val = prefs[namespace]
    if (val === undefined || val === null) return fallback
    // Merge fallback keys with stored values so new settings get defaults
    if (typeof fallback === 'object' && !Array.isArray(fallback) && typeof val === 'object' && !Array.isArray(val)) {
      return { ...(fallback as Record<string, unknown>), ...(val as Record<string, unknown>) } as T
    }
    return val as T
  }, [prefs])

  // Replace entire prefs (for preset load)
  const setAllPrefs = useCallback((full: Prefs) => {
    setPrefs(full)
    saveCache(full)
    patchMut.mutate(full)
  }, [patchMut])

  return {
    prefs,
    getPref,
    setPref,
    setAllPrefs,
    loading: isLoading,
    syncing: patchMut.isPending,
  }
}
