"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { X, Plus } from "lucide-react"
import {
  MapPin,
  Building2,
  Calendar,
  Shield,
  Key,
  Smartphone,
  Monitor,
  LogOut,
  Upload,
  Save,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Users,
  Lock,
  Home,
  Briefcase,
  MessageCircle,
  Send,
} from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const mockUser = {
  id: "user_123",
  firstName: "Jean",
  lastName: "Dupont",
  email: "jean.dupont@perenco.com",
  phone: "+237 6 99 12 34 56",
  avatar: "",
  role: "Project Manager",
  department: "Logistics",
  company: "PERENCO Cameroon",
  location: "Douala, Cameroun",
  timezone: "Africa/Douala",
  language: "fr",
  bio: "Chef de projet logistique avec 10 ans d'expérience dans l'industrie pétrolière et gazière.",
  joinedDate: "2020-03-15",
  lastLogin: "2025-01-29T14:30:00",
  twoFactorEnabled: true,
}

const mockRoles = [
  { id: "1", name: "Project Manager", description: "Gestion complète des projets", color: "blue" },
  { id: "2", name: "Logistics Coordinator", description: "Coordination logistique", color: "green" },
]

const mockGroups = [
  { id: "1", name: "Logistics Team", members: 12, description: "Équipe logistique principale" },
  { id: "2", name: "Project Managers", members: 8, description: "Tous les chefs de projet" },
  { id: "3", name: "Offshore Operations", members: 45, description: "Opérations offshore" },
]

const mockPermissions = [
  { module: "Projects", permissions: ["Créer", "Lire", "Modifier", "Supprimer", "Approuver"] },
  { module: "TravelWiz", permissions: ["Créer", "Lire", "Modifier", "Approuver"] },
  { module: "MOCVue", permissions: ["Lire", "Créer", "Approuver"] },
  { module: "Tiers", permissions: ["Créer", "Lire", "Modifier"] },
  { module: "Rédacteur", permissions: ["Créer", "Lire", "Modifier", "Publier"] },
  { module: "Paramètres", permissions: ["Lire"] },
]

const mockSessions = [
  {
    id: "1",
    device: "Chrome sur Windows",
    location: "Douala, Cameroun",
    ip: "197.234.123.45",
    lastActive: "2025-01-29T14:30:00",
    current: true,
  },
  {
    id: "2",
    device: "Safari sur iPhone",
    location: "Douala, Cameroun",
    ip: "197.234.123.46",
    lastActive: "2025-01-29T10:15:00",
    current: false,
  },
  {
    id: "3",
    device: "Firefox sur MacOS",
    location: "Yaoundé, Cameroun",
    ip: "197.234.124.12",
    lastActive: "2025-01-28T16:45:00",
    current: false,
  },
]

const mockActivity = [
  { id: "1", action: "Connexion réussie", timestamp: "2025-01-29T14:30:00", ip: "197.234.123.45", status: "success" },
  {
    id: "2",
    action: "Modification du profil",
    timestamp: "2025-01-29T10:15:00",
    ip: "197.234.123.45",
    status: "success",
  },
  {
    id: "3",
    action: "Changement de mot de passe",
    timestamp: "2025-01-28T16:45:00",
    ip: "197.234.123.45",
    status: "success",
  },
  {
    id: "4",
    action: "Tentative de connexion échouée",
    timestamp: "2025-01-27T09:20:00",
    ip: "197.234.125.89",
    status: "failed",
  },
  { id: "5", action: "Activation 2FA", timestamp: "2025-01-26T14:00:00", ip: "197.234.123.45", status: "success" },
]

