/**
 * UI Scale management — controls the root font-size for global zoom.
 *
 * Settings resolution (3-tier, same as Toast):
 *   1. User override from localStorage (opsflux:ui-scale)
 *   2. Admin default from entity settings (opsflux:ui-scale-admin-default)
 *   3. Hardcoded fallback: 100%
 *
 * How it works:
 *   The browser default font-size is 16px (= 100%).
 *   Setting document.documentElement.style.fontSize to e.g. "112.5%"
 *   makes 1rem = 18px, effectively scaling the entire rem-based UI.
 */

const STORAGE_KEY = 'opsflux:ui-scale'
const ADMIN_DEFAULT_KEY = 'opsflux:ui-scale-admin-default'
const DEFAULT_SCALE = 100
const MIN_SCALE = 80
const MAX_SCALE = 130
const STEP = 5

/**
 * Resolve the effective UI scale value using the 3-tier pattern:
 * user localStorage > admin default > hardcoded fallback.
 */
export function getUIScale(): number {
  const userPref = localStorage.getItem(STORAGE_KEY)
  if (userPref) {
    const parsed = parseInt(userPref, 10)
    if (!isNaN(parsed) && parsed >= MIN_SCALE && parsed <= MAX_SCALE) return parsed
  }
  const adminDefault = localStorage.getItem(ADMIN_DEFAULT_KEY)
  if (adminDefault) {
    const parsed = parseInt(adminDefault, 10)
    if (!isNaN(parsed) && parsed >= MIN_SCALE && parsed <= MAX_SCALE) return parsed
  }
  return DEFAULT_SCALE
}

/**
 * Set the user's UI scale preference and apply it immediately.
 */
export function setUIScale(scale: number): void {
  localStorage.setItem(STORAGE_KEY, String(scale))
  applyUIScale(scale)
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
 */
export function resetUIScale(): void {
  localStorage.removeItem(STORAGE_KEY)
  applyUIScale(getUIScale())
}

export { MIN_SCALE, MAX_SCALE, STEP, DEFAULT_SCALE }
