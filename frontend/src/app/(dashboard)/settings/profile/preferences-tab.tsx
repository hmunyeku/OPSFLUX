"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { usePreferencesContext } from "@/contexts/preferences-context"
import { useThemeColors } from "@/hooks/use-theme-colors"
import { useTheme } from "next-themes"
import { useSidebar } from "@/components/ui/sidebar"
import { themes, type ThemeName } from "@/config/themes"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
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
import { Button } from "@/components/ui/button"
import { IconSearch, IconChevronDown, IconChevronUp } from "@tabler/icons-react"
import { type UserPreferences } from "@/types/preferences"
import { Switch } from "@/components/ui/switch"

type PreferenceValue = string | number | boolean

interface PreferenceItem {
  key: keyof UserPreferences
  label: string
  description: string
  category: string
  renderValue: (value: PreferenceValue, onChange: (value: PreferenceValue) => void) => React.ReactNode
}

export function PreferencesTab() {
  const { preferences, updatePreferences } = usePreferencesContext()
  const { changeTheme } = useThemeColors()
  const { setTheme } = useTheme()
  const { setOpen } = useSidebar()

  const [recentlyModified, setRecentlyModified] = useState<Map<keyof UserPreferences, number>>(new Map())
  const [searchQuery, setSearchQuery] = useState("")

  // Nettoyer les tags "Modifié" après 5 secondes
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const updated = new Map(recentlyModified)
      let hasChanges = false

      updated.forEach((timestamp, key) => {
        if (now - timestamp > 5000) { // 5 secondes = 5000ms
          updated.delete(key)
          hasChanges = true
        }
      })

      if (hasChanges) {
        setRecentlyModified(updated)
      }
    }, 1000) // Vérifier toutes les secondes

    return () => clearInterval(interval)
  }, [recentlyModified])

  const handleImmediateChange = useCallback((key: keyof UserPreferences, value: PreferenceValue) => {
    // Sauvegarder immédiatement
    updatePreferences({ [key]: value })

    // Marquer comme récemment modifié
    setRecentlyModified(prev => new Map(prev).set(key, Date.now()))

    // Appliquer les changements de thème
    if (key === 'colorTheme') {
      changeTheme(value as ThemeName)
    } else if (key === 'darkMode') {
      setTheme(value as string)
    } else if (key === 'sidebarCollapsed') {
      // Synchroniser avec l'état de la sidebar (inversé car collapsed = !open)
      setOpen(!(value as boolean))
    }
  }, [updatePreferences, changeTheme, setTheme, setOpen])

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
          <Switch
            checked={value as boolean}
            onCheckedChange={onChange}
          />
          <span className="text-sm text-muted-foreground">
            {(value as boolean) ? "Activé" : "Désactivé"}
          </span>
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
          <Switch
            checked={value as boolean}
            onCheckedChange={onChange}
          />
          <span className="text-sm text-muted-foreground">
            {(value as boolean) ? "Activé" : "Désactivé"}
          </span>
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
          <Switch
            checked={value as boolean}
            onCheckedChange={onChange}
          />
          <span className="text-sm text-muted-foreground">
            {(value as boolean) ? "Activé" : "Désactivé"}
          </span>
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
          <Switch
            checked={value as boolean}
            onCheckedChange={onChange}
          />
          <span className="text-sm text-muted-foreground">
            {(value as boolean) ? "Activé" : "Désactivé"}
          </span>
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

  // État pour gérer les catégories expandées
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({})

  // Initialiser les catégories expandées
  useEffect(() => {
    setExpandedCategories(
      Object.keys(groupedPreferences).reduce((acc, key) => ({ ...acc, [key]: true }), {})
    )
  }, [groupedPreferences])

  // Créer les colonnes du DataTable
  const columns = useMemo<ColumnDef<PreferenceItem>[]>(
    () => [
      {
        accessorKey: "label",
        header: "Préférence",
        cell: ({ row }) => {
          const isRecentlyModified = recentlyModified.has(row.original.key)
          return (
            <div className="flex items-center gap-2 min-w-[200px]">
              <span className="font-medium">{row.original.label}</span>
              {isRecentlyModified && (
                <Badge variant="outline" className="text-green-600 border-green-600 dark:text-green-400 dark:border-green-400 text-xs">
                  Modifié
                </Badge>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <div className="text-muted-foreground text-sm max-w-md">
            {row.original.description}
          </div>
        ),
      },
      {
        accessorKey: "value",
        header: "Valeur",
        cell: ({ row }) => {
          const currentValue = preferences[row.original.key]
          return (
            <div className="min-w-[250px]">
              {row.original.renderValue(currentValue, (value) =>
                handleImmediateChange(row.original.key, value)
              )}
            </div>
          )
        },
      },
    ],
    [recentlyModified, preferences, handleImmediateChange]
  )

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }))
  }

  // Composant pour une table de catégorie
  function CategoryTable({ items, category }: { items: PreferenceItem[]; category: string }) {
    const table = useReactTable({
      data: items,
      columns,
      getCoreRowModel: getCoreRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      getSortedRowModel: getSortedRowModel(),
    })

    const isExpanded = expandedCategories[category] ?? true

    return (
      <div className="rounded-lg border">
        {/* Header de catégorie */}
        <Button
          variant="ghost"
          onClick={() => toggleCategory(category)}
          className="w-full justify-between p-4 h-auto hover:bg-muted/50"
        >
          <h3 className="text-lg font-semibold">{category}</h3>
          {isExpanded ? (
            <IconChevronUp className="h-5 w-5" />
          ) : (
            <IconChevronDown className="h-5 w-5" />
          )}
        </Button>

        {/* Contenu de la table */}
        {isExpanded && (
          <>
            {/* Vue desktop */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => {
                      const isRecentlyModified = recentlyModified.has(
                        row.original.key
                      )
                      return (
                        <TableRow
                          key={row.id}
                          className={
                            isRecentlyModified
                              ? "bg-green-50 dark:bg-green-950/10"
                              : ""
                          }
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-24 text-center"
                      >
                        Aucun résultat.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Vue mobile - Cards */}
            <div className="md:hidden p-4 space-y-3">
              {items.map((pref) => {
                const isRecentlyModified = recentlyModified.has(pref.key)
                const currentValue = preferences[pref.key]

                return (
                  <div
                    key={pref.key}
                    className={`rounded-lg border p-4 space-y-3 ${
                      isRecentlyModified
                        ? "bg-green-50 dark:bg-green-950/10 border-green-200 dark:border-green-900"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-sm">
                            {pref.label}
                          </h4>
                          {isRecentlyModified && (
                            <Badge
                              variant="outline"
                              className="text-green-600 border-green-600 dark:text-green-400 dark:border-green-400 text-xs"
                            >
                              Modifié
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {pref.description}
                        </p>
                      </div>
                    </div>
                    <div className="pt-2">
                      {pref.renderValue(currentValue, (value) =>
                        handleImmediateChange(pref.key, value)
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Barre de recherche */}
      <div className="relative max-w-md">
        <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher une préférence..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tables groupées par catégorie */}
      <div className="space-y-4">
        {Object.entries(groupedPreferences).map(([category, items]) => (
          <CategoryTable key={category} items={items} category={category} />
        ))}
      </div>

      {filteredPreferences.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            Aucune préférence ne correspond à votre recherche.
          </p>
        </div>
      )}
    </div>
  )
}
