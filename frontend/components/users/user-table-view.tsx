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
import { MoreVertical, CheckCircle2, XCircle } from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"

interface UserTableViewProps {
  users: User[]
  selectedUsers: string[]
  onSelectUser: (userId: string) => void
  onSelectAll: (selected: boolean) => void
  onViewUser?: (user: User) => void
  onEditUser?: (user: User) => void
}

export function UserTableView({
  users,
  selectedUsers,
  onSelectUser,
  onSelectAll,
  onViewUser,
  onEditUser,
}: UserTableViewProps) {
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
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b text-xs font-medium text-muted-foreground sm:text-sm">
              <th className="w-8 p-2">
                <Checkbox checked={allSelected} onCheckedChange={(checked) => onSelectAll(!!checked)} />
              </th>
              <th className="p-2 text-left">User</th>
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">Phone</th>
              <th className="p-2 text-left">Department</th>
              <th className="p-2 text-left">Job Title</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">2FA</th>
              <th className="p-2 text-left">Join Date</th>
              <th className="p-2 text-left">Last Active</th>
              <th className="w-12 p-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const role = getRoleById(user.role)
              const isSelected = selectedUsers.includes(user.id)

              return (
                <tr
                  key={user.id}
                  className={cn("border-b transition-colors hover:bg-muted/50", isSelected && "bg-muted")}
                >
                  <td className="p-2">
                    <Checkbox checked={isSelected} onCheckedChange={() => onSelectUser(user.id)} />
                  </td>

                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7 sm:h-8 sm:w-8">
                        <AvatarImage
                          src={user.avatar || "/placeholder.svg"}
                          alt={`${user.firstName} ${user.lastName}`}
                        />
                        <AvatarFallback className="text-xs">
                          {user.firstName[0]}
                          {user.lastName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-xs font-medium sm:text-sm">
                          {user.firstName} {user.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">{role?.name}</p>
                      </div>
                    </div>
                  </td>

                  <td className="p-2">
                    <p className="text-xs sm:text-sm">{user.email}</p>
                  </td>

                  <td className="p-2">
                    <p className="text-xs text-muted-foreground sm:text-sm">{user.phone || "-"}</p>
                  </td>

                  <td className="p-2">
                    <p className="text-xs sm:text-sm">{user.department}</p>
                  </td>

                  <td className="p-2">
                    <p className="text-xs text-muted-foreground sm:text-sm">{user.jobTitle}</p>
                  </td>

                  <td className="p-2">
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
                  </td>

                  <td className="p-2">
                    {user.twoFactorEnabled ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </td>

                  <td className="p-2">
                    <p className="text-xs text-muted-foreground sm:text-sm">
                      {format(new Date(user.joinDate), "MMM d, yyyy")}
                    </p>
                  </td>

                  <td className="p-2">
                    <p className="text-xs text-muted-foreground sm:text-sm">
                      {formatDistanceToNow(new Date(user.lastActive), { addSuffix: true })}
                    </p>
                  </td>

                  <td className="p-2">
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
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
