/**
 * Chart widget settings — chart type, data source, fields, legend.
 */
import {
  FormSection,
  DynamicPanelField,
  panelInputClass,
  TagSelector,
} from '@/components/layout/DynamicPanel'

const CHART_TYPE_OPTIONS = [
  { value: 'bar', label: 'Barres' },
  { value: 'line', label: 'Ligne' },
  { value: 'area', label: 'Aire' },
  { value: 'pie', label: 'Camembert' },
]

interface WidgetSettingsChartProps {
  config: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}

export function WidgetSettingsChart({ config, onChange }: WidgetSettingsChartProps) {
  const yFields = ((config.y_fields as string[]) || []).join(', ')

  return (
    <FormSection title="Configuration Graphique" collapsible defaultExpanded storageKey="widget-settings-chart">
      <DynamicPanelField label="Type de graphique">
        <TagSelector
          options={CHART_TYPE_OPTIONS}
          value={(config.chart_type as string) || 'bar'}
          onChange={(v) => onChange({ chart_type: v })}
        />
      </DynamicPanelField>
      <DynamicPanelField label="Source de donnees">
        <input
          type="text"
          className={panelInputClass}
          value={(config.data_source as string) || ''}
          onChange={(e) => onChange({ data_source: e.target.value })}
          placeholder="ex: monthly_stats"
        />
      </DynamicPanelField>
      <DynamicPanelField label="Champ X (abscisse)">
        <input
          type="text"
          className={panelInputClass}
          value={(config.x_field as string) || ''}
          onChange={(e) => onChange({ x_field: e.target.value })}
          placeholder="ex: month, date"
        />
      </DynamicPanelField>
      <DynamicPanelField label="Champs Y (ordonnees)">
        <input
          type="text"
          className={panelInputClass}
          value={yFields}
          onChange={(e) => onChange({ y_fields: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          placeholder="ex: count, total (separes par virgule)"
        />
        <p className="text-[10px] text-muted-foreground mt-1">Separer par virgule pour plusieurs series</p>
      </DynamicPanelField>
      <DynamicPanelField label="Legende">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="gl-checkbox"
            checked={config.show_legend !== false}
            onChange={(e) => onChange({ show_legend: e.target.checked })}
          />
          <span className="text-sm text-foreground">Afficher la legende</span>
        </label>
      </DynamicPanelField>
      <DynamicPanelField label="Filtrage croise">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="gl-checkbox"
            checked={config.cross_filter !== false}
            onChange={(e) => onChange({ cross_filter: e.target.checked })}
          />
          <span className="text-xs text-foreground">Clic sur element = filtre global</span>
        </label>
      </DynamicPanelField>
    </FormSection>
  )
}
