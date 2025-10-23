"use client"

import { useState, useEffect } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { useTranslation } from "@/hooks/use-translation"
import { Permission } from "../../permissions/data/schema"
import { getPermissions } from "../../permissions/data/permissions-api"
import { updateRole } from "../data/roles-api"

interface ManagePermissionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roleId: string
  roleName: string
  currentPermissions: Permission[]
  onSuccess: () => void
}

export function ManagePermissionsDialog({
  open,
  onOpenChange,
  roleId,
  roleName,
  currentPermissions,
  onSuccess,
}: ManagePermissionsDialogProps) {
  const { t } = useTranslation("core.roles")
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
      // Load ALL permissions including inactive ones and from all modules
      const perms = await getPermissions({
        includeInactive: true,
        onlyActiveModules: false
      })
      setAllPermissions(perms)
    } catch {
      toast({
        title: t("toast.error", "Erreur"),
        description: t("toast.load_permissions_error", "Impossible de charger les permissions"),
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
      await updateRole(roleId, {
        permission_ids: Array.from(selectedIds),
      })

      toast({
        title: t("toast.permissions_updated", "Permissions mises à jour"),
        description: `${selectedIds.size} permissions assignées au rôle "${roleName}".`,
      })

      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast({
        title: t("toast.error", "Erreur"),
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>Gérer les permissions - {roleName}</SheetTitle>
          <SheetDescription>
            Sélectionnez les permissions à assigner à ce rôle
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col overflow-hidden px-6 py-4">
          <Input
            placeholder="Rechercher une permission..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-4"
          />

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Chargement des permissions...
            </div>
          ) : (
            <ScrollArea className="flex-1 pr-4">
              <Accordion type="multiple" className="space-y-2">
                {Object.entries(groupedPermissions).map(([module, perms]) => {
                  const moduleSelectedCount = perms.filter((p) =>
                    selectedIds.has(p.id)
                  ).length
                  const allModuleSelected = perms.every((p) =>
                    selectedIds.has(p.id)
                  )

                  return (
                    <AccordionItem
                      key={module}
                      value={module}
                      className="border rounded-lg px-4"
                    >
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-3 flex-1">
                          <Checkbox
                            checked={allModuleSelected}
                            onCheckedChange={() => toggleAllInModule(perms)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <h3 className="font-semibold capitalize text-sm">
                            {module}
                          </h3>
                          <Badge variant="secondary" className="text-xs">
                            {moduleSelectedCount}/{perms.length}
                          </Badge>
                        </div>
                      </AccordionTrigger>

                      <AccordionContent className="pb-3">
                        <div className="space-y-2 pl-6 pt-2">
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
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            </ScrollArea>
          )}
        </div>

        <SheetFooter className="px-6 py-4 border-t mt-auto">
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
