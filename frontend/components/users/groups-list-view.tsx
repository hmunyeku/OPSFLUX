"use client"

import { type Group, getUsersByGroup } from "@/lib/user-management-data"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreVertical } from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"

interface GroupsListViewProps {
  groups: Group[]
}

export function GroupsListView({ groups }: GroupsListViewProps) {
  if (groups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium">No groups found</p>
          <p className="text-sm text-muted-foreground">Try adjusting your search terms</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-2 flex items-center gap-4 border-b pb-2 text-xs font-medium text-muted-foreground">
        <div className="w-80">Group</div>
        <div className="w-32">Members</div>
        <div className="w-24">Admins</div>
        <div className="w-24">Visibility</div>
        <div className="w-40">Category</div>
        <div className="w-32">Created</div>
        <div className="w-32">Last Active</div>
        <div className="w-16">Actions</div>
      </div>

      {/* Rows */}
      <div className="space-y-1">
        {groups.map((group) => {
          const groupMembers = getUsersByGroup(group.id)
          const firstThreeMembers = groupMembers.slice(0, 3)

          return (
            <div key={group.id} className="flex items-center gap-4 rounded-md p-2 transition-colors hover:bg-muted/50">
              {/* Group */}
              <div className="flex w-80 items-center gap-3">
                <div className="text-2xl">{group.icon}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{group.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{group.type}</p>
                </div>
              </div>

              {/* Members */}
              <div className="w-32">
                <div className="flex items-center gap-1">
                  <div className="flex -space-x-1">
                    {firstThreeMembers.map((member) => (
                      <Avatar key={member.id} className="h-6 w-6 border border-background">
                        <AvatarFallback className="text-[10px]">
                          {member.firstName[0]}
                          {member.lastName[0]}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <span className="text-sm">{group.memberCount}</span>
                </div>
              </div>

              {/* Admins */}
              <div className="w-24">
                <p className="text-sm">{group.adminCount}</p>
              </div>

              {/* Visibility */}
              <div className="w-24">
                <Badge
                  variant={
                    group.visibility === "public" ? "default" : group.visibility === "private" ? "secondary" : "outline"
                  }
                  className="text-xs"
                >
                  {group.visibility}
                </Badge>
              </div>

              {/* Category */}
              <div className="w-40">
                <div className="flex flex-wrap gap-1">
                  {group.category.slice(0, 2).map((cat) => (
                    <Badge key={cat} variant="outline" className="text-xs">
                      {cat}
                    </Badge>
                  ))}
                  {group.category.length > 2 && (
                    <Badge variant="outline" className="text-xs">
                      +{group.category.length - 2}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Created */}
              <div className="w-32">
                <p className="text-sm text-muted-foreground">{format(new Date(group.createdAt), "MMM d, yyyy")}</p>
              </div>

              {/* Last Active */}
              <div className="w-32">
                <p className="truncate text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(group.lastActive), { addSuffix: true })}
                </p>
              </div>

              {/* Actions */}
              <div className="w-16">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>View Group</DropdownMenuItem>
                    <DropdownMenuItem>Edit Group</DropdownMenuItem>
                    <DropdownMenuItem>Manage Members</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">Delete Group</DropdownMenuItem>
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
