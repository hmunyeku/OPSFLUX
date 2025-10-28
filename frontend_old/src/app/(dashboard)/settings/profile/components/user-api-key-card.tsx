"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { IconCopy, IconKey, IconRefresh, IconTrash, IconAlertTriangle } from "@tabler/icons-react"
import { useTranslation } from "@/hooks/use-translation"
import { useToast } from "@/hooks/use-toast"
import {
  type UserApiKey,
  generateApiKey,
  getCurrentApiKey,
  revokeApiKey,
  regenerateApiKey,
} from "@/api/user-api-key"

export function UserApiKeyCard() {
  const { t } = useTranslation("core.settings")
  const { toast } = useToast()

  const [apiKey, setApiKey] = useState<UserApiKey | null>(null)
  const [loading, setLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

  // Dialog pour afficher la clé complète
  const [showKeyDialog, setShowKeyDialog] = useState(false)
  const [generatedKey, setGeneratedKey] = useState("")

  // Dialogs de confirmation
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false)
  const [showRevokeDialog, setShowRevokeDialog] = useState(false)

  // Charger la clé au montage
  useEffect(() => {
    loadApiKey()
  }, [])

  async function loadApiKey() {
    try {
      setLoading(true)
      const data = await getCurrentApiKey()
      setApiKey(data)
    } catch (error: any) {
      console.error("Error loading API key:", error)
      toast({
        variant: "destructive",
        title: t("message.error"),
        description: error.message || "Failed to load API key",
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    try {
      setIsGenerating(true)
      const data = await generateApiKey("My API Key")
      setGeneratedKey(data.key)
      setShowKeyDialog(true)
      await loadApiKey()
      toast({
        title: t("message.success"),
        description: t("api_key.generated"),
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("message.error"),
        description: error.message || "Failed to generate API key",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleRegenerate() {
    try {
      setIsGenerating(true)
      const data = await regenerateApiKey()
      setGeneratedKey(data.key)
      setShowKeyDialog(true)
      await loadApiKey()
      toast({
        title: t("message.success"),
        description: t("api_key.regenerated"),
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("message.error"),
        description: error.message || "Failed to regenerate API key",
      })
    } finally {
      setIsGenerating(false)
      setShowRegenerateDialog(false)
    }
  }

  async function handleRevoke() {
    try {
      await revokeApiKey()
      setApiKey(null)
      toast({
        title: t("message.success"),
        description: t("api_key.revoked"),
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("message.error"),
        description: error.message || "Failed to revoke API key",
      })
    } finally {
      setShowRevokeDialog(false)
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text)
    toast({
      title: t("message.success"),
      description: t("api_key.copied"),
    })
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString)
    return date.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconKey className="h-5 w-5 text-primary" />
            <CardTitle>{t("api_key.title", "Title")}</CardTitle>
          </div>
          <CardDescription>{t("api_key.description", "Description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("message.loading", "Loading")}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconKey className="h-5 w-5 text-primary" />
            <CardTitle>{t("api_key.title", "Title")}</CardTitle>
          </div>
          <CardDescription>{t("api_key.description", "Description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!apiKey ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("api_key.no_key", "No key")}</p>
              <Button onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? t("message.loading", "Loading") : t("api_key.generate", "Generate")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Affichage du key_prefix */}
              <div className="flex items-center gap-2">
                <Input value={apiKey.key_prefix} readOnly className="font-mono" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy(apiKey.key_prefix)}
                  title={t("api_key.copy", "Copy")}
                >
                  <IconCopy className="h-4 w-4" />
                </Button>
              </div>

              {/* Statut */}
              <div className="flex items-center gap-2">
                <Badge variant={apiKey.is_active ? "default" : "secondary"}>
                  {apiKey.is_active ? "Active" : "Révoquée"}
                </Badge>
              </div>

              {/* Informations */}
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>{t("api_key.created_at", "Created at")} :</span>
                  <span className="font-medium">{formatDate(apiKey.created_at)}</span>
                </div>
                {apiKey.last_used_at ? (
                  <div className="flex justify-between">
                    <span>{t("api_key.last_used", "Last used")} :</span>
                    <span className="font-medium">{formatDate(apiKey.last_used_at)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span>{t("api_key.last_used", "Last used")} :</span>
                    <span className="font-medium text-muted-foreground">{t("api_key.never_used", "Never used")}</span>
                  </div>
                )}
              </div>

              {/* Instructions d'utilisation */}
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <p className="text-sm font-medium">{t("api_key.usage_instructions", "Usage instructions")}</p>
                <code className="block text-xs bg-background p-2 rounded border">
                  X-API-Key: {apiKey.key_prefix}
                </code>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowRegenerateDialog(true)}
                  disabled={isGenerating}
                >
                  <IconRefresh className="h-4 w-4 mr-2" />
                  {t("api_key.regenerate", "Regenerate")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowRevokeDialog(true)}
                >
                  <IconTrash className="h-4 w-4 mr-2" />
                  {t("api_key.revoke", "Revoke")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog pour afficher la clé complète */}
      <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t("api_key.title", "Title")}</DialogTitle>
            <DialogDescription className="space-y-2">
              <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
                <IconAlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">{t("api_key.warning_title", "Warning title")}</p>
                  <p>{t("api_key.warning_message", "Warning message")}</p>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                value={generatedKey}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleCopy(generatedKey)}
              >
                <IconCopy className="h-4 w-4" />
              </Button>
            </div>
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <p className="text-sm font-medium">{t("api_key.usage_instructions", "Usage instructions")}</p>
              <code className="block text-xs bg-background p-2 rounded border">
                X-API-Key: {generatedKey}
              </code>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowKeyDialog(false)}>
              {t("button.close", "Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmation pour régénération */}
      <AlertDialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("api_key.regenerate", "Regenerate")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("api_key.confirm_regenerate", "Confirm regenerate")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("button.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerate} disabled={isGenerating}>
              {isGenerating ? t("message.loading", "Loading") : t("button.confirm", "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmation pour révocation */}
      <AlertDialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("api_key.revoke", "Revoke")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("api_key.confirm_revoke", "Confirm revoke")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("button.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("button.confirm", "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
