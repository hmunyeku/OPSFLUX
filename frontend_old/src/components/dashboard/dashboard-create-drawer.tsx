"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  IconDeviceFloppy,
  IconPlus,
  IconX,
  IconUpload,
} from "@tabler/icons-react"
import { createDashboard, importDashboardFromJSON, validateDashboardJSON, type DashboardExportData } from "@/lib/api/dashboards"
import { useToast } from "@/hooks/use-toast"
import WidgetSidebar from "./widget-sidebar"
import { getWidgetMeta } from "@/widgets/registry"
import type { DashboardCreate } from "@/types/dashboard"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter, SheetClose } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

interface DashboardCreateDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function DashboardCreateDrawer({
  open,
  onOpenChange,
  onSuccess,
}: DashboardCreateDrawerProps) {
  const router = useRouter()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [activeTab, setActiveTab] = useState<"create" | "import">("create")
  const [name, setName] = useState("")
  const [menuName, setMenuName] = useState("")
  const [description, setDescription] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [isHome, setIsHome] = useState(false)
  const [selectedWidgets, setSelectedWidgets] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const resetForm = () => {
    setName("")
    setMenuName("")
    setDescription("")
    setIsPublic(false)
    setIsHome(false)
    setSelectedWidgets([])
    setActiveTab("create")
  }

  const handleAddWidget = (widgetType: string) => {
    if (!selectedWidgets.includes(widgetType)) {
      setSelectedWidgets([...selectedWidgets, widgetType])
      toast({
        title: "Widget ajouté",
        description: "Le widget a été ajouté à votre sélection",
      })
    } else {
      toast({
        title: "Widget déjà ajouté",
        description: "Ce widget est déjà dans votre sélection",
        variant: "destructive",
      })
    }
    setSidebarOpen(false)
  }

  const handleRemoveWidget = (widgetType: string) => {
    setSelectedWidgets(selectedWidgets.filter((w) => w !== widgetType))
  }

  const handleCreate = async () => {
    const token = auth.getToken()
    if (!token) return
    if (!name.trim()) {
      toast({
        title: "Erreur",
        description: "Le nom du dashboard est requis",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      // Prepare widgets with default positions
      const widgets = selectedWidgets.map((widgetType, index) => {
        const meta = getWidgetMeta(widgetType)
        const row = Math.floor(index / 3)
        const col = index % 3

        return {
          widget_id: widgetType,
          x: col * 4,
          y: row * 3,
          w: meta?.defaultSize.w || 3,
          h: meta?.defaultSize.h || 2,
          config: meta?.defaultConfig || {},
        }
      })

      const dashboardData: DashboardCreate = {
        name: name.trim(),
        menu_name: menuName.trim() || undefined,
        description: description.trim() || undefined,
        is_public: isPublic,
        is_home: isHome,
        layout_config: {
          column: 12,
          cellHeight: 100,
          margin: 10,
        },
        widgets: widgets.length > 0 ? widgets : undefined,
      }

      const created = await createDashboard(token, dashboardData)

      toast({
        title: "Dashboard créé",
        description: `Le dashboard "${created.name}" a été créé avec succès`,
      })

      resetForm()
      onOpenChange(false)
      onSuccess?.()
      router.push(`/dashboards/${created.id}`)
    } catch (error) {
      console.error("Failed to create dashboard:", error)
      toast({
        title: "Erreur",
        description: "Impossible de créer le dashboard",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const token = auth.getToken()
    if (!token) return

    setIsSaving(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text) as DashboardExportData

      // Validate JSON structure
      const validation = validateDashboardJSON(data)
      if (!validation.valid) {
        toast({
          title: "Fichier invalide",
          description: validation.error || "Le fichier JSON n'est pas valide",
          variant: "destructive",
        })
        return
      }

      // Import dashboard
      const imported = await importDashboardFromJSON(token, data)

      toast({
        title: "Dashboard importé",
        description: `Le dashboard "${imported.name}" a été importé avec succès`,
      })

      resetForm()
      onOpenChange(false)
      onSuccess?.()
      router.push(`/dashboards/${imported.id}`)
    } catch (error) {
      console.error("Failed to import dashboard:", error)
      toast({
        title: "Erreur d'import",
        description: error instanceof Error ? error.message : "Impossible d'importer le dashboard",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col p-0">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>Nouveau Dashboard</SheetTitle>
            <SheetDescription>
              Créez un dashboard personnalisé ou importez-en un depuis un fichier JSON
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="p-6">
              <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
                <TabsTrigger value="create" className="gap-2">
                  <IconPlus className="h-4 w-4" />
                  Créer
                </TabsTrigger>
                <TabsTrigger value="import" className="gap-2">
                  <IconUpload className="h-4 w-4" />
                  Importer
                </TabsTrigger>
              </TabsList>

              <TabsContent value="create" className="space-y-6 mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Informations</CardTitle>
                    <CardDescription>
                      Donnez un nom et une description à votre dashboard
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nom *</Label>
                      <Input
                        id="name"
                        placeholder="Mon Dashboard"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="menuName">Nom dans le menu</Label>
                      <Input
                        id="menuName"
                        placeholder="Max 10 caractères"
                        value={menuName}
                        onChange={(e) => {
                          const value = e.target.value.slice(0, 10)
                          setMenuName(value)
                        }}
                        maxLength={10}
                      />
                      <p className="text-xs text-muted-foreground">
                        {menuName.length}/10 caractères
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Description de mon dashboard..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                      />
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <div className="space-y-0.5">
                        <Label htmlFor="public">Dashboard public</Label>
                        <p className="text-xs text-muted-foreground">
                          Visible par les autres utilisateurs
                        </p>
                      </div>
                      <Switch
                        id="public"
                        checked={isPublic}
                        onCheckedChange={setIsPublic}
                      />
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <div className="space-y-0.5">
                        <Label htmlFor="home">Afficher dans l'accueil</Label>
                        <p className="text-xs text-muted-foreground">
                          Apparaîtra dans le menu Tableau de bord
                        </p>
                      </div>
                      <Switch
                        id="home"
                        checked={isHome}
                        onCheckedChange={setIsHome}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Widgets</CardTitle>
                        <CardDescription>
                          Sélectionnez les widgets à afficher
                        </CardDescription>
                      </div>
                      <Button size="sm" onClick={() => setSidebarOpen(true)}>
                        <IconPlus className="h-4 w-4 mr-2" />
                        Ajouter
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {selectedWidgets.length === 0 ? (
                      <div className="border-2 border-dashed rounded-lg p-6 text-center">
                        <p className="text-sm text-muted-foreground mb-3">
                          Aucun widget sélectionné
                        </p>
                        <Button variant="outline" size="sm" onClick={() => setSidebarOpen(true)}>
                          <IconPlus className="h-4 w-4 mr-2" />
                          Ajouter un widget
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedWidgets.map((widgetType) => {
                          const meta = getWidgetMeta(widgetType)
                          return (
                            <div
                              key={widgetType}
                              className="flex items-center justify-between p-3 border rounded-lg"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-sm truncate">{meta?.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {meta?.description}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant="secondary" className="text-xs">
                                  {meta?.category}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleRemoveWidget(widgetType)}
                                >
                                  <IconX className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="import" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Importer depuis JSON</CardTitle>
                    <CardDescription>
                      Sélectionnez un fichier JSON de dashboard exporté
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-4">
                      <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                        <IconUpload className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">
                          Glissez un fichier JSON ici
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ou cliquez sur le bouton ci-dessous
                        </p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSaving}
                      >
                        <IconUpload className="h-4 w-4 mr-2" />
                        {isSaving ? "Import en cours..." : "Sélectionner un fichier"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </ScrollArea>

          <SheetFooter className="border-t px-6 py-4 flex-shrink-0">
            {activeTab === "create" && (
              <div className="flex justify-end gap-2 w-full">
                <SheetClose asChild>
                  <Button variant="outline" disabled={isSaving}>
                    Annuler
                  </Button>
                </SheetClose>
                <Button onClick={handleCreate} disabled={isSaving || !name.trim()}>
                  <IconDeviceFloppy className="h-4 w-4 mr-2" />
                  {isSaving ? "Création..." : "Créer le dashboard"}
                </Button>
              </div>
            )}
            {activeTab === "import" && (
              <SheetClose asChild>
                <Button variant="outline" className="w-full" disabled={isSaving}>
                  Fermer
                </Button>
              </SheetClose>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Widget Selection Sidebar - Secondary Sheet */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Sélectionner un widget</SheetTitle>
            <SheetDescription>
              Choisissez un widget à ajouter à votre dashboard
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-8rem)] mt-6">
            <WidgetSidebar onAddWidget={handleAddWidget} />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  )
}
