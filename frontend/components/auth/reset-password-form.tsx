"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Lock, AlertCircle, Eye, EyeOff, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ResetPasswordFormProps {
  token: string
  onSuccess: () => void
}

export function ResetPasswordForm({ token, onSuccess }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [focusedField, setFocusedField] = useState<string | null>(null)

  // Password strength validation
  const getPasswordStrength = (pass: string) => {
    let strength = 0
    if (pass.length >= 8) strength++
    if (pass.length >= 12) strength++
    if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) strength++
    if (/\d/.test(pass)) strength++
    if (/[^a-zA-Z\d]/.test(pass)) strength++
    return strength
  }

  const passwordStrength = getPasswordStrength(password)
  const isPasswordValid = password.length >= 8 && passwordStrength >= 3
  const doPasswordsMatch = password === confirmPassword && confirmPassword.length > 0

  const getStrengthColor = () => {
    if (passwordStrength <= 1) return "bg-red-500"
    if (passwordStrength <= 3) return "bg-yellow-500"
    return "bg-green-500"
  }

  const getStrengthText = () => {
    if (passwordStrength <= 1) return "Faible"
    if (passwordStrength <= 3) return "Moyen"
    return "Fort"
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    // Validation
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères")
      return
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas")
      return
    }

    if (!isPasswordValid) {
      setError("Le mot de passe doit être plus complexe (majuscules, minuscules, chiffres)")
      return
    }

    setIsLoading(true)

    try {
      const { AuthApi } = await import("@/lib/auth-api")
      await AuthApi.resetPassword(token, password)
      onSuccess()
    } catch (err: any) {
      const errorMessage =
        err?.message || "Une erreur est survenue. Le lien a peut-être expiré."
      setError(errorMessage)
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
          htmlFor="password"
          className={cn(
            "text-sm font-medium transition-colors",
            focusedField === "password" && "text-primary"
          )}
        >
          Nouveau mot de passe
        </Label>
        <div className="relative group">
          <Lock
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors pointer-events-none z-10",
              focusedField === "password" ? "text-primary" : "text-muted-foreground"
            )}
          />
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
            autoComplete="new-password"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
            disabled={isLoading}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {/* Password strength indicator */}
        {password && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full transition-all duration-300", getStrengthColor())}
                  style={{ width: `${(passwordStrength / 5) * 100}%` }}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {getStrengthText()}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div
                className={cn(
                  "flex items-center gap-1",
                  password.length >= 8 ? "text-green-600" : "text-muted-foreground"
                )}
              >
                <CheckCircle2 className="h-3 w-3" />
                <span>8+ caractères</span>
              </div>
              <div
                className={cn(
                  "flex items-center gap-1",
                  /[A-Z]/.test(password) && /[a-z]/.test(password)
                    ? "text-green-600"
                    : "text-muted-foreground"
                )}
              >
                <CheckCircle2 className="h-3 w-3" />
                <span>Maj. et min.</span>
              </div>
              <div
                className={cn(
                  "flex items-center gap-1",
                  /\d/.test(password) ? "text-green-600" : "text-muted-foreground"
                )}
              >
                <CheckCircle2 className="h-3 w-3" />
                <span>Chiffres</span>
              </div>
              <div
                className={cn(
                  "flex items-center gap-1",
                  /[^a-zA-Z\d]/.test(password) ? "text-green-600" : "text-muted-foreground"
                )}
              >
                <CheckCircle2 className="h-3 w-3" />
                <span>Spéciaux</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="confirmPassword"
          className={cn(
            "text-sm font-medium transition-colors",
            focusedField === "confirmPassword" && "text-primary"
          )}
        >
          Confirmer le mot de passe
        </Label>
        <div className="relative group">
          <Lock
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors pointer-events-none z-10",
              focusedField === "confirmPassword" ? "text-primary" : "text-muted-foreground"
            )}
          />
          <Input
            id="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onFocus={() => setFocusedField("confirmPassword")}
            onBlur={() => setFocusedField(null)}
            className={cn(
              "pl-10 pr-10 h-11 transition-all",
              focusedField === "confirmPassword" && "ring-2 ring-primary/20 border-primary",
              doPasswordsMatch && "ring-2 ring-green-500/20 border-green-500"
            )}
            required
            disabled={isLoading}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
            disabled={isLoading}
          >
            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {confirmPassword && (
          <p
            className={cn(
              "text-xs transition-colors",
              doPasswordsMatch ? "text-green-600" : "text-muted-foreground"
            )}
          >
            {doPasswordsMatch ? "✓ Les mots de passe correspondent" : "Les mots de passe doivent correspondre"}
          </p>
        )}
      </div>

      <Button
        type="submit"
        className="w-full h-11 font-medium"
        disabled={isLoading || !isPasswordValid || !doPasswordsMatch}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Réinitialisation en cours...
          </>
        ) : (
          <>Réinitialiser le mot de passe</>
        )}
      </Button>

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-xs text-blue-900 dark:text-blue-100 leading-relaxed">
          <span className="font-medium">Conseil de sécurité :</span> Utilisez un mot de passe unique
          et complexe que vous n'utilisez nulle part ailleurs.
        </p>
      </div>
    </form>
  )
}
