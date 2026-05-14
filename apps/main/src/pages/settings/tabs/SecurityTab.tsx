/**
 * Security settings tab — password change + MFA (TOTP).
 *
 * GitLab pattern: Password section, then Two-Factor Authentication section below.
 * MFA flow: Setup → QR code → Verify code → Show backup codes → Done.
 *
 * Collapsible sections with deep-link: #password, #mfa
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Loader2, ShieldCheck, ShieldOff, Copy, Check, RefreshCw, KeyRound, Monitor, Smartphone, Trash2 } from 'lucide-react'
import api from '@/lib/api'
import { useChangePassword, useMFAStatus, useMFASetup, useMFAVerifySetup, useMFADisable, useMFARegenerateCodes } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

export function SecurityTab() {
  const { t } = useTranslation()
  return (
    <>
      <CollapsibleSection
        id="password"
        title={t('auth.password')}
        description={t('settings.changez_votre_mot_de_passe_apres_modific')}
        storageKey="settings.security.collapse"
      >
        <PasswordSection />
      </CollapsibleSection>

      <CollapsibleSection
        id="mfa"
        title={t('settings.authentification_a_deux_facteurs')}
        description="Renforcez la sécurité de votre compte en activant l'authentification à deux facteurs (TOTP)."
        storageKey="settings.security.collapse"
      >
        <MFASection />
      </CollapsibleSection>

      <CollapsibleSection
        id="trusted-devices"
        title={t('settings.trusted_devices_title', 'Appareils de confiance MFA')}
        description={t(
          'settings.trusted_devices_description',
          'Liste des appareils où vous avez choisi "Se souvenir de cet appareil". Vous pouvez révoquer un appareil pour forcer la saisie du code MFA au prochain login.',
        )}
        storageKey="settings.security.collapse"
        showSeparator={false}
      >
        <TrustedDevicesSection />
      </CollapsibleSection>
    </>
  )
}

/* ── Trusted Devices Section (#6 MFA) ── */
interface TrustedDevice {
  id: string
  created_at: string
  expires_at: string
  last_used_at: string | null
  ip_address: string | null
  browser: string | null
  os: string | null
  label: string | null
  is_current: boolean
}

function TrustedDevicesSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()

  const { data: devices, isLoading } = useQuery({
    queryKey: ['mfa-trusted-devices'],
    queryFn: async () => {
      const { data } = await api.get<TrustedDevice[]>('/api/v1/mfa/trusted-devices')
      return data
    },
  })

  const revokeOne = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/mfa/trusted-devices/${id}/revoke`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mfa-trusted-devices'] })
      toast({ title: t('settings.trusted_devices_revoked', 'Appareil révoqué.'), variant: 'success' })
    },
  })

  const revokeAll = useMutation({
    mutationFn: () => api.post('/api/v1/mfa/trusted-devices/revoke-all'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['mfa-trusted-devices'] })
      toast({
        title: t('settings.trusted_devices_revoked_all', '{{count}} appareil(s) révoqué(s).', {
          count: (res.data as { count?: number })?.count ?? 0,
        }),
        variant: 'success',
      })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 size={14} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!devices || devices.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-3">
        {t('settings.trusted_devices_empty', 'Aucun appareil de confiance pour le moment.')}
      </p>
    )
  }

  const fmtDate = (d: string | null) => d
    ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {devices.length} {t('settings.trusted_devices_count', { count: devices.length })}
        </span>
        <button
          type="button"
          onClick={() => revokeAll.mutate()}
          disabled={revokeAll.isPending}
          className="text-xs text-destructive hover:underline disabled:opacity-50"
        >
          {revokeAll.isPending ? <Loader2 size={12} className="inline animate-spin" /> : t('settings.trusted_devices_revoke_all', 'Tout révoquer')}
        </button>
      </div>
      <div className="space-y-1.5">
        {devices.map((d) => {
          const Icon = (d.os === 'iOS' || d.os === 'Android') ? Smartphone : Monitor
          return (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
            >
              <Icon size={16} className="text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {d.browser || 'Navigateur inconnu'} · {d.os || 'OS inconnu'}
                  {d.is_current && (
                    <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {t('common.current', 'En cours')}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {d.ip_address ? `IP ${d.ip_address} · ` : ''}
                  {t('settings.trusted_devices_expires', 'expire le')} {fmtDate(d.expires_at)}
                  {d.last_used_at ? ` · ${t('settings.trusted_devices_last_used', 'utilisé')} ${fmtDate(d.last_used_at)}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revokeOne.mutate(d.id)}
                disabled={revokeOne.isPending}
                aria-label={t('common.revoke', 'Révoquer') as string}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Password Change Section ── */
function PasswordSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const changePassword = useChangePassword()

  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showNew, setShowNew] = useState(false)

  const mismatch = confirmPwd.length > 0 && newPwd !== confirmPwd
  const tooShort = newPwd.length > 0 && newPwd.length < 8
  const canSubmit = currentPwd.length > 0 && newPwd.length >= 8 && confirmPwd === newPwd && !changePassword.isPending

  const handleSubmit = async () => {
    try {
      await changePassword.mutateAsync({ current_password: currentPwd, new_password: newPwd })
      toast({ title: t('settings.toast.security.password_changed'), description: t('settings.toast.security.password_changed_desc'), variant: 'success' })
      setCurrentPwd('')
      setNewPwd('')
      setConfirmPwd('')
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('settings.toast.security.password_change_error')
      toast({ title: t('settings.toast.error'), description: message, variant: 'error' })
    }
  }

  const handleCancel = () => {
    setCurrentPwd('')
    setNewPwd('')
    setConfirmPwd('')
  }

  return (
    <>
      <div className="mt-2 space-y-5 max-w-md">
        <div>
          <label className="gl-label">{t('settings.mot_de_passe_actuel')}</label>
          <input type="password" className="gl-form-input" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} placeholder={t('settings.entrez_votre_mot_de_passe_actuel')} autoComplete="current-password" />
        </div>
        <div>
          <label className="gl-label">{t('auth.reset_password_title')}</label>
          <div className="relative">
            <input type={showNew ? 'text' : 'password'} className="gl-form-input pr-10" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder={t('users.min_8_caracteres')} autoComplete="new-password" />
            <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {tooShort && <p className="mt-1 text-sm text-destructive">{t('settings.le_mot_de_passe_doit_contenir_au_moins_8')}</p>}
          <p className="mt-1 text-sm text-muted-foreground">{t('settings.minimum_8_caracteres_avec_au_moins_une_m')}</p>
        </div>
        <div>
          <label className="gl-label">{t('settings.confirmer_le_nouveau_mot_de_passe')}</label>
          <input type="password" className="gl-form-input" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder={t('settings.confirmez_le_nouveau_mot_de_passe')} autoComplete="new-password" />
          {mismatch && <p className="mt-1 text-sm text-destructive">{t('settings.les_mots_de_passe_ne_correspondent_pas')}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-6">
        <button className="btn btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
          {changePassword.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
          Changer le mot de passe
        </button>
        <button className="btn btn-secondary" onClick={handleCancel}>{t('common.cancel')}</button>
      </div>
    </>
  )
}

