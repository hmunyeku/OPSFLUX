"use client"

import { useState, useMemo } from "react"
import { usePreferencesContext } from "@/contexts/preferences-context"
import { Button } from "@/components/ui/button"
import { useThemeColors } from "@/hooks/use-theme-colors"
import { useTheme } from "next-themes"
import { themes } from "@/config/themes"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { IconSearch, IconDeviceFloppy } from "@tabler/icons-react"
import { type UserPreferences } from "@/types/preferences"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type PreferenceValue = string | number | boolean

interface PreferenceItem {
  key: keyof UserPreferences
  label: string
  description: string
  category: string
  renderValue: (value: PreferenceValue, onChange: (value: PreferenceValue) => void) => React.ReactNode
}

export function PreferencesTab() {
  const { preferences, updatePreferences, resetPreferences } = usePreferencesContext()
  const { changeTheme } = useThemeColors()
  const { setTheme } = useTheme()

  const [tempPreferences, setTempPreferences] = useState<UserPreferences>(preferences)
  const [modifiedKeys, setModifiedKeys] = useState<Set<keyof UserPreferences>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")

  const handleTempChange = (key: keyof UserPreferences, value: PreferenceValue) => {
    setTempPreferences(prev => ({ ...prev, [key]: value }))
    setModifiedKeys(prev => new Set(prev).add(key))
  }

  const handleSave = () => {
    // Apply theme changes
    if (modifiedKeys.has('colorTheme')) {
      changeTheme(tempPreferences.colorTheme)
    }
    if (modifiedKeys.has('darkMode')) {
      setTheme(tempPreferences.darkMode)
    }

    // Save all changes
    updatePreferences(tempPreferences)
    setModifiedKeys(new Set())
  }

  const handleReset = () => {
    resetPreferences()
    setTempPreferences(preferences)
    setModifiedKeys(new Set())
  }

  const preferencesConfig: PreferenceItem[] = [
    // Apparence
    {
      key: "colorTheme",
      label: "Thème de couleur",
      description: "Personnaliser les couleurs de l'interface",
      category: "Apparence",
      renderValue: (value, onChange) => (
        <Select value={value as string} onValueChange={onChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(themes).map(([key, theme]) => (
              <SelectItem key={key} value={key}>
                {theme.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "darkMode",
      label: "Mode d'affichage",
      description: "Choisir entre clair, sombre ou système",
      category: "Apparence",
      renderValue: (value, onChange) => (
        <Select value={value as string} onValueChange={onChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Clair</SelectItem>
            <SelectItem value="dark">Sombre</SelectItem>
            <SelectItem value="system">Système</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "sidebarCollapsed",
      label: "Barre latérale réduite",
      description: "Réduire la barre latérale par défaut",
      category: "Apparence",
      renderValue: (value, onChange) => (
        <div className="flex items-center gap-3">
          <Badge variant={(value as boolean) ? "default" : "secondary"} className="min-w-[80px] justify-center">
            {(value as boolean) ? "Activé" : "Désactivé"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange(!(value as boolean))}
          >
            Basculer
          </Button>
        </div>
      ),
    },
    // Langue & Région
    {
      key: "language",
      label: "Langue",
      description: "Langue de l'interface utilisateur",
      category: "Langue & Région",
      renderValue: (value, onChange) => (
        <Select value={value as string} onValueChange={onChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fr">Français</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "timezone",
      label: "Fuseau horaire",
      description: "Fuseau horaire pour l'affichage des dates",
      category: "Langue & Région",
      renderValue: (value, onChange) => (
        <Select value={value as string} onValueChange={onChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Europe/Paris">Europe/Paris (GMT+1)</SelectItem>
            <SelectItem value="America/New_York">America/New_York (GMT-5)</SelectItem>
            <SelectItem value="Asia/Tokyo">Asia/Tokyo (GMT+9)</SelectItem>
            <SelectItem value="UTC">UTC (GMT+0)</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "dateFormat",
      label: "Format de date",
      description: "Format d'affichage des dates",
      category: "Langue & Région",
      renderValue: (value, onChange) => (
        <Select value={value as string} onValueChange={onChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DD/MM/YYYY">JJ/MM/AAAA</SelectItem>
            <SelectItem value="MM/DD/YYYY">MM/JJ/AAAA</SelectItem>
            <SelectItem value="YYYY-MM-DD">AAAA-MM-JJ</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "timeFormat",
      label: "Format d'heure",
      description: "Format d'affichage de l'heure",
      category: "Langue & Région",
      renderValue: (value, onChange) => (
        <Select value={value as string} onValueChange={onChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="12h">12 heures</SelectItem>
            <SelectItem value="24h">24 heures</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    // Notifications
    {
      key: "emailNotifications",
      label: "Notifications par email",
      description: "Recevoir des notifications par email",
      category: "Notifications",
      renderValue: (value, onChange) => (
        <div className="flex items-center gap-3">
          <Badge variant={(value as boolean) ? "default" : "secondary"} className="min-w-[80px] justify-center">
            {(value as boolean) ? "Activé" : "Désactivé"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange(!(value as boolean))}
          >
            Basculer
          </Button>
        </div>
      ),
    },
    {
      key: "pushNotifications",
      label: "Notifications push",
      description: "Recevoir des notifications dans le navigateur",
      category: "Notifications",
      renderValue: (value, onChange) => (
        <div className="flex items-center gap-3">
          <Badge variant={(value as boolean) ? "default" : "secondary"} className="min-w-[80px] justify-center">
            {(value as boolean) ? "Activé" : "Désactivé"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange(!(value as boolean))}
          >
            Basculer
          </Button>
        </div>
      ),
    },
    {
      key: "notificationSound",
      label: "Son des notifications",
      description: "Jouer un son lors de la réception de notifications",
      category: "Notifications",
      renderValue: (value, onChange) => (
        <div className="flex items-center gap-3">
          <Badge variant={(value as boolean) ? "default" : "secondary"} className="min-w-[80px] justify-center">
            {(value as boolean) ? "Activé" : "Désactivé"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange(!(value as boolean))}
          >
            Basculer
          </Button>
        </div>
      ),
    },
    // Affichage
    {
      key: "itemsPerPage",
      label: "Éléments par page",
      description: "Nombre d'éléments affichés par page dans les listes",
      category: "Affichage",
      renderValue: (value, onChange) => (
        <Select value={value.toString()} onValueChange={(v) => onChange(parseInt(v, 10))}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
  ]

  const filteredPreferences = useMemo(() => {
    if (!searchQuery) return preferencesConfig

    const query = searchQuery.toLowerCase()
    return preferencesConfig.filter(
      (pref) =>
        pref.label.toLowerCase().includes(query) ||
        pref.description.toLowerCase().includes(query) ||
        pref.category.toLowerCase().includes(query)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  const groupedPreferences = useMemo(() => {
    const groups: Record<string, PreferenceItem[]> = {}
    filteredPreferences.forEach((pref) => {
      if (!groups[pref.category]) {
        groups[pref.category] = []
      }
      groups[pref.category].push(pref)
    })
    return groups
  }, [filteredPreferences])

  const hasChanges = modifiedKeys.size > 0

  return (
    <div className="space-y-6">
      {/* Header with search and actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher une préférence..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="outline" className="text-orange-500 border-orange-500">
              {modifiedKeys.size} modification{modifiedKeys.size > 1 ? "s" : ""}
            </Badge>
          )}
          <Button variant="outline" onClick={handleReset} disabled={!hasChanges}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges}>
            <IconDeviceFloppy className="mr-2 h-4 w-4" />
            Enregistrer
          </Button>
        </div>
      </div>

      {/* Grouped preferences tables */}
      {Object.entries(groupedPreferences).map(([category, items]) => (
        <Card key={category}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{category}</CardTitle>
            <CardDescription>
              {category === "Apparence" && "Personnalisez l'apparence de l'interface"}
              {category === "Langue & Région" && "Configurez vos préférences linguistiques et de format"}
              {category === "Notifications" && "Gérez vos préférences de notifications"}
              {category === "Affichage" && "Configurez les options d'affichage"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[240px]">Préférence</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[320px]">Valeur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((pref) => {
                    const isModified = modifiedKeys.has(pref.key)
                    const currentValue = tempPreferences[pref.key]

                    return (
                      <TableRow key={pref.key} className={isModified ? "bg-orange-50 dark:bg-orange-950/20" : ""}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {pref.label}
                            {isModified && (
                              <Badge variant="outline" className="text-orange-500 border-orange-500 text-xs">
                                Modifié
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {pref.description}
                        </TableCell>
                        <TableCell>
                          {pref.renderValue(currentValue, (value) => handleTempChange(pref.key, value))}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}

      {filteredPreferences.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Aucune préférence ne correspond à votre recherche.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
