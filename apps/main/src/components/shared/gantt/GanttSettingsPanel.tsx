/**
 * GanttSettingsPanel — Floating settings panel for GanttCore.
 *
 * Display controls: bar height, zoom, labels, progress, baselines,
 * dependencies, weekends, dates display mode.
 * Filters: status checkboxes, priority checkboxes, assignee search.
 */
import { useState, type ReactNode } from 'react'
import { Settings2, X, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GanttSettings, GanttPreset } from './ganttTypes'
import { DEFAULT_SETTINGS } from './ganttTypes'

import type { GanttColumn } from './ganttTypes'

interface GanttSettingsPanelProps {
  settings: GanttSettings
  onChange: (patch: Partial<GanttSettings>) => void
  /** Available status values for filter checkboxes */
  statuses?: { value: string; label: string; color?: string }[]
  /** Available priority values for filter checkboxes */
  priorities?: { value: string; label: string; color?: string }[]
  /** Available columns for show/hide toggles */
  columns?: GanttColumn[]
  /** Saved presets */
  presets?: GanttPreset[]
  onSavePreset?: (name: string) => void
  onLoadPreset?: (preset: GanttPreset) => void
  onDeletePreset?: (name: string) => void
  /** Extra sections injected at the bottom of the panel by the host */
  extraContent?: ReactNode
}

