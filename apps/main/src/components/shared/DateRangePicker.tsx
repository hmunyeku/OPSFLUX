/**
 * DateRangePicker -- Compact dual date input with duration badge.
 *
 * Replaces two separate date inputs with a single unified control.
 * Validates end >= start and shows a computed duration label (e.g. "3j", "2 sem").
 *
 * Usage:
 *   <DateRangePicker
 *     startDate={start}
 *     endDate={end}
 *     onStartChange={setStart}
 *     onEndChange={setEnd}
 *   />
 */
import { useMemo } from 'react'

// ── Types ────────────────────────────────────────────────────────

export interface DateRangePickerProps {
  /** ISO date string (YYYY-MM-DD) */
  startDate: string | null
  endDate: string | null
  onStartChange: (date: string) => void
  onEndChange: (date: string) => void
  startLabel?: string
  endLabel?: string
  className?: string
  disabled?: boolean
  required?: boolean
}

// ── Duration helper ─────────────────────────────────────────────

function formatDuration(startISO: string, endISO: string): string | null {
  const s = new Date(startISO)
  const e = new Date(endISO)
  const diffMs = e.getTime() - s.getTime()
  if (diffMs < 0) return null

  const days = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (days === 0) return '0j'
  if (days < 7) return `${days}j`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    const rem = days % 7
    return rem ? `${weeks} sem ${rem}j` : `${weeks} sem`
  }
  if (days < 365) {
    const months = Math.floor(days / 30)
    const rem = days % 30
    if (rem === 0) return `${months} mois`
    return `${months} mois ${rem}j`
  }
  const years = Math.floor(days / 365)
  const remMonths = Math.floor((days % 365) / 30)
  if (remMonths === 0) return `${years} an${years > 1 ? 's' : ''}`
  return `${years} an${years > 1 ? 's' : ''} ${remMonths} mois`
}

// ── Component ───────────────────────────────────────────────────

export function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  startLabel = 'Début',
  endLabel = 'Fin',
  className = '',
  disabled = false,
  required = false,
}: DateRangePickerProps) {
  // Validation: end must be >= start
  const isInvalid = useMemo(() => {
    if (!startDate || !endDate) return false
    return new Date(endDate) < new Date(startDate)
  }, [startDate, endDate])

  // Duration badge text
  const duration = useMemo(() => {
    if (!startDate || !endDate) return null
    return formatDuration(startDate, endDate)
  }, [startDate, endDate])

  const inputClass = (invalid: boolean) =>
    `gl-form-input text-sm ${invalid ? '!shadow-[inset_0_0_0_1px_hsl(0_84%_60%)] focus:!shadow-[inset_0_0_0_1px_hsl(0_84%_60%),0_0_0_2px_hsl(0_84%_60%/0.15)]' : ''}`

  return (
    <div className={`flex items-end gap-2 ${className}`}>
      {/* Start date */}
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <label className="text-xs font-medium text-muted-foreground">{startLabel}</label>
        <input
          type="date"
          className={inputClass(isInvalid)}
          value={startDate ?? ''}
          onChange={(e) => onStartChange(e.target.value)}
          disabled={disabled}
          required={required}
        />
      </div>

      {/* Separator + duration */}
      <div className="flex flex-col items-center gap-0.5 pb-1 shrink-0">
        <span className="text-muted-foreground text-sm select-none">→</span>
        {duration !== null && (
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${
              isInvalid
                ? 'bg-destructive/10 text-destructive'
                : 'bg-primary/10 text-primary'
            }`}
          >
            {isInvalid ? 'Invalide' : duration}
          </span>
        )}
      </div>

      {/* End date */}
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <label className="text-xs font-medium text-muted-foreground">{endLabel}</label>
        <input
          type="date"
          className={inputClass(isInvalid)}
          value={endDate ?? ''}
          onChange={(e) => onEndChange(e.target.value)}
          disabled={disabled}
          required={required}
          min={startDate ?? undefined}
        />
      </div>
    </div>
  )
}
