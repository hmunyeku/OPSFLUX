/**
 * PaxLog Configuration tab — module-specific entity-level settings.
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

export function PaxLogConfigTab() {
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

  const complianceSequence = Array.isArray(s['paxlog.compliance_sequence'])
    ? (s['paxlog.compliance_sequence'] as string[])
    : ['site_requirements', 'job_profile', 'self_declaration']
  const complianceStepLabels: Record<string, string> = {
    site_requirements: 'Règles site / asset',
    job_profile: 'Profil / habilitations',
    self_declaration: 'Auto-déclarations / validations en attente',
  }
  const updateComplianceSequence = (index: number, value: string) => {
    const next = [...complianceSequence]
    const dup = next.findIndex((item, i) => item === value && i !== index)
    if (dup >= 0) [next[index], next[dup]] = [next[dup], next[index]]
    else next[index] = value
    save('paxlog.compliance_sequence', next)
  }

  return (
    <>
      <CollapsibleSection id="paxlog-compliance" title="Séquence conformité"
        description="Ordre officiel des couches de vérification conformité appliqué dans le moteur, les emails automatiques et la validation AdS."
        storageKey="settings.paxlog.collapse">
        <div className="mt-2 space-y-0">
          {[0, 1, 2].map((i) => (
            <SettingRow key={i} label={`Étape ${i + 1}`} description="Changer un ordre modifie l'ordre de lecture et de synthèse des non-conformités.">
              <select className="gl-form-select text-sm min-w-[260px]" value={complianceSequence[i] ?? ''}
                onChange={(e) => updateComplianceSequence(i, e.target.value)}>
                {Object.entries(complianceStepLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </SettingRow>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="paxlog-operations" title="Opérations"
        description="Réglages opérationnels du module PaxLog au niveau entité."
        storageKey="settings.paxlog.collapse" showSeparator={false}>
        <div className="mt-2 space-y-0">
          <SettingRow label="Comportement capacité site non configurée"
            description="Que faire quand la capacité POB d'un site n'est pas définie dans le registre des assets.">
            <select className="gl-form-select text-sm" value={(s['paxlog.null_capacity_behavior'] as string) ?? 'unlimited'}
              onChange={(e) => save('paxlog.null_capacity_behavior', e.target.value)}>
              <option value="unlimited">Illimitée (pas de restriction)</option>
              <option value="blocking">Bloquante (admin doit configurer)</option>
            </select>
          </SettingRow>
          <SettingRow label="Délai de grâce retour AdS"
            description="Nombre de jours après la date de fin d'une AdS en cours avant clôture automatique nocturne.">
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={30} step={1} className="gl-form-input w-20 text-sm text-right font-mono"
                defaultValue={(s['paxlog.ads_auto_close_grace_days'] as number) ?? 2}
                onBlur={(e) => save('paxlog.ads_auto_close_grace_days', Math.max(0, Math.min(30, Math.round(Number(e.target.value) || 0))))} />
              <span className="text-xs text-muted-foreground">jours</span>
            </div>
          </SettingRow>
        </div>
      </CollapsibleSection>
    </>
  )
}
