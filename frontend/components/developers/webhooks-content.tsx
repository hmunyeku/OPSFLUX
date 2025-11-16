"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Plus,
  Search,
  Play,
  Pause,
  Trash2,
  ExternalLink,
  Copy,
  Settings,
  Send,
  Eye,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
} from "lucide-react"
import { mockWebhooks } from "@/lib/developers-data"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"

const mockDeliveries = [
  {
    id: "1",
    webhookId: "1",
    webhookName: "Project Updates Webhook",
    timestamp: "2025-01-29T14:30:15",
    event: "project.created",
    status: "success",
    statusCode: 200,
    duration: 234,
    attempts: 1,
    requestPayload: { event: "project.created", data: { id: "proj_123", name: "New Project" } },
    responsePayload: { success: true, message: "Webhook received" },
  },
  {
    id: "2",
    webhookId: "1",
    timestamp: "2025-01-29T14:15:30",
    event: "project.updated",
    status: "success",
    statusCode: 200,
    duration: 189,
    attempts: 1,
    requestPayload: { event: "project.updated", data: { id: "proj_456", name: "Updated Project" } },
    responsePayload: { success: true },
  },
  {
    id: "3",
    webhookId: "4",
    webhookName: "Failed Webhook",
    timestamp: "2025-01-29T14:10:00",
    event: "document.created",
    status: "failed",
    statusCode: 500,
    duration: 5000,
    attempts: 3,
    requestPayload: { event: "document.created", data: { id: "doc_789" } },
    responsePayload: { error: "Internal server error" },
    errorMessage: "Connection timeout after 5000ms",
  },
  {
    id: "4",
    webhookId: "2",
    webhookName: "Task Notifications",
    timestamp: "2025-01-29T14:05:45",
    event: "task.completed",
    status: "success",
    statusCode: 201,
    duration: 145,
    attempts: 1,
    requestPayload: { event: "task.completed", data: { id: "task_321", title: "Complete documentation" } },
    responsePayload: { success: true, id: "notif_123" },
  },
  {
    id: "5",
    webhookId: "3",
    webhookName: "User Activity Tracker",
    timestamp: "2025-01-29T14:00:20",
    event: "user.login",
    status: "success",
    statusCode: 200,
    duration: 98,
    attempts: 1,
    requestPayload: { event: "user.login", data: { userId: "user_123", timestamp: "2025-01-29T14:00:20" } },
    responsePayload: { success: true },
  },
]

const eventCategories = {
  Projects: ["project.created", "project.updated", "project.deleted", "project.archived"],
  Tasks: ["task.created", "task.updated", "task.completed", "task.assigned", "task.deleted"],
  Users: ["user.created", "user.updated", "user.deleted", "user.login", "user.logout"],
  Documents: ["document.created", "document.updated", "document.deleted", "document.shared"],
  System: ["system.backup", "system.error", "system.maintenance"],
}

