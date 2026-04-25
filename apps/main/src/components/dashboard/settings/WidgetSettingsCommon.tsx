/**
 * Common widget settings — title, description, refresh interval, visual customization.
 */
import { useTranslation } from 'react-i18next'
import {
  FormSection,
  DynamicPanelField,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import type { DashboardWidget } from '@/services/dashboardService'

const REFRESH_OPTIONS = [
  { value: '0', label: 'Désactivé' },
  { value: '30', label: '30 secondes' },
  { value: '60', label: '1 minute' },
  { value: '300', label: '5 minutes' },
  { value: '900', label: '15 minutes' },
]

const PRESET_COLORS = [
  { value: '', label: 'Défaut' },
  { value: '#1e3a5f', label: 'Bleu marine' },
  { value: '#1e40af', label: 'Bleu' },
  { value: '#047857', label: 'Vert' },
  { value: '#b45309', label: 'Orange' },
  { value: '#dc2626', label: 'Rouge' },
  { value: '#7c3aed', label: 'Violet' },
  { value: '#0891b2', label: 'Cyan' },
  { value: '#374151', label: 'Gris foncé' },
  { value: '#0f172a', label: 'Noir' },
]

const ACCENT_COLORS = [
  { value: '', label: 'Défaut' },
  { value: '#3b82f6', label: 'Bleu' },
  { value: '#10b981', label: 'Vert' },
  { value: '#f59e0b', label: 'Jaune' },
  { value: '#ef4444', label: 'Rouge' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#f97316', label: 'Orange' },
  { value: '#ec4899', label: 'Rose' },
]

interface WidgetSettingsCommonProps {
  widget: DashboardWidget
  onUpdateMeta: (patch: Partial<Pick<DashboardWidget, 'title' | 'description'>>) => void
  onUpdateConfig: (patch: Record<string, unknown>) => void
}

export function WidgetSettingsCommon({ widget, onUpdateMeta, onUpdateConfig }: WidgetSettingsCommonProps) {
  const { t } = useTranslation()
  const bgColor = (widget.config?.bg_color as string) || ''
  const accentColor = (widget.config?.accent_color as string) || ''
  const hideHeader = (widget.config?.hide_header as boolean) || false

  return (
    <>
      <FormSection title={t('common.general')}>
        <DynamicPanelField label={t('common.title_field')}>
          <input
            type="text"
            className={panelInputClass}
            value={widget.title}
            onChange={(e) => onUpdateMeta({ title: e.target.value })}
          />
        </DynamicPanelField>
        <DynamicPanelField label={t('common.description')}>
          <textarea
            className={`${panelInputClass} min-h-[50px]`}
            value={widget.description || ''}
            onChange={(e) => onUpdateMeta({ description: e.target.value || null })}
            placeholder="Description du widget..."
          />
        </DynamicPanelField>
        <DynamicPanelField label="Rafraîchissement">
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

      <FormSection title={t('common.appearance')} collapsible defaultExpanded={false} storageKey="widget-settings-appearance">
        <DynamicPanelField label="Couleur de fond">
          <div className="flex items-center gap-2">
            <select
              className="gl-form-select flex-1"
              value={bgColor}
              onChange={(e) => onUpdateConfig({ bg_color: e.target.value || null })}
            >
              {PRESET_COLORS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            {bgColor && <div className="w-5 h-5 rounded border shrink-0" style={{ backgroundColor: bgColor }} />}
          </div>
        </DynamicPanelField>
        <DynamicPanelField label="Couleur d'accent">
          <div className="flex items-center gap-2">
            <select
              className="gl-form-select flex-1"
              value={accentColor}
              onChange={(e) => onUpdateConfig({ accent_color: e.target.value || null })}
            >
              {ACCENT_COLORS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            {accentColor && <div className="w-5 h-5 rounded border shrink-0" style={{ backgroundColor: accentColor }} />}
          </div>
        </DynamicPanelField>
        <DynamicPanelField label="Masquer en-tête">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={hideHeader}
              onChange={(e) => onUpdateConfig({ hide_header: e.target.checked })}
            />
            En-tête minimal (titre seulement, pas de barre)
          </label>
        </DynamicPanelField>
      </FormSection>
    </>
  )
}
