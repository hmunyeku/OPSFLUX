import React from 'react'
import { EuiBadge } from '@elastic/eui'
import { t } from '../lib/i18n'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'hollow' | 'primary'

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
      return 'primary'
    default:
      return 'hollow'
  }
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return <EuiBadge color={getVariant(status)}>{t(status) || status}</EuiBadge>
}

export function StatusDot({ status }: { status: string; className?: string; pulse?: boolean }) {
  const variant = getVariant(status)
  const colorMap: Record<BadgeVariant, string> = {
    success: '#017d73',
    warning: '#b25f00',
    danger: '#bd271e',
    hollow: '#98a2b3',
    primary: '#1d70b8',
  }
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: colorMap[variant],
      }}
    />
  )
}
