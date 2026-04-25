/**
 * ClockWidget — Real-time clock with date, time, moon phase, and season.
 *
 * Config:
 *   mode: 'digital' | 'analog' (default: 'digital')
 *   timezone: IANA timezone (default: browser local)
 *   show_date: boolean (default: true)
 *   show_seconds: boolean (default: true)
 *   show_moon: boolean (default: true)
 *   show_season: boolean (default: true)
 *   locale: 'fr' | 'en' (default: 'fr')
 */
import { useState, useEffect } from 'react'
// import { cn } from '@/lib/utils'

// ── Moon phase calculation (simplified Synodic cycle) ──────────

function getMoonPhase(date: Date): { name: string; emoji: string; illumination: number } {
  // Days since known new moon (Jan 6, 2000 18:14 UTC)
  const knownNew = new Date(2000, 0, 6, 18, 14, 0).getTime()
  const synodicMonth = 29.53058867
  const daysSince = (date.getTime() - knownNew) / 86400000
  const phase = ((daysSince % synodicMonth) + synodicMonth) % synodicMonth
  const normalized = phase / synodicMonth // 0..1

  if (normalized < 0.0625) return { name: 'Nouvelle lune', emoji: '🌑', illumination: 0 }
  if (normalized < 0.1875) return { name: 'Premier croissant', emoji: '🌒', illumination: 15 }
  if (normalized < 0.3125) return { name: 'Premier quartier', emoji: '🌓', illumination: 50 }
  if (normalized < 0.4375) return { name: 'Gibbeuse croissante', emoji: '🌔', illumination: 85 }
  if (normalized < 0.5625) return { name: 'Pleine lune', emoji: '🌕', illumination: 100 }
  if (normalized < 0.6875) return { name: 'Gibbeuse decroissante', emoji: '🌖', illumination: 85 }
  if (normalized < 0.8125) return { name: 'Dernier quartier', emoji: '🌗', illumination: 50 }
  if (normalized < 0.9375) return { name: 'Dernier croissant', emoji: '🌘', illumination: 15 }
  return { name: 'Nouvelle lune', emoji: '🌑', illumination: 0 }
}

// ── Season calculation (based on hemisphere) ───────────────────

function getSeason(date: Date, hemisphere: 'north' | 'south' = 'north'): { name: string; emoji: string } {
  const month = date.getMonth() // 0-11
  const seasons = hemisphere === 'north'
    ? [
        { range: [2, 4], name: 'Printemps', emoji: '🌸' },
        { range: [5, 7], name: 'Ete', emoji: '☀️' },
        { range: [8, 10], name: 'Automne', emoji: '🍂' },
        { range: [11, 1], name: 'Hiver', emoji: '❄️' },
      ]
    : [
        { range: [2, 4], name: 'Automne', emoji: '🍂' },
        { range: [5, 7], name: 'Hiver', emoji: '❄️' },
        { range: [8, 10], name: 'Printemps', emoji: '🌸' },
        { range: [11, 1], name: 'Ete', emoji: '☀️' },
      ]
  for (const s of seasons) {
    if (s.range[0] <= s.range[1]) {
      if (month >= s.range[0] && month <= s.range[1]) return s
    } else {
      if (month >= s.range[0] || month <= s.range[1]) return s
    }
  }
  return { name: 'Inconnu', emoji: '🌍' }
}

// ── Analog Clock SVG ───────────────────────────────────────────

function AnalogClock({ hours, minutes, seconds, showSeconds }: {
  hours: number; minutes: number; seconds: number; showSeconds: boolean
}) {
  const hourAngle = ((hours % 12) + minutes / 60) * 30
  const minuteAngle = (minutes + seconds / 60) * 6
  const secondAngle = seconds * 6

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full max-w-[120px] max-h-[120px]">
      {/* Face */}
      <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-border" />
      {/* Hour marks */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = i * 30 * Math.PI / 180
        const x1 = 50 + 42 * Math.sin(angle)
        const y1 = 50 - 42 * Math.cos(angle)
        const x2 = 50 + 46 * Math.sin(angle)
        const y2 = 50 - 46 * Math.cos(angle)
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={i % 3 === 0 ? 2 : 1} className="text-foreground" />
      })}
      {/* Hour hand */}
      <line x1="50" y1="50"
        x2={50 + 28 * Math.sin(hourAngle * Math.PI / 180)}
        y2={50 - 28 * Math.cos(hourAngle * Math.PI / 180)}
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-foreground" />
      {/* Minute hand */}
      <line x1="50" y1="50"
        x2={50 + 38 * Math.sin(minuteAngle * Math.PI / 180)}
        y2={50 - 38 * Math.cos(minuteAngle * Math.PI / 180)}
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-foreground" />
      {/* Second hand */}
      {showSeconds && (
        <line x1="50" y1="50"
          x2={50 + 40 * Math.sin(secondAngle * Math.PI / 180)}
          y2={50 - 40 * Math.cos(secondAngle * Math.PI / 180)}
          stroke="currentColor" strokeWidth="0.5" className="text-destructive" />
      )}
      {/* Center dot */}
      <circle cx="50" cy="50" r="2" className="fill-foreground" />
    </svg>
  )
}

// ── Main component ─────────────────────────────────────────────

interface ClockWidgetProps {
  config: Record<string, unknown>
}

export function ClockWidget({ config }: ClockWidgetProps) {
  const mode = (config.mode as string) || 'digital'
  const tz = (config.timezone as string) || undefined
  const showDate = config.show_date !== false
  const showSeconds = config.show_seconds !== false
  const showMoon = config.show_moon !== false
  const showSeason = config.show_season !== false
  const locale = (config.locale as string) || 'fr'

  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Format with timezone
  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    ...(tz ? { timeZone: tz } : {}),
  }
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: '2-digit', minute: '2-digit',
    ...(showSeconds ? { second: '2-digit' } : {}),
    ...(tz ? { timeZone: tz } : {}),
  }

  const dateStr = now.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', dateOpts)
  const timeStr = now.toLocaleTimeString(locale === 'fr' ? 'fr-FR' : 'en-US', timeOpts)

  // Extract hours/minutes/seconds for analog clock
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
    ...(tz ? { timeZone: tz } : {}),
  }).formatToParts(now)
  const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0')
  const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0')
  const s = parseInt(parts.find(p => p.type === 'second')?.value || '0')

  const moon = showMoon ? getMoonPhase(now) : null
  const season = showSeason ? getSeason(now) : null

  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 select-none">
      {mode === 'analog' ? (
        <AnalogClock hours={h} minutes={m} seconds={s} showSeconds={showSeconds} />
      ) : (
        <span className="text-3xl font-mono font-bold leading-none" style={{ color: 'var(--widget-accent, currentColor)' }}>
          {timeStr}
        </span>
      )}

      {showDate && (
        <span className="text-xs text-muted-foreground capitalize">{dateStr}</span>
      )}

      {(moon || season) && (
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {moon && <span title={moon.name}>{moon.emoji} {moon.name}</span>}
          {season && <span title={season.name}>{season.emoji} {season.name}</span>}
        </div>
      )}

      {tz && (
        <span className="text-[9px] text-muted-foreground/60">{tz.replace(/_/g, ' ')}</span>
      )}
    </div>
  )
}
