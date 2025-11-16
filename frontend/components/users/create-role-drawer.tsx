"use client"

import { useState } from "react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Shield, Users, FileText, Settings, Sparkles } from "lucide-react"

interface CreateRoleDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const permissionCategoriesWithIcons = [
  {
    id: "users",
    name: "Utilisateurs",
    icon: Users,
    description: "Gestion des comptes utilisateurs",
    permissions: [
      { id: "users.read", label: "Voir les utilisateurs" },
      { id: "users.create", label: "Créer des utilisateurs" },
      { id: "users.edit", label: "Modifier les utilisateurs" },
      { id: "users.delete", label: "Supprimer les utilisateurs" },
    ],
  },
  {
    id: "projects",
    name: "Projets",
    icon: FileText,
    description: "Gestion des projets",
    permissions: [
      { id: "projects.read", label: "Voir les projets" },
      { id: "projects.create", label: "Créer des projets" },
      { id: "projects.edit", label: "Modifier les projets" },
      { id: "projects.delete", label: "Supprimer les projets" },
    ],
  },
  {
    id: "settings",
    name: "Paramètres",
    icon: Settings,
    description: "Configuration système",
    permissions: [
      { id: "settings.read", label: "Voir les paramètres" },
      { id: "settings.edit", label: "Modifier les paramètres" },
    ],
  },
]

export function CreateRoleDrawer({ open, onOpenChange }: CreateRoleDrawerProps) {
  const [roleName, setRoleName] = useState("")
  const [roleDescription, setRoleDescription] = useState("")
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set())

  const togglePermission = (permissionId: string) => {
    const newPermissions = new Set(selectedPermissions)
    if (newPermissions.has(permissionId)) {
      newPermissions.delete(permissionId)
    } else {
      newPermissions.add(permissionId)
    }
    setSelectedPermissions(newPermissions)
  }

  const selectAllInCategory = (categoryId: string) => {
    const category = permissionCategoriesWithIcons.find((c) => c.id === categoryId)
    if (!category) return

    const newPermissions = new Set(selectedPermissions)
    category.permissions.forEach((p) => newPermissions.add(p.id))
    setSelectedPermissions(newPermissions)
  }

  const clearAllInCategory = (categoryId: string) => {
    const category = permissionCategoriesWithIcons.find((c) => c.id === categoryId)
    if (!category) return

    const newPermissions = new Set(selectedPermissions)
    category.permissions.forEach((p) => newPermissions.delete(p.id))
    setSelectedPermissions(newPermissions)
  }

  const handleSave = () => {
    console.log("[v0] Création du rôle:", {
      roleName,
      roleDescription,
      permissions: Array.from(selectedPermissions),
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-[600px] p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle>Créer un nouveau rôle</SheetTitle>
              <SheetDescription>Définissez un rôle personnalisé avec des permissions spécifiques</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 py-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Informations de base</CardTitle>
                <CardDescription>Nom et description du rôle</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="roleName">Nom du rôle *</Label>
                  <Input
                    id="roleName"
                    placeholder="Ex: Chef de projet"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="roleDescription">Description</Label>
                  <Textarea
                    id="roleDescription"
                    placeholder="Décrivez les responsabilités de ce rôle..."
                    value={roleDescription}
                    onChange={(e) => setRoleDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Permissions</CardTitle>
                    <CardDescription>{selectedPermissions.size} permission(s) sélectionnée(s)</CardDescription>
                  </div>
                  <Button variant="outline" size="sm">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Suggérer
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {permissionCategoriesWithIcons.map((category) => {
                  const Icon = category.icon
                  const categoryPermissions = category.permissions.map((p) => p.id)
                  const selectedInCategory = categoryPermissions.filter((p) => selectedPermissions.has(p)).length

                  return (
                    <Card key={category.id} className="border-2">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <h4 className="font-semibold text-sm">{category.name}</h4>
                              <p className="text-xs text-muted-foreground">{category.description}</p>
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {selectedInCategory}/{categoryPermissions.length}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex gap-2 mb-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs flex-1 bg-transparent"
                            onClick={() => selectAllInCategory(category.id)}
                          >
                            Tout sélectionner
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs flex-1 bg-transparent"
                            onClick={() => clearAllInCategory(category.id)}
                          >
                            Tout effacer
                          </Button>
                        </div>

                        {category.permissions.map((permission) => (
                          <div
                            key={permission.id}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <Label htmlFor={permission.id} className="text-sm font-normal cursor-pointer flex-1">
                              {permission.label}
                            </Label>
                            <Switch
                              id={permission.id}
                              checked={selectedPermissions.has(permission.id)}
                              onCheckedChange={() => togglePermission(permission.id)}
                            />
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        <div className="px-6 py-4 border-t bg-muted/30">
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 bg-transparent" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={!roleName.trim()}>
              <Shield className="h-4 w-4 mr-2" />
              Créer le rôle
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
