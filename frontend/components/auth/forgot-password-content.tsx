"use client"

import { useState } from "react"
import { ForgotPasswordForm } from "./forgot-password-form"
import { Zap, CheckCircle2, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export function ForgotPasswordContent() {
  const [emailSent, setEmailSent] = useState(false)
  const [sentEmail, setSentEmail] = useState("")

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
            {emailSent ? "Email envoyé" : "Mot de passe oublié"}
          </h2>
          <p className="text-muted-foreground">
            {emailSent
              ? "Vérifiez votre boîte de réception"
              : "Entrez votre adresse email pour réinitialiser votre mot de passe"}
          </p>
        </div>

        {/* Form Card */}
        <div className="relative">
          {/* Subtle border glow */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur opacity-30" />
          <div className="relative bg-card border border-border/50 rounded-2xl shadow-xl p-8">
            {emailSent ? (
              <div className="space-y-6 text-center">
                <div className="flex justify-center">
                  <div className="rounded-full bg-green-500/10 p-3">
                    <CheckCircle2 className="h-12 w-12 text-green-600" />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Un email de réinitialisation a été envoyé à :
                  </p>
                  <p className="font-semibold text-foreground">{sentEmail}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-left">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">Pas d'email reçu ?</span>
                    <br />
                    • Vérifiez votre dossier spam
                    <br />
                    • Assurez-vous que l'adresse est correcte
                    <br />• Le lien expire dans 24 heures
                  </p>
                </div>
                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Retour à la connexion
                  </Button>
                </Link>
              </div>
            ) : (
              <ForgotPasswordForm
                onSuccess={(email) => {
                  setSentEmail(email)
                  setEmailSent(true)
                }}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        {!emailSent && (
          <div className="text-center">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-2 transition-colors">
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
