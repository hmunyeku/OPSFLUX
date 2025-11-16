"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Languages, Plus, Edit, Trash2, Download, Upload, CheckCircle2, AlertCircle } from "lucide-react"

type Language = {
  code: string
  name: string
  nativeName: string
  enabled: boolean
  progress: number
  totalKeys: number
  translatedKeys: number
}

type TranslationKey = {
  key: string
  fr: string
  en: string
  es?: string
  de?: string
  category: string
}

const mockLanguages: Language[] = [
  {
    code: "fr",
    name: "French",
    nativeName: "Français",
    enabled: true,
    progress: 100,
    totalKeys: 1250,
    translatedKeys: 1250,
  },
  {
    code: "en",
    name: "English",
    nativeName: "English",
    enabled: true,
    progress: 98,
    totalKeys: 1250,
    translatedKeys: 1225,
  },
  {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    enabled: false,
    progress: 45,
    totalKeys: 1250,
    translatedKeys: 563,
  },
  {
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    enabled: false,
    progress: 30,
    totalKeys: 1250,
    translatedKeys: 375,
  },
]

const mockTranslations: TranslationKey[] = [
  { key: "common.save", fr: "Enregistrer", en: "Save", es: "Guardar", de: "Speichern", category: "Common" },
  { key: "common.cancel", fr: "Annuler", en: "Cancel", es: "Cancelar", de: "Abbrechen", category: "Common" },
  { key: "common.delete", fr: "Supprimer", en: "Delete", es: "Eliminar", de: "Löschen", category: "Common" },
  { key: "dashboard.title", fr: "Tableau de bord", en: "Dashboard", es: "Panel de control", category: "Dashboard" },
  { key: "projects.new", fr: "Nouveau projet", en: "New project", category: "Projects" },
]

export function SettingsTranslationsContent() {
  const [languages] = useState<Language[]>(mockLanguages)
  const [translations] = useState<TranslationKey[]>(mockTranslations)

  const stats = {
    total: languages.length,
    enabled: languages.filter((l) => l.enabled).length,
    avgProgress: Math.round(languages.reduce((sum, l) => sum + l.progress, 0) / languages.length),
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestion des Traductions</h1>
          <p className="text-sm text-muted-foreground">Gérer les langues et traductions de l'application</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exporter
          </Button>
          <Button variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Importer
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter une Langue
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-blue-100 p-1.5 dark:bg-blue-900">
              <Languages className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Langues Totales</p>
              <p className="text-xl font-bold">{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-green-100 p-1.5 dark:bg-green-900">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Langues Actives</p>
              <p className="text-xl font-bold">{stats.enabled}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-purple-100 p-1.5 dark:bg-purple-900">
              <AlertCircle className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Progression Moyenne</p>
              <p className="text-xl font-bold">{stats.avgProgress}%</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="languages" className="flex-1">
        <TabsList>
          <TabsTrigger value="languages">Langues</TabsTrigger>
          <TabsTrigger value="translations">Traductions</TabsTrigger>
        </TabsList>

        <TabsContent value="languages" className="mt-3">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Langue</TableHead>
                  <TableHead>Nom Natif</TableHead>
                  <TableHead>Progression</TableHead>
                  <TableHead>Clés Traduites</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {languages.map((lang) => (
                  <TableRow key={lang.code}>
                    <TableCell className="font-mono font-semibold">{lang.code.toUpperCase()}</TableCell>
                    <TableCell className="font-medium">{lang.name}</TableCell>
                    <TableCell>{lang.nativeName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${lang.progress}%` }} />
                        </div>
                        <span className="text-sm font-medium">{lang.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {lang.translatedKeys} / {lang.totalKeys}
                    </TableCell>
                    <TableCell>
                      {lang.enabled ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Activée
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          Désactivée
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0 bg-transparent">
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0 bg-transparent">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="translations" className="mt-3">
          <Card>
            <div className="p-3 border-b">
              <Input placeholder="Rechercher une clé de traduction..." className="max-w-md" />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clé</TableHead>
                  <TableHead>Français</TableHead>
                  <TableHead>English</TableHead>
                  <TableHead>Español</TableHead>
                  <TableHead>Deutsch</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {translations.map((trans) => (
                  <TableRow key={trans.key}>
                    <TableCell className="font-mono text-xs">{trans.key}</TableCell>
                    <TableCell>{trans.fr}</TableCell>
                    <TableCell>{trans.en}</TableCell>
                    <TableCell>{trans.es || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell>{trans.de || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{trans.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0 bg-transparent">
                          <Edit className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
