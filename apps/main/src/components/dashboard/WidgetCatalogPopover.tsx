/**
 * WidgetCatalogPopover — Popover showing available widgets grouped by module.
 * Used in edit mode to add widgets to the dashboard grid.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/Popover'
import { WidgetTypeIcon } from './WidgetCard'
import type { WidgetCatalogEntry } from '@/services/dashboardService'

interface WidgetCatalogPopoverProps {
  catalog: WidgetCatalogEntry[]
  onAdd: (entry: WidgetCatalogEntry) => void
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  const result: Record<string, T[]> = {}
  for (const item of arr) {
    const k = String(item[key] || 'general')
    if (!result[k]) result[k] = []
    result[k].push(item)
  }
  return result
}

export function WidgetCatalogPopover({ catalog, onAdd }: WidgetCatalogPopoverProps) {
  const { t } = useTranslation()

  const grouped = useMemo(() => groupBy(catalog, 'source_module'), [catalog])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="gl-button gl-button-sm gl-button-default">
          <Plus className="h-3.5 w-3.5" />
          {t('dashboard.add_widget')}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="px-3 py-2 border-b">
          <h4 className="text-sm font-semibold">{t('dashboard.widget_catalog')}</h4>
        </div>
        <div className="max-h-80 overflow-y-auto p-2 space-y-3">
          {Object.keys(grouped).length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {t('dashboard.no_widgets_available')}
            </p>
          ) : (
            Object.entries(grouped).map(([module, widgets]) => (
              <div key={module}>
                <h5 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 px-1">
                  {module}
                </h5>
                <div className="space-y-0.5">
                  {widgets.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => onAdd(w)}
                      className="flex items-center gap-2.5 w-full p-2 rounded hover:bg-muted text-left transition-colors"
                    >
                      <WidgetTypeIcon type={w.type} className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{w.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{w.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
