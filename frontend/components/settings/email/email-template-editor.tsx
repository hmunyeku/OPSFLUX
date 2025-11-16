"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Code, Eye, Save, X, Send, Sparkles, Loader2 } from "lucide-react"
import { EmailApi, type EmailTemplate, type EmailTemplateCreate, type EmailTemplateUpdate } from "@/lib/email-api"
import { useToast } from "@/hooks/use-toast"

interface EmailTemplateEditorProps {
  template?: EmailTemplate
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

const AVAILABLE_VARIABLES = [
  { key: "user_name", label: "Nom de l'utilisateur", example: "John Doe" },
  { key: "user_email", label: "Email de l'utilisateur", example: "john@example.com" },
  { key: "user_first_name", label: "Prénom", example: "John" },
  { key: "user_last_name", label: "Nom de famille", example: "Doe" },
  { key: "company_name", label: "Nom de l'entreprise", example: "OpsFlux" },
  { key: "reset_link", label: "Lien de réinitialisation", example: "https://app.opsflux.io/reset/abc123" },
  { key: "confirmation_link", label: "Lien de confirmation", example: "https://app.opsflux.io/confirm/abc123" },
  { key: "task_title", label: "Titre de la tâche", example: "Compléter le rapport" },
  { key: "task_description", label: "Description de la tâche", example: "Finaliser le rapport trimestriel" },
  { key: "project_name", label: "Nom du projet", example: "Migration Cloud" },
  { key: "due_date", label: "Date d'échéance", example: "31/12/2025" },
  { key: "notification_message", label: "Message de notification", example: "Vous avez une nouvelle notification" },
  { key: "current_year", label: "Année actuelle", example: "2025" },
  { key: "current_date", label: "Date actuelle", example: "29/01/2025" },
  { key: "support_email", label: "Email support", example: "support@opsflux.io" },
]

export function EmailTemplateEditor({ template, open, onOpenChange, onSaved }: EmailTemplateEditorProps) {
  const { toast } = useToast()
  const [loading, setLoading] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [previewMode, setPreviewMode] = React.useState<"desktop" | "mobile">("desktop")
  const [testEmail, setTestEmail] = React.useState("")

  // Form state
  const [code, setCode] = React.useState(template?.code || "")
  const [name, setName] = React.useState(template?.name || "")
  const [subject, setSubject] = React.useState(template?.subject || "")
  const [bodyHtml, setBodyHtml] = React.useState(template?.body_html || "")
  const [bodyText, setBodyText] = React.useState(template?.body_text || "")
  const [category, setCategory] = React.useState(template?.category || "")
  const [variables, setVariables] = React.useState<Record<string, string>>({})

  // Generate preview HTML with variables replaced
  const previewHtml = React.useMemo(() => {
    let html = bodyHtml
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g")
      html = html.replace(regex, value || `{{${key}}}`)
    })
    return html
  }, [bodyHtml, variables])

  // Generate preview subject with variables replaced
  const previewSubject = React.useMemo(() => {
    let subj = subject
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g")
      subj = subj.replace(regex, value || `{{${key}}}`)
    })
    return subj
  }, [subject, variables])

  // Initialize with example values for preview
  React.useEffect(() => {
    if (open) {
      const exampleVars: Record<string, string> = {}
      AVAILABLE_VARIABLES.forEach((v) => {
        exampleVars[v.key] = v.example
      })
      setVariables(exampleVars)
    }
  }, [open])

  const insertVariable = (varKey: string) => {
    const variable = `{{${varKey}}}`
    setBodyHtml((prev) => prev + variable)
  }

  const handleSave = async () => {
    try {
      setLoading(true)

      const data: EmailTemplateCreate | EmailTemplateUpdate = {
        name,
        subject,
        body_html: bodyHtml,
        body_text: bodyText,
        category: category || undefined,
        variables: AVAILABLE_VARIABLES.map((v) => v.key),
        is_active: true,
      }

      if (template) {
        // Update existing template
        await EmailApi.updateTemplate(template.id, data)
        toast({
          title: "Template mis à jour",
          description: "Le template d'email a été mis à jour avec succès",
        })
      } else {
        // Create new template
        await EmailApi.createTemplate({ ...data, code })
        toast({
          title: "Template créé",
          description: "Le template d'email a été créé avec succès",
        })
      }

      onSaved?.()
      onOpenChange(false)
    } catch (error: any) {
      console.error("Error saving template:", error)
      toast({
        title: "Erreur",
        description: error.message || "Impossible de sauvegarder le template",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleTest = async () => {
    if (!testEmail) {
      toast({
        title: "Email requis",
        description: "Veuillez entrer une adresse email pour le test",
        variant: "destructive",
      })
      return
    }

    if (!template?.id) {
      toast({
        title: "Template non sauvegardé",
        description: "Veuillez d'abord sauvegarder le template avant de l'envoyer",
        variant: "destructive",
      })
      return
    }

    try {
      setTesting(true)
      await EmailApi.sendTestEmail({
        template_id: template.id,
        to_email: testEmail,
        variables,
      })

      toast({
        title: "Email de test envoyé",
        description: `Un email de test a été envoyé à ${testEmail}`,
      })
      setTestEmail("")
    } catch (error: any) {
      console.error("Error sending test email:", error)
      toast({
        title: "Erreur",
        description: error.message || "Impossible d'envoyer l'email de test",
        variant: "destructive",
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-lg">
            {template ? "Modifier le Template" : "Nouveau Template d'Email"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Créez et personnalisez vos templates d'emails avec des variables dynamiques
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="edit" className="h-full flex flex-col">
            <div className="px-6 py-2 border-b">
              <TabsList className="grid w-full max-w-md grid-cols-3">
                <TabsTrigger value="edit" className="text-xs">
                  <Code className="mr-2 h-3 w-3" />
                  Éditer
                </TabsTrigger>
                <TabsTrigger value="preview" className="text-xs">
                  <Eye className="mr-2 h-3 w-3" />
                  Aperçu
                </TabsTrigger>
                <TabsTrigger value="test" className="text-xs">
                  <Send className="mr-2 h-3 w-3" />
                  Tester
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-hidden">
              <TabsContent value="edit" className="h-full m-0 data-[state=active]:flex">
                <div className="flex-1 grid grid-cols-[1fr_300px] gap-0 overflow-hidden">
                  {/* Editor */}
                  <ScrollArea className="h-full border-r">
                    <div className="p-6 space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs">Code Unique *</Label>
                          <Input
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="welcome_email"
                            className="h-9 text-xs"
                            disabled={!!template}
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Identifiant unique (non modifiable après création)
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Nom du Template *</Label>
                          <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Bienvenue Utilisateur"
                            className="h-9 text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Sujet de l'Email *</Label>
                        <Input
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          placeholder="Bienvenue sur {{company_name}}"
                          className="h-9 text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Utilisez les variables entre accolades: {"{{variable}}"}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Catégorie</Label>
                        <Input
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          placeholder="Authentication, Notifications, etc."
                          className="h-9 text-xs"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Corps HTML *</Label>
                        <Textarea
                          value={bodyHtml}
                          onChange={(e) => setBodyHtml(e.target.value)}
                          placeholder="<h1>Bonjour {{user_name}}</h1>..."
                          className="min-h-[300px] font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Corps Texte (Optionnel)</Label>
                        <Textarea
                          value={bodyText}
                          onChange={(e) => setBodyText(e.target.value)}
                          placeholder="Bonjour {{user_name}}..."
                          className="min-h-[150px] text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Version texte pour les clients email ne supportant pas HTML
                        </p>
                      </div>
                    </div>
                  </ScrollArea>

                  {/* Variables Sidebar */}
                  <ScrollArea className="h-full bg-muted/30">
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold">Variables Disponibles</h3>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Cliquez pour insérer dans le template
                      </p>
                      <div className="space-y-2">
                        {AVAILABLE_VARIABLES.map((variable) => (
                          <div
                            key={variable.key}
                            className="p-2 rounded-md border bg-background hover:bg-accent cursor-pointer transition-colors"
                            onClick={() => insertVariable(variable.key)}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <code className="text-[10px] font-mono text-primary">{`{{${variable.key}}}`}</code>
                            </div>
                            <p className="text-[10px] text-muted-foreground">{variable.label}</p>
                            <p className="text-[9px] text-muted-foreground mt-1 opacity-60">Ex: {variable.example}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="h-full m-0 data-[state=active]:flex flex-col">
                <div className="p-4 border-b bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium">Aperçu de l'Email</p>
                      <p className="text-[10px] text-muted-foreground">Avec les valeurs d'exemple</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant={previewMode === "desktop" ? "default" : "outline"}
                        size="sm"
                        className="h-8 text-xs bg-transparent"
                        onClick={() => setPreviewMode("desktop")}
                      >
                        Desktop
                      </Button>
                      <Button
                        variant={previewMode === "mobile" ? "default" : "outline"}
                        size="sm"
                        className="h-8 text-xs bg-transparent"
                        onClick={() => setPreviewMode("mobile")}
                      >
                        Mobile
                      </Button>
                    </div>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-6">
                    <div
                      className={`mx-auto bg-white shadow-lg rounded-lg overflow-hidden ${
                        previewMode === "mobile" ? "max-w-sm" : "max-w-2xl"
                      }`}
                    >
                      {/* Email Header */}
                      <div className="bg-gray-100 p-4 border-b">
                        <p className="text-xs text-gray-600 mb-1">Sujet:</p>
                        <p className="text-sm font-semibold text-gray-900">{previewSubject || "(Sujet non défini)"}</p>
                      </div>
                      {/* Email Body */}
                      <div
                        className="p-6 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: previewHtml || "<p>(Contenu vide)</p>" }}
                      />
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="test" className="h-full m-0 data-[state=active]:flex flex-col">
                <ScrollArea className="flex-1">
                  <div className="p-6 max-w-2xl mx-auto space-y-4">
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <h3 className="text-sm font-semibold mb-2">Envoyer un Email de Test</h3>
                      <p className="text-xs text-muted-foreground mb-4">
                        Testez votre template en envoyant un email de test à votre adresse
                      </p>

                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Email de Test</Label>
                          <Input
                            type="email"
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                            placeholder="votre.email@example.com"
                            className="h-9 text-xs"
                          />
                        </div>

                        <Button onClick={handleTest} disabled={testing || !template} className="w-full h-9 text-xs">
                          {testing ? (
                            <>
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                              Envoi en cours...
                            </>
                          ) : (
                            <>
                              <Send className="mr-2 h-3.5 w-3.5" />
                              Envoyer l'Email de Test
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-lg border bg-muted/30 p-4">
                      <h3 className="text-sm font-semibold mb-2">Variables de Test</h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        Personnalisez les valeurs pour le test (optionnel)
                      </p>

                      <div className="space-y-2">
                        {AVAILABLE_VARIABLES.slice(0, 5).map((variable) => (
                          <div key={variable.key} className="grid grid-cols-2 gap-2 items-center">
                            <Label className="text-[10px]">{variable.label}</Label>
                            <Input
                              value={variables[variable.key] || ""}
                              onChange={(e) =>
                                setVariables((prev) => ({ ...prev, [variable.key]: e.target.value }))
                              }
                              placeholder={variable.example}
                              className="h-8 text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="h-9 bg-transparent">
            <X className="mr-2 h-3.5 w-3.5" />
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={loading || !code || !name || !subject || !bodyHtml} className="h-9">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <Save className="mr-2 h-3.5 w-3.5" />
                Enregistrer
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
