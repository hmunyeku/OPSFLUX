/**
 * ProjectInsightsBar — Planning bullet chart inspired by the
 * "Project Quick Insights" reference (HTML mock supplied by the user).
 *
 * Visual grammar:
 *   - Light track     : the planned duration (start → end)
 *   - Dark fill       : actual physical progress (project.progress %)
 *   - Red zone (right): time overrun when forecast/actual end > planned end
 *   - Vertical "Today" tick: where we are on the calendar
 *   - "% time" caption below the tick: calendar-elapsed % of the plan
 *   - Dashed verticals at start/end mark the original frame
 *   - Outer date labels: start (bottom-left) → effective end (bottom-right)
 *
 * Differences vs the HTML reference:
 *   - We render only the PLANNING bar (OpsFlux doesn't track AFE /
 *     committed / forecast spend on Project today). The dual budget
 *     bar will be added when those columns land.
 *   - Theme tokens come from CSS variables, no hard-coded palette.
 *
 * Pure SVG, no chart-library dep — keeps the bundle tight and the
 * output exportable to PNG via the same approach the HTML uses.
 */
import { useMemo } from 'react'
import type { Project } from '@/types/api'

interface Props {
  project: Project
  /** Optional override: if set, used as the project's actual end date
   *  instead of project.actual_end_date. */
  forecastEndDate?: string | null
  /** Total chart width. Height is derived from the layout (~140px). */
  width?: number
}

function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}
function fmtPct(n: number, decimals = 1): string {
  if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n))
  return n.toFixed(decimals)
}
function fmtElapsedDuration(days: number): string {
  if (days < 0) return '—'
  const weeks = days / 7
  const months = days / 30.44
  const years = days / 365.25
  if (weeks < 4) {
    const n = Math.max(1, Math.round(weeks))
    return `${n} semaine${n > 1 ? 's' : ''}`
  }
  if (months < 12) {
    const n = Math.max(0, Math.round(months))
    return `${n} mois`
  }
  const n = Math.round(years * 10) / 10
  return `${n} an${n !== 1 ? 's' : ''}`
}
function fmtOverrunDuration(days: number): string {
  if (days < 1) return ''
  const weeks = days / 7
  const months = days / 30.44
  const years = days / 365.25
  if (weeks < 4) {
    const n = Math.max(1, Math.round(weeks))
    return `+${n} sem.`
  }
  if (months < 12) {
    const n = Math.max(1, Math.round(months))
    return `+${n} mois`
  }
  const n = Math.max(1, Math.round(years * 10) / 10)
  return `+${n} an${n > 1 ? 's' : ''}`
}

