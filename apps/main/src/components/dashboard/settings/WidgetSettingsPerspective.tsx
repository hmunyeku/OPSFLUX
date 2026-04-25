/**
 * Perspective widget settings — data source, initial plugin, info note.
 */
import {
  FormSection,
  DynamicPanelField,
  panelInputClass,
  TagSelector,
} from '@/components/layout/DynamicPanel'
import { Info } from 'lucide-react'

const PLUGIN_OPTIONS = [
  { value: 'Datagrid', label: 'Tableau' },
  { value: 'Y Bar', label: 'Barres' },
  { value: 'Y Line', label: 'Ligne' },
  { value: 'Y Scatter', label: 'Nuage de points' },
  { value: 'Y Area', label: 'Aire' },
  { value: 'Treemap', label: 'Treemap' },
  { value: 'Heatmap', label: 'Heatmap' },
  { value: 'Sunburst', label: 'Sunburst' },
]

interface WidgetSettingsPerspectiveProps {
  config: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}

export function WidgetSettingsPerspective({ config, onChange }: WidgetSettingsPerspectiveProps) {
  return (
    <FormSection title="Configuration Perspective" collapsible defaultExpanded storageKey="widget-settings-perspective">
      <DynamicPanelField label="Source de donnees">
        <input
          type="text"
          className={panelInputClass}
          value={(config.data_source as string) || ''}
          onChange={(e) => onChange({ data_source: e.target.value })}
          placeholder="ex: assets, monthly_stats"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Endpoint API ou identifiant de jeu de donnees
        </p>
      </DynamicPanelField>

      <DynamicPanelField label="Plugin initial">
        <TagSelector
          options={PLUGIN_OPTIONS}
          value={(config.plugin as string) || 'Datagrid'}
          onChange={(v) => onChange({ plugin: v })}
        />
      </DynamicPanelField>

      <DynamicPanelField label="Colonnes initiales">
        <input
          type="text"
          className={panelInputClass}
          value={((config.columns as string[]) || []).join(', ')}
          onChange={(e) =>
            onChange({
              columns: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="ex: name, status, total"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Separer par virgule. Laissez vide pour tout afficher.
        </p>
      </DynamicPanelField>

      <DynamicPanelField label="Regroupement (group_by)">
        <input
          type="text"
          className={panelInputClass}
          value={((config.group_by as string[]) || []).join(', ')}
          onChange={(e) =>
            onChange({
              group_by: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="ex: department, status"
        />
      </DynamicPanelField>

      <div className="flex items-start gap-2 p-2.5 rounded bg-blue-500/5 border border-blue-500/20">
        <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Configuration complete disponible dans le widget interactif : pivots, filtres,
          agregations et tri sont modifiables directement dans la vue Perspective.
        </p>
      </div>
    </FormSection>
  )
}
