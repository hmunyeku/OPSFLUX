"use client"

import { useState } from "react"
import type { Role } from "@/lib/user-management-data"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreVertical, Shield, UserCog, Users, User, UserX, FileEdit, DollarSign } from "lucide-react"
import { cn } from "@/lib/utils"

interface RolesListProps {
  roles: Role[]
  selectedRole: Role | null
  onSelectRole: (role: Role) => void
  searchQuery?: string
}

const roleIcons: Record<string, any> = {
  Shield,
  UserCog,
  Users,
  User,
  UserX,
  FileEdit,
  DollarSign,
}

export function RolesList({ roles, selectedRole, onSelectRole, searchQuery = "" }: RolesListProps) {
  const [internalSearchQuery, setInternalSearchQuery] = useState(searchQuery)

  const systemRoles = roles.filter((r) => r.type === "system")
  const customRoles = roles.filter((r) => r.type === "custom")

  const getRoleIcon = (iconName: string) => {
    const Icon = roleIcons[iconName] || Shield
    return Icon
  }

  const getPermissionCoverage = (role: Role) => {
    const totalPermissions = 32 // Total available permissions
    return Math.round((role.permissions.length / totalPermissions) * 100)
  }

  const RoleCard = ({ role }: { role: Role }) => {
    const Icon = getRoleIcon(role.icon)
    const coverage = getPermissionCoverage(role)
    const isSelected = selectedRole?.id === role.id

    return (
      <div
        className={cn(
          "group relative cursor-pointer rounded-lg border p-2.5 transition-all hover:shadow-md",
          isSelected && "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30",
          !isSelected && "hover:border-primary/40",
        )}
        onClick={() => onSelectRole(role)}
      >
        <div className="flex items-start gap-2">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg shadow-sm shrink-0",
              role.color === "red" && "bg-gradient-to-br from-red-100 to-red-50 text-red-600",
              role.color === "orange" && "bg-gradient-to-br from-orange-100 to-orange-50 text-orange-600",
              role.color === "blue" && "bg-gradient-to-br from-blue-100 to-blue-50 text-blue-600",
              role.color === "green" && "bg-gradient-to-br from-green-100 to-green-50 text-green-600",
              role.color === "gray" && "bg-gradient-to-br from-gray-100 to-gray-50 text-gray-600",
              role.color === "purple" && "bg-gradient-to-br from-purple-100 to-purple-50 text-purple-600",
              role.color === "emerald" && "bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-600",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <h4 className="text-xs font-semibold truncate">{role.name}</h4>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100">
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="text-xs">
                  <DropdownMenuItem>Modifier le rôle</DropdownMenuItem>
                  <DropdownMenuItem>Dupliquer le rôle</DropdownMenuItem>
                  <DropdownMenuItem>Voir les utilisateurs</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" disabled={role.type === "system"}>
                    Supprimer le rôle
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{role.description}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Badge variant="outline" className="text-[9px] h-3.5 px-1 bg-background">
                {role.type === "system" ? "Système" : "Personnalisé"}
              </Badge>
              <span className="text-[9px] text-muted-foreground">{role.userCount} utilisateurs</span>
            </div>
            <div className="mt-1.5">
              <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-0.5">
                <span>Couverture</span>
                <span className="font-medium">{coverage}%</span>
              </div>
              <Progress value={coverage} className="h-1" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Roles List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* System Roles */}
          {systemRoles.length > 0 && (
            <div>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Rôles système
              </h3>
              <div className="space-y-2">
                {systemRoles.map((role) => (
                  <RoleCard key={role.id} role={role} />
                ))}
              </div>
            </div>
          )}

          {/* Custom Roles */}
          {customRoles.length > 0 && (
            <div>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Rôles personnalisés
              </h3>
              <div className="space-y-2">
                {customRoles.map((role) => (
                  <RoleCard key={role.id} role={role} />
                ))}
              </div>
            </div>
          )}

          {roles.length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground">Aucun rôle trouvé</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
