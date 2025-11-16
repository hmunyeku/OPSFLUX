"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Moon, Sun, Monitor } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useUIPreferences, type Theme } from "@/lib/ui-preferences-context"

/**
 * Simple switch toggle between light and dark
 * Persists to backend via UI preferences
 */
export function ThemeToggle() {
  const { theme, setTheme: setNextTheme } = useTheme()
  const { setTheme: setPreferenceTheme } = useUIPreferences()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const handleThemeChange = React.useCallback(
    async (checked: boolean) => {
      const newTheme = checked ? "dark" : "light"
      setNextTheme(newTheme)
      await setPreferenceTheme(newTheme as Theme)
    },
    [setNextTheme, setPreferenceTheme]
  )

  if (!mounted) {
    return <Switch disabled />
  }

  return <Switch checked={theme === "dark"} onCheckedChange={handleThemeChange} />
}

/**
 * Dropdown menu with light, dark, and system options
 * Persists to backend via UI preferences
 */
export function ThemeToggleDropdown() {
  const { theme, setTheme: setNextTheme } = useTheme()
  const { setTheme: setPreferenceTheme } = useUIPreferences()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const handleThemeChange = React.useCallback(
    async (newTheme: Theme) => {
      setNextTheme(newTheme)
      await setPreferenceTheme(newTheme)
    },
    [setNextTheme, setPreferenceTheme]
  )

  if (!mounted) {
    return (
      <Button variant="outline" size="icon" disabled>
        <Sun className="h-[1.2rem] w-[1.2rem]" />
      </Button>
    )
  }

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Icon className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Changer le thème</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Thème</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleThemeChange("light")}>
          <Sun className="mr-2 h-4 w-4" />
          <span>Clair</span>
          {theme === "light" && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          <span>Sombre</span>
          {theme === "dark" && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("system")}>
          <Monitor className="mr-2 h-4 w-4" />
          <span>Système</span>
          {theme === "system" && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
