/**
 * GanttDependencies — SVG overlay for dependency arrows between bars.
 *
 * Uses MS-Project style orthogonal step routing so the arrows feel
 * predictable and don't overlap the bars. Supports all 4 dependency
 * types (FS, SS, FF, SF) and critical-path highlighting.
 */
import type { GanttDependencyData } from './ganttTypes'

interface BarPosition {
  left: number
  width: number
  rowIdx: number
}

interface GanttDependenciesProps {
  dependencies: GanttDependencyData[]
  barPositions: Map<string, BarPosition>
  /** Absolute top (in px) of each row in the body. */
  rowOffsets: number[]
  /** Height of each row in px. */
  rowHeights: number[]
  /** Height of a regular task bar (centered inside its row). */
  barHeight: number
  totalWidth: number
  totalHeight: number
}

const ELBOW = 12 // px offset away from the bar edge before turning

export function GanttDependencies({
  dependencies, barPositions, rowOffsets, rowHeights, barHeight, totalWidth, totalHeight,
}: GanttDependenciesProps) {
  if (!dependencies.length) return null

  /** Vertical center of a bar, honouring variable row heights. */
  const barCY = (rowIdx: number): number => {
    const rh = rowHeights[rowIdx] ?? barHeight
    const top = (rowOffsets[rowIdx] ?? 0) + (rh - barHeight) / 2
    return top + barHeight / 2
  }

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-10"
      width={totalWidth}
      height={totalHeight}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <marker
          id="gantt-arrow-normal"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="#64748b" />
        </marker>
        <marker
          id="gantt-arrow-critical"
          markerWidth="9"
          markerHeight="9"
          refX="8"
          refY="4.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L9,4.5 L0,9 Z" fill="#ef4444" />
        </marker>
      </defs>

      {dependencies.map((dep) => {
        const from = barPositions.get(dep.fromId)
        const to = barPositions.get(dep.toId)
        if (!from || !to) return null

        const y1 = barCY(from.rowIdx)
        const y2 = barCY(to.rowIdx)

        // Anchor points and required direction for each dep type.
        // "out" = direction we leave the source, "in" = direction we enter the target.
        let x1: number, x2: number
        let outDir: 1 | -1   // +1 = leave to the right, -1 = leave to the left
        let inDir: 1 | -1    // +1 = enter from the left, -1 = enter from the right
        switch (dep.type) {
          case 'FS':
            x1 = from.left + from.width; outDir = 1
            x2 = to.left;                inDir = 1
            break
          case 'SS':
            x1 = from.left;              outDir = -1
            x2 = to.left;                inDir = 1
            break
          case 'FF':
            x1 = from.left + from.width; outDir = 1
            x2 = to.left + to.width;     inDir = -1
            break
          case 'SF':
            x1 = from.left;              outDir = -1
            x2 = to.left + to.width;     inDir = -1
            break
        }

        // Stop just before the target edge so the arrow head doesn't
        // overlap the bar.
        const arrowGap = 2
        const tipX = x2 - inDir * arrowGap

        // Orthogonal routing: leave the source horizontally by ELBOW,
        // turn vertically to the target row, then turn horizontally into
        // the target. When the natural direction is blocked (e.g. FS with
        // successor starting before predecessor), route around.
        const sameRow = from.rowIdx === to.rowIdx
        const xOut = x1 + outDir * ELBOW
        const xIn = tipX - inDir * ELBOW

        let d: string
        if (sameRow) {
          // Same-row dep — route up-and-over so it doesn't sit on top of the bar
          const rh = rowHeights[from.rowIdx] ?? barHeight
          const bump = Math.min(rh * 0.45, barHeight * 0.6 + 4)
          const yBump = y1 - bump
          d = `M ${x1} ${y1} L ${xOut} ${y1} L ${xOut} ${yBump} L ${xIn} ${yBump} L ${xIn} ${y2} L ${tipX} ${y2}`
        } else {
          // Different rows — standard 5-segment orthogonal route with a
          // midpoint at half of the total vertical travel.
          const canGoDirect =
            (outDir === 1 && inDir === 1 && xOut < xIn) ||
            (outDir === -1 && inDir === 1 && x1 - ELBOW < x2 - ELBOW) ||
            (outDir === 1 && inDir === -1 && xOut < xIn) ||
            (outDir === -1 && inDir === -1 && xIn < xOut)

          if (canGoDirect) {
            const xMid = (xOut + xIn) / 2
            d = `M ${x1} ${y1} L ${xOut} ${y1} L ${xOut} ${(y1 + y2) / 2} L ${xIn} ${(y1 + y2) / 2} L ${xIn} ${y2} L ${tipX} ${y2}`
            // Simpler path using only two elbows
            d = `M ${x1} ${y1} L ${xMid} ${y1} L ${xMid} ${y2} L ${tipX} ${y2}`
          } else {
            // Route around via the source row exit and target row entry
            d = `M ${x1} ${y1} L ${xOut} ${y1} L ${xOut} ${y2} L ${tipX} ${y2}`
          }
        }

        const isCritical = dep.isCritical
        return (
          <path
            key={`${dep.fromId}-${dep.toId}`}
            d={d}
            fill="none"
            stroke={isCritical ? '#ef4444' : '#64748b'}
            strokeWidth={isCritical ? 2 : 1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={`url(#gantt-arrow-${isCritical ? 'critical' : 'normal'})`}
            opacity={isCritical ? 0.9 : 0.75}
          />
        )
      })}
    </svg>
  )
}
