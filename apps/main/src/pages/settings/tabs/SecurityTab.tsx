/**
 * Security settings tab — password change + MFA (TOTP).
 *
 * GitLab pattern: Password section, then Two-Factor Authentication section below.
 * MFA flow: Setup → QR code → Verify code → Show backup codes → Done.
 *
 * Collapsible sections with deep-link: #password, #mfa
 */
import { useState } from 'react'
import { Eye, EyeOff, Loader2, ShieldCheck, ShieldOff, Copy, Check, RefreshCw, KeyRound } from 'lucide-react'
import { useChangePassword, useMFAStatus, useMFASetup, useMFAVerifySetup, useMFADisable, useMFARegenerateCodes } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

export function SecurityTab() {
  return (
    <>
      <CollapsibleSection
        id="password"
        title="Mot de passe"
        description="Changez votre mot de passe. Après modification, les autres sessions pourront être invalidées."
        storageKey="settings.security.collapse"
      >
        <PasswordSection />
      </CollapsibleSection>

      <CollapsibleSection
        id="mfa"
        title="Authentification à deux facteurs"
        description="Renforcez la sécurité de votre compte en activant l'authentification à deux facteurs (TOTP)."
        storageKey="settings.security.collapse"
        showSeparator={false}
      >
        <MFASection />
      </CollapsibleSection>
    </>
  )
}

/* ── Password Change Section ── */
function PasswordSection() {
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
      toast({ title: 'Mot de passe modifié', description: 'Votre mot de passe a été mis à jour avec succès.', variant: 'success' })
      setCurrentPwd('')
      setNewPwd('')
      setConfirmPwd('')
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Impossible de changer le mot de passe.'
      toast({ title: 'Erreur', description: message, variant: 'error' })
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
          <label className="gl-label">Mot de passe actuel</label>
          <input type="password" className="gl-form-input" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} placeholder="Entrez votre mot de passe actuel" autoComplete="current-password" />
        </div>
        <div>
          <label className="gl-label">Nouveau mot de passe</label>
          <div className="relative">
            <input type={showNew ? 'text' : 'password'} className="gl-form-input pr-10" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Min. 8 caractères" autoComplete="new-password" />
            <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {tooShort && <p className="mt-1 text-sm text-destructive">Le mot de passe doit contenir au moins 8 caractères.</p>}
          <p className="mt-1 text-sm text-muted-foreground">Minimum 8 caractères, avec au moins une majuscule et un chiffre.</p>
        </div>
        <div>
          <label className="gl-label">Confirmer le nouveau mot de passe</label>
          <input type="password" className="gl-form-input" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder="Confirmez le nouveau mot de passe" autoComplete="new-password" />
          {mismatch && <p className="mt-1 text-sm text-destructive">Les mots de passe ne correspondent pas.</p>}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-6">
        <button className="gl-button gl-button-confirm" disabled={!canSubmit} onClick={handleSubmit}>
          {changePassword.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
          Changer le mot de passe
        </button>
        <button className="gl-button gl-button-default" onClick={handleCancel}>Annuler</button>
      </div>
    </>
  )
}

