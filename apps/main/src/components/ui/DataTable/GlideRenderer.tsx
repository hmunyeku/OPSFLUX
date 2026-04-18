/**
 * GlideRenderer — High-performance grid renderer using @glideapps/glide-data-grid.
 *
 * Renders large datasets with canvas-based virtualized rendering.
 * Used as an alternative "performance mode" view within DataTable.
 */
import { useMemo, useCallback, useState } from 'react'
import DataEditor, {
  type GridColumn,
  type GridCell,
  GridCellKind,
  type Item,
  type Theme as GlideTheme,
} from '@glideapps/glide-data-grid'
import '@glideapps/glide-data-grid/dist/index.css'
import type { ColumnDef } from '@tanstack/react-table'
import { useThemeStore } from '@/stores/themeStore'

// ── Helpers ────────────────────────────────────────────────────

/** Extract accessor key from a tanstack ColumnDef */
function getAccessorKey<T>(colDef: ColumnDef<T, unknown>): string | null {
  const def = colDef as { accessorKey?: string | number; id?: string }
  if (def.accessorKey) return String(def.accessorKey)
  if (def.id) return String(def.id)
  return null
}

/** Extract header label from a tanstack ColumnDef */
function getHeaderLabel<T>(colDef: ColumnDef<T, unknown>): string {
  if (typeof colDef.header === 'string') return colDef.header
  const def = colDef as { accessorKey?: string | number; id?: string }
  if (def.accessorKey) return String(def.accessorKey)
  if (def.id) return String(def.id)
  return ''
}

/** Detect the appropriate GridCellKind for a value */
function detectCellKind(value: unknown): GridCellKind {
  if (typeof value === 'boolean') return GridCellKind.Boolean
  if (typeof value === 'number') return GridCellKind.Number
  // Check for image URLs
  if (typeof value === 'string' && /^https?:\/\/.+\.(png|jpe?g|gif|svg|webp)/i.test(value)) {
    return GridCellKind.Image
  }
  return GridCellKind.Text
}

// ── Dark theme overrides ────────────────────────────────────────

const DARK_THEME: Partial<GlideTheme> = {
  accentColor: 'hsl(221, 83%, 53%)',
  accentLight: 'hsla(221, 83%, 53%, 0.15)',
  bgCell: 'hsl(224, 20%, 12%)',
  bgCellMedium: 'hsl(224, 20%, 14%)',
  bgHeader: 'hsl(224, 20%, 10%)',
  bgHeaderHasFocus: 'hsl(224, 20%, 16%)',
  bgHeaderHovered: 'hsl(224, 20%, 18%)',
  bgBubble: 'hsl(224, 20%, 18%)',
  bgBubbleSelected: 'hsl(221, 83%, 53%)',
  bgSearchResult: 'hsla(221, 83%, 53%, 0.25)',
  borderColor: 'hsl(224, 15%, 22%)',
  drilldownBorder: 'hsl(224, 15%, 30%)',
  linkColor: 'hsl(221, 83%, 60%)',
  textDark: 'hsl(0, 0%, 90%)',
  textMedium: 'hsl(0, 0%, 65%)',
  textLight: 'hsl(0, 0%, 45%)',
  textBubble: 'hsl(0, 0%, 90%)',
  textHeader: 'hsl(0, 0%, 75%)',
  textHeaderSelected: 'hsl(0, 0%, 95%)',
  textGroupHeader: 'hsl(0, 0%, 70%)',
}

// ── Component ───────────────────────────────────────────────────

interface GlideRendererProps<T> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  onRowClick?: (row: T) => void
  height?: number
}

export function GlideRenderer<T>({
  data,
  columns,
  onRowClick,
  height,
}: GlideRendererProps<T>) {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  const isDark = resolvedTheme === 'dark'
  const [selectedRow, setSelectedRow] = useState<number | null>(null)

  // Map tanstack ColumnDef to glide GridColumn, filtering out columns without accessor keys
  const mappedColumns = useMemo(() => {
    const result: { gridCol: GridColumn; accessorKey: string }[] = []

    for (const colDef of columns) {
      const key = getAccessorKey(colDef)
      if (!key) continue
      // Skip internal columns like _select
      if (key === '_select') continue

      const label = getHeaderLabel(colDef)
      const width = (colDef as { size?: number }).size

      result.push({
        gridCol: {
          id: key,
          title: label,
          width: width && width !== 150 ? width : 150,
        },
        accessorKey: key,
      })
    }

    return result
  }, [columns])

  const gridColumns = useMemo(
    () => mappedColumns.map((m) => m.gridCol),
    [mappedColumns],
  )

  // getCellContent callback — reads data[row][col.accessorKey]
  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      if (row >= data.length || col >= mappedColumns.length) {
        return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false }
      }

      const record = data[row] as Record<string, unknown>
      const accessorKey = mappedColumns[col].accessorKey
      const value = record[accessorKey]

      // Null / undefined
      if (value === null || value === undefined) {
        return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false }
      }

      const kind = detectCellKind(value)

      switch (kind) {
        case GridCellKind.Boolean:
          return { kind: GridCellKind.Boolean, data: Boolean(value), allowOverlay: false }

        case GridCellKind.Number:
          return {
            kind: GridCellKind.Number,
            data: Number(value),
            displayData: new Intl.NumberFormat('fr-FR').format(Number(value)),
            allowOverlay: false,
          }

        case GridCellKind.Image:
          return {
            kind: GridCellKind.Image,
            data: [String(value)],
            displayData: [String(value)],
            allowOverlay: false,
          }

        default:
          return {
            kind: GridCellKind.Text,
            data: String(value),
            displayData: String(value),
            allowOverlay: false,
          }
      }
    },
    [data, mappedColumns],
  )

  // Row click handler
  const handleCellClick = useCallback(
    ([_col, row]: Item) => {
      setSelectedRow(row)
      if (onRowClick && row < data.length) {
        onRowClick(data[row])
      }
    },
    [data, onRowClick],
  )

  // Highlight selected row
  const getRowThemeOverride = useCallback(
    (row: number): Partial<GlideTheme> | undefined => {
      if (row === selectedRow) {
        return isDark
          ? { bgCell: 'hsla(221, 83%, 53%, 0.12)' }
          : { bgCell: 'hsla(221, 83%, 53%, 0.06)' }
      }
      return undefined
    },
    [selectedRow, isDark],
  )

  // Empty data
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-xs text-muted-foreground">
        Aucune donnée à afficher
      </div>
    )
  }

  const containerHeight = height || 500

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0" style={{ height: containerHeight }}>
        <DataEditor
          columns={gridColumns}
          rows={data.length}
          getCellContent={getCellContent}
          onCellClicked={handleCellClick}
          getRowThemeOverride={getRowThemeOverride}
          theme={isDark ? DARK_THEME : undefined}
          smoothScrollX
          smoothScrollY
          rowMarkers="number"
          width="100%"
          height="100%"
        />
      </div>
      <div className="flex items-center px-3 py-1 border-t border-border shrink-0">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {data.length.toLocaleString('fr-FR')} ligne{data.length !== 1 ? 's' : ''}
          {selectedRow !== null && ` — ligne ${selectedRow + 1} selectionnee`}
        </span>
      </div>
    </div>
  )
}
