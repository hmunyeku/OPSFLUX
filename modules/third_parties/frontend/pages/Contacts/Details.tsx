"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import {
  IconArrowLeft,
  IconEdit,
  IconTrash,
  IconUser,
  IconMail,
  IconPhone,
  IconBuilding,
  IconBrandLinkedin,
  IconBrandTwitter,
  IconSend,
} from "@tabler/icons-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { getContact, deleteContact, getCompany } from "../../api"
import { ContactStatusLabels, ContactRoleLabels } from "../../types"
import type { Contact, Company } from "../../types"
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

interface ContactDetailsProps {
  contactId: string
}

export default function ContactDetails({ contactId }: ContactDetailsProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [contact, setContact] = useState<Contact | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  useEffect(() => {
    if (contactId) {
      loadContact()
    }
  }, [contactId])

  const loadContact = async () => {
    try {
      const token = auth.getToken()
      if (!token) {
        router.push("/login")
        return
      }

      setLoading(true)
      const data = await getContact(token, contactId)
      setContact(data)

      // Load company details
      if (data.company_id) {
        const companyData = await getCompany(token, data.company_id)
        setCompany(companyData)
      }
    } catch (error) {
      console.error("Failed to load contact:", error)
      toast({
        title: "Erreur",
        description: "Impossible de charger le contact",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!contact) return

    try {
      const token = auth.getToken()
      if (!token) return

      await deleteContact(token, contact.id)

      toast({
        title: "Contact supprimé",
        description: `${contact.first_name} ${contact.last_name} a été supprimé`,
      })

      router.push("/third-parties/contacts")
    } catch (error) {
      console.error("Failed to delete contact:", error)
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le contact",
        variant: "destructive",
      })
    }
  }

  const handleInvite = () => {
    if (!contact) return
    router.push(`/third-parties/invitations/new?contact_id=${contact.id}`)
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <Skeleton className="h-12 w-64 mb-6" />
        <div className="grid gap-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <p>Contact non trouvé</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/third-parties/contacts")}
        >
          <IconArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <IconUser className="h-8 w-8" />
            {contact.civility && `${contact.civility} `}
            {contact.first_name} {contact.last_name}
          </h1>
          {contact.job_title && (
            <p className="text-sm text-muted-foreground mt-1">{contact.job_title}</p>
          )}
        </div>
        <div className="flex gap-2">
          {!contact.has_user_account && (
            <Button variant="outline" onClick={handleInvite}>
              <IconSend className="h-4 w-4 mr-2" />
              Inviter
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => router.push(`/third-parties/contacts/${contact.id}/edit`)}
          >
            <IconEdit className="h-4 w-4 mr-2" />
            Modifier
          </Button>
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <IconTrash className="h-4 w-4 mr-2" />
            Supprimer
          </Button>
        </div>
      </div>

      {/* Overview Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Informations du contact</CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline">{ContactRoleLabels[contact.role]}</Badge>
              <Badge variant={contact.status === "active" ? "default" : "secondary"}>
                {ContactStatusLabels[contact.status]}
              </Badge>
              {contact.is_primary && (
                <Badge variant="default">Principal</Badge>
              )}
              {contact.has_user_account && (
                <Badge variant="secondary">Compte utilisateur</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              {company && (
                <div className="flex items-center gap-3">
                  <IconBuilding className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Entreprise</p>
                    <p
                      className="font-medium text-primary hover:underline cursor-pointer"
                      onClick={() => router.push(`/third-parties/companies/${company.id}`)}
                    >
                      {company.name}
                    </p>
                  </div>
                </div>
              )}
              {contact.email && (
                <div className="flex items-center gap-3">
                  <IconMail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <a
                      href={`mailto:${contact.email}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {contact.email}
                    </a>
                  </div>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-3">
                  <IconPhone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Téléphone</p>
                    <p className="font-medium">{contact.phone}</p>
                  </div>
                </div>
              )}
              {contact.mobile && (
                <div className="flex items-center gap-3">
                  <IconPhone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Mobile</p>
                    <p className="font-medium">{contact.mobile}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {contact.department && (
                <div>
                  <p className="text-sm text-muted-foreground">Département</p>
                  <p className="font-medium">{contact.department}</p>
                </div>
              )}
              {contact.extension && (
                <div>
                  <p className="text-sm text-muted-foreground">Extension</p>
                  <p className="font-medium">{contact.extension}</p>
                </div>
              )}
              {contact.linkedin_url && (
                <div className="flex items-center gap-3">
                  <IconBrandLinkedin className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">LinkedIn</p>
                    <a
                      href={contact.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      Voir le profil
                    </a>
                  </div>
                </div>
              )}
              {contact.twitter_handle && (
                <div className="flex items-center gap-3">
                  <IconBrandTwitter className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Twitter</p>
                    <p className="font-medium">{contact.twitter_handle}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {contact.notes && (
            <>
              <Separator className="my-6" />
              <div>
                <p className="text-sm text-muted-foreground mb-2">Notes internes</p>
                <p className="text-sm whitespace-pre-wrap">{contact.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="activity" className="w-full">
        <TabsList>
          <TabsTrigger value="activity">Activité</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Historique d'activité</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Aucune activité récente</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invitations" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Invitations</CardTitle>
                {!contact.has_user_account && (
                  <Button size="sm" onClick={handleInvite}>
                    <IconSend className="h-4 w-4 mr-2" />
                    Envoyer une invitation
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {contact.has_user_account ? (
                <p className="text-sm text-muted-foreground">
                  Ce contact possède déjà un compte utilisateur
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucune invitation envoyée
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le contact{" "}
              <strong>{contact.first_name} {contact.last_name}</strong> ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
