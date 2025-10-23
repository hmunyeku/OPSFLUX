"use client"

import { Button } from "@/components/ui/button"
import {
  IconDeviceFloppy,
  IconX,
  IconPlus,
  IconAlertCircle,
} from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"

interface EditToolbarProps {
  hasUnsavedChanges: boolean
  isSaving: boolean
  onSave: () => void
  onCancel: () => void
  onAddWidget?: () => void
}

export default function EditToolbar({
  hasUnsavedChanges,
  isSaving,
  onSave,
  onCancel,
  onAddWidget,
}: EditToolbarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-sm font-medium">Mode Édition</span>
          </div>

          {hasUnsavedChanges && (
            <Badge variant="secondary" className="gap-1.5">
              <IconAlertCircle className="h-3 w-3" />
              Modifications non sauvegardées
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onAddWidget && (
            <Button variant="outline" onClick={onAddWidget}>
              <IconPlus className="h-4 w-4 mr-2" />
              Ajouter un widget
            </Button>
          )}
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            <IconX className="h-4 w-4 mr-2" />
            Annuler
          </Button>
          <Button
            onClick={onSave}
            disabled={isSaving || !hasUnsavedChanges}
          >
            <IconDeviceFloppy className="h-4 w-4 mr-2" />
            {isSaving ? "Sauvegarde..." : "Sauvegarder"}
          </Button>
        </div>
      </div>
    </div>
  )
}
