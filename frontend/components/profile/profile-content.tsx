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
import { Progress } from "@/components/ui/progress"
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
  Palette,
  Settings2,
  Bell,
  Globe,
  Moon,
  Sun,
  LayoutGrid,
  List,
  Zap,
  TrendingUp,
  Activity,
  Loader2,
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { UserPreferencesAPI } from "@/src/api/user-preferences"

// Toast helper (simplified)
const toast = ({ title, description, variant }: { title: string; description?: string; variant?: string }) => {
  console.log(`[${variant || 'info'}] ${title}${description ? ': ' + description : ''}`)
  // In production, use a proper toast library
  alert(`${title}${description ? '\n' + description : ''}`)
}

export function ProfileContent() {
  const { user: authUser } = useAuth()
  const [activeTab, setActiveTab] = useState("overview")
  const [isSaving, setIsSaving] = useState(false)
  const [preferences, setPreferences] = useState<Record<string, { value: any; type: string }>>({})
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)

  // User data (will come from auth context / API)
  const [userData, setUserData] = useState({
    firstName: authUser?.name?.split(" ")[0] || "Jean",
    lastName: authUser?.name?.split(" ")[1] || "Dupont",
    email: authUser?.email || "jean.dupont@perenco.com",
    phone: "+237 6 99 12 34 56",
    avatar: authUser?.avatar || "",
    role: authUser?.role || "Project Manager",
    department: "Logistics",
    company: "PERENCO Cameroon",
    location: "Douala, Cameroun",
    bio: "Chef de projet logistique",
    joinedDate: "2020-03-15",
  })

  // Account stats
  const accountStats = {
    projectsManaged: 24,
    tasksCompleted: 156,
    teamMembers: 8,
    activeSince: Math.floor((Date.now() - new Date(userData.joinedDate).getTime()) / (1000 * 60 * 60 * 24)),
  }

  // Load user preferences
  useEffect(() => {
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    try {
      const prefs = await UserPreferencesAPI.getAll()
      setPreferences(prefs)
      setPreferencesLoaded(true)
    } catch (error) {
      console.error("Failed to load preferences:", error)
      // Set defaults
      setPreferences({
        theme: { value: "system", type: "string" },
        colorScheme: { value: "zinc", type: "string" },
        sidebarCollapsed: { value: false, type: "boolean" },
        compactMode: { value: false, type: "boolean" },
        defaultView: { value: "grid", type: "string" },
        itemsPerPage: { value: 25, type: "number" },
        language: { value: "fr", type: "string" },
        timezone: { value: "Africa/Douala", type: "string" },
        emailNotifications: { value: true, type: "boolean" },
        pushNotifications: { value: true, type: "boolean" },
      })
      setPreferencesLoaded(true)
    }
  }

  const updatePreference = async (key: string, value: any, type: string = "json") => {
    setPreferences((prev) => ({ ...prev, [key]: { value, type } }))

    try {
      await UserPreferencesAPI.upsert({
        preference_key: key,
        preference_value: value,
        preference_type: type,
      })
    } catch (error) {
      console.error(`Failed to update preference ${key}:`, error)
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder la préférence",
        variant: "destructive",
      })
    }
  }

  const saveBulkPreferences = async (prefs: Record<string, { value: any; type: string }>) => {
    setIsSaving(true)
    try {
      await UserPreferencesAPI.bulkUpdate({ preferences: prefs })
      toast({
        title: "Succès",
        description: "Préférences sauvegardées avec succès",
      })
    } catch (error) {
      console.error("Failed to save preferences:", error)
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder les préférences",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const resetPreferences = async () => {
    if (!confirm("Êtes-vous sûr de vouloir réinitialiser toutes vos préférences ?")) return

    try {
      await UserPreferencesAPI.reset()
      await loadPreferences()
      toast({
        title: "Succès",
        description: "Préférences réinitialisées",
      })
    } catch (error) {
      console.error("Failed to reset preferences:", error)
      toast({
        title: "Erreur",
        description: "Impossible de réinitialiser les préférences",
        variant: "destructive",
      })
    }
  }

  const getPrefValue = (key: string, defaultValue: any = null) => {
    return preferences[key]?.value ?? defaultValue
  }

  if (!preferencesLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header Card with Stats */}
      <Card className="border-2">
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Avatar Section */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                  <AvatarImage src={userData.avatar || "/placeholder.svg"} />
                  <AvatarFallback className="text-2xl font-bold">
                    {userData.firstName[0]}
                    {userData.lastName[0]}
                  </AvatarFallback>
                </Avatar>
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full p-0 shadow-lg"
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-center">
                <Badge variant={authUser?.is_active ? "default" : "secondary"} className="text-xs">
                  {authUser?.is_active ? "Actif" : "Inactif"}
                </Badge>
              </div>
            </div>

            {/* User Info */}
            <div className="flex-1">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4">
                <div>
                  <h1 className="text-2xl font-bold">
                    {userData.firstName} {userData.lastName}
                  </h1>
                  <p className="text-muted-foreground">{userData.email}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="secondary">{userData.role}</Badge>
                    <Badge variant="outline">{userData.department}</Badge>
                  </div>
                </div>
                <Button size="sm">
                  <Save className="h-4 w-4 mr-2" />
                  Enregistrer
                </Button>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-muted/50 rounded-lg">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-2xl font-bold text-primary">
                    <TrendingUp className="h-5 w-5" />
                    {accountStats.projectsManaged}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Projets gérés</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-2xl font-bold text-green-600">
                    <CheckCircle2 className="h-5 w-5" />
                    {accountStats.tasksCompleted}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Tâches complétées</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-2xl font-bold text-blue-600">
                    <Users className="h-5 w-5" />
                    {accountStats.teamMembers}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Membres d'équipe</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-2xl font-bold text-orange-600">
                    <Activity className="h-5 w-5" />
                    {accountStats.activeSince}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Jours actifs</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto gap-1">
          <TabsTrigger value="overview" className="text-xs md:text-sm">
            Vue d'ensemble
          </TabsTrigger>
          <TabsTrigger value="appearance" className="text-xs md:text-sm">
            Apparence
          </TabsTrigger>
          <TabsTrigger value="preferences" className="text-xs md:text-sm">
            Préférences
          </TabsTrigger>
          <TabsTrigger value="security" className="text-xs md:text-sm">
            Sécurité
          </TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs md:text-sm">
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Informations personnelles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-xs">
                      Prénom
                    </Label>
                    <Input id="firstName" value={userData.firstName} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName" className="text-xs">
                      Nom
                    </Label>
                    <Input id="lastName" value={userData.lastName} className="h-9" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs">
                    Email
                  </Label>
                  <Input id="email" type="email" value={userData.email} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs">
                    Téléphone
                  </Label>
                  <Input id="phone" type="tel" value={userData.phone} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bio" className="text-xs">
                    Biographie
                  </Label>
                  <Textarea id="bio" value={userData.bio} rows={3} className="text-sm" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Informations professionnelles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="company" className="text-xs">
                    Entreprise
                  </Label>
                  <Input id="company" value={userData.company} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="department" className="text-xs">
                    Département
                  </Label>
                  <Input id="department" value={userData.department} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role" className="text-xs">
                    Rôle
                  </Label>
                  <Input id="role" value={userData.role} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="location" className="text-xs">
                    Localisation
                  </Label>
                  <Input id="location" value={userData.location} className="h-9" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Apparence et thème
                  </CardTitle>
                  <CardDescription className="text-xs">Personnalisez l'apparence de l'application</CardDescription>
                </div>
                <Badge variant="secondary" className="text-xs">
                  <Zap className="h-3 w-3 mr-1" />
                  Aperçu en direct
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Theme Mode */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Mode d'affichage</Label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "light", label: "Clair", icon: Sun },
                    { value: "dark", label: "Sombre", icon: Moon },
                    { value: "system", label: "Système", icon: Monitor },
                  ].map((mode) => {
                    const Icon = mode.icon
                    const isActive = getPrefValue("theme") === mode.value
                    return (
                      <Button
                        key={mode.value}
                        variant={isActive ? "default" : "outline"}
                        className="h-auto flex-col gap-2 p-4"
                        onClick={() => updatePreference("theme", mode.value, "string")}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-xs">{mode.label}</span>
                      </Button>
                    )
                  })}
                </div>
              </div>

              <Separator />

              {/* Color Scheme */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Schéma de couleur</Label>
                <div className="grid grid-cols-4 gap-2">
                  {["zinc", "slate", "stone", "gray", "neutral", "red", "blue", "green"].map((color) => {
                    const isActive = getPrefValue("colorScheme") === color
                    return (
                      <Button
                        key={color}
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        className="capitalize"
                        onClick={() => updatePreference("colorScheme", color, "string")}
                      >
                        {color}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <Separator />

              {/* Display Options */}
              <div className="space-y-4">
                <Label className="text-sm font-medium">Options d'affichage</Label>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Mode compact</Label>
                    <p className="text-xs text-muted-foreground">Réduire l'espacement entre les éléments</p>
                  </div>
                  <Switch
                    checked={getPrefValue("compactMode", false)}
                    onCheckedChange={(checked) => updatePreference("compactMode", checked, "boolean")}
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Sidebar réduite par défaut</Label>
                    <p className="text-xs text-muted-foreground">Réduire automatiquement la barre latérale</p>
                  </div>
                  <Switch
                    checked={getPrefValue("sidebarCollapsed", false)}
                    onCheckedChange={(checked) => updatePreference("sidebarCollapsed", checked, "boolean")}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Préférences générales
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language" className="text-sm">
                    Langue
                  </Label>
                  <Select
                    value={getPrefValue("language", "fr")}
                    onValueChange={(value) => updatePreference("language", value, "string")}
                  >
                    <SelectTrigger id="language" className="h-9">
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
                  <Label htmlFor="timezone" className="text-sm">
                    Fuseau horaire
                  </Label>
                  <Select
                    value={getPrefValue("timezone", "Africa/Douala")}
                    onValueChange={(value) => updatePreference("timezone", value, "string")}
                  >
                    <SelectTrigger id="timezone" className="h-9">
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

                <div className="space-y-2">
                  <Label className="text-sm">Vue par défaut</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "grid", label: "Grille", icon: LayoutGrid },
                      { value: "list", label: "Liste", icon: List },
                    ].map((view) => {
                      const Icon = view.icon
                      const isActive = getPrefValue("defaultView") === view.value
                      return (
                        <Button
                          key={view.value}
                          variant={isActive ? "default" : "outline"}
                          size="sm"
                          className="justify-start gap-2"
                          onClick={() => updatePreference("defaultView", view.value, "string")}
                        >
                          <Icon className="h-4 w-4" />
                          {view.label}
                        </Button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="itemsPerPage" className="text-sm">
                    Éléments par page
                  </Label>
                  <Select
                    value={getPrefValue("itemsPerPage", 25).toString()}
                    onValueChange={(value) => updatePreference("itemsPerPage", parseInt(value), "number")}
                  >
                    <SelectTrigger id="itemsPerPage" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Actions rapides</CardTitle>
                  <Button variant="outline" size="sm" onClick={resetPreferences} disabled={isSaving}>
                    Réinitialiser tout
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Réinitialisez toutes vos préférences aux valeurs par défaut ou exportez-les pour les sauvegarder.
                </p>

                <div className="grid grid-cols-2 gap-2 pt-4">
                  <Button variant="outline" size="sm" className="w-full">
                    Exporter
                  </Button>
                  <Button variant="outline" size="sm" className="w-full">
                    Importer
                  </Button>
                </div>

                <Separator />

                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Préférences enregistrées</span>
                    <Badge variant="secondary">{Object.keys(preferences).length}</Badge>
                  </div>
                  <Progress value={(Object.keys(preferences).length / 20) * 100} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Sécurité du compte
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 border rounded-lg bg-muted/50">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Authentification à deux facteurs activée</p>
                    <p className="text-xs text-muted-foreground mt-1">Votre compte est protégé par 2FA</p>
                  </div>
                </div>
              </div>

              <Button variant="outline" className="w-full">
                <Key className="h-4 w-4 mr-2" />
                Changer le mot de passe
              </Button>

              <Button variant="outline" className="w-full">
                <Smartphone className="h-4 w-4 mr-2" />
                Gérer les appareils de confiance
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Préférences de notification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: "emailNotifications", label: "Notifications par email", desc: "Recevoir des notifications par email" },
                { key: "pushNotifications", label: "Notifications push", desc: "Recevoir des notifications push" },
                { key: "weeklyDigest", label: "Résumé hebdomadaire", desc: "Recevoir un résumé hebdomadaire par email" },
              ].map((notif) => (
                <div key={notif.key} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-0.5">
                    <Label className="text-sm">{notif.label}</Label>
                    <p className="text-xs text-muted-foreground">{notif.desc}</p>
                  </div>
                  <Switch
                    checked={getPrefValue(notif.key, true)}
                    onCheckedChange={(checked) => updatePreference(notif.key, checked, "boolean")}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button (Floating) */}
      {isSaving && (
        <div className="fixed bottom-6 right-6 bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm font-medium">Sauvegarde en cours...</span>
        </div>
      )}
    </div>
  )
}
