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
  Clock
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
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  const loadUsers = async () => {
    try {
      setIsLoading(true)
      const data = await getUsers()
      setUsers(data)
      // Auto-select first user if none selected
      if (!selectedUser && data.length > 0) {
        setSelectedUser(data[0])
      }
    } catch (error) {
      console.error('Failed to load users:', error)
    } finally {
      setIsLoading(false)
    }
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

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
      <div className="space-y-4">
        <Skeleton className="h-8 w-[300px]" />
        <div className="grid gap-4 md:grid-cols-[350px_1fr]">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    )
  }

  return (
    <PermissionGuard permission="users.read">
      {/* Compact Header with Inline Stats */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="flex flex-col gap-2 px-4 py-3">
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

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">{t("page.title", "Utilisateurs")}</h1>

              {/* Inline stats */}
              <div className="hidden lg:flex items-center gap-3 text-sm text-muted-foreground border-l pl-4 ml-2">
                <div className="flex items-center gap-1.5">
                  <UsersIcon className="h-3.5 w-3.5" />
                  <span className="font-medium">{stats.totalUsers}</span>
                </div>
                <div className="flex items-center gap-1.5 text-green-600">
                  <UserCheck className="h-3.5 w-3.5" />
                  <span className="font-medium">{stats.activeUsers}</span>
                </div>
                <div className="flex items-center gap-1.5 text-orange-600">
                  <UserX className="h-3.5 w-3.5" />
                  <span className="font-medium">{stats.inactiveUsers}</span>
                </div>
                <div className="flex items-center gap-1.5 text-primary">
                  <Shield className="h-3.5 w-3.5" />
                  <span className="font-medium">{stats.superusers}</span>
                </div>
              </div>
            </div>

            <Button onClick={() => setIsInviteDialogOpen(true)} size="sm">
              <UserPlus className="mr-2 h-4 w-4" />
              {t("action.invite", "Inviter")}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content - Fullwidth Layout */}
      <div className="flex h-[calc(100vh-140px)] overflow-hidden">
        {/* Left Sidebar - Users List */}
        <div className="w-full lg:w-80 border-r flex flex-col bg-muted/20 overflow-hidden">
          {/* Sidebar Header */}
          <div className="p-3 border-b bg-background/50">
            <h2 className="font-semibold text-xs mb-2 uppercase tracking-wide text-muted-foreground">
              {t("page.list_title", "Utilisateurs")}
            </h2>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("action.search", "Rechercher...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-10 h-9"
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
          </div>

          {/* Users List */}
          <ScrollArea className="flex-1 px-3 py-2">
            <div className="space-y-1 max-w-full">
              {filteredUsers.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t("message.no_user_found", "Aucun utilisateur trouvé")}
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className={cn(
                      "group/item rounded-md border p-2 cursor-pointer transition-all max-w-full overflow-hidden",
                      "hover:shadow-sm hover:border-primary/50",
                      selectedUser?.id === user.id ? "border-primary bg-accent/50 shadow-sm" : "hover:bg-accent/30"
                    )}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <Avatar className="h-9 w-9 flex-shrink-0">
                        <AvatarImage src={user.avatar_url || undefined} alt={user.full_name || user.email} />
                        <AvatarFallback className="text-xs">
                          {getInitials(user)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <h4 className="font-semibold text-sm truncate flex-1 min-w-0">
                            {user.full_name || user.email}
                          </h4>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {user.is_superuser && (
                              <Badge variant="default" className="text-[9px] py-0 px-1 h-4">
                                Admin
                              </Badge>
                            )}
                            {!user.is_active && (
                              <Badge variant="secondary" className="text-[9px] py-0 px-1 h-4">
                                Inactif
                              </Badge>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground truncate mt-0.5 overflow-hidden">
                          <Mail className="inline h-3 w-3 mr-1" />
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right Panel - User Details */}
        <div className="flex-1 flex flex-col bg-background overflow-hidden">
          {/* Header */}
          <div className="border-b bg-background/50 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {selectedUser && (
                  <>
                    <Avatar className="h-12 w-12 flex-shrink-0">
                      <AvatarImage src={selectedUser.avatar_url || undefined} alt={selectedUser.full_name || selectedUser.email} />
                      <AvatarFallback>
                        {getInitials(selectedUser)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-bold truncate">
                        {selectedUser.full_name || selectedUser.email}
                      </h2>
                      <p className="text-sm text-muted-foreground truncate">
                        {selectedUser.email}
                      </p>
                    </div>
                  </>
                )}
              </div>
              {selectedUser && (
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditDialogOpen(true)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    {t("action.edit", "Modifier")}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="px-4 py-4">
              {!selectedUser ? (
                <div className="flex h-[400px] items-center justify-center">
                  <div className="text-center max-w-md px-4">
                    <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <UsersIcon className="h-10 w-10 text-primary/60" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">
                      {t("message.no_user_selected_title", "Sélectionnez un utilisateur")}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      {t("message.select_user_from_list", "Choisissez un utilisateur dans la liste pour voir ses détails")}
                    </p>
                    {users.length === 0 && (
                      <Button onClick={() => setIsInviteDialogOpen(true)}>
                        <UserPlus className="h-4 w-4 mr-2" />
                        {t("action.invite_first", "Inviter le premier utilisateur")}
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Status Cards */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-lg",
                            selectedUser.is_active ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
                          )}>
                            {selectedUser.is_active ? <UserCheck className="h-5 w-5" /> : <UserX className="h-5 w-5" />}
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">{t("details.status", "Statut")}</p>
                            <p className="text-lg font-semibold">
                              {selectedUser.is_active ? t("details.active", "Actif") : t("details.inactive", "Inactif")}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <Shield className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">{t("details.role", "Rôle")}</p>
                            <p className="text-lg font-semibold">
                              {selectedUser.is_superuser ? "Administrateur" : "Utilisateur"}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* User Info */}
                  <div className="border-b pb-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("details.user_info", "Informations")}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <span className="text-xs text-muted-foreground">{t("details.email_label", "Email")}</span>
                        <p className="text-sm font-medium mt-1 flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{selectedUser.email}</span>
                        </p>
                      </div>

                      {selectedUser.phone_number && (
                        <div>
                          <span className="text-xs text-muted-foreground">{t("details.phone_label", "Téléphone")}</span>
                          <p className="text-sm font-medium mt-1 flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{selectedUser.phone_number}</span>
                          </p>
                        </div>
                      )}

                      <div>
                        <span className="text-xs text-muted-foreground">{t("details.created_at", "Créé le")}</span>
                        <p className="text-sm font-medium mt-1 flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{formatDate(selectedUser.created_at)}</span>
                        </p>
                      </div>

                      <div>
                        <span className="text-xs text-muted-foreground">{t("details.last_login", "Dernière connexion")}</span>
                        <p className="text-sm font-medium mt-1 flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{formatDate(selectedUser.last_login_at)}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
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
    </PermissionGuard>
  )
}
