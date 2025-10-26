"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  IconUser,
  IconPlus,
  IconSearch,
  IconFilter,
  IconDownload,
  IconEdit,
  IconTrash,
  IconEye,
  IconBuilding,
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
import { getContacts, deleteContact, getCompanies } from "../../api"
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

export default function ContactsList() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [contacts, setContacts] = useState<Contact[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [companyFilter, setCompanyFilter] = useState<string>(searchParams.get("company_id") || "all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null)

  useEffect(() => {
    loadCompanies()
    loadContacts()
  }, [companyFilter, statusFilter, roleFilter])

  const loadCompanies = async () => {
    try {
      const token = auth.getToken()
      if (!token) return

      const response = await getCompanies(token, { limit: 1000 })
      setCompanies(response.data || [])
    } catch (error) {
      console.error("Failed to load companies:", error)
    }
  }

  const loadContacts = async () => {
    try {
      const token = auth.getToken()
      if (!token) {
        router.push("/login")
        return
      }

      setLoading(true)
      const params: any = { limit: 100 }
      if (search) params.search = search
      if (companyFilter !== "all") params.company_id = companyFilter
      if (statusFilter !== "all") params.status = statusFilter
      if (roleFilter !== "all") params.role = roleFilter

      const response = await getContacts(token, params)
      setContacts(response.data || [])
    } catch (error) {
      console.error("Failed to load contacts:", error)
      toast({
        title: "Erreur",
        description: "Impossible de charger les contacts",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    loadContacts()
  }

  const handleDelete = async () => {
    if (!contactToDelete) return

    try {
      const token = auth.getToken()
      if (!token) return

      await deleteContact(token, contactToDelete.id)

      toast({
        title: "Contact supprimé",
        description: `${contactToDelete.first_name} ${contactToDelete.last_name} a été supprimé`,
      })

      setDeleteDialogOpen(false)
      setContactToDelete(null)
      loadContacts()
    } catch (error) {
      console.error("Failed to delete contact:", error)
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le contact",
        variant: "destructive",
      })
    }
  }

  const getCompanyName = (companyId: string) => {
    const company = companies.find((c) => c.id === companyId)
    return company?.name || "-"
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <IconUser className="h-8 w-8" />
            Contacts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestion des contacts des entreprises tierces
          </p>
        </div>
        <Button onClick={() => router.push("/third-parties/contacts/new")}>
          <IconPlus className="h-4 w-4 mr-2" />
          Nouveau contact
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un contact..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9"
              />
            </div>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Entreprise" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les entreprises</SelectItem>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Rôle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les rôles</SelectItem>
                {Object.entries(ContactRoleLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                {Object.entries(ContactStatusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleSearch} variant="secondary">
              <IconFilter className="h-4 w-4 mr-2" />
              Filtrer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Contacts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {loading ? "Chargement..." : `${contacts.length} contact${contacts.length > 1 ? "s" : ""}`}
            </CardTitle>
            <Button variant="outline" size="sm">
              <IconDownload className="h-4 w-4 mr-2" />
              Exporter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-12">
              <IconUser className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Aucun contact trouvé</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => router.push("/third-parties/contacts/new")}
              >
                <IconPlus className="h-4 w-4 mr-2" />
                Créer le premier contact
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Entreprise</TableHead>
                    <TableHead>Poste</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-semibold">
                              {contact.first_name} {contact.last_name}
                            </div>
                            {contact.is_primary && (
                              <Badge variant="outline" className="mt-1 text-xs">
                                Principal
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <IconBuilding className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{getCompanyName(contact.company_id)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{contact.job_title || "-"}</TableCell>
                      <TableCell className="text-sm">{contact.email || "-"}</TableCell>
                      <TableCell className="text-sm">{contact.phone || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{ContactRoleLabels[contact.role]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={contact.status === "active" ? "default" : "secondary"}>
                          {ContactStatusLabels[contact.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => router.push(`/third-parties/contacts/${contact.id}`)}
                          >
                            <IconEye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => router.push(`/third-parties/contacts/${contact.id}/edit`)}
                          >
                            <IconEdit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => {
                              setContactToDelete(contact)
                              setDeleteDialogOpen(true)
                            }}
                          >
                            <IconTrash className="h-4 w-4" />
                          </Button>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le contact{" "}
              <strong>{contactToDelete?.first_name} {contactToDelete?.last_name}</strong> ? Cette action est irréversible.
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
