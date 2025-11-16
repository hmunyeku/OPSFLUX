"use client"

import type * as React from "react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface ContextualSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function ContextualSheet({ open, onOpenChange, children }: ContextualSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:w-[500px] sm:max-w-[500px] p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Formulaire</SheetTitle>
          <SheetDescription>Remplissez les informations ci-dessous</SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-180px)] px-6 py-4">{children}</ScrollArea>

        <SheetFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button>Enregistrer</Button>
          <Button variant="secondary">Enregistrer & Nouveau</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
