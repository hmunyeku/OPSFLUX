/**
 * DataTable — shared types for the universal table component.
 */
import type { ReactNode } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { LucideIcon } from 'lucide-react'

// ── View modes ─────────────────────────────────────────────
export type ViewMode = 'table' | 'grid' | 'cards' | 'performance'

// ── Export formats ─────────────────────────────────────────
export type ExportFormat = 'csv' | 'xlsx' | 'pdf'

// ── Pagination ─────────────────────────────────────────────
export interface DataTablePagination {
  page: number
  pageSize: number
  total: number
  pages: number
}

// ── Filter combinators (logic between tokens) ────────────
export type FilterCombinator = 'and' | 'or'

export const FILTER_COMBINATOR_LABELS: Record<FilterCombinator, string> = {
  and: 'et',
  or: 'ou',
}

// ── Filter operators ──────────────────────────────────────
export type FilterOperator = 'is' | 'is_not' | 'contains' | 'not_contains' | 'gt' | 'lt' | 'between'

export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  is: 'est',
  is_not: "n'est pas",
  contains: 'contient',
  not_contains: 'ne contient pas',
  gt: '>',
  lt: '<',
  between: 'entre',
}

// ── Filter (GitLab token-based) ────────────────────────────
export interface DataTableFilterOption {
  label: string
  value: string
  icon?: ReactNode
  count?: number
}

export interface DataTableFilterDef {
  id: string
  label: string
  type: 'select' | 'multi-select' | 'boolean' | 'date-range'
  options?: DataTableFilterOption[]
  /** Allowed operators for this filter (default: ['is']). */
  operators?: FilterOperator[]
}

/** Active filter token — rendered as a chip in the filter bar. */
export interface ActiveFilterToken {
  filterId: string
  label: string
  operator: FilterOperator
  valueLabel: string
  value: unknown
}

// ── Batch action ───────────────────────────────────────────
export interface DataTableBatchAction<TData> {
  id: string
  label: string
  icon?: ReactNode
  variant?: 'default' | 'danger'
  onAction: (rows: TData[]) => void | Promise<void>
  confirm?: boolean | string
}

// ── Inline editing ─────────────────────────────────────────

export type InlineEditorType = 'text' | 'number' | 'date' | 'select' | 'percent' | 'hours'

export interface InlineEditorDef {
  type: InlineEditorType
  /** For 'select' type: the options to show */
  options?: { value: string; label: string }[]
  /** For 'number'/'percent'/'hours': min/max/step */
  min?: number
  max?: number
  step?: number
  placeholder?: string
}

export interface InlineEditConfig<TData> {
  editableColumns: string[]
  onSave: (row: TData, columnId: string, value: unknown) => void | Promise<void>
  canEdit?: (row: TData, columnId: string) => boolean
  /** Per-column editor type. Falls back to 'text' if not specified. */
  columnEditors?: Record<string, InlineEditorDef>
}

// ── Avatar cell helper ─────────────────────────────────────
export interface AvatarCellConfig {
  avatarField?: string
  nameField: string
  subtitleField?: string
  getInitials?: (row: Record<string, unknown>) => string
}

// ── Import/Export ──────────────────────────────────────────
export interface ImportExportConfig {
  /** Which export formats to enable. */
  exportFormats?: ExportFormat[]
  /** Enable CSV import. */
  importCsv?: boolean
  /** When set, enables the Import Wizard (overrides basic CSV import). */
  importWizardTarget?: import('@/types/api').ImportTargetObject
  /** Filename prefix for exports. */
  filenamePrefix?: string
  /** Custom transform for export rows. */
  exportTransform?: (rows: Record<string, unknown>[]) => Record<string, unknown>[]
  /** Column headers mapping for export (accessorKey → human label). */
  exportHeaders?: Record<string, string>
  /** Enable the advanced export wizard. */
  advancedExport?: boolean
  /** Callback after successful import. */
  onImport?: (rows: Record<string, unknown>[]) => void | Promise<void>
  /**
   * Import template configuration.
   * When set, a "Télécharger le modèle" button appears in the import menu.
   * The template is generated as a CSV/XLSX with column headers and optional example rows.
   */
  importTemplate?: {
    /** Column definitions for the template. */
    columns: { key: string; label: string; required?: boolean; example?: string }[]
    /** Filename for the downloaded template. */
    filename?: string
    /** Include example row(s) in the template. */
    includeExamples?: boolean
  }
}

// ── Grid/Card renderer ─────────────────────────────────────
export interface CardRendererProps<TData> {
  row: TData
  selected: boolean
  onSelect: () => void
  onClick: () => void
}

// ── Column filter metadata (auto-generated filters from columns) ────
export interface ColumnFilterMeta {
  /** Filter type for this column. If omitted, column is not auto-filterable. */
  filterType?: 'text' | 'select' | 'multi-select' | 'boolean' | 'date-range'
  /** Pre-defined options for select/multi-select filters. */
  filterOptions?: DataTableFilterOption[]
  /** Custom filter label (defaults to column header). */
  filterLabel?: string
  /** Whether this column filter is server-side (default: true). */
  serverSide?: boolean
}

// ── Main DataTable props ───────────────────────────────────
export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  isLoading?: boolean
  getRowId?: (row: TData) => string

  // Pagination (server-side)
  pagination?: DataTablePagination
  onPaginationChange?: (page: number, pageSize: number) => void

  // Sorting
  sortable?: boolean
  sorting?: { id: string; desc: boolean }[]
  onSortingChange?: (sorting: { id: string; desc: boolean }[]) => void

  // Filtering (token-based, GitLab-style)
  filters?: DataTableFilterDef[]
  activeFilters?: Record<string, unknown>
  onFilterChange?: (filterId: string, value: unknown) => void
  /** Logic combinators between filter tokens (AND/OR). Clickable chips toggle between them. */
  filterCombinators?: FilterCombinator[]
  onFilterCombinatorChange?: (index: number, value: FilterCombinator) => void
  /**
   * When true, visible columns with `meta.filterType` are auto-added as filter tokens.
   * Hidden columns are excluded. Explicit `filters` take precedence over auto-generated ones.
   */
  autoColumnFilters?: boolean

  // Global search (integrated into filter bar)
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string

  // Column visibility
  columnVisibility?: boolean
  defaultHiddenColumns?: string[]

  // Row selection + batch actions
  selectable?: boolean
  batchActions?: DataTableBatchAction<TData>[]
  onSelectionChange?: (selectedRows: TData[]) => void

  // View modes
  viewModes?: ViewMode[]
  defaultViewMode?: ViewMode
  cardRenderer?: (props: CardRendererProps<TData>) => ReactNode

  // Inline editing
  inlineEdit?: InlineEditConfig<TData>

  // Import/Export
  importExport?: ImportExportConfig

  // Row click
  onRowClick?: (row: TData) => void

  // Empty state
  emptyIcon?: LucideIcon
  emptyTitle?: string
  emptyAction?: { label: string; onClick: () => void }

  // Toolbar extras
  toolbarLeft?: ReactNode
  toolbarRight?: ReactNode

  // Column resizing (drag-to-resize column widths)
  columnResizing?: boolean

  // Column pinning (sticky/frozen columns during horizontal scroll)
  columnPinning?: boolean
  /** Default pinned columns. */
  defaultPinnedColumns?: { left?: string[]; right?: string[] }

  // Styling
  className?: string
  compact?: boolean
  stickyHeader?: boolean
  storageKey?: string
}
