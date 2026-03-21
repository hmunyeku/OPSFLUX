/**
 * DataTable — universal table component.
 *
 * Built on @tanstack/react-table with GitLab Pajamas design system.
 * Compact 28px rows, token-based filtering, multi-format export.
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type VisibilityState,
  type RowSelectionState,
  type ColumnDef,
  type ColumnPinningState,
  type ColumnSizingState,
} from '@tanstack/react-table'
import { ArrowUp, ArrowDown, ArrowUpDown, Loader2, Pencil, Check, X, Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataTableToolbar } from './Toolbar'
import { DataTablePaginationBar } from './Pagination'
import { ColumnHeaderMenuPortal, useColumnHeaderMenu } from './ColumnHeaderMenu'
import type { ColumnHeaderMenuProps } from './ColumnHeaderMenu'
import { loadFromStorage, saveToStorage } from './utils'
import { ImportWizard } from '@/components/shared/ImportWizard'
import { ExportWizard } from '@/components/shared/ExportWizard'
import { GlideRenderer } from './GlideRenderer'
import type { DataTableProps, ViewMode, ExportFormat } from './types'

// ── Inline Edit Cell ───────────────────────────────────────
function InlineEditCell({
  value,
  onSave,
  onCancel,
}: {
  value: unknown
  onSave: (val: string) => void
  onCancel: () => void
}) {
  const [editValue, setEditValue] = useState(String(value ?? ''))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSave(editValue)
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => onSave(editValue)}
        className="flex-1 bg-transparent border border-primary/30 rounded px-1.5 py-0 text-xs outline-none focus:border-primary h-5"
      />
      <button onClick={() => onSave(editValue)} className="text-primary hover:text-primary/80">
        <Check size={11} />
      </button>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
        <X size={11} />
      </button>
    </div>
  )
}

// ── Sort Header Icon ───────────────────────────────────────
function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc') return <ArrowUp size={11} />
  if (sorted === 'desc') return <ArrowDown size={11} />
  return <ArrowUpDown size={11} className="text-muted-foreground/40" />
}

// ── Export helpers ──────────────────────────────────────────
async function doExport(
  format: ExportFormat,
  headers: string[],
  headerLabels: Record<string, string>,
  rows: Record<string, unknown>[],
  filename: string,
) {
  const labels = headers.map((h) => headerLabels[h] || h)

  if (format === 'csv') {
    const Papa = await import('papaparse')
    const { saveAs } = await import('file-saver')
    const csv = Papa.unparse({
      fields: labels,
      data: rows.map((r) => headers.map((h) => String(r[h] ?? ''))),
    })
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    saveAs(blob, `${filename}.csv`)
  }

  if (format === 'xlsx') {
    const XLSX = await import('xlsx')
    const wsData = [labels, ...rows.map((r) => headers.map((h) => r[h] ?? ''))]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    // Auto-width columns
    ws['!cols'] = headers.map((_, i) => ({
      wch: Math.max(labels[i].length, ...rows.map((r) => String(r[headers[i]] ?? '').length).slice(0, 50)) + 2,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data')
    XLSX.writeFile(wb, `${filename}.xlsx`)
  }

  if (format === 'pdf') {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF({ orientation: headers.length > 5 ? 'landscape' : 'portrait' })
    autoTable(doc, {
      head: [labels],
      body: rows.map((r) => headers.map((h) => String(r[h] ?? ''))),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [55, 65, 81] },
      margin: { top: 10 },
    })
    doc.save(`${filename}.pdf`)
  }
}

async function importFromCsv(file: File): Promise<Record<string, unknown>[]> {
  const Papa = await import('papaparse')
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve(result.data as Record<string, unknown>[]),
      error: (err) => reject(err),
    })
  })
}

// ── Main DataTable ─────────────────────────────────────────
export function DataTable<TData>({
  columns,
  data,
  isLoading = false,
  getRowId = (row) => String((row as Record<string, unknown>).id ?? ''),

  pagination,
  onPaginationChange,

  sortable = true,
  sorting: externalSorting,
  onSortingChange,

  filters,
  activeFilters,
  onFilterChange,
  filterCombinators,
  onFilterCombinatorChange,
  autoColumnFilters = false,

  searchValue,
  onSearchChange,
  searchPlaceholder,

  columnVisibility: enableColumnVisibility = false,
  defaultHiddenColumns = [],

  selectable = false,
  batchActions,
  onSelectionChange,

  viewModes,
  defaultViewMode = 'table',
  cardRenderer,

  inlineEdit,

  importExport,

  onRowClick,

  emptyIcon,
  emptyTitle = 'Aucun résultat',
  emptyAction,

  toolbarLeft,
  toolbarRight,

  columnResizing: enableColumnResizing = false,
  columnPinning: enableColumnPinning = false,
  defaultPinnedColumns,

  className,
  compact: _compact,
  stickyHeader = true,
  storageKey,
}: DataTableProps<TData>) {
  const prefix = storageKey ? `dt.${storageKey}` : null

  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    prefix ? loadFromStorage(`${prefix}.viewMode`, defaultViewMode) : defaultViewMode
  )

  const [columnVisibilityState, setColumnVisibilityState] = useState<VisibilityState>(() => {
    if (prefix) {
      return loadFromStorage<VisibilityState>(`${prefix}.colVis`, Object.fromEntries(defaultHiddenColumns.map((c) => [c, false])))
    }
    return Object.fromEntries(defaultHiddenColumns.map((c) => [c, false]))
  })

  const [internalSorting, setInternalSorting] = useState<SortingState>(externalSorting ?? [])
  const sorting = externalSorting ?? internalSorting

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [selectionMode, setSelectionMode] = useState(false)
  const lastSelectedIndex = useRef<number | null>(null)
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null)
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    if (prefix) return loadFromStorage<ColumnSizingState>(`${prefix}.colSize`, {})
    return {}
  })
  const [hasAutoSized, setHasAutoSized] = useState(false)
  const [columnPinningState, setColumnPinningState] = useState<ColumnPinningState>(() => {
    const defaultPins = defaultPinnedColumns ?? {}
    return { left: defaultPins.left ?? [], right: defaultPins.right ?? [] }
  })

  const [showImportWizard, setShowImportWizard] = useState(false)
  const [exportWizardOpen, setExportWizardOpen] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const { menu: headerMenu, openMenu: openHeaderMenu, closeMenu: closeHeaderMenu } = useColumnHeaderMenu()

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    if (prefix) saveToStorage(`${prefix}.viewMode`, mode)
  }, [prefix])

  const handleColumnVisibilityChange = useCallback((updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
    setColumnVisibilityState((old) => {
      const next = typeof updater === 'function' ? updater(old) : updater
      if (prefix) saveToStorage(`${prefix}.colVis`, next)
      return next
    })
  }, [prefix])

  // ── Selection mode toggle + clear on exit ──
  const handleToggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => {
      if (prev) {
        // Exiting selection mode → clear selection
        setRowSelection({})
        lastSelectedIndex.current = null
      }
      return !prev
    })
  }, [])

  // ── Row click handler with selection mode support ──
  const handleRowClick = useCallback((row: TData, index: number, e: React.MouseEvent) => {
    if (!selectionMode) {
      onRowClick?.(row)
      return
    }
    const id = getRowId(row)
    if (e.shiftKey && lastSelectedIndex.current !== null) {
      // Range select
      const start = Math.min(lastSelectedIndex.current, index)
      const end = Math.max(lastSelectedIndex.current, index)
      const visibleRows = data.slice(start, end + 1)
      setRowSelection((prev) => {
        const next = { ...prev }
        visibleRows.forEach((r) => { next[getRowId(r)] = true })
        return next
      })
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle single
      setRowSelection((prev) => {
        const next = { ...prev }
        if (next[id]) delete next[id]
        else next[id] = true
        return next
      })
    } else {
      // Simple click in selection mode → toggle
      setRowSelection((prev) => {
        const next = { ...prev }
        if (next[id]) delete next[id]
        else next[id] = true
        return next
      })
    }
    lastSelectedIndex.current = index
  }, [selectionMode, onRowClick, getRowId, data])

  // ── Auto-generate column filters from visible columns ──
  const mergedFilters = useMemo(() => {
    if (!autoColumnFilters) return filters
    const explicitIds = new Set((filters ?? []).map((f) => f.id))
    const autoFilters: import('./types').DataTableFilterDef[] = []
    for (const col of columns) {
      const colId = (col as { accessorKey?: string }).accessorKey ?? (col as { id?: string }).id
      if (!colId) continue
      // Skip hidden columns
      if (columnVisibilityState[colId] === false) continue
      // Skip if already in explicit filters
      if (explicitIds.has(colId)) continue
      const meta = (col as { meta?: import('./types').ColumnFilterMeta }).meta
      if (!meta?.filterType) continue
      const header = typeof col.header === 'string' ? col.header : meta.filterLabel ?? colId
      if (meta.filterType === 'text') {
        autoFilters.push({ id: colId, label: header, type: 'select' as const, operators: ['contains', 'is'] as import('./types').FilterOperator[] })
      } else if (meta.filterType === 'select' || meta.filterType === 'multi-select') {
        autoFilters.push({ id: colId, label: header, type: meta.filterType, options: meta.filterOptions })
      } else if (meta.filterType === 'boolean') {
        autoFilters.push({ id: colId, label: header, type: 'boolean' })
      } else if (meta.filterType === 'date-range') {
        autoFilters.push({ id: colId, label: header, type: 'date-range' })
      }
    }
    return [...(filters ?? []), ...autoFilters]
  }, [autoColumnFilters, filters, columns, columnVisibilityState])

  // ── Table instance ──
  const table = useReactTable({
    data,
    columns: columns as ColumnDef<TData, unknown>[],
    state: {
      sorting,
      columnVisibility: columnVisibilityState,
      rowSelection,
      columnSizing,
      columnPinning: columnPinningState,
    },
    getRowId,
    onSortingChange: onSortingChange
      ? (updater) => {
          const next = typeof updater === 'function' ? updater(sorting) : updater
          onSortingChange(next)
        }
      : setInternalSorting,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater
      setRowSelection(next)
      if (onSelectionChange) {
        const selectedRows = Object.keys(next)
          .filter((k) => next[k])
          .map((id) => data.find((row) => getRowId(row) === id))
          .filter(Boolean) as TData[]
        onSelectionChange(selectedRows)
      }
    },
    onColumnSizingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(columnSizing) : updater
      setColumnSizing(next)
      if (prefix) saveToStorage(`${prefix}.colSize`, next)
    },
    onColumnPinningChange: setColumnPinningState,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: !onSortingChange ? getSortedRowModel() : undefined,
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: selectable,
    enableMultiRowSelection: selectable,
    enableColumnResizing: enableColumnResizing,
    columnResizeMode: 'onChange',
    manualPagination: !!pagination,
    manualSorting: !!onSortingChange,
  })

  // ── Auto-size columns based on content ──
  useEffect(() => {
    if (!enableColumnResizing || hasAutoSized || data.length === 0) return
    // Skip if user already has stored sizes
    const storedSizes = prefix ? loadFromStorage<ColumnSizingState>(`${prefix}.colSize`, {}) : {}
    if (Object.keys(storedSizes).length > 0) {
      setHasAutoSized(true)
      return
    }

    const CHAR_WIDTH = 7.5 // approx px per char at text-xs
    const PADDING = 28 // px padding (px-3 = 12px each side + some buffer)
    const MIN_WIDTH = 50
    const MAX_WIDTH = 400
    const HEADER_EXTRA = 20 // extra space for sort icon

    const sampleRows = data.slice(0, 30)
    const newSizing: ColumnSizingState = {}

    table.getVisibleLeafColumns().forEach((col) => {
      // Skip columns with explicit fixed sizes (select, status badges, etc.)
      if (col.id === '_select') return
      const explicitSize = col.columnDef.size
      if (explicitSize && explicitSize !== 150) return // 150 is tanstack default

      // Measure header text width
      const headerText = typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id
      const headerWidth = headerText.length * CHAR_WIDTH + PADDING + HEADER_EXTRA

      // Measure content width from sample rows
      let maxContentWidth = 0
      sampleRows.forEach((row) => {
        const record = row as Record<string, unknown>
        const accessor = col.id
        let val = record[accessor]
        // Handle accessorFn columns
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const def = col.columnDef as any
        if (val === undefined && def.accessorFn) {
          val = def.accessorFn(row, 0)
        }
        if (val !== undefined && val !== null) {
          const text = String(val)
          const width = text.length * CHAR_WIDTH + PADDING
          if (width > maxContentWidth) maxContentWidth = width
        }
      })

      const idealWidth = Math.max(headerWidth, maxContentWidth)
      const clampedWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, idealWidth))

      // Only set if different from default
      if (clampedWidth !== 150) {
        newSizing[col.id] = clampedWidth
      }
    })

    if (Object.keys(newSizing).length > 0) {
      setColumnSizing(newSizing)
    }
    setHasAutoSized(true)
  }, [enableColumnResizing, hasAutoSized, data, table, prefix])

  // ── Column visibility info ──
  const colVisInfo = useMemo(() => {
    return table.getAllLeafColumns()
      .filter((c) => c.id !== '_select')
      .map((c) => ({
        id: c.id,
        header: typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id,
        isVisible: c.getIsVisible(),
      }))
  }, [table, columnVisibilityState])

  // ── Export handler ──
  const handleExport = useCallback(async (format: ExportFormat) => {
    const visibleCols = table.getVisibleLeafColumns().filter((c) => c.id !== '_select')
    const headers = visibleCols.map((c) => c.id)
    const headerLabels: Record<string, string> = {}
    visibleCols.forEach((col) => {
      headerLabels[col.id] = importExport?.exportHeaders?.[col.id]
        ?? (typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id)
    })
    let rows = data.map((row) => {
      const obj: Record<string, unknown> = {}
      visibleCols.forEach((col) => {
        obj[col.id] = (row as Record<string, unknown>)[col.id]
      })
      return obj
    })
    if (importExport?.exportTransform) {
      rows = importExport.exportTransform(rows)
    }
    const fname = importExport?.filenamePrefix ?? 'export'
    await doExport(format, headers, headerLabels, rows, `${fname}_${new Date().toISOString().slice(0, 10)}`)
  }, [table, data, importExport])

  // ── Import template download handler ──
  const handleDownloadTemplate = useCallback(async () => {
    const tpl = importExport?.importTemplate
    if (!tpl) return

    const headers = tpl.columns.map((c) => {
      const label = c.label + (c.required ? ' *' : '')
      return label
    })

    const rows: string[][] = []
    if (tpl.includeExamples !== false) {
      rows.push(tpl.columns.map((c) => c.example ?? ''))
    }

    const Papa = await import('papaparse')
    const { saveAs } = await import('file-saver')
    const csv = Papa.unparse({ fields: headers, data: rows })
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const fname = tpl.filename ?? `${importExport?.filenamePrefix ?? 'import'}_modele`
    saveAs(blob, `${fname}.csv`)
  }, [importExport])

  // ── Import handler ──
  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !importExport?.onImport) return
    const rows = await importFromCsv(file)
    await importExport.onImport(rows)
    if (importInputRef.current) importInputRef.current.value = ''
  }, [importExport])

  // ── Column header context menu handler ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleHeaderContextMenu = useCallback((e: React.MouseEvent, column: any) => {
    if (!enableColumnPinning && !enableColumnResizing && !enableColumnVisibility) return
    const colId = column.id as string
    if (colId === '_select') return

    const headerText = typeof column.columnDef.header === 'string'
      ? column.columnDef.header
      : colId

    const menuProps: ColumnHeaderMenuProps = {
      columnId: colId,
      columnLabel: headerText,
      isPinned: column.getIsPinned() || false,
      canPin: enableColumnPinning,
      canHide: enableColumnVisibility !== false && column.columnDef.enableHiding !== false,
      canResize: enableColumnResizing && column.getCanResize(),
      onPinLeft: () => {
        setColumnPinningState((prev) => ({
          left: [...(prev.left ?? []).filter((id) => id !== colId), colId],
          right: (prev.right ?? []).filter((id) => id !== colId),
        }))
      },
      onPinRight: () => {
        setColumnPinningState((prev) => ({
          left: (prev.left ?? []).filter((id) => id !== colId),
          right: [...(prev.right ?? []).filter((id) => id !== colId), colId],
        }))
      },
      onUnpin: () => {
        setColumnPinningState((prev) => ({
          left: (prev.left ?? []).filter((id) => id !== colId),
          right: (prev.right ?? []).filter((id) => id !== colId),
        }))
      },
      onHide: () => {
        table.getColumn(colId)?.toggleVisibility(false)
      },
      onResetWidth: () => {
        setColumnSizing((prev) => {
          const next = { ...prev }
          delete next[colId]
          if (prefix) saveToStorage(`${prefix}.colSize`, next)
          return next
        })
      },
    }

    openHeaderMenu(e, menuProps)
  }, [enableColumnPinning, enableColumnResizing, enableColumnVisibility, table, prefix, openHeaderMenu])

  // ── Selected rows ──
  const selectedRows = useMemo(() => {
    return table.getSelectedRowModel().rows.map((r) => r.original)
  }, [table, rowSelection])

  const batchActionsSlot = batchActions && selectedRows.length > 0 ? batchActions : null

  // ── Render: loading ──
  if (isLoading && data.length === 0) {
    return (
      <div className={cn('flex flex-col', className)}>
        <DataTableToolbar
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder}
          filters={mergedFilters}
          activeFilters={activeFilters}
          onFilterChange={onFilterChange}
          filterCombinators={filterCombinators}
          onFilterCombinatorChange={onFilterCombinatorChange}
          viewModes={viewModes}
          currentViewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          columnVisibility={enableColumnVisibility}
          allColumns={colVisInfo}
          onToggleColumn={(id) => table.getColumn(id)?.toggleVisibility()}
          totalCount={0}
          toolbarLeft={toolbarLeft}
          toolbarRight={toolbarRight}
        />
        <div className="flex items-center justify-center py-12 flex-1">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  // ── Pinning helpers ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getPinnedStyle = (column: any): React.CSSProperties => {
    if (!enableColumnPinning) return {}
    const pinned = column.getIsPinned()
    if (!pinned) return {}
    return {
      position: 'sticky',
      left: pinned === 'left' ? `${column.getStart('left')}px` : undefined,
      right: pinned === 'right' ? `${column.getAfter('right')}px` : undefined,
      zIndex: 1,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getPinnedCellClass = (column: any) => {
    if (!enableColumnPinning) return ''
    const pinned = column.getIsPinned()
    if (!pinned) return ''
    return 'bg-background'
  }

  // ── Render: table ──
  const renderTable = () => (
    <>
      <div className="flex-1 overflow-auto">
        <table
          className="text-xs"
          style={enableColumnResizing
            ? { width: Math.max(table.getCenterTotalSize(), 0), minWidth: '100%' }
            : { width: '100%' }
          }
        >
          <thead className={stickyHeader ? 'sticky top-0 z-20 bg-background' : ''}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border text-left">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort() && sortable
                  const pinnedStyle = getPinnedStyle(header.column)
                  const pinnedClass = getPinnedCellClass(header.column)
                  const isPinned = header.column.getIsPinned()

                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide relative group/th',
                        canSort && 'cursor-pointer select-none hover:text-foreground transition-colors',
                        pinnedClass,
                        isPinned && stickyHeader && 'z-30',
                      )}
                      style={{
                        width: enableColumnResizing ? header.getSize() : (header.getSize() !== 150 ? header.getSize() : undefined),
                        ...pinnedStyle,
                      }}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      onContextMenu={(e) => handleHeaderContextMenu(e, header.column)}
                    >
                      <span className="flex items-center gap-0.5">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && <SortIcon sorted={header.column.getIsSorted()} />}
                        {isPinned && (
                          <span className="text-primary/40 ml-0.5" title={isPinned === 'left' ? 'Figée à gauche' : 'Figée à droite'}>
                            <Pin size={9} />
                          </span>
                        )}
                      </span>

                      {/* Column resize handle */}
                      {enableColumnResizing && header.column.getCanResize() && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={cn(
                            'absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none',
                            'hover:bg-primary/40',
                            header.column.getIsResizing() && 'bg-primary/60',
                          )}
                        />
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, rowIndex) => {
              const isSelected = row.getIsSelected()
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-border/60 transition-colors',
                    isSelected ? 'bg-primary/[0.06]' : 'hover:bg-accent/40',
                    (onRowClick || selectionMode) && 'cursor-pointer',
                    selectionMode && 'select-none',
                  )}
                  onClick={(e) => handleRowClick(row.original, rowIndex, e)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isEditing = editingCell?.rowId === row.id && editingCell?.columnId === cell.column.id
                    const canEdit = inlineEdit
                      && inlineEdit.editableColumns.includes(cell.column.id)
                      && (!inlineEdit.canEdit || inlineEdit.canEdit(row.original, cell.column.id))
                    const pinnedStyle = getPinnedStyle(cell.column)
                    const pinnedClass = getPinnedCellClass(cell.column)

                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'px-3',
                          pinnedClass,
                        )}
                        style={{
                          paddingTop: 'var(--dt-row-py)',
                          paddingBottom: 'var(--dt-row-py)',
                          width: enableColumnResizing ? cell.column.getSize() : undefined,
                          ...pinnedStyle,
                        }}
                      >
                        {isEditing ? (
                          <InlineEditCell
                            value={cell.getValue()}
                            onSave={async (val) => {
                              await inlineEdit!.onSave(row.original, cell.column.id, val)
                              setEditingCell(null)
                            }}
                            onCancel={() => setEditingCell(null)}
                          />
                        ) : (
                          <div
                            className={cn('flex items-center gap-1 group/cell', canEdit && 'cursor-text')}
                            onDoubleClick={canEdit ? (e) => {
                              e.stopPropagation()
                              setEditingCell({ rowId: row.id, columnId: cell.column.id })
                            } : undefined}
                          >
                            <span className="flex-1 min-w-0">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </span>
                            {canEdit && !isEditing && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingCell({ rowId: row.id, columnId: cell.column.id })
                                }}
                                className="opacity-0 group-hover/cell:opacity-100 text-muted-foreground hover:text-primary transition-opacity shrink-0"
                              >
                                <Pencil size={10} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {pagination && onPaginationChange && (
        <DataTablePaginationBar
          pagination={pagination}
          onPageChange={(p) => onPaginationChange(p, pagination.pageSize)}
          onPageSizeChange={(size) => onPaginationChange(1, size)}
        />
      )}
    </>
  )

  // ── Render: grid/cards ──
  const renderGrid = () => {
    if (!cardRenderer) {
      return (
        <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
          Aucun rendu grille configuré.
        </div>
      )
    }

    return (
      <>
        <div className="flex-1 overflow-auto p-3">
          <div className={cn(
            'grid gap-2.5',
            viewMode === 'grid'
              ? 'grid-cols-[repeat(auto-fill,minmax(200px,1fr))]'
              : 'grid-cols-[repeat(auto-fill,minmax(260px,1fr))]',
          )}>
            {data.map((row, idx) => {
              const id = getRowId(row)
              const isSelected = !!rowSelection[id]
              return (
                <div key={id}>
                  {cardRenderer({
                    row,
                    selected: isSelected,
                    onSelect: () => {
                      if (!selectionMode) {
                        setSelectionMode(true)
                      }
                      setRowSelection((prev) => {
                        const next = { ...prev }
                        if (next[id]) delete next[id]
                        else next[id] = true
                        return next
                      })
                      lastSelectedIndex.current = idx
                    },
                    onClick: () => {
                      if (selectionMode) {
                        setRowSelection((prev) => {
                          const next = { ...prev }
                          if (next[id]) delete next[id]
                          else next[id] = true
                          return next
                        })
                        lastSelectedIndex.current = idx
                      } else {
                        onRowClick?.(row)
                      }
                    },
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {pagination && onPaginationChange && (
          <DataTablePaginationBar
            pagination={pagination}
            onPageChange={(p) => onPaginationChange(p, pagination.pageSize)}
            onPageSizeChange={(size) => onPaginationChange(1, size)}
          />
        )}
      </>
    )
  }

  // ── Render: performance (GlideRenderer) ──
  const renderPerformance = () => (
    <>
      <div className="flex-1 min-h-0">
        <GlideRenderer
          data={table.getRowModel().rows.map((r) => r.original)}
          columns={columns}
          onRowClick={onRowClick}
        />
      </div>

      {pagination && onPaginationChange && (
        <DataTablePaginationBar
          pagination={pagination}
          onPageChange={(p) => onPaginationChange(p, pagination.pageSize)}
          onPageSizeChange={(size) => onPaginationChange(1, size)}
        />
      )}
    </>
  )

  // ── Render: empty ──
  const renderEmpty = () => (
    <div className="flex-1 flex items-center justify-center py-12">
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        variant="search"
        action={emptyAction}
        size="compact"
      />
    </div>
  )

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <input
        ref={importInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleImportFile}
      />

      <DataTableToolbar
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
        filters={mergedFilters}
        activeFilters={activeFilters}
        onFilterChange={onFilterChange}
        viewModes={viewModes}
        currentViewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        columnVisibility={enableColumnVisibility}
        allColumns={colVisInfo}
        onToggleColumn={(id) => table.getColumn(id)?.toggleVisibility()}
        importExport={importExport}
        onExport={handleExport}
        onAdvancedExport={importExport?.advancedExport ? () => setExportWizardOpen(true) : undefined}
        onImportClick={() => {
          if (importExport?.importWizardTarget) {
            setShowImportWizard(true)
          } else {
            importInputRef.current?.click()
          }
        }}
        onDownloadTemplate={handleDownloadTemplate}
        selectable={selectable}
        selectionMode={selectionMode}
        onToggleSelectionMode={handleToggleSelectionMode}
        selectedCount={selectedRows.length}
        totalCount={pagination?.total ?? data.length}
        onClearSelection={() => { setRowSelection({}); lastSelectedIndex.current = null }}
        batchActions={batchActionsSlot}
        selectedRows={selectedRows}
        toolbarLeft={toolbarLeft}
        toolbarRight={toolbarRight}
      />

      {data.length === 0 && !isLoading ? renderEmpty() : (
        viewMode === 'performance' ? renderPerformance() :
        viewMode === 'table' ? renderTable() : renderGrid()
      )}

      {/* Column header context menu */}
      {headerMenu && (
        <ColumnHeaderMenuPortal
          position={headerMenu.position}
          props={headerMenu.props}
          onClose={closeHeaderMenu}
        />
      )}

      {/* Import Wizard */}
      {importExport?.importWizardTarget && (
        <ImportWizard
          open={showImportWizard}
          onClose={() => setShowImportWizard(false)}
          targetObject={importExport.importWizardTarget}
          onImportComplete={() => {
            // Refresh data after import by re-triggering pagination
            if (onPaginationChange && pagination) {
              onPaginationChange(pagination.page, pagination.pageSize)
            }
          }}
        />
      )}

      {/* Export Wizard */}
      {importExport?.advancedExport && (
        <ExportWizard
          open={exportWizardOpen}
          onClose={() => setExportWizardOpen(false)}
          data={data as unknown as Record<string, unknown>[]}
          columns={colVisInfo.map((c) => ({ id: c.id, header: c.header }))}
          filenamePrefix={importExport?.filenamePrefix}
          selectedRowIds={selectable ? new Set(Object.keys(rowSelection).filter((k) => rowSelection[k])) : undefined}
          getRowId={(row) => getRowId(row as unknown as TData)}
        />
      )}
    </div>
  )
}
