/**
 * Projets Configuration tab — module-specific entity-level settings.
 *
 * Currently exposes one setting :
 *   - projets.default_progress_weight_method
 *     The default progress-weighting method applied to projects whose
 *     own `progress_weight_method` is NULL. Each project can override.
 */
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { useSaveScopedSetting, useScopedSettingsMap } from '@/hooks/useSettings'
import { PROGRESS_WEIGHT_METHOD_OPTIONS, type ProgressWeightMethod } from '@/types/api'

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

export function ProjetsConfigTab() {
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
  const currentDefault: ProgressWeightMethod = (s['projets.default_progress_weight_method'] as ProgressWeightMethod) || 'effort'
  const currentMeta = PROGRESS_WEIGHT_METHOD_OPTIONS.find((o) => o.value === currentDefault)

  return (
    <CollapsibleSection
      id="projets-progress-weight"
      title="Calcul d'avancement projet"
      description="Méthode utilisée pour agréger l'avancement d'un projet à partir de l'avancement de ses tâches. Chaque projet peut surcharger cette valeur dans son panneau de détail."
      storageKey="settings.projets.progress.collapse"
      showSeparator={false}
    >
      <div className="mt-2 space-y-0">
        <SettingRow
          label="Méthode par défaut"
          description="Appliquée aux projets dont la méthode n'est pas définie explicitement. Le calcul se fait récursivement : les tâches parents agrègent leurs sous-tâches, puis le projet agrège ses tâches racines."
        >
          <select
            className="gl-form-select text-sm min-w-[200px]"
            value={currentDefault}
            onChange={(e) => save('projets.default_progress_weight_method', e.target.value as ProgressWeightMethod)}
          >
            {PROGRESS_WEIGHT_METHOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </SettingRow>
      </div>

      {/* Current method explanation card */}
      {currentMeta && (
        <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1">Méthode active : {currentMeta.label}</p>
          <p className="text-sm text-foreground">{currentMeta.description}</p>
        </div>
      )}

      {/* Reference card listing all methods + their formulas */}
      <div className="mt-4 rounded-lg border border-border/40 bg-background px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">Référentiel des méthodes</p>
        <div className="space-y-2.5">
          {PROGRESS_WEIGHT_METHOD_OPTIONS.map((opt) => (
            <div key={opt.value} className="text-xs">
              <p className="font-semibold text-foreground">{opt.label}</p>
              <p className="text-muted-foreground mt-0.5">{opt.description}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground/70 italic">
          Note : pour les méthodes "Par effort estimé", "Par durée" et "Manuelle", si toutes
          les sous-tâches d'un même groupe ont un poids nul, le groupe retombe automatiquement
          en mode "Égale" pour ce niveau uniquement. Aucun projet ne peut afficher 0&nbsp;%
          uniquement parce que ses heures estimées sont vides.
        </p>
      </div>
    </CollapsibleSection>
  )
}
