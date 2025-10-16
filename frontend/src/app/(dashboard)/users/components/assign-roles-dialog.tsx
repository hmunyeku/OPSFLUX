"use client"

import { useEffect, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "@/hooks/use-toast"
import { assignRolesToUser } from "../data/users-api"
import { getRoles } from "../roles/data/roles-api"
import { Role } from "../roles/data/schema"
import { ScrollArea } from "@/components/ui/scroll-area"

interface AssignRolesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userEmail: string
  currentRoles: Role[]
  onSuccess: () => void
}

export function AssignRolesDialog({
  open,
  onOpenChange,
  userId,
  userEmail,
  currentRoles,
  onSuccess,
}: AssignRolesDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [allRoles, setAllRoles] = useState<Role[]>([])
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      loadRoles()
      setSelectedRoleIds(currentRoles.map((r) => r.id))
    }
  }, [open, currentRoles])

  async function loadRoles() {
    try {
      const roles = await getRoles(false)
      setAllRoles(roles)
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les rôles.",
        variant: "destructive",
      })
    }
  }

  function toggleRole(roleId: string) {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId]
    )
  }

  async function handleSave() {
    try {
      setIsLoading(true)
      await assignRolesToUser(userId, selectedRoleIds)

      toast({
        title: "Rôles mis à jour",
        description: `Les rôles de ${userEmail} ont été mis à jour avec succès.`,
      })

      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast({
        title: "Erreur",
        description:
          error instanceof Error
            ? error.message
            : "Une erreur est survenue lors de l'assignation des rôles.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Assigner des rôles</SheetTitle>
          <SheetDescription>
            Gérer les rôles de {userEmail}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="max-h-[400px] pr-4 mt-6">
          <div className="space-y-2">
            {allRoles.map((role) => (
              <div
                key={role.id}
                className="flex items-start space-x-3 rounded-lg border p-3"
              >
                <Checkbox
                  id={`role-${role.id}`}
                  checked={selectedRoleIds.includes(role.id)}
                  onCheckedChange={() => toggleRole(role.id)}
                  disabled={role.is_system}
                />
                <div className="flex-1 space-y-1">
                  <label
                    htmlFor={`role-${role.id}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {role.name}
                    {role.is_system && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (Système)
                      </span>
                    )}
                  </label>
                  {role.description && (
                    <p className="text-sm text-muted-foreground">
                      {role.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <SheetFooter className="mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
