/**
 * Settings for Table, Map, and Text widget types.
 */
import {
  FormSection,
  DynamicPanelField,
  panelInputClass,
} from '@/components/layout/DynamicPanel'

interface WidgetSettingsOtherProps {
  widgetType: 'table' | 'map' | 'text'
  config: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}

export function WidgetSettingsOther({ widgetType, config, onChange }: WidgetSettingsOtherProps) {
  if (widgetType === 'table') {
    return (
      <FormSection title="Configuration Tableau" collapsible defaultExpanded storageKey="widget-settings-table">
        <DynamicPanelField label="Source de donnees">
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
