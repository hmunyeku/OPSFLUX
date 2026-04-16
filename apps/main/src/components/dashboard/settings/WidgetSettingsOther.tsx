/**
 * Settings for Table, Map, and Text widget types.
 */
import { Eye, EyeOff } from 'lucide-react'
import {
  FormSection,
  DynamicPanelField,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { cn } from '@/lib/utils'

interface WidgetSettingsOtherProps {
  widgetType: 'table' | 'map' | 'text'
  config: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}

export function WidgetSettingsOther({ widgetType, config, onChange }: WidgetSettingsOtherProps) {
  if (widgetType === 'table') {
    // Column visibility — stored as string[] of hidden column keys
    const hiddenColumns = (config.hidden_columns as string[]) || []
    // Available columns — populated from last data fetch, stored by WidgetCard
    const availableColumns = (config._available_columns as string[]) || []

    const toggleColumn = (key: string) => {
      const isHidden = hiddenColumns.includes(key)
      onChange({
        hidden_columns: isHidden
          ? hiddenColumns.filter((c) => c !== key)
          : [...hiddenColumns, key],
      })
    }

    return (
      <FormSection title="Configuration Tableau" collapsible defaultExpanded storageKey="widget-settings-table">
        <DynamicPanelField label="Source de données">
          <input
            type="text"
            className={panelInputClass}
            value={(config.data_source as string) || ''}
            onChange={(e) => onChange({ data_source: e.target.value })}
            placeholder="ex: recent_assets"
          />
        </DynamicPanelField>
        <DynamicPanelField label="Lignes par page">
          <input
            type="number"
            className={panelInputClass}
            value={(config.page_size as number) ?? 10}
            onChange={(e) => onChange({ page_size: Number(e.target.value) || 10 })}
            min={5}
            max={100}
          />
        </DynamicPanelField>
        <DynamicPanelField label="Filtrage croise">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="gl-checkbox"
              checked={config.cross_filter !== false}
              onChange={(e) => onChange({ cross_filter: e.target.checked })}
            />
            <span className="text-xs text-foreground">Clic sur cellule = filtre global</span>
          </label>
        </DynamicPanelField>

        {/* Column visibility picker */}
        {availableColumns.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Colonnes visibles</p>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {availableColumns.map((col) => {
                const isHidden = hiddenColumns.includes(col)
                return (
                  <button
                    key={col}
                    onClick={() => toggleColumn(col)}
                    className={cn(
                      'flex items-center gap-2 w-full text-left px-2 py-1 rounded text-[11px] transition-colors',
                      isHidden ? 'text-muted-foreground/50 hover:bg-muted/30' : 'text-foreground hover:bg-muted/50',
                    )}
                  >
                    {isHidden ? <EyeOff size={11} className="shrink-0 opacity-40" /> : <Eye size={11} className="shrink-0 text-primary" />}
                    <span className={isHidden ? 'line-through' : ''}>{col}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </FormSection>
    )
  }

  if (widgetType === 'map') {
    return (
      <FormSection title="Configuration Carte" collapsible defaultExpanded storageKey="widget-settings-map">
        <DynamicPanelField label="Carte flotte">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="gl-checkbox"
              checked={config.fleet_map === true}
              onChange={(e) => onChange({ fleet_map: e.target.checked })}
            />
            <span className="text-sm text-foreground">Afficher les vecteurs de transport</span>
          </label>
        </DynamicPanelField>
        <DynamicPanelField label="Zoom par defaut">
          <input
            type="number"
            className={panelInputClass}
            value={(config.zoom as number) ?? 6}
            onChange={(e) => onChange({ zoom: Number(e.target.value) })}
            min={1}
            max={18}
          />
        </DynamicPanelField>
        <DynamicPanelField label="Centre (latitude)">
          <input
            type="number"
            className={panelInputClass}
            value={(config.center_lat as number) ?? 4.05}
            onChange={(e) => onChange({ center_lat: Number(e.target.value) })}
            step={0.01}
          />
        </DynamicPanelField>
        <DynamicPanelField label="Centre (longitude)">
          <input
            type="number"
            className={panelInputClass}
            value={(config.center_lng as number) ?? 9.7}
            onChange={(e) => onChange({ center_lng: Number(e.target.value) })}
            step={0.01}
          />
        </DynamicPanelField>
      </FormSection>
    )
  }

  // Text widget
  return (
    <FormSection title="Configuration Texte" collapsible defaultExpanded storageKey="widget-settings-text">
      <DynamicPanelField label="Contenu (Markdown)">
        <textarea
          className={`${panelInputClass} min-h-[200px] font-mono text-xs`}
          value={(config.content as string) || ''}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder="# Titre&#10;&#10;Contenu en **markdown**..."
        />
        <p className="text-[10px] text-muted-foreground mt-1">Supporte le Markdown (titres, listes, gras, italique)</p>
      </DynamicPanelField>
    </FormSection>
  )
}
