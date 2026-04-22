/**
 * Toast notification system — built on @radix-ui/react-toast.
 *
 * Features:
 *  - Variants: default, success, error, warning
 *  - Configurable position (admin + user override): top-left/center/right, bottom-left/center/right
 *  - Configurable auto-dismiss duration (admin default + user override)
 *  - Swipe-to-dismiss and manual close
 *  - Stacks multiple toasts with gap
 *
 * Settings resolution: user localStorage → admin entity defaults → hardcoded fallback.
 *
 * localStorage keys:
 *   opsflux:toast-position  → 'bottom-right' (default)
 *   opsflux:toast-duration  → 4000 (ms)
 *   opsflux:toast-opacity   → 100 (percent, 10-100)
 *
 * Admin sets entity-level defaults via GeneralConfigTab → /api/v1/settings.
 * At app startup, call setToastAdminDefaults() to inject admin values.
 * User can override in Preferences; clearUserOverride() reverts to admin default.
 *
 * Usage:
 *   import { useToast } from '@/components/ui/Toast'
 *   const { toast } = useToast()
 *   toast({ title: 'Succès', variant: 'success' })
 */
import { useState, useCallback, createContext, useContext, useSyncExternalStore } from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────

export type ToastVariant = 'default' | 'success' | 'error' | 'warning'

export type ToastPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

export const TOAST_POSITIONS: { value: ToastPosition; label: string }[] = [
  { value: 'top-left', label: 'Haut gauche' },
  { value: 'top-center', label: 'Haut centre' },
  { value: 'top-right', label: 'Haut droite' },
  { value: 'bottom-left', label: 'Bas gauche' },
  { value: 'bottom-center', label: 'Bas centre' },
  { value: 'bottom-right', label: 'Bas droite' },
]

