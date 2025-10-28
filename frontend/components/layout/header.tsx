/**
 * Header - Zone 1 de l'App Shell
 * Navigation principale, recherche, actions utilisateur
 * Conforme FRONTEND_RULES.md
 */

"use client"

import { cn } from "@/lib/utils"

interface HeaderProps {
  children?: React.ReactNode
  className?: string
}

export function Header({ children, className }: HeaderProps) {
  return (
    <div
      className={cn(
        "flex h-16 items-center gap-4 px-4 md:px-6",
        className
      )}
    >
      {children || (
        <>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">OpsFlux</h1>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {/* Actions utilisateur */}
          </div>
        </>
      )}
    </div>
  )
}
