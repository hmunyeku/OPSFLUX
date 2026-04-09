import React from 'react'
import { cn } from '../lib/utils'
import { t } from '../lib/i18n'
import { CheckCircle2, Clock, AlertTriangle, XCircle, Info, MinusCircle } from 'lucide-react'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

interface StatusBadgeProps {
  status: string
  className?: string
  size?: 'sm' | 'md'
}

function getVariant(status: string): BadgeVariant {
  switch (status) {
    case 'compliant':
    case 'compliance_ok':
    case 'approved':
      return 'success'
    case 'pending_check':
    case 'pending_validation':
    case 'expired':
    case 'missing':
      return 'warning'
    case 'blocked':
      return 'danger'
    case 'submitted':
    case 'in_progress':
      return 'info'
    default:
      return 'neutral'
  }
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-slate-50 text-slate-600 border-slate-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
}

const iconMap: Record<BadgeVariant, React.ElementType> = {
  success: CheckCircle2,
  warning: Clock,
  danger: XCircle,
  neutral: MinusCircle,
  info: Info,
}

const pulseStyles: Record<BadgeVariant, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  neutral: 'bg-slate-400',
  info: 'bg-blue-500',
}

export default function StatusBadge({ status, className, size = 'sm' }: StatusBadgeProps) {
  const variant = getVariant(status)
  const Icon = iconMap[variant]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide uppercase',
        size === 'sm' ? 'px-2.5 py-0.5 text-[10px]' : 'px-3 py-1 text-[11px]',
        variantStyles[variant],
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {t(status) || status}
    </span>
  )
}

export function StatusDot({ status, className, pulse = false }: { status: string; className?: string; pulse?: boolean }) {
  const variant = getVariant(status)
  return (
    <span className="relative inline-flex">
      <span className={cn('w-2 h-2 rounded-full', pulseStyles[variant], className)} />
      {pulse && (
        <span className={cn('absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-40', pulseStyles[variant])} />
      )}
    </span>
  )
}
