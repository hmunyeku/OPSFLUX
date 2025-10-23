"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Building } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { getCompanies } from "../api"
import { useSession } from "next-auth/react"
import { Company, CompanyTypeLabels, CompanyStatusLabels } from "../types"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"

interface RecentCompaniesConfig {
  limit?: number
  showType?: boolean
  showStatus?: boolean
  showDate?: boolean
}

interface RecentCompaniesProps {
  config?: RecentCompaniesConfig
}

export default function ThirdPartiesRecentCompanies({ config }: RecentCompaniesProps) {
  const { data: session } = useSession()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { limit = 5, showType = true, showStatus = true, showDate = true } = config || {}

  useEffect(() => {
    const fetchCompanies = async () => {
      if (!session?.user?.access_token) return

      try {
        setLoading(true)
        const data = await getCompanies(session.user.access_token, {
          limit,
          skip: 0,
        })
        setCompanies(data.data || [])
        setError(null)
      } catch (err: any) {
        setError(err.message || "Erreur lors du chargement des entreprises")
      } finally {
        setLoading(false)
      }
    }

    fetchCompanies()
  }, [session, limit])

  if (loading) {
    return (
      <Card className="w-full h-full">
        <CardHeader>
          <CardTitle>Entreprises Récentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800"
      case "inactive":
        return "bg-gray-100 text-gray-800"
      case "prospect":
        return "bg-blue-100 text-blue-800"
      case "archived":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "client":
        return "bg-purple-100 text-purple-800"
      case "supplier":
        return "bg-orange-100 text-orange-800"
      case "partner":
        return "bg-cyan-100 text-cyan-800"
      case "contractor":
        return "bg-yellow-100 text-yellow-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <Card className="w-full h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Building className="h-5 w-5" />
          Entreprises Récentes
        </CardTitle>
        <CardDescription>Les {limit} dernières entreprises ajoutées</CardDescription>
      </CardHeader>
      <CardContent>
        {companies.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucune entreprise trouvée
          </p>
        ) : (
          <div className="space-y-3">
            {companies.slice(0, limit).map((company) => (
              <div
                key={company.id}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="font-medium text-sm truncate">{company.name}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {showType && (
                      <Badge variant="outline" className={`text-xs ${getTypeColor(company.company_type)}`}>
                        {CompanyTypeLabels[company.company_type]}
                      </Badge>
                    )}
                    {showStatus && (
                      <Badge variant="outline" className={`text-xs ${getStatusColor(company.status)}`}>
                        {CompanyStatusLabels[company.status]}
                      </Badge>
                    )}
                  </div>
                  {showDate && (
                    <p className="text-xs text-muted-foreground">
                      Ajoutée{" "}
                      {formatDistanceToNow(new Date(company.created_at), {
                        addSuffix: true,
                        locale: fr,
                      })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
