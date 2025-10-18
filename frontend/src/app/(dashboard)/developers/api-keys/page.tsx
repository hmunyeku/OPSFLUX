"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Terminal, Trash2, Eye, EyeOff } from "lucide-react"
import Link from "next/link"
import { PermissionGuard } from "@/components/permission-guard"
import { useTranslation } from "@/hooks/use-translation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CopyButton } from "@/components/copy-button"
import { CreateApiKeyDialog } from "./components/create-api-key-dialog"
import { getApiKeys, deleteApiKey, toggleApiKeyActive, type ApiKey } from "./api-keys-api"
import { useToast } from "@/hooks/use-toast"
import { Card } from "@/components/ui/card"

export default function ApiKeysPage() {
  const { t } = useTranslation("core.developers")
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [environmentFilter, setEnvironmentFilter] = useState<string>("production")
  const { toast } = useToast()

  const loadApiKeys = async () => {
    setLoading(true)
    try {
      const keys = await getApiKeys()
      setApiKeys(keys)
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de charger les clés API",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadApiKeys()
  }, [])

  const handleDeleteKey = async (id: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette clé API ?")) {
      return
    }

    try {
      await deleteApiKey(id)
      toast({
        title: "Clé supprimée",
        description: "La clé API a été supprimée avec succès",
      })
      await loadApiKeys()
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de supprimer la clé",
        variant: "destructive",
      })
    }
  }

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await toggleApiKeyActive(id, !isActive)
      toast({
        title: isActive ? "Clé désactivée" : "Clé activée",
        description: `La clé API a été ${isActive ? "désactivée" : "activée"} avec succès`,
      })
      await loadApiKeys()
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de modifier la clé",
        variant: "destructive",
      })
    }
  }

  // Filter keys by environment and type
  const secretKeys = apiKeys.filter(
    (key) => key.key_type === "secret" && key.environment === environmentFilter
  )
  const publishableKeys = apiKeys.filter(
    (key) => key.key_type === "publishable" && key.environment === environmentFilter
  )

  return (
    <PermissionGuard permission="api_keys.read">
      <div className="flex w-full flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">{t("breadcrumb.home")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("breadcrumb.developers")}</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("api_keys.title")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:flex-wrap">
          <div>
            <h2 className="text-2xl font-bold">{t("api_keys.title")}</h2>
            <p className="text-muted-foreground text-sm">
              {t("api_keys.description")}
            </p>
          </div>
          <Select value={environmentFilter} onValueChange={setEnvironmentFilter}>
            <SelectTrigger className="w-full sm:w-[200px] gap-2 text-sm">
              <SelectValue placeholder="Environnement" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Environnement</SelectLabel>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="test">Test</SelectItem>
                <SelectItem value="development">Développement</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="api" className="my-8">
        <TabsList className="border-muted flex h-auto w-full items-center justify-start rounded-none border-b bg-transparent p-0!">
          <TabsTrigger
            value="api"
            className="rounded-none border-blue-600 py-1 shadow-none! data-[state=active]:border-b-[2px]"
          >
            {t("api_keys.title")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="api" className="mt-5 w-full max-w-3xl">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{t("api_keys.version")}</h2>
              <div className="flex items-center justify-between">
                <h1 className="text-sm font-semibold">Version globale</h1>
                <div className="flex items-center gap-4">
                  <p className="text-sm font-medium">
                    {format(new Date(), "dd-MMM-yyyy")}
                  </p>
                  <Badge variant="secondary">Dernière version</Badge>
                </div>
              </div>
            </div>
            <Separator />

            {/* Secret API Keys */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{t("api_keys.secret_keys")}</h2>
                <CreateApiKeyDialog
                  keyType="secret"
                  environment={environmentFilter}
                  onKeyCreated={loadApiKeys}
                />
              </div>
              <Alert className="w-full">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Rappel !</AlertTitle>
                <AlertDescription>
                  Les clés API secrètes ne doivent jamais être partagées publiquement.
                  Consultez la{" "}
                  <Link className="underline" href="/">
                    documentation
                  </Link>{" "}
                  pour plus de détails.
                </AlertDescription>
              </Alert>

              {loading ? (
                <div className="text-sm text-muted-foreground">Chargement...</div>
              ) : secretKeys.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  Aucune clé secrète pour l&apos;environnement {environmentFilter}
                </Card>
              ) : (
                <div className="space-y-4">
                  {secretKeys.map((key) => (
                    <div
                      key={key.id}
                      className="flex flex-col gap-3 rounded-lg border p-4"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="font-semibold truncate">{key.name}</h3>
                          <Badge variant={key.is_active ? "default" : "secondary"} className="shrink-0">
                            {key.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 justify-end sm:justify-start">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleToggleActive(key.id, key.is_active)}
                          >
                            {key.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            <span className="sr-only">Toggle</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleDeleteKey(key.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                            <span className="sr-only">Supprimer</span>
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          readOnly
                          value={key.key_preview}
                          className="font-mono text-xs min-w-0"
                        />
                        <CopyButton text={key.key_preview} className="shrink-0" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Créée le {format(new Date(key.created_at), "dd/MM/yyyy à HH:mm")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Separator />

            {/* Publishable API Keys */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{t("api_keys.publishable_keys")}</h2>
                <CreateApiKeyDialog
                  keyType="publishable"
                  environment={environmentFilter}
                  onKeyCreated={loadApiKeys}
                />
              </div>
              <Alert className="w-full">
                <AlertDescription className="flex flex-col items-start gap-3 md:flex-row md:items-center">
                  <Terminal className="h-4 w-4" />
                  <p>
                    Les clés publiques peuvent être utilisées côté client. Consultez la{" "}
                    <Link href="/" className="underline">
                      documentation
                    </Link>{" "}
                    pour plus de détails.
                  </p>
                </AlertDescription>
              </Alert>

              {loading ? (
                <div className="text-sm text-muted-foreground">Chargement...</div>
              ) : publishableKeys.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  Aucune clé publique pour l&apos;environnement {environmentFilter}
                </Card>
              ) : (
                <div className="space-y-4">
                  {publishableKeys.map((key) => (
                    <div
                      key={key.id}
                      className="flex flex-col gap-2 rounded-lg border p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{key.name}</h3>
                          <Badge variant={key.is_active ? "default" : "secondary"}>
                            {key.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(key.id, key.is_active)}
                          >
                            {key.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteKey(key.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          readOnly
                          value={key.key_preview}
                          className="font-mono text-xs"
                        />
                        <CopyButton text={key.key_preview} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Créée le {format(new Date(key.created_at), "dd/MM/yyyy à HH:mm")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </PermissionGuard>
  )
}
