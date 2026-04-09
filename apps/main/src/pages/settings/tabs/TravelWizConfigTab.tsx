/**
 * TravelWiz Configuration tab — module-specific entity-level settings.
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

export function TravelWizConfigTab() {
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

  return (
    <CollapsibleSection id="travelwiz-operations" title="Transport & Météo"
      description="Réglages opérationnels du transport, du suivi terrain et de la météo."
      storageKey="settings.travelwiz.collapse" showSeparator={false}>
      <div className="mt-2 space-y-0">
        <SettingRow label="Intervalle de synchro météo"
          description="Fréquence minimale entre deux collectes météo automatiques par site actif.">
          <div className="flex items-center gap-2">
            <input type="number" min={5} max={240} step={5}
              className="gl-form-input w-24 text-sm text-right font-mono"
              defaultValue={(s['travelwiz.weather_sync_interval_minutes'] as number) ?? 30}
              onBlur={(e) => save('travelwiz.weather_sync_interval_minutes', Math.max(5, Math.min(240, Math.round(Number(e.target.value) || 30))))} />
            <span className="text-xs text-muted-foreground">minutes</span>
          </div>
        </SettingRow>
        <SettingRow label="Seuil alerte météo Beaufort"
          description="Déclenchement des alertes météo opérationnelles pour les voyages actifs.">
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={12} step={1}
              className="gl-form-input w-20 text-sm text-right font-mono"
              defaultValue={(s['travelwiz.weather_alert_beaufort_threshold'] as number) ?? 6}
              onBlur={(e) => save('travelwiz.weather_alert_beaufort_threshold', Math.max(1, Math.min(12, Math.round(Number(e.target.value) || 6))))} />
            <span className="text-xs text-muted-foreground">Beaufort</span>
          </div>
        </SettingRow>
      </div>
    </CollapsibleSection>
  )
}
