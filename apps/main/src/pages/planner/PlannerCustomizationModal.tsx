/**
 * PlannerCustomizationModal — User-driven customization of the unified
 * Planner Gantt+Heatmap view. Persists into prefs.planner.gantt_view via
 * useUserPreferences (cached in localStorage + synced to DB).
 *
 * Features:
 *  - Pick which hierarchy levels to show (field, site, installation, activity)
 *  - Filter the view to a single field / site / installation
 *  - Toggle the global TOTAL rows (peak saturation, sum PAX)
 *  - Choose what is displayed inside heatmap cells (% saturation, PAX count, none)
 *  - Choose where the activity title is shown on the bar (none / before / after)
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Layers, Filter, BarChart3, RotateCcw } from 'lucide-react'
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

  // What to render inside heatmap cells
  heatmap_text_mode: 'percentage' | 'pax_count' | 'none'

  // Where to show the activity title relative to the bar
  bar_title_position: 'none' | 'before' | 'after'
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
  heatmap_text_mode: 'percentage',
  bar_title_position: 'none',
}

/**
 * Validation: at least one row source must be visible, otherwise activities
 * would be orphans with no parent to attach to.
 */
export function validatePlannerGanttPrefs(p: PlannerGanttViewPrefs): PlannerGanttViewPrefs {
  const anyHierarchy = p.show_field_rows || p.show_site_rows || p.show_installation_rows
  const anyTotal = p.show_total_peak || p.show_total_sum
  // If user disabled all hierarchy AND all totals, force field rows back ON.
  if (!anyHierarchy && !anyTotal) {
    return { ...p, show_field_rows: true }
  }
  return p
}

// ── Modal ───────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  prefs: PlannerGanttViewPrefs
  onChange: (prefs: PlannerGanttViewPrefs) => void
}

