"use client"

import { useState } from "react"
import { mockExternalUsers, type ExternalUser } from "@/lib/tiers-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Search,
  Filter,
  Plus,
  Grid3x3,
  List,
  MoreVertical,
  Mail,
  Building2,
  Shield,
  Calendar,
  Clock,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type ViewMode = "grid" | "list"

const statusColors = {
  active: "bg-green-500/10 text-green-700 dark:text-green-400",
  suspended: "bg-red-500/10 text-red-700 dark:text-red-400",
  pending: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
}

export function ExternalUsersContent() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [users] = useState<ExternalUser[]>(mockExternalUsers)

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.company.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher utilisateurs externes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select defaultValue="all">
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="active">Actifs</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="suspended">Suspendus</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-transparent">
          <Filter className="h-3 w-3" />
          Filtres
        </Button>
        <div className="flex items-center gap-0.5 rounded-md border p-0.5">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setViewMode("grid")}
          >
            <Grid3x3 className="h-3 w-3" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setViewMode("list")}
          >
            <List className="h-3 w-3" />
          </Button>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs">
          <Plus className="h-3 w-3" />
          Inviter utilisateur
        </Button>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{filteredUsers.length} utilisateurs externes</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredUsers.map((user) => (
              <Card key={user.id} className="group relative flex flex-col gap-2 p-2 transition-all hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-[10px]">
                        {user.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-xs font-semibold">{user.name}</h3>
                      <p className="truncate text-[10px] text-muted-foreground">{user.role}</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100">
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-xs">Voir détails</DropdownMenuItem>
                      <DropdownMenuItem className="text-xs">Modifier permissions</DropdownMenuItem>
                      <DropdownMenuItem className="text-xs">Réinitialiser mot de passe</DropdownMenuItem>
                      <DropdownMenuItem className="text-xs text-destructive">Suspendre</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <Badge variant="secondary" className={`h-4 w-fit px-1.5 text-[9px] ${statusColors[user.status]}`}>
                  {user.status}
                </Badge>

                <div className="space-y-1 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{user.company}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3 w-3 shrink-0" />
                    <span className="truncate">{user.permissions.length} permissions</span>
                  </div>
                </div>

                <div className="mt-auto space-y-1 border-t pt-2 text-[10px] text-muted-foreground">
                  {user.lastLogin && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>Dernière connexion: {new Date(user.lastLogin).toLocaleDateString("fr-FR")}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>Créé le: {new Date(user.createdAt).toLocaleDateString("fr-FR")}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredUsers.map((user) => (
              <Card key={user.id} className="group flex items-center gap-3 p-2 transition-all hover:shadow-md">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-[10px]">
                    {user.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold">{user.name}</h3>
                    <Badge variant="secondary" className={`h-4 px-1.5 text-[9px] ${statusColors[user.status]}`}>
                      {user.status}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {user.role} • {user.company}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    <span>{user.email}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    <span>{user.permissions.length} permissions</span>
                  </div>
                  {user.lastLogin && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(user.lastLogin).toLocaleDateString("fr-FR")}</span>
                    </div>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="text-xs">Voir détails</DropdownMenuItem>
                    <DropdownMenuItem className="text-xs">Modifier permissions</DropdownMenuItem>
                    <DropdownMenuItem className="text-xs">Réinitialiser mot de passe</DropdownMenuItem>
                    <DropdownMenuItem className="text-xs text-destructive">Suspendre</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
