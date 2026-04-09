import React from 'react'
import { cn } from '../lib/utils'
import { t } from '../lib/i18n'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

interface StatusBadgeProps {
  status: string
  className?: string
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
    default:
      return 'neutral'
  }
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800',
  warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800',
  danger: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800',
  neutral: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700',
  info: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800',
}

const dotStyles: Record<BadgeVariant, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  neutral: 'bg-gray-400',
  info: 'bg-blue-500',
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = getVariant(status)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border',
        variantStyles[variant],
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', dotStyles[variant])} />
      {t(status) || status}
    </span>
  )
}

export function StatusDot({ status, className }: { status: string, className?: string }) {
  const variant = getVariant(status)
  return (
    <span className={cn('w-2 h-2 rounded-full', dotStyles[variant], className)} />
  )
}
