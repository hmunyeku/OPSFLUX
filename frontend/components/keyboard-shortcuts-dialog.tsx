"use client"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { keyboardShortcuts } from "@/lib/keyboard-shortcuts"
import { Kbd } from "@/components/ui/kbd"

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const categories = {
    Navigation: ["search", "home", "toggleSidebar"],
    Actions: ["newItem", "save", "filters", "refresh"],
    Vues: ["toggleView", "darkMode"],
    Système: ["settings", "help"],
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[500px] sm:w-[600px]">
        <SheetHeader>
          <SheetTitle>Raccourcis Clavier</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-2 gap-6 mt-6">
          {Object.entries(categories).map(([category, shortcuts]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">{category}</h3>
              <div className="space-y-2">
                {shortcuts.map((shortcut) => {
                  const config = keyboardShortcuts[shortcut as keyof typeof keyboardShortcuts]
                  return (
                    <div key={shortcut} className="flex items-center justify-between">
                      <span className="text-sm">{config.description}</span>
                      <div className="flex items-center gap-1">
                        {config.ctrl && (
                          <>
                            <Kbd>Ctrl</Kbd>
                            <span className="text-muted-foreground">+</span>
                          </>
                        )}
                        <Kbd>{config.key.toUpperCase()}</Kbd>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Fermer un panneau ou modal</span>
            <Kbd>Esc</Kbd>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
