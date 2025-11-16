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
import { Users, Calendar, MoreVertical } from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"

interface GroupsGridViewProps {
  groups: Group[]
}

export function GroupsGridView({ groups }: GroupsGridViewProps) {
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
    <div className="p-3">
      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {groups.map((group) => {
          const groupMembers = getUsersByGroup(group.id)
          const firstFourMembers = groupMembers.slice(0, 4)
          const remainingCount = Math.max(0, group.memberCount - 4)

          return (
            <div key={group.id} className="group rounded-lg border bg-card p-1.5 transition-all hover:shadow-md">
              <div className="mb-1.5 flex items-start justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="text-xl">{group.icon}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[11px] truncate">{group.name}</h3>
                    <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                      {group.type}
                    </Badge>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <MoreVertical className="h-3.5 w-3.5" />
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

              <div className="mb-1.5 flex items-center gap-1.5">
                <div className="flex -space-x-1.5">
                  {firstFourMembers.map((member) => (
                    <Avatar key={member.id} className="h-5 w-5 border-2 border-background">
                      <AvatarFallback className="text-[8px]">
                        {member.firstName[0]}
                        {member.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {remainingCount > 0 && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-muted text-[8px] font-medium">
                      +{remainingCount}
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-1.5 space-y-0.5 text-[9px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3 w-3" />
                  <span>
                    {group.memberCount} members • {group.adminCount} admins
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  <span>Active since {format(new Date(group.createdAt), "MMM yyyy")}</span>
                </div>
              </div>

              <div className="mb-1.5 flex flex-wrap gap-0.5">
                <Badge
                  variant={
                    group.visibility === "public" ? "default" : group.visibility === "private" ? "secondary" : "outline"
                  }
                  className="text-[9px] h-3.5 px-1"
                >
                  {group.visibility}
                </Badge>
                {group.category.map((cat) => (
                  <Badge key={cat} variant="outline" className="text-[9px] h-3.5 px-1">
                    {cat}
                  </Badge>
                ))}
              </div>

              <div className="flex items-center justify-between border-t pt-1.5 text-[9px] text-muted-foreground">
                <span>Last: {formatDistanceToNow(new Date(group.lastActive), { addSuffix: true })}</span>
                <Button variant="link" size="sm" className="h-auto p-0 text-[9px]">
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
