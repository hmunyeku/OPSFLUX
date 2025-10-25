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
  IconArrowRight,
  IconCheck,
  IconChevronLeft,
  IconLayoutGrid,
  IconSettings,
  IconSparkles,
  IconX,
} from "@tabler/icons-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createDashboard } from "@/lib/api/dashboards"
import { useToast } from "@/hooks/use-toast"
import { getWidgetMeta, getAllWidgets } from "@/widgets/registry"
import type { DashboardCreate } from "@/types/dashboard"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"

type Step = "info" | "widgets" | "preview"

export default function NewDashboardPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [currentStep, setCurrentStep] = useState<Step>("info")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [isHome, setIsHome] = useState(false)
  const [selectedWidgets, setSelectedWidgets] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const allWidgets = getAllWidgets()
  const filteredWidgets = allWidgets.filter(
    (widget) =>
      widget.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      widget.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      widget.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const steps = [
    { id: "info" as Step, label: "Informations", icon: IconSettings },
    { id: "widgets" as Step, label: "Widgets", icon: IconLayoutGrid },
    { id: "preview" as Step, label: "Aperçu", icon: IconSparkles },
  ]

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep)
  const progress = ((currentStepIndex + 1) / steps.length) * 100

  const handleToggleWidget = (widgetType: string) => {
    if (selectedWidgets.includes(widgetType)) {
      setSelectedWidgets(selectedWidgets.filter((w) => w !== widgetType))
    } else {
      setSelectedWidgets([...selectedWidgets, widgetType])
    }
  }

  const handleNext = () => {
    if (currentStep === "info") {
      if (!name.trim()) {
        toast({
          title: "Nom requis",
          description: "Veuillez entrer un nom pour votre dashboard",
          variant: "destructive",
        })
        return
      }
      setCurrentStep("widgets")
    } else if (currentStep === "widgets") {
      setCurrentStep("preview")
    }
  }

  const handleBack = () => {
    if (currentStep === "widgets") {
      setCurrentStep("info")
    } else if (currentStep === "preview") {
      setCurrentStep("widgets")
    }
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
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/20">
        {/* Progress Header */}
        <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container max-w-5xl mx-auto px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3 sm:gap-4 mb-4">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => router.push("/dashboards")}
              >
                <IconArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg sm:text-2xl font-bold tracking-tight truncate">
                  Nouveau Dashboard
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                  {steps[currentStepIndex].label}
                </p>
              </div>
            </div>

            {/* Steps */}
            <div className="flex items-center gap-2 mb-3">
              {steps.map((step, index) => {
                const Icon = step.icon
                const isActive = step.id === currentStep
                const isCompleted = index < currentStepIndex

                return (
                  <div key={step.id} className="flex items-center flex-1">
                    <div
                      className={cn(
                        "flex items-center gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-all flex-1",
                        isActive && "bg-primary text-primary-foreground shadow-sm",
                        isCompleted && "bg-muted",
                        !isActive && !isCompleted && "bg-muted/50"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="text-xs sm:text-sm font-medium truncate hidden sm:inline">
                        {step.label}
                      </span>
                      {isCompleted && (
                        <IconCheck className="h-3 w-3 sm:h-4 sm:w-4 ml-auto shrink-0" />
                      )}
                    </div>
                    {index < steps.length - 1 && (
                      <IconArrowRight className="h-4 w-4 mx-1 text-muted-foreground shrink-0 hidden sm:block" />
                    )}
                  </div>
                )
              })}
            </div>

            <Progress value={progress} className="h-1" />
          </div>
        </div>

        {/* Content */}
        <div className="container max-w-5xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
          {/* Step 1: Info */}
          {currentStep === "info" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <Card>
                <CardHeader>
                  <CardTitle>Informations générales</CardTitle>
                  <CardDescription>
                    Définissez les paramètres de base de votre dashboard
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      Nom du dashboard <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      placeholder="ex: Tableau de bord commercial"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="text-base"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Décrivez l'objectif de ce dashboard..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      className="text-base resize-none"
                    />
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border bg-muted/50">
                      <div className="space-y-0.5">
                        <Label htmlFor="public" className="text-base cursor-pointer">
                          Dashboard public
                        </Label>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          Visible par tous les utilisateurs
                        </p>
                      </div>
                      <Switch
                        id="public"
                        checked={isPublic}
                        onCheckedChange={setIsPublic}
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border bg-muted/50">
                      <div className="space-y-0.5">
                        <Label htmlFor="home" className="text-base cursor-pointer">
                          Afficher dans l'accueil
                        </Label>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          Apparaît dans le menu principal
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
            </div>
          )}

          {/* Step 2: Widgets */}
          {currentStep === "widgets" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <CardTitle>Sélectionner vos widgets</CardTitle>
                      <CardDescription className="mt-1.5">
                        {selectedWidgets.length} widget{selectedWidgets.length > 1 ? "s" : ""} sélectionné{selectedWidgets.length > 1 ? "s" : ""}
                      </CardDescription>
                    </div>
                    <Input
                      placeholder="Rechercher..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full sm:w-64"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[calc(100vh-28rem)] sm:h-[500px]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 pr-4">
                      {filteredWidgets.map((widget) => {
                        const isSelected = selectedWidgets.includes(widget.type)
                        const meta = getWidgetMeta(widget.type)

                        return (
                          <Card
                            key={widget.type}
                            className={cn(
                              "cursor-pointer transition-all hover:shadow-md relative overflow-hidden group",
                              isSelected && "ring-2 ring-primary shadow-sm"
                            )}
                            onClick={() => handleToggleWidget(widget.type)}
                          >
                            <CardHeader className="p-4 pb-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <CardTitle className="text-sm sm:text-base truncate">
                                    {widget.name}
                                  </CardTitle>
                                  <Badge
                                    variant="secondary"
                                    className="mt-1.5 text-xs"
                                  >
                                    {widget.category}
                                  </Badge>
                                </div>
                                <div
                                  className={cn(
                                    "h-5 w-5 sm:h-6 sm:w-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0",
                                    isSelected
                                      ? "border-primary bg-primary"
                                      : "border-muted-foreground/25"
                                  )}
                                >
                                  {isSelected && (
                                    <IconCheck className="h-3 w-3 sm:h-4 sm:w-4 text-primary-foreground" />
                                  )}
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                                {widget.description}
                              </p>
                            </CardContent>
                            {isSelected && (
                              <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
                            )}
                          </Card>
                        )
                      })}
                    </div>
                  </ScrollArea>

                  {filteredWidgets.length === 0 && (
                    <div className="text-center py-12">
                      <p className="text-sm text-muted-foreground">
                        Aucun widget trouvé
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 3: Preview */}
          {currentStep === "preview" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <Card>
                <CardHeader>
                  <CardTitle>Récapitulatif</CardTitle>
                  <CardDescription>
                    Vérifiez les informations avant de créer votre dashboard
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg border bg-muted/50">
                      <h3 className="font-semibold text-base mb-3">Informations</h3>
                      <dl className="space-y-2 text-sm">
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                          <dt className="text-muted-foreground">Nom :</dt>
                          <dd className="font-medium">{name}</dd>
                        </div>
                        {description && (
                          <div className="flex flex-col gap-1">
                            <dt className="text-muted-foreground">Description :</dt>
                            <dd className="font-medium">{description}</dd>
                          </div>
                        )}
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                          <dt className="text-muted-foreground">Visibilité :</dt>
                          <dd className="font-medium">
                            {isPublic ? "Public" : "Privé"}
                          </dd>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                          <dt className="text-muted-foreground">Accueil :</dt>
                          <dd className="font-medium">
                            {isHome ? "Oui" : "Non"}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="p-4 rounded-lg border bg-muted/50">
                      <h3 className="font-semibold text-base mb-3">
                        Widgets ({selectedWidgets.length})
                      </h3>
                      {selectedWidgets.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Aucun widget sélectionné
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {selectedWidgets.map((widgetType) => {
                            const meta = getWidgetMeta(widgetType)
                            return (
                              <div
                                key={widgetType}
                                className="flex items-center gap-2 p-2 rounded border bg-background text-sm"
                              >
                                <IconCheck className="h-4 w-4 text-primary shrink-0" />
                                <span className="truncate">{meta?.name}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Navigation */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-between mt-6 sm:mt-8 sticky bottom-0 sm:static bg-background p-4 sm:p-0 border-t sm:border-0 -mx-4 sm:mx-0">
            <Button
              variant="outline"
              onClick={currentStepIndex === 0 ? () => router.push("/dashboards") : handleBack}
              disabled={isSaving}
              className="w-full sm:w-auto"
            >
              <IconChevronLeft className="h-4 w-4 mr-2" />
              {currentStepIndex === 0 ? "Annuler" : "Retour"}
            </Button>

            {currentStep !== "preview" ? (
              <Button onClick={handleNext} className="w-full sm:w-auto">
                Suivant
                <IconArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleCreate}
                disabled={isSaving}
                className="w-full sm:w-auto"
              >
                <IconCheck className="h-4 w-4 mr-2" />
                {isSaving ? "Création..." : "Créer le dashboard"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
