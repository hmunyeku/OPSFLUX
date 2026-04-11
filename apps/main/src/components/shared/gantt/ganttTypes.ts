/**
 * Gantt Types — Shared interfaces for the GanttCore component system.
 *
 * These types are designed to be generic enough for both Projets (tasks)
 * and Planner (activities) while supporting all pro-level features:
 * grid columns, dependencies, milestones, baselines, critical path,
 * progress, drag/resize, inline edit, context menu.
 */

import type { ReactNode } from 'react'
import type { TimeScale } from './ganttEngine'

// ── Row (left panel) ─────────────────────────────────────────────

export interface GanttRow {
  id: string
  /** Display label in the left panel */
  label: string
  /**
   * Optional suffix rendered AFTER the label in a muted color, so
   * callers can append side-information (e.g. max POB capacity
   * "[900]") without it competing visually with the asset name.
   * Kept as a plain string so the panel's left-column truncation and
   * accessibility tree still treat it as text.
   */
  labelSuffix?: string
  /** Secondary text (e.g., status, assignee) */
  sublabel?: string
  /** Nesting depth (0 = root) */
  level: number
  /** Whether this row has child rows */
  hasChildren: boolean
  /** Accent color for the row indicator */
  color?: string
  /** Custom icon to show before the label */
  icon?: ReactNode
  /** Additional data columns (keyed by column id) */
  columns?: Record<string, string | number | null>
  /**
   * Optional per-cell heatmap overlay. When present, the timeline area for
   * this row is filled with colored cells matching the timeline's cells.
   * Each entry references a cell index from the gantt's `buildCells` output.
   */
  heatmapCells?: GanttHeatmapCell[]
  /**
   * Optional per-row height override (in pixels). When omitted, the row uses
   * the global `settings.rowHeight`. Useful for visually distinguishing
   * heatmap rows (compact) from activity rows (taller).
   */
  rowHeight?: number
}

/** A single heatmap cell rendered as a row background */
export interface GanttHeatmapCell {
  /** Cell index in the timeline cells array (matches buildCells output) */
  cellIdx: number
  /** Background color (CSS color string) */
  color: string
  /** Numeric value (saturation %, count, etc.) — used for label / accessibility */
  value: number
  /** Optional pre-rendered tooltip HTML (shown on cell hover) */
  tooltipHTML?: string
  /** Optional inline label (e.g. "85%") shown when there is enough room */
  label?: string
  /** Optional opacity override (0-1). Defaults to 1. Used to fade out 0-value cells. */
  opacity?: number
  /**
   * Optional STACKED BAR payload. When present, the cell is rendered
   * as a vertical stack of colored segments (bottom-up) instead of a
   * single flat rectangle — used by the Planner "Plan de charge" row
   * to break a cell's total pax down by activity type. Each segment's
   * vertical height is `value / stackMax` of the cell's inner height,
   * so values must be normalized by the CALLER against a shared
   * per-row max (typically the highest total across all cells in the
   * same row, so bar heights compare fairly across the timeline).
   */
  stacks?: Array<{ color: string; value: number; label?: string }>
  /** Per-row normalization max used when rendering `stacks`. */
  stackMax?: number
}

// ── Column (grid config) ─────────────────────────────────────────

export interface GanttColumn {
  /** Unique column key (matches GanttRow.columns keys) */
  id: string
  /** Column header label */
  label: string
  /** Column width in pixels */
  width: number
  /** Minimum width */
  minWidth?: number
  /** Text alignment */
  align?: 'left' | 'center' | 'right'
  /** Whether this column is sortable */
  sortable?: boolean
  /** Whether cells in this column are editable (double-click to edit) */
  editable?: boolean
  /** Input type for editing: text, date, number */
  editType?: 'text' | 'date' | 'number'
  /** Custom cell renderer */
  render?: (row: GanttRow) => ReactNode
}

/** Callback when a grid cell is edited */
export type OnCellEdit = (rowId: string, columnId: string, value: string) => void

// ── Bar (timeline) ───────────────────────────────────────────────

