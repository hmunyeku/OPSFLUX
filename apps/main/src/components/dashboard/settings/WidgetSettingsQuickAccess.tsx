/**
 * QuickAccess widget settings — configure shortcut items, columns, colors.
 */
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, GripVertical } from 'lucide-react'
import {
  FormSection,
  DynamicPanelField,
  panelInputClass,
  TagSelector,
} from '@/components/layout/DynamicPanel'

const COLUMN_OPTIONS = [
  { value: '2', label: '2 cols' },
  { value: '3', label: '3 cols' },
  { value: '4', label: '4 cols' },
  { value: '5', label: '5 cols' },
  { value: '6', label: '6 cols' },
]

const ICON_OPTIONS = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'users', label: 'Utilisateurs' },
  { value: 'tiers', label: 'Tiers' },
  { value: 'assets', label: 'Assets' },
  { value: 'projets', label: 'Projets' },
  { value: 'travelwiz', label: 'TravelWiz' },
  { value: 'conformite', label: 'Conformité' },
  { value: 'planner', label: 'Planner' },
  { value: 'documents', label: 'Documents' },
  { value: 'settings', label: 'Settings' },
  { value: 'search', label: 'Recherche' },
  { value: 'star', label: 'Favori' },
  { value: 'calendar', label: 'Calendrier' },
  { value: 'chart', label: 'Graphique' },
  { value: 'globe', label: 'Globe' },
  { value: 'bell', label: 'Notifications' },
]

const PRESET_COLORS = [
  '#1e40af', '#047857', '#b45309', '#0891b2', '#7c3aed',
  '#dc2626', '#374151', '#0f172a', '#c026d3', '#0d9488',
]

interface QuickAccessItem {
  label: string
  path: string
  icon?: string
  color?: string
  description?: string
}

interface WidgetSettingsQuickAccessProps {
  config: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
}

export function WidgetSettingsQuickAccess({ config, onChange }: WidgetSettingsQuickAccessProps) {
  const { t } = useTranslation()
  const items = (config.items as QuickAccessItem[]) || []

  const updateItem = (idx: number, patch: Partial<QuickAccessItem>) => {
    const updated = items.map((item, i) => (i === idx ? { ...item, ...patch } : item))
    onChange({ items: updated })
  }

  const addItem = () => {
    onChange({
      items: [...items, { label: 'Nouveau', path: '/', icon: 'star', color: '#3b82f6' }],
    })
  }

  const removeItem = (idx: number) => {
    onChange({ items: items.filter((_, i) => i !== idx) })
  }

  const moveItem = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= items.length) return
    const updated = [...items]
    ;[updated[idx], updated[target]] = [updated[target], updated[idx]]
    onChange({ items: updated })
  }

  return (
    <FormSection title="Configuration Accès Rapide" collapsible defaultExpanded storageKey="widget-settings-quick-access">
      <DynamicPanelField label="Colonnes">
        <TagSelector
          options={COLUMN_OPTIONS}
          value={String((config.columns as number) || 4)}
          onChange={(v) => onChange({ columns: Number(v) })}
        />
      </DynamicPanelField>

      {/* Items editors */}
      <div className="space-y-2 mt-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Raccourcis ({items.length})</p>
        {items.map((item, idx) => (
          <div key={idx} className="rounded-lg border border-border/50 bg-muted/20 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveItem(idx, -1)}
                  disabled={idx === 0}
                  className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                  title={t('common.up')}
                >
                  <GripVertical size={10} className="text-muted-foreground" />
                </button>
                <span className="text-[10px] font-semibold text-muted-foreground">#{idx + 1}</span>
              </div>
              <button onClick={() => removeItem(idx)} className="p-0.5 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive">
                <Trash2 size={10} />
              </button>
            </div>
            <input
              type="text"
              className={panelInputClass}
              value={item.label || ''}
              onChange={(e) => updateItem(idx, { label: e.target.value })}
              placeholder="Label"
            />
            <input
              type="text"
              className={panelInputClass}
              value={item.path || ''}
              onChange={(e) => updateItem(idx, { path: e.target.value })}
              placeholder="Chemin (ex: /projets)"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <select
                className={panelInputClass}
                value={item.icon || 'star'}
                onChange={(e) => updateItem(idx, { icon: e.target.value })}
              >
                {ICON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <input
                  type="color"
                  value={item.color || '#3b82f6'}
                  onChange={(e) => updateItem(idx, { color: e.target.value })}
                  className="w-6 h-6 rounded border border-border cursor-pointer"
                />
                <div className="flex gap-0.5 flex-wrap">
                  {PRESET_COLORS.slice(0, 5).map((c) => (
                    <button
                      key={c}
                      onClick={() => updateItem(idx, { color: c })}
                      className="w-3.5 h-3.5 rounded-full border border-white/30 hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={addItem}
          className="gl-button-sm gl-button-outline flex items-center gap-1 w-full justify-center text-[10px]"
        >
          <Plus size={10} />
          Ajouter un raccourci
        </button>
      </div>
    </FormSection>
  )
}