interface ToastData {
  id: string
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

interface ToastContextValue {
  toast: (data: Omit<ToastData, 'id'>) => void
}

// ── Settings helpers ──────────────────────────────────────
//
// Resolution order: user localStorage → admin defaults → hardcoded fallback.
// Admin defaults are injected at app startup via setToastAdminDefaults().

const POSITION_KEY = 'opsflux:toast-position'
const DURATION_KEY = 'opsflux:toast-duration'
const OPACITY_KEY = 'opsflux:toast-opacity'
const HARDCODED_POSITION: ToastPosition = 'bottom-right'
const HARDCODED_DURATION = 4000
const HARDCODED_OPACITY = 100 // percent (0-100)

// ── Admin defaults (injected from entity settings API) ───
interface ToastAdminDefaults {
  position?: ToastPosition
  duration?: number
  opacity?: number
}

let adminDefaults: ToastAdminDefaults = {}

/** Inject admin-configured defaults (call once at app startup after fetching entity settings). */
export function setToastAdminDefaults(defaults: ToastAdminDefaults) {
  adminDefaults = defaults
  window.dispatchEvent(new Event('toast-settings-change'))
}

/** Check whether the user has explicitly customized a given setting. */
export function hasUserOverride(key: 'position' | 'duration' | 'opacity'): boolean {
  const storageKey = key === 'position' ? POSITION_KEY : key === 'duration' ? DURATION_KEY : OPACITY_KEY
  try { return localStorage.getItem(storageKey) !== null } catch { return false }
}

/** Clear user override for a setting, falling back to admin default. */
export function clearUserOverride(key: 'position' | 'duration' | 'opacity') {
  const storageKey = key === 'position' ? POSITION_KEY : key === 'duration' ? DURATION_KEY : OPACITY_KEY
  try { localStorage.removeItem(storageKey) } catch { /* noop */ }
  window.dispatchEvent(new Event('toast-settings-change'))
}

// ── Getters: user → admin → hardcoded ────────────────────

export function getToastPosition(): ToastPosition {
  try {
    const stored = localStorage.getItem(POSITION_KEY)
    if (stored && TOAST_POSITIONS.some((p) => p.value === stored)) return stored as ToastPosition
  } catch { /* noop */ }
  return adminDefaults.position ?? HARDCODED_POSITION
}

export function setToastPosition(pos: ToastPosition) {
  localStorage.setItem(POSITION_KEY, pos)
  window.dispatchEvent(new Event('toast-settings-change'))
  void persistToastPref({ position: pos })
}

export function getToastDuration(): number {
  try {
    const stored = localStorage.getItem(DURATION_KEY)
    if (stored) {
      const n = parseInt(stored, 10)
      if (n >= 1000 && n <= 30000) return n
    }
  } catch { /* noop */ }
  return adminDefaults.duration ?? HARDCODED_DURATION
}

export function setToastDuration(ms: number) {
  const v = Math.max(1000, Math.min(30000, ms))
  localStorage.setItem(DURATION_KEY, String(v))
  window.dispatchEvent(new Event('toast-settings-change'))
  void persistToastPref({ duration: v })
}

export function getToastOpacity(): number {
  try {
    const stored = localStorage.getItem(OPACITY_KEY)
    if (stored) {
      const n = parseInt(stored, 10)
      if (n >= 10 && n <= 100) return n
    }
  } catch { /* noop */ }
  return adminDefaults.opacity ?? HARDCODED_OPACITY
}

export function setToastOpacity(percent: number) {
  const v = Math.max(10, Math.min(100, Math.round(percent)))
  localStorage.setItem(OPACITY_KEY, String(v))
  window.dispatchEvent(new Event('toast-settings-change'))
  void persistToastPref({ opacity: v })
}

// ── DB persistence — fires a background PATCH so toast prefs follow
//    the user across devices, matching the UI-scale pattern.
async function persistToastPref(partial: { position?: ToastPosition; duration?: number; opacity?: number }) {
  try {
    const api = (await import('@/lib/api')).default
    await api.patch('/api/v1/users/me/preferences', { toast: partial })
  } catch { /* localStorage remains the fallback */ }
}

export async function syncToastPrefsFromServer(): Promise<void> {
  try {
    const api = (await import('@/lib/api')).default
    const { data } = await api.get<{ toast?: { position?: ToastPosition; duration?: number; opacity?: number } }>('/api/v1/users/me/preferences')
    const t = data?.toast
    if (!t) return
    if (t.position && TOAST_POSITIONS.some((p) => p.value === t.position)) {
      localStorage.setItem(POSITION_KEY, t.position)
    }
    if (typeof t.duration === 'number' && t.duration >= 1000 && t.duration <= 30000) {
      localStorage.setItem(DURATION_KEY, String(t.duration))
    }
    if (typeof t.opacity === 'number' && t.opacity >= 10 && t.opacity <= 100) {
      localStorage.setItem(OPACITY_KEY, String(t.opacity))
    }
    window.dispatchEvent(new Event('toast-settings-change'))
  } catch { /* noop */ }
}

// Hook to reactively read toast settings
function useToastSettings() {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener('toast-settings-change', cb)
    window.addEventListener('storage', cb)
    return () => {
      window.removeEventListener('toast-settings-change', cb)
      window.removeEventListener('storage', cb)
    }
  }, [])

  const position = useSyncExternalStore<ToastPosition>(subscribe, getToastPosition, () => HARDCODED_POSITION)
  const duration = useSyncExternalStore<number>(subscribe, getToastDuration, () => HARDCODED_DURATION)
  const opacity = useSyncExternalStore<number>(subscribe, getToastOpacity, () => HARDCODED_OPACITY)

  return { position, duration, opacity }
}

// ── Context ────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// ── Variant styling ────────────────────────────────────────
// Glassy cards with a soft variant-tinted shadow. No coloured left
// strip — the leading variant icon already carries the semantic
// colour, and a separate accent bar felt gimmicky.
const variantStyles: Record<ToastVariant, string> = {
  default: 'border-border/60 bg-card/90 backdrop-blur-md text-foreground shadow-lg shadow-primary/10',
  success: 'border-green-300/70 dark:border-green-800/70 bg-green-50/90 dark:bg-green-950/80 backdrop-blur-md text-green-900 dark:text-green-200 shadow-lg shadow-green-500/15',
  error: 'border-red-300/70 dark:border-red-800/70 bg-red-50/90 dark:bg-red-950/80 backdrop-blur-md text-red-900 dark:text-red-200 shadow-lg shadow-red-500/15',
  warning: 'border-yellow-300/70 dark:border-yellow-800/70 bg-yellow-50/90 dark:bg-yellow-950/80 backdrop-blur-md text-yellow-900 dark:text-yellow-200 shadow-lg shadow-yellow-500/15',
}

