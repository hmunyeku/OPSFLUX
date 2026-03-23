/**
 * Security Policy admin tab — configurable auth/security settings.
 *
 * Settings stored in DB via /api/v1/admin/security-settings (scope=tenant).
 * Includes: password policy, account lockout, rate limiting, CAPTCHA, notifications.
 *
 * Sections: #password-policy, #account-lockout, #rate-limiting, #bot-protection, #sessions-notifications
 */
import { useCallback } from 'react'
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
      toast({ title: 'Paramètre enregistré', variant: 'success' })
    },
    onError: () => {
      toast({ title: 'Erreur', description: 'Impossible d\'enregistrer le paramètre.', variant: 'error' })
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
        title="Politique de mots de passe"
        description="Règles de complexité appliquées lors de la création et du changement de mot de passe."
        storageKey="settings.security-policy.collapse"
      >
        <div className="mt-2 space-y-0">
          <SettingRow label="Longueur minimale" description="Nombre minimum de caractères requis.">
            <NumberInput value={s.password_min_length ?? 12} onChange={(v) => save('password_min_length', v)} min={6} max={128} />
          </SettingRow>
          <SettingRow label="Majuscule obligatoire" description="Au moins une lettre majuscule requise.">
            <Toggle checked={s.password_require_uppercase ?? true} onChange={(v) => save('password_require_uppercase', v)} />
          </SettingRow>
          <SettingRow label="Chiffre obligatoire" description="Au moins un chiffre requis.">
            <Toggle checked={s.password_require_digit ?? true} onChange={(v) => save('password_require_digit', v)} />
          </SettingRow>
          <SettingRow label="Caractère spécial obligatoire" description="Au moins un caractère spécial requis (!@#$...).">
            <Toggle checked={s.password_require_special ?? true} onChange={(v) => save('password_require_special', v)} />
          </SettingRow>
        </div>
      </CollapsibleSection>

      {/* ── Verrouillage de compte ── */}
      <CollapsibleSection
        id="account-lockout"
        title="Verrouillage de compte"
        description="Après un nombre défini de tentatives échouées, le compte est temporairement verrouillé."
        storageKey="settings.security-policy.collapse"
      >
        <div className="mt-2 space-y-0">
          <SettingRow label="Tentatives max avant verrouillage" description="Nombre de tentatives de connexion échouées autorisées.">
            <NumberInput value={s.max_failed_attempts ?? 5} onChange={(v) => save('max_failed_attempts', v)} min={1} max={50} />
          </SettingRow>
          <SettingRow label="Durée du verrouillage (minutes)" description="Durée pendant laquelle le compte reste verrouillé.">
            <NumberInput value={s.lockout_duration_min ?? 15} onChange={(v) => save('lockout_duration_min', v)} min={1} max={1440} />
          </SettingRow>
        </div>
      </CollapsibleSection>

      {/* ── Limitation de taux ── */}
      <CollapsibleSection
        id="rate-limiting"
        title="Limitation de taux"
        description="Limite le nombre de tentatives de connexion par minute pour protéger contre les attaques par force brute."
        storageKey="settings.security-policy.collapse"
      >
        <div className="mt-2 space-y-0">
          <SettingRow label="Limite par adresse IP (par minute)" description="Nombre max de tentatives depuis une même IP.">
            <NumberInput value={s.rate_limit_per_ip ?? 10} onChange={(v) => save('rate_limit_per_ip', v)} min={1} max={100} />
          </SettingRow>
          <SettingRow label="Limite par email (par minute)" description="Nombre max de tentatives pour un même email.">
            <NumberInput value={s.rate_limit_per_email ?? 5} onChange={(v) => save('rate_limit_per_email', v)} min={1} max={50} />
          </SettingRow>
        </div>
      </CollapsibleSection>

      {/* ── Protection anti-bots ── */}
      <CollapsibleSection
        id="bot-protection"
        title="Protection anti-bots (CAPTCHA)"
        description="Ajoute une vérification CAPTCHA sur la page de connexion pour bloquer les bots."
        storageKey="settings.security-policy.collapse"
      >
        <div className="mt-2 space-y-0">
          <SettingRow label="Activer le CAPTCHA" description="Affiche un widget CAPTCHA sur la page de connexion.">
            <Toggle checked={s.captcha_enabled ?? false} onChange={(v) => save('captcha_enabled', v)} />
          </SettingRow>
          {s.captcha_enabled && (
            <>
              <SettingRow label="Fournisseur CAPTCHA" description="Service de vérification utilisé.">
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
              <SettingRow label="Clé du site (site key)" description="Clé publique fournie par le fournisseur CAPTCHA.">
                <input
                  type="text"
                  value={s.captcha_site_key ?? ''}
                  onChange={(e) => save('captcha_site_key', e.target.value)}
                  placeholder="Clé du site..."
                  className="gl-form-input h-8 w-64 text-sm"
                />
              </SettingRow>
              <SettingRow label="Clé secrète" description="Clé serveur du fournisseur. Non affichée après enregistrement.">
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
        title="Notifications de sécurité"
        description="Alertes envoyées lors de connexions suspectes."
        storageKey="settings.security-policy.collapse"
      >
        <div className="mt-2 space-y-0">
          <SettingRow label="Notifier les connexions suspectes" description="Envoie un email lors d'une connexion depuis un nouvel appareil ou lieu.">
            <Toggle checked={s.suspicious_login_notify ?? true} onChange={(v) => save('suspicious_login_notify', v)} />
          </SettingRow>
        </div>
      </CollapsibleSection>
    </>
  )
}
