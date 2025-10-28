"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { auth } from "@/lib/auth"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  IconArrowLeft,
  IconCheck,
  IconDeviceFloppy,
  IconPlus,
  IconSearch,
  IconX,
} from "@tabler/icons-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createDashboard } from "@/lib/api/dashboards"
import { useToast } from "@/hooks/use-toast"
import { getWidgetMeta, getAllWidgets } from "@/widgets/registry"
import type { DashboardCreate } from "@/types/dashboard"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { Separator } from "@/components/ui/separator"

export default function NewDashboardPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [isHome, setIsHome] = useState(false)
  const [selectedWidgets, setSelectedWidgets] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const allWidgets = getAllWidgets()
  const filteredWidgets = allWidgets.filter(
    (widget) =>
      widget.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      widget.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      widget.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleAddWidget = (widgetType: string) => {
    if (!selectedWidgets.includes(widgetType)) {
      setSelectedWidgets([...selectedWidgets, widgetType])
      toast({
        title: "Widget ajouté",
        description: getWidgetMeta(widgetType)?.name || widgetType,
      })
    }
  }

  const handleRemoveWidget = (widgetType: string) => {
    setSelectedWidgets(selectedWidgets.filter((w) => w !== widgetType))
  }

  const handleCreate = async () => {
    const token = auth.getToken()
    if (!token) return

    setIsSaving(true)
    try {
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
        description: description.trim() || undefined,
        is_public: isPublic,
        is_home: isHome,
        layout_config: {
          column: 12,
          cellHeight: 70,
          margin: 10,
        },
        widgets: widgets.length > 0 ? widgets : undefined,
      }

      const created = await createDashboard(token, dashboardData)

      toast({
        title: "Dashboard créé",
        description: `"${created.name}" a été créé avec succès`,
      })

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

  return (
    <>
      <Header />
      <div className="container max-w-4xl mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboards")}
          >
            <IconArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Créer un dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Personnalisez votre tableau de bord avec vos widgets préférés
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informations du dashboard</CardTitle>
              <CardDescription>
                Définissez le nom et les paramètres de votre dashboard
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Nom <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="Mon Dashboard"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
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

              <Separator className="my-4" />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="public">Dashboard public</Label>
                    <p className="text-xs text-muted-foreground">
                      Les autres utilisateurs pourront voir ce dashboard
                    </p>
                  </div>
                  <Switch
                    id="public"
                    checked={isPublic}
                    onCheckedChange={setIsPublic}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="home">Afficher dans l'accueil</Label>
                    <p className="text-xs text-muted-foreground">
                      Ce dashboard sera affiché dans le menu
                    </p>
                  </div>
                  <Switch
                    id="home"
                    checked={isHome}
                    onCheckedChange={setIsHome}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Widgets Selection */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle>Widgets</CardTitle>
                  <CardDescription className="mt-1.5">
                    {selectedWidgets.length} widget{selectedWidgets.length !== 1 ? "s" : ""} sélectionné{selectedWidgets.length !== 1 ? "s" : ""}
                  </CardDescription>
                </div>
                <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
                  <DrawerTrigger asChild>
                    <Button>
                      <IconPlus className="h-4 w-4 mr-2" />
                      Ajouter un widget
                    </Button>
                  </DrawerTrigger>
                  <DrawerContent className="max-h-[85vh]">
                    <DrawerHeader>
                      <DrawerTitle>Ajouter des widgets</DrawerTitle>
                      <DrawerDescription>
                        Sélectionnez les widgets à ajouter à votre dashboard
                      </DrawerDescription>
                    </DrawerHeader>
                    <div className="px-4 pb-6">
                      {/* Search */}
                      <div className="relative mb-4">
                        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Rechercher un widget..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9"
                        />
                      </div>

                      {/* Widgets Grid */}
                      <ScrollArea className="h-[60vh]">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pr-4">
                          {filteredWidgets.map((widget) => {
                            const isSelected = selectedWidgets.includes(widget.type)
                            return (
                              <Card
                                key={widget.type}
                                className={cn(
                                  "cursor-pointer transition-all hover:bg-accent/50",
                                  isSelected && "ring-2 ring-primary"
                                )}
                                onClick={() => handleAddWidget(widget.type)}
                              >
                                <CardHeader className="p-4">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <CardTitle className="text-sm truncate">
                                        {widget.name}
                                      </CardTitle>
                                      <Badge variant="secondary" className="mt-1 text-xs">
                                        {widget.category}
                                      </Badge>
                                    </div>
                                    {isSelected && (
                                      <IconCheck className="h-5 w-5 text-primary shrink-0" />
                                    )}
                                  </div>
                                </CardHeader>
                                <CardContent className="p-4 pt-0">
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {widget.description}
                                  </p>
                                </CardContent>
                              </Card>
                            )
                          })}
                        </div>

                        {filteredWidgets.length === 0 && (
                          <div className="text-center py-12">
                            <p className="text-sm text-muted-foreground">
                              Aucun widget trouvé
                            </p>
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </DrawerContent>
                </Drawer>
              </div>
            </CardHeader>
            <CardContent>
              {selectedWidgets.length === 0 ? (
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    Aucun widget sélectionné
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setDrawerOpen(true)}
                  >
                    <IconPlus className="h-4 w-4 mr-2" />
                    Ajouter votre premier widget
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedWidgets.map((widgetType) => {
                    const meta = getWidgetMeta(widgetType)
                    return (
                      <div
                        key={widgetType}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <IconCheck className="h-4 w-4 text-primary shrink-0" />
                          <div className="min-w-0">
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

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => router.push("/dashboards")}
              disabled={isSaving}
              className="w-full sm:w-auto"
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isSaving || !name.trim()}
              className="w-full sm:w-auto"
            >
              <IconDeviceFloppy className="h-4 w-4 mr-2" />
              {isSaving ? "Création..." : "Créer le dashboard"}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
