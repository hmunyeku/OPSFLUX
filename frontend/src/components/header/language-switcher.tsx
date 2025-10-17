"use client"

import { useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Globe, Check, Loader2 } from "lucide-react"
import { useLanguageContext } from "@/contexts/language-context"
import { cn } from "@/lib/utils"

export function LanguageSwitcher() {
  const { languages, currentLanguage, changeLanguage, isLoading } = useLanguageContext()
  const [open, setOpen] = useState(false)
  const [changing, setChanging] = useState(false)

  const handleLanguageChange = async (languageId: string) => {
    console.log("🌍 Changing language to:", languageId)
    if (changing || currentLanguage?.id === languageId) {
      console.log("⏭️ Skip language change (already changing or same language)")
      return
    }

    setChanging(true)
    try {
      console.log("🔄 Calling changeLanguage...")
      await changeLanguage(languageId)
      console.log("✅ Language changed successfully")
      setOpen(false)
    } catch (error) {
      console.error("❌ Error changing language:", error)
    } finally {
      setChanging(false)
    }
  }

  if (isLoading) {
    return (
      <Button variant="ghost" size="icon" disabled title="Chargement des langues...">
        <Loader2 className="h-5 w-5 animate-spin" />
      </Button>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="Changer la langue" disabled={changing}>
          {changing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : currentLanguage?.flag_emoji ? (
            <span className="text-lg">{currentLanguage.flag_emoji}</span>
          ) : (
            <Globe className="h-5 w-5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Langue / Language</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {languages.length === 0 ? (
          <DropdownMenuItem disabled>Aucune langue disponible</DropdownMenuItem>
        ) : (
          languages
            .sort((a, b) => a.display_order - b.display_order)
            .map((language) => (
              <DropdownMenuItem
                key={language.id}
                onClick={() => handleLanguageChange(language.id)}
                disabled={changing}
                className={cn(
                  "cursor-pointer",
                  currentLanguage?.id === language.id && "bg-accent"
                )}
              >
                {language.flag_emoji && (
                  <span className="mr-2 text-lg">{language.flag_emoji}</span>
                )}
                <span className="flex-1">{language.native_name}</span>
                {currentLanguage?.id === language.id && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </DropdownMenuItem>
            ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
