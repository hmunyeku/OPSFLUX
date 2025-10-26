"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  IconShieldLock,
  IconCheck,
  IconAlertCircle,
} from "@tabler/icons-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { acceptInvitation, verifyInvitation2FA } from "../api"

interface AcceptInvitationProps {
  token: string
}

export default function AcceptInvitation({ token }: AcceptInvitationProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [step, setStep] = useState<"password" | "2fa">("password")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [twoFactorMethod, setTwoFactorMethod] = useState("email")
  const [twoFactorCode, setTwoFactorCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validatePassword = () => {
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères")
      return false
    }
    if (password !== passwordConfirm) {
      setError("Les mots de passe ne correspondent pas")
      return false
    }
    return true
  }

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!validatePassword()) {
      return
    }

    setIsLoading(true)
    try {
      await acceptInvitation(token)

      toast({
        title: "Invitation acceptée",
        description: "Veuillez vérifier votre email pour le code de vérification",
      })

      setStep("2fa")
    } catch (error: any) {
      console.error("Failed to accept invitation:", error)
      setError(error.message || "Impossible d'accepter l'invitation. Le lien est peut-être expiré.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!twoFactorCode.trim()) {
      setError("Veuillez entrer le code de vérification")
      return
    }

    setIsLoading(true)
    try {
      const response = await verifyInvitation2FA(token)

      if (response.access_token) {
        // Store token
        localStorage.setItem("token", response.access_token)

        toast({
          title: "Compte créé avec succès",
          description: "Bienvenue sur OpsFlux !",
        })

        // Redirect to dashboard
        router.push("/")
      }
    } catch (error: any) {
      console.error("Failed to verify 2FA:", error)
      setError(error.message || "Code de vérification invalide")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <IconShieldLock className="h-6 w-6" />
            <CardTitle className="text-2xl">
              {step === "password" ? "Accepter l'invitation" : "Vérification 2FA"}
            </CardTitle>
          </div>
          <CardDescription>
            {step === "password"
              ? "Créez votre mot de passe pour accéder à la plateforme"
              : "Entrez le code de vérification envoyé par email"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <IconAlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === "password" ? (
            <form onSubmit={handleAccept} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">
                  Mot de passe <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min. 8 caractères"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Le mot de passe doit contenir au moins 8 caractères
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="passwordConfirm">
                  Confirmer le mot de passe <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  placeholder="Confirmez votre mot de passe"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="twoFactorMethod">Méthode de vérification 2FA</Label>
                <Select value={twoFactorMethod} onValueChange={setTwoFactorMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="app">Application d'authentification</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Un code de vérification vous sera envoyé
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Traitement..." : "Accepter l'invitation"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerify2FA} className="space-y-4">
              <Alert>
                <IconCheck className="h-4 w-4" />
                <AlertDescription>
                  Un code de vérification a été envoyé à votre adresse email.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="twoFactorCode">
                  Code de vérification <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="twoFactorCode"
                  type="text"
                  placeholder="123456"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  required
                  autoFocus
                  maxLength={6}
                />
                <p className="text-xs text-muted-foreground">
                  Entrez le code à 6 chiffres reçu par email
                </p>
              </div>

              <div className="space-y-2">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Vérification..." : "Vérifier et créer mon compte"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setStep("password")}
                  disabled={isLoading}
                >
                  Retour
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
