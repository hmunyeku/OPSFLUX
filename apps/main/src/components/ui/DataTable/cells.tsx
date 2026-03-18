/**
 * DataTable — reusable cell renderers.
 */
import { cn } from '@/lib/utils'
import { getAvatarColor, relativeTime, formatDate } from './utils'

// ── Avatar Cell ────────────────────────────────────────────
interface AvatarCellProps {
  name: string
  subtitle?: string | null
  avatarUrl?: string | null
  size?: 'sm' | 'md'
}

export function AvatarCell({ name, subtitle, avatarUrl, size = 'sm' }: AvatarCellProps) {
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs'
  const words = name.trim().split(/\s+/)
  const initials = words.length >= 2
    ? `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase()
  const color = getAvatarColor(name)

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className={cn('rounded-full object-cover shrink-0', sizeClass)}
        />
      ) : (
        <div className={cn(
          'flex items-center justify-center rounded-full font-semibold text-white shrink-0',
          sizeClass, color,
        )}>
          {initials}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-foreground block truncate">{name}</span>
        {subtitle && (
          <span className="text-xs text-muted-foreground block truncate">{subtitle}</span>
        )}
      </div>
    </div>
  )
}

// ── Badge Cell ─────────────────────────────────────────────
interface BadgeCellProps {
  value: string
  variant?: 'success' | 'danger' | 'warning' | 'info' | 'neutral'
}

const BADGE_VARIANTS: Record<string, string> = {
  success: 'gl-badge-success',
  danger: 'gl-badge-danger',
  warning: 'gl-badge-warning',
  info: 'gl-badge-info',
  neutral: 'gl-badge-neutral',
}

export function BadgeCell({ value, variant = 'neutral' }: BadgeCellProps) {
  return <span className={cn('gl-badge', BADGE_VARIANTS[variant])}>{value}</span>
}

// ── Date Cell ──────────────────────────────────────────────
interface DateCellProps {
  value: string | null | undefined
  relative?: boolean
}

export function DateCell({ value, relative }: DateCellProps) {
  if (!value) return <span className="text-muted-foreground">—</span>
  const display = relative ? relativeTime(value) : formatDate(value)
  return (
    <span
      className="text-muted-foreground"
      title={new Date(value).toLocaleString()}
    >
      {display}
    </span>
  )
}

// ── Boolean Cell ───────────────────────────────────────────
export function BooleanCell({ value, trueLabel = 'Oui', falseLabel = 'Non' }: { value: boolean; trueLabel?: string; falseLabel?: string }) {
  return (
    <span className={cn('gl-badge', value ? 'gl-badge-success' : 'gl-badge-neutral')}>
      {value ? trueLabel : falseLabel}
    </span>
  )
}
