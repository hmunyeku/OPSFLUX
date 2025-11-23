"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { Project, CreateProjectDTO } from "@/lib/projects-api"
import {
  CalendarIcon,
  Save,
  X,
  ArrowLeft,
  Building2,
  Target,
  DollarSign,
  Users,
  Tag,
  MapPin,
  FileText,
  AlertCircle,
  Info,
  Plus,
  Trash2,
} from "lucide-react"

const projectSchema = z.object({
  name: z.string().min(3, "Le nom doit contenir au moins 3 caracteres").max(100),
  code: z.string().min(2, "Le code doit contenir au moins 2 caracteres").max(20).regex(/^[A-Z0-9-]+$/, "Le code ne doit contenir que des majuscules, chiffres et tirets"),
  description: z.string().min(10, "La description doit contenir au moins 10 caracteres").max(1000),
  client: z.string().min(2, "Le client est requis"),
  priority: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["draft", "planning", "active", "on-hold", "completed", "cancelled", "archived"]),
  startDate: z.date({ required_error: "La date de debut est requise" }),
  endDate: z.date({ required_error: "La date de fin est requise" }),
  budget: z.number().min(0, "Le budget doit etre positif"),
  currency: z.string().default("EUR"),
  location: z.string().optional(),
  category: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).refine((data) => data.endDate > data.startDate, {
  message: "La date de fin doit etre posterieure a la date de debut",
  path: ["endDate"],
})

type ProjectFormValues = z.infer<typeof projectSchema>

interface ProjectFormProps {
  project?: Project
  mode: "create" | "edit"
  onSubmit?: (data: CreateProjectDTO) => Promise<void>
  onCancel?: () => void
}

const priorityOptions = [
  { value: "low", label: "Basse", color: "bg-gray-100 text-gray-700" },
  { value: "medium", label: "Moyenne", color: "bg-blue-100 text-blue-700" },
  { value: "high", label: "Haute", color: "bg-orange-100 text-orange-700" },
  { value: "critical", label: "Critique", color: "bg-red-100 text-red-700" },
]

const statusOptions = [
  { value: "draft", label: "Brouillon" },
  { value: "planning", label: "Planification" },
  { value: "active", label: "Actif" },
  { value: "on-hold", label: "En pause" },
  { value: "completed", label: "Termine" },
  { value: "cancelled", label: "Annule" },
]

const categoryOptions = [
  { value: "maintenance", label: "Maintenance" },
  { value: "installation", label: "Installation" },
  { value: "inspection", label: "Inspection" },
  { value: "renovation", label: "Renovation" },
  { value: "construction", label: "Construction" },
  { value: "audit", label: "Audit" },
  { value: "training", label: "Formation" },
  { value: "other", label: "Autre" },
]

const currencyOptions = [
  { value: "EUR", label: "Euro (EUR)" },
  { value: "USD", label: "Dollar US (USD)" },
  { value: "GBP", label: "Livre Sterling (GBP)" },
  { value: "XAF", label: "Franc CFA (XAF)" },
]