/* ── MFA (Two-Factor Authentication) Section ── */
function MFASection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: mfaStatus, isLoading: statusLoading } = useMFAStatus()
  const setupMutation = useMFASetup()
  const verifySetupMutation = useMFAVerifySetup()
  const disableMutation = useMFADisable()
  const regenerateMutation = useMFARegenerateCodes()

  // Setup flow state
  const [setupData, setSetupData] = useState<{ secret: string; provisioning_uri: string } | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [copiedCodes, setCopiedCodes] = useState(false)

  // Disable flow state
  const [showDisable, setShowDisable] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')

  // Regenerate flow state
  const [showRegenerate, setShowRegenerate] = useState(false)
  const [regenPassword, setRegenPassword] = useState('')

  const isEnabled = mfaStatus?.mfa_enabled ?? false

  const handleStartSetup = async () => {
    try {
      const data = await setupMutation.mutateAsync()
      setSetupData(data)
      setVerifyCode('')
      setBackupCodes(null)
    } catch {
      toast({ title: t('settings.toast.error'), description: t('settings.toast.security.mfa_setup_error'), variant: 'error' })
    }
  }

  const handleVerifySetup = async () => {
    try {
      const data = await verifySetupMutation.mutateAsync(verifyCode)
      setBackupCodes(data.backup_codes)
      setSetupData(null)
      toast({ title: t('settings.toast.security.mfa_enabled'), description: t('settings.toast.security.mfa_enabled_desc'), variant: 'success' })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('settings.toast.security.mfa_code_invalid')
      toast({ title: t('settings.toast.error'), description: message, variant: 'error' })
    }
  }

  const handleDisable = async () => {
    try {
      await disableMutation.mutateAsync(disablePassword)
      setShowDisable(false)
      setDisablePassword('')
      toast({ title: t('settings.toast.security.mfa_disabled'), description: t('settings.toast.security.mfa_disabled_desc'), variant: 'success' })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('settings.toast.security.mfa_password_incorrect')
      toast({ title: t('settings.toast.error'), description: message, variant: 'error' })
    }
  }

  const handleRegenerate = async () => {
    try {
      const data = await regenerateMutation.mutateAsync(regenPassword)
      setBackupCodes(data.backup_codes)
      setShowRegenerate(false)
      setRegenPassword('')
      toast({ title: t('settings.toast.security.mfa_codes_regenerated'), description: t('settings.toast.security.mfa_codes_regenerated_desc'), variant: 'success' })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('settings.toast.security.mfa_password_incorrect')
      toast({ title: t('settings.toast.error'), description: message, variant: 'error' })
    }
  }

  const copyBackupCodes = () => {
    if (backupCodes) {
      navigator.clipboard.writeText(backupCodes.join('\n'))
      setCopiedCodes(true)
      setTimeout(() => setCopiedCodes(false), 2000)
    }
  }

  return (
    <>
      {statusLoading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Chargement...
        </div>
      ) : isEnabled && !setupData && !backupCodes ? (
        /* ── MFA Enabled State ── */
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
            <ShieldCheck size={20} className="text-green-600 dark:text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Authentification à deux facteurs activée
              </p>
              <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">
                Votre compte est protégé par une application d'authentification.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="btn btn-secondary" onClick={() => { setShowRegenerate(true); setShowDisable(false) }}>
              <RefreshCw size={14} className="mr-1.5" />
              Régénérer les codes de secours
            </button>
            <button className="btn btn-danger" onClick={() => { setShowDisable(true); setShowRegenerate(false) }}>
              <ShieldOff size={14} className="mr-1.5" />
              Désactiver le 2FA
            </button>
          </div>

          {/* Disable confirmation */}
          {showDisable && (
            <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3 max-w-md">
              <p className="text-sm font-medium text-destructive">{t('settings.confirmer_la_desactivation')}</p>
              <div>
                <label className="gl-label">{t('settings.mot_de_passe_actuel')}</label>
                <input type="password" className="gl-form-input" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} placeholder={t('settings.entrez_votre_mot_de_passe')} autoComplete="current-password" />
              </div>
              <div className="flex gap-2">
                <button className="btn btn-danger" disabled={!disablePassword || disableMutation.isPending} onClick={handleDisable}>
                  {disableMutation.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
                  Désactiver
                </button>
                <button className="btn btn-secondary" onClick={() => { setShowDisable(false); setDisablePassword('') }}>{t('common.cancel')}</button>
              </div>
            </div>
          )}

          {/* Regenerate codes */}
          {showRegenerate && (
            <div className="p-4 rounded-lg border border-border bg-background-subtle space-y-3 max-w-md">
              <p className="text-sm font-medium">{t('settings.regenerer_les_codes_de_secours')}</p>
              <p className="text-xs text-muted-foreground">{t('settings.les_anciens_codes_seront_invalides')}</p>
              <div>
                <label className="gl-label">{t('settings.mot_de_passe_actuel')}</label>
                <input type="password" className="gl-form-input" value={regenPassword} onChange={(e) => setRegenPassword(e.target.value)} placeholder={t('settings.entrez_votre_mot_de_passe')} autoComplete="current-password" />
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary" disabled={!regenPassword || regenerateMutation.isPending} onClick={handleRegenerate}>
                  {regenerateMutation.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
                  Régénérer
                </button>
                <button className="btn btn-secondary" onClick={() => { setShowRegenerate(false); setRegenPassword('') }}>{t('common.cancel')}</button>
              </div>
            </div>
          )}
        </div>
      ) : setupData && !backupCodes ? (
        /* ── MFA Setup Flow: QR Code + Verify ── */
        <div className="mt-6 space-y-6 max-w-lg">
          <div className="p-4 rounded-lg border border-border bg-card">
            <h3 className="text-sm font-semibold mb-3">{t('settings.1_scannez_ce_qr_code_avec_votre_applicat')}</h3>
            {/* QR code rendered as an image via Google Charts API — simple, no extra dependency */}
            <div className="flex justify-center p-4 bg-white rounded-md">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setupData.provisioning_uri)}`}
                alt="QR Code MFA"
                width={200}
                height={200}
                className="rounded"
              />
            </div>
            <details className="mt-3">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Impossible de scanner ? Entrez la clé manuellement
              </summary>
              <div className="mt-2 p-2 bg-muted rounded text-xs font-mono break-all select-all">
                {setupData.secret}
              </div>
            </details>
          </div>

          <div className="p-4 rounded-lg border border-border bg-card">
            <h3 className="text-sm font-semibold mb-3">{t('settings.2_entrez_le_code_de_verification')}</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Saisissez le code à 6 chiffres affiché dans votre application d'authentification.
            </p>
            <div className="flex gap-3 items-end">
              <div className="flex-1 max-w-[200px]">
                <input
                  type="text"
                  className="gl-form-input text-center font-mono text-lg tracking-[0.3em]"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  autoComplete="one-time-code"
                />
              </div>
              <button
                className="btn btn-primary"
                disabled={verifyCode.length !== 6 || verifySetupMutation.isPending}
                onClick={handleVerifySetup}
              >
                {verifySetupMutation.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
                Vérifier et activer
              </button>
            </div>
          </div>

          <button className="btn btn-secondary" onClick={() => setSetupData(null)}>
            Annuler
          </button>
        </div>
      ) : backupCodes ? (
        /* ── Backup Codes Display (shown once) ── */
        <div className="mt-6 space-y-4 max-w-lg">
          <div className="p-4 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
            <div className="flex items-start gap-3">
              <KeyRound size={20} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                  Codes de secours
                </p>
                <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                  Conservez ces codes en lieu sûr. Chaque code ne peut être utilisé qu'une seule fois
                  pour vous connecter si vous perdez l'accès à votre application d'authentification.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-border bg-muted/50">
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, i) => (
                <div key={i} className="font-mono text-sm text-center py-1.5 px-3 rounded bg-background border border-border">
                  {code}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={copyBackupCodes}>
              {copiedCodes ? <Check size={14} className="mr-1.5 text-green-600" /> : <Copy size={14} className="mr-1.5" />}
              {copiedCodes ? 'Copié' : 'Copier les codes'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                const text = backupCodes.join('\n')
                const blob = new Blob([text], { type: 'text/plain' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'opsflux-backup-codes.txt'
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              Télécharger
            </button>
          </div>

          <button
            className="btn btn-primary"
            onClick={() => setBackupCodes(null)}
          >
            J'ai sauvegardé mes codes
          </button>
        </div>
      ) : (
        /* ── MFA Not Enabled ── */
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30">
            <ShieldOff size={20} className="text-yellow-600 dark:text-yellow-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                Authentification à deux facteurs non activée
              </p>
              <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-0.5">
                Activez le 2FA pour renforcer la sécurité de votre compte.
              </p>
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleStartSetup} disabled={setupMutation.isPending}>
            {setupMutation.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
            <ShieldCheck size={14} className="mr-1.5" />
            Activer l'authentification à deux facteurs
          </button>
        </div>
      )}
    </>
  )
}