export function ProfileContent() {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [personalSettings, setPersonalSettings] = useState([
    { id: "1", key: "default_view", value: "grid", description: "Vue par défaut des listes" },
    { id: "2", key: "items_per_page", value: "50", description: "Nombre d'éléments par page" },
    { id: "3", key: "auto_refresh", value: "true", description: "Actualisation automatique" },
    { id: "4", key: "compact_mode", value: "true", description: "Mode compact" },
    { id: "5", key: "show_avatars", value: "true", description: "Afficher les avatars" },
    { id: "6", key: "date_format", value: "DD/MM/YYYY", description: "Format de date" },
    { id: "7", key: "time_format", value: "24h", description: "Format d'heure" },
    { id: "8", key: "sidebar_collapsed", value: "false", description: "Sidebar réduite par défaut" },
  ])
  const [addresses, setAddresses] = useState([
    {
      id: "1",
      type: "home",
      label: "Domicile",
      street: "123 Rue de la Liberté",
      city: "Douala",
      state: "Littoral",
      postalCode: "BP 1234",
      country: "Cameroun",
    },
    {
      id: "2",
      type: "work",
      label: "Bureau",
      street: "PERENCO Cameroon, Zone Industrielle",
      city: "Douala",
      state: "Littoral",
      postalCode: "BP 5678",
      country: "Cameroun",
    },
  ])
  const [integrations, setIntegrations] = useState({
    whatsapp: { enabled: true, phone: "+237699123456", verified: true },
    messenger: { enabled: false, username: "", verified: false },
    teams: { enabled: true, email: "jean.dupont@perenco.com", verified: true },
  })
  const [editingCell, setEditingCell] = useState<{ id: string; field: "key" | "value" | "description" } | null>(null)
  const [editValue, setEditValue] = useState("")
  const [activeTab, setActiveTab] = useState("personal")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get("tab")
    if (tab) {
      setActiveTab(tab)
    }
  }, [])

  const handleCellEdit = (id: string, field: "key" | "value" | "description", currentValue: string) => {
    setEditingCell({ id, field })
    setEditValue(currentValue)
  }

  const handleCellSave = () => {
    if (!editingCell) return

    setPersonalSettings((prev) =>
      prev.map((setting) => (setting.id === editingCell.id ? { ...setting, [editingCell.field]: editValue } : setting)),
    )
    setEditingCell(null)
    setEditValue("")
  }

  const handleCellCancel = () => {
    setEditingCell(null)
    setEditValue("")
  }

  const handleAddSetting = () => {
    const newId = String(personalSettings.length + 1)
    setPersonalSettings((prev) => [
      ...prev,
      { id: newId, key: "new_key", value: "new_value", description: "Description" },
    ])
  }

  const handleDeleteSetting = (id: string) => {
    setPersonalSettings((prev) => prev.filter((setting) => setting.id !== id))
  }

  const handleAddAddress = () => {
    const newId = String(addresses.length + 1)
    setAddresses((prev) => [
      ...prev,
      {
        id: newId,
        type: "other",
        label: "Autre",
        street: "",
        city: "",
        state: "",
        postalCode: "",
        country: "Cameroun",
      },
    ])
  }

  const handleDeleteAddress = (id: string) => {
    setAddresses((prev) => prev.filter((addr) => addr.id !== id))
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header with Avatar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-start gap-4 md:gap-6">
            <div className="relative mx-auto md:mx-0">
              <Avatar className="h-20 w-20 md:h-24 md:w-24">
                <AvatarImage src={mockUser.avatar || "/placeholder.svg"} />
                <AvatarFallback className="text-xl md:text-2xl">
                  {mockUser.firstName[0]}
                  {mockUser.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <Button size="sm" variant="secondary" className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full p-0">
                <Upload className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 w-full">
              <div className="flex flex-col md:flex-row items-start md:items-start md:justify-between gap-3">
                <div className="w-full md:w-auto">
                  <h1 className="text-xl md:text-2xl font-bold">
                    {mockUser.firstName} {mockUser.lastName}
                  </h1>
                  <p className="text-sm md:text-base text-muted-foreground">{mockUser.email}</p>
                  <div className="flex items-center gap-2 md:gap-4 mt-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">
                      {mockUser.role}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {mockUser.department}
                    </Badge>
                  </div>
                </div>
                <Button size="sm" className="w-full md:w-auto">
                  <Save className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Enregistrer les modifications</span>
                  <span className="sm:hidden">Enregistrer</span>
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mt-4 pt-4 border-t">
                <div className="flex items-center gap-2 text-xs md:text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{mockUser.company}</span>
                </div>
                <div className="flex items-center gap-2 text-xs md:text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{mockUser.location}</span>
                </div>
                <div className="flex items-center gap-2 text-xs md:text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">
                    Membre depuis {new Date(mockUser.joinedDate).toLocaleDateString("fr-FR")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 md:grid-cols-8 h-auto">
          <TabsTrigger value="personal" className="text-xs md:text-sm">
            Informations
          </TabsTrigger>
          <TabsTrigger value="roles" className="text-xs md:text-sm">
            Rôles
          </TabsTrigger>
          <TabsTrigger value="security" className="text-xs md:text-sm">
            Sécurité
          </TabsTrigger>
          <TabsTrigger value="preferences" className="text-xs md:text-sm">
            Préférences
          </TabsTrigger>
          <TabsTrigger value="integrations" className="text-xs md:text-sm">
            Intégrations
          </TabsTrigger>
          <TabsTrigger value="activity" className="text-xs md:text-sm">
            Activité
          </TabsTrigger>
          <TabsTrigger value="sessions" className="text-xs md:text-sm">
            Sessions
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs md:text-sm">
            Paramètres
          </TabsTrigger>
        </TabsList>

        {/* Personal Information */}
        <TabsContent value="personal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg md:text-xl">Informations personnelles</CardTitle>
              <CardDescription className="text-sm">Gérez vos informations de profil</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Prénom</Label>
                  <Input id="firstName" defaultValue={mockUser.firstName} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Nom</Label>
                  <Input id="lastName" defaultValue={mockUser.lastName} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input id="email" type="email" defaultValue={mockUser.email} className="flex-1" />
                  <Button variant="outline" className="w-full sm:w-auto bg-transparent">
                    Vérifier
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input id="phone" type="tel" defaultValue={mockUser.phone} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Biographie</Label>
                <Textarea id="bio" defaultValue={mockUser.bio} rows={4} />
              </div>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Entreprise</Label>
                  <Input id="company" defaultValue={mockUser.company} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Département</Label>
                  <Input id="department" defaultValue={mockUser.department} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Rôle</Label>
                <Input id="role" defaultValue={mockUser.role} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Localisation</Label>
                <Input id="location" defaultValue={mockUser.location} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg md:text-xl">Adresses</CardTitle>
                  <CardDescription className="text-sm">
                    Gérez vos adresses personnelles et professionnelles
                  </CardDescription>
                </div>
                <Button size="sm" onClick={handleAddAddress} className="w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {addresses.map((address) => (
                <div key={address.id} className="p-3 md:p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {address.type === "home" ? (
                        <Home className="h-4 w-4 text-muted-foreground" />
                      ) : address.type === "work" ? (
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                      )}
                      <Label className="font-medium text-sm">{address.label}</Label>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteAddress(address.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="col-span-1 md:col-span-2 space-y-2">
                      <Label className="text-xs">Type</Label>
                      <Select defaultValue={address.type}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="home">Domicile</SelectItem>
                          <SelectItem value="work">Bureau</SelectItem>
                          <SelectItem value="other">Autre</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1 md:col-span-2 space-y-2">
                      <Label className="text-xs">Rue</Label>
                      <Input defaultValue={address.street} className="h-9" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Ville</Label>
                      <Input defaultValue={address.city} className="h-9" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Région</Label>
                      <Input defaultValue={address.state} className="h-9" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Code postal</Label>
                      <Input defaultValue={address.postalCode} className="h-9" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Pays</Label>
                      <Input defaultValue={address.country} className="h-9" />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mes rôles</CardTitle>
              <CardDescription>Rôles attribués à votre compte</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockRoles.map((role) => (
                <div key={role.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <Shield className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-medium">{role.name}</p>
                      <p className="text-sm text-muted-foreground">{role.description}</p>
                    </div>
                  </div>
                  <Badge variant="secondary">{role.color}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mes groupes</CardTitle>
              <CardDescription>Groupes auxquels vous appartenez</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockGroups.map((group) => (
                <div key={group.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="font-medium">{group.name}</p>
                      <p className="text-sm text-muted-foreground">{group.description}</p>
                    </div>
                  </div>
                  <Badge variant="outline">{group.members} membres</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mes permissions</CardTitle>
              <CardDescription>Permissions accordées par vos rôles et groupes</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead>Permissions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockPermissions.map((perm, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                          {perm.module}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {perm.permissions.map((p, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {p}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Changer le mot de passe</CardTitle>
              <CardDescription>Assurez-vous d'utiliser un mot de passe fort</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Mot de passe actuel</Label>
                <div className="relative">
                  <Input id="currentPassword" type={showCurrentPassword ? "text" : "password"} placeholder="••••••••" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                <div className="relative">
                  <Input id="newPassword" type={showNewPassword ? "text" : "password"} placeholder="••••••••" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <div className="relative">
                  <Input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="••••••••" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button>Changer le mot de passe</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Authentification à deux facteurs (2FA)</CardTitle>
              <CardDescription>Ajoutez une couche de sécurité supplémentaire à votre compte</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="font-medium">2FA activée</p>
                    <p className="text-sm text-muted-foreground">Votre compte est protégé par 2FA</p>
                  </div>
                </div>
                <Button variant="outline">Désactiver</Button>
              </div>
              <div className="space-y-2">
                <Label>Codes de récupération</Label>
                <p className="text-sm text-muted-foreground">
                  Générez des codes de récupération en cas de perte d'accès à votre appareil 2FA
                </p>
                <Button variant="outline" size="sm">
                  <Key className="h-4 w-4 mr-2" />
                  Générer des codes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences */}
        <TabsContent value="preferences" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Préférences générales</CardTitle>
              <CardDescription>Personnalisez votre expérience</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="language">Langue</Label>
                <Select defaultValue={mockUser.language}>
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Fuseau horaire</Label>
                <Select defaultValue={mockUser.timezone}>
                  <SelectTrigger id="timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Africa/Douala">Africa/Douala (GMT+1)</SelectItem>
                    <SelectItem value="Europe/Paris">Europe/Paris (GMT+1)</SelectItem>
                    <SelectItem value="America/New_York">America/New_York (GMT-5)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="space-y-4">
                <Label>Notifications</Label>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="emailNotif">Notifications par email</Label>
                      <p className="text-sm text-muted-foreground">Recevoir des notifications par email</p>
                    </div>
                    <Switch id="emailNotif" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="pushNotif">Notifications push</Label>
                      <p className="text-sm text-muted-foreground">Recevoir des notifications push</p>
                    </div>
                    <Switch id="pushNotif" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="weeklyDigest">Résumé hebdomadaire</Label>
                      <p className="text-sm text-muted-foreground">Recevoir un résumé hebdomadaire par email</p>
                    </div>
                    <Switch id="weeklyDigest" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Intégrations de messagerie</CardTitle>
              <CardDescription>Configurez vos canaux de notification</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* WhatsApp */}
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                      <MessageCircle className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="font-medium">WhatsApp</p>
                      <p className="text-sm text-muted-foreground">Recevoir des notifications sur WhatsApp</p>
                    </div>
                  </div>
                  <Switch
                    checked={integrations.whatsapp.enabled}
                    onCheckedChange={(checked) =>
                      setIntegrations((prev) => ({
                        ...prev,
                        whatsapp: { ...prev.whatsapp, enabled: checked },
                      }))
                    }
                  />
                </div>
                {integrations.whatsapp.enabled && (
                  <div className="space-y-2 pl-13">
                    <Label className="text-xs">Numéro WhatsApp</Label>
                    <div className="flex gap-2">
                      <Input
                        defaultValue={integrations.whatsapp.phone}
                        placeholder="+237 6 99 12 34 56"
                        className="h-9"
                      />
                      {integrations.whatsapp.verified ? (
                        <Badge className="bg-green-500/10 text-green-500">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Vérifié
                        </Badge>
                      ) : (
                        <Button variant="outline" size="sm">
                          Vérifier
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Messenger */}
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <Send className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-medium">Messenger</p>
                      <p className="text-sm text-muted-foreground">Recevoir des notifications sur Messenger</p>
                    </div>
                  </div>
                  <Switch
                    checked={integrations.messenger.enabled}
                    onCheckedChange={(checked) =>
                      setIntegrations((prev) => ({
                        ...prev,
                        messenger: { ...prev.messenger, enabled: checked },
                      }))
                    }
                  />
                </div>
                {integrations.messenger.enabled && (
                  <div className="space-y-2 pl-13">
                    <Label className="text-xs">Nom d'utilisateur Messenger</Label>
                    <div className="flex gap-2">
                      <Input defaultValue={integrations.messenger.username} placeholder="@username" className="h-9" />
                      <Button variant="outline" size="sm">
                        Connecter
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Microsoft Teams */}
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="font-medium">Microsoft Teams</p>
                      <p className="text-sm text-muted-foreground">Recevoir des notifications sur Teams</p>
                    </div>
                  </div>
                  <Switch
                    checked={integrations.teams.enabled}
                    onCheckedChange={(checked) =>
                      setIntegrations((prev) => ({
                        ...prev,
                        teams: { ...prev.teams, enabled: checked },
                      }))
                    }
                  />
                </div>
                {integrations.teams.enabled && (
                  <div className="space-y-2 pl-13">
                    <Label className="text-xs">Email Teams</Label>
                    <div className="flex gap-2">
                      <Input defaultValue={integrations.teams.email} className="h-9" disabled />
                      {integrations.teams.verified ? (
                        <Badge className="bg-green-500/10 text-green-500">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Vérifié
                        </Badge>
                      ) : (
                        <Button variant="outline" size="sm">
                          Vérifier
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Les notifications seront envoyées via votre compte Teams d'entreprise
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Log */}
        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg md:text-xl">Journal d'activité</CardTitle>
              <CardDescription className="text-sm">Consultez l'historique de vos actions</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Action</TableHead>
                      <TableHead className="min-w-[120px]">Date et heure</TableHead>
                      <TableHead className="min-w-[100px]">Adresse IP</TableHead>
                      <TableHead className="min-w-[80px]">Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockActivity.map((activity) => (
                      <TableRow key={activity.id}>
                        <TableCell className="font-medium text-sm">{activity.action}</TableCell>
                        <TableCell className="text-sm">
                          {new Date(activity.timestamp).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">{activity.ip}</code>
                        </TableCell>
                        <TableCell>
                          {activity.status === "success" ? (
                            <Badge className="bg-green-500/10 text-green-500 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Succès
                            </Badge>
                          ) : (
                            <Badge className="bg-red-500/10 text-red-500 text-xs">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Échec
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sessions */}
        <TabsContent value="sessions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg md:text-xl">Sessions actives</CardTitle>
              <CardDescription className="text-sm">Gérez vos sessions et appareils connectés</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mockSessions.map((session) => (
                <div
                  key={session.id}
                  className={`flex flex-col sm:flex-row items-start sm:justify-between p-3 md:p-4 border rounded-lg gap-3 ${
                    session.current ? "bg-primary/5 border-primary" : ""
                  }`}
                >
                  <div className="flex items-start gap-3 w-full sm:w-auto">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      {session.device.includes("iPhone") ? (
                        <Smartphone className="h-5 w-5" />
                      ) : (
                        <Monitor className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{session.device}</p>
                        {session.current && (
                          <Badge variant="secondary" className="text-xs">
                            Session actuelle
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{session.location}</p>
                      <p className="text-xs text-muted-foreground mt-1">IP: {session.ip}</p>
                      <p className="text-xs text-muted-foreground">
                        Dernière activité:{" "}
                        {new Date(session.lastActive).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  {!session.current && (
                    <Button variant="outline" size="sm" className="w-full sm:w-auto bg-transparent">
                      <LogOut className="h-4 w-4 mr-2" />
                      Déconnecter
                    </Button>
                  )}
                </div>
              ))}
              <Separator />
              <Button variant="destructive" size="sm" className="w-full sm:w-auto">
                <LogOut className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Déconnecter toutes les autres sessions</span>
                <span className="sm:hidden">Déconnecter tout</span>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Personal Settings */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg md:text-xl">Paramètres personnels</CardTitle>
                  <CardDescription className="text-sm">
                    Configurez vos préférences via un système clé-valeur
                  </CardDescription>
                </div>
                <Button size="sm" onClick={handleAddSetting} className="w-full sm:w-auto">
                  Ajouter
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Clé</TableHead>
                      <TableHead className="min-w-[150px]">Valeur</TableHead>
                      <TableHead className="min-w-[200px]">Description</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {personalSettings.map((setting) => (
                      <TableRow key={setting.id}>
                        <TableCell
                          className="font-mono text-sm cursor-pointer hover:bg-muted/50"
                          onClick={() => handleCellEdit(setting.id, "key", setting.key)}
                        >
                          {editingCell?.id === setting.id && editingCell.field === "key" ? (
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleCellSave}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleCellSave()
                                if (e.key === "Escape") handleCellCancel()
                              }}
                              autoFocus
                              className="h-8"
                            />
                          ) : (
                            <code className="text-xs bg-muted px-2 py-1 rounded">{setting.key}</code>
                          )}
                        </TableCell>
                        <TableCell
                          className="font-mono text-sm cursor-pointer hover:bg-muted/50"
                          onClick={() => handleCellEdit(setting.id, "value", setting.value)}
                        >
                          {editingCell?.id === setting.id && editingCell.field === "value" ? (
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleCellSave}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleCellSave()
                                if (e.key === "Escape") handleCellCancel()
                              }}
                              autoFocus
                              className="h-8"
                            />
                          ) : (
                            <span className="text-sm">{setting.value}</span>
                          )}
                        </TableCell>
                        <TableCell
                          className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50"
                          onClick={() => handleCellEdit(setting.id, "description", setting.description)}
                        >
                          {editingCell?.id === setting.id && editingCell.field === "description" ? (
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleCellSave}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleCellSave()
                                if (e.key === "Escape") handleCellCancel()
                              }}
                              autoFocus
                              className="h-8"
                            />
                          ) : (
                            setting.description
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteSetting(setting.id)}
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
