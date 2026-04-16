/**
 * Perspective pivot table widget for dashboard.
 *
 * NOTE: @finos/perspective packages are NOT installed yet due to
 * WASM/esbuild compatibility issues. This component renders a
 * placeholder until the packages are properly configured.
 *
 * To enable: npm install @finos/perspective @finos/perspective-viewer
 *   @finos/perspective-viewer-datagrid @finos/perspective-viewer-d3fc
 * Then uncomment the imports below and remove the placeholder.
 */
import { TableProperties } from 'lucide-react'

export interface PerspectiveConfig {
  group_by?: string[]
  split_by?: string[]
  columns?: string[]
  aggregates?: Record<string, string>
  sort?: [string, 'asc' | 'desc'][]
  filter?: [string, string, unknown][]
  plugin?: string
  expressions?: string[]
  theme?: string
}

interface PerspectiveWidgetProps {
  data: Record<string, unknown>[]
  config?: PerspectiveConfig
}

export function PerspectiveWidget({ data, config }: PerspectiveWidgetProps) {
  void config

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
      <TableProperties size={32} className="opacity-40" />
      <div className="text-center space-y-1">
        <p className="text-sm font-medium">Analyse dynamique</p>
        <p className="text-xs opacity-70">
          {data?.length
            ? `${data.length} enregistrement${data.length > 1 ? 's' : ''} prêts pour l'analyse`
            : 'Aucune donnée disponible'}
        </p>
        <p className="text-xs opacity-50 mt-2">
          Module Perspective (installation en cours)
        </p>
      </div>
    </div>
  )
}
