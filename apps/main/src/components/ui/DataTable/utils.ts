/**
 * DataTable — utility helpers.
 */

// ── Avatar color palette (deterministic from name hash) ────
const AVATAR_COLORS = [
  'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600',
  'bg-rose-600', 'bg-teal-600', 'bg-indigo-600', 'bg-orange-600',
  'bg-cyan-600', 'bg-fuchsia-600', 'bg-lime-600', 'bg-sky-600',
]

export function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ── Relative time formatting ───────────────────────────────
export function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'À l\'instant'
  if (minutes < 60) return `il y a ${minutes} min`
  if (hours < 24) return `il y a ${hours}h`
  if (days < 7) return `il y a ${days}j`
  if (days < 30) return `il y a ${Math.floor(days / 7)} sem.`
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`
  return `il y a ${Math.floor(days / 365)} an(s)`
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Storage helpers — DB-backed with localStorage cache ────
//
// User customisations on DataTables (column order, visibility, widths,
// view mode) used to live in localStorage only, which meant a user who
// hid a column on Computer A saw it back on Computer B. These helpers
// now also PATCH the change to the user's preferences blob so the
// setting follows the user.
//
// Pattern:
//   - loadFromStorage stays a synchronous localStorage read (no flash).
//   - saveToStorage writes localStorage immediately AND fires a
//     background PATCH under `datatable.<key>` in prefs.
//   - syncDatatablePrefsFromServer() pulls the whole `datatable`
//     namespace at app boot and overwrites the local cache so
//     cross-device changes propagate.

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

// Debounce map per key — avoids spamming the API when the user drags
// a column-resize handle (fires on every mousemove).
const _pendingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

export function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota / privacy mode — silently fail
  }
  // Fire-and-forget DB sync (debounced 400ms per key).
  const existing = _pendingTimers.get(key)
  if (existing) clearTimeout(existing)
  _pendingTimers.set(key, setTimeout(() => {
    _pendingTimers.delete(key)
    void (async () => {
      try {
        const api = (await import('@/lib/api')).default
        await api.patch('/api/v1/users/me/preferences', {
          datatable: { [key]: value },
        })
      } catch {
        // Offline / 401 / 5xx — localStorage remains the fallback.
      }
    })()
  }, 400))
}

/**
 * Pull the canonical datatable prefs from the DB and reconcile with
 * localStorage. Called once at app boot by AppLayout so column
 * customisations made on another device propagate cleanly.
 */
export async function syncDatatablePrefsFromServer(): Promise<void> {
  try {
    const api = (await import('@/lib/api')).default
    const { data } = await api.get<{ datatable?: Record<string, unknown> }>('/api/v1/users/me/preferences')
    const dt = data?.datatable
    if (!dt || typeof dt !== 'object') return
    for (const [key, value] of Object.entries(dt)) {
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch { /* noop */ }
    }
  } catch { /* noop */ }
}
