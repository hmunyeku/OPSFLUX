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
import { useTranslation } from "@/hooks/use-translation"

interface UsersStatsProps {
  users: User[]
}

export function UsersStats({ users }: UsersStatsProps) {
  const { t } = useTranslation("core.users")
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
      title: t("stats.total"),
      desc: t("stats.total_desc"),
      stat: totalUsers.toString(),
      statDesc: t("stats.total_count", { count: users.length }),
      icon: IconUsersGroup,
    },
    {
      title: t("stats.new_this_month"),
      desc: t("stats.new_this_month_desc"),
      stat: `+${newUsers}`,
      statDesc: t("stats.percentage_of_total", { percentage: ((newUsers/totalUsers)*100).toFixed(0) }),
      icon: IconUsersPlus,
    },
    {
      title: t("stats.invited"),
      desc: t("stats.invited_desc"),
      stat: invitedUsers.toString(),
      statDesc: t("stats.percentage_of_total", { percentage: ((invitedUsers/totalUsers)*100).toFixed(0) }),
      icon: IconUserScan,
    },
    {
      title: t("stats.active"),
      desc: t("stats.active_desc"),
      stat: activeUsers.toString(),
      statDesc: t("stats.percentage_of_total", { percentage: ((activeUsers/totalUsers)*100).toFixed(0) }),
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
