/**
 * Security Policy admin tab — configurable auth/security settings.
 *
 * Settings stored in DB via /api/v1/admin/security-settings (scope=tenant).
 * Includes: password policy, account lockout, rate limiting, CAPTCHA, notifications.
 *
 * Sections: #password-policy, #account-lockout, #rate-limiting, #bot-protection, #sessions-notifications
 */
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { TagSelector } from '@/components/layout/DynamicPanel'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

// ── Setting Row component ──
function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
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

// ── Toggle switch ──
function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  )
}

// ── Number input ──
function NumberInput({
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  disabled?: boolean
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => {
        let v = parseInt(e.target.value, 10)
        if (isNaN(v)) return
        if (min != null && v < min) v = min
        if (max != null && v > max) v = max
        onChange(v)
      }}
      min={min}
      max={max}
      disabled={disabled}
      className="gl-form-input h-8 w-24 text-sm text-right"
    />
  )
}

async function fetchSecuritySettings(): Promise<Record<string, any>> {
  const { data } = await api.get('/api/v1/admin/security-settings')
  return data
}

export function SecurityPolicyTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: cfg, isLoading } = useQuery({
    queryKey: ['admin', 'security-settings'],
    queryFn: fetchSecuritySettings,
  })

  const mutation = useMutation({
    mutationFn: (updates: Record<string, any>) =>
      api.put('/api/v1/admin/security-settings', { settings: updates }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'security-settings'] })
      toast({ title: t('settings.toast.security_policy.setting_saved'), variant: 'success' })
    },
    onError: () => {
      toast({ title: t('settings.toast.error'), description: t('settings.toast.security_policy.setting_save_error'), variant: 'error' })
    },
  })

  const save = useCallback((key: string, value: any) => {
    mutation.mutate({ [key]: value })
  }, [mutation])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  const s = cfg ?? {}

  return (
    <>
      {/* ── Politique de mots de passe ── */}
      <CollapsibleSection
        id="password-policy"
        title={t('settings.politique_de_mots_de_passe')}
        description={t('settings.regles_de_complexite_appliquees_lors_de')}
        storageKey="settings.security-policy.collapse"
      >
        <div className="mt-2 space-y-0">
          <SettingRow label="Longueur minimale" description={t('settings.nombre_minimum_de_caracteres_requis')}>
            <NumberInput value={s.password_min_length ?? 12} onChange={(v) => save('password_min_length', v)} min={6} max={128} />
          </SettingRow>
          <SettingRow label="Majuscule obligatoire" description={t('settings.au_moins_une_lettre_majuscule_requise')}>
            <Toggle checked={s.password_require_uppercase ?? true} onChange={(v) => save('password_require_uppercase', v)} />
          </SettingRow>
          <SettingRow label="Chiffre obligatoire" description={t('settings.au_moins_un_chiffre_requis')}>
            <Toggle checked={s.password_require_digit ?? true} onChange={(v) => save('password_require_digit', v)} />
          </SettingRow>
          <SettingRow label={t('settings.caractere_special_obligatoire')} description={t('settings.au_moins_un_caractere_special_requis')}>
            <Toggle checked={s.password_require_special ?? true} onChange={(v) => save('password_require_special', v)} />
          </SettingRow>
        </div>
      </CollapsibleSection>

      {/* ── Verrouillage de compte ── */}
      <CollapsibleSection
        id="account-lockout"
        title={t('settings.verrouillage_de_compte')}
        description={t('settings.apres_un_nombre_defini_de_tentatives_ech')}
        storageKey="settings.security-policy.collapse"
      >
        <div className="mt-2 space-y-0">
          <SettingRow label="Tentatives max avant verrouillage" description={t('settings.nombre_de_tentatives_de_connexion_echoue')}>
            <NumberInput value={s.max_failed_attempts ?? 5} onChange={(v) => save('max_failed_attempts', v)} min={1} max={50} />
          </SettingRow>
          <SettingRow label={t('settings.duree_du_verrouillage_minutes')} description={t('settings.duree_pendant_laquelle_le_compte_reste_v')}>
            <NumberInput value={s.lockout_duration_min ?? 15} onChange={(v) => save('lockout_duration_min', v)} min={1} max={1440} />
          </SettingRow>
        </div>
      </CollapsibleSection>

      {/* ── Limitation de taux ── */}
      <CollapsibleSection
        id="rate-limiting"
        title={t('settings.limitation_de_taux')}
        description={t('settings.limite_le_nombre_de_tentatives_de_connex')}
        storageKey="settings.security-policy.collapse"
      >
        <div className="mt-2 space-y-0">
          <SettingRow label="Limite par adresse IP (par minute)" description={t('settings.nombre_max_de_tentatives_depuis_une_meme')}>
            <NumberInput value={s.rate_limit_per_ip ?? 10} onChange={(v) => save('rate_limit_per_ip', v)} min={1} max={100} />
          </SettingRow>
          <SettingRow label="Limite par email (par minute)" description={t('settings.nombre_max_de_tentatives_pour_un_meme_em')}>
            <NumberInput value={s.rate_limit_per_email ?? 5} onChange={(v) => save('rate_limit_per_email', v)} min={1} max={50} />
          </SettingRow>
        </div>
      </CollapsibleSection>

      {/* ── Protection anti-bots ── */}
      <CollapsibleSection
        id="bot-protection"
        title="Protection anti-bots (CAPTCHA)"
        description={t('settings.ajoute_une_verification_captcha_sur_la_p')}
        storageKey="settings.security-policy.collapse"
      >
        <div className="mt-2 space-y-0">
          <SettingRow label={t('settings.activer_le_captcha')} description={t('settings.affiche_un_widget_captcha_sur_la_page_de')}>
            <Toggle checked={s.captcha_enabled ?? false} onChange={(v) => save('captcha_enabled', v)} />
          </SettingRow>
          {s.captcha_enabled && (
            <>
              <SettingRow label="Fournisseur CAPTCHA" description={t('settings.service_de_verification_utilise')}>
                <TagSelector
                  options={[
                    { value: 'turnstile', label: 'Cloudflare Turnstile' },
                    { value: 'hcaptcha', label: 'hCaptcha' },
                    { value: 'recaptcha', label: 'Google reCAPTCHA' },
                  ]}
                  value={s.captcha_provider ?? 'turnstile'}
                  onChange={(v: string) => save('captcha_provider', v)}
                />
              </SettingRow>
              <SettingRow label={t('settings.cle_du_site_site_key')} description={t('settings.cle_publique_fournie_par_le_fournisseur')}>
                <input
                  type="text"
                  value={s.captcha_site_key ?? ''}
                  onChange={(e) => save('captcha_site_key', e.target.value)}
                  placeholder={t('settings.cle_du_site')}
                  className="gl-form-input h-8 w-64 text-sm"
                />
              </SettingRow>
              <SettingRow label={t('settings.cle_secrete')} description={t('settings.cle_serveur_du_fournisseur_non_affichee')}>
                <input
                  type="password"
                  defaultValue=""
                  onBlur={(e) => {
                    if (e.target.value) save('captcha_secret_key', e.target.value)
                  }}
                  placeholder={s.captcha_secret_key_set ? '••••••••' : 'Clé secrète...'}
                  className="gl-form-input h-8 w-64 text-sm"
                />
              </SettingRow>
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* ── Notifications ── */}
      <CollapsibleSection
        id="sessions-notifications"
        title={t('settings.notifications_de_securite')}
        description={t('settings.alertes_envoyees_lors_de_connexions_susp')}
        storageKey="settings.security-policy.collapse"
      >
        <div className="mt-2 space-y-0">
          <SettingRow label={t('settings.notifier_les_connexions_suspectes')} description="Envoie un email lors d'une connexion depuis un nouvel appareil ou lieu.">
            <Toggle checked={s.suspicious_login_notify ?? true} onChange={(v) => save('suspicious_login_notify', v)} />
          </SettingRow>
        </div>
      </CollapsibleSection>

      {/* ── Conformité ── */}
      <CollapsibleSection
        id="compliance-policy"
        title={t('nav.conformite')}
        description={t('settings.criteres_de_verification_pour_declarer_u')}
        storageKey="settings.security-policy.collapse"
      >
        <div className="mt-2 space-y-0">
          <SettingRow
            label={t('settings.exiger_la_verification_du_compte')}
            description={t('settings.un_utilisateur_doit_avoir_au_moins_un_em')}
          >
            <Toggle checked={s.require_account_verification ?? true} onChange={(v) => save('require_account_verification', v)} />
          </SettingRow>
        </div>
      </CollapsibleSection>

      {/* ── Canaux de messagerie ── */}
      <CollapsibleSection
        id="messaging-channels"
        title={t('settings.canaux_de_messagerie_defaut')}
        description={t('settings.canal_par_defaut_pour_chaque_type_de_mes')}
        storageKey="settings.security-policy.collapse"
      >
        <div className="mt-2 space-y-0">
          <SettingRow label={t('settings.codes_de_verification_otp')} description={t('settings.canal_utilise_pour_envoyer_les_codes_de')}>
            <TagSelector
              options={MESSAGING_CHANNEL_OPTIONS}
              value={s.messaging_channel_otp ?? 'auto'}
              onChange={(v: string) => save('messaging_channel_otp', v)}
            />
          </SettingRow>
          <SettingRow label="Notifications" description={t('settings.canal_utilise_pour_les_notifications_sys')}>
            <TagSelector
              options={MESSAGING_CHANNEL_OPTIONS}
              value={s.messaging_channel_notification ?? 'auto'}
              onChange={(v: string) => save('messaging_channel_notification', v)}
            />
          </SettingRow>
          <SettingRow label="Alertes critiques" description={t('settings.canal_utilise_pour_les_alertes_urgentes')}>
            <TagSelector
              options={MESSAGING_CHANNEL_OPTIONS}
              value={s.messaging_channel_alert ?? 'auto'}
              onChange={(v: string) => save('messaging_channel_alert', v)}
            />
          </SettingRow>
        </div>
      </CollapsibleSection>
    </>
  )
}

const MESSAGING_CHANNEL_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
]
