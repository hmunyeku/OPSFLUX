/**
 * Sidebar - Zone 2 de l'App Shell
 * Navigation secondaire, menu contextuel
 * Conforme FRONTEND_RULES.md
 */

"use client"

import { cn } from "@/lib/utils"

interface SidebarProps {
  children?: React.ReactNode
  className?: string
}

export function Sidebar({ children, className }: SidebarProps) {
  return (
    <div
      className={cn(
        "flex flex-col h-full",
        className
      )}
    >
      {children || (
        <>
          <div className="p-4 border-b">
            <h2 className="font-semibold">Navigation</h2>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {/* Menu items */}
          </div>
        </>
      )}
    </div>
  )
}
