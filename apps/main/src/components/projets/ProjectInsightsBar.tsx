/**
 * ProjectInsightsBar — Dual-bar (Budget + Planning) bullet chart.
 *
 * Faithful port of the user-supplied "Project Quick Insights" HTML
 * mock (`buildInsightsSVG`). Both bars share the same visual grammar:
 *
 *   Budget bar:
 *     - Light zone   = planned envelope (AFE / project.budget)
 *     - Dark zone    = committed (proxy: progress × budget — best
 *                      we can compute today; will switch to actual
 *                      time-entry cost once exposed on Project)
 *     - Red zone     = forecast > AFE (only when an explicit forecast
 *                      is provided; today this never triggers)
 *
 *   Planning bar:
 *     - Light zone   = planned duration (start_date → end_date)
 *     - Dark zone    = physical progress %
 *     - Red zone     = overrun when actual_end_date > end_date
 *     - Today tick   = vertical mark + "% time" caption below
 *
 *   Labels:
 *     - Above budget bar: Committed · AFE · Forecast (with values)
 *     - Above planning bar: "Planifié" date label (only when overrun)
 *     - Below planning bar: "% time" + elapsed duration
 *     - Anti-collision relax algorithm pushes labels apart, draws
 *       L-shape leader lines back to the anchor when displaced.
 *     - Outer dashed verticals at trackX / trackRight frame the
 *       project's start / planned end.
 *
 * Pure SVG — no chart library dep, exportable to PNG.
 */
import type { Project } from '@/types/api'

interface Props {
  project: Project
  /** Optional override: actual / forecast end date. Falls back to
   *  project.actual_end_date. */
  forecastEndDate?: string | null
  /** Optional explicit committed amount. Falls back to
   *  `project.budget * progress / 100`. Pass 0 to hide the budget
   *  bar entirely (no envelope to track against). */
  committedAmount?: number | null
  /** Optional explicit forecast amount (final spend at completion).
   *  Defaults to `project.budget` (no overrun). */
  forecastAmount?: number | null
  /** Total chart width. Height auto-derived from layout. */
  width?: number
}

// ──────────────────────────────────────────────────────────────────────
// Formatting helpers
// ──────────────────────────────────────────────────────────────────────

function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

function fmtPct(n: number): string {
  if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n))
  return n.toFixed(1)
}

function fmtElapsedDuration(days: number): string {
  if (days < 0) return '—'
  const weeks = days / 7
  const months = days / 30.44
  const years = days / 365.25
  if (weeks < 4) return `${Math.max(1, Math.round(weeks))} sem.`
  if (months < 12) return `${Math.max(0, Math.round(months))} mois`
  return `${Math.round(years * 10) / 10} an${Math.round(years * 10) / 10 !== 1 ? 's' : ''}`
}

function fmtOverrunDuration(days: number): string {
  if (days < 1) return ''
  const weeks = days / 7
  const months = days / 30.44
  const years = days / 365.25
  if (weeks < 4) return `+${Math.max(1, Math.round(weeks))} sem.`
  if (months < 12) return `+${Math.max(1, Math.round(months))} mois`
  const n = Math.max(1, Math.round(years * 10) / 10)
  return `+${n} an${n > 1 ? 's' : ''}`
}

function fmtMoney(n: number): string {
  // Compact: 1.5 k€, 1.2 M€, 12 M€
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} M€`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)} k€`
  return `${Math.round(n)} €`
}

// ──────────────────────────────────────────────────────────────────────
// Anti-collision label layout — port of layoutLabelsAntiCollision()
// ──────────────────────────────────────────────────────────────────────

interface LabelLayoutEntry {
  /** Anchor x on the bar (target position) */
  x: number
  /** Estimated label width (px) */
  labelW: number
  /** Filled in by the layout: resolved horizontal centre. */
  labelX?: number
  /** True when displaced from the anchor — caller draws a leader line. */
  needsLeader?: boolean
  /** 0-based vertical band for staggering parallel leader lines. */
  _leaderBand?: number
  /** Allowed horizontal range (filled by the layout). */
  minX?: number
  maxX?: number
}

