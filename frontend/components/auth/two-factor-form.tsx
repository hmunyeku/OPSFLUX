"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, ArrowLeft } from "lucide-react"
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
    if (value && !/^\d+$/.test(value)) return

    const newCode = [...code]
    newCode[index] = value.slice(-1)
    setCode(newCode)

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
      setError(err instanceof Error ? err.message : "Code de verification invalide")
      setCode(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const isCodeComplete = code.every(digit => digit !== "")

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-1 duration-200">
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <Label className="text-sm font-medium text-center block">
          Code de verification
        </Label>

        <div className="flex justify-center gap-2" onPaste={handlePaste}>
          {code.map((digit, index) => (
            <Input
              key={index}
              ref={(el) => { inputRefs.current[index] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className={cn(
                "w-11 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-semibold transition-all",
                digit && "border-primary ring-2 ring-primary/20"
              )}
              disabled={isLoading}
              autoComplete="off"
            />
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Entrez le code genere par votre application d'authentification
        </p>
      </div>

      <div className="space-y-3">
        <Button
          type="submit"
          className="w-full h-11 font-medium"
          disabled={isLoading || !isCodeComplete}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verification...
            </>
          ) : (
            "Verifier"
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full h-11 text-muted-foreground"
          onClick={onBack}
          disabled={isLoading}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour
        </Button>
      </div>
    </form>
  )
}
