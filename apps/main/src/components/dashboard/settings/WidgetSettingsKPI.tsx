/**
 * KPI widget settings — data source, format, trend configuration.
 */
import {
  FormSection,
  DynamicPanelField,
  panelInputClass,
  TagSelector,
} from '@/components/layout/DynamicPanel'

const FORMAT_OPTIONS = [
  { value: 'number', label: 'Nombre' },
  { value: 'currency', label: 'Devise (XAF)' },
  { value: 'percent', label: 'Pourcentage' },
]

interface WidgetSettingsKPIProps {
  config: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}

export function WidgetSettingsKPI({ config, onChange }: WidgetSettingsKPIProps) {
  return (
    <FormSection title="Configuration KPI" collapsible defaultExpanded storageKey="widget-settings-kpi">
      <DynamicPanelField label="Source de donnees">
        <input
          type="text"
          className={panelInputClass}
          value={(config.data_source as string) || ''}
          onChange={(e) => onChange({ data_source: e.target.value })}
          placeholder="ex: assets_count, tiers_active"
        />
      </DynamicPanelField>
      <DynamicPanelField label="Champ valeur">
        <input
          type="text"
          className={panelInputClass}
          value={(config.value_field as string) || ''}
          onChange={(e) => onChange({ value_field: e.target.value })}
          placeholder="ex: count, total"
        />
      </DynamicPanelField>
      <DynamicPanelField label="Label">
        <input
          type="text"
          className={panelInputClass}
          value={(config.label as string) || ''}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="ex: Assets actifs"
        />
      </DynamicPanelField>
      <DynamicPanelField label="Couleur icone">
        <TagSelector
          options={[
            { value: 'blue', label: 'Bleu' },
            { value: 'green', label: 'Vert' },
            { value: 'orange', label: 'Orange' },
            { value: 'red', label: 'Rouge' },
            { value: 'violet', label: 'Violet' },
            { value: 'cyan', label: 'Cyan' },
            { value: 'pink', label: 'Rose' },
            { value: 'yellow', label: 'Jaune' },
            { value: 'slate', label: 'Gris' },
          ]}
          value={(config.icon_color as string) || 'blue'}
          onChange={(v) => onChange({ icon_color: v })}
        />
      </DynamicPanelField>
      <DynamicPanelField label="Format">
        <TagSelector
          options={FORMAT_OPTIONS}
          value={(config.format as string) || 'number'}
          onChange={(v) => onChange({ format: v })}
        />
      </DynamicPanelField>
      <DynamicPanelField label="Unite">
        <input
          type="text"
          className={panelInputClass}
          value={(config.unit as string) || ''}
          onChange={(e) => onChange({ unit: e.target.value })}
          placeholder="ex: /mois, PAX, XAF"
        />
      </DynamicPanelField>
      <DynamicPanelField label="Tendance (%)">
        <input
          type="number"
          className={panelInputClass}
          value={(config.trend as number) ?? ''}
          onChange={(e) => onChange({ trend: e.target.value ? Number(e.target.value) : null })}
          placeholder="ex: 12.5"
        />
      </DynamicPanelField>
      <DynamicPanelField label="Comparaison">
        <input
          type="text"
          className={panelInputClass}
          value={(config.comparison as string) || ''}
          onChange={(e) => onChange({ comparison: e.target.value })}
          placeholder="ex: vs mois dernier"
        />
      </DynamicPanelField>
    </FormSection>
  )
}
