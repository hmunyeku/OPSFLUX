/**
 * GroupedDataTable — DataTable with expandable parent/child rows.
 *
 * Uses @tanstack/react-table with getExpandedRowModel + getSubRows.
 * Same visual style as the main DataTable (Pajamas design system).
 * HTML table rendering (not Glide) for expand/collapse support.
 *
 * Usage:
 *   <GroupedDataTable
 *     data={groupedData}           // parent items with subRows
 *     columns={columns}
 *     getSubRows={(row) => row.children}
 *     searchValue={search}
 *     onSearchChange={setSearch}
 *   />
 */
import { useState, useMemo, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
  type ExpandedState,
  type PaginationState,
  type ColumnDef,
  type Row,
} from '@tanstack/react-table'
import { ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataTablePaginationBar } from '@/components/ui/DataTable/Pagination'
import type { LucideIcon } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────

export interface GroupedDataTableProps<TData> {
  /** Data with nested subRows */
  data: TData[]
  /** Column definitions — same as @tanstack/react-table */
  columns: ColumnDef<TData, any>[]
  /** Function to extract sub-rows from a parent row */
  getSubRows?: (row: TData) => TData[] | undefined
  /** Loading state */
  isLoading?: boolean
  /** Search value (controlled) */
  searchValue?: string
  /** Search change handler */
  onSearchChange?: (value: string) => void
  /** Search placeholder */
  searchPlaceholder?: string
  /** Row click handler */
  onRowClick?: (row: TData) => void
  /** Empty state */
  emptyIcon?: LucideIcon
  emptyTitle?: string
  /** Global filter function */
  globalFilterFn?: (row: Row<TData>, columnId: string, filterValue: string) => boolean
  /** CSS class for the container */
  className?: string
  /** Extra toolbar content (right side) */
  toolbarRight?: React.ReactNode
  /**
   * Optional CLIENT-side pagination on the parent (group) rows.
   * When omitted → no pagination (current behavior, all rows rendered).
   * When provided → paginate parent rows; child/sub-rows stay attached to
   * their parent. A compact footer (DataTablePaginationBar) is rendered.
   */
  pageSize?: number
  /** Page-size options for the pagination footer selector. */
  pageSizeOptions?: number[]
  /**
   * Bump this number to expand ALL rows. Each change of value triggers a
   * full expand (table.toggleAllRowsExpanded(true)). Omitted → no effect.
   */
  expandAllSignal?: number
  /**
   * Bump this number to collapse ALL rows. Each change of value triggers a
   * full collapse (table.toggleAllRowsExpanded(false)). Omitted → no effect.
   */
  collapseAllSignal?: number
}

// ── Component ────────────────────────────────────────────────────────────

