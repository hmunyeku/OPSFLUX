"use client"

import { useState, useEffect } from "react"
import { useHeaderContext } from "@/components/header-context"
import { mockContacts, type Contact as MockContact } from "@/lib/tiers-data"
import { ContactsApi, type Contact as ApiContact } from "@/lib/contacts-api"

// Transform API data to match component format
type Contact = MockContact
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Filter, Grid3x3, List, MoreVertical, Mail, Phone, Building2, Calendar, TableIcon, Plus } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type ViewMode = "grid" | "list" | "table"

const statusColors = {
  active: "bg-green-500/10 text-green-700 dark:text-green-400",
  inactive: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
}

export function ContactsContent() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [contacts, setContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()

  // Load contacts from API
  const loadContacts = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const contactsResponse = await ContactsApi.listContacts({ limit: 1000 })

      // Transform API contacts to component format
      const transformedContacts: Contact[] = contactsResponse.data.map((apiContact) => ({
        id: apiContact.id,
        firstName: apiContact.first_name,
        lastName: apiContact.last_name,
        email: apiContact.email,
        phone: apiContact.phone,
        mobile: apiContact.mobile,
        position: apiContact.position,
        company: apiContact.company_name,
        companyId: apiContact.company_id,
        department: apiContact.department,
        tags: apiContact.tags,
        preferredContact: apiContact.preferred_contact,
        lastContact: apiContact.last_contact || new Date().toISOString(),
        notes: apiContact.notes,
        avatar: apiContact.avatar,
        linkedIn: apiContact.linked_in,
        status: apiContact.status,
      }))

      setContacts(transformedContacts)
    } catch (err) {
      console.error('Failed to load contacts:', err)
      setError('Échec du chargement des contacts. Utilisation des données de test.')
      setContacts(mockContacts)
    } finally {
      setIsLoading(false)
    }
  }

  // Load data on mount
  useEffect(() => {
    loadContacts()
  }, [])

  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher contacts...",
      onSearchChange: setSearchQuery,
      contextualButtons: [
        {
          label: "Nouveau contact",
          icon: Plus,
          onClick: () => {
            // TODO: Open new contact dialog
            console.log("New contact")
          },
        },
      ],
    })

    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader])

  const filteredContacts = contacts.filter(
    (contact) =>
      contact.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.position.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4" />
          <p className="text-sm text-muted-foreground">Chargement des contacts...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-2 p-2 sm:p-3 md:p-4">
      {/* Error message */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 mb-2">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select defaultValue="all">
          <SelectTrigger className="h-8 w-[100px] text-xs sm:w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="active">Actifs</SelectItem>
            <SelectItem value="inactive">Inactifs</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-transparent text-xs">
          <Filter className="h-3 w-3" />
          <span className="hidden sm:inline">Filtres</span>
        </Button>
        <div className="ml-auto flex items-center gap-0.5 rounded-md border p-0.5">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setViewMode("grid")}
          >
            <Grid3x3 className="h-3 w-3" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setViewMode("list")}
          >
            <List className="h-3 w-3" />
          </Button>
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setViewMode("table")}
          >
            <TableIcon className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{filteredContacts.length} contacts</span>
      </div>

      <div className="flex-1 overflow-auto">
        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredContacts.map((contact) => (
              <Card
                key={contact.id}
                className="group relative flex flex-col gap-2 p-3 transition-all hover:shadow-md sm:p-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-10 w-10 sm:h-8 sm:w-8">
                      <AvatarFallback className="text-xs sm:text-[10px]">
                        {contact.firstName[0]}
                        {contact.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold sm:text-xs">
                        {contact.firstName} {contact.lastName}
                      </h3>
                      <p className="truncate text-xs text-muted-foreground sm:text-[10px]">{contact.position}</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100">
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-xs">Voir détails</DropdownMenuItem>
                      <DropdownMenuItem className="text-xs">Modifier</DropdownMenuItem>
                      <DropdownMenuItem className="text-xs">Envoyer email</DropdownMenuItem>
                      <DropdownMenuItem className="text-xs text-destructive">Supprimer</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className={`h-4 px-1.5 text-[9px] ${statusColors[contact.status]}`}>
                    {contact.status}
                  </Badge>
                  {contact.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="outline" className="h-4 px-1.5 text-[9px]">
                      {tag}
                    </Badge>
                  ))}
                </div>

                <div className="space-y-1 text-xs text-muted-foreground sm:text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 shrink-0 sm:h-3 sm:w-3" />
                    <span className="truncate">{contact.company}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 shrink-0 sm:h-3 sm:w-3" />
                    <span className="truncate">{contact.email}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 shrink-0 sm:h-3 sm:w-3" />
                    <span className="truncate">{contact.phone}</span>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between border-t pt-2 text-xs text-muted-foreground sm:text-[10px]">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                    <span className="hidden sm:inline">Dernier contact:</span>
                    <span className="sm:hidden">Dernier:</span>
                    <span>{new Date(contact.lastContact).toLocaleDateString("fr-FR")}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : viewMode === "list" ? (
          <div className="space-y-2">
            {filteredContacts.map((contact) => (
              <Card key={contact.id} className="group p-3 transition-all hover:shadow-md sm:p-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex items-center gap-3 sm:min-w-0 sm:flex-1">
                    <Avatar className="h-10 w-10 shrink-0 sm:h-8 sm:w-8">
                      <AvatarFallback className="text-xs sm:text-[10px]">
                        {contact.firstName[0]}
                        {contact.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold sm:text-xs">
                          {contact.firstName} {contact.lastName}
                        </h3>
                        <Badge variant="secondary" className={`h-4 px-1.5 text-[9px] ${statusColors[contact.status]}`}>
                          {contact.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground sm:text-[10px]">
                        {contact.position} • {contact.company}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-4 sm:text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 shrink-0 sm:h-3 sm:w-3" />
                      <span className="truncate">{contact.email}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 shrink-0 sm:h-3 sm:w-3" />
                      <span>{contact.phone}</span>
                    </div>
                    <div className="hidden items-center gap-1.5 lg:flex">
                      <Calendar className="h-3 w-3 shrink-0" />
                      <span>{new Date(contact.lastContact).toLocaleDateString("fr-FR")}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="outline" className="h-4 px-1.5 text-[9px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 shrink-0 p-0">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="text-xs">Voir détails</DropdownMenuItem>
                        <DropdownMenuItem className="text-xs">Modifier</DropdownMenuItem>
                        <DropdownMenuItem className="text-xs">Envoyer email</DropdownMenuItem>
                        <DropdownMenuItem className="text-xs text-destructive">Supprimer</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1200px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8 text-[10px] font-semibold">Contact</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Poste</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Entreprise</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Email</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Téléphone</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Statut</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Tags</TableHead>
                    <TableHead className="h-8 text-[10px] font-semibold">Dernier contact</TableHead>
                    <TableHead className="h-8 w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContacts.map((contact) => (
                    <TableRow key={contact.id} className="group">
                      <TableCell className="py-1.5">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[9px]">
                              {contact.firstName[0]}
                              {contact.lastName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs font-medium">
                            {contact.firstName} {contact.lastName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 text-xs text-muted-foreground">{contact.position}</TableCell>
                      <TableCell className="py-1.5 text-xs text-muted-foreground">{contact.company}</TableCell>
                      <TableCell className="py-1.5 text-xs text-muted-foreground">{contact.email}</TableCell>
                      <TableCell className="py-1.5 text-xs text-muted-foreground">{contact.phone}</TableCell>
                      <TableCell className="py-1.5">
                        <Badge variant="secondary" className={`h-4 px-1.5 text-[9px] ${statusColors[contact.status]}`}>
                          {contact.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {contact.tags.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="h-4 px-1.5 text-[9px]">
                              {tag}
                            </Badge>
                          ))}
                          {contact.tags.length > 2 && (
                            <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                              +{contact.tags.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 text-[10px] text-muted-foreground">
                        {new Date(contact.lastContact).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <MoreVertical className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-xs">Voir détails</DropdownMenuItem>
                            <DropdownMenuItem className="text-xs">Modifier</DropdownMenuItem>
                            <DropdownMenuItem className="text-xs">Envoyer email</DropdownMenuItem>
                            <DropdownMenuItem className="text-xs text-destructive">Supprimer</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