export function ProjectInsightsBar({ project, forecastEndDate, width = 720 }: Props) {
  const data = useMemo(() => {
    const startISO = project.start_date?.split('T')[0] || null
    const plannedEndISO = project.end_date?.split('T')[0] || null
    const fcEndISO = (forecastEndDate ?? project.actual_end_date)?.split('T')[0] || null
    return { startISO, plannedEndISO, fcEndISO }
  }, [project.start_date, project.end_date, project.actual_end_date, forecastEndDate])

  const { startISO, plannedEndISO, fcEndISO } = data

  // ── Geometry ───────────────────────────────────────────────────────
  const W = width
  const trackX = 16
  const dateBandH = 22
  const trackW = W - trackX - 16
  const trackRight = trackX + trackW
  const barY = 56
  const barH = 32
  const barBot = barY + barH
  const planLabelTopY = barBot + 22
  const planLabelBotY = barBot + 36
  const dateBandY = planLabelBotY + dateBandH
  const H = dateBandY + 4
  const dashTopY = 18
  const dashBotY = dateBandY - 14

  // Missing-dates fallback
  if (!startISO || !plannedEndISO) {
    return (
      <div className="border border-dashed border-border/60 rounded-md p-4 text-center text-[11px] text-muted-foreground">
        Définissez les dates de début et de fin du projet pour afficher le graphique de planification.
      </div>
    )
  }

  const startMs = new Date(startISO).getTime()
  const plannedEndMs = new Date(plannedEndISO).getTime()
  const nowMs = Date.now()

  const forecastEndMs = fcEndISO ? new Date(fcEndISO).getTime() : plannedEndMs
  const progress = Math.max(0, Math.min(100, project.progress ?? 0))
  const isComplete = progress >= 100

  // Latest = max(planned, forecast, today unless complete).
  const latestMs = isComplete
    ? Math.max(plannedEndMs, forecastEndMs)
    : Math.max(plannedEndMs, forecastEndMs, nowMs)
  const totalScaleMs = Math.max(1, latestMs - startMs)
  const plannedDurationMs = Math.max(0, plannedEndMs - startMs)
  const elapsedMs = Math.max(0, nowMs - startMs)
  const toX = (ms: number) => trackX + (ms / totalScaleMs) * trackW
  const xPlannedEnd = toX(plannedDurationMs)
  const xNow = toX(Math.min(totalScaleMs, elapsedMs))
  const overrunMs = Math.max(0, forecastEndMs - plannedEndMs)
  const wPlanOverrun = toX(plannedDurationMs + overrunMs) - xPlannedEnd
  const wPlanned = xPlannedEnd - trackX
  const wProgress = (progress / 100) * wPlanned

  const timeElapsedPct = plannedDurationMs > 0 ? (elapsedMs / plannedDurationMs) * 100 : 0
  const showTodayMarker = !isComplete && elapsedMs > 0 && Math.abs(xNow - (trackX + wProgress)) > 3

  // Theme tokens — picked to match the rest of the app (primary +
  // muted + destructive). We materialise them once per render via
  // CSS variable references (works inside SVG when we wrap the
  // colors in `currentColor` attribute or pass HSL strings — here
  // we use dynamic tokens via the surrounding span's `style`).
  const COL = {
    track:        'rgba(128,128,128,0.10)',
    border:       'rgba(128,128,128,0.20)',
    plannedZone:  'rgba(59,130,246,0.20)',         // primary @ 20%
    progressZone: 'hsl(var(--primary))',
    overrunZone:  'rgba(220,38,38,0.85)',
    overrunText:  '#dc2626',
    todayMarker:  'hsl(var(--foreground))',
    label:        'hsl(var(--foreground))',
    labelMuted:   'hsl(var(--muted-foreground))',
    dashed:       'rgba(128,128,128,0.45)',
  }

  const fcDisplayISO = fcEndISO || plannedEndISO

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="xMidYMid meet"
        className="block"
        role="img"
        aria-label={`Planning ${fmtShortDate(startISO)} – ${fmtShortDate(fcDisplayISO)} · ${fmtPct(progress)}% réalisé`}
      >
        {/* Top label */}
        <text x={trackX} y={frameTopLabelY()} fontSize="11" fontWeight="600" fill={COL.labelMuted}>
          PLANIFICATION
        </text>

        {/* Outer dashed verticals at start / planned end */}
        <line x1={trackX} y1={dashTopY} x2={trackX} y2={dashBotY}
              stroke={COL.dashed} strokeWidth="1" strokeDasharray="3,3" opacity="0.7" />
        <line x1={xPlannedEnd} y1={dashTopY} x2={xPlannedEnd} y2={dashBotY}
              stroke={COL.dashed} strokeWidth="1" strokeDasharray="3,3" opacity="0.7" />

        {/* Track frame */}
        <rect x={trackX} y={barY} width={trackW} height={barH}
              fill={COL.track} stroke={COL.border} strokeWidth="0.5" rx="3" />

        {/* Planned zone (light primary) */}
        <rect x={trackX} y={barY + 2} width={Math.max(0, wPlanned)} height={barH - 4}
              fill={COL.plannedZone} />

        {/* Progress zone (saturated primary) */}
        {wProgress > 0 && (
          <rect x={trackX} y={barY + 2} width={wProgress} height={barH - 4}
                fill={COL.progressZone} />
        )}

        {/* Overrun zone (red) */}
        {overrunMs > 0 && (
          <rect x={xPlannedEnd} y={barY + 2} width={wPlanOverrun} height={barH - 4}
                fill={COL.overrunZone} opacity="0.92" />
        )}

        {/* Progress % inside / outside the dark zone */}
        {(() => {
          const txt = `${fmtPct(progress)}%`
          if (wProgress >= 40) {
            return (
              <text x={trackX + wProgress / 2} y={barY + barH / 2 + 4}
                    fontSize="14" fontWeight="700" fill="white" textAnchor="middle">{txt}</text>
            )
          }
          if (wProgress >= 22) {
            return (
              <text x={trackX + wProgress / 2} y={barY + barH / 2 + 4}
                    fontSize="11" fontWeight="700" fill="white" textAnchor="middle">{txt}</text>
            )
          }
          return (
            <text x={trackX + wProgress + 4} y={barY + barH / 2 + 4}
                  fontSize="12" fontWeight="700" fill={COL.label} textAnchor="start">{txt}</text>
          )
        })()}

        {/* Overrun "+X mois" label centered on the red zone */}
        {overrunMs > 0 && (
          <text x={xPlannedEnd + wPlanOverrun / 2} y={barBot + 14}
                fontSize="12" fontWeight="700" fill={COL.overrunText} textAnchor="middle">
            {fmtOverrunDuration(overrunMs / 86_400_000)}
          </text>
        )}

        {/* Today marker (tick + connecting vertical) */}
        {showTodayMarker && (
          <line x1={xNow} y1={barY} x2={xNow} y2={planLabelTopY - 8}
                stroke={COL.todayMarker} strokeWidth="1.8" opacity="0.9" />
        )}

        {/* "% time" + elapsed duration label below the bar */}
        {!isComplete && (
          <>
            <text x={Math.max(trackX + 30, Math.min(trackRight - 30, xNow))} y={planLabelTopY}
                  fontSize="11" fontWeight="600" fill={COL.label} textAnchor="middle">
              {fmtPct(timeElapsedPct)}% du temps
            </text>
            <text x={Math.max(trackX + 30, Math.min(trackRight - 30, xNow))} y={planLabelBotY}
                  fontSize="10" fill={COL.labelMuted} textAnchor="middle">
              {fmtElapsedDuration(elapsedMs / 86_400_000)}
            </text>
          </>
        )}

        {/* "Planned" label above the planned end line — only shown when overrunning */}
        {overrunMs > 0 && (
          <>
            <text x={Math.max(trackX + 30, Math.min(trackRight - 30, xPlannedEnd))} y={barY - 24}
                  fontSize="10" fontWeight="600" fill={COL.labelMuted} textAnchor="middle"
                  textDecoration="underline">Planifié</text>
            <text x={Math.max(trackX + 30, Math.min(trackRight - 30, xPlannedEnd))} y={barY - 10}
                  fontSize="11" fontWeight="700" fill={COL.label} textAnchor="middle">
              {fmtShortDate(plannedEndISO)}
            </text>
          </>
        )}

        {/* Outer date labels (start / effective end) */}
        <text x={trackX} y={dateBandY} fontSize="12" fontWeight="600" fill={COL.label} textAnchor="start">
          {fmtShortDate(startISO)}
        </text>
        <text x={trackRight} y={dateBandY} fontSize="12" fontWeight="600" fill={COL.label} textAnchor="end">
          {fmtShortDate(fcDisplayISO)}
        </text>
      </svg>
    </div>
  )
}

// Anchor for the small "PLANIFICATION" caption above the bar.
function frameTopLabelY(): number {
  return 18
}
