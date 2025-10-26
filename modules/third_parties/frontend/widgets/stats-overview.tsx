"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Building, Users, Mail, TrendingUp } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { getCompanyStats } from "../api"
import { useSession } from "next-auth/react"

interface StatsOverviewConfig {
  showCompanies?: boolean
  showContacts?: boolean
  showInvitations?: boolean
  refreshInterval?: number
}

interface StatsOverviewProps {
  config?: StatsOverviewConfig
}

interface Stats {
  total_companies: number
  total_contacts: number
  pending_invitations: number
  companies_growth: number
  contacts_growth: number
}

export default function ThirdPartiesStatsOverview({ config }: StatsOverviewProps) {
  const { data: session } = useSession()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const {
    showCompanies = true,
    showContacts = true,
    showInvitations = true,
    refreshInterval = 300000, // 5 minutes par défaut
  } = config || {}

  useEffect(() => {
    const fetchStats = async () => {
      if (!session?.user?.access_token) return

      try {
        setLoading(true)
        const data = await getCompanyStats(session.user.access_token)
        setStats(data)
        setError(null)
      } catch (err: any) {
        setError(err.message || "Erreur lors du chargement des statistiques")
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, refreshInterval)
    return () => clearInterval(interval)
  }, [session, refreshInterval])

  if (loading) {
    return (
      <Card className="w-full h-full">
        <CardHeader>
          <CardTitle>Aperçu Tiers</CardTitle>
          <CardDescription>Chargement des statistiques...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="w-full h-full border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Erreur</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!stats) return null

  const statItems = [
    {
      label: "Entreprises",
      value: stats.total_companies,
      growth: stats.companies_growth,
      icon: Building,
      show: showCompanies,
      color: "text-blue-600",
    },
    {
      label: "Contacts",
      value: stats.total_contacts,
      growth: stats.contacts_growth,
      icon: Users,
      show: showContacts,
      color: "text-green-600",
    },
    {
      label: "Invitations",
      value: stats.pending_invitations,
      icon: Mail,
      show: showInvitations,
      color: "text-purple-600",
    },
  ].filter((item) => item.show)

  return (
    <Card className="w-full h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Aperçu Tiers</CardTitle>
        <CardDescription>Statistiques des entreprises et contacts</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={`grid grid-cols-${statItems.length} gap-4`}>
          {statItems.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.label} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${item.color}`} />
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{item.value}</span>
                  {item.growth !== undefined && (
                    <span
                      className={`text-xs flex items-center gap-1 ${
                        item.growth > 0 ? "text-green-600" : "text-gray-400"
                      }`}
                    >
                      {item.growth > 0 && <TrendingUp className="h-3 w-3" />}
                      {item.growth > 0 ? `+${item.growth}%` : ""}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
