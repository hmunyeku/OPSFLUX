"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Users } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { getContacts } from "../api"
import { useSession } from "next-auth/react"
import { Contact, ContactRoleLabels } from "../types"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"

interface RecentContactsConfig {
  limit?: number
  showCompany?: boolean
  showRole?: boolean
  showDate?: boolean
}

interface RecentContactsProps {
  config?: RecentContactsConfig
}

export default function ThirdPartiesRecentContacts({ config }: RecentContactsProps) {
  const { data: session } = useSession()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { limit = 5, showCompany = true, showRole = true, showDate = true } = config || {}

  useEffect(() => {
    const fetchContacts = async () => {
      if (!session?.user?.access_token) return

      try {
        setLoading(true)
        const data = await getContacts(session.user.access_token, {
          limit,
          skip: 0,
        })
        setContacts(data.data || [])
        setError(null)
      } catch (err: any) {
        setError(err.message || "Erreur lors du chargement des contacts")
      } finally {
        setLoading(false)
      }
    }

    fetchContacts()
  }, [session, limit])

  if (loading) {
    return (
      <Card className="w-full h-full">
        <CardHeader>
          <CardTitle>Contacts Récents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
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

  const getInitials = (contact: Contact) => {
    return `${contact.first_name?.[0] || ""}${contact.last_name?.[0] || ""}`.toUpperCase()
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case "ceo":
        return "bg-purple-100 text-purple-800"
      case "manager":
        return "bg-blue-100 text-blue-800"
      case "technical":
        return "bg-green-100 text-green-800"
      case "commercial":
        return "bg-orange-100 text-orange-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <Card className="w-full h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" />
          Contacts Récents
        </CardTitle>
        <CardDescription>Les {limit} derniers contacts ajoutés</CardDescription>
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucun contact trouvé
          </p>
        ) : (
          <div className="space-y-3">
            {contacts.slice(0, limit).map((contact) => (
              <div
                key={contact.id}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={contact.avatar_url} alt={contact.full_name} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials(contact)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {contact.first_name} {contact.last_name}
                    </span>
                    {contact.is_primary && (
                      <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-800">
                        Principal
                      </Badge>
                    )}
                  </div>
                  {contact.job_title && (
                    <p className="text-xs text-muted-foreground truncate">
                      {contact.job_title}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {showRole && (
                      <Badge variant="outline" className={`text-xs ${getRoleColor(contact.role)}`}>
                        {ContactRoleLabels[contact.role]}
                      </Badge>
                    )}
                  </div>
                  {showDate && (
                    <p className="text-xs text-muted-foreground">
                      Ajouté{" "}
                      {formatDistanceToNow(new Date(contact.created_at), {
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
