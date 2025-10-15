import { IconInfoCircle, IconUsersGroup, IconUsersPlus, IconUserScan, IconUserCheck } from "@tabler/icons-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { UserStatProps } from "../data/data"
import { User } from "../data/schema"

interface UsersStatsProps {
  users: User[]
}

export function UsersStats({ users }: UsersStatsProps) {
  // Calculer les statistiques réelles
  const totalUsers = users.length
  const activeUsers = users.filter(u => u.status === 'active').length
  const invitedUsers = users.filter(u => u.status === 'invited').length

  // Calculer les nouveaux utilisateurs (derniers 30 jours)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const newUsers = users.filter(u => new Date(u.createdAt) >= thirtyDaysAgo).length

  const stats: UserStatProps[] = [
    {
      title: "Total Utilisateurs",
      desc: "Nombre total d'utilisateurs",
      stat: totalUsers.toString(),
      statDesc: `${users.length} utilisateurs au total`,
      icon: IconUsersGroup,
    },
    {
      title: "Nouveaux Utilisateurs",
      desc: "Utilisateurs créés dans les 30 derniers jours",
      stat: `+${newUsers}`,
      statDesc: `${((newUsers/totalUsers)*100).toFixed(0)}% du total`,
      icon: IconUsersPlus,
    },
    {
      title: "Invitations en attente",
      desc: "Utilisateurs invités mais pas encore activés",
      stat: invitedUsers.toString(),
      statDesc: `${((invitedUsers/totalUsers)*100).toFixed(0)}% du total`,
      icon: IconUserScan,
    },
    {
      title: "Utilisateurs Actifs",
      desc: "Utilisateurs avec statut actif",
      stat: activeUsers.toString(),
      statDesc: `${((activeUsers/totalUsers)*100).toFixed(0)}% du total`,
      icon: IconUserCheck,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <UserStat key={stat.title} {...stat} />
      ))}
    </div>
  )
}

const UserStat = (props: UserStatProps) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pt-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <props.icon size={16} />
          {props.title}
        </CardTitle>
        <TooltipProvider>
          <Tooltip delayDuration={50}>
            <TooltipTrigger>
              <IconInfoCircle className="text-muted-foreground scale-90 stroke-[1.25]" />
              <span className="sr-only">More Info</span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{props.desc}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="text-2xl font-bold">{props.stat}</div>
        <p className="text-muted-foreground text-xs">{props.statDesc}</p>
      </CardContent>
    </Card>
  )
}