export function PlannerCustomizationModal({ open, onClose, prefs, onChange }: Props) {
  const { data: hierarchy = [] } = useAssetHierarchy()
  const [draft, setDraft] = useState<PlannerGanttViewPrefs>(prefs)

  // Reset draft when reopening
  useEffect(() => {
    if (open) setDraft(prefs)
  }, [open, prefs])

  // ── Field/Site/Installation options derived from hierarchy ──
  const fieldOptions = useMemo(
    () => (hierarchy as HierarchyFieldNode[]).map((f) => ({ id: f.id, name: f.name })),
    [hierarchy],
  )

  const siteOptions = useMemo(() => {
    const opts: Array<{ id: string; name: string; fieldName: string }> = []
    for (const f of hierarchy as HierarchyFieldNode[]) {
      if (draft.field_filter && f.id !== draft.field_filter) continue
      for (const s of f.sites) opts.push({ id: s.id, name: s.name, fieldName: f.name })
    }
    return opts
  }, [hierarchy, draft.field_filter])

  const installationOptions = useMemo(() => {
    const opts: Array<{ id: string; name: string; siteName: string }> = []
    for (const f of hierarchy as HierarchyFieldNode[]) {
      if (draft.field_filter && f.id !== draft.field_filter) continue
      for (const s of f.sites) {
        if (draft.site_filter && s.id !== draft.site_filter) continue
        for (const i of s.installations) opts.push({ id: i.id, name: i.name, siteName: s.name })
      }
    }
    return opts
  }, [hierarchy, draft.field_filter, draft.site_filter])

  // When the field changes, clear deeper filters that are no longer compatible
  const setField = useCallback((id: string | null) => {
    setDraft((d) => ({ ...d, field_filter: id, site_filter: null, installation_filter: null }))
  }, [])
  const setSite = useCallback((id: string | null) => {
    setDraft((d) => ({ ...d, site_filter: id, installation_filter: null }))
  }, [])
  const setInst = useCallback((id: string | null) => {
    setDraft((d) => ({ ...d, installation_filter: id }))
  }, [])

  const updateDraft = <K extends keyof PlannerGanttViewPrefs>(key: K, value: PlannerGanttViewPrefs[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  const handleApply = () => {
    onChange(validatePlannerGanttPrefs(draft))
    onClose()
  }

  const handleReset = () => {
    setDraft(DEFAULT_PLANNER_GANTT_VIEW)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-black/40 backdrop-blur-sm animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[var(--z-modal)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card shadow-xl animate-in fade-in slide-in-from-bottom-4 w-[95vw] max-w-2xl max-h-[85vh] flex flex-col">

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <BarChart3 size={14} className="text-primary" />
              <Dialog.Title className="text-sm font-semibold">Personnaliser la vue Gantt + Heatmap</Dialog.Title>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                title="Réinitialiser aux valeurs par défaut"
              >
                <RotateCcw size={11} /> Réinitialiser
              </button>
              <Dialog.Close asChild>
                <button className="p-1 rounded hover:bg-accent"><X size={14} /></button>
              </Dialog.Close>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

            {/* ── Hierarchy levels ── */}
            <Section icon={Layers} title="Niveaux affichés">
              <p className="text-[11px] text-muted-foreground mb-2">
                Cochez les niveaux à afficher dans le tableau. Les activités s'attachent automatiquement
                au niveau parent visible le plus profond. Au moins un niveau parent doit rester actif.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Toggle
                  label="Champs (niveau 0)"
                  checked={draft.show_field_rows}
                  onChange={(v) => updateDraft('show_field_rows', v)}
                />
                <Toggle
                  label="Sites (niveau 1)"
                  checked={draft.show_site_rows}
                  onChange={(v) => updateDraft('show_site_rows', v)}
                />
                <Toggle
                  label="Installations (niveau 2)"
                  checked={draft.show_installation_rows}
                  onChange={(v) => updateDraft('show_installation_rows', v)}
                />
                <Toggle
                  label="Activités (niveau 3)"
                  checked={draft.show_activity_rows}
                  onChange={(v) => updateDraft('show_activity_rows', v)}
                />
              </div>
            </Section>

            {/* ── Total rows ── */}
            <Section icon={BarChart3} title="Lignes de récapitulatif">
              <p className="text-[11px] text-muted-foreground mb-2">
                Affiche une ou deux lignes en tête du tableau qui agrègent toutes les installations.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Toggle
                  label="Pic max global (%)"
                  checked={draft.show_total_peak}
                  onChange={(v) => updateDraft('show_total_peak', v)}
                />
                <Toggle
                  label="Somme PAX globale"
                  checked={draft.show_total_sum}
                  onChange={(v) => updateDraft('show_total_sum', v)}
                />
              </div>
            </Section>

            {/* ── Scope filters ── */}
            <Section icon={Filter} title="Périmètre">
              <p className="text-[11px] text-muted-foreground mb-2">
                Restreindre l'affichage à un champ, un site, ou une installation. Choix en cascade.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Selector
                  label="Champ"
                  value={draft.field_filter}
                  options={fieldOptions.map((f) => ({ value: f.id, label: f.name }))}
                  onChange={setField}
                />
                <Selector
                  label="Site"
                  value={draft.site_filter}
                  options={siteOptions.map((s) => ({ value: s.id, label: s.name }))}
                  onChange={setSite}
                  disabled={siteOptions.length === 0}
                />
                <Selector
                  label="Installation"
                  value={draft.installation_filter}
                  options={installationOptions.map((i) => ({ value: i.id, label: i.name }))}
                  onChange={setInst}
                  disabled={installationOptions.length === 0}
                />
              </div>
            </Section>

            {/* ── Heatmap cell text ── */}
            <Section icon={BarChart3} title="Texte dans les cellules heatmap">
              <div className="flex items-center gap-2">
                <RadioPill
                  label="Saturation %"
                  active={draft.heatmap_text_mode === 'percentage'}
                  onClick={() => updateDraft('heatmap_text_mode', 'percentage')}
                />
                <RadioPill
                  label="Nombre de PAX"
                  active={draft.heatmap_text_mode === 'pax_count'}
                  onClick={() => updateDraft('heatmap_text_mode', 'pax_count')}
                />
                <RadioPill
                  label="Aucun"
                  active={draft.heatmap_text_mode === 'none'}
                  onClick={() => updateDraft('heatmap_text_mode', 'none')}
                />
              </div>
            </Section>

            {/* ── Bar title ── */}
            <Section icon={BarChart3} title="Titre des barres d'activité">
              <p className="text-[11px] text-muted-foreground mb-2">
                Le titre est déjà affiché dans la colonne TÂCHE à gauche. Vous pouvez aussi l'afficher
                à côté de la barre dans la zone timeline.
              </p>
              <div className="flex items-center gap-2">
                <RadioPill
                  label="Aucun"
                  active={draft.bar_title_position === 'none'}
                  onClick={() => updateDraft('bar_title_position', 'none')}
                />
                <RadioPill
                  label="Avant la barre"
                  active={draft.bar_title_position === 'before'}
                  onClick={() => updateDraft('bar_title_position', 'before')}
                />
                <RadioPill
                  label="Après la barre"
                  active={draft.bar_title_position === 'after'}
                  onClick={() => updateDraft('bar_title_position', 'after')}
                />
              </div>
            </Section>
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
            <Dialog.Close asChild>
              <button className="px-3 py-1.5 text-xs rounded border border-border hover:bg-muted">
                Annuler
              </button>
            </Dialog.Close>
            <button
              onClick={handleApply}
              className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Appliquer
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ── Reusable mini-components ────────────────────────────────────

function Section({ icon: Icon, title, children }: { icon: typeof Layers; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={12} className="text-muted-foreground" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
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
        className="h-3.5 w-3.5 rounded border-border accent-primary"
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
        'px-2.5 py-1 rounded-md border text-[11px] transition-colors',
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
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className="w-full h-7 px-2 text-xs border border-border rounded bg-background disabled:opacity-50"
      >
        <option value="">Tous</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export default PlannerCustomizationModal
