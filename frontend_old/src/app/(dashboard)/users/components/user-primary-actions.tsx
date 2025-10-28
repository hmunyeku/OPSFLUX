"use client"

import { IconMailPlus, IconUserPlus, IconChevronDown } from "@tabler/icons-react"
import useDialogState from "@/hooks/use-dialog-state"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UsersActionDialog } from "./users-action-dialog"
import { UsersInviteDialog } from "./users-invite-dialog"

interface Props {
  onUserCreated?: () => void
}

export function UserPrimaryActions({ onUserCreated }: Props) {
  const [open, setOpen] = useDialogState<"invite" | "add">(null)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="gap-2">
            <IconUserPlus size={18} />
            <span>Gérer les utilisateurs</span>
            <IconChevronDown size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setOpen("add")} className="cursor-pointer">
            <IconUserPlus size={18} className="mr-2" />
            <span>Ajouter un utilisateur</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen("invite")} className="cursor-pointer">
            <IconMailPlus size={18} className="mr-2" />
            <span>Inviter un utilisateur</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UsersActionDialog
        key="user-add"
        open={open === "add"}
        onOpenChange={() => setOpen("add")}
        onUserCreated={onUserCreated}
      />

      <UsersInviteDialog
        key="user-invite"
        open={open === "invite"}
        onOpenChange={() => setOpen("invite")}
        onUserCreated={onUserCreated}
      />
    </>
  )
}