export function GanttSettingsPanel({ settings, onChange, statuses = [], priorities = [], columns = [], presets = [], onSavePreset, onLoadPreset, onDeletePreset, extraContent }: GanttSettingsPanelProps) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
        title="Paramètres du Gantt"
      >
        <Settings2 className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div className="fixed top-16 right-8 z-[9999] w-[360px] max-h-[80vh] overflow-y-auto rounded-lg border bg-card shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b sticky top-0 bg-card z-10">
        <span className="text-xs font-semibold">Paramètres Gantt</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onChange({ ...DEFAULT_SETTINGS, scale: settings.scale })}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            title="Réinitialiser"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-4">
        {/* ── Display ──────────────────────────────────────── */}
        <section>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Affichage</h4>
          <div className="space-y-2.5">
            {/* Bar height slider */}
            <div>
              <label className="text-xs text-foreground flex items-center justify-between">
                Hauteur des barres
                <span className="text-muted-foreground tabular-nums">{settings.barHeight}px</span>
              </label>
              <input
                type="range" min={12} max={40} step={2}
                value={settings.barHeight}
                onChange={e => onChange({ barHeight: Number(e.target.value) })}
                className="w-full h-1.5 mt-1 accent-primary"
              />
            </div>

            {/* Row height slider */}
            <div>
              <label className="text-xs text-foreground flex items-center justify-between">
                Hauteur des lignes
                <span className="text-muted-foreground tabular-nums">{settings.rowHeight}px</span>
              </label>
              <input
                type="range" min={24} max={56} step={2}
                value={settings.rowHeight}
                onChange={e => onChange({ rowHeight: Number(e.target.value) })}
                className="w-full h-1.5 mt-1 accent-primary"
              />
            </div>

            {/* Zoom slider */}
            <div>
              <label className="text-xs text-foreground flex items-center justify-between">
                Zoom
                <span className="text-muted-foreground tabular-nums">{Math.round(settings.zoomFactor * 100)}%</span>
              </label>
              <input
                type="range" min={25} max={400} step={25}
                value={Math.round(settings.zoomFactor * 100)}
                onChange={e => onChange({ zoomFactor: Number(e.target.value) / 100 })}
                className="w-full h-1.5 mt-1 accent-primary"
              />
            </div>

            {/* Toggle switches */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'showLabels' as const, label: 'Labels' },
                { key: 'showProgress' as const, label: 'Progression' },
                { key: 'showBaselines' as const, label: 'Baselines' },
                { key: 'showDependencies' as const, label: 'Dépendances' },
                { key: 'showToday' as const, label: "Aujourd'hui" },
                { key: 'showWeekends' as const, label: 'Week-ends' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    onChange={e => onChange({ [key]: e.target.checked })}
                    className="gl-checkbox"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* ── Filters ─────────────────────────────────────── */}
        {(statuses.length > 0 || priorities.length > 0) && (
          <section>
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Filtres</h4>

            {/* Status filter */}
            {statuses.length > 0 && (
              <div className="mb-2">
                <span className="text-[10px] text-muted-foreground">Statuts visibles</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {statuses.map(s => {
                    const hidden = settings.hiddenStatuses.includes(s.value)
                    return (
                      <button
                        key={s.value}
                        onClick={() => {
                          const next = hidden
                            ? settings.hiddenStatuses.filter(x => x !== s.value)
                            : [...settings.hiddenStatuses, s.value]
                          onChange({ hiddenStatuses: next })
                        }}
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all',
                          hidden
                            ? 'border-border text-muted-foreground/50 line-through'
                            : 'border-transparent',
                        )}
                        style={hidden ? {} : { backgroundColor: (s.color || '#3b82f6') + '18', color: s.color || '#3b82f6' }}
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Priority filter */}
            {priorities.length > 0 && (
              <div className="mb-2">
                <span className="text-[10px] text-muted-foreground">Priorités visibles</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {priorities.map(p => {
                    const hidden = settings.hiddenPriorities.includes(p.value)
                    return (
                      <button
                        key={p.value}
                        onClick={() => {
                          const next = hidden
                            ? settings.hiddenPriorities.filter(x => x !== p.value)
                            : [...settings.hiddenPriorities, p.value]
                          onChange({ hiddenPriorities: next })
                        }}
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all',
                          hidden
                            ? 'border-border text-muted-foreground/50 line-through'
                            : 'border-transparent',
                        )}
                        style={hidden ? {} : { backgroundColor: (p.color || '#3b82f6') + '18', color: p.color || '#3b82f6' }}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Assignee filter */}
            <div>
              <span className="text-[10px] text-muted-foreground">Assigné (recherche)</span>
              <input
                type="text"
                value={settings.filterAssignee || ''}
                onChange={e => onChange({ filterAssignee: e.target.value || null })}
                placeholder="Filtrer par nom..."
                className="w-full mt-1 h-7 px-2 text-xs border rounded bg-background"
              />
            </div>
          </section>
        )}

        {/* ── Columns ─────────────────────────────────────── */}
        {columns.length > 0 && (
          <section>
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Colonnes</h4>
            <div className="space-y-1">
              {columns.map(col => {
                const hidden = (settings.hiddenColumns || []).includes(col.id)
                return (
                  <label key={col.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!hidden}
                      onChange={() => {
                        const next = hidden
                          ? (settings.hiddenColumns || []).filter(c => c !== col.id)
                          : [...(settings.hiddenColumns || []), col.id]
                        onChange({ hiddenColumns: next })
                      }}
                      className="gl-checkbox"
                    />
                    {col.label}
                  </label>
                )
              })}
            </div>
          </section>
        )}
        {/* ── Host-provided extra sections ─────────────────── */}
        {extraContent && (
          <div className="border-t border-border/50 -mx-3 px-3 pt-4">
            {extraContent}
          </div>
        )}

        {/* ── Presets ─────────────────────────────────────── */}
        {onSavePreset && (
          <section>
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Préréglages</h4>
            <div className="space-y-1 mb-2">
              {presets.map(p => (
                <div key={p.name} className="flex items-center gap-1">
                  <button
                    onClick={() => onLoadPreset?.(p)}
                    className="flex-1 text-left text-xs px-2 py-1 rounded hover:bg-muted truncate"
                  >
                    {p.name}
                  </button>
                  <button
                    onClick={() => onDeletePreset?.(p.name)}
                    className="p-0.5 rounded hover:bg-destructive/10 text-destructive/50 shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {presets.length === 0 && (
                <p className="text-[10px] text-muted-foreground italic">Aucun préréglage</p>
              )}
            </div>
            <button
              onClick={() => {
                const name = prompt('Nom du préréglage :')
                if (name?.trim()) onSavePreset(name.trim())
              }}
              className="w-full text-[10px] px-2 py-1 rounded border border-border hover:bg-muted text-center"
            >
              + Sauvegarder la vue actuelle
            </button>
          </section>
        )}
      </div>
    </div>
  )
}
