"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import {
  IconMail,
  IconTrash,
  IconRefresh,
  IconClock,
  IconCheck,
  IconX,
  IconPlus,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InviteUserDialog } from "./invite-user-dialog"

interface UserInvitation {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  role_id: string | null
  token: string
  invited_by_id: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export function InvitationsSection() {
  const queryClient = useQueryClient()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)

  // Récupérer la liste des invitations
  const { data: invitations, isLoading } = useQuery({
    queryKey: ["/api/v1/users/invitations"],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/invitations`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to fetch invitations")
      const data = await res.json()
      return data.data as UserInvitation[]
    },
  })

  // Mutation pour révoquer une invitation
  const revokeMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/invitations/${invitationId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      )
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || "Failed to revoke invitation")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/users/invitations"] })
      toast({
        title: "Invitation révoquée",
        description: "L'invitation a été révoquée avec succès.",
      })
      setDeleteId(null)
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  const getStatusBadge = (invitation: UserInvitation) => {
    const now = new Date()
    const expiresAt = new Date(invitation.expires_at)

    if (invitation.accepted_at) {
      return (
        <Badge variant="default" className="bg-green-500">
          <IconCheck className="mr-1 h-3 w-3" />
          Acceptée
        </Badge>
      )
    }

    if (expiresAt < now) {
      return (
        <Badge variant="destructive">
          <IconX className="mr-1 h-3 w-3" />
          Expirée
        </Badge>
      )
    }

    return (
      <Badge variant="secondary">
        <IconClock className="mr-1 h-3 w-3" />
        En attente
      </Badge>
    )
  }

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "d MMM yyyy 'à' HH:mm", { locale: fr })
    } catch {
      return dateString
    }
  }

  const getDaysRemaining = (expiresAt: string) => {
    const now = new Date()
    const expiry = new Date(expiresAt)
    const diffTime = expiry.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return "Expirée"
    if (diffDays === 0) return "Expire aujourd'hui"
    if (diffDays === 1) return "Expire demain"
    return `Expire dans ${diffDays} jours`
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Invitations d'utilisateurs</CardTitle>
              <CardDescription>
                Liste des invitations en attente et acceptées
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/v1/users/invitations"] })}
              >
                <IconRefresh className="mr-2 h-4 w-4" />
                Actualiser
              </Button>
              <Button size="sm" onClick={() => setInviteDialogOpen(true)}>
                <IconPlus className="mr-2 h-4 w-4" />
                Inviter un utilisateur
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <IconRefresh className="h-6 w-6 animate-spin" />
            </div>
          ) : invitations && invitations.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Envoyée le</TableHead>
                    <TableHead>Expiration</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <IconMail className="h-4 w-4 text-muted-foreground" />
                          {invitation.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        {invitation.first_name && invitation.last_name
                          ? `${invitation.first_name} ${invitation.last_name}`
                          : "-"}
                      </TableCell>
                      <TableCell>{getStatusBadge(invitation)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(invitation.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{formatDate(invitation.expires_at)}</span>
                          <span className="text-xs text-muted-foreground">
                            {getDaysRemaining(invitation.expires_at)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {!invitation.accepted_at && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteId(invitation.id)}
                            disabled={revokeMutation.isPending}
                          >
                            <IconTrash className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <IconMail className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">Aucune invitation</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Commencez par inviter des utilisateurs à rejoindre votre équipe.
              </p>
              <Button onClick={() => setInviteDialogOpen(true)}>
                <IconPlus className="mr-2 h-4 w-4" />
                Inviter un utilisateur
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de confirmation de révocation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Révoquer cette invitation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'invitation sera révoquée et le lien ne sera plus valide.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && revokeMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Révoquer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog d'invitation */}
      <InviteUserDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} />
    </>
  )
}
