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
import { Globe, Check } from "lucide-react"
import { usePreferencesContext } from "@/contexts/preferences-context"
import { cn } from "@/lib/utils"

interface Language {
  code: string
  name: string
  flag: string
}

const languages: Language[] = [
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "en", name: "English", flag: "🇬🇧" },
]

export function LanguageSwitcher() {
  const { preferences, updatePreferences } = usePreferencesContext()
  const [open, setOpen] = useState(false)

  const handleLanguageChange = (code: string) => {
    updatePreferences({ language: code as "fr" | "en" })
    setOpen(false)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="Changer la langue">
          <Globe className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Langue</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {languages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => handleLanguageChange(language.code)}
            className={cn(
              "cursor-pointer",
              preferences.language === language.code && "bg-accent"
            )}
          >
            <span className="mr-2 text-lg">{language.flag}</span>
            <span className="flex-1">{language.name}</span>
            {preferences.language === language.code && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
