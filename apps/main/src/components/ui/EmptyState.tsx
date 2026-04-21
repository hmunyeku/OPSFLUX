/**
 * EmptyState — Pajamas-inspired empty state component.
 *
 * Four semantic variants:
 *   - blank:  No content yet (default).
 *   - search: Search/filter returned nothing.
 *   - config: Feature needs configuration first.
 *   - error:  Something went wrong.
 *
 * Three sizes:
 *   - compact: For inline / panel / table use (small icon, tight spacing).
 *   - default: Standard page-level empty state.
 *   - large:   Full-page hero empty state.
 *
 * Usage:
 *   <EmptyState
 *     icon={Building2}
 *     title="Aucune entreprise"
 *     description="Créez votre première entreprise pour démarrer."
 *     action={{ label: 'Nouvelle entreprise', onClick: ... }}
 *   />
 */
import type { LucideIcon } from 'lucide-react'
import { SearchX, Settings, AlertCircle, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

type EmptyStateVariant = 'blank' | 'search' | 'config' | 'error'
type EmptyStateSize = 'compact' | 'default' | 'large'

interface EmptyStateAction {
  label: string
  onClick: () => void
  /** `premium` uses the gradient CTA (primary → highlight) — reserve it
   *  for hero empty-states where the action is the page's main purpose. */
  variant?: 'primary' | 'default' | 'premium'
}

interface EmptyStateProps {
  /** Lucide icon component — overrides the default variant icon. */
  icon?: LucideIcon
  /** Short title (5 words or fewer, no period). */
  title?: string
  /** Explanatory text — full sentence(s). */
  description?: string
  /** Primary call-to-action button. */
  action?: EmptyStateAction
  /** Secondary (text-style) action. */
  secondaryAction?: EmptyStateAction
  /** Semantic variant — determines default icon & accent color. */
  variant?: EmptyStateVariant
  /** Size preset — compact for panels, default for pages, large for hero. */
  size?: EmptyStateSize
  /** Additional CSS classes on the root container. */
  className?: string
  /** Render custom content below the description. */
  children?: React.ReactNode
}

// ── Default icons per variant ────────────────────────────────
const variantDefaults: Record<EmptyStateVariant, { icon: LucideIcon; color: string }> = {
  blank:  { icon: Inbox,       color: 'text-muted-foreground/50' },
  search: { icon: SearchX,     color: 'text-muted-foreground/50' },
  config: { icon: Settings,    color: 'text-primary/50' },
  error:  { icon: AlertCircle, color: 'text-destructive/50' },
}

// ── Size config ──────────────────────────────────────────────
const sizeConfig: Record<EmptyStateSize, {
  container: string
  iconSize: number
  iconWrapper: string
  titleClass: string
  descClass: string
  btnClass: string
}> = {
  compact: {
    container: 'py-6 px-4 gap-2',
    iconSize: 20,
    iconWrapper: 'mb-0',
    titleClass: 'text-xs font-semibold text-foreground',
    descClass: 'text-xs text-muted-foreground max-w-xs',
    btnClass: 'gl-button-sm',
  },
  default: {
    container: 'py-12 px-6 gap-3',
    iconSize: 32,
    iconWrapper: 'mb-1',
    titleClass: 'text-sm font-semibold text-foreground',
    descClass: 'text-sm text-muted-foreground max-w-sm',
    btnClass: 'gl-button-sm',
  },
  large: {
    container: 'py-20 px-8 gap-4 relative',
    iconSize: 48,
    // Glassy tinted halo backing the icon — matches the 2026 warmer
    // aesthetic. A soft primary gradient behind gives depth; the icon
    // still inherits the variant colour so the semantic stays legible.
    iconWrapper: 'mb-2 p-5 rounded-3xl bg-gradient-to-br from-primary/8 to-highlight/8 ring-1 ring-primary/10 shadow-[0_10px_40px_-15px_hsl(var(--primary)/0.25)] backdrop-blur-sm',
    titleClass: 'text-xl font-bold text-foreground font-display tracking-tight',
    descClass: 'text-base text-muted-foreground max-w-md',
    btnClass: 'gl-button-sm',
  },
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  variant = 'blank',
  size = 'default',
  className,
  children,
}: EmptyStateProps) {
  const defaults = variantDefaults[variant]
  const config = sizeConfig[size]
  const Icon = icon || defaults.icon

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center select-none',
        config.container,
        className,
      )}
      role="status"
    >
      {/* Icon */}
      <div className={cn(config.iconWrapper, defaults.color)}>
        <Icon size={config.iconSize} strokeWidth={1.5} />
      </div>

      {/* Title */}
      {title && (
        <h3 className={config.titleClass}>{title}</h3>
      )}

      {/* Description */}
      {description && (
        <p className={config.descClass}>{description}</p>
      )}

      {/* Custom children */}
      {children}

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 mt-2">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className={cn(
                config.btnClass,
                action.variant === 'premium'
                  ? 'gl-button-premium'
                  : action.variant === 'primary' || !action.variant
                    ? 'gl-button-confirm'
                    : 'gl-button-default',
              )}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className={cn(config.btnClass, 'gl-button-default')}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
