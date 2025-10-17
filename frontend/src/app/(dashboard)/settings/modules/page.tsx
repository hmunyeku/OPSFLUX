"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  IconPuzzle,
  IconCheck,
  IconX,
  IconRefresh,
  IconSettings,
  IconDownload,
  IconUpload,
  IconTrash,
  IconAlertTriangle,
  IconCloudUpload,
  IconSearch,
  IconInfoCircle,
  IconShieldCheck,
  IconCheckbox,
  IconBoxMultiple,
  IconKey,
  IconMenu2,
  IconWebhook,
  IconLanguage,
  IconLink,
  IconChevronRight,
} from "@tabler/icons-react"
import ContentSection from "../components/content-section"
import { useToast } from "@/hooks/use-toast"
import {
  getModules,
  getModuleDetails,
  activateModule,
  deactivateModule,
  installModule,
  uninstallModule,
  type Module,
} from "@/api/modules"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Progress } from "@/components/ui/progress"

export default function ModulesPage() {
  const [modules, setModules] = useState<Module[]>([])
  const [filteredModules, setFilteredModules] = useState<Module[]>([])
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [moduleToConfig, setModuleToConfig] = useState<Module | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [moduleToDelete, setModuleToDelete] = useState<Module | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedModuleDetails, setSelectedModuleDetails] = useState<Module | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState("name")
  const { toast } = useToast()

  const fetchModules = useCallback(async () => {
    setLoading(true)
    try {
      const response = await getModules()
      setModules(response.data || [])
      setFilteredModules(response.data || [])
    } catch (error) {
      if (error) {
        // Handle error silently or log to monitoring service
      }
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de charger les modules.",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchModules()
  }, [fetchModules])

  // Filter and sort modules
  useEffect(() => {
    let result = [...modules]

    // Apply search filter
    if (searchQuery) {
      result = result.filter(
        (module) =>
          module.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          module.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          module.category?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Apply sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name)
        case "status":
          return a.status.localeCompare(b.status)
        case "category":
          return (a.category || "").localeCompare(b.category || "")
        case "date":
          return new Date(b.installed_at || 0).getTime() - new Date(a.installed_at || 0).getTime()
        default:
          return 0
      }
    })

    setFilteredModules(result)
  }, [modules, searchQuery, sortBy])

  const isModuleActive = (status: string): boolean => {
    const normalized = status.toLowerCase()
    return normalized === "active"
  }

  const toggleModule = async (module: Module) => {
    const isActive = isModuleActive(module.status)

    try {
      if (isActive) {
        await deactivateModule(module.id)
        toast({
          title: "Module désactivé",
          description: `Le module ${module.name} a été désactivé avec succès.`,
        })
      } else {
        await activateModule(module.id)
        toast({
          title: "Module activé",
          description: `Le module ${module.name} a été activé avec succès.`,
        })
      }
      await fetchModules()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de modifier le statut du module.",
      })
    }
  }

  const toggleSelection = (moduleId: string) => {
    const newSelection = new Set(selectedModules)
    if (newSelection.has(moduleId)) {
      newSelection.delete(moduleId)
    } else {
      newSelection.add(moduleId)
    }
    setSelectedModules(newSelection)
  }

  const selectAll = () => {
    setSelectedModules(new Set(filteredModules.map(m => m.id)))
  }

  const deselectAll = () => {
    setSelectedModules(new Set())
  }

  const activateSelected = async () => {
    const modulesToActivate = filteredModules.filter(m =>
      selectedModules.has(m.id) && !isModuleActive(m.status)
    )

    // Activate all modules in parallel
    const results = await Promise.allSettled(
      modulesToActivate.map(mod => activateModule(mod.id))
    )

    // Check for errors
    const errors = results.filter(r => r.status === 'rejected').length
    if (errors > 0) {
      toast({
        variant: "destructive",
        title: "Erreur partielle",
        description: `${errors} module(s) n'ont pas pu être activé(s)`,
      })
    } else {
      toast({
        title: "Modules activés",
        description: `${modulesToActivate.length} module(s) activé(s) avec succès.`,
      })
    }

    await fetchModules()
    deselectAll()
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (file.name.endsWith(".zip")) {
        setSelectedFile(file)
      } else {
        toast({
          variant: "destructive",
          title: "Fichier invalide",
          description: "Veuillez sélectionner un fichier ZIP.",
        })
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      if (file.name.endsWith(".zip")) {
        setSelectedFile(file)
      } else {
        toast({
          variant: "destructive",
          title: "Fichier invalide",
          description: "Veuillez sélectionner un fichier ZIP.",
        })
      }
    }
  }

  const handleInstall = async () => {
    if (!selectedFile) return

    setUploading(true)
    setUploadProgress(0)

    try {
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90))
      }, 200)

      await installModule(selectedFile)

      clearInterval(progressInterval)
      setUploadProgress(100)

      toast({
        title: "Module installé",
        description: "Le module a été installé avec succès.",
      })

      setSelectedFile(null)
      setUploadDialogOpen(false)
      await fetchModules()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur d'installation",
        description: error instanceof Error ? error.message : "Impossible d'installer le module.",
      })
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleUninstall = async () => {
    if (!moduleToDelete) return

    try {
      await uninstallModule(moduleToDelete.id)
      toast({
        title: "Module désinstallé",
        description: `Le module ${moduleToDelete.name} a été désinstallé avec succès.`,
      })
      setDeleteDialogOpen(false)
      setModuleToDelete(null)
      await fetchModules()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de désinstaller le module.",
      })
    }
  }

  const openModuleDetails = async (module: Module) => {
    setDetailsOpen(true)
    setSelectedModuleDetails(module)

    // Charger les détails complets du module avec manifest
    try {
      const fullModule = await getModuleDetails(module.id)

      // Extraire les données du manifest pour un accès facile
      if (fullModule.manifest) {
        fullModule.permissions = fullModule.manifest.permissions
        fullModule.menu_items = fullModule.manifest.menu_items
        fullModule.hooks = fullModule.manifest.hooks
        fullModule.translations = fullModule.manifest.translations
        fullModule.dependencies = fullModule.manifest.dependencies
      }

      setSelectedModuleDetails(fullModule)
    } catch (error) {
      // Utiliser les données de base si erreur
      console.error('Failed to load module details:', error)
    }
  }

  const openModuleConfig = (module: Module) => {
    setModuleToConfig(module)
    setConfigDialogOpen(true)
  }

  const getStatusBadge = (status: string) => {
    const isActive = isModuleActive(status)
    const normalizedStatus = status.toLowerCase()

    if (isActive) {
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
          <IconCheck className="mr-1 h-3 w-3" />
          Actif
        </Badge>
      )
    } else if (normalizedStatus === "inactive" || normalizedStatus === "installed" || normalizedStatus === "disabled") {
      return (
        <Badge variant="secondary">
          <IconX className="mr-1 h-3 w-3" />
          Inactif
        </Badge>
      )
    } else if (normalizedStatus === "error") {
      return (
        <Badge variant="destructive">
          <IconAlertTriangle className="mr-1 h-3 w-3" />
          Erreur
        </Badge>
      )
    } else {
      return <Badge variant="outline">{status}</Badge>
    }
  }

  if (loading) {
    return (
      <ContentSection
        title="Modules"
        desc="Gérez les modules installés et activez de nouvelles fonctionnalités."
        className="w-full lg:max-w-full"
      >
        <div className="flex items-center justify-center py-8">
          <IconRefresh className="h-6 w-6 animate-spin" />
        </div>
      </ContentSection>
    )
  }

  return (
    <ContentSection
      title="Modules"
      desc="Gérez les modules installés et activez de nouvelles fonctionnalités."
      className="w-full lg:max-w-full"
    >
      <>
      <div className="space-y-4">
        {/* Search and Filter Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher un module..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            {selectedModules.size > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={activateSelected}>
                  <IconCheckbox className="mr-2 h-4 w-4" />
                  Activer ({selectedModules.size})
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>
                  Désélectionner
                </Button>
                <Separator orientation="vertical" className="h-6" />
              </>
            )}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Trier par..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Nom</SelectItem>
                <SelectItem value="status">Statut</SelectItem>
                <SelectItem value="category">Catégorie</SelectItem>
                <SelectItem value="date">Date d&apos;installation</SelectItem>
              </SelectContent>
            </Select>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={fetchModules}>
                    <IconRefresh className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Actualiser la liste</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button size="sm" className="h-9" onClick={() => setUploadDialogOpen(true)}>
              <IconUpload className="mr-2 h-4 w-4" />
              Installer
            </Button>
          </div>
        </div>

        {/* Selection Actions */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            {filteredModules.length} module{filteredModules.length > 1 ? "s" : ""}
            {searchQuery && ` trouvé${filteredModules.length > 1 ? "s" : ""}`}
          </div>
          {filteredModules.length > 0 && (
            <Button variant="ghost" size="sm" onClick={selectAll}>
              <IconBoxMultiple className="mr-2 h-4 w-4" />
              Tout sélectionner
            </Button>
          )}
        </div>

        {/* Modules Grid - Compact */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredModules.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <IconPuzzle className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="mb-2 text-base font-medium">
                  {searchQuery ? "Aucun module trouvé" : "Aucun module installé"}
                </p>
                <p className="mb-4 text-sm text-muted-foreground">
                  {searchQuery ? "Essayez une autre recherche" : "Commencez par installer votre premier module"}
                </p>
                {!searchQuery && (
                  <Button onClick={() => setUploadDialogOpen(true)}>
                    <IconUpload className="mr-2 h-4 w-4" />
                    Installer un module
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            filteredModules.map((module) => (
              <TooltipProvider key={module.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Card
                      className="flex flex-col cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => openModuleDetails(module)}
                    >
                      <CardHeader className="pb-2 pt-3 px-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <Checkbox
                              checked={selectedModules.has(module.id)}
                              onCheckedChange={() => toggleSelection(module.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-0.5"
                            />
                            {module.icon_url ? (
                              <img
                                src={module.icon_url}
                                alt={module.name}
                                className="h-7 w-7 rounded object-cover flex-shrink-0"
                              />
                            ) : (
                              <div
                                className="flex h-7 w-7 items-center justify-center rounded flex-shrink-0"
                                style={{
                                  backgroundColor: module.color ? `${module.color}20` : undefined,
                                }}
                              >
                                <IconPuzzle
                                  className="h-4 w-4"
                                  style={{ color: module.color || "currentColor" }}
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-sm truncate">{module.name}</CardTitle>
                              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                <Badge variant="outline" className="text-[10px] font-mono px-1 py-0">
                                  v{module.version}
                                </Badge>
                                {getStatusBadge(module.status)}
                              </div>
                            </div>
                          </div>
                          <Switch
                            checked={isModuleActive(module.status)}
                            onCheckedChange={() => toggleModule(module)}
                            disabled={module.status.toLowerCase() === "error" || module.is_system}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-shrink-0"
                          />
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1 pb-2 px-3">
                        <CardDescription className="text-xs line-clamp-2">
                          {module.description}
                        </CardDescription>
                        {module.category && (
                          <Badge variant="outline" className="mt-1.5 text-[10px]">
                            {module.category}
                          </Badge>
                        )}
                      </CardContent>
                      <CardFooter className="flex gap-1 border-t pt-2 pb-2 px-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 h-7 text-xs px-1.5"
                          disabled={!isModuleActive(module.status)}
                          onClick={(e) => {
                            e.stopPropagation()
                            openModuleConfig(module)
                          }}
                        >
                          <IconSettings className="mr-1 h-3 w-3" />
                          Config
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 h-7 text-xs px-1.5"
                          disabled
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IconDownload className="mr-1 h-3 w-3" />
                          MAJ
                        </Button>
                        {!module.is_system && !module.is_required && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1.5"
                            onClick={(e) => {
                              e.stopPropagation()
                              setModuleToDelete(module)
                              setDeleteDialogOpen(true)
                            }}
                          >
                            <IconTrash className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </CardFooter>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <div className="space-y-1">
                      <p className="font-semibold">{module.name}</p>
                      <p className="text-xs text-muted-foreground">{module.description}</p>
                      {module.author && (
                        <p className="text-xs">Auteur: {module.author}</p>
                      )}
                      {module.installed_at && (
                        <p className="text-xs">
                          Installé le: {new Date(module.installed_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))
          )}
        </div>
      </div>

      {/* Module Details Drawer */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent className="sm:max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center gap-3">
              {selectedModuleDetails?.icon_url ? (
                <img
                  src={selectedModuleDetails.icon_url}
                  alt={selectedModuleDetails.name}
                  className="h-12 w-12 rounded-lg object-cover"
                />
              ) : (
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: selectedModuleDetails?.color ? `${selectedModuleDetails.color}20` : undefined,
                  }}
                >
                  <IconPuzzle
                    className="h-6 w-6"
                    style={{ color: selectedModuleDetails?.color || "currentColor" }}
                  />
                </div>
              )}
              <div className="flex-1">
                <SheetTitle>{selectedModuleDetails?.name}</SheetTitle>
                <SheetDescription>
                  Version {selectedModuleDetails?.version} • {selectedModuleDetails?.category}
                </SheetDescription>
              </div>
              {selectedModuleDetails && getStatusBadge(selectedModuleDetails.status)}
            </div>
          </SheetHeader>

          {/* Actions avec ButtonGroup */}
          <div className="mt-4 flex gap-2">
            <Button
              className="flex-1"
              size="sm"
              disabled={!selectedModuleDetails || !isModuleActive(selectedModuleDetails.status)}
              onClick={() => {
                if (selectedModuleDetails) {
                  setDetailsOpen(false)
                  openModuleConfig(selectedModuleDetails)
                }
              }}
            >
              <IconSettings className="mr-2 h-4 w-4" />
              Configurer
            </Button>
            <Button
              className="flex-1"
              size="sm"
              variant="outline"
              disabled
            >
              <IconDownload className="mr-2 h-4 w-4" />
              Mise à jour
            </Button>
            {selectedModuleDetails && !selectedModuleDetails.is_system && !selectedModuleDetails.is_required && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDetailsOpen(false)
                  setModuleToDelete(selectedModuleDetails)
                  setDeleteDialogOpen(true)
                }}
              >
                <IconTrash className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>

          <Separator className="my-4" />

          <Tabs defaultValue="overview" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview" className="text-xs">Aperçu</TabsTrigger>
              <TabsTrigger value="details" className="text-xs">Détails</TabsTrigger>
              <TabsTrigger value="config" className="text-xs">Configuration</TabsTrigger>
            </TabsList>

            {/* Tab: Aperçu */}
            <TabsContent value="overview" className="space-y-6 mt-4">
              {/* Description */}
              <div>
                <h3 className="mb-2 text-sm font-semibold">Description</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedModuleDetails?.description}
                </p>
              </div>

              <Separator />

              {/* Informations */}
              <div>
                <h3 className="mb-3 text-sm font-semibold">Informations</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Auteur:</span>
                    <span>{selectedModuleDetails?.author || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Code:</span>
                    <span className="font-mono text-xs">{selectedModuleDetails?.code}</span>
                  </div>
                  {selectedModuleDetails?.installed_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Installé le:</span>
                      <span>{new Date(selectedModuleDetails.installed_at).toLocaleDateString()}</span>
                    </div>
                  )}
                  {selectedModuleDetails?.activated_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Activé le:</span>
                      <span>{new Date(selectedModuleDetails.activated_at).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Properties */}
              <div>
                <h3 className="mb-3 text-sm font-semibold">Propriétés</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedModuleDetails?.is_system && (
                    <Badge variant="outline">
                      <IconShieldCheck className="mr-1 h-3 w-3" />
                      Module système
                    </Badge>
                  )}
                  {selectedModuleDetails?.is_required && (
                    <Badge variant="outline">
                      <IconAlertTriangle className="mr-1 h-3 w-3" />
                      Module requis
                    </Badge>
                  )}
                  {selectedModuleDetails?.requires_license && (
                    <Badge variant="outline">Licence requise</Badge>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Tab: Détails */}
            <TabsContent value="details" className="space-y-4 mt-4">
              {/* Permissions */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <IconKey className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Permissions</h3>
                  <Badge variant="secondary" className="text-xs">
                    {selectedModuleDetails?.permissions?.length || 0}
                  </Badge>
                </div>
                {selectedModuleDetails?.permissions && selectedModuleDetails.permissions.length > 0 ? (
                  <div className="space-y-2">
                    {selectedModuleDetails.permissions.map((perm, index) => (
                      <div key={index} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-medium">{perm.name}</p>
                            <p className="text-xs font-mono text-muted-foreground mt-0.5">{perm.code}</p>
                            {perm.description && (
                              <p className="text-xs text-muted-foreground mt-1">{perm.description}</p>
                            )}
                          </div>
                          {perm.category && (
                            <Badge variant="outline" className="text-xs">{perm.category}</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucune permission définie</p>
                )}
              </div>

              <Separator />

              {/* Menus */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <IconMenu2 className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Items de menu</h3>
                  <Badge variant="secondary" className="text-xs">
                    {selectedModuleDetails?.menu_items?.length || 0}
                  </Badge>
                </div>
                {selectedModuleDetails?.menu_items && selectedModuleDetails.menu_items.length > 0 ? (
                  <div className="space-y-2">
                    {selectedModuleDetails.menu_items.map((item, index) => (
                      <div key={index} className="rounded-lg border p-3 text-sm flex items-center gap-3">
                        {item.icon && <IconChevronRight className="h-4 w-4 text-muted-foreground" />}
                        <div className="flex-1">
                          <p className="font-medium">{item.label}</p>
                          <p className="text-xs font-mono text-muted-foreground">{item.route}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">Ordre: {item.order}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun item de menu défini</p>
                )}
              </div>

              <Separator />

              {/* Hooks */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <IconWebhook className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Hooks & Triggers</h3>
                  <Badge variant="secondary" className="text-xs">
                    {selectedModuleDetails?.hooks?.length || 0}
                  </Badge>
                </div>
                {selectedModuleDetails?.hooks && selectedModuleDetails.hooks.length > 0 ? (
                  <div className="space-y-2">
                    {selectedModuleDetails.hooks.map((hook, index) => (
                      <div key={index} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <p className="font-medium">{hook.name}</p>
                            <p className="text-xs font-mono text-muted-foreground mt-0.5">{hook.event}</p>
                          </div>
                          <Badge variant={hook.is_active ? "default" : "secondary"} className="text-xs">
                            {hook.is_active ? "Actif" : "Inactif"}
                          </Badge>
                        </div>
                        {hook.description && (
                          <p className="text-xs text-muted-foreground">{hook.description}</p>
                        )}
                        <div className="mt-2 flex gap-2">
                          <Badge variant="outline" className="text-xs">Priorité: {hook.priority}</Badge>
                          {hook.conditions && (
                            <Badge variant="outline" className="text-xs">Conditions</Badge>
                          )}
                          {hook.actions && hook.actions.length > 0 && (
                            <Badge variant="outline" className="text-xs">{hook.actions.length} action(s)</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun hook défini</p>
                )}
              </div>

              <Separator />

              {/* Langues */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <IconLanguage className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Langues disponibles</h3>
                  <Badge variant="secondary" className="text-xs">
                    {selectedModuleDetails?.translations ? Object.keys(selectedModuleDetails.translations).length : 0}
                  </Badge>
                </div>
                {selectedModuleDetails?.translations && Object.keys(selectedModuleDetails.translations).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(selectedModuleDetails.translations).map((lang) => (
                      <Badge key={lang} variant="outline" className="text-xs">
                        {lang.toUpperCase()} ({Object.keys(selectedModuleDetails.translations![lang]).length} clés)
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucune traduction disponible</p>
                )}
              </div>

              <Separator />

              {/* Dépendances */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <IconLink className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Dépendances</h3>
                </div>

                {/* Services CORE */}
                {selectedModuleDetails?.dependencies?.core_services && selectedModuleDetails.dependencies.core_services.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground mb-2">Services CORE requis:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedModuleDetails.dependencies.core_services.map((service) => (
                        <Badge key={service} variant="secondary" className="text-xs">
                          {service}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Modules */}
                {selectedModuleDetails?.dependencies?.modules && selectedModuleDetails.dependencies.modules.length > 0 ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Modules requis:</p>
                    <div className="space-y-2">
                      {selectedModuleDetails.dependencies.modules.map((dep, index) => (
                        <div key={index} className="rounded-lg border p-2 text-sm flex items-center justify-between">
                          <div>
                            <p className="font-medium">{dep.name}</p>
                            <p className="text-xs font-mono text-muted-foreground">{dep.code}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {dep.min_version && (
                              <Badge variant="outline" className="text-xs">≥ {dep.min_version}</Badge>
                            )}
                            {dep.is_optional && (
                              <Badge variant="secondary" className="text-xs">Optionnel</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  !selectedModuleDetails?.dependencies?.core_services?.length && (
                    <p className="text-sm text-muted-foreground">Aucune dépendance externe</p>
                  )
                )}
              </div>
            </TabsContent>

            {/* Tab: Configuration */}
            <TabsContent value="config" className="space-y-4 mt-4">
              <div className="rounded-lg border p-4">
                <div className="mb-4 flex items-center gap-2">
                  <IconInfoCircle className="h-5 w-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Les paramètres de configuration seront disponibles prochainement.
                    Chaque module pourra définir ses propres paramètres configurables.
                  </p>
                </div>

                {/* Example configuration fields */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="config-enabled">Activer les notifications</Label>
                    <div className="flex items-center gap-2">
                      <Switch id="config-enabled" disabled />
                      <span className="text-sm text-muted-foreground">Recevoir des notifications pour ce module</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="config-api">Clé API (exemple)</Label>
                    <Input
                      id="config-api"
                      placeholder="sk_..."
                      disabled
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Configuration Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Configuration - {moduleToConfig?.name}</DialogTitle>
            <DialogDescription>
              Paramètres du module {moduleToConfig?.name} (v{moduleToConfig?.version})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-4">
              <div className="mb-4 flex items-center gap-2">
                <IconInfoCircle className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Les paramètres de configuration seront disponibles prochainement.
                  Chaque module pourra définir ses propres paramètres configurables.
                </p>
              </div>

              {/* Example configuration fields */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="config-enabled">Activer les notifications</Label>
                  <div className="flex items-center gap-2">
                    <Switch id="config-enabled" disabled />
                    <span className="text-sm text-muted-foreground">Recevoir des notifications pour ce module</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="config-api">Clé API (exemple)</Label>
                  <Input
                    id="config-api"
                    placeholder="sk_..."
                    disabled
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>
              Annuler
            </Button>
            <Button disabled>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Installer un module</DialogTitle>
            <DialogDescription>
              Téléchargez un fichier ZIP contenant votre module.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div
              className={`relative rounded-lg border-2 border-dashed p-8 transition-colors ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".zip"
                onChange={handleFileSelect}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <div className="flex flex-col items-center justify-center text-center">
                <IconCloudUpload className="mb-3 h-12 w-12 text-muted-foreground" />
                {selectedFile ? (
                  <>
                    <p className="mb-1 font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mb-1 font-medium">
                      Glissez-déposez un fichier ZIP ici
                    </p>
                    <p className="text-sm text-muted-foreground">
                      ou cliquez pour sélectionner
                    </p>
                  </>
                )}
              </div>
            </div>

            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Installation en cours...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUploadDialogOpen(false)
                setSelectedFile(null)
              }}
              disabled={uploading}
            >
              Annuler
            </Button>
            <Button onClick={handleInstall} disabled={!selectedFile || uploading}>
              {uploading ? "Installation..." : "Installer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désinstaller le module ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir désinstaller{" "}
              <span className="font-semibold">{moduleToDelete?.name}</span> ?
              Cette action est irréversible et supprimera toutes les données
              associées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUninstall}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Désinstaller
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
    </ContentSection>
  )
}
