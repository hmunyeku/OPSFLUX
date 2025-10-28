/**
 * App Shell - Architecture 5 zones
 * Conforme FRONTEND_RULES.md
 *
 * Zone 1: Header (navigation principale, recherche, actions utilisateur)
 * Zone 2: Sidebar (navigation secondaire, menu contextuel)
 * Zone 3: Drawer (panneau contextuel optionnel)
 * Zone 4: Main (contenu principal de la page)
 * Zone 5: Footer (optionnel - informations secondaires)
 */

"use client"

import { cn } from "@/lib/utils"

interface AppShellProps {
  header?: React.ReactNode
  sidebar?: React.ReactNode
  drawer?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function AppShell({
  header,
  sidebar,
  drawer,
  footer,
  children,
  className,
}: AppShellProps) {
  return (
    <div className={cn("flex min-h-screen flex-col", className)}>
      {/* Zone 1: Header */}
      {header && (
        <header className="sticky top-0 z-50 w-full border-b bg-background">
          {header}
        </header>
      )}

      {/* Conteneur principal avec Sidebar + Drawer + Main */}
      <div className="flex flex-1">
        {/* Zone 2: Sidebar */}
        {sidebar && (
          <aside className="w-64 border-r bg-background hidden lg:block">
            {sidebar}
          </aside>
        )}

        {/* Zone 4: Main Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>

        {/* Zone 3: Drawer (contextuel) */}
        {drawer && (
          <aside className="w-80 border-l bg-background hidden xl:block">
            {drawer}
          </aside>
        )}
      </div>

      {/* Zone 5: Footer (optionnel) */}
      {footer && (
        <footer className="border-t bg-background">
          {footer}
        </footer>
      )}
    </div>
  )
}
