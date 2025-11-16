"use client"

import * as React from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Webhook, Plus, Edit, Trash2, Play, CheckCircle2, XCircle, Clock, Loader2, AlertCircle } from "lucide-react"
import { HooksApi, type Hook, type HookCreate, type HookAction } from "@/lib/hooks-api"
import { useToast } from "@/hooks/use-toast"
import { PermissionGuard } from "@/components/permission-guard"
import { usePermissions } from "@/lib/permissions-context"

export function SettingsHooksContent() {
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const [hooks, setHooks] = React.useState<Hook[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showDialog, setShowDialog] = React.useState(false)
  const [editingHook, setEditingHook] = React.useState<Hook | null>(null)
  const [testingHookId, setTestingHookId] = React.useState<string | null>(null)

  // Form state
  const [formData, setFormData] = React.useState<HookCreate>({
    name: "",
    event: "",
    is_active: true,
    priority: 0,
    description: "",
    actions: [],
  })

  React.useEffect(() => {
    fetchHooks()
  }, [])

  const fetchHooks = async () => {
    try {
      setLoading(true)
      const response = await HooksApi.getHooks({ limit: 100 })
      setHooks(response.data)
    } catch (error) {
      console.error("Error fetching hooks:", error)
      toast({
        title: "Erreur",
        description: "Impossible de charger les hooks",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingHook(null)
    setFormData({
      name: "",
      event: "",
      is_active: true,
      priority: 0,
      description: "",
      actions: [{ type: "webhook", config: { url: "", method: "POST" } }],
    })
    setShowDialog(true)
  }

  const handleEdit = (hook: Hook) => {
    setEditingHook(hook)
    setFormData({
      name: hook.name,
      event: hook.event,
      is_active: hook.is_active,
      priority: hook.priority,
      description: hook.description,
      actions: hook.actions,
    })
    setShowDialog(true)
  }

  const handleSave = async () => {
    try {
      if (editingHook) {
        await HooksApi.updateHook(editingHook.id, formData)
        toast({
          title: "Succès",
          description: "Hook mis à jour avec succès",
        })
      } else {
        await HooksApi.createHook(formData)
        toast({
          title: "Succès",
          description: "Hook créé avec succès",
        })
      }
      setShowDialog(false)
      fetchHooks()
    } catch (error) {
      console.error("Error saving hook:", error)
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder le hook",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async (hookId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce hook ?")) {
      return
    }

    try {
      await HooksApi.deleteHook(hookId)
      toast({
        title: "Succès",
        description: "Hook supprimé avec succès",
      })
      fetchHooks()
    } catch (error) {
      console.error("Error deleting hook:", error)
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le hook",
        variant: "destructive",
      })
    }
  }

  const handleToggleActive = async (hook: Hook) => {
    try {
      await HooksApi.updateHook(hook.id, { is_active: !hook.is_active })
      toast({
        title: "Succès",
        description: hook.is_active ? "Hook désactivé" : "Hook activé",
      })
      fetchHooks()
    } catch (error) {
      console.error("Error toggling hook:", error)
      toast({
        title: "Erreur",
        description: "Impossible de changer le statut du hook",
        variant: "destructive",
      })
    }
  }

  const handleTest = async (hookId: string) => {
    try {
      setTestingHookId(hookId)
      await HooksApi.testHook(hookId, { test: true })
      toast({
        title: "Succès",
        description: "Hook testé avec succès",
      })
    } catch (error) {
      console.error("Error testing hook:", error)
      toast({
        title: "Erreur",
        description: "Échec du test du hook",
        variant: "destructive",
      })
    } finally {
      setTestingHookId(null)
    }
  }

  const stats = {
    total: hooks.length,
    active: hooks.filter((h) => h.is_active).length,
    inactive: hooks.filter((h) => !h.is_active).length,
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-3">
        <div className="text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Chargement des hooks...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold leading-none">Hooks & Triggers</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Configurer les webhooks et automatisations</p>
        </div>
        <PermissionGuard resource="core.hooks" action="create">
          <Button size="sm" className="h-8 text-xs" onClick={handleCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Créer un Hook
          </Button>
        </PermissionGuard>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-2 md:grid-cols-3">
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10">
              <Webhook className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Total Hooks</p>
              <p className="text-base font-bold leading-none mt-0.5">{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-green-500/10">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Actifs</p>
              <p className="text-base font-bold leading-none mt-0.5">{stats.active}</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-500/10">
              <XCircle className="h-3.5 w-3.5 text-gray-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Inactifs</p>
              <p className="text-base font-bold leading-none mt-0.5">{stats.inactive}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Hooks Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Nom</TableHead>
              <TableHead className="text-xs">Événement</TableHead>
              <TableHead className="text-xs">Priorité</TableHead>
              <TableHead className="text-xs">Actions</TableHead>
              <TableHead className="text-xs">Statut</TableHead>
              <TableHead className="text-xs w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hooks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Aucun hook configuré</p>
                    <p className="text-xs text-muted-foreground">Créez votre premier hook pour automatiser vos workflows</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              hooks.map((hook) => (
                <TableRow key={hook.id}>
                  <TableCell className="font-medium text-xs">{hook.name}</TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{hook.event}</code>
                  </TableCell>
                  <TableCell className="text-xs">{hook.priority}</TableCell>
                  <TableCell className="text-xs">
                    {hook.actions.length} action{hook.actions.length > 1 ? "s" : ""}
                  </TableCell>
                  <TableCell>
                    {hook.is_active ? (
                      <Badge variant="default" className="gap-1 h-5 text-[9px]">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Actif
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 h-5 text-[9px]">
                        <XCircle className="h-2.5 w-2.5" />
                        Inactif
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {hasPermission("core.hooks", "update") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 bg-transparent"
                          onClick={() => handleToggleActive(hook)}
                          title={hook.is_active ? "Désactiver" : "Activer"}
                        >
                          {hook.is_active ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                        </Button>
                      )}
                      {hasPermission("core.hooks", "test") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 bg-transparent"
                          onClick={() => handleTest(hook.id)}
                          disabled={testingHookId === hook.id}
                          title="Tester"
                        >
                          {testingHookId === hook.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                      {hasPermission("core.hooks", "update") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 bg-transparent"
                          onClick={() => handleEdit(hook)}
                          title="Modifier"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                      )}
                      {hasPermission("core.hooks", "delete") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0 bg-transparent"
                          onClick={() => handleDelete(hook.id)}
                          title="Supprimer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingHook ? "Modifier le Hook" : "Créer un Hook"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configurez un hook pour automatiser des actions sur des événements
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs">
                  Nom *
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nom du hook"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event" className="text-xs">
                  Événement *
                </Label>
                <Input
                  id="event"
                  value={formData.event}
                  onChange={(e) => setFormData({ ...formData, event: e.target.value })}
                  placeholder="ex: user.created"
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs">
                Description
              </Label>
              <Textarea
                id="description"
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description du hook"
                rows={2}
                className="resize-none text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="priority" className="text-xs">
                  Priorité
                </Label>
                <Input
                  id="priority"
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex items-center space-x-2 pt-6">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active" className="text-xs">
                  Actif
                </Label>
              </div>
            </div>
            {formData.actions.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Action Webhook</Label>
                <Input
                  value={(formData.actions[0]?.config as any)?.url || ""}
                  onChange={(e) => {
                    const newActions = [...formData.actions]
                    newActions[0] = {
                      ...newActions[0],
                      config: { ...(newActions[0].config as any), url: e.target.value },
                    }
                    setFormData({ ...formData, actions: newActions })
                  }}
                  placeholder="https://api.example.com/webhook"
                  className="h-8 text-xs"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowDialog(false)} className="h-8 text-xs">
              Annuler
            </Button>
            <Button size="sm" onClick={handleSave} className="h-8 text-xs">
              {editingHook ? "Mettre à jour" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
