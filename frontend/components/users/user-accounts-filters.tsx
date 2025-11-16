"use client"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { roles, groups } from "@/lib/user-management-data"
import type { UserFilter } from "./user-accounts-content"

interface UserAccountsFiltersProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: UserFilter
  onFiltersChange: (filters: UserFilter) => void
}

export function UserAccountsFilters({ open, onOpenChange, filters, onFiltersChange }: UserAccountsFiltersProps) {
  const handleStatusChange = (status: string, checked: boolean) => {
    const currentStatus = filters.status || []
    const newStatus = checked ? [...currentStatus, status as any] : currentStatus.filter((s) => s !== status)
    onFiltersChange({ ...filters, status: newStatus.length > 0 ? newStatus : undefined })
  }

  const handleRoleChange = (roleId: string, checked: boolean) => {
    const currentRoles = filters.roles || []
    const newRoles = checked ? [...currentRoles, roleId] : currentRoles.filter((r) => r !== roleId)
    onFiltersChange({ ...filters, roles: newRoles.length > 0 ? newRoles : undefined })
  }

  const handleGroupChange = (groupId: string, checked: boolean) => {
    const currentGroups = filters.groups || []
    const newGroups = checked ? [...currentGroups, groupId] : currentGroups.filter((g) => g !== groupId)
    onFiltersChange({ ...filters, groups: newGroups.length > 0 ? newGroups : undefined })
  }

  const handleAccountTypeChange = (type: string, checked: boolean) => {
    const currentTypes = filters.accountType || []
    const newTypes = checked ? [...currentTypes, type] : currentTypes.filter((t) => t !== type)
    onFiltersChange({ ...filters, accountType: newTypes.length > 0 ? newTypes : undefined })
  }

  const handleReset = () => {
    onFiltersChange({})
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>Filtres avancés</SheetTitle>
          <SheetDescription>Filtrer les utilisateurs par statut, rôle, groupe et plus</SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-180px)] pr-4">
          <div className="space-y-6 py-6">
            {/* Status & Account */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Statut & Compte</h3>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="status-active"
                    checked={filters.status?.includes("active")}
                    onCheckedChange={(checked) => handleStatusChange("active", !!checked)}
                  />
                  <Label htmlFor="status-active" className="text-sm font-normal">
                    Actif
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="status-inactive"
                    checked={filters.status?.includes("inactive")}
                    onCheckedChange={(checked) => handleStatusChange("inactive", !!checked)}
                  />
                  <Label htmlFor="status-inactive" className="text-sm font-normal">
                    Inactif
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="status-pending"
                    checked={filters.status?.includes("pending")}
                    onCheckedChange={(checked) => handleStatusChange("pending", !!checked)}
                  />
                  <Label htmlFor="status-pending" className="text-sm font-normal">
                    Invitation en attente
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="status-locked"
                    checked={filters.status?.includes("locked")}
                    onCheckedChange={(checked) => handleStatusChange("locked", !!checked)}
                  />
                  <Label htmlFor="status-locked" className="text-sm font-normal">
                    Verrouillé
                  </Label>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-sm font-medium">Type de compte</Label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="type-internal"
                      checked={filters.accountType?.includes("internal")}
                      onCheckedChange={(checked) => handleAccountTypeChange("internal", !!checked)}
                    />
                    <Label htmlFor="type-internal" className="text-sm font-normal">
                      Interne
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="type-external"
                      checked={filters.accountType?.includes("external")}
                      onCheckedChange={(checked) => handleAccountTypeChange("external", !!checked)}
                    />
                    <Label htmlFor="type-external" className="text-sm font-normal">
                      Externe
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="type-contractor"
                      checked={filters.accountType?.includes("contractor")}
                      onCheckedChange={(checked) => handleAccountTypeChange("contractor", !!checked)}
                    />
                    <Label htmlFor="type-contractor" className="text-sm font-normal">
                      Prestataire
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="type-guest"
                      checked={filters.accountType?.includes("guest")}
                      onCheckedChange={(checked) => handleAccountTypeChange("guest", !!checked)}
                    />
                    <Label htmlFor="type-guest" className="text-sm font-normal">
                      Invité
                    </Label>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-sm font-medium">Statut 2FA</Label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="2fa-enabled"
                      checked={filters.twoFactor === true}
                      onCheckedChange={(checked) =>
                        onFiltersChange({ ...filters, twoFactor: checked ? true : undefined })
                      }
                    />
                    <Label htmlFor="2fa-enabled" className="text-sm font-normal">
                      2FA Activé
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="2fa-disabled"
                      checked={filters.twoFactor === false}
                      onCheckedChange={(checked) =>
                        onFiltersChange({ ...filters, twoFactor: checked ? false : undefined })
                      }
                    />
                    <Label htmlFor="2fa-disabled" className="text-sm font-normal">
                      2FA Désactivé
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Roles */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Rôles</h3>
              <div className="space-y-3">
                {roles.map((role) => (
                  <div key={role.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`role-${role.id}`}
                      checked={filters.roles?.includes(role.id)}
                      onCheckedChange={(checked) => handleRoleChange(role.id, !!checked)}
                    />
                    <Label htmlFor={`role-${role.id}`} className="text-sm font-normal">
                      {role.name} ({role.userCount})
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Groups */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Groupes</h3>
              <div className="space-y-3">
                {groups.map((group) => (
                  <div key={group.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`group-${group.id}`}
                      checked={filters.groups?.includes(group.id)}
                      onCheckedChange={(checked) => handleGroupChange(group.id, !!checked)}
                    />
                    <Label htmlFor={`group-${group.id}`} className="text-sm font-normal">
                      {group.name} ({group.memberCount})
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 border-t bg-background p-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={handleReset}>
              Réinitialiser tout
            </Button>
            <Button onClick={() => onOpenChange(false)}>Appliquer les filtres</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