function layoutAntiCollision<T extends LabelLayoutEntry>(
  labels: T[], leftBound: number, rightBound: number, minGap = 10,
): void {
  if (!labels || labels.length === 0) return
  labels.sort((a, b) => a.x - b.x)

  const totalW = labels.reduce((s, l) => s + l.labelW, 0)
  const totalGaps = (labels.length - 1) * minGap
  const required = totalW + totalGaps
  const available = rightBound - leftBound

  if (required > available) {
    const centroid = labels.reduce((s, l) => s + l.x, 0) / labels.length
    let blockStart = centroid - required / 2
    if (blockStart < leftBound) blockStart = leftBound
    if (blockStart + required > rightBound) blockStart = rightBound - required
    if (blockStart < leftBound) blockStart = leftBound
    let cursor = blockStart
    labels.forEach(l => {
      l.labelX = cursor + l.labelW / 2
      cursor += l.labelW + minGap
    })
  } else {
    labels.forEach(l => {
      l.minX = leftBound + l.labelW / 2
      l.maxX = rightBound - l.labelW / 2
      l.labelX = Math.max(l.minX!, Math.min(l.maxX!, l.x))
    })
    for (let iter = 0; iter < 10; iter++) {
      let changed = false
      for (let i = 1; i < labels.length; i++) {
        const prev = labels[i - 1]
        const curr = labels[i]
        const prevR = prev.labelX! + prev.labelW / 2
        const currL = curr.labelX! - curr.labelW / 2
        if (currL < prevR + minGap) {
          const newX = prevR + minGap + curr.labelW / 2
          if (newX <= curr.maxX!) { curr.labelX = newX; changed = true }
          else {
            const shift = newX - curr.maxX!
            curr.labelX = curr.maxX!
            prev.labelX = Math.max(prev.minX!, prev.labelX! - shift)
            changed = true
          }
        }
      }
      for (let i = labels.length - 2; i >= 0; i--) {
        const curr = labels[i]
        const next = labels[i + 1]
        const currR = curr.labelX! + curr.labelW / 2
        const nextL = next.labelX! - next.labelW / 2
        if (currR > nextL - minGap) {
          const newX = nextL - minGap - curr.labelW / 2
          if (newX >= curr.minX!) { curr.labelX = newX; changed = true }
          else {
            const shift = curr.minX! - newX
            curr.labelX = curr.minX!
            next.labelX = Math.min(next.maxX!, next.labelX! + shift)
            changed = true
          }
        }
      }
      if (!changed) break
    }
  }

  labels.forEach(l => { l.needsLeader = Math.abs(l.labelX! - l.x) > 2 })
  let band = 0
  labels.forEach(l => { if (l.needsLeader) l._leaderBand = band++ })
}

function estimateLabelWidth(name: string, value: string, fontSize = 11): number {
  const charW = fontSize * 0.59
  return Math.max(name.length * charW, value.length * charW) + 10
}

// ──────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────

interface BudgetLabel extends LabelLayoutEntry {
  nameText: string
  valueText: string
  color: string
  dashed: boolean
}
interface PlanLabel extends LabelLayoutEntry {
  nameText: string
  valueText: string
  color: string
}

