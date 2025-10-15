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
import { deletePermission } from "../data/permissions-api"
import { Permission } from "../data/schema"

interface DeletePermissionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  permission: Permission
  onSuccess: () => void
}

export function DeletePermissionDialog({
  open,
  onOpenChange,
  permission,
  onSuccess,
}: DeletePermissionDialogProps) {
  const [isLoading, setIsLoading] = useState(false)

  async function handleDelete() {
    try {
      setIsLoading(true)
      await deletePermission(permission.id)

      toast({
        title: "Permission supprimée",
        description: `La permission "${permission.name}" a été supprimée avec succès.`,
      })

      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast({
        title: "Erreur",
        description:
          error instanceof Error
            ? error.message
            : "Une erreur est survenue lors de la suppression de la permission.",
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
              Cette action est irréversible. La permission{" "}
              <span className="font-semibold">{permission.name}</span> sera
              définitivement supprimée.
            </p>
            {permission.is_default && (
              <p className="text-destructive font-semibold">
                Attention : Cette permission est une permission par défaut. Sa
                suppression peut affecter le fonctionnement de
                l&apos;application.
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
