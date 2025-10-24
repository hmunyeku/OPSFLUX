"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Mail, Clock, AlertCircle } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { getInvitations } from "../api"
import { useSession } from "next-auth/react"
import { ContactInvitation, InvitationStatus } from "../types"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"
import { differenceInDays } from "date-fns"

interface PendingInvitationsConfig {
  limit?: number
  showExpiryDate?: boolean
  highlightExpiring?: boolean
  expiringThresholdDays?: number
}

interface PendingInvitationsProps {
  config?: PendingInvitationsConfig
}

export default function ThirdPartiesPendingInvitations({ config }: PendingInvitationsProps) {
  const { data: session } = useSession()
  const [invitations, setInvitations] = useState<ContactInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const {
    limit = 10,
    showExpiryDate = true,
    highlightExpiring = true,
    expiringThresholdDays = 2,
  } = config || {}

  useEffect(() => {
    const fetchInvitations = async () => {
      if (!session?.user?.access_token) return

      try {
        setLoading(true)
        const data = await getInvitations(session.user.access_token, {
          limit,
          skip: 0,
          status: InvitationStatus.PENDING,
        })
        setInvitations(data.data || [])
        setError(null)
      } catch (err: any) {
        setError(err.message || "Erreur lors du chargement des invitations")
      } finally {
        setLoading(false)
      }
    }

    fetchInvitations()
  }, [session, limit])

  if (loading) {
    return (
      <Card className="w-full h-full">
        <CardHeader>
          <CardTitle>Invitations en Attente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
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

  const isExpiringSoon = (expiresAt: string) => {
    const daysUntilExpiry = differenceInDays(new Date(expiresAt), new Date())
    return daysUntilExpiry <= expiringThresholdDays && daysUntilExpiry >= 0
  }

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date()
  }

  return (
    <Card className="w-full h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Invitations en Attente
        </CardTitle>
        <CardDescription>
          {invitations.length} invitation(s) en attente de réponse
        </CardDescription>
      </CardHeader>
      <CardContent>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucune invitation en attente
          </p>
        ) : (
          <div className="space-y-2">
            {invitations.slice(0, limit).map((invitation) => {
              const expiring = highlightExpiring && isExpiringSoon(invitation.expires_at)
              const expired = isExpired(invitation.expires_at)

              return (
                <div
                  key={invitation.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                    expired
                      ? "border-destructive bg-destructive/5"
                      : expiring
                      ? "border-orange-300 bg-orange-50"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div
                    className={`h-10 w-10 rounded flex items-center justify-center flex-shrink-0 ${
                      expired
                        ? "bg-destructive/10"
                        : expiring
                        ? "bg-orange-100"
                        : "bg-primary/10"
                    }`}
                  >
                    {expired || expiring ? (
                      <AlertCircle
                        className={`h-5 w-5 ${
                          expired ? "text-destructive" : "text-orange-600"
                        }`}
                      />
                    ) : (
                      <Mail className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm">Contact ID: {invitation.contact_id}</span>
                      {invitation.can_be_admin && (
                        <Badge variant="outline" className="text-xs bg-purple-50 text-purple-800">
                          Admin
                        </Badge>
                      )}
                    </div>
                    {invitation.message && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {invitation.message}
                      </p>
                    )}
                    {showExpiryDate && (
                      <div className="flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3" />
                        {expired ? (
                          <span className="text-destructive font-medium">Expirée</span>
                        ) : (
                          <span className={expiring ? "text-orange-600 font-medium" : "text-muted-foreground"}>
                            Expire{" "}
                            {formatDistanceToNow(new Date(invitation.expires_at), {
                              addSuffix: true,
                              locale: fr,
                            })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