export interface GanttBarData {
  id: string
  /** Which row this bar belongs to */
  rowId: string
  /** Bar label (shown on the bar when space permits) */
  title: string
  /** ISO date strings */
  startDate: string
  endDate: string
  /** Progress 0-100 */
  progress?: number
  /** Override color (otherwise resolved from status/priority/type) */
  color?: string
  /** Status for color resolution */
  status?: string
  /** Priority for color resolution */
  priority?: string
  /** Activity type for color resolution */
  type?: string
  /** Render as diamond milestone */
  isMilestone?: boolean
  /** Render as summary/parent bar (bracket style, not a filled bar) */
  isSummary?: boolean
  /** 50% opacity for draft items */
  isDraft?: boolean
  /** Red ring for critical path items */
  isCritical?: boolean
  /** Whether this bar can be dragged */
  draggable?: boolean
  /** Whether this bar can be resized from edges */
  resizable?: boolean
  /** Baseline dates (planned vs actual) — shown as ghost bar */
  baselineStart?: string
  baselineEnd?: string
  /** Custom tooltip content */
  tooltipLines?: [string, string][]
  /** Any extra data (available in callbacks) */
  meta?: Record<string, unknown>
  /**
   * Optional per-cell labels rendered inside the bar (e.g. PAX values aligned
   * with the timeline cells under the bar). Each entry references a cell index
   * from the gantt's `buildCells` output.
   */
  cellLabels?: Array<{ cellIdx: number; label: string }>
  /**
   * Optional external title rendered just outside the bar instead of on top
   * of it. Use bar.title for the on-bar text. The position controls which side
   * the external title appears on.
   */
  externalTitle?: string
  externalTitlePosition?: 'before' | 'after'
}

// ── Dependency ───────────────────────────────────────────────────

export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF'

export interface GanttDependencyData {
  /** Source bar ID */
  fromId: string
  /** Target bar ID */
  toId: string
  /** Dependency type */
  type: DependencyType
  /** Highlight as critical path */
  isCritical?: boolean
  /** Lag in days (positive = delay, negative = overlap) */
  lag?: number
}

// ── Marker (vertical line on timeline) ───────────────────────────

export interface GanttMarker {
  /** ISO date string */
  date: string
  /** Label shown at the top */
  label: string
  /** Line color */
  color?: string
  /** Dashed line style */
  dashed?: boolean
}

// ── Context menu ─────────────────────────────────────────────────

export interface GanttContextMenuItem {
  id: string
  label: string
  icon?: ReactNode
  disabled?: boolean
  danger?: boolean
  separator?: boolean
}

// ── Settings ─────────────────────────────────────────────────────

export interface GanttSettings {
  /** Bar height in pixels */
  barHeight: number
  /** Row height in pixels */
  rowHeight: number
  /** Show task labels on bars */
  showLabels: boolean
  /** Show progress fill on bars */
  showProgress: boolean
  /** Show baseline ghost bars */
  showBaselines: boolean
  /** Show dependency arrows */
  showDependencies: boolean
  /** Show today marker */
  showToday: boolean
  /** Show weekend highlighting */
  showWeekends: boolean
  /** Zoom factor (0.25 to 4.0) */
  zoomFactor: number
  /** Current time scale */
  scale: TimeScale
  /** Hidden statuses (filter) */
  hiddenStatuses: string[]
  /** Hidden priorities (filter) */
  hiddenPriorities: string[]
  /** Filter by assignee substring */
  filterAssignee: string | null
  /** Hidden column IDs */
  hiddenColumns: string[]
  /** Custom column widths (overrides default) */
  columnWidths: Record<string, number>
}

export const DEFAULT_SETTINGS: GanttSettings = {
  barHeight: 22,
  rowHeight: 36,
  showLabels: true,
  showProgress: true,
  showBaselines: false,
  showDependencies: true,
  showToday: true,
  showWeekends: true,
  zoomFactor: 1.0,
  scale: 'month',
  hiddenStatuses: [],
  hiddenPriorities: [],
  filterAssignee: null,
  hiddenColumns: [],
  columnWidths: {},
}

// ── Presets ──────────────────────────────────────────────────────

export interface GanttPreset {
  name: string
  settings: Omit<GanttSettings, 'filterAssignee'>
  viewStart: string
  viewEnd: string
}

// ── Props ────────────────────────────────────────────────────────

