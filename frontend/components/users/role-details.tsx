"use client"

import { useState } from "react"
import { type Role, permissions, getUsersByRole } from "@/lib/user-management-data"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Copy,
  Edit,
  Trash2,
  ChevronDown,
  ChevronRight,
  Search,
  Clock,
  Lock,
  Eye,
  FileEdit,
  Trash,
  Shield,
  CheckCircle2,
  AlertCircle,
  Users,
  KeyRound,
  Activity,
  Plus,
} from "lucide-react"

interface RoleDetailsProps {
  role: Role
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RoleDetails({ role, open, onOpenChange }: RoleDetailsProps) {
  const [expandedModules, setExpandedModules] = useState<string[]>(["User Management"])
  const [expandedPermissions, setExpandedPermissions] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [permissionSearch, setPermissionSearch] = useState("")
  const [localPermissions, setLocalPermissions] = useState<string[]>(role.permissions)
  const [hasChanges, setHasChanges] = useState(false)
  const [activeTab, setActiveTab] = useState("permissions")

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => (prev.includes(moduleId) ? prev.filter((id) => id !== moduleId) : [...prev, moduleId]))
  }

  const togglePermissionExpand = (permissionId: string) => {
    setExpandedPermissions((prev) =>
      prev.includes(permissionId) ? prev.filter((id) => id !== permissionId) : [...prev, permissionId],
    )
  }

  const togglePermission = (permissionId: string) => {
    if (role.type === "system") return

    setLocalPermissions((prev) => {
      const newPermissions = prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId]
      setHasChanges(true)
      return newPermissions
    })
  }

  const togglePermissionWithDeps = (permissionId: string) => {
    if (role.type === "system") return

    const permission = permissions.find((p) => p.id === permissionId)
    if (!permission) return

    setLocalPermissions((prev) => {
      let newPermissions = [...prev]

      if (prev.includes(permissionId)) {
        // Désactiver la permission
        newPermissions = newPermissions.filter((id) => id !== permissionId)
      } else {
        // Activer la permission et ses dépendances
        newPermissions.push(permissionId)
        if (permission.dependencies) {
          permission.dependencies.forEach((depId) => {
            if (!newPermissions.includes(depId)) {
              newPermissions.push(depId)
            }
          })
        }
      }

      setHasChanges(true)
      return newPermissions
    })
  }

  const selectAllInModule = (modulePermissions: typeof permissions) => {
    if (role.type === "system") return

    setLocalPermissions((prev) => {
      const moduleIds = modulePermissions.map((p) => p.id)
      const newPermissions = [...new Set([...prev, ...moduleIds])]
      setHasChanges(true)
      return newPermissions
    })
  }

  const clearAllInModule = (modulePermissions: typeof permissions) => {
    if (role.type === "system") return

    setLocalPermissions((prev) => {
      const moduleIds = modulePermissions.map((p) => p.id)
      const newPermissions = prev.filter((id) => !moduleIds.includes(id))
      setHasChanges(true)
      return newPermissions
    })
  }

  const saveChanges = () => {
    console.log("[v0] Saving permissions:", localPermissions)
    setHasChanges(false)
  }

  const cancelChanges = () => {
    setLocalPermissions(role.permissions)
    setHasChanges(false)
  }

  const permissionsByModule = {
    "User Management": permissions.filter((p) => p.category === "User Management"),
    "Content Management": permissions.filter((p) => p.category === "Content Management"),
    Logistics: permissions.filter((p) => p.category === "Logistics"),
    Finance: permissions.filter((p) => p.category === "Finance"),
    "System Administration": permissions.filter((p) => p.category === "System Administration"),
    "Reports & Analytics": permissions.filter((p) => p.category === "Reports & Analytics"),
  }

  const roleUsers = getUsersByRole(role.id)
  const rolePermissions = permissions.filter((p) => localPermissions.includes(p.id))
  const permissionCount = rolePermissions.length
  const totalPermissions = permissions.length
  const coverage = Math.round((permissionCount / totalPermissions) * 100)

  const getPermissionIcon = (permissionId: string) => {
    if (permissionId.includes("view")) return <Eye className="w-2.5 h-2.5 text-blue-500" />
    if (permissionId.includes("edit") || permissionId.includes("create"))
      return <FileEdit className="w-2.5 h-2.5 text-amber-500" />
    if (permissionId.includes("delete")) return <Trash className="w-2.5 h-2.5 text-red-500" />
    if (permissionId.includes("manage") || permissionId.includes("admin"))
      return <Shield className="w-2.5 h-2.5 text-purple-500" />
    return <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />
  }

  const getPermissionTree = (modulePermissions: typeof permissions) => {
    const rootPermissions = modulePermissions.filter((p) => !p.dependencies || p.dependencies.length === 0)
    const childPermissions = modulePermissions.filter((p) => p.dependencies && p.dependencies.length > 0)

    return rootPermissions.map((root) => ({
      ...root,
      children: childPermissions.filter((child) => child.dependencies?.includes(root.id)),
    }))
  }

  const mockActivity = [
    { id: "1", action: "Permission modifiée", user: "Admin", date: "Il y a 2 heures" },
    { id: "2", action: "Utilisateur ajouté", user: "Sophie Martin", date: "Il y a 5 heures" },
    { id: "3", action: "Rôle créé", user: "Admin", date: "Il y a 1 jour" },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0">
        <SheetHeader className="px-3 py-2 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <SheetTitle className="text-sm truncate">{role.name}</SheetTitle>
                  {role.type === "system" && (
                    <Badge variant="secondary" className="text-[9px] h-3.5 px-1">
                      <Lock className="w-2 h-2 mr-0.5" />
                      Système
                    </Badge>
                  )}
                </div>
                <SheetDescription className="text-[10px] mt-0 truncate">{role.description}</SheetDescription>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                <Copy className="w-2.5 h-2.5 mr-1" />
                Dupliquer
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                <Edit className="w-2.5 h-2.5 mr-1" />
                Modifier
              </Button>
              {role.type === "custom" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-2 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="px-3 pt-2 pb-1.5">
          <div className="grid grid-cols-3 gap-1.5">
            <Card className="p-1.5 bg-muted/30">
              <div className="text-center">
                <p className="text-base font-bold leading-none">{role.userCount}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">Utilisateurs</p>
              </div>
            </Card>
            <Card className="p-1.5 bg-muted/30">
              <div className="text-center">
                <p className="text-base font-bold leading-none">
                  {permissionCount}/{totalPermissions}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">Permissions</p>
              </div>
            </Card>
            <Card className="p-1.5 bg-muted/30">
              <div className="text-center">
                <p className="text-base font-bold leading-none">{coverage}%</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">Couverture</p>
              </div>
            </Card>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <div className="px-3 border-b">
            <TabsList className="w-full justify-start h-8 bg-transparent p-0">
              <TabsTrigger value="permissions" className="text-[10px] gap-1 data-[state=active]:bg-transparent">
                <KeyRound className="w-3 h-3" />
                Permissions
                <Badge variant="secondary" className="text-[8px] h-3.5 px-1 ml-0.5">
                  {permissionCount}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="users" className="text-[10px] gap-1 data-[state=active]:bg-transparent">
                <Users className="w-3 h-3" />
                Utilisateurs
                <Badge variant="secondary" className="text-[8px] h-3.5 px-1 ml-0.5">
                  {role.userCount}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="activity" className="text-[10px] gap-1 data-[state=active]:bg-transparent">
                <Activity className="w-3 h-3" />
                Activité
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="h-[calc(100vh-180px)]">
            <TabsContent value="permissions" className="px-3 py-2 space-y-2 mt-0">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  placeholder="Rechercher une permission..."
                  value={permissionSearch}
                  onChange={(e) => setPermissionSearch(e.target.value)}
                  className="pl-7 h-6 text-[10px]"
                />
              </div>

              {role.type !== "system" && (
                <Card className="p-1.5 bg-primary/10 border-primary/30">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-start gap-1.5 flex-1">
                      <Plus className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                      <div className="text-[9px] text-primary">
                        <p className="font-semibold">Activez les switches pour ajouter des permissions</p>
                        <p className="text-[8px] opacity-80">Les dépendances seront activées automatiquement</p>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {hasChanges && role.type !== "system" && (
                <Card className="p-1.5 bg-amber-500/10 border-amber-500/30 sticky top-0 z-10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="w-3 h-3 text-amber-600" />
                      <span className="text-[10px] font-medium text-amber-600">Modifications non sauvegardées</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="sm" className="h-5 text-[9px] px-2" onClick={cancelChanges}>
                        Annuler
                      </Button>
                      <Button size="sm" className="h-5 text-[9px] px-2" onClick={saveChanges}>
                        Sauvegarder
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              <div className="space-y-1">
                {Object.entries(permissionsByModule).map(([moduleName, modulePermissions]) => {
                  const isExpanded = expandedModules.includes(moduleName)
                  const filteredPermissions = modulePermissions.filter(
                    (p) =>
                      !permissionSearch ||
                      p.name.toLowerCase().includes(permissionSearch.toLowerCase()) ||
                      p.description.toLowerCase().includes(permissionSearch.toLowerCase()),
                  )
                  if (filteredPermissions.length === 0) return null

                  const activeCount = filteredPermissions.filter((p) => localPermissions.includes(p.id)).length
                  const moduleCoverage = (activeCount / filteredPermissions.length) * 100
                  const permissionTree = getPermissionTree(filteredPermissions)

                  return (
                    <Card key={moduleName} className="overflow-hidden">
                      <button
                        onClick={() => toggleModule(moduleName)}
                        className="w-full p-1.5 flex items-center justify-between hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-1.5 flex-1">
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="text-[10px] font-semibold">{moduleName}</span>
                          <Badge variant="secondary" className="text-[8px] h-3.5 px-1">
                            {activeCount}/{filteredPermissions.length}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary transition-all" style={{ width: `${moduleCoverage}%` }} />
                          </div>
                          <span className="text-[9px] text-muted-foreground w-7 text-right">
                            {Math.round(moduleCoverage)}%
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-1.5 pb-1.5 space-y-0.5">
                          {role.type !== "system" && (
                            <div className="flex items-center gap-0.5 mb-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-4 text-[8px] px-1.5"
                                onClick={() => selectAllInModule(filteredPermissions)}
                              >
                                Tout sélectionner
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-4 text-[8px] px-1.5"
                                onClick={() => clearAllInModule(filteredPermissions)}
                              >
                                Tout effacer
                              </Button>
                            </div>
                          )}

                          {permissionTree.map((permission) => {
                            const isEnabled = localPermissions.includes(permission.id)
                            const isExpanded = expandedPermissions.includes(permission.id)
                            const hasChildren = permission.children && permission.children.length > 0

                            return (
                              <div key={permission.id} className="space-y-0.5">
                                {/* Permission parent */}
                                <div
                                  className={`flex items-center justify-between p-1 rounded ${
                                    isEnabled ? "bg-primary/10 border border-primary/30" : "bg-muted/20"
                                  }`}
                                >
                                  <div className="flex items-center gap-1 flex-1 min-w-0">
                                    {hasChildren && (
                                      <button
                                        onClick={() => togglePermissionExpand(permission.id)}
                                        className="flex-shrink-0"
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
                                        ) : (
                                          <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
                                        )}
                                      </button>
                                    )}
                                    {!hasChildren && <div className="w-2.5" />}
                                    {getPermissionIcon(permission.id)}
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-[9px] truncate">{permission.name}</div>
                                      <div className="text-[8px] text-muted-foreground truncate">
                                        {permission.description}
                                      </div>
                                    </div>
                                  </div>
                                  <Switch
                                    checked={isEnabled}
                                    disabled={role.type === "system"}
                                    onCheckedChange={() => togglePermissionWithDeps(permission.id)}
                                    className="scale-[0.65] flex-shrink-0"
                                  />
                                </div>

                                {/* Permissions enfants (dépendantes) */}
                                {hasChildren && isExpanded && (
                                  <div className="ml-4 pl-2 border-l border-muted space-y-0.5">
                                    {permission.children!.map((child) => {
                                      const isChildEnabled = localPermissions.includes(child.id)

                                      return (
                                        <div
                                          key={child.id}
                                          className={`flex items-center justify-between p-1 rounded ${
                                            isChildEnabled ? "bg-primary/10 border border-primary/30" : "bg-muted/20"
                                          }`}
                                        >
                                          <div className="flex items-center gap-1 flex-1 min-w-0">
                                            <div className="w-3 h-px bg-muted flex-shrink-0" />
                                            {getPermissionIcon(child.id)}
                                            <div className="flex-1 min-w-0">
                                              <div className="font-medium text-[9px] truncate">{child.name}</div>
                                              <div className="text-[8px] text-muted-foreground truncate">
                                                {child.description}
                                              </div>
                                            </div>
                                          </div>
                                          <Switch
                                            checked={isChildEnabled}
                                            disabled={role.type === "system"}
                                            onCheckedChange={() => togglePermissionWithDeps(child.id)}
                                            className="scale-[0.65] flex-shrink-0"
                                          />
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            </TabsContent>

            <TabsContent value="users" className="px-3 py-2 space-y-2 mt-0">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-semibold">Utilisateurs assignés ({role.userCount})</h4>
                <div className="relative w-32">
                  <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-6 h-6 text-[9px]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                {roleUsers.map((user) => (
                  <Card key={user.id} className="p-1.5">
                    <div className="flex items-center gap-1.5">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={user.avatar || "/placeholder.svg"} />
                        <AvatarFallback className="text-[8px]">
                          {user.firstName[0]}
                          {user.lastName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-medium truncate">
                          {user.firstName} {user.lastName}
                        </p>
                        <p className="text-[8px] text-muted-foreground truncate">{user.email}</p>
                      </div>
                      <Button variant="ghost" size="sm" className="h-5 text-[8px] px-1.5">
                        Retirer
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              <Button variant="outline" size="sm" className="w-full h-6 text-[9px] bg-transparent">
                <Users className="w-2.5 h-2.5 mr-1" />
                Ajouter des utilisateurs
              </Button>
            </TabsContent>

            <TabsContent value="activity" className="px-3 py-2 space-y-2 mt-0">
              <h4 className="text-[10px] font-semibold">Historique des modifications</h4>

              <div className="space-y-1.5">
                {mockActivity.map((activity, index) => (
                  <Card key={activity.id} className="p-1.5">
                    <div className="flex gap-1.5">
                      <div className="relative">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Clock className="w-2.5 h-2.5 text-primary" />
                        </div>
                        {index < mockActivity.length - 1 && (
                          <div className="absolute left-2.5 top-5 bottom-0 w-px bg-border" />
                        )}
                      </div>
                      <div className="flex-1 pb-1 min-w-0">
                        <div className="font-medium text-[9px]">{activity.action}</div>
                        <div className="text-[8px] text-muted-foreground">
                          Par {activity.user} • {activity.date}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
