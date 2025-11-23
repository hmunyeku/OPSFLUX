"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Header } from "./header"
import { AppSidebar } from "./app-sidebar"
import { BottomBar } from "./bottom-bar"
import { ContextualSheet } from "./contextual-sheet"
import { useKeyboardShortcuts } from "@/lib/keyboard-shortcuts"
import { useSidebar } from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth-context"
import { useUIPreferences } from "@/lib/ui-preferences-context"
import { NavigationProgress } from "./navigation-progress"

interface AppShellProps {
  children: React.ReactNode
}

function AppShellContent({ children }: AppShellProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [sheetContent, setSheetContent] = React.useState<React.ReactNode>(null)
  const { toggleSidebar, open, setOpen } = useSidebar()
  const { user, isLoading } = useAuth()
  const { preferences, setSidebarCollapsed } = useUIPreferences()
  const pathname = usePathname()

  // Sync sidebar state with preferences on mount
  React.useEffect(() => {
    if (!preferences.sidebarCollapsed && !open) {
      setOpen(true)
    } else if (preferences.sidebarCollapsed && open) {
      setOpen(false)
    }
  }, []) // Only run on mount

  // Sync sidebar state changes to preferences
  React.useEffect(() => {
    const shouldBeCollapsed = !open
    if (shouldBeCollapsed !== preferences.sidebarCollapsed) {
      setSidebarCollapsed(shouldBeCollapsed)
    }
  }, [open])

  const openSheet = React.useCallback((content: React.ReactNode) => {
    setSheetContent(content)
    setSheetOpen(true)
  }, [])

  const closeSheet = React.useCallback(() => {
    setSheetOpen(false)
  }, [])

  const cleanup = useKeyboardShortcuts({
    search: () => {
      const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement
      searchInput?.focus()
    },
    home: () => {
      window.location.href = "/"
    },
    toggleSidebar: () => {
      toggleSidebar()
    },
    newItem: () => {
      console.log("[v0] New item shortcut triggered")
    },
    toggleView: () => {
      const event = new CustomEvent("toggleView")
      window.dispatchEvent(event)
    },
    refresh: () => {
      const event = new CustomEvent("refresh")
      window.dispatchEvent(event)
    },
    escape: () => {
      if (sheetOpen) {
        closeSheet()
      }
    },
  })

  React.useEffect(() => {
    return cleanup
  }, [cleanup])

  if (pathname === "/login") {
    return <>{children}</>
  }

  // DEBUG: Temporairement désactivé pour voir l'application
  // if (isLoading) {
  //   return (
  //     <div className="flex h-screen w-full items-center justify-center bg-background">
  //       <div className="flex flex-col items-center gap-2">
  //         <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  //         <p className="text-sm text-muted-foreground">Chargement...</p>
  //       </div>
  //     </div>
  //   )
  // }

  // DEBUG: Temporairement désactivé pour voir l'application
  // if (!user) {
  //   return null
  // }

  return (
    <div className="flex h-screen w-full flex-col bg-background overflow-hidden">
      <Header onOpenSheet={openSheet} />
      <NavigationProgress />

      {/* Main content area with sidebar */}
      <div className="flex flex-1 min-h-0">
        <AppSidebar />

        <SidebarInset className="flex flex-1 flex-col min-h-0 max-w-full overflow-hidden">
          {/* Content */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-[var(--bg-subtle)] scrollbar-thin pb-10">
            {children}
          </main>
        </SidebarInset>
      </div>

      {/* BottomBar - Full width at bottom */}
      <BottomBar />

      <ContextualSheet open={sheetOpen} onOpenChange={setSheetOpen}>
        {sheetContent}
      </ContextualSheet>
    </div>
  )
}

function AppShellWrapper({ children }: AppShellProps) {
  const { preferences, isLoading } = useUIPreferences()

  // Use the saved preference for sidebar state
  const defaultOpen = !preferences.sidebarCollapsed

  // DEBUG: Temporairement désactivé pour voir l'application
  // if (isLoading) {
  //   return (
  //     <div className="flex h-screen w-full items-center justify-center bg-background">
  //       <div className="flex flex-col items-center gap-2">
  //         <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  //         <p className="text-sm text-muted-foreground">Chargement des préférences...</p>
  //       </div>
  //     </div>
  //   )
  // }

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppShellContent>{children}</AppShellContent>
    </SidebarProvider>
  )
}

export function AppShell({ children }: AppShellProps) {
  return <AppShellWrapper>{children}</AppShellWrapper>
}
