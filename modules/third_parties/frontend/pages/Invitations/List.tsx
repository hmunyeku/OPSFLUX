"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import {
  IconSend,
  IconRefresh,
  IconTrash,
  IconCopy,
  IconCheck,
  IconX,
} from "@tabler/icons-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { getInvitations, revokeInvitation, getContacts } from "../../api"
import { InvitationStatusLabels } from "../../types"
import type { ContactInvitation, Contact } from "../../types"
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

export default function InvitationsList() {
  const router = useRouter()
  const { toast } = useToast()

  const [invitations, setInvitations] = useState<ContactInvitation[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)
  const [invitationToRevoke, setInvitationToRevoke] = useState<ContactInvitation | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  useEffect(() => {
    loadInvitations()
    loadContacts()
  }, [statusFilter])

  const loadInvitations = async () => {
    try {
      const token = auth.getToken()
      if (!token) {
        router.push("/login")
        return
      }

      setLoading(true)
      const params: any = { limit: 100 }
      if (statusFilter !== "all") params.status = statusFilter

      const response = await getInvitations(token, params)
      setInvitations(response.data || [])
    } catch (error) {
      console.error("Failed to load invitations:", error)
      toast({
        title: "Erreur",
        description: "Impossible de charger les invitations",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const loadContacts = async () => {
    try {
      const token = auth.getToken()
      if (!token) return

      const response = await getContacts(token, { limit: 1000 })
      setContacts(response.data || [])
    } catch (error) {
      console.error("Failed to load contacts:", error)
    }
  }

  const handleRevoke = async () => {
    if (!invitationToRevoke) return

    try {
      const token = auth.getToken()
      if (!token) return

      await revokeInvitation(token, invitationToRevoke.id)

      toast({
        title: "Invitation révoquée",
        description: "L'invitation a été révoquée avec succès",
      })

      setRevokeDialogOpen(false)
      setInvitationToRevoke(null)
      loadInvitations()
    } catch (error) {
      console.error("Failed to revoke invitation:", error)
      toast({
        title: "Erreur",
        description: "Impossible de révoquer l'invitation",
        variant: "destructive",
      })
    }
  }

  const copyInvitationLink = async (token: string) => {
    const baseUrl = window.location.origin
    const invitationUrl = `${baseUrl}/accept-invitation/${token}`

    try {
      await navigator.clipboard.writeText(invitationUrl)
      setCopiedToken(token)
      toast({
        title: "Lien copié",
        description: "Le lien d'invitation a été copié dans le presse-papiers",
      })

      setTimeout(() => setCopiedToken(null), 2000)
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de copier le lien",
        variant: "destructive",
      })
    }
  }

  const getContactName = (contactId: string) => {
    const contact = contacts.find((c) => c.id === contactId)
    return contact ? `${contact.first_name} ${contact.last_name}` : "-"
  }

  const getContactEmail = (contactId: string) => {
    const contact = contacts.find((c) => c.id === contactId)
    return contact?.email || "-"
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pending: "outline",
      accepted: "default",
      expired: "secondary",
      revoked: "destructive",
    }

    return (
      <Badge variant={variants[status.toLowerCase()] || "secondary"}>
        {InvitationStatusLabels[status as keyof typeof InvitationStatusLabels]}
      </Badge>
    )
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date()
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <IconSend className="h-8 w-8" />
            Invitations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestion des invitations envoyées aux contacts
          </p>
        </div>
        <Button onClick={loadInvitations} variant="outline">
          <IconRefresh className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                {Object.entries(InvitationStatusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Invitations Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {loading ? "Chargement..." : `${invitations.length} invitation${invitations.length > 1 ? "s" : ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : invitations.length === 0 ? (
            <div className="text-center py-12">
              <IconSend className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Aucune invitation trouvée</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Expire le</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>2FA</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell className="font-medium">
                        {getContactName(invitation.contact_id)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {getContactEmail(invitation.contact_id)}
                      </TableCell>
                      <TableCell>{getStatusBadge(invitation.status)}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          {formatDate(invitation.expires_at)}
                          {isExpired(invitation.expires_at) && invitation.status === "pending" && (
                            <Badge variant="destructive" className="text-xs">
                              Expiré
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {invitation.can_be_admin ? (
                          <IconCheck className="h-4 w-4 text-green-500" />
                        ) : (
                          <IconX className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>
                        {invitation.two_factor_verified ? (
                          <Badge variant="default" className="text-xs">
                            Vérifié
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            En attente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {invitation.status === "pending" && !isExpired(invitation.expires_at) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => copyInvitationLink(invitation.token)}
                            >
                              {copiedToken === invitation.token ? (
                                <IconCheck className="h-4 w-4 text-green-500" />
                              ) : (
                                <IconCopy className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {(invitation.status === "pending" || invitation.status === "expired") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => {
                                setInvitationToRevoke(invitation)
                                setRevokeDialogOpen(true)
                              }}
                            >
                              <IconTrash className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la révocation</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir révoquer cette invitation ? Le contact ne pourra plus utiliser ce lien pour créer un compte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} className="bg-destructive hover:bg-destructive/90">
              Révoquer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
