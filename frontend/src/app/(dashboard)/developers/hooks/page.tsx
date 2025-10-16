"use client"

import { useState, useEffect } from "react"
import { Frown, Zap } from "lucide-react"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { getHooks, type Hook } from "./data/hooks-api"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { updateHook, deleteHook } from "./data/hooks-api"

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

  const handleDelete = async (hook: Hook) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le hook "${hook.name}" ?`)) {
      return
    }

    try {
      await deleteHook(hook.id)
      toast({
        title: "Succès",
        description: "Hook supprimé avec succès",
      })
      loadHooks()
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de supprimer le hook",
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
            Automatisez vos workflows avec des déclencheurs d'événements.
          </p>
        </div>
        <Button asChild>
          <Link href="/developers/hooks/new">
            <Zap className="mr-2 h-4 w-4" />
            Créer un hook
          </Link>
        </Button>
      </div>

      <div className="h-full flex-1">
        {loading ? (
          <div className="mt-6 text-center text-sm text-muted-foreground">Chargement...</div>
        ) : hooks.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Hooks configurés</CardTitle>
              <CardDescription>
                {hooks.length} hook{hooks.length > 1 ? "s" : ""} configuré{hooks.length > 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Événement</TableHead>
                    <TableHead>Priorité</TableHead>
                    <TableHead>Actions</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hooks.map((hook) => (
                    <TableRow key={hook.id}>
                      <TableCell className="font-medium">{hook.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{hook.event}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={hook.priority > 50 ? "default" : "secondary"}>
                          {hook.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {hook.actions.map((action, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {action.type}
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
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/developers/hooks/${hook.id}`}>Détails</Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(hook)}
                            className="text-destructive"
                          >
                            Supprimer
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <div className="border-border mt-6 flex flex-col items-center gap-4 rounded-lg border border-dashed px-6 py-10">
            <Frown className="size-32" />
            <h2 className="text-lg font-semibold">Aucun hook configuré</h2>
            <p className="text-muted-foreground text-center">
              Commencez par créer un hook pour{" "}
              <br className="hidden sm:block" /> automatiser vos workflows et réagir aux événements.
            </p>
            <Button asChild>
              <Link href="/developers/hooks/new">
                <Zap className="mr-2 h-4 w-4" />
                Créer un hook
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
