/**
 * Group widget settings — layout selector + children KPI editors.
 */
import { Plus, Trash2 } from 'lucide-react'
import {
  FormSection,
  DynamicPanelField,
  panelInputClass,
  TagSelector,
} from '@/components/layout/DynamicPanel'

const LAYOUT_OPTIONS = [
  { value: '2x2', label: '2×2 (4 tiles)' },
  { value: '3x1', label: '3×1 (3 cols)' },
  { value: '1x4', label: '1×4 (4 cols)' },
  { value: '1x3', label: '1×3 (3 rows)' },
]

const FORMAT_OPTIONS = [
  { value: 'number', label: 'Nombre' },
  { value: 'currency', label: 'Devise' },
  { value: 'percent', label: '%' },
]

interface GroupChild {
  title: string
  value: number | string
  format?: string
  unit?: string
  trend?: number | null
  color?: string
}

interface WidgetSettingsGroupProps {
  config: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}

export function WidgetSettingsGroup({ config, onChange }: WidgetSettingsGroupProps) {
  const children = (config.children as GroupChild[]) || []

  const updateChild = (idx: number, patch: Partial<GroupChild>) => {
    const updated = children.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    onChange({ children: updated })
  }

  const addChild = () => {
    onChange({ children: [...children, { title: `KPI ${children.length + 1}`, value: 0, format: 'number' }] })
  }

  const removeChild = (idx: number) => {
    onChange({ children: children.filter((_, i) => i !== idx) })
  }

  return (
    <FormSection title="Configuration Groupe" collapsible defaultExpanded storageKey="widget-settings-group">
      <DynamicPanelField label="Disposition">
        <TagSelector
          options={LAYOUT_OPTIONS}
          value={(config.layout as string) || '2x2'}
          onChange={(v) => onChange({ layout: v })}
        />
      </DynamicPanelField>

      <DynamicPanelField label="Source de données">
        <input
          type="text"
          className={panelInputClass}
          value={(config.data_source as string) || ''}
          onChange={(e) => onChange({ data_source: e.target.value })}
          placeholder="ex: kpi_group_overview"
        />
      </DynamicPanelField>

      {/* Children editors */}
      <div className="space-y-2 mt-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">KPIs enfants</p>
        {children.map((child, idx) => (
          <div key={idx} className="rounded-lg border border-border/50 bg-muted/20 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground">#{idx + 1}</span>
              <button onClick={() => removeChild(idx)} className="p-0.5 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive">
                <Trash2 size={10} />
              </button>
            </div>
            <input
              type="text"
              className={panelInputClass}
              value={child.title || ''}
              onChange={(e) => updateChild(idx, { title: e.target.value })}
              placeholder="Titre"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="text"
                className={panelInputClass}
                value={child.value ?? ''}
                onChange={(e) => updateChild(idx, { value: e.target.value })}
                placeholder="Valeur"
              />
              <TagSelector
                options={FORMAT_OPTIONS}
                value={child.format || 'number'}
                onChange={(v) => updateChild(idx, { format: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="text"
                className={panelInputClass}
                value={child.unit || ''}
                onChange={(e) => updateChild(idx, { unit: e.target.value })}
                placeholder="Unite"
              />
              <input
                type="text"
                className={panelInputClass}
                value={child.color || ''}
                onChange={(e) => updateChild(idx, { color: e.target.value })}
                placeholder="Couleur (#hex)"
              />
            </div>
          </div>
        ))}
        <button
          onClick={addChild}
          className="gl-button-sm gl-button-outline flex items-center gap-1 w-full justify-center text-[10px]"
        >
          <Plus size={10} />
          Ajouter un KPI
        </button>
      </div>
    </FormSection>
  )
}
