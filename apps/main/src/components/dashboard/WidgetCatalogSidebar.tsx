/**
 * WidgetCatalogSidebar — Left panel of the dashboard editor.
 *
 * Shows available widgets grouped by source_module.
 * Each widget entry is draggable (HTML5 native drag) into the react-grid-layout canvas,
 * and can also be added via click.
 */
import { useMemo, useState, useCallback } from 'react'
import { Search, GripVertical } from 'lucide-react'
import { WidgetTypeIcon } from './WidgetCard'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import type { WidgetCatalogEntry } from '@/services/dashboardService'

interface WidgetCatalogSidebarProps {
  catalog: WidgetCatalogEntry[]
  onAddWidget: (entry: WidgetCatalogEntry) => void
  /** Called when a catalog item drag starts (sets the droppingItem for the grid) */
  onDragStart?: (entry: WidgetCatalogEntry) => void
  /** Called when a catalog item drag ends */
  onDragEnd?: () => void
}

export function WidgetCatalogSidebar({ catalog, onAddWidget, onDragStart, onDragEnd }: WidgetCatalogSidebarProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return catalog
    const q = search.toLowerCase()
    return catalog.filter(
      (e) => e.title.toLowerCase().includes(q) || e.type.toLowerCase().includes(q) || e.source_module.toLowerCase().includes(q)
    )
  }, [catalog, search])

  const grouped = useMemo(() => {
    const map: Record<string, WidgetCatalogEntry[]> = {}
    for (const entry of filtered) {
      const key = entry.source_module || 'general'
      if (!map[key]) map[key] = []
      map[key].push(entry)
    }
    return map
  }, [filtered])

  return (
    <aside className="w-[260px] shrink-0 border-r border-border bg-background flex flex-col h-full">
      {/* Header */}
      <div className="h-10 px-3 flex items-center border-b border-border shrink-0">
        <h3 className="text-sm font-semibold text-foreground">Widgets</h3>
        <span className="ml-auto text-[10px] text-muted-foreground">{catalog.length}</span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${panelInputClass} pl-8`}
            placeholder="Rechercher..."
          />
        </div>
      </div>

      {/* Grouped widgets */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-3">
        {Object.entries(grouped).map(([module, entries]) => (
          <div key={module}>
            <h5 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 mb-1.5">
              {module}
            </h5>
            <div className="space-y-1">
              {entries.map((entry) => (
                <DraggableCatalogItem
                  key={entry.id}
                  entry={entry}
                  onAdd={() => onAddWidget(entry)}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                />
              ))}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-muted-foreground">Aucun widget trouve</p>
          </div>
        )}
      </div>
    </aside>
  )
}

// ── Draggable catalog item (HTML5 native drag for react-grid-layout) ──

function DraggableCatalogItem({
  entry,
  onAdd,
  onDragStart,
  onDragEnd,
}: {
  entry: WidgetCatalogEntry
  onAdd: () => void
  onDragStart?: (entry: WidgetCatalogEntry) => void
  onDragEnd?: () => void
}) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      setIsDragging(true)
      // Store entry data for the drop handler
      e.dataTransfer.setData('text/plain', JSON.stringify(entry))
      e.dataTransfer.effectAllowed = 'copy'
      onDragStart?.(entry)
    },
    [entry, onDragStart],
  )

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
    onDragEnd?.()
  }, [onDragEnd])

  return (
    <div
      draggable
      unselectable="on"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={onAdd}
      className={`
        flex items-center gap-2 px-2 py-2 rounded-md cursor-grab active:cursor-grabbing
        border border-transparent hover:border-border hover:bg-accent/50 transition-all
        ${isDragging ? 'opacity-50 ring-1 ring-primary' : ''}
      `}
    >
      <GripVertical size={12} className="text-muted-foreground/40 shrink-0" />
      <WidgetTypeIcon type={entry.type} className="text-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground truncate">{entry.title}</p>
        <p className="text-[10px] text-muted-foreground truncate">{entry.description}</p>
      </div>
    </div>
  )
}