export function GroupedDataTable<TData>({
  data,
  columns,
  getSubRows,
  isLoading,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Filtrer les résultats...',
  onRowClick,
  emptyIcon,
  emptyTitle = 'Aucun résultat',
  globalFilterFn,
  className,
  toolbarRight,
  pageSize,
  pageSizeOptions = [25, 50, 100],
  expandAllSignal,
  collapseAllSignal,
}: GroupedDataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [expanded, setExpanded] = useState<ExpandedState>(true) // all expanded by default

  // Client pagination is opt-in: only wired when `pageSize` is provided so
  // the default (no pagination) behavior stays byte-for-byte unchanged.
  const paginationEnabled = typeof pageSize === 'number' && pageSize > 0
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSize ?? 50,
  })

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      expanded,
      globalFilter: searchValue,
      ...(paginationEnabled ? { pagination } : {}),
    },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    onPaginationChange: paginationEnabled ? setPagination : undefined,
    getSubRows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    // Only attach the pagination row model when paginating — without it the
    // table renders every row (unchanged default).
    getPaginationRowModel: paginationEnabled ? getPaginationRowModel() : undefined,
    // Paginate on the parent (group) rows, not the flattened children.
    paginateExpandedRows: false,
    autoResetPageIndex: false,
    globalFilterFn: globalFilterFn ?? 'includesString',
    onGlobalFilterChange: onSearchChange,
  })

  // Déplier / replier tout — déclenché par un changement de signal (compteur).
  // Sans la prop → aucun effet (children dépliés par défaut comme avant).
  useEffect(() => {
    if (expandAllSignal === undefined) return
    table.toggleAllRowsExpanded(true)
  }, [expandAllSignal, table])

  useEffect(() => {
    if (collapseAllSignal === undefined) return
    table.toggleAllRowsExpanded(false)
  }, [collapseAllSignal, table])

  // Reset to first page when the active filter shrinks the dataset below the
  // current page (avoids landing on an empty page after a status filter).
  useEffect(() => {
    if (!paginationEnabled) return
    const pageCount = table.getPageCount()
    if (pageCount > 0 && pagination.pageIndex > pageCount - 1) {
      setPagination((p) => ({ ...p, pageIndex: 0 }))
    }
  }, [paginationEnabled, pagination.pageIndex, table, data])

  const rows = table.getRowModel().rows

  // Count flat items (non-parent rows)
  const totalItems = useMemo(() => {
    let count = 0
    for (const row of rows) {
      if (row.subRows.length > 0) count += row.subRows.length
      else count++
    }
    return count
  }, [rows])

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background shrink-0">
        {onSearchChange && (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Search size={13} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground min-w-0"
            />
          </div>
        )}
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {totalItems} résultat{totalItems !== 1 ? 's' : ''}
        </span>
        {toolbarRight}
      </div>

      {/* ── Loading ── */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Empty ── */}
      {!isLoading && rows.length === 0 && (
        <EmptyState icon={emptyIcon} title={emptyTitle} />
      )}

      {/* ── Table ── */}
      {!isLoading && rows.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            {/* Header */}
            <thead className="sticky top-0 z-10 bg-chrome border-b border-border">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className={cn(
                        'px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap select-none',
                        header.column.getCanSort() && 'cursor-pointer hover:text-foreground',
                      )}
                      style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' && <ArrowUp size={11} />}
                        {header.column.getIsSorted() === 'desc' && <ArrowDown size={11} />}
                        {header.column.getCanSort() && !header.column.getIsSorted() && (
                          <ArrowUpDown size={10} className="opacity-30" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>

            {/* Body */}
            <tbody className="divide-y divide-border/50">
              {rows.map((row) => {
                const isParent = row.subRows.length > 0
                const depth = row.depth

                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'transition-colors',
                      isParent
                        ? 'bg-muted/30 hover:bg-muted/50 cursor-pointer font-medium'
                        : 'hover:bg-muted/20',
                      depth > 0 && 'text-foreground',
                      onRowClick && !isParent && 'cursor-pointer',
                    )}
                    onClick={() => {
                      if (isParent) row.toggleExpanded()
                      else if (onRowClick) onRowClick(row.original)
                    }}
                  >
                    {row.getVisibleCells().map((cell, cellIdx) => (
                      <td
                        key={cell.id}
                        className={cn(
                          'px-3 py-1.5 whitespace-nowrap',
                          cellIdx === 0 && depth > 0 && 'pl-8',
                        )}
                      >
                        {/* Expand toggle on first cell of parent rows */}
                        {cellIdx === 0 && isParent ? (
                          <div className="flex items-center gap-1.5">
                            <ChevronRight
                              size={13}
                              className={cn(
                                'shrink-0 text-muted-foreground transition-transform duration-150',
                                row.getIsExpanded() && 'rotate-90',
                              )}
                            />
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination (opt-in via `pageSize`) ── */}
      {paginationEnabled && !isLoading && rows.length > 0 && (
        <DataTablePaginationBar
          pagination={{
            page: table.getState().pagination.pageIndex + 1,
            pageSize: table.getState().pagination.pageSize,
            // Total = nombre de lignes-groupes parentes (depth 0) avant
            // pagination — pas les sous-lignes : la pagination porte sur les
            // parents. `paginateExpandedRows: false` garde les enfants
            // rattachés à leur parent sur la page courante.
            total: table.getPrePaginationRowModel().rows.filter((r) => r.depth === 0).length,
            pages: table.getPageCount(),
          }}
          onPageChange={(p) => table.setPageIndex(p - 1)}
          onPageSizeChange={(size) => {
            table.setPageSize(size)
            table.setPageIndex(0)
          }}
          pageSizeOptions={pageSizeOptions}
        />
      )}
    </div>
  )
}
