/**
 * TravelWiz Configuration tab — module-specific entity-level settings.
 */
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: settings, isLoading } = useScopedSettingsMap('entity')
  const mutation = useSaveScopedSetting('entity')

  const save = useCallback((key: string, value: unknown) => {
    mutation.mutate({ key, value }, {
      onSuccess: () => toast({ title: t('settings.toast.general.setting_saved'), variant: 'success' }),
      onError: () => toast({ title: t('settings.toast.error'), variant: 'error' }),
    })
  }, [mutation, toast])

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>

  const s = settings ?? {}

  return (
    <>
      <CollapsibleSection id="travelwiz-captain" title="Portail capitaine & signal POB"
        description={t('settings.delais_operationnels_pour_le_portail_cap')}
        storageKey="settings.travelwiz.captain.collapse" showSeparator={false}>
        <div className="mt-2 space-y-0">
          <SettingRow label={t('settings.duree_de_session_capitaine')}
            description="Délai d'expiration d'un jeton de session capitaine après authentification par code à 6 chiffres.">
            <div className="flex items-center gap-2">
              <input type="number" min={5} max={480} step={5}
                className="gl-form-input w-24 text-sm text-right font-mono"
                defaultValue={(s['travelwiz.captain_session_minutes'] as number) ?? 120}
                onBlur={(e) => save('travelwiz.captain_session_minutes', Math.max(5, Math.min(480, Math.round(Number(e.target.value) || 120))))} />
              <span className="text-xs text-muted-foreground">minutes</span>
            </div>
          </SettingRow>
          <SettingRow label="Délai d'obsolescence du signal POB"
            description={t('settings.au_dela_de_ce_delai_sans_confirmation_ca')}>
            <div className="flex items-center gap-2">
              <input type="number" min={5} max={1440} step={5}
                className="gl-form-input w-24 text-sm text-right font-mono"
                defaultValue={(s['travelwiz.signal_stale_minutes'] as number) ?? 240}
                onBlur={(e) => save('travelwiz.signal_stale_minutes', Math.max(5, Math.min(1440, Math.round(Number(e.target.value) || 240))))} />
              <span className="text-xs text-muted-foreground">minutes</span>
            </div>
          </SettingRow>
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="travelwiz-operations" title={t('settings.transport_meteo')}
        description={t('settings.reglages_operationnels_du_transport_du_s')}
        storageKey="settings.travelwiz.collapse" showSeparator={false}>
        <div className="mt-2 space-y-0">
          <SettingRow label={t('settings.intervalle_de_synchro_meteo')}
            description={t('settings.frequence_minimale_entre_deux_collectes')}>
            <div className="flex items-center gap-2">
              <input type="number" min={5} max={240} step={5}
                className="gl-form-input w-24 text-sm text-right font-mono"
                defaultValue={(s['travelwiz.weather_sync_interval_minutes'] as number) ?? 30}
                onBlur={(e) => save('travelwiz.weather_sync_interval_minutes', Math.max(5, Math.min(240, Math.round(Number(e.target.value) || 30))))} />
              <span className="text-xs text-muted-foreground">minutes</span>
            </div>
          </SettingRow>
          <SettingRow label={t('settings.seuil_alerte_meteo_beaufort')}
            description={t('settings.declenchement_des_alertes_meteo_operatio')}>
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
    </>
  )
}
