"use client"

import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "@/hooks/use-toast"
import { deleteGroup } from "../data/groups-api"
import { Group } from "../data/schema"

interface DeleteGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: Group
  onSuccess: () => void
}

export function DeleteGroupDialog({
  open,
  onOpenChange,
  group,
  onSuccess,
}: DeleteGroupDialogProps) {
  const [isLoading, setIsLoading] = useState(false)

  async function handleDelete() {
    try {
      setIsLoading(true)
      await deleteGroup(group.id)

      toast({
        title: "Groupe supprimé",
        description: `Le groupe "${group.name}" a été supprimé avec succès.`,
      })

      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast({
        title: "Erreur",
        description:
          error instanceof Error
            ? error.message
            : "Une erreur est survenue lors de la suppression du groupe.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Êtes-vous sûr ?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Cette action est irréversible. Le groupe{" "}
              <span className="font-semibold">{group.name}</span> sera
              définitivement supprimé.
            </p>
            {group.permissions && group.permissions.length > 0 && (
              <p className="text-muted-foreground">
                Ce groupe possède actuellement {group.permissions.length}{" "}
                permission(s) qui seront également retirées.
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? "Suppression..." : "Supprimer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
