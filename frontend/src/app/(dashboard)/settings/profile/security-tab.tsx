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
import { Shield, ShieldCheck, Key, Download, RefreshCw, Smartphone } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
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

  useEffect(() => {
    fetchTwoFactorConfig()
  }, [])

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
