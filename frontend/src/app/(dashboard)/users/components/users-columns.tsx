"use client"

import { format } from "date-fns"
import { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import LongText from "@/components/long-text"
import { callTypes, userTypes } from "../data/data"
import { User } from "../data/schema"
import { DataTableColumnHeader } from "./data-table-column-header"
import { DataTableRowActions } from "./data-table-row-actions"

export const columns: ColumnDef<User>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    meta: {
      className: cn(
        "sticky md:table-cell left-0 z-10 rounded-tl",
        "bg-background transition-colors duration-200 group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted pr-2! md:pr-0"
      ),
    },
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "fullName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => {
      const { firstName, lastName } = row.original
      const fullName = `${firstName} ${lastName}`
      return (
        <Button variant="link" className="underline" asChild>
          <Link href={`/users/${row.original.id}`}>
            <LongText className="max-w-36">{fullName}</LongText>
          </Link>
        </Button>
      )
    },
    meta: { className: "w-36" },
  },
  {
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ row }) => (
      <div className="w-fit text-nowrap">{row.getValue("email")}</div>
    ),
  },
  {
    accessorKey: "phoneNumber",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Phone Number" />
    ),
    cell: ({ row }) => <div>{row.getValue("phoneNumber")}</div>,
    enableSorting: false,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Registered Date" />
    ),
    cell: ({ row }) => (
      <div className="w-fit text-nowrap">
        {format(row.getValue("createdAt"), "dd MMM, yyyy")}
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "lastLoginAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Last Login Date" />
    ),
    cell: ({ row }) => (
      <div className="w-fit text-nowrap">
        {format(row.getValue("lastLoginAt"), "dd MMM, yyyy")}
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const { status } = row.original
      const badgeColor = callTypes.get(status)
      return (
        <div className="flex space-x-2">
          <Badge variant="outline" className={cn("capitalize", badgeColor)}>
            {row.getValue("status")}
          </Badge>
        </div>
      )
    },
    filterFn: "weakEquals",
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "role",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Role" />
    ),
    cell: ({ row }) => {
      const { role } = row.original
      const userType = userTypes.find(({ value }) => value === role)

      if (!userType) {
        return null
      }

      return (
        <div className="flex items-center gap-x-2">
          {userType.icon && (
            <userType.icon size={16} className="text-muted-foreground" />
          )}
          <span className="text-sm capitalize">{row.getValue("role")}</span>
        </div>
      )
    },
    filterFn: "weakEquals",
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "roles",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="RBAC Roles" />
    ),
    cell: ({ row }) => {
      const roles = row.original.roles || []

      if (roles.length === 0) {
        return <span className="text-xs text-muted-foreground">Aucun</span>
      }

      return (
        <div className="flex flex-wrap gap-1">
          {roles.slice(0, 2).map((role) => (
            <HoverCard key={role.id} openDelay={200}>
              <HoverCardTrigger asChild>
                <Link href="/users/rbac">
                  <Badge
                    variant="secondary"
                    className="text-xs cursor-pointer hover:bg-secondary/80 transition-colors"
                  >
                    {role.name}
                  </Badge>
                </Link>
              </HoverCardTrigger>
              <HoverCardContent className="w-80" side="top">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">{role.name}</h4>
                  {role.description && (
                    <p className="text-sm text-muted-foreground">
                      {role.description}
                    </p>
                  )}
                  <div className="flex items-center pt-2">
                    <span className="text-xs text-muted-foreground">
                      Code: <span className="font-mono">{role.code}</span>
                    </span>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          ))}
          {roles.length > 2 && (
            <HoverCard openDelay={200}>
              <HoverCardTrigger asChild>
                <Link href="/users/rbac">
                  <Badge variant="outline" className="text-xs cursor-pointer hover:bg-accent transition-colors">
                    +{roles.length - 2}
                  </Badge>
                </Link>
              </HoverCardTrigger>
              <HoverCardContent className="w-80" side="top">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Autres rôles</h4>
                  <div className="space-y-1">
                    {roles.slice(2).map((role) => (
                      <div key={role.id} className="text-sm">
                        • {role.name}
                      </div>
                    ))}
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
        </div>
      )
    },
    enableSorting: false,
  },
  {
    accessorKey: "groups",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Groups" />
    ),
    cell: ({ row }) => {
      const groups = row.original.groups || []

      if (groups.length === 0) {
        return <span className="text-xs text-muted-foreground">Aucun</span>
      }

      return (
        <div className="flex flex-wrap gap-1">
          {groups.slice(0, 2).map((group) => (
            <HoverCard key={group.id} openDelay={200}>
              <HoverCardTrigger asChild>
                <Link href="/users/groups">
                  <Badge
                    variant="secondary"
                    className="text-xs cursor-pointer hover:bg-secondary/80 transition-colors"
                  >
                    {group.name}
                  </Badge>
                </Link>
              </HoverCardTrigger>
              <HoverCardContent className="w-80" side="top">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">{group.name}</h4>
                  {group.description && (
                    <p className="text-sm text-muted-foreground">
                      {group.description}
                    </p>
                  )}
                  <div className="flex items-center pt-2">
                    <span className="text-xs text-muted-foreground">
                      Code: <span className="font-mono">{group.code}</span>
                    </span>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          ))}
          {groups.length > 2 && (
            <HoverCard openDelay={200}>
              <HoverCardTrigger asChild>
                <Link href="/users/groups">
                  <Badge variant="outline" className="text-xs cursor-pointer hover:bg-accent transition-colors">
                    +{groups.length - 2}
                  </Badge>
                </Link>
              </HoverCardTrigger>
              <HoverCardContent className="w-80" side="top">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Autres groupes</h4>
                  <div className="space-y-1">
                    {groups.slice(2).map((group) => (
                      <div key={group.id} className="text-sm">
                        • {group.name}
                      </div>
                    ))}
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
        </div>
      )
    },
    enableSorting: false,
  },
  {
    id: "actions",
    cell: DataTableRowActions,
  },
]
