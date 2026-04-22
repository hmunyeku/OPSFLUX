/**
 * UI Scale management — controls the root font-size for global zoom.
 *
 * Persistence (DB-first, localStorage-cached):
 *   1. User override lives in the user preferences JSONB (`prefs.ui.scale`)
 *      served by /api/v1/users/me/preferences — this is the source of truth
 *      and survives a machine swap.
 *   2. localStorage (`opsflux:ui-scale`) is a cache so the UI doesn't flash
 *      the admin default on every reload while the API call is in flight.
 *   3. Admin default from entity settings (`opsflux:ui-scale-admin-default`)
 *      — applies when the user hasn't set their own scale.
 *   4. Hardcoded fallback: 100%.
 *
 * How it works:
 *   The browser default font-size is 16px (= 100%).
 *   Setting document.documentElement.style.fontSize to e.g. "112.5%"
 *   makes 1rem = 18px, effectively scaling the entire rem-based UI.
 */

import api from '@/lib/api'

const STORAGE_KEY = 'opsflux:ui-scale'
const ADMIN_DEFAULT_KEY = 'opsflux:ui-scale-admin-default'
const PREFS_PATH = '/api/v1/users/me/preferences'
const DEFAULT_SCALE = 100
const MIN_SCALE = 80
const MAX_SCALE = 130
const STEP = 5

function isValidScale(n: unknown): n is number {
  return typeof n === 'number' && !isNaN(n) && n >= MIN_SCALE && n <= MAX_SCALE
}

/**
 * Resolve the effective UI scale value using the 3-tier pattern:
 * user localStorage > admin default > hardcoded fallback.
 *
 * localStorage is a cache kept in sync with the DB via syncFromServer().
 */
export function getUIScale(): number {
  const userPref = localStorage.getItem(STORAGE_KEY)
  if (userPref) {
    const parsed = parseInt(userPref, 10)
    if (isValidScale(parsed)) return parsed
  }
  const adminDefault = localStorage.getItem(ADMIN_DEFAULT_KEY)
  if (adminDefault) {
    const parsed = parseInt(adminDefault, 10)
    if (isValidScale(parsed)) return parsed
  }
  return DEFAULT_SCALE
}

/**
 * Persist the user's UI scale preference. Writes localStorage immediately
 * (instant apply) then PATCHes the DB in the background so the setting
 * follows the user across machines.
 *
 * The PATCH is intentionally fire-and-forget — UI feedback is instant via
 * the local cache, and failures don't block the user. A subsequent login
 * on another device will call syncFromServer() at boot to reconcile.
 */
export function setUIScale(scale: number): void {
  localStorage.setItem(STORAGE_KEY, String(scale))
  applyUIScale(scale)
  void api.patch(PREFS_PATH, { ui: { scale } }).catch(() => {
    // Swallow — localStorage is still the single-device fallback.
  })
}

/**
 * Apply a scale value to the document root font-size.
 * 100% = browser default (16px). 125% = 20px, etc.
 */
export function applyUIScale(scale: number): void {
  document.documentElement.style.fontSize = `${scale}%`
}

/**
 * Store the admin-defined default scale (fetched from entity settings).
 * Called once at app startup from AppLayout.
 */
export function setUIScaleAdminDefault(scale: number): void {
  localStorage.setItem(ADMIN_DEFAULT_KEY, String(scale))
}

/**
 * Remove the user override, reverting to admin default or hardcoded fallback.
 * Also clears the server-side override so the next device picks up the
 * admin default cleanly.
 */
export function resetUIScale(): void {
  localStorage.removeItem(STORAGE_KEY)
  applyUIScale(getUIScale())
  // Null out server-side — PATCH `{ui: {scale: null}}` is merged so setting
  // to null effectively removes the field.
  void api.patch(PREFS_PATH, { ui: { scale: null } }).catch(() => { /* noop */ })
}

/**
 * Pull the canonical UI scale from the server and update the local cache
 * if the values diverge. Called once at app boot so a user who changed
 * their scale on Computer A picks up the same scale when they log in on
 * Computer B.
 *
 * Returns the effective scale after sync (which may be the admin default
 * if the server has no override).
 */
export async function syncUIScaleFromServer(): Promise<number> {
  try {
    const { data } = await api.get<{ ui?: { scale?: unknown } }>(PREFS_PATH)
    const serverScale = data?.ui?.scale
    if (isValidScale(serverScale)) {
      const current = localStorage.getItem(STORAGE_KEY)
      if (current !== String(serverScale)) {
        localStorage.setItem(STORAGE_KEY, String(serverScale))
      }
      applyUIScale(serverScale)
      return serverScale
    }
    // Server has no user override — apply whatever is in the local cache
    // (admin default or hardcoded fallback).
    const effective = getUIScale()
    applyUIScale(effective)
    return effective
  } catch {
    // API unavailable — fall back to local cache silently.
    const effective = getUIScale()
    applyUIScale(effective)
    return effective
  }
}

export { MIN_SCALE, MAX_SCALE, STEP, DEFAULT_SCALE }
