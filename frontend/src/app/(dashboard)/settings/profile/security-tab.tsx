"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Shield, ShieldCheck, Key, Download, RefreshCw, Smartphone, Lock, CheckCircle2, XCircle, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { PasswordPolicy } from "@/lib/api"
import QRCode from "qrcode"

interface TwoFactorConfig {
  is_enabled: boolean
  primary_method: "totp" | "sms"
  totp_verified_at: string | null
  phone_number: string | null
  phone_verified_at: string | null
  backup_codes_count: number
  last_used_at: string | null
}

interface PasswordStrength {
  score: number
  label: string
  color: string
}

export function SecurityTab() {
  const { toast } = useToast()
  const [twoFactorConfig, setTwoFactorConfig] = useState<TwoFactorConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [setupDialogOpen, setSetupDialogOpen] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState("")
  const [totpSecret, setTotpSecret] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [showBackupCodes, setShowBackupCodes] = useState(false)

  // Password change states
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy | null>(null)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>({ score: 0, label: "weak", color: "red" })
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    fetchTwoFactorConfig()
    fetchPasswordPolicy()
  }, [])

  useEffect(() => {
    if (newPassword && passwordPolicy) {
      setPasswordStrength(calculatePasswordStrength(newPassword, passwordPolicy))
    } else {
      setPasswordStrength({ score: 0, label: "weak", color: "red" })
    }
  }, [newPassword, passwordPolicy])

  const fetchTwoFactorConfig = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/2fa/config`, {
        credentials: "include",
      })
      if (response.ok) {
        const data = await response.json()
        setTwoFactorConfig(data)
      }
    } catch (_error) {
      // Silently fail - user will see no 2FA config
    } finally {
      setLoading(false)
    }
  }

  const fetchPasswordPolicy = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/security/password-policy`, {
        credentials: "include",
      })
      if (response.ok) {
        const data = await response.json()
        setPasswordPolicy(data)
      }
    } catch (_error) {
      // Silently fail
    }
  }

  const handleSetupTotp = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/2fa/setup-totp`, {
        method: "POST",
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()
        setTotpSecret(data.secret)

        // Generate QR code
        const qr = await QRCode.toDataURL(data.provisioning_uri)
        setQrCodeUrl(qr)
        setSetupDialogOpen(true)
      } else {
        toast({
          title: "Erreur",
          description: "Impossible de configurer l'authentification à deux facteurs",
          variant: "destructive",
        })
      }
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite",
        variant: "destructive",
      })
    }
  }

  const handleEnable2FA = async () => {
    if (!verificationCode) {
      toast({
        title: "Code requis",
        description: "Veuillez entrer le code de vérification",
        variant: "destructive",
      })
      return
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/2fa/enable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          method: "totp",
          verification_code: verificationCode,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setBackupCodes(data.backup_codes.codes)
        setShowBackupCodes(true)
        setSetupDialogOpen(false)

        toast({
          title: "2FA activé",
          description: "L'authentification à deux facteurs a été activée avec succès",
        })

        await fetchTwoFactorConfig()
      } else {
        const error = await response.json()
        toast({
          title: "Code invalide",
          description: error.detail || "Le code de vérification est incorrect",
          variant: "destructive",
        })
      }
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite",
        variant: "destructive",
      })
    }
  }

  const handleDisable2FA = async () => {
    if (!confirm("Êtes-vous sûr de vouloir désactiver l'authentification à deux facteurs ?")) {
      return
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/2fa/disable`, {
        method: "POST",
        credentials: "include",
      })

      if (response.ok) {
        toast({
          title: "2FA désactivé",
          description: "L'authentification à deux facteurs a été désactivée",
        })
        await fetchTwoFactorConfig()
      } else {
        toast({
          title: "Erreur",
          description: "Impossible de désactiver l'authentification à deux facteurs",
          variant: "destructive",
        })
      }
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite",
        variant: "destructive",
      })
    }
  }

  const handleRegenerateBackupCodes = async () => {
    if (!confirm("Êtes-vous sûr de vouloir régénérer les codes de secours ? Les anciens codes ne fonctionneront plus.")) {
      return
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/2fa/regenerate-backup-codes`, {
        method: "POST",
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()
        setBackupCodes(data.codes)
        setShowBackupCodes(true)

        toast({
          title: "Codes régénérés",
          description: "Les nouveaux codes de secours ont été générés",
        })

        await fetchTwoFactorConfig()
      } else {
        toast({
          title: "Erreur",
          description: "Impossible de régénérer les codes de secours",
          variant: "destructive",
        })
      }
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite",
        variant: "destructive",
      })
    }
  }

  const downloadBackupCodes = () => {
    const content = backupCodes.join("\n")
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "backup-codes-opsflux.txt"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const calculatePasswordStrength = (password: string, policy: PasswordPolicy): PasswordStrength => {
    let score = 0
    const checks = {
      length: password.length >= policy.min_length,
      uppercase: !policy.require_uppercase || /[A-Z]/.test(password),
      lowercase: !policy.require_lowercase || /[a-z]/.test(password),
      digit: !policy.require_digit || /[0-9]/.test(password),
      special: !policy.require_special || new RegExp(`[${policy.special_chars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(password),
    }

    // Count passed checks
    if (checks.length) score++
    if (checks.uppercase) score++
    if (checks.lowercase) score++
    if (checks.digit) score++
    if (checks.special) score++

    // Additional points for length
    if (password.length >= policy.min_length + 4) score++
    if (password.length >= policy.min_length + 8) score++

    if (score <= 3) {
      return { score, label: "Faible", color: "red" }
    } else if (score <= 5) {
      return { score, label: "Moyen", color: "orange" }
    } else {
      return { score, label: "Fort", color: "green" }
    }
  }

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs",
        variant: "destructive",
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Erreur",
        description: "Les nouveaux mots de passe ne correspondent pas",
        variant: "destructive",
      })
      return
    }

    if (passwordStrength.score <= 3) {
      toast({
        title: "Mot de passe trop faible",
        description: "Veuillez choisir un mot de passe plus fort",
        variant: "destructive",
      })
      return
    }

    setIsChangingPassword(true)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })

      if (response.ok) {
        toast({
          title: "Mot de passe changé",
          description: "Votre mot de passe a été changé avec succès",
        })
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
      } else {
        const error = await response.json()
        toast({
          title: "Erreur",
          description: error.detail || "Impossible de changer le mot de passe",
          variant: "destructive",
        })
      }
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite",
        variant: "destructive",
      })
    } finally {
      setIsChangingPassword(false)
    }
  }

  if (loading) {
    return <div className="space-y-4">Chargement...</div>
  }

  return (
    <div className="space-y-6">
      {/* Authentification à deux facteurs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Authentification à deux facteurs (2FA)
              </CardTitle>
              <CardDescription>
                Ajoutez une couche de sécurité supplémentaire à votre compte
              </CardDescription>
            </div>
            {twoFactorConfig?.is_enabled && (
              <Badge variant="default" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                Activé
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>État de la 2FA</Label>
              <div className="text-sm text-muted-foreground">
                {twoFactorConfig?.is_enabled
                  ? "L'authentification à deux facteurs est active"
                  : "L'authentification à deux facteurs est désactivée"
                }
              </div>
            </div>
            <Switch
              checked={twoFactorConfig?.is_enabled || false}
              onCheckedChange={(checked) => {
                if (checked) {
                  handleSetupTotp()
                } else {
                  handleDisable2FA()
                }
              }}
            />
          </div>

          {twoFactorConfig?.is_enabled && (
            <>
              <div className="pt-4 border-t space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      Méthode principale
                    </Label>
                    <div className="text-sm text-muted-foreground">
                      {twoFactorConfig.primary_method === "totp"
                        ? "Application d'authentification (TOTP)"
                        : "SMS"
                      }
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      <Key className="h-4 w-4" />
                      Codes de secours
                    </Label>
                    <div className="text-sm text-muted-foreground">
                      {twoFactorConfig.backup_codes_count} code(s) disponible(s)
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerateBackupCodes}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Régénérer
                  </Button>
                </div>
              </div>

              {twoFactorConfig.last_used_at && (
                <Alert>
                  <AlertDescription>
                    Dernière utilisation : {new Date(twoFactorConfig.last_used_at).toLocaleString("fr-FR")}
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Changement de mot de passe */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Mot de passe
              </CardTitle>
              <CardDescription>
                Modifiez votre mot de passe pour sécuriser votre compte
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Mot de passe actuel</Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Entrez votre mot de passe actuel"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              >
                {showCurrentPassword ? "Masquer" : "Afficher"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">Nouveau mot de passe</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Entrez votre nouveau mot de passe"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? "Masquer" : "Afficher"}
              </Button>
            </div>

            {/* Password strength indicator */}
            {newPassword && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Force du mot de passe</span>
                  <span className={`font-medium ${
                    passwordStrength.color === "green" ? "text-green-600" :
                    passwordStrength.color === "orange" ? "text-orange-600" :
                    "text-red-600"
                  }`}>
                    {passwordStrength.label}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      passwordStrength.color === "green" ? "bg-green-600" :
                      passwordStrength.color === "orange" ? "bg-orange-600" :
                      "bg-red-600"
                    }`}
                    style={{ width: `${(passwordStrength.score / 7) * 100}%` }}
                  />
                </div>

                {/* Password policy checks */}
                {passwordPolicy && (
                  <div className="space-y-1 pt-2">
                    <p className="text-xs text-muted-foreground mb-1">Exigences :</p>
                    <div className="grid grid-cols-1 gap-1 text-xs">
                      <div className={`flex items-center gap-1.5 ${
                        newPassword.length >= passwordPolicy.min_length ? "text-green-600" : "text-gray-500"
                      }`}>
                        {newPassword.length >= passwordPolicy.min_length ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        <span>Au moins {passwordPolicy.min_length} caractères</span>
                      </div>

                      {passwordPolicy.require_uppercase && (
                        <div className={`flex items-center gap-1.5 ${
                          /[A-Z]/.test(newPassword) ? "text-green-600" : "text-gray-500"
                        }`}>
                          {/[A-Z]/.test(newPassword) ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )}
                          <span>Au moins une lettre majuscule</span>
                        </div>
                      )}

                      {passwordPolicy.require_lowercase && (
                        <div className={`flex items-center gap-1.5 ${
                          /[a-z]/.test(newPassword) ? "text-green-600" : "text-gray-500"
                        }`}>
                          {/[a-z]/.test(newPassword) ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )}
                          <span>Au moins une lettre minuscule</span>
                        </div>
                      )}

                      {passwordPolicy.require_digit && (
                        <div className={`flex items-center gap-1.5 ${
                          /[0-9]/.test(newPassword) ? "text-green-600" : "text-gray-500"
                        }`}>
                          {/[0-9]/.test(newPassword) ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )}
                          <span>Au moins un chiffre</span>
                        </div>
                      )}

                      {passwordPolicy.require_special && (
                        <div className={`flex items-center gap-1.5 ${
                          new RegExp(`[${passwordPolicy.special_chars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(newPassword) ? "text-green-600" : "text-gray-500"
                        }`}>
                          {new RegExp(`[${passwordPolicy.special_chars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(newPassword) ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )}
                          <span>Au moins un caractère spécial ({passwordPolicy.special_chars})</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmer le nouveau mot de passe</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmez votre nouveau mot de passe"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? "Masquer" : "Afficher"}
              </Button>
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <div className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Les mots de passe ne correspondent pas</span>
              </div>
            )}
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={
              isChangingPassword ||
              !currentPassword ||
              !newPassword ||
              !confirmPassword ||
              newPassword !== confirmPassword ||
              passwordStrength.score <= 3
            }
            className="w-full sm:w-auto"
          >
            {isChangingPassword ? "Changement en cours..." : "Changer le mot de passe"}
          </Button>
        </CardContent>
      </Card>

      {/* Dialog de configuration TOTP */}
      <Dialog open={setupDialogOpen} onOpenChange={setSetupDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurer l&apos;authentification à deux facteurs</DialogTitle>
            <DialogDescription>
              Scannez le QR code avec votre application d&apos;authentification (Google Authenticator, Authy, etc.)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {qrCodeUrl && (
              <div className="flex justify-center">
                <Image src={qrCodeUrl} alt="QR Code" width={256} height={256} className="w-64 h-64" />
              </div>
            )}

            <Alert>
              <AlertDescription className="font-mono text-xs break-all">
                Si vous ne pouvez pas scanner le QR code, entrez manuellement cette clé : <strong>{totpSecret}</strong>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="verification-code">Code de vérification</Label>
              <Input
                id="verification-code"
                placeholder="000000"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
              />
              <p className="text-sm text-muted-foreground">
                Entrez le code à 6 chiffres de votre application
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleEnable2FA}>
              Activer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog des codes de secours */}
      <Dialog open={showBackupCodes} onOpenChange={setShowBackupCodes}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Codes de secours</DialogTitle>
            <DialogDescription>
              Conservez ces codes dans un endroit sûr. Chaque code ne peut être utilisé qu&apos;une seule fois.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>
                ⚠️ Ces codes ne seront affichés qu&apos;une seule fois. Téléchargez-les ou notez-les maintenant.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg font-mono text-sm">
              {backupCodes.map((code, index) => (
                <div key={index} className="text-center">
                  {code}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={downloadBackupCodes}>
              <Download className="h-4 w-4 mr-2" />
              Télécharger
            </Button>
            <Button variant="outline" onClick={() => setShowBackupCodes(false)}>
              J&apos;ai sauvegardé mes codes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