export function WebhooksContent() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedWebhook, setSelectedWebhook] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [selectedDelivery, setSelectedDelivery] = useState<any>(null)
  const [activeTab, setActiveTab] = useState("webhooks")

  const [webhookForm, setWebhookForm] = useState({
    name: "",
    url: "",
    method: "POST",
    events: [] as string[],
    secret: "",
    retryAttempts: 3,
    timeout: 30,
    active: true,
    headers: [{ key: "", value: "" }],
  })

  const filteredWebhooks = mockWebhooks.filter(
    (webhook) =>
      webhook.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      webhook.url.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const filteredDeliveries = selectedWebhook
    ? mockDeliveries.filter((d) => d.webhookId === selectedWebhook)
    : mockDeliveries

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
      case "success":
        return "bg-green-500/10 text-green-500"
      case "inactive":
        return "bg-gray-500/10 text-gray-500"
      case "failed":
        return "bg-red-500/10 text-red-500"
      default:
        return "bg-gray-500/10 text-gray-500"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-500" />
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-sm text-muted-foreground">Gérez vos webhooks et surveillez les livraisons</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nouveau Webhook
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Créer un nouveau webhook</DialogTitle>
                <DialogDescription>Configurez un endpoint pour recevoir des événements en temps réel</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom du webhook</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Project Updates Webhook"
                    value={webhookForm.name}
                    onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div className="col-span-1 space-y-2">
                    <Label htmlFor="method">Méthode</Label>
                    <Select
                      value={webhookForm.method}
                      onValueChange={(value) => setWebhookForm({ ...webhookForm, method: value })}
                    >
                      <SelectTrigger id="method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="PATCH">PATCH</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 space-y-2">
                    <Label htmlFor="url">URL de destination</Label>
                    <Input
                      id="url"
                      placeholder="https://api.example.com/webhooks"
                      value={webhookForm.url}
                      onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Événements à surveiller</Label>
                  <div className="border rounded-lg p-3 space-y-3 max-h-48 overflow-y-auto">
                    {Object.entries(eventCategories).map(([category, events]) => (
                      <div key={category} className="space-y-2">
                        <div className="font-medium text-sm">{category}</div>
                        <div className="grid grid-cols-2 gap-2 pl-4">
                          {events.map((event) => (
                            <div key={event} className="flex items-center space-x-2">
                              <Checkbox
                                id={event}
                                checked={webhookForm.events.includes(event)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setWebhookForm({ ...webhookForm, events: [...webhookForm.events, event] })
                                  } else {
                                    setWebhookForm({
                                      ...webhookForm,
                                      events: webhookForm.events.filter((e) => e !== event),
                                    })
                                  }
                                }}
                              />
                              <Label htmlFor={event} className="text-sm font-normal cursor-pointer">
                                {event}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {webhookForm.events.length} événement(s) sélectionné(s)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="secret">Secret de signature (optionnel)</Label>
                  <Input
                    id="secret"
                    placeholder="whsec_..."
                    value={webhookForm.secret}
                    onChange={(e) => setWebhookForm({ ...webhookForm, secret: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Utilisé pour signer les requêtes et vérifier leur authenticité
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="retryAttempts">Tentatives de réessai</Label>
                    <Select
                      value={webhookForm.retryAttempts.toString()}
                      onValueChange={(value) =>
                        setWebhookForm({ ...webhookForm, retryAttempts: Number.parseInt(value) })
                      }
                    >
                      <SelectTrigger id="retryAttempts">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Aucune</SelectItem>
                        <SelectItem value="1">1 tentative</SelectItem>
                        <SelectItem value="3">3 tentatives</SelectItem>
                        <SelectItem value="5">5 tentatives</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timeout">Timeout (secondes)</Label>
                    <Select
                      value={webhookForm.timeout.toString()}
                      onValueChange={(value) => setWebhookForm({ ...webhookForm, timeout: Number.parseInt(value) })}
                    >
                      <SelectTrigger id="timeout">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10s</SelectItem>
                        <SelectItem value="30">30s</SelectItem>
                        <SelectItem value="60">60s</SelectItem>
                        <SelectItem value="120">120s</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>En-têtes personnalisés (optionnel)</Label>
                  {webhookForm.headers.map((header, index) => (
                    <div key={index} className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Clé"
                        value={header.key}
                        onChange={(e) => {
                          const newHeaders = [...webhookForm.headers]
                          newHeaders[index].key = e.target.value
                          setWebhookForm({ ...webhookForm, headers: newHeaders })
                        }}
                      />
                      <Input
                        placeholder="Valeur"
                        value={header.value}
                        onChange={(e) => {
                          const newHeaders = [...webhookForm.headers]
                          newHeaders[index].value = e.target.value
                          setWebhookForm({ ...webhookForm, headers: newHeaders })
                        }}
                      />
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setWebhookForm({ ...webhookForm, headers: [...webhookForm.headers, { key: "", value: "" }] })
                    }
                  >
                    <Plus className="h-3 w-3 mr-2" />
                    Ajouter un en-tête
                  </Button>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="active">Activer le webhook</Label>
                    <p className="text-xs text-muted-foreground">
                      Le webhook commencera à recevoir des événements immédiatement
                    </p>
                  </div>
                  <Switch
                    id="active"
                    checked={webhookForm.active}
                    onCheckedChange={(checked) => setWebhookForm({ ...webhookForm, active: checked })}
                  />
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" size="sm">
                  <Send className="h-3 w-3 mr-2" />
                  Tester le webhook
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Annuler
                  </Button>
                  <Button onClick={() => setShowCreateDialog(false)}>Créer le webhook</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardDescription className="text-xs">Webhooks actifs</CardDescription>
            <CardTitle className="text-xl">{mockWebhooks.filter((w) => w.status === "active").length}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-xs text-muted-foreground">sur {mockWebhooks.length} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardDescription className="text-xs">Livraisons aujourd'hui</CardDescription>
            <CardTitle className="text-xl">{mockDeliveries.length}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-xs text-green-500">+12% vs hier</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardDescription className="text-xs">Taux de succès</CardDescription>
            <CardTitle className="text-xl">96.8%</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-xs text-muted-foreground">
              {mockDeliveries.filter((d) => d.status === "success").length} / {mockDeliveries.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardDescription className="text-xs">Temps de réponse moy.</CardDescription>
            <CardTitle className="text-xl">187ms</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-xs text-green-500">-23ms vs hier</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="webhooks">Webhooks ({filteredWebhooks.length})</TabsTrigger>
          <TabsTrigger value="deliveries">Historique des livraisons ({mockDeliveries.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="webhooks" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Webhooks configurés</CardTitle>
                  <CardDescription>Gérez vos endpoints et surveillez leur statut</CardDescription>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Événements</TableHead>
                    <TableHead>Statistiques</TableHead>
                    <TableHead>Dernier déclenchement</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWebhooks.map((webhook) => (
                    <TableRow key={webhook.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">{webhook.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded truncate max-w-[200px]">
                            {webhook.url}
                          </code>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {webhook.events.slice(0, 2).map((event) => (
                            <Badge key={event} variant="secondary" className="text-xs">
                              {event}
                            </Badge>
                          ))}
                          {webhook.events.length > 2 && (
                            <Badge variant="secondary" className="text-xs">
                              +{webhook.events.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Succès:</span>
                            <span className="font-medium">{webhook.successRate.toFixed(1)}%</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{webhook.totalCalls} appels</span>
                            <span>•</span>
                            <span className="text-red-500">{webhook.failedCalls} échecs</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {webhook.lastTriggered
                          ? new Date(webhook.lastTriggered).toLocaleString("fr-FR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Jamais"}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(webhook.status)}>{webhook.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              setSelectedWebhook(webhook.id)
                              setActiveTab("deliveries")
                            }}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <Settings className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            {webhook.status === "active" ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deliveries" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Historique des livraisons</CardTitle>
                  <CardDescription>Consultez les détails de chaque appel webhook</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {selectedWebhook && (
                    <Button variant="outline" size="sm" onClick={() => setSelectedWebhook(null)}>
                      Voir tous les webhooks
                    </Button>
                  )}
                  <Select
                    value={selectedWebhook || "all"}
                    onValueChange={(value) => setSelectedWebhook(value === "all" ? null : value)}
                  >
                    <SelectTrigger className="w-48 h-9">
                      <SelectValue placeholder="Filtrer par webhook" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les webhooks</SelectItem>
                      {mockWebhooks.map((webhook) => (
                        <SelectItem key={webhook.id} value={webhook.id}>
                          {webhook.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Webhook</TableHead>
                    <TableHead>Événement</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Durée</TableHead>
                    <TableHead>Tentatives</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell className="text-sm">
                        {new Date(delivery.timestamp).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{delivery.webhookName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {delivery.event}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(delivery.status)}
                          <Badge className={getStatusColor(delivery.status)}>{delivery.statusCode}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{delivery.duration}ms</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {delivery.attempts > 1 && <RefreshCw className="h-3 w-3 text-orange-500" />}
                          <span className="text-sm">{delivery.attempts}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => setSelectedDelivery(delivery)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Détails
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Détails de la livraison</DialogTitle>
                              <DialogDescription>
                                {delivery.webhookName} • {delivery.event} •{" "}
                                {new Date(delivery.timestamp).toLocaleString("fr-FR")}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Statut</Label>
                                  <div className="flex items-center gap-2">
                                    {getStatusIcon(delivery.status)}
                                    <Badge className={getStatusColor(delivery.status)}>{delivery.statusCode}</Badge>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label>Durée</Label>
                                  <p className="text-sm">{delivery.duration}ms</p>
                                </div>
                                <div className="space-y-2">
                                  <Label>Tentatives</Label>
                                  <p className="text-sm">{delivery.attempts}</p>
                                </div>
                                <div className="space-y-2">
                                  <Label>Timestamp</Label>
                                  <p className="text-sm">{new Date(delivery.timestamp).toLocaleString("fr-FR")}</p>
                                </div>
                              </div>

                              {delivery.errorMessage && (
                                <div className="space-y-2">
                                  <Label className="text-red-500">Message d'erreur</Label>
                                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                    <p className="text-sm text-red-500">{delivery.errorMessage}</p>
                                  </div>
                                </div>
                              )}

                              <div className="space-y-2">
                                <Label>Payload de la requête</Label>
                                <Textarea
                                  value={JSON.stringify(delivery.requestPayload, null, 2)}
                                  readOnly
                                  className="font-mono text-xs h-32"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>Réponse du serveur</Label>
                                <Textarea
                                  value={JSON.stringify(delivery.responsePayload, null, 2)}
                                  readOnly
                                  className="font-mono text-xs h-32"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm">
                                <RefreshCw className="h-3 w-3 mr-2" />
                                Réessayer
                              </Button>
                              <Button variant="outline" size="sm">
                                <Copy className="h-3 w-3 mr-2" />
                                Copier le payload
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
