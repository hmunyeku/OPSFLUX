"use client"

import { useEffect, useState } from 'react'
import { themes, type ThemeName, defaultTheme } from '@/config/themes'

const THEME_STORAGE_KEY = 'app-theme'

export function useThemeColors() {
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(defaultTheme)

  useEffect(() => {
    // Load theme from localStorage on mount
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as ThemeName
    if (savedTheme && themes[savedTheme]) {
      setCurrentTheme(savedTheme)
    }
  }, [])

  useEffect(() => {
    // Apply theme colors to CSS variables
    const applyTheme = (themeName: ThemeName) => {
      const theme = themes[themeName]
      const isDark = document.documentElement.classList.contains('dark')
      const colors = isDark ? theme.dark : theme.light

      const root = document.documentElement
      Object.entries(colors).forEach(([key, value]) => {
        root.style.setProperty(`--${key}`, value)
      })
    }

    applyTheme(currentTheme)

    // Listen for dark mode changes
    const observer = new MutationObserver(() => {
      applyTheme(currentTheme)
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [currentTheme])

  const changeTheme = (theme: ThemeName) => {
    setCurrentTheme(theme)
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }

  return {
    currentTheme,
    changeTheme,
    themes,
  }
}
