"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { Permission } from "../../permissions/data/schema"
import { getPermissions } from "../../permissions/data/permissions-api"
import { updateGroup } from "../data/groups-api"

interface ManagePermissionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  groupName: string
  currentPermissions: Permission[]
  onSuccess: () => void
}

export function ManagePermissionsDialog({
  open,
  onOpenChange,
  groupId,
  groupName,
  currentPermissions,
  onSuccess,
}: ManagePermissionsDialogProps) {
  const [allPermissions, setAllPermissions] = useState<Permission[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (open) {
      loadPermissions()
      setSelectedIds(new Set(currentPermissions.map((p) => p.id)))
    }
  }, [open, currentPermissions])

  const loadPermissions = async () => {
    try {
      setIsLoading(true)
      const perms = await getPermissions()
      setAllPermissions(perms)
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de charger les permissions",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const togglePermission = (permissionId: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(permissionId)) {
        newSet.delete(permissionId)
      } else {
        newSet.add(permissionId)
      }
      return newSet
    })
  }

  const toggleAllInModule = (modulePerms: Permission[]) => {
    const moduleIds = modulePerms.map((p) => p.id)
    const allSelected = moduleIds.every((id) => selectedIds.has(id))

    setSelectedIds((prev) => {
      const newSet = new Set(prev)
      if (allSelected) {
        moduleIds.forEach((id) => newSet.delete(id))
      } else {
        moduleIds.forEach((id) => newSet.add(id))
      }
      return newSet
    })
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      await updateGroup(groupId, {
        permission_ids: Array.from(selectedIds),
      })

      toast({
        title: "Permissions mises à jour",
        description: `${selectedIds.size} permissions assignées au groupe "${groupName}".`,
      })

      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast({
        title: "Erreur",
        description:
          error instanceof Error
            ? error.message
            : "Une erreur est survenue lors de la mise à jour.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Filter and group permissions
  const filteredPermissions = allPermissions.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.module.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const groupedPermissions = filteredPermissions.reduce((acc, perm) => {
    if (!acc[perm.module]) {
      acc[perm.module] = []
    }
    acc[perm.module].push(perm)
    return acc
  }, {} as Record<string, Permission[]>)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Gérer les permissions - {groupName}</DialogTitle>
          <DialogDescription>
            Sélectionnez les permissions à assigner à ce groupe
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Rechercher une permission..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Chargement des permissions...
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-6">
                {Object.entries(groupedPermissions).map(([module, perms]) => {
                  const moduleSelectedCount = perms.filter((p) =>
                    selectedIds.has(p.id)
                  ).length
                  const allModuleSelected = perms.every((p) =>
                    selectedIds.has(p.id)
                  )

                  return (
                    <div key={module} className="space-y-3">
                      <div className="flex items-center justify-between sticky top-0 bg-background pb-2 border-b">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={allModuleSelected}
                            onCheckedChange={() => toggleAllInModule(perms)}
                          />
                          <h3 className="font-semibold capitalize text-sm">
                            {module}
                          </h3>
                          <Badge variant="secondary" className="text-xs">
                            {moduleSelectedCount}/{perms.length}
                          </Badge>
                        </div>
                      </div>

                      <div className="space-y-2 pl-6">
                        {perms.map((permission) => (
                          <div
                            key={permission.id}
                            className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
                          >
                            <Checkbox
                              checked={selectedIds.has(permission.id)}
                              onCheckedChange={() =>
                                togglePermission(permission.id)
                              }
                              className="mt-1"
                            />
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">
                                  {permission.name}
                                </p>
                                {permission.is_default && (
                                  <Badge
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    Par défaut
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground font-mono">
                                {permission.code}
                              </p>
                              {permission.description && (
                                <p className="text-xs text-muted-foreground">
                                  {permission.description}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <p className="text-sm text-muted-foreground">
              {selectedIds.size} permission(s) sélectionnée(s)
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Annuler
              </Button>
              <Button onClick={handleSave} disabled={isSaving || isLoading}>
                {isSaving ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
