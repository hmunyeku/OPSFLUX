"use client"

import { useState, useEffect } from "react"
import { Info } from "lucide-react"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { getHooks, type Hook, updateHook } from "./data/hooks-api"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"

export default function HooksPage() {
  const [hooks, setHooks] = useState<Hook[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const loadHooks = async () => {
    setLoading(true)
    try {
      const data = await getHooks()
      setHooks(data)
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de charger les hooks",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHooks()
  }, [])

  const handleToggleActive = async (hook: Hook) => {
    try {
      await updateHook(hook.id, { is_active: !hook.is_active })
      toast({
        title: "Succès",
        description: `Hook ${hook.is_active ? "désactivé" : "activé"}`,
      })
      loadHooks()
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de modifier le hook",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Accueil</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Développeurs</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Hooks & Triggers</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">Hooks & Triggers</h2>
          <p className="text-muted-foreground text-sm">
            Hooks système pour automatiser vos workflows
          </p>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Hooks système</AlertTitle>
        <AlertDescription>
          Les hooks sont créés automatiquement par le système. Vous pouvez les activer/désactiver selon vos besoins.
        </AlertDescription>
      </Alert>

      <div className="h-full flex-1">
        {loading ? (
          <div className="mt-6 text-center text-sm text-muted-foreground">Chargement...</div>
        ) : hooks.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Hooks système disponibles</CardTitle>
              <CardDescription>
                {hooks.length} hook{hooks.length > 1 ? "s" : ""} système disponible{hooks.length > 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Événement</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Priorité</TableHead>
                    <TableHead>Actions</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hooks.map((hook) => (
                    <TableRow key={hook.id}>
                      <TableCell className="font-medium">{hook.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{hook.event}</Badge>
                      </TableCell>
                      <TableCell className="max-w-md text-sm text-muted-foreground">
                        {hook.description || "Aucune description"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={hook.priority > 50 ? "default" : "secondary"}>
                          {hook.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {hook.actions.map((action, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {action.type.replace("_", " ")}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={hook.is_active}
                          onCheckedChange={() => handleToggleActive(hook)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Aucun hook système</CardTitle>
              <CardDescription>
                Les hooks seront créés automatiquement par le système lors de l&apos;installation de modules.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  )
}
