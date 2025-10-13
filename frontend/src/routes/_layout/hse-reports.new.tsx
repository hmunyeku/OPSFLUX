import { createFileRoute } from "@tanstack/react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { AlertCircle, Save, X } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export const Route = createFileRoute("/_layout/hse-reports/new")({
  component: NewHSEReport,
})

const hseReportSchema = z.object({
  title: z.string().min(5, "Le titre doit contenir au moins 5 caractères"),
  type: z.string({
    required_error: "Veuillez sélectionner un type d'incident",
  }),
  severity: z.string({
    required_error: "Veuillez sélectionner une sévérité",
  }),
  location: z.string().min(3, "La localisation est requise"),
  platform: z.string().min(1, "La plateforme est requise"),
  description: z.string().min(20, "La description doit contenir au moins 20 caractères"),
  immediateAction: z.string().optional(),
  witnesses: z.string().optional(),
  injuries: z.boolean().default(false),
  injuryDetails: z.string().optional(),
  environmentalImpact: z.boolean().default(false),
  impactDetails: z.string().optional(),
  reportedBy: z.string().min(1, "Le nom du rapporteur est requis"),
  reporterEmail: z.string().email("Email invalide"),
  reporterPhone: z.string().optional(),
})

type HSEReportForm = z.infer<typeof hseReportSchema>

function NewHSEReport() {
  const form = useForm<HSEReportForm>({
    resolver: zodResolver(hseReportSchema),
    defaultValues: {
      injuries: false,
      environmentalImpact: false,
    },
  })

  const onSubmit = (data: HSEReportForm) => {
    console.log(data)
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/hse-reports">HSE Reports</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Nouveau rapport</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Nouveau rapport HSE</h1>
        <p className="text-muted-foreground mt-1">
          Déclarer un incident, near-miss ou observation de sécurité
        </p>
      </div>

      {/* Alert */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Important</AlertTitle>
        <AlertDescription>
          En cas d'urgence, contactez immédiatement le HSE Manager au +1 234 567 890
        </AlertDescription>
      </Alert>

      {/* Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs defaultValue="general" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="general">Informations générales</TabsTrigger>
              <TabsTrigger value="details">Détails</TabsTrigger>
              <TabsTrigger value="impact">Impact</TabsTrigger>
              <TabsTrigger value="reporter">Rapporteur</TabsTrigger>
            </TabsList>

            {/* Tab 1: General Information */}
            <TabsContent value="general">
              <Card>
                <CardHeader>
                  <CardTitle>Informations générales</CardTitle>
                  <CardDescription>
                    Informations de base sur l'incident
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Titre *</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Near miss - Dropped object" {...field} />
                        </FormControl>
                        <FormDescription>
                          Un titre court et descriptif de l'incident
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type d'incident *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Sélectionner un type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="incident">Incident</SelectItem>
                              <SelectItem value="near-miss">Near Miss</SelectItem>
                              <SelectItem value="observation">Observation</SelectItem>
                              <SelectItem value="hazard">Hazard</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="severity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sévérité *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Sélectionner une sévérité" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="low">Faible</SelectItem>
                              <SelectItem value="medium">Moyenne</SelectItem>
                              <SelectItem value="high">Élevée</SelectItem>
                              <SelectItem value="critical">Critique</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="platform"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Plateforme *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Sélectionner une plateforme" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="platform-alpha">Platform Alpha</SelectItem>
                              <SelectItem value="platform-beta">Platform Beta</SelectItem>
                              <SelectItem value="platform-gamma">Platform Gamma</SelectItem>
                              <SelectItem value="vessel-1">Vessel 1</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Localisation *</FormLabel>
                          <FormControl>
                            <Input placeholder="Ex: Deck A, Engine Room" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 2: Details */}
            <TabsContent value="details">
              <Card>
                <CardHeader>
                  <CardTitle>Détails de l'incident</CardTitle>
                  <CardDescription>
                    Description complète de l'événement
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description complète *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Décrire en détail ce qui s'est passé..."
                            className="min-h-[150px]"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Inclure le contexte, les circonstances et la séquence d'événements
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="immediateAction"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Actions immédiates prises</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Décrire les actions immédiates..."
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="witnesses"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Témoins</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Liste des témoins présents..."
                            className="min-h-[80px]"
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

            {/* Tab 3: Impact */}
            <TabsContent value="impact">
              <Card>
                <CardHeader>
                  <CardTitle>Impact et conséquences</CardTitle>
                  <CardDescription>
                    Détails sur les blessures et impacts environnementaux
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="injuries"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Blessures</FormLabel>
                          <FormDescription>
                            Y a-t-il eu des blessures ?
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {form.watch("injuries") && (
                    <FormField
                      control={form.control}
                      name="injuryDetails"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Détails des blessures</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Décrire les blessures..."
                              className="min-h-[100px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="environmentalImpact"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Impact environnemental</FormLabel>
                          <FormDescription>
                            Y a-t-il eu un impact environnemental ?
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {form.watch("environmentalImpact") && (
                    <FormField
                      control={form.control}
                      name="impactDetails"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Détails de l'impact</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Décrire l'impact environnemental..."
                              className="min-h-[100px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 4: Reporter */}
            <TabsContent value="reporter">
              <Card>
                <CardHeader>
                  <CardTitle>Informations du rapporteur</CardTitle>
                  <CardDescription>
                    Coordonnées de la personne déclarant l'incident
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="reportedBy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nom complet *</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="reporterEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email *</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="john.doe@company.com"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="reporterPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Téléphone</FormLabel>
                          <FormControl>
                            <Input placeholder="+1 234 567 890" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Actions */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <Button type="button" variant="outline">
                  <X className="mr-2 h-4 w-4" />
                  Annuler
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline">
                    Enregistrer comme brouillon
                  </Button>
                  <Button type="submit">
                    <Save className="mr-2 h-4 w-4" />
                    Soumettre le rapport
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  )
}
