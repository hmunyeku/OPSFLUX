/**
 * GanttDependencies — SVG overlay for dependency arrows between bars.
 *
 * Supports 4 dependency types (FS, SS, FF, SF) with bezier curves.
 * Critical path arrows rendered in red with thicker stroke.
 */
// GanttDependencies — SVG arrows
import type { GanttDependencyData } from './ganttTypes'

interface BarPosition {
  left: number
  width: number
  rowIdx: number
}

interface GanttDependenciesProps {
  dependencies: GanttDependencyData[]
  barPositions: Map<string, BarPosition>
  rowHeight: number
  totalWidth: number
  totalHeight: number
}

export function GanttDependencies({
  dependencies, barPositions, rowHeight, totalWidth, totalHeight,
}: GanttDependenciesProps) {
  if (!dependencies.length) return null

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
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L8,3 L0,6 Z" fill="#94a3b8" />
        </marker>
        <marker
          id="gantt-arrow-critical"
          markerWidth="8"
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L8,3 L0,6 Z" fill="#ef4444" />
        </marker>
      </defs>

      {dependencies.map((dep) => {
        const from = barPositions.get(dep.fromId)
        const to = barPositions.get(dep.toId)
        if (!from || !to) return null

        const fromCY = from.rowIdx * rowHeight + rowHeight / 2
        const toCY = to.rowIdx * rowHeight + rowHeight / 2

        let x1: number, y1: number, x2: number, y2: number

        switch (dep.type) {
          case 'FS': // Finish to Start
            x1 = from.left + from.width
            y1 = fromCY
            x2 = to.left
            y2 = toCY
            break
          case 'SS': // Start to Start
            x1 = from.left
            y1 = fromCY
            x2 = to.left
            y2 = toCY
            break
          case 'FF': // Finish to Finish
            x1 = from.left + from.width
            y1 = fromCY
            x2 = to.left + to.width
            y2 = toCY
            break
          case 'SF': // Start to Finish
            x1 = from.left
            y1 = fromCY
            x2 = to.left + to.width
            y2 = toCY
            break
        }

        // Bezier curve with smart control points
        const dx = Math.abs(x2 - x1)
        const cpOffset = Math.max(20, Math.min(dx * 0.4, 60))

        let d: string
        if (dep.type === 'FS' && x2 > x1 + 10) {
          // Simple forward FS — smooth S-curve
          d = `M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`
        } else if (dep.type === 'FS') {
          // Backward FS — route around via bottom
          const midY = Math.max(y1, y2) + rowHeight * 0.8
          d = `M ${x1} ${y1} L ${x1 + 12} ${y1} Q ${x1 + 12} ${midY}, ${(x1 + x2) / 2} ${midY} Q ${x2 - 12} ${midY}, ${x2 - 12} ${y2} L ${x2} ${y2}`
        } else {
          // Other types — simple bezier
          const midX = (x1 + x2) / 2
          d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
        }

        const isCritical = dep.isCritical
        return (
          <path
            key={`${dep.fromId}-${dep.toId}`}
            d={d}
            fill="none"
            stroke={isCritical ? '#ef4444' : '#94a3b8'}
            strokeWidth={isCritical ? 2 : 1.5}
            strokeDasharray={isCritical ? undefined : '6 3'}
            markerEnd={`url(#gantt-arrow-${isCritical ? 'critical' : 'normal'})`}
            opacity={0.7}
          />
        )
      })}
    </svg>
  )
}
