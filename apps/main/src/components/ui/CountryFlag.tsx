/**
 * CountryFlag — renders an SVG flag via flag-icons CSS.
 * Cross-platform (works on Windows where emoji flags don't render).
 *
 * @example <CountryFlag code="CM" />
 * @example <CountryFlag code="FR" size={20} />
 * @example <CountryFlag code="GA" label="Gabon" />
 */

import { cn } from '@/lib/utils'

interface CountryFlagProps {
  /** ISO 3166-1 alpha-2 country code (e.g. 'CM', 'FR', 'US') */
  code: string | null | undefined
  /** Size in pixels (default: 16) */
  size?: number
  /** Optional label to display after the flag */
  label?: string
  /** Additional CSS classes */
  className?: string
  /** Use square flag instead of rectangular (default: false) */
  square?: boolean
}

export function CountryFlag({ code, size = 16, label, className, square }: CountryFlagProps) {
  if (!code || code.length !== 2) {
    return label ? <span className={cn('text-muted-foreground', className)}>{label}</span> : null
  }

  const iso = code.toLowerCase()
  const flagClass = square ? `fis fi-${iso}` : `fi fi-${iso}`

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={flagClass}
        style={{ fontSize: size, lineHeight: 1 }}
        title={code.toUpperCase()}
      />
      {label && <span>{label}</span>}
    </span>
  )
}
