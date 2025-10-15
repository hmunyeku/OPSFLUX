"use client"

import { useState } from "react"
import { IconAlertTriangle } from "@tabler/icons-react"
import { toast } from "@/hooks/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { User } from "../data/schema"
import { toggleUserActive } from "../data/users-api"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: User
  onUserUpdated?: () => void
}

export function UsersDeactivateDialog({
  open,
  onOpenChange,
  currentRow,
  onUserUpdated,
}: Props) {
  const [value, setValue] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleDeactivate = async () => {
    if (value.trim() !== currentRow.email) return

    try {
      setIsSubmitting(true)
      await toggleUserActive(currentRow.id, false)

      onOpenChange(false)
      toast({
        title: "Utilisateur désactivé",
        description: `Le compte ${currentRow.email} a été désactivé avec succès.`,
      })
      onUserUpdated?.()
      setValue("")
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de désactiver l'utilisateur",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={handleDeactivate}
      disabled={value.trim() !== currentRow.email || isSubmitting}
      title={
        <span className="text-destructive">
          <IconAlertTriangle
            className="stroke-destructive mr-1 inline-block"
            size={18}
          />{" "}
          Désactiver
        </span>
      }
      desc={
        <div className="space-y-4">
          <p className="mb-2">
            Êtes-vous sûr de vouloir désactiver le compte avec l&apos;email{" "}
            <span className="font-bold">{currentRow.email}</span>?
            <br />
            Cette action va désactiver l&apos;utilisateur avec le rôle{" "}
            <span className="font-bold">
              {currentRow.role.toUpperCase()}
            </span>{" "}
            du système. Procédez avec prudence.
          </p>

          <Label className="my-2">
            Email:
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Entrez l'email pour confirmer la désactivation."
              disabled={isSubmitting}
            />
          </Label>

          <Alert variant="destructive">
            <AlertTitle>Attention!</AlertTitle>
            <AlertDescription>
              Soyez prudent, cette opération ne peut pas être annulée.
            </AlertDescription>
          </Alert>
        </div>
      }
      confirmText={isSubmitting ? "Désactivation..." : "Désactiver"}
      destructive
    />
  )
}
