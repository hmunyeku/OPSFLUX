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
  IconDeviceFloppy,
  IconPlus,
  IconX,
} from "@tabler/icons-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createDashboard } from "@/lib/api/dashboards"
import { useToast } from "@/hooks/use-toast"
import WidgetSidebar from "@/components/dashboard/widget-sidebar"
import { getWidgetMeta } from "@/widgets/registry"
import type { DashboardCreate, DashboardWidgetWithWidget } from "@/types/dashboard"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

export default function NewDashboardPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [selectedWidgets, setSelectedWidgets] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
          widget_id: widgetType, // Will be replaced with actual widget ID by backend
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
        description: `Le dashboard "${created.name}" a été créé avec succès`,
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
      <div className="space-y-6 p-4 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboards")}
          >
            <IconArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Nouveau Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Créez un dashboard personnalisé avec vos widgets préférés
            </p>
          </div>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>Informations du Dashboard</CardTitle>
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
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Description de mon dashboard..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

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
          </CardContent>
        </Card>

        {/* Widgets Selection */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Widgets</CardTitle>
                <CardDescription>
                  Sélectionnez les widgets à afficher dans votre dashboard
                </CardDescription>
              </div>
              <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetTrigger asChild>
                  <Button>
                    <IconPlus className="h-4 w-4 mr-2" />
                    Ajouter un widget
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[540px]">
                  <SheetHeader>
                    <SheetTitle>Sélectionner un widget</SheetTitle>
                    <SheetDescription>
                      Choisissez un widget à ajouter à votre dashboard
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6">
                    <WidgetSidebar onAddWidget={handleAddWidget} />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </CardHeader>
          <CardContent>
            {selectedWidgets.length === 0 ? (
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Aucun widget sélectionné
                </p>
                <Button variant="outline" onClick={() => setSidebarOpen(true)}>
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
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-medium text-sm">{meta?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {meta?.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
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
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/dashboards")}
            disabled={isSaving}
          >
            Annuler
          </Button>
          <Button onClick={handleCreate} disabled={isSaving || !name.trim()}>
            <IconDeviceFloppy className="h-4 w-4 mr-2" />
            {isSaving ? "Création..." : "Créer le dashboard"}
          </Button>
        </div>
      </div>
    </>
  )
}
