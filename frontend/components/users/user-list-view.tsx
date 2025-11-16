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
import { MoreVertical } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"

interface UserListViewProps {
  users: User[]
  selectedUsers: string[]
  onSelectUser: (userId: string) => void
  onSelectAll: (selected: boolean) => void
  onViewUser?: (user: User) => void
  onEditUser?: (user: User) => void
}

export function UserListView({
  users,
  selectedUsers,
  onSelectUser,
  onSelectAll,
  onViewUser,
  onEditUser,
}: UserListViewProps) {
  const allSelected = users.length > 0 && selectedUsers.length === users.length

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
    <div className="p-2 sm:p-4 md:p-6">
      <div className="mb-2 hidden items-center gap-4 border-b pb-2 text-xs font-medium text-muted-foreground md:flex">
        <div className="w-10">
          <Checkbox checked={allSelected} onCheckedChange={(checked) => onSelectAll(!!checked)} />
        </div>
        <div className="w-64">User</div>
        <div className="w-48">Email</div>
        <div className="w-32">Department</div>
        <div className="w-32">Groups</div>
        <div className="w-24">Status</div>
        <div className="w-32">Last Active</div>
        <div className="w-16">Actions</div>
      </div>

      <div className="mb-2 flex items-center gap-2 border-b pb-2 md:hidden">
        <Checkbox checked={allSelected} onCheckedChange={(checked) => onSelectAll(!!checked)} />
        <span className="text-xs text-muted-foreground">
          {allSelected ? "All selected" : selectedUsers.length > 0 ? `${selectedUsers.length} selected` : "Select all"}
        </span>
      </div>

      <div className="space-y-2">
        {users.map((user) => {
          const role = getRoleById(user.role)
          const isSelected = selectedUsers.includes(user.id)

          return (
            <div
              key={user.id}
              className={cn(
                "flex flex-col gap-2 rounded-md border p-3 transition-colors hover:bg-muted/50 md:flex-row md:items-center md:gap-4 md:border-0 md:p-2",
                isSelected && "bg-muted",
              )}
            >
              <div className="flex items-center gap-3 md:w-10">
                <Checkbox checked={isSelected} onCheckedChange={() => onSelectUser(user.id)} />
                <div className="flex items-center gap-3 md:hidden flex-1">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatar || "/placeholder.svg"} alt={`${user.firstName} ${user.lastName}`} />
                    <AvatarFallback className="text-sm">
                      {user.firstName[0]}
                      {user.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{role?.name}</p>
                  </div>
                </div>
              </div>

              <div className="hidden md:flex md:w-64 items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.avatar || "/placeholder.svg"} alt={`${user.firstName} ${user.lastName}`} />
                  <AvatarFallback className="text-xs">
                    {user.firstName[0]}
                    {user.lastName[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{role?.name}</p>
                </div>
              </div>

              <div className="flex flex-col gap-1 text-xs md:contents">
                <div className="flex items-center justify-between md:w-48">
                  <span className="text-muted-foreground md:hidden">Email:</span>
                  <p className="truncate md:text-sm">{user.email}</p>
                </div>

                <div className="flex items-center justify-between md:w-32">
                  <span className="text-muted-foreground md:hidden">Department:</span>
                  <p className="truncate md:text-sm">{user.department}</p>
                </div>

                <div className="flex items-center justify-between md:w-32">
                  <span className="text-muted-foreground md:hidden">Groups:</span>
                  <p className="text-muted-foreground md:text-sm">{user.groups.length} groups</p>
                </div>

                <div className="flex items-center justify-between md:w-24">
                  <span className="text-muted-foreground md:hidden">Status:</span>
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
                    className="text-xs"
                  >
                    {user.status}
                  </Badge>
                </div>

                <div className="flex items-center justify-between md:w-32">
                  <span className="text-muted-foreground md:hidden">Last Active:</span>
                  <p className="truncate text-muted-foreground md:text-sm">
                    {formatDistanceToNow(new Date(user.lastActive), { addSuffix: true })}
                  </p>
                </div>
              </div>

              <div className="absolute right-3 top-3 md:relative md:right-auto md:top-auto md:w-16">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
