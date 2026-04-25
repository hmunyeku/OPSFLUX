/**
 * WidgetSettingsPanel — Right panel of the dashboard editor.
 *
 * Shows when a widget is selected. Renders common settings + type-specific config.
 * Uses DynamicPanel design system components for consistency.
 */
import { X, Trash2, Info, Database, Shield, Hash } from 'lucide-react'
import { FormSection } from '@/components/layout/DynamicPanel'
import { WidgetTypeIcon } from './WidgetCard'
import { WidgetSettingsCommon } from './settings/WidgetSettingsCommon'
import { WidgetSettingsKPI } from './settings/WidgetSettingsKPI'
import { WidgetSettingsChart } from './settings/WidgetSettingsChart'
import { WidgetSettingsOther } from './settings/WidgetSettingsOther'
import { WidgetSettingsPerspective } from './settings/WidgetSettingsPerspective'
import { WidgetSettingsGroup } from './settings/WidgetSettingsGroup'
import { WidgetSettingsQuickAccess } from './settings/WidgetSettingsQuickAccess'
import { WidgetSettingsClock } from './settings/WidgetSettingsClock'
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
    <div className="flex flex-col h-full max-h-[calc(100vh-120px)]">
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
        {widget.type === 'quick_access' && (
          <WidgetSettingsQuickAccess
            config={widget.config}
            onChange={(patch) => onUpdateConfig(widget.id, patch)}
          />
        )}
        {widget.type === 'clock' && (
          <WidgetSettingsClock
            config={widget.config}
            onChange={(patch) => onUpdateConfig(widget.id, patch)}
          />
        )}
        {widget.type === 'group' && (
          <WidgetSettingsGroup
            config={widget.config}
            onChange={(patch) => onUpdateConfig(widget.id, patch)}
          />
        )}
        {widget.type === 'perspective' && (
          <WidgetSettingsPerspective
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

        {/* Widget info (metadata, data source, permissions) */}
        <FormSection title="Informations" collapsible defaultExpanded={false} storageKey="widget-settings-info">
          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2">
              <Hash size={11} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <span className="text-muted-foreground">ID: </span>
                <span className="font-mono text-[10px] text-foreground">{String(widget.id)}</span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Info size={11} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <span className="text-muted-foreground">Type: </span>
                <span className="font-medium text-foreground">{String(widget.type)}</span>
              </div>
            </div>
            {widget.config?.widget_id ? (
              <div className="flex items-start gap-2">
                <Database size={11} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-muted-foreground">Source: </span>
                  <span className="font-mono text-[10px] text-foreground">{String(widget.config.widget_id as string)}</span>
                  {widget.config?.source ? (
                    <span className="text-muted-foreground ml-1">({String(widget.config.source as string)})</span>
                  ) : null}
                </div>
              </div>
            ) : null}
            {widget.permissions && widget.permissions.length > 0 ? (
              <div className="flex items-start gap-2">
                <Shield size={11} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-muted-foreground">Permissions: </span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {(widget.permissions as string[]).map((p: string) => (
                      <span key={p} className="px-1.5 py-0.5 rounded bg-muted text-[9px] font-mono">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            {widget.config?.refresh_interval && Number(widget.config.refresh_interval) > 0 ? (
              <div className="flex items-start gap-2">
                <Info size={11} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-muted-foreground">Rafraichissement: </span>
                  <span className="text-foreground">{String(Number(widget.config.refresh_interval))}s</span>
                </div>
              </div>
            ) : null}
          </div>
        </FormSection>

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
    </div>
  )
}
