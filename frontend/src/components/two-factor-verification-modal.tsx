"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Token2FARequired } from "@/lib/api"

interface TwoFactorVerificationModalProps {
  open: boolean
  twoFactorData: Token2FARequired
  onVerify: (code: string, method: string) => Promise<void>
  onCancel: () => void
}

export function TwoFactorVerificationModal({
  open,
  twoFactorData,
  onVerify,
  onCancel,
}: TwoFactorVerificationModalProps) {
  const [code, setCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState(
    twoFactorData.available_methods[0] || "totp"
  )

  const handleVerify = async () => {
    if (!code.trim()) return

    setIsLoading(true)
    try {
      await onVerify(code, selectedMethod)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) {
      handleVerify()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[425px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Vérification en deux étapes</DialogTitle>
          <DialogDescription>
            Entrez le code de vérification pour terminer la connexion
          </DialogDescription>
        </DialogHeader>

        <Tabs value={selectedMethod} onValueChange={setSelectedMethod} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            {twoFactorData.available_methods.includes("totp") && (
              <TabsTrigger value="totp">Authenticator</TabsTrigger>
            )}
            {twoFactorData.available_methods.includes("sms") && (
              <TabsTrigger value="sms">SMS</TabsTrigger>
            )}
            {twoFactorData.available_methods.includes("backup") && (
              <TabsTrigger value="backup">Code backup</TabsTrigger>
            )}
          </TabsList>

          {twoFactorData.available_methods.includes("totp") && (
            <TabsContent value="totp" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="totp-code">Code de l&apos;application d&apos;authentification</Label>
                <Input
                  id="totp-code"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={6}
                  autoComplete="off"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Entrez le code à 6 chiffres de votre application d&apos;authentification
                </p>
              </div>
            </TabsContent>
          )}

          {twoFactorData.available_methods.includes("sms") && (
            <TabsContent value="sms" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sms-code">Code SMS</Label>
                <Input
                  id="sms-code"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={6}
                  autoComplete="off"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Un code a été envoyé au {twoFactorData.masked_phone}
                </p>
              </div>
            </TabsContent>
          )}

          {twoFactorData.available_methods.includes("backup") && (
            <TabsContent value="backup" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="backup-code">Code de récupération</Label>
                <Input
                  id="backup-code"
                  placeholder="Entrez un code de récupération"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Utilisez l&apos;un de vos codes de récupération de secours
                </p>
              </div>
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Annuler
          </Button>
          <Button
            onClick={handleVerify}
            disabled={!code.trim() || isLoading}
          >
            {isLoading ? "Vérification..." : "Vérifier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
