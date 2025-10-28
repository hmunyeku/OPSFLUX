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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  ShieldCheck,
  LayoutGrid,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Eye
} from "lucide-react"
import { cn } from "@/lib/utils"
import { User } from "./data/schema"
import { getUsers } from "./data/users-api"
import { UsersInviteDialog } from "./components/users-invite-dialog"
import { UsersActionDialog } from "./components/users-action-dialog"

type ViewMode = "grid" | "table"

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
  const [viewMode, setViewMode] = useState<ViewMode>("grid")

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10) // TODO: Get from user preferences

  // Table filters
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [emailFilter, setEmailFilter] = useState("")

  // Selection for bulk actions
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())

  const toggleSelectAll = () => {
    if (selectedUserIds.size === paginatedUsers.length) {
      setSelectedUserIds(new Set())
    } else {
      setSelectedUserIds(new Set(paginatedUsers.map(u => u.id)))
    }
  }

  const toggleSelectUser = (userId: string) => {
    const newSelection = new Set(selectedUserIds)
    if (newSelection.has(userId)) {
      newSelection.delete(userId)
    } else {
      newSelection.add(userId)
    }
    setSelectedUserIds(newSelection)
  }

  const handleBulkDelete = async () => {
    if (selectedUserIds.size === 0) return
    // TODO: Implement bulk delete with confirmation
    console.log('Bulk delete:', Array.from(selectedUserIds))
  }

  const handleBulkActivate = async () => {
    if (selectedUserIds.size === 0) return
    // TODO: Implement bulk activate
    console.log('Bulk activate:', Array.from(selectedUserIds))
  }

  const handleBulkDeactivate = async () => {
    if (selectedUserIds.size === 0) return
    // TODO: Implement bulk deactivate
    console.log('Bulk deactivate:', Array.from(selectedUserIds))
  }

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
    console.log('Selected user:', user)
    console.log('Roles:', user.roles)
    console.log('Groups:', user.groups)
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

    // Apply role filter (for table view)
    if (roleFilter && roleFilter !== "all") {
      if (roleFilter === "admin") {
        filtered = filtered.filter(user => user.is_superuser)
      } else if (roleFilter === "user") {
        filtered = filtered.filter(user => !user.is_superuser)
      }
    }

    // Apply email filter (for table view)
    if (emailFilter) {
      filtered = filtered.filter(user =>
        user.email.toLowerCase().includes(emailFilter.toLowerCase())
      )
    }

    return filtered
  }, [users, searchQuery, statusFilter, roleFilter, emailFilter])

  // Paginated users for table view
  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredUsers.slice(startIndex, endIndex)
  }, [filteredUsers, currentPage, itemsPerPage])

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage)

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter, roleFilter, emailFilter])

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

            {/* Stats - Compact horizontal banner */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <div
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer transition-all hover:bg-accent/50 flex-shrink-0",
                  statusFilter === "all" && "bg-accent ring-1 ring-primary"
                )}
                onClick={() => setStatusFilter("all")}
              >
                <UsersIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Total</span>
                <span className="text-sm font-bold">{stats.totalUsers}</span>
              </div>
              <div
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer transition-all hover:bg-green-50 dark:hover:bg-green-950/30 flex-shrink-0",
                  statusFilter === "active" && "bg-green-50 dark:bg-green-950/20 ring-1 ring-green-600"
                )}
                onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}
              >
                <UserCheck className="h-3.5 w-3.5 text-green-600" />
                <span className="text-xs text-muted-foreground">Actifs</span>
                <span className="text-sm font-bold text-green-600">{stats.activeUsers}</span>
              </div>
              <div
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer transition-all hover:bg-orange-50 dark:hover:bg-orange-950/30 flex-shrink-0",
                  statusFilter === "inactive" && "bg-orange-50 dark:bg-orange-950/20 ring-1 ring-orange-600"
                )}
                onClick={() => setStatusFilter(statusFilter === "inactive" ? "all" : "inactive")}
              >
                <UserX className="h-3.5 w-3.5 text-orange-600" />
                <span className="text-xs text-muted-foreground">Inactifs</span>
                <span className="text-sm font-bold text-orange-600">{stats.inactiveUsers}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/5 flex-shrink-0">
                <Shield className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs text-muted-foreground">Admins</span>
                <span className="text-sm font-bold text-primary">{stats.superusers}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-4 sm:p-6 space-y-4">
            {/* Search and View Toggle */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
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
              <div className="flex items-center rounded-md border bg-background">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                  className="rounded-r-none"
                  aria-label="Affichage grille"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "table" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("table")}
                  className="rounded-l-none border-l"
                  aria-label="Affichage tableau"
                >
                  <TableIcon className="h-4 w-4" />
                </Button>
              </div>
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
            ) : viewMode === "grid" ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filteredUsers.map((user) => (
                  <Card
                    key={user.id}
                    className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                    onClick={() => handleUserSelect(user)}
                  >
                    <CardContent className="p-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-9 w-9 flex-shrink-0">
                          <AvatarImage src={user.avatar_url || undefined} alt={user.full_name || user.email} />
                          <AvatarFallback className="text-xs">
                            {getInitials(user)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <h4 className="font-semibold text-xs truncate flex-1">
                              {user.full_name || user.email.split('@')[0]}
                            </h4>
                            {user.is_superuser && (
                              <Shield className="h-3 w-3 text-primary flex-shrink-0" title="Admin" />
                            )}
                            <div className={cn(
                              "h-1.5 w-1.5 rounded-full flex-shrink-0",
                              user.is_active ? "bg-green-500" : "bg-orange-500"
                            )} title={user.is_active ? "Actif" : "Inactif"} />
                          </div>

                          <p className="text-[10px] text-muted-foreground truncate">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Bulk Actions Bar */}
                {selectedUserIds.size > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md border">
                    <span className="text-sm font-medium">
                      {selectedUserIds.size} sélectionné{selectedUserIds.size > 1 ? 's' : ''}
                    </span>
                    <div className="flex items-center gap-1 ml-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleBulkActivate}
                        className="h-8"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                        Activer
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleBulkDeactivate}
                        className="h-8"
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1.5" />
                        Désactiver
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleBulkDelete}
                        className="h-8 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Supprimer
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedUserIds(new Set())}
                        className="h-8"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Table Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-[150px] h-9">
                      <SelectValue placeholder="Rôle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les rôles</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="user">Utilisateur</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="relative flex-1 min-w-[200px]">
                    <Mail className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Filtrer par email..."
                      value={emailFilter}
                      onChange={(e) => setEmailFilter(e.target.value)}
                      className="pl-8 h-9"
                    />
                    {emailFilter && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                        onClick={() => setEmailFilter("")}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                    <span>{filteredUsers.length} résultat{filteredUsers.length > 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Table */}
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedUserIds.size === paginatedUsers.length && paginatedUsers.length > 0}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Tout sélectionner"
                          />
                        </TableHead>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>{t("table.name", "Nom")}</TableHead>
                        <TableHead className="hidden md:table-cell">{t("table.email", "Email")}</TableHead>
                        <TableHead className="hidden lg:table-cell">{t("table.role", "Rôle")}</TableHead>
                        <TableHead className="hidden xl:table-cell">{t("table.groups", "Groupes")}</TableHead>
                        <TableHead className="text-center">{t("table.status", "Statut")}</TableHead>
                        <TableHead className="hidden sm:table-cell text-right">{t("table.last_login", "Dernière connexion")}</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="h-24 text-center">
                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                              <UsersIcon className="h-8 w-8 mb-2" />
                              <p className="text-sm">Aucun utilisateur trouvé</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedUsers.map((user) => (
                      <TableRow
                        key={user.id}
                        className="cursor-pointer"
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedUserIds.has(user.id)}
                            onCheckedChange={() => toggleSelectUser(user.id)}
                            aria-label={`Sélectionner ${user.full_name || user.email}`}
                          />
                        </TableCell>
                        <TableCell onClick={() => handleUserSelect(user)}>
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.avatar_url || undefined} alt={user.full_name || user.email} />
                            <AvatarFallback className="text-xs">
                              {getInitials(user)}
                            </AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell className="font-medium" onClick={() => handleUserSelect(user)}>
                          <div className="flex items-center gap-2">
                            <span className="truncate">{user.full_name || user.email.split('@')[0]}</span>
                            {user.is_superuser && (
                              <Shield className="h-3 w-3 text-primary flex-shrink-0" title="Admin" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell" onClick={() => handleUserSelect(user)}>
                          <span className="text-sm text-muted-foreground truncate block max-w-[200px]">
                            {user.email}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell" onClick={() => handleUserSelect(user)}>
                          <Badge variant={user.is_superuser ? "default" : "secondary"} className="text-xs">
                            {user.is_superuser ? "Admin" : "Utilisateur"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell" onClick={() => handleUserSelect(user)}>
                          <div className="flex flex-wrap gap-1">
                            {user.groups && user.groups.length > 0 ? (
                              <>
                                {user.groups.slice(0, 2).map((group) => (
                                  <Badge key={group.id} variant="outline" className="text-[10px] py-0 px-1.5">
                                    {group.name}
                                  </Badge>
                                ))}
                                {user.groups.length > 2 && (
                                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                                    +{user.groups.length - 2}
                                  </Badge>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className={cn(
                              "h-2 w-2 rounded-full",
                              user.is_active ? "bg-green-500" : "bg-orange-500"
                            )} />
                            <span className="text-xs hidden sm:inline">
                              {user.is_active ? t("status.active", "Actif") : t("status.inactive", "Inactif")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-right text-xs text-muted-foreground" onClick={() => handleUserSelect(user)}>
                          {formatDate(user.last_login_at)}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => handleUserSelect(user)}>
                                <Eye className="h-3.5 w-3.5 mr-2" />
                                Voir détails
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setSelectedUser(user)
                                setIsEditDialogOpen(true)
                              }}>
                                <Edit className="h-3.5 w-3.5 mr-2" />
                                Modifier
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {user.is_active ? (
                                <DropdownMenuItem onClick={() => console.log('Deactivate', user.id)}>
                                  <XCircle className="h-3.5 w-3.5 mr-2" />
                                  Désactiver
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => console.log('Activate', user.id)}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                                  Activer
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => console.log('Delete', user.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Supprimer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {filteredUsers.length > 0 && (
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">
                        {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredUsers.length)} sur {filteredUsers.length}
                      </p>
                      <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                        <SelectTrigger className="h-8 w-[100px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5 / page</SelectItem>
                          <SelectItem value="10">10 / page</SelectItem>
                          <SelectItem value="20">20 / page</SelectItem>
                          <SelectItem value="50">50 / page</SelectItem>
                          <SelectItem value="100">100 / page</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <div className="flex items-center gap-1 px-2">
                        <span className="text-sm">Page</span>
                        <span className="text-sm font-medium">{currentPage}</span>
                        <span className="text-sm text-muted-foreground">sur {totalPages}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
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
              <SheetHeader className="border-b pb-3">
                <div className="flex items-center gap-2">
                  <Avatar className="h-12 w-12 flex-shrink-0">
                    <AvatarImage src={selectedUser.avatar_url || undefined} alt={selectedUser.full_name || selectedUser.email} />
                    <AvatarFallback className="text-sm">
                      {getInitials(selectedUser)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-lg truncate">
                      {selectedUser.full_name || selectedUser.email}
                    </SheetTitle>
                    <p className="text-xs text-muted-foreground truncate">
                      {selectedUser.email}
                    </p>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-4 pt-3">
                {/* Action Button */}
                <Button
                  className="w-full"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsUserSheetOpen(false)
                    setIsEditDialogOpen(true)
                  }}
                >
                  <Edit className="h-3.5 w-3.5 mr-2" />
                  {t("action.edit", "Modifier")}
                </Button>

                {/* Status Cards - Compact */}
                <div className="grid gap-2 grid-cols-2">
                  <Card>
                    <CardContent className="p-2.5">
                      <div className="text-center">
                        <div className={cn(
                          "mx-auto w-8 h-8 rounded-full flex items-center justify-center mb-1.5",
                          selectedUser.is_active ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
                        )}>
                          {selectedUser.is_active ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                        </div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">{t("details.status", "Statut")}</p>
                        <p className="text-xs font-semibold">
                          {selectedUser.is_active ? t("details.active", "Actif") : t("details.inactive", "Inactif")}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-2.5">
                      <div className="text-center">
                        <div className="mx-auto w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-1.5">
                          <Shield className="h-4 w-4" />
                        </div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">{t("details.role", "Rôle")}</p>
                        <p className="text-xs font-semibold">
                          {selectedUser.is_superuser ? "Admin" : "Utilisateur"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* User Info - Compact */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("details.user_info", "Informations")}
                  </h3>

                  <Card>
                    <CardContent className="p-3 space-y-2.5">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <Mail className="h-3 w-3" />
                          {t("details.email_label", "Email")}
                        </span>
                        <p className="text-xs font-medium break-all">
                          {selectedUser.email}
                        </p>
                      </div>

                      {selectedUser.phone_number && (
                        <div className="space-y-0.5 pt-2 border-t">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                            <Phone className="h-3 w-3" />
                            {t("details.phone_label", "Téléphone")}
                          </span>
                          <p className="text-xs font-medium">
                            {selectedUser.phone_number}
                          </p>
                        </div>
                      )}

                      <div className="space-y-0.5 pt-2 border-t">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" />
                          {t("details.created_at", "Créé le")}
                        </span>
                        <p className="text-xs font-medium">
                          {formatDate(selectedUser.created_at)}
                        </p>
                      </div>

                      <div className="space-y-0.5 pt-2 border-t">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          {t("details.last_login", "Dernière connexion")}
                        </span>
                        <p className="text-xs font-medium">
                          {formatDate(selectedUser.last_login_at)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Roles Section - Compact */}
                {selectedUser.roles && selectedUser.roles.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {t("details.roles", "Rôles")}
                    </h3>
                    <Card>
                      <CardContent className="p-3 space-y-2.5">
                        {selectedUser.roles.map((role) => (
                          <div key={role.id} className="space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">{role.name}</p>
                                <p className="text-[10px] font-mono text-muted-foreground truncate">{role.code}</p>
                                {role.description && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{role.description}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {role.is_system && (
                                  <Badge variant="secondary" className="text-[9px] py-0 px-1.5">Sys</Badge>
                                )}
                                <Badge variant={role.is_active ? "default" : "outline"} className="text-[9px] py-0 px-1.5">
                                  {role.is_active ? "Actif" : "Inactif"}
                                </Badge>
                              </div>
                            </div>
                            {role.permissions && role.permissions.length > 0 && (
                              <div className="pt-1.5 border-t">
                                <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                                  <Key className="h-2.5 w-2.5" />
                                  {role.permissions.length} perm{role.permissions.length > 1 ? 's' : ''}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {role.permissions.slice(0, 3).map((perm) => (
                                    <Badge key={perm.id} variant="outline" className="text-[9px] py-0 px-1.5">
                                      {perm.name}
                                    </Badge>
                                  ))}
                                  {role.permissions.length > 3 && (
                                    <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                                      +{role.permissions.length - 3}
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

                {/* Groups Section - Compact */}
                {selectedUser.groups && selectedUser.groups.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Users2 className="h-3.5 w-3.5" />
                      {t("details.groups", "Groupes")}
                    </h3>
                    <Card>
                      <CardContent className="p-3 space-y-2.5">
                        {selectedUser.groups.map((group) => (
                          <div key={group.id} className="space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">{group.name}</p>
                                <p className="text-[10px] font-mono text-muted-foreground truncate">{group.code}</p>
                                {group.description && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{group.description}</p>
                                )}
                                {group.parent && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                    Parent: {group.parent.name}
                                  </p>
                                )}
                              </div>
                              <Badge variant={group.is_active ? "default" : "outline"} className="text-[9px] py-0 px-1.5 flex-shrink-0">
                                {group.is_active ? "Actif" : "Inactif"}
                              </Badge>
                            </div>
                            {group.permissions && group.permissions.length > 0 && (
                              <div className="pt-1.5 border-t">
                                <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                                  <Key className="h-2.5 w-2.5" />
                                  {group.permissions.length} perm{group.permissions.length > 1 ? 's' : ''}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {group.permissions.slice(0, 3).map((perm) => (
                                    <Badge key={perm.id} variant="outline" className="text-[9px] py-0 px-1.5">
                                      {perm.name}
                                    </Badge>
                                  ))}
                                  {group.permissions.length > 3 && (
                                    <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                                      +{group.permissions.length - 3}
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
