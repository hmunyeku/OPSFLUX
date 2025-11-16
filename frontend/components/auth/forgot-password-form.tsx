"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Mail, AlertCircle, Send } from "lucide-react"
import { cn } from "@/lib/utils"

interface ForgotPasswordFormProps {
  onSuccess: (email: string) => void
}

export function ForgotPasswordForm({ onSuccess }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [focusedField, setFocusedField] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      // Import dynamically to avoid circular dependencies
      const { AuthApi } = await import("@/lib/auth-api")

      await AuthApi.requestPasswordRecovery(email)
      onSuccess(email)
    } catch (err: any) {
      const errorMessage = err?.message || "Une erreur est survenue. Veuillez réessayer."
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
          htmlFor="email"
          className={cn(
            "text-sm font-medium transition-colors",
            focusedField === "email" && "text-primary"
          )}
        >
          Adresse email
        </Label>
        <div className="relative group">
          <Mail
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors pointer-events-none z-10",
              focusedField === "email" ? "text-primary" : "text-muted-foreground"
            )}
          />
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
        <p className="text-xs text-muted-foreground">
          Nous vous enverrons un lien pour réinitialiser votre mot de passe
        </p>
      </div>

      <Button type="submit" className="w-full h-11 font-medium group" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Envoi en cours...
          </>
        ) : (
          <>
            Envoyer le lien
            <Send className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </>
        )}
      </Button>

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-xs text-blue-900 dark:text-blue-100 leading-relaxed">
          <span className="font-medium">Note :</span> Si vous ne recevez pas d'email dans les 5 minutes,
          vérifiez votre dossier spam ou contactez le support.
        </p>
      </div>
    </form>
  )
}
