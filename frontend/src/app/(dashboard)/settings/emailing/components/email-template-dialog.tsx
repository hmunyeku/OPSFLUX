"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import dynamic from "next/dynamic"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { apiClient } from "@/lib/api-client"
import { IconCode, IconEye, IconLoader2, IconVariable } from "@tabler/icons-react"

// Dynamic import pour Monaco Editor (évite SSR issues)
const HtmlEditor = dynamic(() => import("@/components/html-editor"), {
  ssr: false,
  loading: () => (
    <div className="border rounded-lg h-[400px] flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Chargement de l'éditeur...</div>
    </div>
  ),
})

const formSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  slug: z.string().min(1, "Le slug est requis").regex(/^[a-z0-9-]+$/, "Le slug ne peut contenir que des lettres minuscules, chiffres et tirets"),
  description: z.string().optional(),
  category: z.enum(["transactional", "notification", "marketing", "system", "custom"]),
  subject: z.string().min(1, "Le sujet est requis"),
  html_content: z.string().min(1, "Le contenu HTML est requis"),
  text_content: z.string().optional(),
  available_variables: z.string().optional(),
  is_active: z.boolean().default(true),
})

interface EmailTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string | null
  onSuccess: () => void
}

export default function EmailTemplateDialog({
  open,
  onOpenChange,
  templateId,
  onSuccess,
}: EmailTemplateDialogProps) {
  const [loading, setLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState("")
  const { toast } = useToast()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      category: "custom",
      subject: "",
      html_content: "",
      text_content: "",
      available_variables: "",
      is_active: true,
    },
  })

  useEffect(() => {
    if (open && templateId) {
      fetchTemplate()
    } else if (open && !templateId) {
      form.reset({
        name: "",
        slug: "",
        description: "",
        category: "custom",
        subject: "",
        html_content: "",
        text_content: "",
        available_variables: "",
        is_active: true,
      })
      setPreviewHtml("")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, templateId])

  const fetchTemplate = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get(`/api/v1/email-templates/${templateId}`)
      const data = response.data as {
        name: string
        slug: string
        description?: string
        category: "transactional" | "notification" | "marketing" | "system" | "custom"
        subject: string
        html_content: string
        text_content?: string
        available_variables?: string[]
        is_active: boolean
      }
      form.reset({
        name: data.name,
        slug: data.slug,
        description: data.description || "",
        category: data.category,
        subject: data.subject,
        html_content: data.html_content,
        text_content: data.text_content || "",
        available_variables: data.available_variables?.join(", ") || "",
        is_active: data.is_active,
      })
      setPreviewHtml(data.html_content)
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Impossible de charger le template",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setLoading(true)

      const variables = values.available_variables
        ? values.available_variables.split(",").map((v) => v.trim()).filter(Boolean)
        : []

      const payload = {
        ...values,
        available_variables: variables,
      }

      if (templateId) {
        await apiClient.patch(`/api/v1/email-templates/${templateId}`, payload)
        toast({
          title: "Succès",
          description: "Template mis à jour avec succès",
        })
      } else {
        await apiClient.post("/api/v1/email-templates/", payload)
        toast({
          title: "Succès",
          description: "Template créé avec succès",
        })
      }

      onSuccess()
    } catch (error) {
      const err = error as { response?: { data?: { detail?: string } } }
      toast({
        title: "Erreur",
        description: err.response?.data?.detail || "Impossible de sauvegarder le template",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleHtmlChange = (value: string) => {
    form.setValue("html_content", value)
    setPreviewHtml(value)
  }

  const variables = form.watch("available_variables")?.split(",").map(v => v.trim()).filter(Boolean) || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-4xl lg:max-w-6xl h-[95vh] sm:h-[90vh] p-0">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-4 border-b">
          <DialogTitle className="text-xl sm:text-2xl">
            {templateId ? "Modifier le Template" : "Nouveau Template d'Email"}
          </DialogTitle>
          <DialogDescription>
            Créez ou modifiez un template d&apos;email réutilisable avec variables dynamiques
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-4 sm:px-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-6">
              {/* Informations de base */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Informations</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nom du Template *</FormLabel>
                        <FormControl>
                          <Input placeholder="Password Reset" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Slug (identifiant unique) *</FormLabel>
                        <FormControl>
                          <Input placeholder="password-reset" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Lettres minuscules, chiffres et tirets uniquement
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Catégorie</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Sélectionner une catégorie" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="transactional">Transactionnel</SelectItem>
                            <SelectItem value="notification">Notification</SelectItem>
                            <SelectItem value="marketing">Marketing</SelectItem>
                            <SelectItem value="system">Système</SelectItem>
                            <SelectItem value="custom">Personnalisé</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 sm:p-4 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Template actif</FormLabel>
                          <FormDescription className="text-xs">
                            Activer ou désactiver
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Description du template..." {...field} rows={2} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sujet de l&apos;Email *</FormLabel>
                      <FormControl>
                        <Input placeholder="Réinitialisation de votre mot de passe" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Utilisez {"{nom_variable}"} pour les valeurs dynamiques
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="available_variables"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <IconVariable className="h-4 w-4" />
                        Variables Disponibles
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="user_name, reset_link, expiry_hours" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Séparez les variables par des virgules
                      </FormDescription>
                      {variables.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {variables.map((v, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {"{" + v + "}"}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Contenu HTML */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Contenu de l&apos;Email</h3>
                <Tabs defaultValue="editor" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="editor" className="text-sm">
                      <IconCode className="mr-1 h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Éditeur HTML</span>
                      <span className="sm:hidden">Éditeur</span>
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="text-sm">
                      <IconEye className="mr-1 h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Aperçu</span>
                      <span className="sm:hidden">Preview</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="editor" className="mt-4">
                    <FormField
                      control={form.control}
                      name="html_content"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contenu HTML *</FormLabel>
                          <FormControl>
                            <HtmlEditor
                              value={field.value}
                              onChange={handleHtmlChange}
                              height="500px"
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Utilisez {"{nom_variable}"} pour insérer des variables dynamiques
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>

                  <TabsContent value="preview" className="mt-4">
                    <div className="border rounded-lg p-4 min-h-[500px] bg-white overflow-auto">
                      <div className="mb-3 pb-3 border-b">
                        <Badge variant="outline" className="text-xs">Aperçu HTML</Badge>
                        <p className="text-xs text-muted-foreground mt-2">
                          Les variables seront remplacées lors de l&apos;envoi réel
                        </p>
                      </div>
                      <div
                        className="prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Contenu texte */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Version Texte (Fallback)</h3>
                <FormField
                  control={form.control}
                  name="text_content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contenu Texte (optionnel)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Version texte brut de l'email..."
                          rows={6}
                          {...field}
                          className="font-mono text-sm"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Version texte pour les clients email ne supportant pas HTML
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </form>
          </Form>
        </ScrollArea>

        <DialogFooter className="px-4 sm:px-6 py-4 border-t bg-muted/20">
          <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={loading}
              onClick={form.handleSubmit(onSubmit)}
              className="w-full sm:w-auto"
            >
              {loading && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
              {templateId ? "Mettre à jour" : "Créer le template"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
