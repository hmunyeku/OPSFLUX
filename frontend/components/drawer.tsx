"use client"

import * as React from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface DrawerProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

export function Drawer({ open, onClose, children }: DrawerProps) {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose()
      }
    }

    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [open, onClose])

  return (
    <>
      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm animate-in fade-in-0" onClick={onClose} />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-full sm:w-[500px] bg-card border-r shadow-lg transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold">Formulaire</h2>
              <p className="text-sm text-muted-foreground">Remplissez les informations ci-dessous</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1 px-6 py-4">{children}</ScrollArea>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button>Enregistrer</Button>
            <Button variant="secondary">Enregistrer & Nouveau</Button>
          </div>
        </div>
      </div>
    </>
  )
}
