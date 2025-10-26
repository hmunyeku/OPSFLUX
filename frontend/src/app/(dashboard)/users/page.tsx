"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { PermissionGuard } from "@/components/permission-guard"
import { useTranslation } from "@/hooks/use-translation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Search,
  Users as UsersIcon,
  UserPlus,
  Mail,
  Phone,
  Shield,
  Edit,
  Trash2,
  X,
  UserCheck,
  UserX,
  Calendar,
  Clock,
  Key,
  Users2,
  ShieldCheck
} from "lucide-react"
import { cn } from "@/lib/utils"
import { User } from "./data/schema"
import { getUsers } from "./data/users-api"
import { UsersInviteDialog } from "./components/users-invite-dialog"
import { UsersActionDialog } from "./components/users-action-dialog"

export default function UsersPage() {
  const { t } = useTranslation("core.users")
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isUserSheetOpen, setIsUserSheetOpen] = useState(false)

  const loadUsers = async () => {
    try {
      setIsLoading(true)
      const data = await getUsers()
      setUsers(data)
    } catch (error) {
      console.error('Failed to load users:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUserSelect = (user: User) => {
    setSelectedUser(user)
    setIsUserSheetOpen(true)
  }

  const refreshUsers = async () => {
    try {
      const data = await getUsers()
      setUsers(data)
      // Update selected user with fresh data
      if (selectedUser) {
        const updatedUser = data.find(u => u.id === selectedUser.id)
        if (updatedUser) {
          setSelectedUser(updatedUser)
        }
      }
    } catch (error) {
      console.error('Failed to refresh users:', error)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const filteredUsers = useMemo(() => {
    let filtered = users

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(user =>
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Apply status filter
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "active") {
        filtered = filtered.filter(user => user.is_active)
      } else if (statusFilter === "inactive") {
        filtered = filtered.filter(user => !user.is_active)
      }
    }

    return filtered
  }, [users, searchQuery, statusFilter])

  // Calculate statistics
  const stats = useMemo(() => {
    const totalUsers = users.length
    const activeUsers = users.filter(u => u.is_active).length
    const inactiveUsers = users.filter(u => !u.is_active).length
    const superusers = users.filter(u => u.is_superuser).length

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      superusers,
    }
  }, [users])

  const getInitials = (user: User) => {
    if (user.full_name) {
      const parts = user.full_name.split(" ")
      return parts.length > 1
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
        : user.full_name.substring(0, 2).toUpperCase()
    }
    return user.email.substring(0, 2).toUpperCase()
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Jamais"
    return new Date(dateString).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-6 w-[200px]" />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-[500px] w-full" />
      </div>
    )
  }

  return (
    <PermissionGuard permission="users.read">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex flex-col gap-3 p-4 sm:px-6">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/">{t("breadcrumb.home", "Accueil")}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{t("breadcrumb.users", "Utilisateurs")}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h1 className="text-2xl font-bold">{t("page.title", "Utilisateurs")}</h1>
              <Button onClick={() => setIsInviteDialogOpen(true)} size="sm" className="w-full sm:w-auto">
                <UserPlus className="mr-2 h-4 w-4" />
                {t("action.invite", "Inviter")}
              </Button>
            </div>

            {/* Stats - Always visible, responsive grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <Card
                className={`bg-muted/50 cursor-pointer transition-all hover:shadow-md ${
                  statusFilter === "all" ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => setStatusFilter("all")}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <UsersIcon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-lg sm:text-xl font-bold">{stats.totalUsers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card
                className={`bg-green-50/50 dark:bg-green-950/20 cursor-pointer transition-all hover:shadow-md ${
                  statusFilter === "active" ? "ring-2 ring-green-600" : ""
                }`}
                onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-green-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Actifs</p>
                      <p className="text-lg sm:text-xl font-bold text-green-600">{stats.activeUsers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card
                className={`bg-orange-50/50 dark:bg-orange-950/20 cursor-pointer transition-all hover:shadow-md ${
                  statusFilter === "inactive" ? "ring-2 ring-orange-600" : ""
                }`}
                onClick={() => setStatusFilter(statusFilter === "inactive" ? "all" : "inactive")}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <UserX className="h-4 w-4 text-orange-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Inactifs</p>
                      <p className="text-lg sm:text-xl font-bold text-orange-600">{stats.inactiveUsers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-primary/5">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Admins</p>
                      <p className="text-lg sm:text-xl font-bold text-primary">{stats.superusers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-4 sm:p-6 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("action.search", "Rechercher par nom ou email...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-10"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* Users Grid/List */}
            {filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <UsersIcon className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {t("message.no_user_found", "Aucun utilisateur trouvé")}
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  {users.length === 0
                    ? t("message.no_users_yet", "Commencez par inviter votre premier utilisateur")
                    : t("message.try_different_search", "Essayez une autre recherche")}
                </p>
                {users.length === 0 && (
                  <Button onClick={() => setIsInviteDialogOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    {t("action.invite_first", "Inviter le premier utilisateur")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredUsers.map((user) => (
                  <Card
                    key={user.id}
                    className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                    onClick={() => handleUserSelect(user)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-12 w-12 flex-shrink-0">
                          <AvatarImage src={user.avatar_url || undefined} alt={user.full_name || user.email} />
                          <AvatarFallback className="text-sm">
                            {getInitials(user)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className="font-semibold text-sm truncate">
                              {user.full_name || user.email}
                            </h4>
                            {user.is_superuser && (
                              <Badge variant="default" className="text-[10px] py-0 px-1.5 h-5 flex-shrink-0">
                                Admin
                              </Badge>
                            )}
                          </div>

                          <p className="text-xs text-muted-foreground truncate mb-2">
                            {user.email}
                          </p>

                          <div className="flex items-center gap-2">
                            <Badge
                              variant={user.is_active ? "default" : "secondary"}
                              className={cn(
                                "text-[10px] py-0 px-1.5 h-5",
                                user.is_active ? "bg-green-100 text-green-700 hover:bg-green-100" : ""
                              )}
                            >
                              {user.is_active ? "Actif" : "Inactif"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <UsersInviteDialog
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
        onUserCreated={loadUsers}
      />

      <UsersActionDialog
        currentRow={selectedUser || undefined}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onUserCreated={refreshUsers}
      />

      {/* User Details Sheet (Mobile/All) */}
      <Sheet open={isUserSheetOpen} onOpenChange={setIsUserSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedUser && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3 pb-4">
                  <Avatar className="h-16 w-16 flex-shrink-0">
                    <AvatarImage src={selectedUser.avatar_url || undefined} alt={selectedUser.full_name || selectedUser.email} />
                    <AvatarFallback className="text-lg">
                      {getInitials(selectedUser)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-xl truncate">
                      {selectedUser.full_name || selectedUser.email}
                    </SheetTitle>
                    <p className="text-sm text-muted-foreground truncate">
                      {selectedUser.email}
                    </p>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-6 pt-4">
                {/* Action Button */}
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => {
                    setIsUserSheetOpen(false)
                    setIsEditDialogOpen(true)
                  }}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  {t("action.edit", "Modifier")}
                </Button>

                {/* Status Cards */}
                <div className="grid gap-3 grid-cols-2">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-center">
                        <div className={cn(
                          "mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-2",
                          selectedUser.is_active ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
                        )}>
                          {selectedUser.is_active ? <UserCheck className="h-5 w-5" /> : <UserX className="h-5 w-5" />}
                        </div>
                        <p className="text-xs text-muted-foreground mb-1">{t("details.status", "Statut")}</p>
                        <p className="text-sm font-semibold">
                          {selectedUser.is_active ? t("details.active", "Actif") : t("details.inactive", "Inactif")}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="text-center">
                        <div className="mx-auto w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2">
                          <Shield className="h-5 w-5" />
                        </div>
                        <p className="text-xs text-muted-foreground mb-1">{t("details.role", "Rôle")}</p>
                        <p className="text-sm font-semibold">
                          {selectedUser.is_superuser ? "Admin" : "Utilisateur"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* User Info */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("details.user_info", "Informations")}
                  </h3>

                  <Card>
                    <CardContent className="p-4 space-y-4">
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5" />
                          {t("details.email_label", "Email")}
                        </span>
                        <p className="text-sm font-medium break-all">
                          {selectedUser.email}
                        </p>
                      </div>

                      {selectedUser.phone_number && (
                        <div className="space-y-1 pt-3 border-t">
                          <span className="text-xs text-muted-foreground flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5" />
                            {t("details.phone_label", "Téléphone")}
                          </span>
                          <p className="text-sm font-medium">
                            {selectedUser.phone_number}
                          </p>
                        </div>
                      )}

                      <div className="space-y-1 pt-3 border-t">
                        <span className="text-xs text-muted-foreground flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5" />
                          {t("details.created_at", "Créé le")}
                        </span>
                        <p className="text-sm font-medium">
                          {formatDate(selectedUser.created_at)}
                        </p>
                      </div>

                      <div className="space-y-1 pt-3 border-t">
                        <span className="text-xs text-muted-foreground flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5" />
                          {t("details.last_login", "Dernière connexion")}
                        </span>
                        <p className="text-sm font-medium">
                          {formatDate(selectedUser.last_login_at)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Roles Section */}
                {selectedUser.roles && selectedUser.roles.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      {t("details.roles", "Rôles")}
                    </h3>
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        {selectedUser.roles.map((role) => (
                          <div key={role.id} className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-sm font-semibold">{role.name}</p>
                                <p className="text-xs font-mono text-muted-foreground">{role.code}</p>
                                {role.description && (
                                  <p className="text-xs text-muted-foreground mt-1">{role.description}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {role.is_system && (
                                  <Badge variant="secondary" className="text-[10px]">Système</Badge>
                                )}
                                <Badge variant={role.is_active ? "default" : "outline"} className="text-[10px]">
                                  {role.is_active ? "Actif" : "Inactif"}
                                </Badge>
                              </div>
                            </div>
                            {role.permissions && role.permissions.length > 0 && (
                              <div className="pt-2 border-t">
                                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                                  <Key className="h-3 w-3" />
                                  {role.permissions.length} permission(s)
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {role.permissions.slice(0, 5).map((perm) => (
                                    <Badge key={perm.id} variant="outline" className="text-[9px] py-0 px-1.5">
                                      {perm.name}
                                    </Badge>
                                  ))}
                                  {role.permissions.length > 5 && (
                                    <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                                      +{role.permissions.length - 5} autres
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Groups Section */}
                {selectedUser.groups && selectedUser.groups.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                      <Users2 className="h-4 w-4" />
                      {t("details.groups", "Groupes")}
                    </h3>
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        {selectedUser.groups.map((group) => (
                          <div key={group.id} className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-sm font-semibold">{group.name}</p>
                                <p className="text-xs font-mono text-muted-foreground">{group.code}</p>
                                {group.description && (
                                  <p className="text-xs text-muted-foreground mt-1">{group.description}</p>
                                )}
                                {group.parent && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Parent: {group.parent.name}
                                  </p>
                                )}
                              </div>
                              <Badge variant={group.is_active ? "default" : "outline"} className="text-[10px]">
                                {group.is_active ? "Actif" : "Inactif"}
                              </Badge>
                            </div>
                            {group.permissions && group.permissions.length > 0 && (
                              <div className="pt-2 border-t">
                                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                                  <Key className="h-3 w-3" />
                                  {group.permissions.length} permission(s)
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {group.permissions.slice(0, 5).map((perm) => (
                                    <Badge key={perm.id} variant="outline" className="text-[9px] py-0 px-1.5">
                                      {perm.name}
                                    </Badge>
                                  ))}
                                  {group.permissions.length > 5 && (
                                    <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                                      +{group.permissions.length - 5} autres
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </PermissionGuard>
  )
}
