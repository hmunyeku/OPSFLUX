"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Award, Building, Users } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { getCompanies } from "../api"
import { useSession } from "next-auth/react"
import { Company, CompanyTypeLabels } from "../types"

interface TopCompaniesConfig {
  limit?: number
  showContactCount?: boolean
  showType?: boolean
  orderBy?: "contact_count" | "name"
}

interface TopCompaniesProps {
  config?: TopCompaniesConfig
}

export default function ThirdPartiesTopCompanies({ config }: TopCompaniesProps) {
  const { data: session } = useSession()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const {
    limit = 5,
    showContactCount = true,
    showType = true,
    orderBy = "contact_count",
  } = config || {}

  useEffect(() => {
    const fetchCompanies = async () => {
      if (!session?.user?.access_token) return

      try {
        setLoading(true)
        // Récupérer plus de données pour pouvoir trier localement
        const data = await getCompanies(session.user.access_token, {
          limit: 50,
          skip: 0,
        })

        let sortedCompanies = data.data || []

        // Trier selon le critère choisi
        if (orderBy === "contact_count") {
          sortedCompanies = sortedCompanies.sort(
            (a, b) => (b.contact_count || 0) - (a.contact_count || 0)
          )
        } else {
          sortedCompanies = sortedCompanies.sort((a, b) => a.name.localeCompare(b.name))
        }

        setCompanies(sortedCompanies)
        setError(null)
      } catch (err: any) {
        setError(err.message || "Erreur lors du chargement des entreprises")
      } finally {
        setLoading(false)
      }
    }

    fetchCompanies()
  }, [session, orderBy])

  if (loading) {
    return (
      <Card className="w-full h-full">
        <CardHeader>
          <CardTitle>Top Entreprises</CardTitle>
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

  const getMedalColor = (index: number) => {
    switch (index) {
      case 0:
        return "text-yellow-500"
      case 1:
        return "text-gray-400"
      case 2:
        return "text-orange-600"
      default:
        return "text-muted-foreground"
    }
  }

  return (
    <Card className="w-full h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Award className="h-5 w-5" />
          Top Entreprises
        </CardTitle>
        <CardDescription>
          {orderBy === "contact_count"
            ? "Entreprises avec le plus de contacts"
            : "Entreprises principales"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {companies.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucune entreprise trouvée
          </p>
        ) : (
          <div className="space-y-2">
            {companies.slice(0, limit).map((company, index) => (
              <div
                key={company.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-center w-8">
                  {index < 3 ? (
                    <Award className={`h-5 w-5 ${getMedalColor(index)}`} />
                  ) : (
                    <span className="text-sm font-semibold text-muted-foreground">
                      #{index + 1}
                    </span>
                  )}
                </div>
                <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{company.name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {showType && (
                      <Badge
                        variant="outline"
                        className={`text-xs ${getTypeColor(company.company_type)}`}
                      >
                        {CompanyTypeLabels[company.company_type]}
                      </Badge>
                    )}
                    {showContactCount && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        <span>{company.contact_count || 0} contact(s)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
