/**
 * PlannerCustomizationSections — Reusable JSX sections for customizing the
 * unified Planner Gantt+Heatmap view. Designed to be injected into the
 * GanttCore settings panel via the `extraSettingsContent` slot, so the user
 * has a SINGLE settings entry point (the gear button on the Gantt toolbar).
 *
 * Persistence is handled by the parent (PlannerPage) via useUserPreferences.
 * This component is purely presentational + state-lifted.
 */
import { useMemo, useCallback } from 'react'
import { Layers, Filter, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAssetHierarchy } from '@/hooks/useAssetRegistry'
import type { HierarchyFieldNode } from '@/types/assetRegistry'

// ── Preferences shape ───────────────────────────────────────────

export interface PlannerGanttViewPrefs {
  // Hierarchy levels (independently toggleable)
  show_field_rows: boolean
  show_site_rows: boolean
  show_installation_rows: boolean
  show_activity_rows: boolean

  // Scope filters (mutually exclusive — installation overrides site overrides field)
  field_filter: string | null
  site_filter: string | null
  installation_filter: string | null

  // Total recap rows
  show_total_peak: boolean         // global max saturation
  show_total_sum: boolean          // global sum of forecast PAX

  // Workload plan row (stacked bars by activity type) at the bottom
  // of the gantt. Shows the daily total headcount split by activity
  // type, scrolling in sync with the main timeline.
  show_workload_chart: boolean
  // When `show_workload_chart` is on, also overlay a cumulative trend
  // line on top of the stacks so the user can see whether the load is
  // ramping up or down over the range.
  show_workload_cumulative: boolean

  // What to render inside heatmap cells
  heatmap_text_mode: 'percentage' | 'pax_count' | 'none'

  // Where to show the activity title relative to the bar
  bar_title_position: 'none' | 'before' | 'after'

  // Hide hierarchy rows that contain no activity in their subtree
  hide_empty_rows: boolean

  // Hide the secondary sublabel text on rows (e.g. "3 install.", "Brouillon")
  show_row_sublabels: boolean

  // Compact row height for heatmap rows (Field/Site/Installation/Total) in px
  heatmap_row_height: number

  // Aggregation mode for Field/Site/Installation rows: sum of all children
  // PAX (default — capacity planning view) or peak max per day (peak load).
  parent_rows_aggregation: 'sum' | 'peak'

  // Behaviour when dragging a bar that has dependencies:
  //  - 'warn'    : show a violation dialog, no auto-shift (default)
  //  - 'cascade' : auto-shift all affected successors to maintain constraints
  //  - 'strict'  : reject the drag outright if it violates any constraint
  drag_cascade_mode: 'warn' | 'cascade' | 'strict'

  // Activity type filter — when non-empty, only activities whose type is in
  // the list are shown. Toggled by clicking the legend chips above the Gantt.
  // Empty array = show all types (default).
  activity_type_filter: string[]

  // Activity validity filter — filters activities by their "validity band":
  //   'validated' → status in (validated, in_progress, completed)
  //   'draft'     → status in (draft, submitted, rejected, cancelled)
  // Empty array = show all (default). Toggled via the same legend row as
  // the type chips (next to the Validé / Brouillon swatches).
  activity_validity_filter: ('validated' | 'draft')[]
}

export const DEFAULT_PLANNER_GANTT_VIEW: PlannerGanttViewPrefs = {
  show_field_rows: true,
  show_site_rows: true,
  show_installation_rows: true,
  show_activity_rows: true,
  field_filter: null,
  site_filter: null,
  installation_filter: null,
  show_total_peak: false,
  show_total_sum: false,
  show_workload_chart: false,
  show_workload_cumulative: false,
  heatmap_text_mode: 'percentage',
  bar_title_position: 'none',
  hide_empty_rows: true,
  show_row_sublabels: true,
  heatmap_row_height: 22,
  parent_rows_aggregation: 'sum',
  drag_cascade_mode: 'warn',
  activity_type_filter: [],
  activity_validity_filter: [],
}

