"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "@/hooks/use-toast"
import { assignGroupsToUser } from "../data/users-api"
import { getGroups } from "../groups/data/groups-api"
import { Group } from "../groups/data/schema"
import { ScrollArea } from "@/components/ui/scroll-area"

interface AssignGroupsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userEmail: string
  currentGroups: Group[]
  onSuccess: () => void
}

export function AssignGroupsDialog({
  open,
  onOpenChange,
  userId,
  userEmail,
  currentGroups,
  onSuccess,
}: AssignGroupsDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [allGroups, setAllGroups] = useState<Group[]>([])
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      loadGroups()
      setSelectedGroupIds(currentGroups.map((g) => g.id))
    }
  }, [open, currentGroups])

  async function loadGroups() {
    try {
      const groups = await getGroups(false)
      setAllGroups(groups)
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les groupes.",
        variant: "destructive",
      })
    }
  }

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    )
  }

  async function handleSave() {
    try {
      setIsLoading(true)
      await assignGroupsToUser(userId, selectedGroupIds)

      toast({
        title: "Groupes mis à jour",
        description: `Les groupes de ${userEmail} ont été mis à jour avec succès.`,
      })

      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast({
        title: "Erreur",
        description:
          error instanceof Error
            ? error.message
            : "Une erreur est survenue lors de l'assignation des groupes.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Assigner des groupes</DialogTitle>
          <DialogDescription>
            Gérer les groupes de {userEmail}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-2">
            {allGroups.map((group) => (
              <div
                key={group.id}
                className="flex items-start space-x-3 rounded-lg border p-3"
              >
                <Checkbox
                  id={`group-${group.id}`}
                  checked={selectedGroupIds.includes(group.id)}
                  onCheckedChange={() => toggleGroup(group.id)}
                />
                <div className="flex-1 space-y-1">
                  <label
                    htmlFor={`group-${group.id}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {group.name}
                    {group.parent && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({group.parent.name})
                      </span>
                    )}
                  </label>
                  {group.description && (
                    <p className="text-sm text-muted-foreground">
                      {group.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
