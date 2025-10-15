/**
 * Tag "Modifié" avec countdown et bouton annuler
 */

import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface ModifiedTagProps {
  /**
   * Indique si le tag est visible
   */
  show: boolean

  /**
   * Temps restant en secondes
   */
  timeRemaining: number

  /**
   * Callback appelé quand l'utilisateur clique sur la croix
   */
  onCancel: () => void

  /**
   * Indique si une sauvegarde est en cours
   */
  isSaving?: boolean
}

export function ModifiedTag({
  show,
  timeRemaining: _timeRemaining,
  onCancel,
  isSaving = false,
}: ModifiedTagProps) {
  if (!show && !isSaving) return null

  return (
    <Badge
      variant={isSaving ? "secondary" : "default"}
      className="flex items-center gap-1 px-2 py-0.5"
    >
      {isSaving ? (
        <>
          <span className="inline-block h-2 w-2 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
          <span className="text-xs">Enregistrement...</span>
        </>
      ) : (
        <>
          <span className="text-xs">Modifié</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-3 w-3 p-0 hover:bg-transparent"
            onClick={onCancel}
          >
            <X className="h-2.5 w-2.5" />
            <span className="sr-only">Annuler</span>
          </Button>
        </>
      )}
    </Badge>
  )
}