export function ProjectForm({ project, mode, onSubmit, onCancel }: ProjectFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newTag, setNewTag] = useState("")
  const [activeTab, setActiveTab] = useState("general")

  const defaultValues: Partial<ProjectFormValues> = project
    ? {
        name: project.name,
        code: project.code,
        description: project.description,
        client: project.client,
        priority: project.priority,
        status: project.status,
        startDate: new Date(project.startDate),
        endDate: new Date(project.endDate),
        budget: project.budget,
        currency: project.currency || "EUR",
        location: project.location,
        category: project.category,
        notes: project.notes,
        tags: project.tags || [],
      }
    : {
        priority: "medium",
        status: "draft",
        currency: "EUR",
        budget: 0,
        tags: [],
      }

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues,
  })

  const handleSubmit = async (data: ProjectFormValues) => {
    setIsSubmitting(true)
    try {
      const submitData: CreateProjectDTO = {
        name: data.name,
        code: data.code,
        description: data.description,
        client: data.client,
        priority: data.priority,
        status: data.status,
        startDate: data.startDate.toISOString().split("T")[0],
        endDate: data.endDate.toISOString().split("T")[0],
        budget: data.budget,
        currency: data.currency,
        location: data.location,
        category: data.category,
        notes: data.notes,
        tags: data.tags,
      }

      if (onSubmit) {
        await onSubmit(submitData)
      } else {
        // Default behavior - just show success
        toast({
          title: mode === "create" ? "Projet cree" : "Projet mis a jour",
          description: `Le projet "${data.name}" a ete ${mode === "create" ? "cree" : "mis a jour"} avec succes.`,
        })
        router.push("/projects/list")
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: `Echec de la ${mode === "create" ? "creation" : "mise a jour"} du projet.`,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    } else {
      router.back()
    }
  }

  const handleAddTag = () => {
    if (newTag.trim()) {
      const currentTags = form.getValues("tags") || []
      if (!currentTags.includes(newTag.trim())) {
        form.setValue("tags", [...currentTags, newTag.trim()])
      }
      setNewTag("")
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    const currentTags = form.getValues("tags") || []
    form.setValue("tags", currentTags.filter((tag) => tag !== tagToRemove))
  }

  const generateProjectCode = () => {
    const name = form.getValues("name")
    if (name) {
      const prefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "")
      const year = new Date().getFullYear()
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0")
      form.setValue("code", `${prefix}-${year}-${random}`)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <h1 className="text-xl font-semibold">
              {mode === "create" ? "Nouveau projet" : `Modifier: ${project?.name}`}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={handleCancel}>
              <X className="h-4 w-4 mr-2" />
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Save className="h-4 w-4 mr-2" />
              {isSubmitting
                ? "Enregistrement..."
                : mode === "create"
                ? "Creer le projet"
                : "Enregistrer"}
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex">
            <TabsTrigger value="general" className="gap-2">
              <FileText className="h-4 w-4" />
              Informations
            </TabsTrigger>
            <TabsTrigger value="planning" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              Planning
            </TabsTrigger>
            <TabsTrigger value="budget" className="gap-2">
              <DollarSign className="h-4 w-4" />
              Budget
            </TabsTrigger>
          </TabsList>

          {/* General Information Tab */}
          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Informations generales
                </CardTitle>
                <CardDescription>
                  Les informations de base du projet
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nom du projet *</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Maintenance Plateforme Alpha" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Code projet *</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input placeholder="Ex: MAINT-2024-001" {...field} className="font-mono" />
                          </FormControl>
                          <Button type="button" variant="outline" onClick={generateProjectCode}>
                            Generer
                          </Button>
                        </div>
                        <FormDescription>
                          Code unique en majuscules
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Decrivez le projet, ses objectifs et son perimetre..."
                          className="min-h-[120px] resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="client"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client *</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: TotalEnergies" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categorie</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selectionnez une categorie" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categoryOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priorite *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {priorityOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                <div className="flex items-center gap-2">
                                  <Badge className={option.color} variant="secondary">
                                    {option.label}
                                  </Badge>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Statut *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {statusOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Localisation
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Plateforme offshore Golfe de Guinee" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tags */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Tags
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ajouter un tag..."
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleAddTag()
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={handleAddTag}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(form.watch("tags") || []).map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="gap-1">
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Planning Tab */}
          <TabsContent value="planning" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  Planning du projet
                </CardTitle>
                <CardDescription>
                  Definissez les dates cles du projet
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Date de debut *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value
                                  ? format(field.value, "PPP", { locale: fr })
                                  : "Selectionnez une date"}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Date de fin *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value
                                  ? format(field.value, "PPP", { locale: fr })
                                  : "Selectionnez une date"}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {form.watch("startDate") && form.watch("endDate") && (
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <Info className="h-4 w-4 text-blue-500" />
                      <span>
                        Duree estimee:{" "}
                        <strong>
                          {Math.ceil(
                            (form.watch("endDate").getTime() - form.watch("startDate").getTime()) /
                              (1000 * 60 * 60 * 24)
                          )}{" "}
                          jours
                        </strong>
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Budget Tab */}
          <TabsContent value="budget" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Budget du projet
                </CardTitle>
                <CardDescription>
                  Definissez le budget previsionnel
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="budget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Budget total *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Ex: 500000"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormDescription>
                          Montant total alloue au projet
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Devise</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {currencyOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {form.watch("budget") > 0 && (
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                      <DollarSign className="h-4 w-4" />
                      <span>
                        Budget previsionnel:{" "}
                        <strong>
                          {new Intl.NumberFormat("fr-FR", {
                            style: "currency",
                            currency: form.watch("currency") || "EUR",
                          }).format(form.watch("budget"))}
                        </strong>
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Additional Notes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes additionnelles</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          placeholder="Ajoutez des notes ou commentaires sur le projet..."
                          className="min-h-[100px] resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Form validation errors summary */}
        {Object.keys(form.formState.errors).length > 0 && (
          <Card className="border-destructive">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                <div>
                  <p className="font-medium text-destructive">
                    Veuillez corriger les erreurs suivantes :
                  </p>
                  <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside">
                    {Object.entries(form.formState.errors).map(([field, error]) => (
                      <li key={field}>{error?.message?.toString()}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </form>
    </Form>
  )
}
