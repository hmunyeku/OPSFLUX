"use client"

import { Suspense, useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { ResetPasswordForm } from "./reset-password-form"
import { Zap, CheckCircle2, ArrowLeft, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Alert, AlertDescription } from "@/components/ui/alert"

function ResetPasswordContentInner() {
  const searchParams = useSearchParams()
  const [token, setToken] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [tokenError, setTokenError] = useState(false)

  useEffect(() => {
    const tokenParam = searchParams.get("token")
    if (!tokenParam) {
      setTokenError(true)
    } else {
      setToken(tokenParam)
    }
  }, [searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center p-6 sm:p-12 bg-background">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center">
          <Link href="/login" className="inline-flex items-center gap-2 mb-8 group">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-primary-foreground group-hover:scale-105 transition-transform">
              <Zap className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold">OpsFlux</span>
          </Link>
        </div>

        {/* Form Header */}
        <div className="space-y-2 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            {isSuccess ? "Mot de passe réinitialisé" : "Nouveau mot de passe"}
          </h2>
          <p className="text-muted-foreground">
            {isSuccess
              ? "Votre mot de passe a été modifié avec succès"
              : "Définissez un nouveau mot de passe pour votre compte"}
          </p>
        </div>

        {/* Form Card */}
        <div className="relative">
          {/* Subtle border glow */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur opacity-30" />
          <div className="relative bg-card border border-border/50 rounded-2xl shadow-xl p-8">
            {tokenError ? (
              <div className="space-y-6 text-center">
                <div className="flex justify-center">
                  <div className="rounded-full bg-destructive/10 p-3">
                    <AlertCircle className="h-12 w-12 text-destructive" />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold text-foreground">Lien invalide ou expiré</p>
                  <p className="text-sm text-muted-foreground">
                    Ce lien de réinitialisation n'est pas valide ou a expiré.
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-left">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">Que faire ?</span>
                    <br />
                    • Vérifiez que vous avez cliqué sur le bon lien
                    <br />
                    • Les liens expirent après 48 heures
                    <br />• Demandez un nouveau lien de réinitialisation
                  </p>
                </div>
                <div className="space-y-3">
                  <Link href="/forgot-password">
                    <Button className="w-full">Demander un nouveau lien</Button>
                  </Link>
                  <Link href="/login">
                    <Button variant="outline" className="w-full">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Retour à la connexion
                    </Button>
                  </Link>
                </div>
              </div>
            ) : isSuccess ? (
              <div className="space-y-6 text-center">
                <div className="flex justify-center">
                  <div className="rounded-full bg-green-500/10 p-3">
                    <CheckCircle2 className="h-12 w-12 text-green-600" />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Votre mot de passe a été réinitialisé avec succès.
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
                  </p>
                </div>
                <Link href="/login">
                  <Button className="w-full">
                    Se connecter
                    <ArrowLeft className="ml-2 h-4 w-4 rotate-180" />
                  </Button>
                </Link>
              </div>
            ) : token ? (
              <ResetPasswordForm token={token} onSuccess={() => setIsSuccess(true)} />
            ) : (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {!isSuccess && !tokenError && (
          <div className="text-center">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-2 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour à la connexion
            </Link>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          © 2025 OpsFlux. Tous droits réservés.
        </p>
      </div>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </div>
  )
}

export function ResetPasswordContent() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetPasswordContentInner />
    </Suspense>
  )
}