const variantIcons: Record<ToastVariant, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
}

// ── Position CSS ──────────────────────────────────────────
const positionClasses: Record<ToastPosition, string> = {
  'top-left': 'fixed top-4 left-4',
  'top-center': 'fixed top-4 left-1/2 -translate-x-1/2',
  'top-right': 'fixed top-4 right-4',
  'bottom-left': 'fixed bottom-4 left-4',
  'bottom-center': 'fixed bottom-4 left-1/2 -translate-x-1/2',
  'bottom-right': 'fixed bottom-4 right-4',
}

const slideAnimations: Record<string, string> = {
  'top-left': 'data-[state=open]:slide-in-from-left-full data-[state=closed]:slide-out-to-left-full',
  'top-center': 'data-[state=open]:slide-in-from-top-full data-[state=closed]:slide-out-to-top-full',
  'top-right': 'data-[state=open]:slide-in-from-right-full data-[state=closed]:slide-out-to-right-full',
  'bottom-left': 'data-[state=open]:slide-in-from-left-full data-[state=closed]:slide-out-to-left-full',
  'bottom-center': 'data-[state=open]:slide-in-from-bottom-full data-[state=closed]:slide-out-to-bottom-full',
  'bottom-right': 'data-[state=open]:slide-in-from-right-full data-[state=closed]:slide-out-to-right-full',
}

const swipeDirections: Record<ToastPosition, 'left' | 'right' | 'up' | 'down'> = {
  'top-left': 'left',
  'top-center': 'up',
  'top-right': 'right',
  'bottom-left': 'left',
  'bottom-center': 'down',
  'bottom-right': 'right',
}

// ── Provider ───────────────────────────────────────────────
let toastCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const { position, duration, opacity } = useToastSettings()

  const toast = useCallback((data: Omit<ToastData, 'id'>) => {
    const id = `toast-${++toastCounter}`
    setToasts((prev) => [...prev, { ...data, id }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const slideAnim = slideAnimations[position] || slideAnimations['bottom-right']
  const swipeDir = swipeDirections[position] || 'right'

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection={swipeDir} duration={duration}>
        {children}

        {toasts.map((t) => {
          const Icon = variantIcons[t.variant || 'default']
          return (
            <ToastPrimitive.Root
              key={t.id}
              duration={t.duration || duration}
              onOpenChange={(open) => {
                if (!open) removeToast(t.id)
              }}
              className={cn(
                'group pointer-events-auto relative flex items-start gap-3 overflow-hidden',
                'rounded-lg border px-4 py-3 shadow-lg',
                'data-[state=open]:animate-in data-[state=closed]:animate-out',
                'data-[state=closed]:fade-out-80 data-[state=open]:fade-in-0',
                slideAnim,
                variantStyles[t.variant || 'default'],
              )}
              style={opacity < 100 ? { opacity: opacity / 100 } : undefined}
            >
              <Icon size={16} className="shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <ToastPrimitive.Title className="text-sm font-semibold">
                  {t.title}
                </ToastPrimitive.Title>
                {t.description && (
                  <ToastPrimitive.Description className="mt-0.5 text-sm opacity-80">
                    {t.description}
                  </ToastPrimitive.Description>
                )}
              </div>
              <ToastPrimitive.Close className="shrink-0 rounded-md p-0.5 opacity-50 hover:opacity-100 transition-opacity">
                <X size={14} />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          )
        })}

        <ToastPrimitive.Viewport
          className={cn(
            positionClasses[position],
            'z-[var(--z-toast)] flex flex-col gap-2 w-[380px] max-w-[calc(100vw-2rem)] outline-none',
          )}
          // Push bottom-anchored toasts above the iPhone X+ home
          // indicator. Top-anchored positions don't need this — the
          // notch is handled by status-bar translucency.
          style={position.startsWith('bottom')
            ? { paddingBottom: 'env(safe-area-inset-bottom)' }
            : undefined}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}
