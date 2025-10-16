"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  User,
  Settings,
  LogOut,
  Shield,
  Bell,
  Palette,
  ExternalLink
} from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { useAppConfig } from "@/contexts/app-config-context"
import { auth } from "@/lib/auth"
import { useToast } from "@/hooks/use-toast"

export function UserMenu() {
  const { user } = useAuth()
  const { config } = useAppConfig()
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)

  const getInitials = (name: string | undefined, email: string | undefined) => {
    if (name) {
      const parts = name.split(" ")
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      }
      return name.slice(0, 2).toUpperCase()
    }
    if (email) {
      return email.slice(0, 2).toUpperCase()
    }
    return "U"
  }

  const handleLogout = () => {
    auth.removeToken()
    toast({
      title: "Déconnexion réussie",
      description: "À bientôt !",
    })
    router.push("/login")
  }

  const handleNavigate = (path: string) => {
    setOpen(false)
    router.push(path)
  }

  const handleOpenIntranet = () => {
    if (config.intranet_url && user?.intranet_identifier) {
      const url = config.intranet_url.replace('{user_id}', user.intranet_identifier)
      window.open(url, '_blank')
      setOpen(false)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="relative flex h-9 w-9 items-center justify-center rounded-full transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user?.avatar_url || undefined} alt={user?.full_name || "User"} />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {getInitials(user?.full_name, user?.email)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user?.full_name || "Utilisateur"}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleNavigate("/settings/profile?tab=profile")}>
          <User className="mr-2 h-4 w-4" />
          <span>Mon profil</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleNavigate("/settings/profile?tab=informations")}>
          <Settings className="mr-2 h-4 w-4" />
          <span>Informations</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleNavigate("/settings/profile?tab=preferences")}>
          <Palette className="mr-2 h-4 w-4" />
          <span>Préférences</span>
        </DropdownMenuItem>
        {config.intranet_url && user?.intranet_identifier && (
          <DropdownMenuItem onClick={handleOpenIntranet}>
            <ExternalLink className="mr-2 h-4 w-4" />
            <span>Intranet</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => handleNavigate("/settings/profile?tab=profile")}>
          <Shield className="mr-2 h-4 w-4" />
          <span>Sécurité (2FA)</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleNavigate("/settings/notifications")}>
          <Bell className="mr-2 h-4 w-4" />
          <span>Notifications</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Déconnexion</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
