/**
 * WidgetSettingsPanel — Right panel of the dashboard editor.
 *
 * Shows when a widget is selected. Renders common settings + type-specific config.
 * Uses DynamicPanel design system components for consistency.
 */
import { X, Trash2 } from 'lucide-react'
import { WidgetTypeIcon } from './WidgetCard'
import { WidgetSettingsCommon } from './settings/WidgetSettingsCommon'
import { WidgetSettingsKPI } from './settings/WidgetSettingsKPI'
import { WidgetSettingsChart } from './settings/WidgetSettingsChart'
import { WidgetSettingsOther } from './settings/WidgetSettingsOther'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { DashboardWidget } from '@/services/dashboardService'

interface WidgetSettingsPanelProps {
  widget: DashboardWidget
  onUpdateConfig: (widgetId: string, configPatch: Record<string, unknown>) => void
  onUpdateMeta: (widgetId: string, metaPatch: Partial<Pick<DashboardWidget, 'title' | 'description' | 'permissions'>>) => void
  onDelete: (widgetId: string) => void
  onClose: () => void
}

export function WidgetSettingsPanel({
  widget,
  onUpdateConfig,
  onUpdateMeta,
  onDelete,
  onClose,
}: WidgetSettingsPanelProps) {
  const confirm = useConfirm()

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Supprimer le widget ?',
      message: `Le widget "${widget.title}" sera retire du tableau de bord.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (ok) onDelete(widget.id)
  }

  return (
    <aside className="w-[300px] shrink-0 border-l border-border bg-background flex flex-col h-full">
      {/* Header */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <WidgetTypeIcon type={widget.type} className="text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate">{widget.title}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Common settings */}
        <WidgetSettingsCommon
          widget={widget}
          onUpdateMeta={(patch) => onUpdateMeta(widget.id, patch)}
          onUpdateConfig={(patch) => onUpdateConfig(widget.id, patch)}
        />

        {/* Type-specific settings */}
        {widget.type === 'kpi' && (
          <WidgetSettingsKPI
            config={widget.config}
            onChange={(patch) => onUpdateConfig(widget.id, patch)}
          />
        )}
        {widget.type === 'chart' && (
          <WidgetSettingsChart
            config={widget.config}
            onChange={(patch) => onUpdateConfig(widget.id, patch)}
          />
        )}
        {(widget.type === 'table' || widget.type === 'map' || widget.type === 'text') && (
          <WidgetSettingsOther
            widgetType={widget.type}
            config={widget.config}
            onChange={(patch) => onUpdateConfig(widget.id, patch)}
          />
        )}

        {/* Position info */}
        <div className="rounded border border-border/50 p-2.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Position</p>
          <div className="grid grid-cols-4 gap-1.5 text-center">
            {(['x', 'y', 'w', 'h'] as const).map((key) => (
              <div key={key} className="rounded bg-muted/50 py-1">
                <span className="text-[9px] text-muted-foreground uppercase">{key}</span>
                <p className="text-xs font-mono font-medium text-foreground">{widget.position?.[key] ?? 0}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Danger zone */}
        <div className="border-t border-border pt-3">
          <button
            onClick={handleDelete}
            className="gl-button-sm gl-button-danger flex items-center gap-1.5 w-full justify-center"
          >
            <Trash2 size={12} />
            Supprimer ce widget
          </button>
        </div>
      </div>
    </aside>
  )
}
