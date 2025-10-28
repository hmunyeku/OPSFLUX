"use client"

import { useEffect } from "react"
import { useThemeColors } from "@/hooks/use-theme-colors"
import { usePreferencesContext } from "@/contexts/preferences-context"
import { useTheme } from "next-themes"

export function ThemeColorInitializer() {
  const { currentTheme, changeTheme } = useThemeColors()
  const { preferences, isLoaded } = usePreferencesContext()
  const { setTheme } = useTheme()

  useEffect(() => {
    if (isLoaded && preferences.colorTheme && preferences.colorTheme !== currentTheme) {
      changeTheme(preferences.colorTheme)
    }
  }, [isLoaded, preferences.colorTheme, currentTheme, changeTheme])

  useEffect(() => {
    if (isLoaded && preferences.darkMode) {
      setTheme(preferences.darkMode)
    }
  }, [isLoaded, preferences.darkMode, setTheme])

  return null
}
