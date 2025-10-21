"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { PermissionGuard } from "@/components/permission-guard"
import { useTranslation } from "@/hooks/use-translation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Languages,
  Plus,
  Search,
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  Edit,
  Trash2,
  MoreVertical,
  Globe,
  FileText,
  Database,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import {
  getLanguages,
  getNamespaces,
  getTranslations,
  deleteLanguage,
  deleteTranslation,
} from "./data/translations-api"
import type { Language, TranslationNamespace, Translation } from "./data/schema"

export default function TranslationsPage() {
  return (
    <PermissionGuard permission="core.translations.read">
      <TranslationsPageContent />
    </PermissionGuard>
  )
}

function TranslationsPageContent() {
  const { t } = useTranslation("core.developers")
  const { toast } = useToast()

  // State
  const [languages, setLanguages] = useState<Language[]>([])
  const [namespaces, setNamespaces] = useState<TranslationNamespace[]>([])
  const [translations, setTranslations] = useState<Translation[]>([])
  const [totalTranslations, setTotalTranslations] = useState(0)

  const [isLoadingLanguages, setIsLoadingLanguages] = useState(true)
  const [isLoadingNamespaces, setIsLoadingNamespaces] = useState(true)
  const [isLoadingTranslations, setIsLoadingTranslations] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedNamespace, setSelectedNamespace] = useState<string>("all")
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all")
  const [verifiedFilter, setVerifiedFilter] = useState<string>("all")

  // Load data
  const loadLanguages = async () => {
    try {
      setIsLoadingLanguages(true)
      const data = await getLanguages({ limit: 100 })
      setLanguages(data.data)
    } catch (error) {
      console.error("Failed to load languages:", error)
      toast({
        title: t("error.title", "Erreur"),
        description: t("error.load_languages", "Impossible de charger les langues"),
        variant: "destructive",
      })
    } finally {
      setIsLoadingLanguages(false)
    }
  }

  const loadNamespaces = async () => {
    try {
      setIsLoadingNamespaces(true)
      const data = await getNamespaces()
      setNamespaces(data)
    } catch (error) {
      console.error("Failed to load namespaces:", error)
      toast({
        title: t("error.title", "Erreur"),
        description: t("error.load_namespaces", "Impossible de charger les namespaces"),
        variant: "destructive",
      })
    } finally {
      setIsLoadingNamespaces(false)
    }
  }

  const loadTranslations = async () => {
    try {
      setIsLoadingTranslations(true)
      const params: any = { limit: 1000 }

      if (selectedNamespace !== "all") params.namespace_id = selectedNamespace
      if (selectedLanguage !== "all") params.language_id = selectedLanguage
      if (searchQuery) params.key = searchQuery
      if (verifiedFilter !== "all") params.is_verified = verifiedFilter === "verified"

      const data = await getTranslations(params)
      setTranslations(data.data)
      setTotalTranslations(data.count)
    } catch (error) {
      console.error("Failed to load translations:", error)
      toast({
        title: t("error.title", "Erreur"),
        description: t("error.load_translations", "Impossible de charger les traductions"),
        variant: "destructive",
      })
    } finally {
      setIsLoadingTranslations(false)
    }
  }

  useEffect(() => {
    loadLanguages()
    loadNamespaces()
  }, [])

  useEffect(() => {
    loadTranslations()
  }, [selectedNamespace, selectedLanguage, searchQuery, verifiedFilter])

  // Statistics
  const stats = useMemo(() => {
    const activeLanguages = languages.filter(l => l.is_active).length
    const verifiedTranslations = translations.filter(t => t.is_verified).length
    const verificationRate = totalTranslations > 0
      ? ((verifiedTranslations / totalTranslations) * 100).toFixed(1)
      : "0"

    return {
      totalLanguages: languages.length,
      activeLanguages,
      totalNamespaces: namespaces.length,
      totalTranslations,
      verifiedTranslations,
      verificationRate,
    }
  }, [languages, namespaces, translations, totalTranslations])

  if (isLoadingLanguages || isLoadingNamespaces) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-[300px]" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-[600px]" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">{t("breadcrumb.home", "Accueil")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("breadcrumb.developers", "Développeurs")}</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("translations.title", "Traductions i18n")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Languages className="h-8 w-8" />
            {t("translations.title", "Gestion des Traductions i18n")}
          </h2>
          <p className="text-muted-foreground">
            {t("translations.description", "Gérez les langues, namespaces et traductions de votre application")}
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("translations.stats.languages", "Langues")}</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalLanguages}</div>
            <p className="text-xs text-muted-foreground">
              {t("translations.stats.active_languages", "{{count}} actives", { count: stats.activeLanguages })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("translations.stats.namespaces", "Namespaces")}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalNamespaces}</div>
            <p className="text-xs text-muted-foreground">
              {t("translations.stats.modules_core", "Modules et core")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("translations.stats.translations", "Traductions")}</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTranslations}</div>
            <p className="text-xs text-muted-foreground">
              {t("translations.stats.total_keys", "Clés totales")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("translations.stats.verification", "Vérification")}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.verificationRate}%</div>
            <p className="text-xs text-muted-foreground">
              {t("translations.stats.verified_count", "{{count}} vérifiées", { count: stats.verifiedTranslations })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content - Tabs */}
      <Tabs defaultValue="translations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="translations" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            {t("translations.tabs.translations", "Traductions")}
          </TabsTrigger>
          <TabsTrigger value="languages" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {t("translations.tabs.languages", "Langues")}
          </TabsTrigger>
          <TabsTrigger value="namespaces" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t("translations.tabs.namespaces", "Namespaces")}
          </TabsTrigger>
        </TabsList>

        {/* Translations Tab */}
        <TabsContent value="translations" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t("translations.list.title", "Liste des traductions")}</CardTitle>
                  <CardDescription>
                    {t("translations.list.description", "Recherchez et gérez toutes les traductions")}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Upload className="mr-2 h-4 w-4" />
                    {t("translations.action.import", "Importer")}
                  </Button>
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    {t("translations.action.export", "Exporter")}
                  </Button>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    {t("translations.action.add", "Ajouter")}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="mb-6 grid gap-4 md:grid-cols-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={t("translations.filter.search", "Rechercher une clé...")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("translations.filter.all_namespaces", "Tous les namespaces")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("translations.filter.all_namespaces", "Tous les namespaces")}</SelectItem>
                    {namespaces.map((ns) => (
                      <SelectItem key={ns.id} value={ns.id}>
                        {ns.name} ({ns.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("translations.filter.all_languages", "Toutes les langues")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("translations.filter.all_languages", "Toutes les langues")}</SelectItem>
                    {languages.filter(l => l.is_active).map((lang) => (
                      <SelectItem key={lang.id} value={lang.id}>
                        {lang.flag_emoji} {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={verifiedFilter} onValueChange={setVerifiedFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("translations.filter.all_status", "Tous les statuts")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("translations.filter.all_status", "Tous les statuts")}</SelectItem>
                    <SelectItem value="verified">{t("translations.filter.verified", "Vérifiées")}</SelectItem>
                    <SelectItem value="unverified">{t("translations.filter.unverified", "Non vérifiées")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Translations List */}
              {isLoadingTranslations ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              ) : translations.length === 0 ? (
                <div className="py-16 text-center">
                  <Database className="mx-auto h-16 w-16 text-muted-foreground/30" />
                  <p className="mt-4 text-sm font-medium">{t("translations.list.no_results", "Aucune traduction trouvée")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("translations.list.adjust_filters", "Essayez d'ajuster vos filtres")}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {translations.map((translation) => {
                    const namespace = namespaces.find(ns => ns.id === translation.namespace_id)
                    const language = languages.find(l => l.id === translation.language_id)

                    return (
                      <div
                        key={translation.id}
                        className="group flex items-start justify-between gap-4 rounded-lg border p-4 hover:bg-accent/30 transition-colors"
                      >
                        <div className="flex-1 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                              {translation.key}
                            </code>
                            <Badge variant="outline" className="text-xs">
                              {namespace?.code}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {language?.flag_emoji} {language?.code}
                            </Badge>
                            {translation.is_verified ? (
                              <Badge variant="default" className="text-xs gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                {t("translations.badge.verified", "Vérifié")}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <XCircle className="h-3 w-3" />
                                {t("translations.badge.unverified", "Non vérifié")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm">{translation.value}</p>
                          {translation.description && (
                            <p className="text-xs text-muted-foreground italic">{translation.description}</p>
                          )}
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Edit className="mr-2 h-4 w-4" />
                              {t("translations.action.edit", "Modifier")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t("translations.action.delete", "Supprimer")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Languages Tab */}
        <TabsContent value="languages">
          <Card>
            <CardHeader>
              <CardTitle>{t("translations.languages.title", "Langues disponibles")}</CardTitle>
              <CardDescription>
                {t("translations.languages.description", "Gérez les langues disponibles dans l'application")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t("translations.languages.coming_soon", "Interface de gestion des langues à venir...")}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Namespaces Tab */}
        <TabsContent value="namespaces">
          <Card>
            <CardHeader>
              <CardTitle>{t("translations.namespaces.title", "Namespaces")}</CardTitle>
              <CardDescription>
                {t("translations.namespaces.description", "Organisez vos traductions par modules et contextes")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t("translations.namespaces.coming_soon", "Interface de gestion des namespaces à venir...")}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
