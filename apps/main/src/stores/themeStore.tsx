/**
 * Theme store — light/dark/system with persistence.
 */
import React, { useEffect } from 'react'
import { create } from 'zustand'

type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'light' | 'dark'
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (localStorage.getItem('theme') as Theme) || 'system',
  resolvedTheme: 'light',

  setTheme: (theme: Theme) => {
    localStorage.setItem('theme', theme)
    set({ theme })
    applyTheme(theme)
  },
}))

function applyTheme(theme: Theme) {
  const root = document.documentElement
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  root.classList.toggle('dark', isDark)
  useThemeStore.setState({ resolvedTheme: isDark ? 'dark' : 'light' })
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeStore()

  useEffect(() => {
    applyTheme(theme)

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (useThemeStore.getState().theme === 'system') {
        applyTheme('system')
      }
    }
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [theme])

  return <>{children}</>
}
