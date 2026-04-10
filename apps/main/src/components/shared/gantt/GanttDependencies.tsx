/**
 * GanttDependencies — SVG overlay for dependency arrows between bars.
 *
 * Features:
 *  - MS-Project style orthogonal step routing
 *  - Anchors land slightly below the bar center so the arrows don't cross
 *    per-cell PAX labels
 *  - Each arrow is clickable (selectable) via a wide invisible hit-area
 *    overlay path, even though the arrow stroke itself is thin
 *  - When selected, the arrow is highlighted and pressing Delete / Backspace
 *    calls onDelete with the selected dep
 *  - Critical path highlighting
 */
import { useEffect, useState } from 'react'
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
  /** Optional callback fired when the user deletes a selected arrow. */
  onDelete?: (fromId: string, toId: string, type: 'FS' | 'SS' | 'FF' | 'SF') => void
}

const ELBOW = 12 // px offset away from the bar edge before turning

/** Stable key for a dependency (used to track the selected one). */
function depKey(d: GanttDependencyData): string {
  return `${d.fromId}→${d.toId}:${d.type}`
}

export function GanttDependencies({
  dependencies, barPositions, rowOffsets, rowHeights, barHeight, totalWidth, totalHeight,
  onDelete,
}: GanttDependenciesProps) {
  const [selected, setSelected] = useState<string | null>(null)

  // Deselect when the set of deps changes (a deleted dep's key may disappear)
  useEffect(() => {
    if (!selected) return
    if (!dependencies.some((d) => depKey(d) === selected)) setSelected(null)
  }, [dependencies, selected])

  // Keyboard: Delete / Backspace removes the selected dep
  useEffect(() => {
    if (!selected || !onDelete) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return
      const dep = dependencies.find((d) => depKey(d) === selected)
      if (!dep) return
      e.preventDefault()
      onDelete(dep.fromId, dep.toId, dep.type)
      setSelected(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected, dependencies, onDelete])

  // Deselect on any outside mousedown
  useEffect(() => {
    if (!selected) return
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (!el) return
      if (!el.closest('[data-dep-path]')) setSelected(null)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [selected])

  if (!dependencies.length) return null

  /**
   * Vertical anchor for a bar — slightly below the center so arrows don't
   * run through the PAX numbers printed on the top half of the bar.
   */
  const barAnchorY = (rowIdx: number): number => {
    const rh = rowHeights[rowIdx] ?? barHeight
    const top = (rowOffsets[rowIdx] ?? 0) + (rh - barHeight) / 2
    // 72% down the bar → just under the text baseline
    return top + barHeight * 0.72
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
        <marker
          id="gantt-arrow-selected"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L10,5 L0,10 Z" fill="#2563eb" />
        </marker>
      </defs>

      {dependencies.map((dep) => {
        const from = barPositions.get(dep.fromId)
        const to = barPositions.get(dep.toId)
        if (!from || !to) return null

        const y1 = barAnchorY(from.rowIdx)
        const y2 = barAnchorY(to.rowIdx)

        // Anchor points and required direction for each dep type.
        let x1: number, x2: number
        let outDir: 1 | -1
        let inDir: 1 | -1
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

        // Stop just before the target edge so the arrow head doesn't bleed
        // into the bar.
        const arrowGap = 2
        const tipX = x2 - inDir * arrowGap
        const xOut = x1 + outDir * ELBOW
        const xIn = tipX - inDir * ELBOW

        const sameRow = from.rowIdx === to.rowIdx

        let d: string
        if (sameRow) {
          // Same-row dep — route below the bar so it doesn't sit on top
          const rh = rowHeights[from.rowIdx] ?? barHeight
          const bump = Math.min(rh * 0.35, barHeight * 0.5 + 4)
          const yBump = y1 + bump
          d = `M ${x1} ${y1} L ${xOut} ${y1} L ${xOut} ${yBump} L ${xIn} ${yBump} L ${xIn} ${y2} L ${tipX} ${y2}`
        } else {
          const canGoDirect =
            (outDir === 1 && inDir === 1 && xOut < xIn) ||
            (outDir === -1 && inDir === 1 && x1 - ELBOW < x2 - ELBOW) ||
            (outDir === 1 && inDir === -1 && xOut < xIn) ||
            (outDir === -1 && inDir === -1 && xIn < xOut)

          if (canGoDirect) {
            const xMid = (xOut + xIn) / 2
            d = `M ${x1} ${y1} L ${xMid} ${y1} L ${xMid} ${y2} L ${tipX} ${y2}`
          } else {
            d = `M ${x1} ${y1} L ${xOut} ${y1} L ${xOut} ${y2} L ${tipX} ${y2}`
          }
        }

        const key = depKey(dep)
        const isSelected = selected === key
        const isCritical = dep.isCritical
        const stroke = isSelected ? '#2563eb' : isCritical ? '#ef4444' : '#64748b'
        const strokeWidth = isSelected ? 2.5 : isCritical ? 2 : 1.4
        const opacity = isSelected ? 1 : isCritical ? 0.9 : 0.75
        const marker =
          isSelected ? 'gantt-arrow-selected' : isCritical ? 'gantt-arrow-critical' : 'gantt-arrow-normal'

        return (
          <g key={key} data-dep-path>
            {/* Visible arrow */}
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd={`url(#${marker})`}
              opacity={opacity}
              style={{ pointerEvents: 'none' }}
            />
            {/* Wide invisible hit-area for easier selection */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: 'stroke', cursor: onDelete ? 'pointer' : 'default' }}
              onMouseDown={(e) => {
                // Prevent the gantt body drag-scroll from kicking in
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.stopPropagation()
                setSelected(isSelected ? null : key)
              }}
            />
          </g>
        )
      })}
    </svg>
  )
}
