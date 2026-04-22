/**
 * Banner — Pajamas-inspired feature discovery / announcement banner.
 *
 * Variants:
 *   - info:    Blue — informational, new features, tips.
 *   - success: Green — positive feedback, completion.
 *   - warning: Yellow — caution, degraded state.
 *   - danger:  Red — critical issue, breaking change.
 *   - promo:   Purple — upgrade, premium feature.
 *
 * Features:
 *   - Optional illustration/icon on the left.
 *   - Title + description.
 *   - Primary + secondary action buttons.
 *   - Dismissible (persists dismissal via localStorage key).
 *   - Compact inline variant for panels, or full-width for pages.
 *
 * Usage:
 *   <Banner
 *     variant="info"
 *     title="Nouvelle fonctionnalité"
 *     description="Vous pouvez maintenant épingler vos panneaux flottants."
 *     action={{ label: 'Essayer', onClick: ... }}
 *     dismissKey="banner:pin-feature"
 *   />
 */
import { useState, useCallback } from 'react'
import {
  X, Info, CheckCircle2, AlertTriangle, AlertCircle, Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type BannerVariant = 'info' | 'success' | 'warning' | 'danger' | 'promo'

interface BannerAction {
  label: string
  onClick: () => void
}

interface BannerProps {
  /** Visual variant — determines colors and default icon. */
  variant?: BannerVariant
  /** Custom icon — overrides variant default. */
  icon?: LucideIcon
  /** Banner title (bold). */
  title: string
  /** Description text. */
  description?: string
  /** Primary action button. */
  action?: BannerAction
  /** Secondary action button. */
  secondaryAction?: BannerAction
  /** localStorage key — if set, banner can be dismissed and stays hidden. */
  dismissKey?: string
  /** Callback when dismissed — alternative to dismissKey for API-backed dismissal. */
  onDismiss?: () => void
  /** Custom illustration/content on the left side. */
  illustration?: React.ReactNode
  /** Compact mode for inline/panel usage. */
  compact?: boolean
  /** Additional CSS classes. */
  className?: string
}

// ── Variant config ──────────────────────────────────────────
const variantConfig: Record<BannerVariant, {
  icon: LucideIcon
  bg: string
  border: string
  iconColor: string
  titleColor: string
  descColor: string
  btnClass: string
}> = {
  info: {
    icon: Info,
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800/50',
    iconColor: 'text-blue-600 dark:text-blue-400',
    titleColor: 'text-blue-900 dark:text-blue-100',
    descColor: 'text-blue-700 dark:text-blue-300',
    btnClass: 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600',
  },
  success: {
    icon: CheckCircle2,
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800/50',
    iconColor: 'text-green-600 dark:text-green-400',
    titleColor: 'text-green-900 dark:text-green-100',
    descColor: 'text-green-700 dark:text-green-300',
    btnClass: 'bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    border: 'border-yellow-200 dark:border-yellow-800/50',
    iconColor: 'text-yellow-600 dark:text-yellow-500',
    titleColor: 'text-yellow-900 dark:text-yellow-100',
    descColor: 'text-yellow-700 dark:text-yellow-300',
    btnClass: 'bg-yellow-600 text-white hover:bg-yellow-700',
  },
  danger: {
    icon: AlertCircle,
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800/50',
    iconColor: 'text-red-600 dark:text-red-400',
    titleColor: 'text-red-900 dark:text-red-100',
    descColor: 'text-red-700 dark:text-red-300',
    btnClass: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600',
  },
  promo: {
    icon: Sparkles,
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    border: 'border-purple-200 dark:border-purple-800/50',
    iconColor: 'text-purple-600 dark:text-purple-400',
    titleColor: 'text-purple-900 dark:text-purple-100',
    descColor: 'text-purple-700 dark:text-purple-300',
    btnClass: 'bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600',
  },
}

function isDismissed(key: string): boolean {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}

/**
 * Pull the user's dismissed-banner set from the DB and rehydrate
 * localStorage so a banner dismissed on another device stays hidden.
 * Called once at app boot.
 */
export async function syncDismissedBannersFromServer(): Promise<void> {
  try {
    const api = (await import('@/lib/api')).default
    const { data } = await api.get<{ banners_dismissed?: Record<string, boolean> }>('/api/v1/users/me/preferences')
    const bd = data?.banners_dismissed
    if (!bd || typeof bd !== 'object') return
    for (const [key, val] of Object.entries(bd)) {
      if (val) {
        try { localStorage.setItem(key, '1') } catch { /* noop */ }
      }
    }
  } catch { /* noop */ }
}

export function Banner({
  variant = 'info',
  icon,
  title,
  description,
  action,
  secondaryAction,
  dismissKey,
  onDismiss,
  illustration,
  compact = false,
  className,
}: BannerProps) {
  const [dismissed, setDismissed] = useState(() =>
    dismissKey ? isDismissed(dismissKey) : false,
  )

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    if (dismissKey) {
      try { localStorage.setItem(dismissKey, '1') } catch { /* noop */ }
      // Persist cross-device under a single prefs namespace so the
      // banner stays hidden when the user logs in from another machine.
      void (async () => {
        try {
          const api = (await import('@/lib/api')).default
          await api.patch('/api/v1/users/me/preferences', {
            banners_dismissed: { [dismissKey]: true },
          })
        } catch { /* localStorage fallback */ }
      })()
    }
    onDismiss?.()
  }, [dismissKey, onDismiss])

  const isDismissable = !!(dismissKey || onDismiss)

  if (dismissed) return null

  const config = variantConfig[variant]
  const Icon = icon || config.icon

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 rounded-lg border',
        config.bg, config.border,
        compact ? 'px-3 py-2.5' : 'px-4 py-3',
        className,
      )}
      role="alert"
    >
      {/* Illustration or icon */}
      {illustration || (
        <div className={cn('shrink-0 mt-0.5', config.iconColor)}>
          <Icon size={compact ? 16 : 18} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'font-semibold leading-tight',
          compact ? 'text-xs' : 'text-sm',
          config.titleColor,
        )}>
          {title}
        </p>
        {description && (
          <p className={cn(
            'mt-0.5 leading-relaxed',
            compact ? 'text-xs' : 'text-sm',
            config.descColor,
          )}>
            {description}
          </p>
        )}

        {/* Actions */}
        {(action || secondaryAction) && (
          <div className={cn('flex items-center gap-2', compact ? 'mt-1.5' : 'mt-2.5')}>
            {action && (
              <button
                type="button"
                onClick={action.onClick}
                className={cn(
                  'gl-button-sm rounded-md font-medium',
                  config.btnClass,
                )}
              >
                {action.label}
              </button>
            )}
            {secondaryAction && (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className={cn(
                  'gl-button-sm gl-button-default',
                  compact ? 'text-xs' : '',
                )}
              >
                {secondaryAction.label}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dismiss button */}
      {isDismissable && (
        <button
          type="button"
          onClick={handleDismiss}
          className={cn(
            'shrink-0 p-1 rounded-md transition-colors',
            'text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10',
          )}
          aria-label="Fermer"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

/** Utility: reset a dismissed banner (for testing / admin). */
export function resetBannerDismissal(key: string) {
  try { localStorage.removeItem(key) } catch { /* noop */ }
}
