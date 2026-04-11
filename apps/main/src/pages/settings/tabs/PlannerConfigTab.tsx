/**
 * Planner Configuration tab — module-specific entity-level settings.
 */
import { useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { useSaveScopedSetting, useScopedSettingsMap } from '@/hooks/useSettings'

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3 border-b border-border/50 last:border-0">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function PlannerConfigTab() {
  const { toast } = useToast()
  const { data: settings, isLoading } = useScopedSettingsMap('entity')
  const mutation = useSaveScopedSetting('entity')

  const save = useCallback((key: string, value: unknown) => {
    mutation.mutate({ key, value }, {
      onSuccess: () => toast({ title: 'Paramètre enregistré', variant: 'success' }),
      onError: () => toast({ title: 'Erreur', variant: 'error' }),
    })
  }, [mutation, toast])

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>

  const s = settings ?? {}

  /**
   * Spec section 5.3: configurable delays. The Planner revision response
   * delay (in hours) is the duration the chef-de-projet has to answer
   * a revision request before the arbitre can force the validation.
   * Persisted as a scalar int via scopedSettingsService.put which wraps
   * the value as { v: <N> } on the wire. scopedSettingsService.map
   * unwraps it back so s['planner.revision_response_delay_hours'] is
   * already the raw number here.
   */
  const revisionDelayValue = (() => {
    const raw = s['planner.revision_response_delay_hours']
    if (typeof raw === 'number') return raw
    if (typeof raw === 'string') return Number(raw) || 72
    return 72
  })()

  return (
    <>
    <CollapsibleSection id="planner-revision-flow" title="Workflow de révision"
      description="Délais et règles d'arbitrage des révisions Planner (spec 2.8 / 5.3)."
      storageKey="settings.planner.revision.collapse" showSeparator>
      <div className="mt-2 space-y-0">
        <SettingRow
          label="Délai de réponse avant forçage (heures)"
          description="Au-delà de ce délai, l'arbitre peut forcer la validation d'une révision sans réponse du chef de projet."
        >
          <input
            type="number"
            min={1}
            max={720}
            className="gl-form-input w-24 text-sm text-right font-mono"
            defaultValue={revisionDelayValue}
            onBlur={(e) => {
              const v = Math.max(1, Math.min(720, Number(e.target.value) || 72))
              save('planner.revision_response_delay_hours', v)
            }}
          />
        </SettingRow>
      </div>
    </CollapsibleSection>

    <CollapsibleSection id="planner-capacity-heatmap" title="Heatmap capacité"
      description="Seuils et couleurs utilisés dans la heatmap de saturation Planner."
      storageKey="settings.planner.collapse" showSeparator={false}>
      <div className="mt-2 space-y-0">
        {[
          ['planner.capacity_heatmap_threshold_low', 'Seuil bas (%)', 0, 100, 40],
          ['planner.capacity_heatmap_threshold_medium', 'Seuil moyen (%)', 0, 100, 70],
          ['planner.capacity_heatmap_threshold_high', 'Seuil haut (%)', 0, 100, 90],
          ['planner.capacity_heatmap_threshold_critical', 'Seuil dépassement (%)', 0, 200, 100],
        ].map(([key, label, min, max, def]) => (
          <SettingRow key={key as string} label={label as string}
            description={key === 'planner.capacity_heatmap_threshold_critical'
              ? "Au-delà, la capacité est considérée dépassée."
              : "Au-delà de ce seuil, la couleur passe au niveau suivant."}>
            <input type="number" min={min as number} max={max as number}
              className="gl-form-input w-24 text-sm text-right font-mono"
              defaultValue={(s[key as string] as number) ?? (def as number)}
              onBlur={(e) => save(key as string, Math.max(min as number, Math.min(max as number, Number(e.target.value) || (def as number))))} />
          </SettingRow>
        ))}

        {[
          ['planner.capacity_heatmap_color_low', 'Couleur niveau bas', '#86efac'],
          ['planner.capacity_heatmap_color_medium', 'Couleur niveau moyen', '#4ade80'],
          ['planner.capacity_heatmap_color_high', 'Couleur niveau haut', '#fbbf24'],
          ['planner.capacity_heatmap_color_critical', 'Couleur niveau critique', '#ef4444'],
          ['planner.capacity_heatmap_color_overflow', 'Couleur dépassement', '#991b1b'],
        ].map(([key, label, def]) => (
          <SettingRow key={key} label={label} description="Couleur affichée dans la heatmap Planner.">
            <div className="flex items-center gap-2">
              <input type="color" className="h-8 w-10 rounded border border-border bg-background p-1"
                defaultValue={(s[key] as string) ?? def} onChange={(e) => save(key, e.target.value)} />
              <input type="text" className="gl-form-input w-24 text-sm font-mono"
                defaultValue={(s[key] as string) ?? def} onBlur={(e) => save(key, e.target.value)} />
            </div>
          </SettingRow>
        ))}
      </div>
    </CollapsibleSection>
    </>
  )
}
