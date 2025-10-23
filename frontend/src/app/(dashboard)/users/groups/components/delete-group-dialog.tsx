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
import { useTranslation } from "@/hooks/use-translation"
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
  const { t } = useTranslation("core.groups")
  const [isLoading, setIsLoading] = useState(false)

  async function handleDelete() {
    try {
      setIsLoading(true)
      await deleteGroup(group.id)

      toast({
        title: t("toast.group_deleted", "Groupe supprimé"),
        description: t("toast.group_deleted_desc", `Le groupe "${group.name}" a été supprimé avec succès.`),
      })

      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast({
        title: t("toast.error", "Erreur"),
        description:
          error instanceof Error
            ? error.message
            : t("toast.delete_error", "Une erreur est survenue lors de la suppression du groupe."),
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
          <AlertDialogTitle>{t("dialog.delete_title", "Êtes-vous sûr ?")}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              {t("dialog.delete_warning", "Cette action est irréversible. Le groupe")}{" "}
              <span className="font-semibold">{group.name}</span>{" "}
              {t("dialog.delete_warning_2", "sera définitivement supprimé.")}
            </p>
            {group.permissions && group.permissions.length > 0 && (
              <p className="text-muted-foreground">
                {t("dialog.delete_permissions_warning", `Ce groupe possède actuellement ${group.permissions.length} permission(s) qui seront également retirées.`)}
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>{t("action.cancel", "Annuler")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? t("action.deleting", "Suppression...") : t("action.delete", "Supprimer")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
