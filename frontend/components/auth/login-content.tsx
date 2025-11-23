"use client"

import { useState } from "react"
import { LoginForm } from "./login-form"
import { TwoFactorForm } from "./two-factor-form"

export function LoginContent() {
  const [showTwoFactor, setShowTwoFactor] = useState(false)

  return (
    <div className="min-h-screen w-full flex">
      {/* Left side - Branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 bg-gradient-to-br from-primary/5 via-background to-primary/10 relative overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

        {/* Floating shapes */}
        <div className="absolute top-20 left-20 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          <div className="space-y-6 max-w-lg">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <span className="text-3xl font-bold tracking-tight">OpsFlux</span>
            </div>

            {/* Tagline */}
            <div className="space-y-4">
              <h1 className="text-4xl xl:text-5xl font-bold tracking-tight leading-tight">
                Optimisez vos
                <span className="text-primary"> operations</span>
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Plateforme intelligente de gestion des operations offshore.
                Simplifiez vos processus et gagnez en efficacite.
              </p>
            </div>

            {/* Features */}
            <div className="grid gap-4 pt-4">
              {[
                { title: "Gestion POB", desc: "Personnel a bord en temps reel" },
                { title: "Logistique", desc: "Suivi des transports et equipements" },
                { title: "Rapports", desc: "Dashboards et analytics avances" },
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">{feature.title}</p>
                    <p className="text-sm text-muted-foreground">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-6 sm:p-8 md:p-12">
        <div className="w-full max-w-[400px] space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center">
            <div className="inline-flex items-center gap-2.5">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-primary-foreground">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <span className="text-2xl font-bold">OpsFlux</span>
            </div>
          </div>

          {/* Form Header */}
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {showTwoFactor ? "Verification" : "Connexion"}
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base">
              {showTwoFactor
                ? "Entrez le code a 6 chiffres"
                : "Entrez vos identifiants pour continuer"}
            </p>
          </div>

          {/* Form */}
          <div className="space-y-6">
            {showTwoFactor ? (
              <TwoFactorForm onBack={() => setShowTwoFactor(false)} />
            ) : (
              <LoginForm onTwoFactorRequired={() => setShowTwoFactor(true)} />
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground pt-4">
            © 2025 OpsFlux. Tous droits reserves.
          </p>
        </div>
      </div>
    </div>
  )
}
