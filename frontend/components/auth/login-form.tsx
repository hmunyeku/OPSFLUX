"use client"

import type React from "react"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Mail, Lock, AlertCircle, Eye, EyeOff, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface LoginFormProps {
  onTwoFactorRequired: () => void
}

export function LoginForm({ onTwoFactorRequired }: LoginFormProps) {
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [focusedField, setFocusedField] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const result = await login(email, password)
      if (result.requiresTwoFactor) {
        onTwoFactorRequired()
      }
    } catch (err) {
      setError("Email ou mot de passe incorrect")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-1 duration-300">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label
          htmlFor="email"
          className={cn(
            "text-sm font-medium transition-colors",
            focusedField === "email" && "text-primary"
          )}
        >
          Adresse email
        </Label>
        <div className="relative group">
          <Mail className={cn(
            "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors pointer-events-none z-10",
            focusedField === "email" ? "text-primary" : "text-muted-foreground"
          )} />
          <Input
            id="email"
            type="email"
            placeholder="nom@entreprise.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setFocusedField("email")}
            onBlur={() => setFocusedField(null)}
            className={cn(
              "pl-10 h-11 transition-all",
              focusedField === "email" && "ring-2 ring-primary/20 border-primary"
            )}
            required
            disabled={isLoading}
            autoComplete="email"
            autoFocus
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="password"
          className={cn(
            "text-sm font-medium transition-colors",
            focusedField === "password" && "text-primary"
          )}
        >
          Mot de passe
        </Label>
        <div className="relative group">
          <Lock className={cn(
            "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors pointer-events-none z-10",
            focusedField === "password" ? "text-primary" : "text-muted-foreground"
          )} />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setFocusedField("password")}
            onBlur={() => setFocusedField(null)}
            className={cn(
              "pl-10 pr-10 h-11 transition-all",
              focusedField === "password" && "ring-2 ring-primary/20 border-primary"
            )}
            required
            disabled={isLoading}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
            disabled={isLoading}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="remember"
            checked={rememberMe}
            onCheckedChange={(checked) => setRememberMe(checked as boolean)}
            disabled={isLoading}
            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <Label
            htmlFor="remember"
            className="text-sm font-normal cursor-pointer select-none hover:text-foreground transition-colors"
          >
            Se souvenir de moi
          </Label>
        </div>
        <a
          href="/forgot-password"
          className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
        >
          Mot de passe oublié ?
        </a>
      </div>

      <Button
        type="submit"
        className="w-full h-11 font-medium group"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Connexion en cours...
          </>
        ) : (
          <>
            Se connecter
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </>
        )}
      </Button>

      {/* Demo Info - Only show in development */}
      {process.env.NODE_ENV === "development" && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground font-medium">
                Mode développement
              </span>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-2 border border-border/50">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">Test rapide :</span> Utilisez n'importe quel email valide
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">2FA :</span> Ajoutez{" "}
              <code className="px-1.5 py-0.5 rounded bg-background border font-mono text-[10px]">2fa</code>
              {" "}dans l'email pour tester la double authentification
            </p>
          </div>
        </>
      )}
    </form>
  )
}
