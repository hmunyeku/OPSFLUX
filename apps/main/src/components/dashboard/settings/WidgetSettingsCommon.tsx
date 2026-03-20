/**
 * Common widget settings — title, description, refresh interval.
 */
import {
  FormSection,
  DynamicPanelField,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import type { DashboardWidget } from '@/services/dashboardService'

const REFRESH_OPTIONS = [
  { value: '0', label: 'Desactive' },
  { value: '30', label: '30 secondes' },
  { value: '60', label: '1 minute' },
  { value: '300', label: '5 minutes' },
  { value: '900', label: '15 minutes' },
]

interface WidgetSettingsCommonProps {
  widget: DashboardWidget
  onUpdateMeta: (patch: Partial<Pick<DashboardWidget, 'title' | 'description'>>) => void
  onUpdateConfig: (patch: Record<string, unknown>) => void
}

export function WidgetSettingsCommon({ widget, onUpdateMeta, onUpdateConfig }: WidgetSettingsCommonProps) {
  return (
    <FormSection title="General">
      <DynamicPanelField label="Titre">
        <input
          type="text"
          className={panelInputClass}
          value={widget.title}
          onChange={(e) => onUpdateMeta({ title: e.target.value })}
        />
      </DynamicPanelField>
      <DynamicPanelField label="Description">
        <textarea
          className={`${panelInputClass} min-h-[50px]`}
          value={widget.description || ''}
          onChange={(e) => onUpdateMeta({ description: e.target.value || null })}
          placeholder="Description du widget..."
        />
      </DynamicPanelField>
      <DynamicPanelField label="Rafraichissement">
        <select
          className="gl-form-select"
          value={String(widget.config?.refresh_interval ?? 0)}
          onChange={(e) => onUpdateConfig({ refresh_interval: Number(e.target.value) })}
        >
          {REFRESH_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </DynamicPanelField>
    </FormSection>
  )
}