export function ProjectInsightsBar({
  project, forecastEndDate, committedAmount, forecastAmount, width = 720,
}: Props) {
  // ── Data presence detection ───────────────────────────────────
  const afe = project.budget ?? 0
  const progress = Math.max(0, Math.min(100, project.progress ?? 0))
  // Committed proxy = budget × progress%. The user's mock uses a
  // separate `committed` field; we'll switch when it exists on Project.
  const committed = committedAmount ?? (afe > 0 ? afe * (progress / 100) : 0)
  const forecast = forecastAmount ?? afe
  const hasBudget = afe > 0 || committed > 0 || forecast > 0

  const startISO = project.start_date?.split('T')[0] || null
  const plannedEndISO = project.end_date?.split('T')[0] || null
  const fcEndISO = (forecastEndDate ?? project.actual_end_date)?.split('T')[0] || null
  const hasPlanning = !!(startISO && plannedEndISO)

  // ── Geometry (adaptive) ──────────────────────────────────────
  const W = width
  const trackX = 116
  const trackW = W - trackX - 24
  const trackRight = trackX + trackW
  const framePad = 6
  const frameTop = framePad
  const budgetLabelTopY = frameTop + 18
  const budgetLabelBotY = frameTop + 36
  const budgetBarY = frameTop + 58
  const budgetBarH = 30
  const budgetBarBot = budgetBarY + budgetBarH

  let plannedLabelTopY = 0, plannedLabelBotY = 0
  let planBarY = 0, planBarH = 0, planBarBot = 0
  let planLabelTopY = 0, planLabelBotY = 0
  let dateBandY = 0, H = 120

  if (hasBudget && hasPlanning) {
    plannedLabelTopY = budgetBarBot + 22
    plannedLabelBotY = budgetBarBot + 36
    planBarY = budgetBarBot + 50
    planBarH = 30
    planBarBot = planBarY + planBarH
    planLabelTopY = planBarBot + 34
    planLabelBotY = planBarBot + 50
    dateBandY = planLabelBotY + 24
    H = dateBandY + 8
  } else if (hasBudget && !hasPlanning) {
    dateBandY = budgetBarBot + 30
    H = dateBandY + 8
  } else if (!hasBudget && hasPlanning) {
    plannedLabelTopY = frameTop + 16
    plannedLabelBotY = frameTop + 32
    planBarY = frameTop + 52
    planBarH = 30
    planBarBot = planBarY + planBarH
    planLabelTopY = planBarBot + 34
    planLabelBotY = planBarBot + 50
    dateBandY = planLabelBotY + 24
    H = dateBandY + 8
  }
  const dashTopY = frameTop + 8
  const dashBotY = dateBandY > 0 ? dateBandY - 18 : 0

  // ── Theme ────────────────────────────────────────────────────
  const COL = {
    track:        'rgba(128,128,128,0.10)',
    border:       'rgba(128,128,128,0.20)',
    zoneBudget:   'rgba(59,130,246,0.20)',  // primary @ 20% (planned envelope)
    committed:    'hsl(var(--primary))',     // saturated primary (done part)
    afeMarker:    'hsl(var(--foreground))',  // marker color for AFE label
    overrun:      'rgba(220,38,38,0.92)',
    overrunText:  '#dc2626',
    textPrimary:  'hsl(var(--foreground))',
    textTertiary: 'hsl(var(--muted-foreground))',
    tickGray:     'rgba(128,128,128,0.45)',
    forecastUnder:'#16a34a',                  // green when forecast <= AFE
    forecastOver: '#dc2626',
  }

  // ── Budget bar geometry ──────────────────────────────────────
  const forecastEqualsAfe = Math.abs(forecast - afe) < 0.05
  const isOver = forecast > afe && !forecastEqualsAfe
  const scaleMax = Math.max(afe, forecast, committed, 0.1)
  const toBudgetX = (v: number) => trackX + (v / scaleMax) * trackW
  const xCommitted = toBudgetX(committed)
  const xAfe = toBudgetX(afe)
  const xForecast = toBudgetX(forecast)
  const wBudgetZone = (Math.min(afe, forecast) / scaleMax) * trackW
  const wCommitted = Math.max(0, (committed / scaleMax) * trackW)
  const wOver = isOver ? (xForecast - xAfe) : 0
  const forecastColor = isOver ? COL.forecastOver : COL.forecastUnder

  // ── Planning geometry ────────────────────────────────────────
  const startMs = startISO ? new Date(startISO).getTime() : 0
  const plannedEndMs = plannedEndISO ? new Date(plannedEndISO).getTime() : 0
  const fcEndMs = fcEndISO ? new Date(fcEndISO).getTime() : plannedEndMs
  const nowMs = Date.now()
  const isComplete = progress >= 100
  const latestMs = isComplete
    ? Math.max(plannedEndMs, fcEndMs)
    : Math.max(plannedEndMs, fcEndMs, nowMs)
  const totalScaleMs = Math.max(1, latestMs - startMs)
  const plannedDurationMs = Math.max(0, plannedEndMs - startMs)
  const elapsedMs = Math.max(0, nowMs - startMs)
  const toPlanX = (ms: number) => trackX + (ms / totalScaleMs) * trackW
  const xPlannedEnd = toPlanX(plannedDurationMs)
  const xNow = toPlanX(Math.min(totalScaleMs, elapsedMs))
  const overrunMs = Math.max(0, fcEndMs - plannedEndMs)
  const wPlanned = xPlannedEnd - trackX
  const wPlanOverrun = toPlanX(plannedDurationMs + overrunMs) - xPlannedEnd
  const wProgress = (progress / 100) * wPlanned
  const timeElapsedPct = plannedDurationMs > 0 ? (elapsedMs / plannedDurationMs) * 100 : 0
  const showTodayMarker = !isComplete && elapsedMs > 0 && Math.abs(xNow - (trackX + wProgress)) > 3

  // ── Budget labels (above the budget bar) ─────────────────────
  const budgetLabels: BudgetLabel[] = []
  if (hasBudget) {
    if (committed > 0) {
      budgetLabels.push({
        x: xCommitted, nameText: 'Engagé', valueText: fmtMoney(committed),
        color: COL.committed, dashed: false, labelW: 0,
      })
    }
    if (forecastEqualsAfe) {
      budgetLabels.push({
        x: xAfe, nameText: 'Budget', valueText: fmtMoney(afe),
        color: COL.afeMarker, dashed: false, labelW: 0,
      })
    } else {
      budgetLabels.push({
        x: xAfe, nameText: 'Budget', valueText: fmtMoney(afe),
        color: COL.afeMarker, dashed: false, labelW: 0,
      })
      budgetLabels.push({
        x: xForecast, nameText: 'Prévision', valueText: fmtMoney(forecast),
        color: forecastColor, dashed: true, labelW: 0,
      })
    }
    budgetLabels.forEach(l => { l.labelW = estimateLabelWidth(l.nameText, l.valueText, 11) })
    layoutAntiCollision(budgetLabels, trackX + 4, trackRight - 4, 12)
  }

  // ── Planning labels (below the planning bar — "% time" + elapsed) ─
  const planLabels: PlanLabel[] = []
  if (hasPlanning && !isComplete) {
    const elapsedDays = Math.max(0, elapsedMs / 86_400_000)
    planLabels.push({
      x: xNow,
      nameText: `${fmtPct(timeElapsedPct)}% du temps`,
      valueText: fmtElapsedDuration(elapsedDays),
      color: COL.textPrimary,
      labelW: estimateLabelWidth(`${fmtPct(timeElapsedPct)}% du temps`, fmtElapsedDuration(elapsedDays), 12),
    })
    layoutAntiCollision(planLabels, trackX + 4, trackRight - 4, 12)
  }

  // No data at all — friendly hint
  if (!hasBudget && !hasPlanning) {
    return (
      <div className="border border-dashed border-border/60 rounded-md p-4 text-center text-[11px] text-muted-foreground">
        Définissez un budget ou des dates de début/fin pour afficher le graphique.
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────
  const renderBudgetStem = (l: BudgetLabel, idx: number) => {
    const dash = l.dashed ? '3,2' : undefined
    const stemFromY = budgetLabelBotY + 5
    const stemToTopY = budgetBarY
    const stemBotY = budgetBarBot
    if (l.needsLeader) {
      const bandStep = 5
      const midY = stemToTopY - 4 - ((l._leaderBand ?? 0) * bandStep)
      return (
        <g key={`bs-${idx}`}>
          <line x1={l.labelX} y1={stemFromY} x2={l.labelX} y2={midY}
                stroke={l.color} strokeWidth={1.1} strokeDasharray={dash} opacity={0.95} />
          <line x1={l.labelX} y1={midY} x2={l.x} y2={midY}
                stroke={l.color} strokeWidth={1.1} opacity={0.95} />
          <line x1={l.x} y1={midY} x2={l.x} y2={stemToTopY}
                stroke={l.color} strokeWidth={1.6} strokeDasharray={dash} opacity={0.95} />
          <line x1={l.x} y1={stemToTopY} x2={l.x} y2={stemBotY}
                stroke={l.color} strokeWidth={1.6} strokeDasharray={dash} opacity={0.85} />
        </g>
      )
    }
    return (
      <g key={`bs-${idx}`}>
        <line x1={l.x} y1={stemFromY} x2={l.x} y2={stemToTopY}
              stroke={l.color} strokeWidth={1.6} strokeDasharray={dash} opacity={0.95} />
        <line x1={l.x} y1={stemToTopY} x2={l.x} y2={stemBotY}
              stroke={l.color} strokeWidth={1.6} strokeDasharray={dash} opacity={0.85} />
      </g>
    )
  }

  const renderPlanLeader = (l: PlanLabel, idx: number) => {
    return (
      <g key={`pl-${idx}`}>
        {/* Vertical line through plan bar */}
        <line x1={l.x} y1={planBarBot} x2={l.x} y2={planBarY}
              stroke={l.color} strokeWidth={1.6} opacity={0.85} />
        {l.needsLeader && (() => {
          const bandStep = 5
          const midY = planBarBot + 6 + ((l._leaderBand ?? 0) * bandStep)
          return (
            <>
              <line x1={l.labelX} y1={midY + 4} x2={l.labelX} y2={midY}
                    stroke={l.color} strokeWidth={1.1} opacity={0.95} />
              <line x1={l.labelX} y1={midY} x2={l.x} y2={midY}
                    stroke={l.color} strokeWidth={1.1} opacity={0.95} />
            </>
          )
        })()}
      </g>
    )
  }

  // % committed label (inside or right of the committed zone)
  const renderCommittedPct = () => {
    if (!hasBudget || afe <= 0 || wCommitted <= 0) return null
    const consPct = (committed / afe) * 100
    const txt = `${fmtPct(consPct)}%`
    const cy = budgetBarY + budgetBarH / 2 + 4
    if (wCommitted >= 40) {
      return <text x={trackX + wCommitted / 2} y={cy} fontSize={14} fontWeight={700} fill="white" textAnchor="middle">{txt}</text>
    }
    if (wCommitted >= 22) {
      return <text x={trackX + wCommitted / 2} y={cy} fontSize={11} fontWeight={700} fill="white" textAnchor="middle">{txt}</text>
    }
    return <text x={trackX + wCommitted + 4} y={cy} fontSize={12} fontWeight={700} fill={COL.textPrimary} textAnchor="start">{txt}</text>
  }

  // % progress label on planning bar (inside or right of dark zone)
  const renderProgressPct = () => {
    if (!hasPlanning) return null
    const txt = `${fmtPct(progress)}%`
    const cy = planBarY + planBarH / 2 + 4
    if (wProgress >= 40) {
      return <text x={trackX + wProgress / 2} y={cy} fontSize={14} fontWeight={700} fill="white" textAnchor="middle">{txt}</text>
    }
    if (wProgress >= 22) {
      return <text x={trackX + wProgress / 2} y={cy} fontSize={11} fontWeight={700} fill="white" textAnchor="middle">{txt}</text>
    }
    return <text x={trackX + wProgress + 4} y={cy} fontSize={12} fontWeight={700} fill={COL.textPrimary} textAnchor="start">{txt}</text>
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="xMidYMid meet"
        className="block"
        role="img"
      >
        {/* Outer dashed verticals — start / planned end frame */}
        {hasPlanning && (
          <>
            <line x1={trackX} y1={dashTopY} x2={trackX} y2={dashBotY}
                  stroke={COL.tickGray} strokeWidth={1} strokeDasharray="3,3" opacity={0.7} />
            <line x1={trackRight} y1={dashTopY} x2={trackRight} y2={dashBotY}
                  stroke={COL.tickGray} strokeWidth={1} strokeDasharray="3,3" opacity={0.7} />
          </>
        )}

        {/* Side labels */}
        {hasBudget && (
          <text x={trackX - 14} y={budgetBarY + budgetBarH / 2 + 4}
                fontSize={12} fill={COL.textPrimary} textAnchor="end" fontWeight={700}
                letterSpacing="0.04em">BUDGET</text>
        )}
        {hasPlanning && (
          <text x={trackX - 14} y={planBarY + planBarH / 2 + 4}
                fontSize={12} fill={COL.textPrimary} textAnchor="end" fontWeight={700}
                letterSpacing="0.04em">PLANNING</text>
        )}

        {/* Stems for budget labels */}
        {hasBudget && budgetLabels.map(renderBudgetStem)}

        {/* Stems for planning leader (% time) */}
        {hasPlanning && planLabels.map(renderPlanLeader)}

        {/* "Planifié" stem (dashed, only when overrun) */}
        {hasPlanning && overrunMs > 0 && (
          <>
            <line x1={xPlannedEnd} y1={plannedLabelBotY + 5} x2={xPlannedEnd} y2={planBarY}
                  stroke={COL.textTertiary} strokeWidth={1.6} strokeDasharray="3,2" opacity={0.95} />
            <line x1={xPlannedEnd} y1={planBarY} x2={xPlannedEnd} y2={planBarBot}
                  stroke={COL.textTertiary} strokeWidth={1.6} strokeDasharray="3,2" opacity={0.85} />
          </>
        )}

        {/* Today marker */}
        {showTodayMarker && (
          <line x1={xNow} y1={planBarY} x2={xNow} y2={planLabelTopY - 14}
                stroke={COL.textPrimary} strokeWidth={1.8} opacity={0.9} />
        )}

        {/* ── Budget bar ── */}
        {hasBudget && (
          <>
            <rect x={trackX} y={budgetBarY} width={trackW} height={budgetBarH}
                  fill={COL.track} stroke={COL.border} strokeWidth={0.5} rx={2} />
            <rect x={trackX} y={budgetBarY + 2} width={wBudgetZone} height={budgetBarH - 4} fill={COL.zoneBudget} />
            <rect x={trackX} y={budgetBarY + 2} width={wCommitted} height={budgetBarH - 4} fill={COL.committed} />
            {isOver && (
              <rect x={xAfe} y={budgetBarY + 2} width={wOver} height={budgetBarH - 4} fill={COL.overrun} opacity={0.92} />
            )}
            {renderCommittedPct()}
          </>
        )}

        {/* Budget overrun % */}
        {hasBudget && isOver && (() => {
          const overPct = ((forecast - afe) / afe) * 100
          const txt = `+${fmtPct(overPct)}%`
          const whiteZoneW = trackRight - xForecast
          if (whiteZoneW >= 42) {
            return <text x={xForecast + 5} y={budgetBarY + budgetBarH / 2 + 4}
                         fontSize={13} fontWeight={700} fill={COL.overrunText} textAnchor="start">{txt}</text>
          }
          return <text x={xAfe + wOver / 2} y={budgetBarBot + 13}
                       fontSize={12} fontWeight={700} fill={COL.overrunText} textAnchor="middle">{txt}</text>
        })()}

        {/* ── Budget labels (above the bar) ── */}
        {hasBudget && budgetLabels.map((l, i) => (
          <g key={`bl-${i}`}>
            <text x={l.labelX} y={budgetLabelTopY}
                  fontSize={11} fill={l.color} textAnchor="middle" fontWeight={600}
                  textDecoration="underline">{l.nameText}</text>
            <text x={l.labelX} y={budgetLabelBotY}
                  fontSize={12} fill={l.color} textAnchor="middle" fontWeight={700}>{l.valueText}</text>
          </g>
        ))}

        {/* ── Planning bar ── */}
        {hasPlanning && (
          <>
            <rect x={trackX} y={planBarY} width={trackW} height={planBarH}
                  fill={COL.track} stroke={COL.border} strokeWidth={0.5} rx={2} />
            <rect x={trackX} y={planBarY + 2} width={Math.max(0, wPlanned)} height={planBarH - 4} fill={COL.zoneBudget} />
            {wProgress > 0 && (
              <rect x={trackX} y={planBarY + 2} width={wProgress} height={planBarH - 4} fill={COL.committed} />
            )}
            {overrunMs > 0 && (
              <rect x={xPlannedEnd} y={planBarY + 2} width={wPlanOverrun} height={planBarH - 4} fill={COL.overrun} opacity={0.92} />
            )}
            {renderProgressPct()}
          </>
        )}

        {/* Planning overrun "+X mois" below red zone */}
        {hasPlanning && overrunMs > 0 && (
          <text x={xPlannedEnd + wPlanOverrun / 2} y={planBarBot + 13}
                fontSize={12} fontWeight={700} fill={COL.overrunText} textAnchor="middle">
            {fmtOverrunDuration(overrunMs / 86_400_000)}
          </text>
        )}

        {/* "Planifié" label above planning bar (only when overrun) */}
        {hasPlanning && overrunMs > 0 && (() => {
          const x = Math.max(trackX + 30, Math.min(trackRight - 30, xPlannedEnd))
          return (
            <>
              <text x={x} y={plannedLabelTopY}
                    fontSize={11} fill={COL.textTertiary} textAnchor="middle" fontWeight={600}
                    textDecoration="underline">Planifié</text>
              <text x={x} y={plannedLabelBotY}
                    fontSize={12} fill={COL.textTertiary} textAnchor="middle" fontWeight={700}>
                {fmtShortDate(plannedEndISO)}
              </text>
            </>
          )
        })()}

        {/* Planning labels (below the planning bar) */}
        {hasPlanning && planLabels.map((l, i) => (
          <g key={`pll-${i}`}>
            <text x={l.labelX} y={planLabelTopY}
                  fontSize={11} fill={l.color} textAnchor="middle" fontWeight={600}
                  textDecoration="underline">{l.nameText}</text>
            {l.valueText && (
              <text x={l.labelX} y={planLabelBotY}
                    fontSize={12} fill={l.color} textAnchor="middle" fontWeight={700}>{l.valueText}</text>
            )}
          </g>
        ))}

        {/* Outer date labels */}
        {hasPlanning && (
          <>
            <text x={trackX} y={dateBandY} fontSize={12} fontWeight={600}
                  fill={COL.textPrimary} textAnchor="start">{fmtShortDate(startISO)}</text>
            <text x={trackRight} y={dateBandY} fontSize={12} fontWeight={600}
                  fill={COL.textPrimary} textAnchor="end">
              {fmtShortDate(fcEndISO || plannedEndISO)}
            </text>
          </>
        )}
      </svg>
    </div>
  )
}
