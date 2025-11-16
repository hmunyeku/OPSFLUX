"use client"

import { type User, getRoleById } from "@/lib/user-management-data"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Mail, Phone, Building2, Users, MoreVertical, CheckCircle2, XCircle } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"

interface UserGridViewProps {
  users: User[]
  selectedUsers: string[]
  onSelectUser: (userId: string) => void
  onSelectAll: (selected: boolean) => void
  onViewUser?: (user: User) => void
  onEditUser?: (user: User) => void
}

export function UserGridView({
  users,
  selectedUsers,
  onSelectUser,
  onSelectAll,
  onViewUser,
  onEditUser,
}: UserGridViewProps) {
  const allSelected = users.length > 0 && selectedUsers.length === users.length
  const someSelected = selectedUsers.length > 0 && selectedUsers.length < users.length

  if (users.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-medium sm:text-lg">No users found</p>
          <p className="text-xs text-muted-foreground sm:text-sm">Try adjusting your filters or search terms</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-2 sm:p-3 md:p-4">
      <div className="mb-2 flex items-center gap-2">
        <Checkbox
          checked={allSelected}
          onCheckedChange={(checked) => onSelectAll(!!checked)}
          className={cn(someSelected && "data-[state=checked]:bg-primary/50")}
        />
        <span className="text-xs text-muted-foreground sm:text-sm">
          {allSelected ? "All selected" : someSelected ? `${selectedUsers.length} selected` : "Select all"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {users.map((user) => {
          const role = getRoleById(user.role)
          const isSelected = selectedUsers.includes(user.id)
          const showCheckbox = isSelected || selectedUsers.length > 0

          return (
            <div
              key={user.id}
              className={cn(
                "group relative rounded-lg border bg-card p-2 transition-all hover:shadow-md sm:p-3",
                isSelected && "ring-2 ring-primary",
              )}
            >
              <div className="mb-2 flex items-start gap-2">
                <div
                  className={cn(
                    "transition-opacity",
                    showCheckbox ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  <Checkbox checked={isSelected} onCheckedChange={() => onSelectUser(user.id)} />
                </div>

                <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
                  <AvatarImage src={user.avatar || "/placeholder.svg"} alt={`${user.firstName} ${user.lastName}`} />
                  <AvatarFallback className="text-xs">
                    {user.firstName[0]}
                    {user.lastName[0]}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-xs truncate sm:text-sm">
                    {user.firstName} {user.lastName}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate">{role?.name}</p>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 sm:h-8 sm:w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onViewUser?.(user)}>View Details</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEditUser?.(user)}>Edit User</DropdownMenuItem>
                    <DropdownMenuItem>View Activity</DropdownMenuItem>
                    <DropdownMenuItem>Reset Password</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">Delete User</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{user.email}</span>
                </div>
                {user.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{user.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{user.department}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{user.groups.length} groups</span>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                <Badge
                  variant={
                    user.status === "active"
                      ? "default"
                      : user.status === "inactive"
                        ? "secondary"
                        : user.status === "pending"
                          ? "outline"
                          : "destructive"
                  }
                  className="text-xs h-5 px-2"
                >
                  {user.status}
                </Badge>
                {user.accountType !== "internal" && (
                  <Badge variant="outline" className="text-xs h-5 px-2">
                    {user.accountType}
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs h-5 px-2">
                  {user.twoFactorEnabled ? (
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                  ) : (
                    <XCircle className="mr-1 h-3 w-3" />
                  )}
                  2FA
                </Badge>
              </div>

              <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                <span className="truncate">
                  Last: {formatDistanceToNow(new Date(user.lastActive), { addSuffix: true })}
                </span>
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onViewUser?.(user)}>
                  View
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
