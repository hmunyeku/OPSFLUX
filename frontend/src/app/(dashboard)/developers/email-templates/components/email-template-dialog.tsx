"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
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
import { useToast } from "@/hooks/use-toast"
import { apiClient } from "@/lib/api-client"
import { IconCode, IconEye, IconLoader2 } from "@tabler/icons-react"

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
  }, [open, templateId])

  const fetchTemplate = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get(`/api/v1/email-templates/${templateId}`)
      const data = response.data
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
    } catch (error) {
      console.error("Error fetching template:", error)
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

      // Convert available_variables string to array
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
    } catch (error: any) {
      console.error("Error saving template:", error)
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de sauvegarder le template",
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {templateId ? "Modifier le Template" : "Nouveau Template d'Email"}
          </DialogTitle>
          <DialogDescription>
            Créez ou modifiez un template d&apos;email réutilisable avec variables dynamiques
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom du Template</FormLabel>
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
                    <FormLabel>Slug (identifiant unique)</FormLabel>
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Catégorie</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Template actif</FormLabel>
                      <FormDescription className="text-xs">
                        Activer ou désactiver ce template
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
                  <FormLabel>Sujet de l&apos;Email</FormLabel>
                  <FormControl>
                    <Input placeholder="Réinitialisation de votre mot de passe" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Utilisez des variables entre accolades: {"{user_name}"}, {"{reset_link}"}
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
                  <FormLabel>Variables Disponibles</FormLabel>
                  <FormControl>
                    <Input placeholder="user_name, reset_link, expiry_hours" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Séparez les variables par des virgules
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Tabs defaultValue="editor" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="editor">
                  <IconCode className="mr-2 h-4 w-4" />
                  Éditeur HTML
                </TabsTrigger>
                <TabsTrigger value="preview">
                  <IconEye className="mr-2 h-4 w-4" />
                  Aperçu
                </TabsTrigger>
              </TabsList>

              <TabsContent value="editor" className="space-y-2">
                <FormField
                  control={form.control}
                  name="html_content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contenu HTML</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="<html><body>...</body></html>"
                          className="font-mono text-xs"
                          rows={15}
                          {...field}
                          onChange={(e) => handleHtmlChange(e.target.value)}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Utilisez des variables entre accolades: {"{user_name}"}, {"{reset_link}"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="preview">
                <div className="border rounded-lg p-4 min-h-[400px] bg-white">
                  <div className="mb-2 pb-2 border-b">
                    <Badge variant="outline">Aperçu HTML</Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      Les variables seront remplacées lors de l&apos;envoi
                    </p>
                  </div>
                  <div
                    className="prose max-w-none"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <FormField
              control={form.control}
              name="text_content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contenu Texte (optionnel, fallback)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Version texte brut de l'email..."
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Version texte pour les clients email ne supportant pas HTML
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                {templateId ? "Mettre à jour" : "Créer"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
