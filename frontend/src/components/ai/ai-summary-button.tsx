/**
 * Bouton pour résumer automatiquement un texte long
 */

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { FileText, Copy, Check } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useAI } from "@/hooks/use-ai"
import { cn } from "@/lib/utils"

interface AISummaryButtonProps {
  text: string
  maxLength?: number
  onSummaryGenerated?: (summary: string) => void
  variant?: "default" | "outline" | "ghost"
  className?: string
}

export function AISummaryButton({
  text,
  maxLength = 100,
  onSummaryGenerated,
  variant = "outline",
  className,
}: AISummaryButtonProps) {
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState("")
  const [copied, setCopied] = useState(false)
  const ai = useAI()

  async function generateSummary() {
    const result = await ai.summarize(text, maxLength)
    if (result) {
      setSummary(result)
      if (onSummaryGenerated) {
        onSummaryGenerated(result)
      }
    }
  }

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen)
    if (isOpen && !summary) {
      generateSummary()
    }
  }

  async function copySummary() {
    await navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!text.trim() || text.length < 100) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size="sm"
          className={cn("gap-2", className)}
        >
          <FileText className="h-4 w-4" />
          Résumer avec IA
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Résumé automatique</DialogTitle>
          <DialogDescription>
            Résumé généré par intelligence artificielle
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {ai.loading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          ) : ai.error ? (
            <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
              {ai.error}
            </div>
          ) : summary ? (
            <>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm leading-relaxed">{summary}</p>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copySummary}
                  className="gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copié
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copier
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={generateSummary}
                >
                  Régénérer
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucun résumé disponible
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
