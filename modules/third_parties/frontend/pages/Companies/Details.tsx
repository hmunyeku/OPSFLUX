"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import {
  IconArrowLeft,
  IconEdit,
  IconTrash,
  IconBuilding,
  IconMail,
  IconPhone,
  IconWorld,
  IconMapPin,
  IconUser,
  IconPlus,
} from "@tabler/icons-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { getCompany, deleteCompany, getContacts } from "../../api"
import { CompanyStatusLabels, CompanyTypeLabels, ContactStatusLabels, ContactRoleLabels } from "../../types"
import type { Company, Contact } from "../../types"
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

interface CompanyDetailsProps {
  companyId: string
}

export default function CompanyDetails({ companyId }: CompanyDetailsProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [company, setCompany] = useState<Company | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  useEffect(() => {
    if (companyId) {
      loadCompany()
      loadContacts()
    }
  }, [companyId])

  const loadCompany = async () => {
    try {
      const token = auth.getToken()
      if (!token) {
        router.push("/login")
        return
      }

      setLoading(true)
      const data = await getCompany(token, companyId)
      setCompany(data)
    } catch (error) {
      console.error("Failed to load company:", error)
      toast({
        title: "Erreur",
        description: "Impossible de charger l'entreprise",
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

      const response = await getContacts(token, { company_id: companyId })
      setContacts(response.data || [])
    } catch (error) {
      console.error("Failed to load contacts:", error)
    }
  }

  const handleDelete = async () => {
    if (!company) return

    try {
      const token = auth.getToken()
      if (!token) return

      await deleteCompany(token, company.id)

      toast({
        title: "Entreprise supprimée",
        description: `${company.name} a été supprimée`,
      })

      router.push("/third-parties/companies")
    } catch (error) {
      console.error("Failed to delete company:", error)
      toast({
        title: "Erreur",
        description: "Impossible de supprimer l'entreprise",
        variant: "destructive",
      })
    }
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

  if (!company) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <p>Entreprise non trouvée</p>
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
          onClick={() => router.push("/third-parties/companies")}
        >
          <IconArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <IconBuilding className="h-8 w-8" />
            {company.name}
          </h1>
          {company.legal_name && (
            <p className="text-sm text-muted-foreground mt-1">{company.legal_name}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/third-parties/companies/${company.id}/edit`)}
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
            <CardTitle>Informations générales</CardTitle>
            <div className="flex gap-2">
              <Badge variant="secondary">{CompanyTypeLabels[company.company_type]}</Badge>
              <Badge variant={company.status === "active" ? "default" : "secondary"}>
                {CompanyStatusLabels[company.status]}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              {company.email && (
                <div className="flex items-center gap-3">
                  <IconMail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{company.email}</p>
                  </div>
                </div>
              )}
              {company.phone && (
                <div className="flex items-center gap-3">
                  <IconPhone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Téléphone</p>
                    <p className="font-medium">{company.phone}</p>
                  </div>
                </div>
              )}
              {company.website && (
                <div className="flex items-center gap-3">
                  <IconWorld className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Site web</p>
                    <a
                      href={company.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      {company.website}
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {(company.address_line1 || company.city || company.country) && (
                <div className="flex items-start gap-3">
                  <IconMapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Adresse</p>
                    <div className="font-medium">
                      {company.address_line1 && <p>{company.address_line1}</p>}
                      {company.address_line2 && <p>{company.address_line2}</p>}
                      {company.city && company.postal_code && (
                        <p>{`${company.postal_code} ${company.city}`}</p>
                      )}
                      {company.country && <p>{company.country}</p>}
                    </div>
                  </div>
                </div>
              )}
              {company.registration_number && (
                <div>
                  <p className="text-sm text-muted-foreground">SIRET/SIREN</p>
                  <p className="font-medium">{company.registration_number}</p>
                </div>
              )}
              {company.vat_number && (
                <div>
                  <p className="text-sm text-muted-foreground">N° TVA</p>
                  <p className="font-medium">{company.vat_number}</p>
                </div>
              )}
              {company.industry && (
                <div>
                  <p className="text-sm text-muted-foreground">Secteur</p>
                  <p className="font-medium">{company.industry}</p>
                </div>
              )}
            </div>
          </div>

          {(company.description || company.notes) && (
            <>
              <Separator className="my-6" />
              {company.description && (
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground mb-2">Description</p>
                  <p className="text-sm whitespace-pre-wrap">{company.description}</p>
                </div>
              )}
              {company.notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Notes internes</p>
                  <p className="text-sm whitespace-pre-wrap">{company.notes}</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="contacts" className="w-full">
        <TabsList>
          <TabsTrigger value="contacts">
            Contacts ({contacts.length})
          </TabsTrigger>
          <TabsTrigger value="activity">Activité</TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Contacts</CardTitle>
                <Button
                  size="sm"
                  onClick={() => router.push(`/third-parties/contacts/new?company_id=${company.id}`)}
                >
                  <IconPlus className="h-4 w-4 mr-2" />
                  Ajouter un contact
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <div className="text-center py-12">
                  <IconUser className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Aucun contact</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Poste</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((contact) => (
                      <TableRow
                        key={contact.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/third-parties/contacts/${contact.id}`)}
                      >
                        <TableCell className="font-medium">
                          {contact.first_name} {contact.last_name}
                          {contact.is_primary && (
                            <Badge variant="outline" className="ml-2">
                              Principal
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{contact.job_title || "-"}</TableCell>
                        <TableCell>{contact.email || "-"}</TableCell>
                        <TableCell>{contact.phone || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{ContactRoleLabels[contact.role]}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={contact.status === "active" ? "default" : "secondary"}
                          >
                            {ContactStatusLabels[contact.status]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

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
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer l'entreprise{" "}
              <strong>{company.name}</strong> ? Cette action est irréversible.
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
