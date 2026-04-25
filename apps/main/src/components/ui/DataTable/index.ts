/**
 * DataTable — universal table component.
 *
 * Usage:
 *   import { DataTable, AvatarCell, BadgeCell, DateCell } from '@/components/ui/DataTable'
 *
 *   <DataTable
 *     columns={columns}
 *     data={data}
 *     pagination={{ page, pageSize, total, pages }}
 *     onPaginationChange={(page, size) => { ... }}
 *     selectable
 *     sortable
 *     columnVisibility
 *     viewModes={['table', 'grid']}
 *     onRowClick={(row) => openPanel(row.id)}
 *     storageKey="users"
 *   />
 */
export { DataTable } from './DataTable'
export { AvatarCell, BadgeCell, DateCell, BooleanCell } from './cells'
export { DataTableToolbar } from './Toolbar'
export { DataTablePaginationBar } from './Pagination'
export { relativeTime, formatDate, getAvatarColor } from './utils'

// Re-export types
export type {
  DataTableProps,
  DataTablePagination,
  DataTableFilterDef,
  DataTableFilterOption,
  DataTableBatchAction,
  InlineEditConfig,
  ImportExportConfig,
  CardRendererProps,
  ViewMode,
  ExportFormat,
  AvatarCellConfig,
  FilterOperator,
  ActiveFilterToken,
} from './types'

export { FILTER_OPERATOR_LABELS } from './types'
