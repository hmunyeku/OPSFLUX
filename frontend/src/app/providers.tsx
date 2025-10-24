"use client"

import { useEffect, useState } from "react"
import SearchProvider from "@/components/search-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/components/auth-provider"
import { ThemeColorInitializer } from "@/components/theme-color-initializer"
import { LanguageSync } from "@/components/language-sync"
import { FontSizeSync } from "@/components/font-size-sync"
import { DynamicTitle } from "@/components/dynamic-title"
import { PreferencesProvider } from "@/contexts/preferences-context"
import { NotificationsProvider } from "@/contexts/notifications-context"
import { AppConfigProvider } from "@/contexts/app-config-context"
import { LanguageProvider } from "@/contexts/language-context"
import { initializeModuleWidgets, startModuleWatcher } from "@/lib/module-loader"

interface Props {
  children: React.ReactNode
}

export function Providers({ children }: Props) {
  const [open, setOpen] = useState(false)

  // Initialize module widgets on mount and start hot reload watcher
  useEffect(() => {
    // Initialiser les widgets des modules
    initializeModuleWidgets()

    // Démarrer la surveillance des nouveaux modules (hot reload)
    // Vérifie toutes les 30 secondes si de nouveaux modules sont disponibles
    const watcherInterval = startModuleWatcher(30000)

    // Cleanup: arrêter le watcher quand le composant est démonté
    return () => {
      if (watcherInterval) {
        clearInterval(watcherInterval)
      }
    }
  }, [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <AppConfigProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <PreferencesProvider>
          <AuthProvider>
            <LanguageProvider>
              <NotificationsProvider>
                <ThemeColorInitializer />
                <LanguageSync />
                <FontSizeSync />
                <DynamicTitle />
                <SearchProvider value={{ open, setOpen }}>{children}</SearchProvider>
              </NotificationsProvider>
            </LanguageProvider>
          </AuthProvider>
        </PreferencesProvider>
      </ThemeProvider>
    </AppConfigProvider>
  )
}
