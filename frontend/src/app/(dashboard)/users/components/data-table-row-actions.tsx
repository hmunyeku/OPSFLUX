"use client"

import { DotsHorizontalIcon } from "@radix-ui/react-icons"
import { IconChecklist, IconEdit, IconTrash, IconShield, IconUsers } from "@tabler/icons-react"
import { Row } from "@tanstack/react-table"
import Link from "next/link"
import { useState } from "react"
import useDialogState from "@/hooks/use-dialog-state"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { User } from "../data/schema"
import { UsersActionDialog } from "./users-action-dialog"
import { UsersDeactivateDialog } from "./users-deactivate-dialog"
import { AssignRolesDialog } from "./assign-roles-dialog"
import { AssignGroupsDialog } from "./assign-groups-dialog"

interface Props {
  row: Row<User>
  onRefresh?: () => void
}

export function DataTableRowActions({ row, onRefresh }: Props) {
  const [open, setOpen] = useDialogState<"edit" | "deactivate" | "roles" | "groups">(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleSuccess = () => {
    setRefreshKey(prev => prev + 1)
    if (onRefresh) {
      onRefresh()
    }
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="data-[state=open]:bg-muted flex h-8 w-8 p-0"
          >
            <DotsHorizontalIcon className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[180px]">
          <DropdownMenuItem asChild>
            <Link href={`/users/${row.original.id}`}>
              View Detail
              <DropdownMenuShortcut>
                <IconChecklist size={16} />
              </DropdownMenuShortcut>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen("edit")}>
            Edit
            <DropdownMenuShortcut>
              <IconEdit size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setOpen("roles")}>
            Assign Roles
            <DropdownMenuShortcut>
              <IconShield size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen("groups")}>
            Assign Groups
            <DropdownMenuShortcut>
              <IconUsers size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setOpen("deactivate")}
            className="text-red-500!"
          >
            Deactivate
            <DropdownMenuShortcut>
              <IconTrash size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UsersActionDialog
        key={`user-edit-${row.original.id}`}
        open={open === "edit"}
        onOpenChange={() => setOpen("edit")}
        currentRow={row.original}
      />

      <UsersDeactivateDialog
        key={`user-deactivate-${row.original.id}`}
        open={open === "deactivate"}
        onOpenChange={() => setOpen("deactivate")}
        currentRow={row.original}
      />

      <AssignRolesDialog
        key={`user-roles-${row.original.id}-${refreshKey}`}
        open={open === "roles"}
        onOpenChange={() => setOpen("roles")}
        userId={row.original.id}
        userEmail={row.original.email}
        currentRoles={row.original.roles || []}
        onSuccess={handleSuccess}
      />

      <AssignGroupsDialog
        key={`user-groups-${row.original.id}-${refreshKey}`}
        open={open === "groups"}
        onOpenChange={() => setOpen("groups")}
        userId={row.original.id}
        userEmail={row.original.email}
        currentGroups={row.original.groups || []}
        onSuccess={handleSuccess}
      />
    </>
  )
}
