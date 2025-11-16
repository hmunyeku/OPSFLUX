"use client"

import * as React from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Mail,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Server,
  Eye,
  Edit,
  Trash2,
  Plus,
  Loader2,
  RefreshCw,
  Download,
  Filter,
  Search,
} from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { EmailTemplateEditor } from "./email/email-template-editor"
import {
  EmailApi,
  type EmailTemplate,
  type EmailLog,
  type SmtpSettings,
  type EmailStats,
} from "@/lib/email-api"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"

export function EmailContent() {
  const { toast } = useToast()

  // State
  const [loading, setLoading] = React.useState(true)
  const [templates, setTemplates] = React.useState<EmailTemplate[]>([])
  const [logs, setLogs] = React.useState<EmailLog[]>([])
  const [stats, setStats] = React.useState<EmailStats | null>(null)
  const [smtpSettings, setSmtpSettings] = React.useState<SmtpSettings | null>(null)
  const [testingConnection, setTestingConnection] = React.useState(false)
  const [savingSmtp, setSavingSmtp] = React.useState(false)

  // Editor state
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [selectedTemplate, setSelectedTemplate] = React.useState<EmailTemplate | undefined>()

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [templateToDelete, setTemplateToDelete] = React.useState<EmailTemplate | null>(null)

  // Filters
  const [templateSearch, setTemplateSearch] = React.useState("")
  const [logStatusFilter, setLogStatusFilter] = React.useState<string>("all")

  // Load data
  const loadTemplates = async () => {
    try {
      const response = await EmailApi.getTemplates({ limit: 100 })
      setTemplates(response.data)
    } catch (error) {
      console.error("Error loading templates:", error)
      toast({
        title: "Erreur",
        description: "Impossible de charger les templates",
        variant: "destructive",
      })
    }
  }

  const loadLogs = async () => {
    try {
      const response = await EmailApi.getEmailLogs({ limit: 100 })
      setLogs(response.data)
    } catch (error) {
      console.error("Error loading logs:", error)
      toast({
        title: "Erreur",
        description: "Impossible de charger les logs",
        variant: "destructive",
      })
    }
  }

  const loadStats = async () => {
    try {
      const statsData = await EmailApi.getEmailStats()
      setStats(statsData)
    } catch (error) {
      console.error("Error loading stats:", error)
    }
  }

  const loadSmtpSettings = async () => {
    try {
      const settings = await EmailApi.getSmtpSettings()
      setSmtpSettings(settings)
    } catch (error) {
      console.error("Error loading SMTP settings:", error)
    }
  }

  const loadAllData = async () => {
    setLoading(true)
    await Promise.all([loadTemplates(), loadLogs(), loadStats(), loadSmtpSettings()])
    setLoading(false)
  }

  React.useEffect(() => {
    loadAllData()
  }, [])

  // SMTP handlers
  const handleTestConnection = async () => {
    try {
      setTestingConnection(true)
      const result = await EmailApi.testSmtpConnection()

      if (result.success) {
        toast({
          title: "Connexion réussie",
          description: result.message,
        })
      } else {
        toast({
          title: "Connexion échouée",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error("Error testing connection:", error)
      toast({
        title: "Erreur",
        description: error.message || "Impossible de tester la connexion",
        variant: "destructive",
      })
    } finally {
      setTestingConnection(false)
    }
  }

  const handleSaveSmtpSettings = async () => {
    if (!smtpSettings) return

    try {
      setSavingSmtp(true)
      const updated = await EmailApi.updateSmtpSettings(smtpSettings)
      setSmtpSettings(updated)
      toast({
        title: "Paramètres sauvegardés",
        description: "Les paramètres SMTP ont été mis à jour",
      })
    } catch (error: any) {
      console.error("Error saving SMTP settings:", error)
      toast({
        title: "Erreur",
        description: error.message || "Impossible de sauvegarder les paramètres",
        variant: "destructive",
      })
    } finally {
      setSavingSmtp(false)
    }
  }

  // Template handlers
  const handleCreateTemplate = () => {
    setSelectedTemplate(undefined)
    setEditorOpen(true)
  }

  const handleEditTemplate = (template: EmailTemplate) => {
    setSelectedTemplate(template)
    setEditorOpen(true)
  }

  const handleDeleteTemplate = (template: EmailTemplate) => {
    setTemplateToDelete(template)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!templateToDelete) return

    try {
      await EmailApi.deleteTemplate(templateToDelete.id)
      toast({
        title: "Template supprimé",
        description: "Le template a été supprimé avec succès",
      })
      loadTemplates()
    } catch (error: any) {
      console.error("Error deleting template:", error)
      toast({
        title: "Erreur",
        description: error.message || "Impossible de supprimer le template",
        variant: "destructive",
      })
    } finally {
      setDeleteDialogOpen(false)
      setTemplateToDelete(null)
    }
  }

  // Filter templates
  const filteredTemplates = React.useMemo(() => {
    return templates.filter((t) =>
      t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.code.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.subject.toLowerCase().includes(templateSearch.toLowerCase())
    )
  }, [templates, templateSearch])

  // Filter logs
  const filteredLogs = React.useMemo(() => {
    if (logStatusFilter === "all") return logs
    return logs.filter((log) => log.status === logStatusFilter)
  }, [logs, logStatusFilter])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
          <p className="text-xs text-muted-foreground">Chargement...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {/* Stats Cards */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Card className="p-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
                <Send className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Envoyés Aujourd'hui</p>
                <p className="text-lg font-bold">{stats?.sent_today || 0}</p>
              </div>
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-500/10 p-2 text-green-500">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Taux de Succès</p>
                <p className="text-lg font-bold">{stats?.success_rate.toFixed(1) || 0}%</p>
              </div>
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-500/10 p-2 text-orange-500">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">En Attente</p>
                <p className="text-lg font-bold">{stats?.total_pending || 0}</p>
              </div>
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-500/10 p-2 text-red-500">
                <XCircle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Échecs</p>
                <p className="text-lg font-bold">{stats?.total_failed || 0}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="config" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="config" className="text-xs">
                Configuration SMTP
              </TabsTrigger>
              <TabsTrigger value="templates" className="text-xs">
                Templates ({templates.length})
              </TabsTrigger>
              <TabsTrigger value="logs" className="text-xs">
                Logs ({logs.length})
              </TabsTrigger>
            </TabsList>

            <Button size="sm" variant="outline" onClick={loadAllData} disabled={loading} className="h-8 bg-transparent">
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
          </div>

          {/* SMTP Configuration Tab */}
          <TabsContent value="config" className="space-y-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Configuration SMTP</h3>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Activer SMTP</Label>
                  <Switch
                    checked={smtpSettings?.enabled || false}
                    onCheckedChange={(checked) =>
                      setSmtpSettings((prev) => (prev ? { ...prev, enabled: checked } : null))
                    }
                  />
                </div>
              </div>

              {smtpSettings && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs">Serveur SMTP</Label>
                      <Input
                        value={smtpSettings.host}
                        onChange={(e) => setSmtpSettings({ ...smtpSettings, host: e.target.value })}
                        placeholder="smtp.example.com"
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Port</Label>
                      <Input
                        type="number"
                        value={smtpSettings.port}
                        onChange={(e) => setSmtpSettings({ ...smtpSettings, port: parseInt(e.target.value) })}
                        placeholder="587"
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Nom d'utilisateur</Label>
                      <Input
                        value={smtpSettings.username}
                        onChange={(e) => setSmtpSettings({ ...smtpSettings, username: e.target.value })}
                        placeholder="user@example.com"
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Mot de passe</Label>
                      <Input
                        type="password"
                        value={smtpSettings.password || ""}
                        onChange={(e) => setSmtpSettings({ ...smtpSettings, password: e.target.value })}
                        placeholder="••••••••"
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Email Expéditeur</Label>
                      <Input
                        value={smtpSettings.from_email}
                        onChange={(e) => setSmtpSettings({ ...smtpSettings, from_email: e.target.value })}
                        placeholder="noreply@example.com"
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Nom Expéditeur</Label>
                      <Input
                        value={smtpSettings.from_name}
                        onChange={(e) => setSmtpSettings({ ...smtpSettings, from_name: e.target.value })}
                        placeholder="OpsFlux"
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={smtpSettings.use_tls}
                          onCheckedChange={(checked) => setSmtpSettings({ ...smtpSettings, use_tls: checked })}
                        />
                        <Label className="text-xs">Use TLS</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={smtpSettings.use_ssl}
                          onCheckedChange={(checked) => setSmtpSettings({ ...smtpSettings, use_ssl: checked })}
                        />
                        <Label className="text-xs">Use SSL</Label>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      className="h-9"
                      onClick={handleTestConnection}
                      disabled={testingConnection || !smtpSettings.enabled}
                    >
                      {testingConnection ? (
                        <>
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          Test en cours...
                        </>
                      ) : (
                        <>
                          <Server className="mr-2 h-3.5 w-3.5" />
                          Tester la Connexion
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 bg-transparent"
                      onClick={handleSaveSmtpSettings}
                      disabled={savingSmtp}
                    >
                      {savingSmtp ? (
                        <>
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          Enregistrement...
                        </>
                      ) : (
                        "Enregistrer"
                      )}
                    </Button>
                  </div>
                </>
              )}
            </Card>
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex-1 flex items-center gap-3">
                  <h3 className="text-sm font-semibold">Templates d'Email</h3>
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      placeholder="Rechercher un template..."
                      className="h-8 text-xs pl-8"
                    />
                  </div>
                </div>
                <Button size="sm" className="h-8" onClick={handleCreateTemplate}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Nouveau Template
                </Button>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="h-8 text-[10px]">Code</TableHead>
                      <TableHead className="h-8 text-[10px]">Nom</TableHead>
                      <TableHead className="h-8 text-[10px]">Sujet</TableHead>
                      <TableHead className="h-8 text-[10px]">Catégorie</TableHead>
                      <TableHead className="h-8 text-[10px]">Utilisations</TableHead>
                      <TableHead className="h-8 text-[10px]">Statut</TableHead>
                      <TableHead className="h-8 text-[10px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTemplates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          <p className="text-xs text-muted-foreground">
                            {templateSearch ? "Aucun template trouvé" : "Aucun template d'email"}
                          </p>
                          {!templateSearch && (
                            <Button size="sm" variant="outline" className="mt-2 h-8 bg-transparent" onClick={handleCreateTemplate}>
                              <Plus className="mr-2 h-3.5 w-3.5" />
                              Créer le premier template
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTemplates.map((template) => (
                        <TableRow key={template.id} className="text-xs">
                          <TableCell className="py-2">
                            <code className="text-[10px] bg-muted px-1 rounded">{template.code}</code>
                          </TableCell>
                          <TableCell className="font-medium py-2">{template.name}</TableCell>
                          <TableCell className="py-2 text-muted-foreground max-w-xs truncate">
                            {template.subject}
                          </TableCell>
                          <TableCell className="py-2">
                            {template.category ? (
                              <Badge variant="outline" className="text-[9px]">
                                {template.category}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge variant="secondary" className="text-[9px]">
                              {template.usage_count || 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            {template.is_active ? (
                              <Badge variant="default" className="bg-green-500 text-[9px]">
                                Actif
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px]">
                                Inactif
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2"
                                onClick={() => handleEditTemplate(template)}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleDeleteTemplate(template)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs" className="space-y-4">
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold">Logs d'Envoi</h3>
                  <Select value={logStatusFilter} onValueChange={setLogStatusFilter}>
                    <SelectTrigger className="h-8 w-[150px] text-xs">
                      <Filter className="mr-2 h-3 w-3" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="sent">Envoyés</SelectItem>
                      <SelectItem value="pending">En attente</SelectItem>
                      <SelectItem value="failed">Échecs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  {filteredLogs.length} emails
                </Badge>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="h-8 text-[10px]">Destinataire</TableHead>
                      <TableHead className="h-8 text-[10px]">Sujet</TableHead>
                      <TableHead className="h-8 text-[10px]">Template</TableHead>
                      <TableHead className="h-8 text-[10px]">Statut</TableHead>
                      <TableHead className="h-8 text-[10px]">Date</TableHead>
                      <TableHead className="h-8 text-[10px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <p className="text-xs text-muted-foreground">Aucun log d'email</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLogs.map((log) => (
                        <TableRow key={log.id} className="text-xs">
                          <TableCell className="py-2">{log.to_email}</TableCell>
                          <TableCell className="py-2 text-muted-foreground max-w-xs truncate">{log.subject}</TableCell>
                          <TableCell className="py-2">
                            {log.template_code ? (
                              <code className="text-[9px] bg-muted px-1 rounded">{log.template_code}</code>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            {log.status === "sent" && (
                              <Badge variant="default" className="bg-green-500 text-[9px]">
                                <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                                Envoyé
                              </Badge>
                            )}
                            {log.status === "failed" && (
                              <Badge variant="destructive" className="text-[9px]">
                                <XCircle className="mr-1 h-2.5 w-2.5" />
                                Échec
                              </Badge>
                            )}
                            {log.status === "pending" && (
                              <Badge variant="secondary" className="text-[9px]">
                                <Clock className="mr-1 h-2.5 w-2.5" />
                                En attente
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-muted-foreground">
                            {format(new Date(log.created_at), "dd/MM/yyyy HH:mm")}
                          </TableCell>
                          <TableCell className="py-2">
                            <Button size="sm" variant="ghost" className="h-6 px-2">
                              <Eye className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Template Editor Dialog */}
      <EmailTemplateEditor
        template={selectedTemplate}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={() => {
          loadTemplates()
          loadStats()
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le Template</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le template "{templateToDelete?.name}" ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
