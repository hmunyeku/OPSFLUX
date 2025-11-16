"use client"

import { useState, useEffect } from "react"
import { useHeaderContext } from "@/components/header-context"
import { mockCompanies, mockContacts, type Company as MockCompany, type Contact as MockContact } from "@/lib/tiers-data"
import { CompaniesApi, type Company as ApiCompany } from "@/lib/companies-api"
import { ContactsApi, type Contact as ApiContact } from "@/lib/contacts-api"

// Transform API data to match component format
type Company = MockCompany
type Contact = MockContact
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import {
  Building2,
  Filter,
  Plus,
  MoreVertical,
  Mail,
  Globe,
  MapPin,
  Star,
  Phone,
  Tag,
  X,
  Save,
  Briefcase,
  FileText,
  Calendar,
  Edit,
  Trash2,
  Download,
  Upload,
  Eye,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Checkbox } from "@/components/ui/checkbox"

const typeColors = {
  client: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  supplier: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
  partner: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  transporter: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800",
}

const statusColors = {
  active: "bg-green-500/10 text-green-700 dark:text-green-400",
  inactive: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  prospect: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
}

const typeLabels = {
  client: "Client",
  supplier: "Fournisseur",
  partner: "Partenaire",
  transporter: "Transporteur",
}

const statusLabels = {
  active: "Actif",
  inactive: "Inactif",
  prospect: "Prospect",
}

