/**
 * EntityIcon — shows entity logo, country flag, or Building2 fallback.
 *
 * Priority: logo_url > country flag > Building2 icon
 */
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EntityIconProps {
  logoUrl?: string | null
  country?: string | null
  size?: number
  className?: string
}

export function EntityIcon({ logoUrl, country, size = 14, className }: EntityIconProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className={cn('rounded object-cover shrink-0', className)}
        style={{ width: size, height: size }}
        onError={(e) => {
          // Fallback to Building2 if image fails
          e.currentTarget.style.display = 'none'
          e.currentTarget.nextElementSibling?.classList.remove('hidden')
        }}
      />
    )
  }

  if (country && country.length === 2) {
    return (
      <span
        className={cn(`fi fi-${country.toLowerCase()} shrink-0`, className)}
        style={{ fontSize: size - 2, lineHeight: 1 }}
        title={country.toUpperCase()}
      />
    )
  }

  return <Building2 size={size} className={cn('shrink-0 text-muted-foreground', className)} />
}
