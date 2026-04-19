/**
 * safeStorage — try/catch wrapper around localStorage / sessionStorage.
 *
 * In Safari private mode (and some locked-down corporate browsers), accessing
 * `window.localStorage` either throws a SecurityError or silently rejects any
 * write with QuotaExceededError. A module-level unprotected read like
 * `localStorage.getItem('auth_token')` will then crash the module *at import
 * time* — and crash the whole app before React even mounts.
 *
 * Use these helpers everywhere instead of touching localStorage directly.
 * They fall back silently to an in-memory map so the app still boots and
 * works for the session (just won't persist across tabs / reloads).
 */

type StorageKind = 'local' | 'session'

// In-memory fallback shared across helpers.
const memoryStore: Record<StorageKind, Map<string, string>> = {
  local: new Map(),
  session: new Map(),
}

function backingStore(kind: StorageKind): Storage | null {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage
    // Some browsers expose the object but throw on access; probe.
    const probeKey = '__opsflux_probe__'
    s.setItem(probeKey, '1')
    s.removeItem(probeKey)
    return s
  } catch {
    return null
  }
}

// Cache the availability check — storage usually doesn't come and go.
let _localOk: boolean | null = null
let _sessionOk: boolean | null = null
function isAvailable(kind: StorageKind): boolean {
  if (kind === 'local') {
    if (_localOk === null) _localOk = backingStore('local') !== null
    return _localOk
  }
  if (_sessionOk === null) _sessionOk = backingStore('session') !== null
  return _sessionOk
}

function get(kind: StorageKind, key: string): string | null {
  if (isAvailable(kind)) {
    try {
      return (kind === 'local' ? window.localStorage : window.sessionStorage).getItem(key)
    } catch {
      // fall through to memory
    }
  }
  return memoryStore[kind].get(key) ?? null
}

function set(kind: StorageKind, key: string, value: string): void {
  memoryStore[kind].set(key, value)
  if (isAvailable(kind)) {
    try {
      ;(kind === 'local' ? window.localStorage : window.sessionStorage).setItem(key, value)
    } catch {
      /* ignore quota / private-mode errors */
    }
  }
}

function remove(kind: StorageKind, key: string): void {
  memoryStore[kind].delete(key)
  if (isAvailable(kind)) {
    try {
      ;(kind === 'local' ? window.localStorage : window.sessionStorage).removeItem(key)
    } catch {
      /* ignore */
    }
  }
}

function clear(kind: StorageKind): void {
  memoryStore[kind].clear()
  if (isAvailable(kind)) {
    try {
      ;(kind === 'local' ? window.localStorage : window.sessionStorage).clear()
    } catch {
      /* ignore */
    }
  }
}

export const safeLocal = {
  getItem: (k: string) => get('local', k),
  setItem: (k: string, v: string) => set('local', k, v),
  removeItem: (k: string) => remove('local', k),
  clear: () => clear('local'),
  /** True when the browser exposes real localStorage (not in-memory fallback). */
  isPersistent: () => isAvailable('local'),
}

export const safeSession = {
  getItem: (k: string) => get('session', k),
  setItem: (k: string, v: string) => set('session', k, v),
  removeItem: (k: string) => remove('session', k),
  clear: () => clear('session'),
  isPersistent: () => isAvailable('session'),
}

/** Parse JSON from storage, returning `fallback` on miss or parse error. */
export function safeLocalJson<T>(key: string, fallback: T): T {
  const raw = safeLocal.getItem(key)
  if (raw == null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Stringify + store JSON — no-throw. */
export function safeLocalSetJson(key: string, value: unknown): void {
  try {
    safeLocal.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore serialisation errors */
  }
}