export function CompaniesContent() {
  const [searchQuery, setSearchQuery] = useState("")
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNewCompanySheet, setShowNewCompanySheet] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [showCompanyDetail, setShowCompanyDetail] = useState(false)

  const { setContextualHeader, clearContextualHeader } = useHeaderContext()

  // Load companies and contacts from API
  const loadCompanies = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Load companies
      const companiesResponse = await CompaniesApi.listCompanies({ limit: 1000 })

      // Transform API companies to component format
      const transformedCompanies: Company[] = companiesResponse.data.map((apiCompany) => ({
        id: apiCompany.id,
        name: apiCompany.name,
        legalName: apiCompany.legal_name,
        siret: apiCompany.siret,
        type: apiCompany.types as any[],
        status: apiCompany.status,
        sector: apiCompany.sector,
        address: apiCompany.address,
        city: apiCompany.city,
        country: apiCompany.country,
        phone: apiCompany.phone,
        email: apiCompany.email,
        website: apiCompany.website,
        logo: apiCompany.logo,
        contactsCount: apiCompany.contacts_count,
        projectsCount: apiCompany.projects_count,
        revenue: apiCompany.revenue,
        rating: apiCompany.rating,
        lastInteraction: apiCompany.last_interaction || new Date().toISOString(),
        createdAt: apiCompany.created_at,
        tags: apiCompany.tags,
      }))

      setCompanies(transformedCompanies)

      // Load all contacts
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
      console.error('Failed to load companies:', err)
      setError('Échec du chargement des entreprises. Utilisation des données de test.')
      setCompanies(mockCompanies)
      setContacts(mockContacts)
    } finally {
      setIsLoading(false)
    }
  }

  // Load data on mount
  useEffect(() => {
    loadCompanies()
  }, [])

  useEffect(() => {
    // Moved the getContextualButtons logic directly into the setContextualHeader call as per the update.
    setContextualHeader({
      searchPlaceholder: "Rechercher une société...", // Updated placeholder text
      searchValue: searchQuery,
      onSearchChange: setSearchQuery,
      contextualButtons: [
        {
          label: "Nouvelle Société",
          icon: Plus,
          onClick: () => setShowNewCompanySheet(true),
          variant: "default" as const,
        },
      ],
    })

    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader, searchQuery]) // Removed activeTab from dependency array as tabs are removed.

  const filteredCompanies = companies.filter(
    (company) =>
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.sector.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleCompanyClick = (company: Company) => {
    setSelectedCompany(company)
    setShowCompanyDetail(true)
  }

  const companyContacts = selectedCompany ? contacts.filter((contact) => contact.companyId === selectedCompany.id) : []

  const stats = {
    totalCompanies: companies.length,
    byType: {
      client: companies.filter((c) => c.type.includes("client")).length,
      supplier: companies.filter((c) => c.type.includes("supplier")).length,
      partner: companies.filter((c) => c.type.includes("partner")).length,
      transporter: companies.filter((c) => c.type.includes("transporter")).length,
    },
    byStatus: {
      active: companies.filter((c) => c.status === "active").length,
      inactive: companies.filter((c) => c.status === "inactive").length,
      prospect: companies.filter((c) => c.status === "prospect").length,
    },
    totalContacts: contacts.length,
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4" />
          <p className="text-sm text-muted-foreground">Chargement des entreprises...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-1.5 p-1.5">
      {/* Error message */}
      {error && (
        <div className="mx-1.5 mb-1.5 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Removed Tabs component and its related state (activeTab) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Select defaultValue="all">
          <SelectTrigger className="h-7 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            <SelectItem value="client">Clients</SelectItem>
            <SelectItem value="supplier">Fournisseurs</SelectItem>
            <SelectItem value="partner">Partenaires</SelectItem>
            <SelectItem value="transporter">Transporteurs</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue="all-status">
          <SelectTrigger className="h-7 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-status">Tous statuts</SelectItem>
            <SelectItem value="active">Actifs</SelectItem>
            <SelectItem value="inactive">Inactifs</SelectItem>
            <SelectItem value="prospect">Prospects</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs bg-transparent">
          <Filter className="h-3 w-3" />
          Filtres
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs bg-transparent">
            <Upload className="h-3 w-3" />
            Importer
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs bg-transparent">
            <Download className="h-3 w-3" />
            Exporter
          </Button>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground">
        {filteredCompanies.length} société{filteredCompanies.length > 1 ? "s" : ""}
      </div>

      <div className="flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-7 w-8 text-[10px]">
                <Checkbox />
              </TableHead>
              <TableHead className="h-7 text-[10px] font-semibold">Société</TableHead>
              <TableHead className="h-7 text-[10px] font-semibold">Type</TableHead>
              <TableHead className="h-7 text-[10px] font-semibold">Secteur</TableHead>
              <TableHead className="h-7 text-[10px] font-semibold">Localisation</TableHead>
              <TableHead className="h-7 text-[10px] font-semibold text-center">Contacts</TableHead>
              <TableHead className="h-7 text-[10px] font-semibold text-center">Statut</TableHead>
              <TableHead className="h-7 w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCompanies.map((company) => (
              <TableRow key={company.id} className="cursor-pointer" onClick={() => handleCompanyClick(company)}>
                <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
                  <Checkbox />
                </TableCell>
                <TableCell className="py-1">
                  <div className="flex items-center gap-1.5">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10">
                      <Building2 className="h-3 w-3 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{company.name}</div>
                      <div className="text-[9px] text-muted-foreground truncate">{company.legalName}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-1">
                  <div className="flex flex-wrap gap-0.5">
                    {company.type.map((type) => (
                      <Badge key={type} variant="outline" className={`h-4 px-1 text-[9px] ${typeColors[type]}`}>
                        {typeLabels[type]}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="py-1 text-xs text-muted-foreground">{company.sector}</TableCell>
                <TableCell className="py-1 text-xs text-muted-foreground">
                  {company.city}, {company.country}
                </TableCell>
                <TableCell className="py-1 text-center">
                  <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                    {company.contactsCount}
                  </Badge>
                </TableCell>
                <TableCell className="py-1 text-center" onClick={(e) => e.stopPropagation()}>
                  <Switch checked={company.status === "active"} className="h-4 w-7" />
                </TableCell>
                <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-xs">
                        <Eye className="h-3 w-3 mr-1.5" />
                        Voir
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs">
                        <Edit className="h-3 w-3 mr-1.5" />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs text-destructive">
                        <Trash2 className="h-3 w-3 mr-1.5" />
                        Archiver
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Removed the TabsContent components for "contacts", "groups", and "statistics" */}
      <Sheet open={showNewCompanySheet} onOpenChange={setShowNewCompanySheet}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-4 sm:px-6 pt-6 pb-4 border-b sticky top-0 bg-background z-10">
            <SheetTitle className="text-xl">Nouvelle entreprise</SheetTitle>
            <SheetDescription>Créer une nouvelle fiche entreprise</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-10rem)]">
            <div className="space-y-3 p-4 sm:p-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Informations de base
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="name" className="text-sm">
                        Nom commercial <span className="text-destructive">*</span>
                      </Label>
                      <Input id="name" placeholder="TotalEnergies" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="legalName" className="text-sm">
                        Raison sociale
                      </Label>
                      <Input id="legalName" placeholder="TotalEnergies SE" className="h-9" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="siret" className="text-sm">
                      SIRET
                    </Label>
                    <Input id="siret" placeholder="542051180" className="h-9" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Type et statut
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">
                      Type d'entreprise <span className="text-destructive">*</span>
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                      {(["client", "supplier", "partner", "competitor"] as const).map((type) => (
                        <div key={type} className="flex items-center space-x-2">
                          <Checkbox id={`type-${type}`} />
                          <label htmlFor={`type-${type}`} className="text-sm capitalize cursor-pointer">
                            {type}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="status" className="text-sm">
                        Statut <span className="text-destructive">*</span>
                      </Label>
                      <Select defaultValue="prospect">
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="prospect">Prospect</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sector" className="text-sm">
                        Secteur d'activité <span className="text-destructive">*</span>
                      </Label>
                      <Input id="sector" placeholder="Oil & Gas" className="h-9" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Coordonnées
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="phone" className="text-sm flex items-center gap-1.5">
                        <Phone className="h-3 w-3" />
                        Téléphone
                      </Label>
                      <Input id="phone" placeholder="+33 1 47 44 45 46" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-sm flex items-center gap-1.5">
                        <Mail className="h-3 w-3" />
                        Email <span className="text-destructive">*</span>
                      </Label>
                      <Input id="email" type="email" placeholder="contact@company.com" className="h-9" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="website" className="text-sm flex items-center gap-1.5">
                      <Globe className="h-3 w-3" />
                      Site web
                    </Label>
                    <Input id="website" placeholder="https://company.com" className="h-9" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Localisation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="address" className="text-sm">
                      Adresse
                    </Label>
                    <Input id="address" placeholder="2 Place Jean Millier" className="h-9" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="city" className="text-sm">
                        Ville
                      </Label>
                      <Input id="city" placeholder="Paris" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="country" className="text-sm">
                        Pays
                      </Label>
                      <Input id="country" placeholder="France" className="h-9" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Informations complémentaires
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="tags" className="text-sm">
                      Tags
                    </Label>
                    <Input id="tags" placeholder="Strategic, Major Account" className="h-9" />
                    <p className="text-xs text-muted-foreground">Séparez les tags par des virgules</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notes" className="text-sm">
                      Notes internes
                    </Label>
                    <Textarea
                      id="notes"
                      placeholder="Informations complémentaires..."
                      rows={3}
                      className="resize-none"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
          <div className="flex gap-2 px-4 sm:px-6 py-3 border-t bg-background sticky bottom-0">
            <Button
              variant="outline"
              className="flex-1 h-9 bg-transparent"
              onClick={() => setShowNewCompanySheet(false)}
            >
              <X className="h-4 w-4 mr-1.5" />
              Annuler
            </Button>
            <Button className="flex-1 h-9" onClick={() => setShowNewCompanySheet(false)}>
              <Save className="h-4 w-4 mr-1.5" />
              Enregistrer
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showCompanyDetail} onOpenChange={setShowCompanyDetail}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
          {selectedCompany && (
            <>
              <SheetHeader className="px-3 pt-3 pb-2 border-b sticky top-0 bg-background z-10">
                <div className="flex items-start gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-base">{selectedCompany.name}</SheetTitle>
                    <SheetDescription className="text-xs">{selectedCompany.legalName}</SheetDescription>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedCompany.type.map((type) => (
                        <Badge key={type} variant="outline" className={`h-4 px-1.5 text-[9px] ${typeColors[type]}`}>
                          {typeLabels[type]}
                        </Badge>
                      ))}
                      <Badge
                        variant="secondary"
                        className={`h-4 px-1.5 text-[9px] ${statusColors[selectedCompany.status]}`}
                      >
                        {statusLabels[selectedCompany.status]}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 px-2 bg-transparent">
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 px-2 bg-transparent">
                      <Download className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </SheetHeader>

              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-3 h-8 p-0">
                  <TabsTrigger
                    value="overview"
                    className="text-xs h-7 rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                  >
                    Aperçu
                  </TabsTrigger>
                  <TabsTrigger
                    value="contacts"
                    className="text-xs h-7 rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                  >
                    Contacts ({companyContacts.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="documents"
                    className="text-xs h-7 rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                  >
                    Documents
                  </TabsTrigger>
                  <TabsTrigger
                    value="activity"
                    className="text-xs h-7 rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                  >
                    Activité
                  </TabsTrigger>
                </TabsList>

                <ScrollArea className="h-[calc(100vh-12rem)]">
                  <TabsContent value="overview" className="px-3 py-2 space-y-2 mt-0">
                    {/* Stats rapides */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <Card className="p-1.5">
                        <div className="text-[9px] text-muted-foreground">Contacts</div>
                        <div className="text-lg font-bold">{selectedCompany.contactsCount}</div>
                      </Card>
                      <Card className="p-1.5">
                        <div className="text-[9px] text-muted-foreground">Projets</div>
                        <div className="text-lg font-bold">{selectedCompany.projectsCount}</div>
                      </Card>
                      <Card className="p-1.5">
                        <div className="text-[9px] text-muted-foreground">Note</div>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-2.5 w-2.5 ${
                                i < selectedCompany.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                      </Card>
                    </div>

                    {/* Informations générales */}
                    <Card className="p-2">
                      <div className="text-xs font-semibold mb-1.5">Informations générales</div>
                      <div className="space-y-1.5">
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <div className="text-[9px] text-muted-foreground">Raison sociale</div>
                            <div className="text-xs">{selectedCompany.legalName}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-muted-foreground">SIRET</div>
                            <div className="text-xs">{selectedCompany.siret}</div>
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] text-muted-foreground">Secteur d'activité</div>
                          <div className="text-xs">{selectedCompany.sector}</div>
                        </div>
                      </div>
                    </Card>

                    {/* Coordonnées */}
                    <Card className="p-2">
                      <div className="text-xs font-semibold mb-1.5">Coordonnées</div>
                      <div className="space-y-1">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="h-3 w-3 shrink-0 text-muted-foreground mt-0.5" />
                          <div className="text-xs">
                            {selectedCompany.address}
                            <br />
                            {selectedCompany.city}, {selectedCompany.country}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <div className="text-xs">{selectedCompany.phone}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <div className="text-xs">{selectedCompany.email}</div>
                        </div>
                        {selectedCompany.website && (
                          <div className="flex items-center gap-1.5">
                            <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <a
                              href={selectedCompany.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              {selectedCompany.website}
                            </a>
                          </div>
                        )}
                      </div>
                    </Card>

                    {/* Tags */}
                    {selectedCompany.tags.length > 0 && (
                      <Card className="p-2">
                        <div className="text-xs font-semibold mb-1.5 flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          Tags
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {selectedCompany.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="h-4 px-1.5 text-[9px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </Card>
                    )}
                  </TabsContent>

                  <TabsContent value="contacts" className="px-3 py-2 space-y-1.5 mt-0">
                    {companyContacts.length > 0 ? (
                      companyContacts.map((contact) => (
                        <Card key={contact.id} className="p-2">
                          <div className="flex items-start gap-2">
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarFallback className="text-[9px]">
                                {contact.firstName[0]}
                                {contact.lastName[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium">
                                {contact.firstName} {contact.lastName}
                              </div>
                              <div className="text-[9px] text-muted-foreground">{contact.position}</div>
                              {contact.department && (
                                <div className="text-[9px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Briefcase className="h-2.5 w-2.5" />
                                  {contact.department}
                                </div>
                              )}
                              <div className="flex flex-wrap gap-1.5 mt-1 text-[9px]">
                                <a
                                  href={`mailto:${contact.email}`}
                                  className="flex items-center gap-0.5 text-primary hover:underline"
                                >
                                  <Mail className="h-2.5 w-2.5" />
                                  {contact.email}
                                </a>
                                <span className="flex items-center gap-0.5 text-muted-foreground">
                                  <Phone className="h-2.5 w-2.5" />
                                  {contact.phone}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))
                    ) : (
                      <div className="text-center py-6 text-xs text-muted-foreground">
                        Aucun contact pour cette société
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="documents" className="px-3 py-2 mt-0">
                    <div className="text-center py-6 text-xs text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                      Aucun document
                    </div>
                  </TabsContent>

                  <TabsContent value="activity" className="px-3 py-2 mt-0">
                    <div className="text-center py-6 text-xs text-muted-foreground">
                      <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                      Aucune activité récente
                    </div>
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
