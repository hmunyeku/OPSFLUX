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
import { deleteRole } from "../data/roles-api"
import { Role } from "../data/schema"

interface DeleteRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: Role
  onSuccess: () => void
}

export function DeleteRoleDialog({
  open,
  onOpenChange,
  role,
  onSuccess,
}: DeleteRoleDialogProps) {
  const [isLoading, setIsLoading] = useState(false)

  async function handleDelete() {
    try {
      setIsLoading(true)
      await deleteRole(role.id)

      toast({
        title: "Rôle supprimé",
        description: `Le rôle "${role.name}" a été supprimé avec succès.`,
      })

      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast({
        title: "Erreur",
        description:
          error instanceof Error
            ? error.message
            : "Une erreur est survenue lors de la suppression du rôle.",
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
              Cette action est irréversible. Le rôle{" "}
              <span className="font-semibold">{role.name}</span> sera
              définitivement supprimé.
            </p>
            {role.is_system && (
              <p className="text-destructive font-semibold">
                Attention : Ce rôle est un rôle système. Sa suppression peut
                affecter le fonctionnement de l&apos;application.
              </p>
            )}
            {role.permissions && role.permissions.length > 0 && (
              <p className="text-muted-foreground">
                Ce rôle possède actuellement {role.permissions.length}{" "}
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