/* ── MFA (Two-Factor Authentication) Section ── */
function MFASection() {
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
      toast({ title: 'Erreur', description: 'Impossible de démarrer la configuration MFA.', variant: 'error' })
    }
  }

  const handleVerifySetup = async () => {
    try {
      const data = await verifySetupMutation.mutateAsync(verifyCode)
      setBackupCodes(data.backup_codes)
      setSetupData(null)
      toast({ title: 'MFA activé', description: 'L\'authentification à deux facteurs est maintenant active.', variant: 'success' })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Code invalide.'
      toast({ title: 'Erreur', description: message, variant: 'error' })
    }
  }

  const handleDisable = async () => {
    try {
      await disableMutation.mutateAsync(disablePassword)
      setShowDisable(false)
      setDisablePassword('')
      toast({ title: 'MFA désactivé', description: 'L\'authentification à deux facteurs a été désactivée.', variant: 'success' })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Mot de passe incorrect.'
      toast({ title: 'Erreur', description: message, variant: 'error' })
    }
  }

  const handleRegenerate = async () => {
    try {
      const data = await regenerateMutation.mutateAsync(regenPassword)
      setBackupCodes(data.backup_codes)
      setShowRegenerate(false)
      setRegenPassword('')
      toast({ title: 'Codes régénérés', description: 'De nouveaux codes de secours ont été générés.', variant: 'success' })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Mot de passe incorrect.'
      toast({ title: 'Erreur', description: message, variant: 'error' })
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
            <button className="gl-button gl-button-default" onClick={() => { setShowRegenerate(true); setShowDisable(false) }}>
              <RefreshCw size={14} className="mr-1.5" />
              Régénérer les codes de secours
            </button>
            <button className="gl-button gl-button-danger" onClick={() => { setShowDisable(true); setShowRegenerate(false) }}>
              <ShieldOff size={14} className="mr-1.5" />
              Désactiver le 2FA
            </button>
          </div>

          {/* Disable confirmation */}
          {showDisable && (
            <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3 max-w-md">
              <p className="text-sm font-medium text-destructive">Confirmer la désactivation</p>
              <div>
                <label className="gl-label">Mot de passe actuel</label>
                <input type="password" className="gl-form-input" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} placeholder="Entrez votre mot de passe" autoComplete="current-password" />
              </div>
              <div className="flex gap-2">
                <button className="gl-button gl-button-danger" disabled={!disablePassword || disableMutation.isPending} onClick={handleDisable}>
                  {disableMutation.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
                  Désactiver
                </button>
                <button className="gl-button gl-button-default" onClick={() => { setShowDisable(false); setDisablePassword('') }}>Annuler</button>
              </div>
            </div>
          )}

          {/* Regenerate codes */}
          {showRegenerate && (
            <div className="p-4 rounded-lg border border-border bg-background-subtle space-y-3 max-w-md">
              <p className="text-sm font-medium">Régénérer les codes de secours</p>
              <p className="text-xs text-muted-foreground">Les anciens codes seront invalidés.</p>
              <div>
                <label className="gl-label">Mot de passe actuel</label>
                <input type="password" className="gl-form-input" value={regenPassword} onChange={(e) => setRegenPassword(e.target.value)} placeholder="Entrez votre mot de passe" autoComplete="current-password" />
              </div>
              <div className="flex gap-2">
                <button className="gl-button gl-button-confirm" disabled={!regenPassword || regenerateMutation.isPending} onClick={handleRegenerate}>
                  {regenerateMutation.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
                  Régénérer
                </button>
                <button className="gl-button gl-button-default" onClick={() => { setShowRegenerate(false); setRegenPassword('') }}>Annuler</button>
              </div>
            </div>
          )}
        </div>
      ) : setupData && !backupCodes ? (
        /* ── MFA Setup Flow: QR Code + Verify ── */
        <div className="mt-6 space-y-6 max-w-lg">
          <div className="p-4 rounded-lg border border-border bg-card">
            <h3 className="text-sm font-semibold mb-3">1. Scannez ce QR code avec votre application d'authentification</h3>
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
            <h3 className="text-sm font-semibold mb-3">2. Entrez le code de vérification</h3>
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
                className="gl-button gl-button-confirm"
                disabled={verifyCode.length !== 6 || verifySetupMutation.isPending}
                onClick={handleVerifySetup}
              >
                {verifySetupMutation.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
                Vérifier et activer
              </button>
            </div>
          </div>

          <button className="gl-button gl-button-default" onClick={() => setSetupData(null)}>
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
            <button className="gl-button gl-button-default" onClick={copyBackupCodes}>
              {copiedCodes ? <Check size={14} className="mr-1.5 text-green-600" /> : <Copy size={14} className="mr-1.5" />}
              {copiedCodes ? 'Copié' : 'Copier les codes'}
            </button>
            <button
              className="gl-button gl-button-default"
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
            className="gl-button gl-button-confirm"
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

          <button className="gl-button gl-button-confirm" onClick={handleStartSetup} disabled={setupMutation.isPending}>
            {setupMutation.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
            <ShieldCheck size={14} className="mr-1.5" />
            Activer l'authentification à deux facteurs
          </button>
        </div>
      )}
    </>
  )
}
