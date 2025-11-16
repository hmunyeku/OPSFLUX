"use client"

import { useState } from "react"
import { LoginForm } from "./login-form"
import { TwoFactorForm } from "./two-factor-form"
import { Zap } from "lucide-react"

export function LoginContent() {
  const [showTwoFactor, setShowTwoFactor] = useState(false)

  return (
    <div className="min-h-screen flex items-center justify-center p-6 sm:p-12 bg-background">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 mb-8">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-primary-foreground">
              <Zap className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold">OpsFlux</span>
          </div>
        </div>

        {/* Form Header */}
        <div className="space-y-2 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            {showTwoFactor ? "Vérification requise" : "Bienvenue"}
          </h2>
          <p className="text-muted-foreground">
            {showTwoFactor
              ? "Entrez le code de vérification pour accéder à votre compte"
              : "Connectez-vous pour accéder à votre espace"}
          </p>
        </div>

        {/* Form Card */}
        <div className="relative">
          {/* Subtle border glow */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur opacity-30" />
          <div className="relative bg-card border border-border/50 rounded-2xl shadow-xl p-8">
            {showTwoFactor ? (
              <TwoFactorForm onBack={() => setShowTwoFactor(false)} />
            ) : (
              <LoginForm onTwoFactorRequired={() => setShowTwoFactor(true)} />
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          © 2025 OpsFlux. Tous droits réservés.
        </p>
      </div>
    </div>
  )
}
