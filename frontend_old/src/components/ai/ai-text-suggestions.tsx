/**
 * Composant qui ajoute des suggestions IA à un champ de texte
 */

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Sparkles } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useAI } from "@/hooks/use-ai"
import { cn } from "@/lib/utils"

interface AITextSuggestionsProps {
  text: string
  fieldType?: "email_subject" | "task_description" | "task_title" | "comment" | "general"
  onSelectSuggestion: (suggestion: string) => void
  className?: string
}

export function AITextSuggestions({
  text,
  fieldType = "general",
  onSelectSuggestion,
  className,
}: AITextSuggestionsProps) {
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const ai = useAI()

  async function loadSuggestions() {
    if (!text.trim()) return

    const results = await ai.suggestCompletion(text, fieldType, 3)
    if (results) {
      setSuggestions(results)
    }
  }

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen)
    if (isOpen && suggestions.length === 0) {
      loadSuggestions()
    }
  }

  function handleSelect(suggestion: string) {
    onSelectSuggestion(suggestion)
    setOpen(false)
    setSuggestions([])
  }

  if (!text.trim()) return null

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-8 gap-2", className)}
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">Suggestions IA</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="space-y-2">
          <p className="text-sm font-medium">Suggestions</p>

          {ai.loading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : ai.error ? (
            <p className="text-sm text-destructive">{ai.error}</p>
          ) : suggestions.length > 0 ? (
            <div className="space-y-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleSelect(suggestion)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-accent hover:border-primary transition-colors text-sm"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucune suggestion disponible
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
