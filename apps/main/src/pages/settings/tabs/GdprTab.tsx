/**
 * GDPR/RGPD Administration tab — data protection settings.
 *
 * Configurable: DPO contact, data retention, consent requirements,
 * breach log viewer, and data export for admins.
 */
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { useSaveScopedSetting, useScopedSettingsMap } from '@/hooks/useSettings'
import api from '@/lib/api'

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

export function GdprTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: settings, isLoading } = useScopedSettingsMap('tenant')
  const mutation = useSaveScopedSetting('tenant')

  const save = useCallback((key: string, value: unknown) => {
    mutation.mutate({ key, value }, {
      onSuccess: () => toast({ title: t('settings.toast.gdpr.saved'), variant: 'success' }),
      onError: () => toast({ title: t('settings.toast.error'), variant: 'error' }),
    })
  }, [mutation, toast])

  // Breach reports
  const { data: breaches } = useQuery({
    queryKey: ['gdpr', 'breaches'],
    queryFn: () => api.get('/api/v1/gdpr/breach-reports').then(r => r.data),
  })

  // Breach report form
  const [showBreachForm, setShowBreachForm] = useState(false)
  const [breachForm, setBreachForm] = useState({ title: '', description: '', affected_data_types: '' as string, measures_taken: '' })
  const breachMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/api/v1/gdpr/breach-report', data),
    onSuccess: () => {
      toast({ title: t('settings.toast.gdpr.incident_saved'), variant: 'success' })
      setShowBreachForm(false)
      setBreachForm({ title: '', description: '', affected_data_types: '', measures_taken: '' })
    },
  })

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>

  const s = settings ?? {}

  return (
    <>
      {/* DPO Contact */}
      <CollapsibleSection id="gdpr-dpo" title="Delegue a la Protection des Donnees (DPO)"
        description="Coordonnees du DPO affichees dans la politique de confidentialite et les demandes RGPD."
        storageKey="settings.gdpr.collapse">
        <div className="mt-2 space-y-0">
          <SettingRow label="Nom du DPO" description="Nom complet ou fonction du delegue.">
            <input type="text" className="gl-form-input w-56 text-sm"
              defaultValue={(s['gdpr.dpo_name'] as string) ?? ''}
              placeholder="Ex: Service Juridique"
              onBlur={e => save('gdpr.dpo_name', e.target.value)} />
          </SettingRow>
          <SettingRow label="Email du DPO" description="Adresse email pour les demandes RGPD.">
            <input type="email" className="gl-form-input w-56 text-sm"
              defaultValue={(s['gdpr.dpo_email'] as string) ?? ''}
              placeholder="dpo@entreprise.com"
              onBlur={e => save('gdpr.dpo_email', e.target.value)} />
          </SettingRow>
          <SettingRow label="Telephone" description="Numero de contact (optionnel).">
            <input type="text" className="gl-form-input w-56 text-sm"
              defaultValue={(s['gdpr.dpo_phone'] as string) ?? ''}
              placeholder="+33 1 23 45 67 89"
              onBlur={e => save('gdpr.dpo_phone', e.target.value)} />
          </SettingRow>
          <SettingRow label="Adresse postale" description="Adresse physique du DPO ou du responsable de traitement.">
            <input type="text" className="gl-form-input w-56 text-sm"
              defaultValue={(s['gdpr.dpo_address'] as string) ?? ''}
              onBlur={e => save('gdpr.dpo_address', e.target.value)} />
          </SettingRow>
        </div>
      </CollapsibleSection>

      {/* Data Retention */}
      <CollapsibleSection id="gdpr-retention" title="Conservation des donnees"
        description="Durees de conservation appliquees automatiquement. Les donnees au-dela de ces delais sont supprimees ou anonymisees."
        storageKey="settings.gdpr.collapse">
        <div className="mt-2 space-y-0">
          <SettingRow label="Logs d'audit" description="Duree de conservation des logs d'audit (en mois).">
            <div className="flex items-center gap-2">
              <input type="number" min={6} max={120} className="gl-form-input w-20 text-sm text-right font-mono"
                defaultValue={(s['gdpr.retention_audit_months'] as number) ?? 36}
                onBlur={e => save('gdpr.retention_audit_months', Math.max(6, Math.min(120, Number(e.target.value) || 36)))} />
              <span className="text-xs text-muted-foreground">mois</span>
            </div>
          </SettingRow>
          <SettingRow label="Sessions de connexion" description="Duree de conservation de l'historique des sessions.">
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={24} className="gl-form-input w-20 text-sm text-right font-mono"
                defaultValue={(s['gdpr.retention_sessions_months'] as number) ?? 6}
                onBlur={e => save('gdpr.retention_sessions_months', Math.max(1, Math.min(24, Number(e.target.value) || 6)))} />
              <span className="text-xs text-muted-foreground">mois</span>
            </div>
          </SettingRow>
          <SettingRow label="Comptes inactifs" description="Delai avant anonymisation automatique des comptes inactifs.">
            <div className="flex items-center gap-2">
              <input type="number" min={6} max={60} className="gl-form-input w-20 text-sm text-right font-mono"
                defaultValue={(s['gdpr.retention_inactive_accounts_months'] as number) ?? 24}
                onBlur={e => save('gdpr.retention_inactive_accounts_months', Math.max(6, Math.min(60, Number(e.target.value) || 24)))} />
              <span className="text-xs text-muted-foreground">mois</span>
            </div>
          </SettingRow>
          <SettingRow label="Notifications" description="Duree de conservation des notifications utilisateur.">
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={12} className="gl-form-input w-20 text-sm text-right font-mono"
                defaultValue={(s['gdpr.retention_notifications_months'] as number) ?? 3}
                onBlur={e => save('gdpr.retention_notifications_months', Math.max(1, Math.min(12, Number(e.target.value) || 3)))} />
              <span className="text-xs text-muted-foreground">mois</span>
            </div>
          </SettingRow>
          <SettingRow label="Exports RGPD" description="Delai avant suppression automatique des exports ZIP de donnees personnelles.">
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={90} className="gl-form-input w-20 text-sm text-right font-mono"
                defaultValue={(s['gdpr.retention_exports_days'] as number) ?? 7}
                onBlur={e => save('gdpr.retention_exports_days', Math.max(1, Math.min(90, Number(e.target.value) || 7)))} />
              <span className="text-xs text-muted-foreground">jours</span>
            </div>
          </SettingRow>
        </div>
      </CollapsibleSection>

      {/* Consent Configuration */}
      <CollapsibleSection id="gdpr-consent" title="Consentement"
        description="Configuration des demandes de consentement presentees aux utilisateurs."
        storageKey="settings.gdpr.collapse">
        <div className="mt-2 space-y-0">
          <SettingRow label="Banniere cookies" description="Afficher la banniere de consentement cookies a la premiere visite.">
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer"
                checked={(s['gdpr.cookie_banner_enabled'] as boolean) ?? true}
                onChange={e => save('gdpr.cookie_banner_enabled', e.target.checked)} />
              <div className="w-9 h-5 bg-border peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
            </label>
          </SettingRow>
          <SettingRow label="Lien politique de confidentialite" description="URL de la page de politique de confidentialite.">
            <input type="text" className="gl-form-input w-48 text-sm"
              defaultValue={(s['gdpr.privacy_policy_url'] as string) ?? '/privacy'}
              onBlur={e => save('gdpr.privacy_policy_url', e.target.value)} />
          </SettingRow>
        </div>
      </CollapsibleSection>

      {/* Breach Reports */}
      <CollapsibleSection id="gdpr-breaches" title="Violations de donnees (Art. 33/34)"
        description="Journal des incidents de violation de donnees personnelles. Obligation de notification sous 72h."
        storageKey="settings.gdpr.collapse" showSeparator={false}>
        <div className="mt-2">
          {/* Breach list */}
          {Array.isArray(breaches) && breaches.length > 0 ? (
            <div className="space-y-2 mb-4">
              {breaches.map((b: any) => (
                <div key={b.id} className="border border-border rounded-lg p-3 bg-red-500/5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-red-500 shrink-0" />
                    <span className="text-sm font-medium text-foreground">{b.details?.title}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{b.created_at?.slice(0, 10)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{b.details?.description}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-4">Aucun incident enregistre.</p>
          )}

          {/* New breach form */}
          {showBreachForm ? (
            <div className="border border-red-500/30 rounded-lg p-4 bg-red-500/5 space-y-3">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-500" /> Declarer un incident
              </h4>
              <input className="gl-form-input text-sm w-full" placeholder="Titre de l'incident"
                value={breachForm.title} onChange={e => setBreachForm(f => ({ ...f, title: e.target.value }))} />
              <textarea className="gl-form-input text-sm w-full min-h-[60px] resize-y" placeholder="Description de l'incident"
                value={breachForm.description} onChange={e => setBreachForm(f => ({ ...f, description: e.target.value }))} />
              <input className="gl-form-input text-sm w-full" placeholder="Types de donnees affectees (separes par des virgules)"
                value={breachForm.affected_data_types} onChange={e => setBreachForm(f => ({ ...f, affected_data_types: e.target.value }))} />
              <textarea className="gl-form-input text-sm w-full min-h-[40px] resize-y" placeholder="Mesures correctives prises"
                value={breachForm.measures_taken} onChange={e => setBreachForm(f => ({ ...f, measures_taken: e.target.value }))} />
              <div className="flex gap-2">
                <button className="gl-button-sm gl-button-default" onClick={() => setShowBreachForm(false)}>Annuler</button>
                <button className="gl-button-sm bg-red-600 text-white hover:bg-red-700 flex items-center gap-1"
                  disabled={!breachForm.title || !breachForm.description}
                  onClick={() => breachMutation.mutate({
                    title: breachForm.title,
                    description: breachForm.description,
                    affected_data_types: breachForm.affected_data_types.split(',').map(s => s.trim()).filter(Boolean),
                    measures_taken: breachForm.measures_taken || null,
                  })}>
                  {breachMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
                  Enregistrer l'incident
                </button>
              </div>
            </div>
          ) : (
            <button className="gl-button-sm gl-button-default flex items-center gap-1.5"
              onClick={() => setShowBreachForm(true)}>
              <AlertTriangle size={12} /> Declarer un incident de violation
            </button>
          )}
        </div>
      </CollapsibleSection>
    </>
  )
}
