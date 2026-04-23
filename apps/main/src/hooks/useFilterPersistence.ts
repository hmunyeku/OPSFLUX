/**
 * useFilterPersistence — persist filter / view state in BOTH localStorage AND
 * the backend `settings` table (scope=user).
 *
 * Why both?
 *   - localStorage gives an instant restore on mount (zero latency, works
 *     even if the API is unreachable).
 *   - The DB settings row gives cross-device sync — same filter restored
 *     when the user switches from desktop to laptop.
 *
 * Resolution order on mount:
 *   1. Read localStorage immediately → state is hydrated synchronously, the
 *      UI renders with the user's last view with no flash.
 *   2. Fetch DB value in the background. If it differs from localStorage,
 *      DB wins (DB is the cross-device source of truth) and we update both
 *      the local state AND localStorage to match.
 *
 * On change:
 *   - localStorage is written synchronously on every setValue call.
 *   - The DB write is debounced (default 500 ms) so we don't spam the API
 *     on every keystroke (e.g. while typing in a search field).
 *
 * Storage keys are namespaced under `opsflux.filters.<key>` in localStorage
 * and `<key>` in the settings table.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { safeLocal } from '@/lib/safeStorage'
import api from '@/lib/api'
import type { SettingRead } from '@/types/api'

const LS_PREFIX = 'opsflux.filters.'
const DEFAULT_DEBOUNCE_MS = 500

interface UseFilterPersistenceOptions {
  /** Debounce delay before pushing to the DB (ms). Defaults to 500. */
  debounceMs?: number
  /**
   * Set to false to skip the DB layer entirely (localStorage only). Useful
   * for purely-local UI state that doesn't need cross-device sync.
   */
  syncToDb?: boolean
}

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = safeLocal.getItem(LS_PREFIX + key)
    if (raw == null) return fallback
    const parsed = JSON.parse(raw)
    if (parsed == null) return fallback
    return parsed as T
  } catch {
    return fallback
  }
}

function writeLocalStorage<T>(key: string, value: T): void {
  try {
    safeLocal.setItem(LS_PREFIX + key, JSON.stringify(value))
  } catch {
    // Quota exceeded or storage disabled — silently ignore.
  }
}

async function fetchDbValue<T>(key: string): Promise<T | null> {
  try {
    const { data } = await api.get<SettingRead[]>('/api/v1/settings', { params: { scope: 'user' } })
    const setting = data.find((s) => s.key === key)
    if (!setting) return null
    const raw = setting.value?.v ?? setting.value
    return (raw ?? null) as T | null
  } catch {
    return null
  }
}

async function writeDbValue<T>(key: string, value: T): Promise<void> {
  try {
    await api.put('/api/v1/settings', { key, value: { v: value } }, { params: { scope: 'user' } })
  } catch {
    // Network errors / 401s shouldn't break the UI — localStorage already
    // captured the value, the worst case is we lose cross-device sync until
    // the next change.
  }
}

/**
 * Persist a filter / view state in localStorage + DB.
 *
 * @param key Stable settings key (e.g. "planner.activities.filters")
 * @param defaultValue Initial value if neither localStorage nor DB has it
 * @param options.debounceMs Debounce for DB writes (default 500)
 * @param options.syncToDb Set false to skip DB sync (default true)
 */
export function useFilterPersistence<T>(
  key: string,
  defaultValue: T,
  options: UseFilterPersistenceOptions = {},
): [T, (value: T | ((prev: T) => T)) => void] {
  const { debounceMs = DEFAULT_DEBOUNCE_MS, syncToDb = true } = options

  // Initialise from localStorage synchronously so the first render already
  // has the persisted state — no flash, no jump.
  const [value, setValueState] = useState<T>(() => readLocalStorage<T>(key, defaultValue))

  // Track whether the DB has been read at least once. Until then we don't
  // overwrite the local state with anything from the DB (avoids races).
  const dbReadDoneRef = useRef(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Background DB fetch on mount (DB wins on conflict) ──
  useEffect(() => {
    if (!syncToDb) {
      dbReadDoneRef.current = true
      return
    }
    let cancelled = false
    fetchDbValue<T>(key).then((dbValue) => {
      if (cancelled) return
      dbReadDoneRef.current = true
      if (dbValue == null) return
      // DB has a value — adopt it AND mirror to localStorage so the two
      // stay in sync. Only update local state if it actually differs.
      const currentLocal = readLocalStorage<T>(key, defaultValue)
      const dbJson = JSON.stringify(dbValue)
      if (JSON.stringify(currentLocal) !== dbJson) {
        writeLocalStorage(key, dbValue)
        setValueState(dbValue)
      }
    })
    return () => {
      cancelled = true
    }
    // We intentionally only run this on mount — `key` and `defaultValue`
    // are expected to be stable across renders for a given component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Setter: write localStorage immediately, debounce DB write ──
  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValueState((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        writeLocalStorage(key, resolved)
        if (syncToDb) {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
          debounceTimerRef.current = setTimeout(() => {
            // Only push to DB once we've confirmed what the DB had — avoids
            // a race where the user changes a filter the same instant the
            // initial DB read returns and clobbers it.
            if (dbReadDoneRef.current) {
              void writeDbValue(key, resolved)
            } else {
              // Still waiting on the initial read — try again shortly.
              setTimeout(() => {
                if (dbReadDoneRef.current) void writeDbValue(key, resolved)
              }, 200)
            }
          }, debounceMs)
        }
        return resolved
      })
    },
    [key, syncToDb, debounceMs],
  )

  // Cleanup pending debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [])

  return [value, setValue]
}