/**
 * Validation: at least one row source must be visible, otherwise activities
 * would be orphans with no parent to attach to.
 */
export function validatePlannerGanttPrefs(p: PlannerGanttViewPrefs): PlannerGanttViewPrefs {
  const anyHierarchy = p.show_field_rows || p.show_site_rows || p.show_installation_rows
  const anyTotal = p.show_total_peak || p.show_total_sum
  if (!anyHierarchy && !anyTotal) {
    return { ...p, show_field_rows: true }
  }
  return p
}

// ── Sections (host inside any container) ────────────────────────

/**
 * Lower bound for the heatmap row height slider. Below 18px the
 * saturation % / PAX count labels are too cramped to read (`text-[9px]` is
 * already on the floor of legibility).
 */
export const HEATMAP_ROW_HEIGHT_MIN = 18

interface Props {
  prefs: PlannerGanttViewPrefs
  onChange: (prefs: PlannerGanttViewPrefs) => void
  /**
   * Current GanttCore bar height (px). The heatmap row height slider is
   * capped at this value so heatmap rows can never be visually taller than
   * the activity bars underneath — that would break the rhythm of the
   * chart. Defaults to 18 (the GanttCore default) when not provided.
   */
  barHeight?: number
}

export function PlannerCustomizationSections({ prefs, onChange, barHeight = 18 }: Props) {
  const { data: hierarchy = [] } = useAssetHierarchy()

  // ── Field/Site/Installation options derived from hierarchy ──
  const fieldOptions = useMemo(
    () => (hierarchy as HierarchyFieldNode[]).map((f) => ({ id: f.id, name: f.name })),
    [hierarchy],
  )

  const siteOptions = useMemo(() => {
    const opts: Array<{ id: string; name: string }> = []
    for (const f of hierarchy as HierarchyFieldNode[]) {
      if (prefs.field_filter && f.id !== prefs.field_filter) continue
      for (const s of f.sites) opts.push({ id: s.id, name: s.name })
    }
    return opts
  }, [hierarchy, prefs.field_filter])

  const installationOptions = useMemo(() => {
    const opts: Array<{ id: string; name: string }> = []
    for (const f of hierarchy as HierarchyFieldNode[]) {
      if (prefs.field_filter && f.id !== prefs.field_filter) continue
      for (const s of f.sites) {
        if (prefs.site_filter && s.id !== prefs.site_filter) continue
        for (const i of s.installations) opts.push({ id: i.id, name: i.name })
      }
    }
    return opts
  }, [hierarchy, prefs.field_filter, prefs.site_filter])

  const update = useCallback(
    <K extends keyof PlannerGanttViewPrefs>(key: K, value: PlannerGanttViewPrefs[K]) => {
      onChange(validatePlannerGanttPrefs({ ...prefs, [key]: value }))
    },
    [prefs, onChange],
  )

  // When the field changes, clear deeper filters
  const setField = useCallback((id: string | null) => {
    onChange(validatePlannerGanttPrefs({
      ...prefs,
      field_filter: id,
      site_filter: null,
      installation_filter: null,
    }))
  }, [prefs, onChange])

  const setSite = useCallback((id: string | null) => {
    onChange(validatePlannerGanttPrefs({
      ...prefs,
      site_filter: id,
      installation_filter: null,
    }))
  }, [prefs, onChange])

  const setInst = useCallback((id: string | null) => {
    onChange(validatePlannerGanttPrefs({ ...prefs, installation_filter: id }))
  }, [prefs, onChange])

  return (
    <div className="space-y-4">

      {/* ── Hierarchy levels ── */}
      <Section icon={Layers} title="Niveaux affichés">
        <div className="grid grid-cols-2 gap-1.5">
          <Toggle label="Champs" checked={prefs.show_field_rows} onChange={(v) => update('show_field_rows', v)} />
          <Toggle label="Sites" checked={prefs.show_site_rows} onChange={(v) => update('show_site_rows', v)} />
          <Toggle label="Installations" checked={prefs.show_installation_rows} onChange={(v) => update('show_installation_rows', v)} />
          <Toggle label="Activités" checked={prefs.show_activity_rows} onChange={(v) => update('show_activity_rows', v)} />
        </div>
        <div className="mt-2 pt-2 border-t border-border/50 space-y-2">
          <Toggle
            label="Masquer les lignes vides (sans activité)"
            checked={prefs.hide_empty_rows}
            onChange={(v) => update('hide_empty_rows', v)}
          />
          <Toggle
            label="Afficher les sous-titres (3 install., Brouillon, …)"
            checked={prefs.show_row_sublabels}
            onChange={(v) => update('show_row_sublabels', v)}
          />
          <div>
            {(() => {
              // Clamp slider bounds: floor at HEATMAP_ROW_HEIGHT_MIN (18 px —
              // below that the `text-[9px]` saturation labels stop being
              // legible) and cap at the current GanttCore barHeight so a
              // heatmap row can never be taller than the activity bars
              // underneath. If the stored value is out of the current range
              // (e.g. barHeight was lowered later), display the clamped value
              // so the UI and the rendered chart always agree.
              const ceiling = Math.max(HEATMAP_ROW_HEIGHT_MIN, barHeight)
              const displayed = Math.min(
                ceiling,
                Math.max(HEATMAP_ROW_HEIGHT_MIN, prefs.heatmap_row_height),
              )
              return (
                <>
                  <label className="text-xs text-foreground flex items-center justify-between">
                    Hauteur des lignes heatmap
                    <span className="text-muted-foreground tabular-nums">{displayed}px</span>
                  </label>
                  <input
                    type="range"
                    min={HEATMAP_ROW_HEIGHT_MIN}
                    max={ceiling}
                    step={2}
                    value={displayed}
                    onChange={(e) => {
                      const next = Math.min(ceiling, Math.max(HEATMAP_ROW_HEIGHT_MIN, Number(e.target.value)))
                      update('heatmap_row_height', next)
                    }}
                    className="w-full h-1.5 mt-1 accent-primary"
                  />
                  <p className="text-[9px] text-muted-foreground mt-0.5">
                    Entre {HEATMAP_ROW_HEIGHT_MIN}px (lisibilité des libellés) et {ceiling}px (hauteur des barres Gantt).
                  </p>
                </>
              )
            })()}
          </div>
        </div>
      </Section>

      {/* ── Total rows ── */}
      <Section icon={BarChart3} title="Lignes de récapitulatif">
        <div className="grid grid-cols-1 gap-1.5">
          <Toggle label="Pic max global (%)" checked={prefs.show_total_peak} onChange={(v) => update('show_total_peak', v)} />
          <Toggle label="Somme PAX globale" checked={prefs.show_total_sum} onChange={(v) => update('show_total_sum', v)} />
          <Toggle
            label="Plan de charge par type d'activité"
            checked={prefs.show_workload_chart}
            onChange={(v) => update('show_workload_chart', v)}
          />
          {prefs.show_workload_chart && (
            <Toggle
              label="Courbe cumulée (tendance)"
              checked={prefs.show_workload_cumulative}
              onChange={(v) => update('show_workload_cumulative', v)}
            />
          )}
        </div>
        <p className="text-[9px] text-muted-foreground mt-1">
          Le plan de charge s'affiche en bas du Gantt, pinné pendant le défilement vertical, synchronisé avec le scale et tous les filtres actifs.
        </p>
      </Section>

      {/* ── Aggregation mode for parent rows ── */}
      <Section icon={BarChart3} title="Agrégation des lignes parents (Champ / Site / Installation)">
        <div className="flex items-center gap-1 flex-wrap">
          <RadioPill
            label="Somme PAX"
            active={prefs.parent_rows_aggregation === 'sum'}
            onClick={() => update('parent_rows_aggregation', 'sum')}
          />
          <RadioPill
            label="Pic max par jour"
            active={prefs.parent_rows_aggregation === 'peak'}
            onClick={() => update('parent_rows_aggregation', 'peak')}
          />
        </div>
      </Section>

      {/* ── Drag cascade behaviour ── */}
      <Section icon={BarChart3} title="Déplacement d'une barre avec dépendances">
        <div className="flex items-center gap-1 flex-wrap">
          <RadioPill
            label="Avertir (pas de cascade)"
            active={prefs.drag_cascade_mode === 'warn'}
            onClick={() => update('drag_cascade_mode', 'warn')}
          />
          <RadioPill
            label="Cascade (décaler les successeurs)"
            active={prefs.drag_cascade_mode === 'cascade'}
            onClick={() => update('drag_cascade_mode', 'cascade')}
          />
          <RadioPill
            label="Strict (refuser si conflit)"
            active={prefs.drag_cascade_mode === 'strict'}
            onClick={() => update('drag_cascade_mode', 'strict')}
          />
        </div>
        <p className="text-[9px] text-muted-foreground mt-1">
          En mode cascade, tous les successeurs directs et indirects sont automatiquement décalés pour
          préserver leurs contraintes FS/SS/FF/SF + lag.
        </p>
      </Section>

      {/* ── Scope filters ── */}
      <Section icon={Filter} title="Périmètre">
        <div className="space-y-1.5">
          <Selector
            label="Champ"
            value={prefs.field_filter}
            options={fieldOptions.map((f) => ({ value: f.id, label: f.name }))}
            onChange={setField}
          />
          <Selector
            label="Site"
            value={prefs.site_filter}
            options={siteOptions.map((s) => ({ value: s.id, label: s.name }))}
            onChange={setSite}
            disabled={siteOptions.length === 0}
          />
          <Selector
            label="Installation"
            value={prefs.installation_filter}
            options={installationOptions.map((i) => ({ value: i.id, label: i.name }))}
            onChange={setInst}
            disabled={installationOptions.length === 0}
          />
        </div>
      </Section>

      {/* ── Heatmap cell text ── */}
      <Section icon={BarChart3} title="Texte des cellules heatmap">
        <div className="flex items-center gap-1 flex-wrap">
          <RadioPill label="Saturation %" active={prefs.heatmap_text_mode === 'percentage'} onClick={() => update('heatmap_text_mode', 'percentage')} />
          <RadioPill label="PAX" active={prefs.heatmap_text_mode === 'pax_count'} onClick={() => update('heatmap_text_mode', 'pax_count')} />
          <RadioPill label="Aucun" active={prefs.heatmap_text_mode === 'none'} onClick={() => update('heatmap_text_mode', 'none')} />
        </div>
      </Section>

      {/* ── Bar title ── */}
      <Section icon={BarChart3} title="Titre des barres">
        <div className="flex items-center gap-1 flex-wrap">
          <RadioPill label="Aucun" active={prefs.bar_title_position === 'none'} onClick={() => update('bar_title_position', 'none')} />
          <RadioPill label="Avant" active={prefs.bar_title_position === 'before'} onClick={() => update('bar_title_position', 'before')} />
          <RadioPill label="Après" active={prefs.bar_title_position === 'after'} onClick={() => update('bar_title_position', 'after')} />
        </div>
      </Section>
    </div>
  )
}

// ── Reusable mini-components ────────────────────────────────────

function Section({ icon: Icon, title, children }: { icon: typeof Layers; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={11} className="text-muted-foreground" />
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      </div>
      {children}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="gl-checkbox h-3.5 w-3.5"
      />
      <span>{label}</span>
    </label>
  )
}

function RadioPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-2 py-0.5 rounded border text-[10px] transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary font-medium'
          : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  )
}

function Selector({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: string | null
  options: Array<{ value: string; label: string }>
  onChange: (v: string | null) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground w-[68px] shrink-0">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className="flex-1 h-6 px-1.5 text-[11px] border border-border rounded bg-background disabled:opacity-50"
      >
        <option value="">Tous</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export default PlannerCustomizationSections
