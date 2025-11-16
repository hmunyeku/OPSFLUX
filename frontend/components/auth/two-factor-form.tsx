"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Shield, AlertCircle, ArrowLeft, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface TwoFactorFormProps {
  onBack: () => void
}

export function TwoFactorForm({ onBack }: TwoFactorFormProps) {
  const { verifyTwoFactor } = useAuth()
  const [code, setCode] = useState(["", "", "", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const handleChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d+$/.test(value)) return

    const newCode = [...code]
    newCode[index] = value.slice(-1) // Only take the last character
    setCode(newCode)

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    const newCode = [...code]

    for (let i = 0; i < pastedData.length; i++) {
      newCode[i] = pastedData[i]
    }

    setCode(newCode)

    // Focus the next empty input or the last one
    const nextIndex = Math.min(pastedData.length, 5)
    inputRefs.current[nextIndex]?.focus()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const fullCode = code.join("")
    if (fullCode.length !== 6) return

    setError("")
    setIsLoading(true)

    try {
      await verifyTwoFactor(fullCode)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code de vérification invalide")
      setCode(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const isCodeComplete = code.every(digit => digit !== "")

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Icon & Description */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 ring-8 ring-primary/5">
          <Shield className="h-8 w-8 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
          Entrez le code de vérification à 6 chiffres généré par votre application d'authentification
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-1 duration-300">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <Label className="text-sm font-medium text-center block">
          Code de vérification
        </Label>

        {/* OTP Input */}
        <div className="flex justify-center gap-2" onPaste={handlePaste}>
          {code.map((digit, index) => (
            <Input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className={cn(
                "w-12 h-14 text-center text-2xl font-semibold transition-all",
                digit && "border-primary ring-2 ring-primary/20",
                !digit && "border-input"
              )}
              disabled={isLoading}
              autoComplete="off"
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Button
          type="submit"
          className="w-full h-11 font-medium group"
          disabled={isLoading || !isCodeComplete}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Vérification en cours...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />
              Vérifier le code
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="w-full h-11"
          onClick={onBack}
          disabled={isLoading}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour à la connexion
        </Button>
      </div>

      {/* Demo Info */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground font-medium">
            Mode démo
          </span>
        </div>
      </div>

      <div className="bg-muted/50 rounded-lg p-4 border border-border/50">
        <p className="text-xs text-center text-muted-foreground">
          Code de test :{" "}
          <code className="px-2 py-1 rounded bg-background border font-mono text-sm font-semibold text-foreground">
            123456
          </code>
        </p>
      </div>
    </form>
  )
}
