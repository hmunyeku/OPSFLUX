/**
 * Clock widget settings — mode, timezone, features, locale.
 */
import { useTranslation } from 'react-i18next'
import {
  FormSection,
  DynamicPanelField,
  panelInputClass,
  TagSelector,
} from '@/components/layout/DynamicPanel'

const MODE_OPTIONS = [
  { value: 'digital', label: 'Numérique' },
  { value: 'analog', label: 'Analogique' },
]

const LOCALE_OPTIONS = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
]

const COMMON_TIMEZONES = [
  'Europe/Paris',
  'Europe/London',
  'Africa/Douala',
  'Africa/Lagos',
  'Africa/Libreville',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Singapore',
  'UTC',
]

interface WidgetSettingsClockProps {
  config: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}

export function WidgetSettingsClock({ config, onChange }: WidgetSettingsClockProps) {
  const { t } = useTranslation()
  return (
    <FormSection title="Configuration Horloge" collapsible defaultExpanded storageKey="widget-settings-clock">
      <DynamicPanelField label="Mode">
        <TagSelector
          options={MODE_OPTIONS}
          value={(config.mode as string) || 'digital'}
          onChange={(v) => onChange({ mode: v })}
        />
      </DynamicPanelField>
      <DynamicPanelField label="Fuseau horaire">
        <select
          className={panelInputClass}
          value={(config.timezone as string) || ''}
          onChange={(e) => onChange({ timezone: e.target.value || undefined })}
        >
          <option value="">Auto (navigateur)</option>
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </DynamicPanelField>
      <DynamicPanelField label={t('common.language')}>
        <TagSelector
          options={LOCALE_OPTIONS}
          value={(config.locale as string) || 'fr'}
          onChange={(v) => onChange({ locale: v })}
        />
      </DynamicPanelField>
      <div className="space-y-1.5 mt-1">
        {[
          { key: 'show_date', label: 'Afficher la date', default: true },
          { key: 'show_seconds', label: 'Afficher les secondes', default: true },
          { key: 'show_moon', label: 'Phase lunaire', default: true },
          { key: 'show_season', label: 'Saison', default: true },
        ].map(({ key, label, default: def }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="gl-checkbox"
              checked={config[key] !== undefined ? config[key] === true : def}
              onChange={(e) => onChange({ [key]: e.target.checked })}
            />
            <span className="text-xs text-foreground">{label}</span>
          </label>
        ))}
      </div>
    </FormSection>
  )
}
