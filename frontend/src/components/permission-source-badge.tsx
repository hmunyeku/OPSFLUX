import { Badge } from "@/components/ui/badge"
import { Shield, Users, User, Lock } from "lucide-react"
import { PermissionSource } from "@/app/(dashboard)/users/data/user-permissions-api"

interface PermissionSourceBadgeProps {
  source: PermissionSource
  sourceName?: string | null
  showIcon?: boolean
}

export function PermissionSourceBadge({
  source,
  sourceName,
  showIcon = true,
}: PermissionSourceBadgeProps) {
  const getSourceConfig = () => {
    switch (source) {
      case 'default':
        return {
          label: 'Système',
          variant: 'secondary' as const,
          icon: Lock,
          className: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300',
        }
      case 'role':
        return {
          label: sourceName || 'Rôle',
          variant: 'default' as const,
          icon: Shield,
          className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900 dark:text-emerald-300',
        }
      case 'group':
        return {
          label: sourceName || 'Groupe',
          variant: 'default' as const,
          icon: Users,
          className: 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300',
        }
      case 'personal':
        return {
          label: sourceName || 'Personnel',
          variant: 'default' as const,
          icon: User,
          className: 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-300',
        }
      default:
        return {
          label: 'Inconnu',
          variant: 'outline' as const,
          icon: Lock,
          className: '',
        }
    }
  }

  const config = getSourceConfig()
  const Icon = config.icon

  return (
    <Badge variant={config.variant} className={`text-xs ${config.className}`}>
      {showIcon && <Icon className="mr-1 h-3 w-3" />}
      {config.label}
    </Badge>
  )
}
