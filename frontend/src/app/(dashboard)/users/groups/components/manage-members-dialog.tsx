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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "@/hooks/use-toast"
import { Search, X, Users, Mail } from "lucide-react"
import { useTranslation } from "@/hooks/use-translation"

interface User {
  id: string
  email: string
  full_name?: string | null
  avatar_url?: string | null
  is_active: boolean
}

interface ManageMembersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  groupName: string
  currentMembers: User[]
  onSuccess: () => void
}

export function ManageMembersDialog({
  open,
  onOpenChange,
  groupId,
  groupName,
  currentMembers,
  onSuccess,
}: ManageMembersDialogProps) {
  const { t } = useTranslation("core.groups")
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open, groupId])

  const loadData = async () => {
    try {
      setIsLoading(true)

      // Load all users
      const usersResponse = await fetch("/api/v1/users/", {
        headers: {
          "Content-Type": "application/json",
        },
      })
      if (!usersResponse.ok) throw new Error("Failed to load users")
      const usersData = await usersResponse.json()
      setAllUsers(usersData.items || [])

      // Load current group members
      const membersResponse = await fetch(`/api/v1/groups/${groupId}/members`, {
        headers: {
          "Content-Type": "application/json",
        },
      })
      if (!membersResponse.ok) throw new Error("Failed to load members")
      const membersData = await membersResponse.json()
      const memberIds = (membersData.data || []).map((u: User) => u.id)
      setSelectedIds(new Set(memberIds))
    } catch (error) {
      toast({
        title: t("error.load_failed", "Erreur"),
        description: t("error.load_failed_desc", "Impossible de charger les données"),
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggle = (userId: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(userId)) {
      newSelected.delete(userId)
    } else {
      newSelected.add(userId)
    }
    setSelectedIds(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedIds.size === filteredUsers.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredUsers.map((u) => u.id)))
    }
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)

      // Update group members
      const response = await fetch(`/api/v1/groups/${groupId}/members`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_ids: Array.from(selectedIds),
        }),
      })

      if (!response.ok) throw new Error("Failed to update members")

      toast({
        title: t("success.members_updated", "Membres mis à jour"),
        description: t("success.members_updated_desc", "Les membres du groupe ont été mis à jour avec succès"),
      })

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: t("error.update_members_failed", "Erreur"),
        description: t("error.update_members_failed_desc", "Impossible de mettre à jour les membres"),
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const filteredUsers = allUsers.filter(
    (user) =>
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getInitials = (user: User) => {
    if (user.full_name) {
      const parts = user.full_name.split(" ")
      return parts.length > 1
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
        : user.full_name.substring(0, 2).toUpperCase()
    }
    return user.email.substring(0, 2).toUpperCase()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("dialog.manage_members_title", "Gérer les membres")}
          </SheetTitle>
          <SheetDescription>
            {t("dialog.manage_members_desc", "Ajoutez ou retirez des membres du groupe")} <strong>{groupName}</strong>
          </SheetDescription>
        </SheetHeader>

        <div className="py-4 space-y-4">
          {/* Search and Stats */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("action.search_users", "Rechercher des utilisateurs...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9"
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

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {selectedIds.size} {t("selected", "sélectionné")}
                  {selectedIds.size > 1 ? "s" : ""}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {t("of", "sur")} {filteredUsers.length}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
              >
                {selectedIds.size === filteredUsers.length
                  ? t("action.deselect_all", "Tout désélectionner")
                  : t("action.select_all", "Tout sélectionner")}
              </Button>
            </div>
          </div>

          {/* Users List */}
          <ScrollArea className="h-[500px] pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">
                  {t("loading", "Chargement...")}
                </div>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Users className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium">
                  {t("no_users_found", "Aucun utilisateur trouvé")}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => handleToggle(user.id)}
                  >
                    <Checkbox
                      checked={selectedIds.has(user.id)}
                      onCheckedChange={() => handleToggle(user.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={user.avatar_url || undefined} alt={user.full_name || user.email} />
                      <AvatarFallback className="text-xs">
                        {getInitials(user)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {user.full_name || user.email}
                        </p>
                        {!user.is_active && (
                          <Badge variant="secondary" className="text-xs">
                            {t("inactive", "Inactif")}
                          </Badge>
                        )}
                      </div>
                      {user.full_name && (
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {user.email}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <SheetFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {t("action.cancel", "Annuler")}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving
              ? t("action.saving", "Enregistrement...")
              : t("action.save_changes", "Enregistrer")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
