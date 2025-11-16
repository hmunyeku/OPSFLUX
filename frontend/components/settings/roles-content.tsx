"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { mockRoles, type Role, type PermissionAction } from "@/lib/settings-data"
import { Shield, Plus, Edit, Trash2, Users } from "lucide-react"

export function SettingsRolesContent() {
  const [roles] = useState<Role[]>(mockRoles)

  const modules = ["projects", "travelwiz", "organizer", "pobvue", "redacteur", "tiers", "settings"]
  const actions: PermissionAction[] = ["create", "read", "update", "delete", "validate", "export", "administrate"]

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestion des Rôles & Permissions</h1>
          <p className="text-sm text-muted-foreground">Configurer les rôles et leur matrice de permissions</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau Rôle
        </Button>
      </div>

      {/* Roles List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {roles.map((role) => (
          <Card key={role.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{role.name}</p>
                  <p className="text-xs text-muted-foreground">{role.description}</p>
                </div>
              </div>
              {!role.isSystem && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm">
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {role.usersCount} utilisateurs
              </div>
              {role.isSystem && <Badge variant="secondary">Système</Badge>}
            </div>
          </Card>
        ))}
      </div>

      {/* Permissions Matrix */}
      <Card className="flex-1 overflow-hidden">
        <div className="border-b p-4">
          <h2 className="font-semibold">Matrice de Permissions</h2>
          <p className="text-sm text-muted-foreground">Configurer les permissions par module et action</p>
        </div>
        <div className="h-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Module</TableHead>
                {actions.map((action) => (
                  <TableHead key={action} className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs font-medium capitalize">{action}</span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map((module) => (
                <TableRow key={module}>
                  <TableCell className="font-medium capitalize">{module}</TableCell>
                  {actions.map((action) => (
                    <TableCell key={action} className="text-center">
                      <div className="flex justify-center">
                        <Checkbox />
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