export interface GanttCoreProps {
  // ── Data ──
  rows: GanttRow[]
  bars: GanttBarData[]
  dependencies?: GanttDependencyData[]
  markers?: GanttMarker[]
  columns?: GanttColumn[]

  // ── Initial state ──
  initialScale?: TimeScale
  initialStart?: string
  initialEnd?: string
  initialSettings?: Partial<GanttSettings>

  // ── Callbacks ──
  onBarClick?: (barId: string, meta?: Record<string, unknown>) => void
  onBarDoubleClick?: (barId: string) => void
  /** Called when bar title is edited inline (double-click on bar label) */
  onBarTitleEdit?: (barId: string, newTitle: string) => void
  onBarDrag?: (barId: string, newStart: string, newEnd: string) => void
  onBarResize?: (barId: string, edge: 'left' | 'right', newDate: string) => void
  onRowClick?: (rowId: string) => void
  onContextMenu?: (barId: string, x: number, y: number) => void
  /** Called when a grid cell is edited inline */
  onCellEdit?: OnCellEdit

  // ── Filters config ──
  /** Available status values for settings filter */
  statusOptions?: { value: string; label: string; color?: string }[]
  /** Available priority values for settings filter */
  priorityOptions?: { value: string; label: string; color?: string }[]

  // ── Presets ──
  /** Saved presets (loaded from user preferences) */
  presets?: GanttPreset[]
  /** Called when a preset is saved/deleted */
  onPresetsChange?: (presets: GanttPreset[]) => void

  // ── Expand/collapse ──
  expandedRows?: Set<string>
  onToggleRow?: (rowId: string) => void

  // ── Settings ──
  onSettingsChange?: (settings: GanttSettings) => void
  /** Called when scale or date range changes (for persistence) */
  onViewChange?: (scale: string, viewStart: string, viewEnd: string) => void

  // ── UI ──
  emptyMessage?: string
  isLoading?: boolean
  /** Show the settings toolbar */
  showToolbar?: boolean
  /** Show the grid left panel */
  showGrid?: boolean
  /** Min height of the Gantt container */
  minHeight?: number | string
  /** Class name for the outer container */
  className?: string
  /**
   * Optional extra sections injected at the bottom of the settings panel.
   * Used by GanttView to add Planner-specific customization (levels, scope
   * filters, totals, heatmap text mode, bar title position) to the same
   * settings panel that opens via the toolbar gear button.
   *
   * When a function is passed, it is called with the *live* GanttCore
   * settings so the extra section can react to in-panel edits (e.g. the
   * Planner heatmap row height slider needs to cap at the current barHeight).
   */
  extraSettingsContent?: ReactNode | ((settings: GanttSettings) => ReactNode)

  // ── Toolbar actions ──
  /** Show action buttons (add task, milestone, indent) in toolbar */
  showActions?: boolean
  onAddTask?: () => void
  onAddMilestone?: () => void
  onIndent?: (rowId: string) => void
  onOutdent?: (rowId: string) => void
  onDeleteRow?: (rowId: string) => void
  /** Called when user drags a link between two bars */
  onCreateDependency?: (fromBarId: string, toBarId: string, type: 'FS' | 'SS' | 'FF' | 'SF') => void
  /** Called when user selects a dependency arrow and hits Delete */
  onDeleteDependency?: (fromBarId: string, toBarId: string, type: 'FS' | 'SS' | 'FF' | 'SF') => void
  /** Called when the user double-clicks a dependency arrow (to edit it) */
  onEditDependency?: (fromBarId: string, toBarId: string, type: 'FS' | 'SS' | 'FF' | 'SF') => void
  /**
   * Called when the user picks "PDF" in the export menu. The consumer
   * is responsible for building a payload from its own state and POSTing
   * it to the system PDF template endpoint. No screenshot is involved —
   * the PDF is rendered server-side as a vector document.
   * When undefined, the export menu only offers "Image PNG".
   */
  onExportPdf?: () => void | Promise<void>
  /** Called when user presses Ctrl+Z */
  onUndo?: () => void
  /** Called when user presses Ctrl+Y */
  onRedo?: () => void
  /** Currently selected row (for indent/outdent context) */
  selectedRowId?: string | null
  onSelectRow?: (rowId: string | null) => void
}
