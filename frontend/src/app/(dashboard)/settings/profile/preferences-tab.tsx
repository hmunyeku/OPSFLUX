"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import Image from "next/image"
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { IconSearch, IconChevronDown, IconChevronUp } from "@tabler/icons-react"
import { Shield, ShieldCheck, Key, Download, RefreshCw, Smartphone } from "lucide-react"
import { type UserPreferences } from "@/types/preferences"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { auth } from "@/lib/auth"
import QRCode from "qrcode"

type PreferenceValue = string | number | boolean

interface PreferenceItem {
  key: keyof UserPreferences
  label: string
  description: string
  category: string
  renderValue: (value: PreferenceValue, onChange: (value: PreferenceValue) => void) => React.ReactNode
}

interface TwoFactorConfig {
  is_enabled: boolean
  primary_method: "totp" | "sms"
  totp_verified_at: string | null
  phone_number: string | null
  phone_verified_at: string | null
  backup_codes_count: number
  last_used_at: string | null
}

export function PreferencesTab() {
  const { preferences, updatePreferences } = usePreferencesContext()
  const { changeTheme } = useThemeColors()
  const { setTheme } = useTheme()
  const { setOpen } = useSidebar()
  const { toast } = useToast()

  const [recentlyModified, setRecentlyModified] = useState<Map<keyof UserPreferences, number>>(new Map())
  const [searchQuery, setSearchQuery] = useState("")

  // 2FA states
  const [twoFactorConfig, setTwoFactorConfig] = useState<TwoFactorConfig | null>(null)
  const [loading2FA, setLoading2FA] = useState(true)
  const [setupDialogOpen, setSetupDialogOpen] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState("")
  const [totpSecret, setTotpSecret] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [showBackupCodes, setShowBackupCodes] = useState(false)

  // Fetch 2FA config on mount
  useEffect(() => {
    fetchTwoFactorConfig()
  }, [])

  // Synchroniser l'état de la sidebar avec la préférence au chargement
  useEffect(() => {
    // Appliquer la préférence sidebar au chargement initial
    if (preferences.sidebarCollapsed !== undefined) {
      // sidebarCollapsed = true signifie que la sidebar doit être fermée (collapsed)
      // donc open = !sidebarCollapsed
      setOpen(!preferences.sidebarCollapsed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Seulement au montage initial

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

  // 2FA API functions
  const fetchTwoFactorConfig = async () => {
    try {
      const token = auth.getToken()
      if (!token) {
        setLoading2FA(false)
        return
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/2fa/config`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (response.ok) {
        const data = await response.json()
        setTwoFactorConfig(data)
      }
    } catch (_error) {
      // Silently fail - user will see no 2FA config
    } finally {
      setLoading2FA(false)
    }
  }

  const handleSetupTotp = async () => {
    try {
      const token = auth.getToken()
      if (!token) {
        toast({
          title: "Erreur",
          description: "Vous devez être connecté",
          variant: "destructive",
        })
        return
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/2fa/setup-totp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setTotpSecret(data.totp_secret)

        // Generate QR code
        const qr = await QRCode.toDataURL(data.totp_uri)
        setQrCodeUrl(qr)
        setSetupDialogOpen(true)
      } else {
        // Get error detail from backend
        const errorData = await response.json().catch(() => ({ detail: "Erreur inconnue" }))
        toast({
          title: "Erreur de configuration 2FA",
          description: errorData.detail || "Impossible de configurer l'authentification à deux facteurs",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Une erreur s'est produite",
        variant: "destructive",
      })
    }
  }

  const handleEnable2FA = async () => {
    if (!verificationCode) {
      toast({
        title: "Code requis",
        description: "Veuillez entrer le code de vérification",
        variant: "destructive",
      })
      return
    }

    try {
      const token = auth.getToken()
      if (!token) {
        toast({
          title: "Erreur",
          description: "Vous devez être connecté",
          variant: "destructive",
        })
        return
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/2fa/enable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          method: "totp",
          verification_code: verificationCode,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setBackupCodes(data.backup_codes.codes)
        setShowBackupCodes(true)
        setSetupDialogOpen(false)

        toast({
          title: "2FA activé",
          description: "L'authentification à deux facteurs a été activée avec succès",
        })

        await fetchTwoFactorConfig()
      } else {
        const error = await response.json()
        toast({
          title: "Code invalide",
          description: error.detail || "Le code de vérification est incorrect",
          variant: "destructive",
        })
      }
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite",
        variant: "destructive",
      })
    }
  }

  const handleDisable2FA = async () => {
    if (!confirm("Êtes-vous sûr de vouloir désactiver l'authentification à deux facteurs ?")) {
      return
    }

    try {
      const token = auth.getToken()
      if (!token) {
        toast({
          title: "Erreur",
          description: "Vous devez être connecté",
          variant: "destructive",
        })
        return
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/2fa/disable`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        toast({
          title: "2FA désactivé",
          description: "L'authentification à deux facteurs a été désactivée",
        })
        await fetchTwoFactorConfig()
      } else {
        toast({
          title: "Erreur",
          description: "Impossible de désactiver l'authentification à deux facteurs",
          variant: "destructive",
        })
      }
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite",
        variant: "destructive",
      })
    }
  }

  const handleRegenerateBackupCodes = async () => {
    if (!confirm("Êtes-vous sûr de vouloir régénérer les codes de secours ? Les anciens codes ne fonctionneront plus.")) {
      return
    }

    try {
      const token = auth.getToken()
      if (!token) {
        toast({
          title: "Erreur",
          description: "Vous devez être connecté",
          variant: "destructive",
        })
        return
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/2fa/regenerate-backup-codes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setBackupCodes(data.codes)
        setShowBackupCodes(true)

        toast({
          title: "Codes régénérés",
          description: "Les nouveaux codes de secours ont été générés",
        })

        await fetchTwoFactorConfig()
      } else {
        toast({
          title: "Erreur",
          description: "Impossible de régénérer les codes de secours",
          variant: "destructive",
        })
      }
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite",
        variant: "destructive",
      })
    }
  }

  const downloadBackupCodes = () => {
    const content = backupCodes.join("\n")
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "backup-codes-opsflux.txt"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

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
      {/* Section Sécurité - 2FA */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Authentification à deux facteurs (2FA)
              </CardTitle>
              <CardDescription>
                Ajoutez une couche de sécurité supplémentaire à votre compte
              </CardDescription>
            </div>
            {twoFactorConfig?.is_enabled && (
              <Badge variant="default" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                Activé
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading2FA ? (
            <div className="text-sm text-muted-foreground">Chargement...</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>État de la 2FA</Label>
                  <div className="text-sm text-muted-foreground">
                    {twoFactorConfig?.is_enabled
                      ? "L'authentification à deux facteurs est active"
                      : "L'authentification à deux facteurs est désactivée"
                    }
                  </div>
                </div>
                <Switch
                  checked={twoFactorConfig?.is_enabled || false}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      handleSetupTotp()
                    } else {
                      handleDisable2FA()
                    }
                  }}
                />
              </div>

              {twoFactorConfig?.is_enabled && (
                <>
                  <div className="pt-4 border-t space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4" />
                          Méthode principale
                        </Label>
                        <div className="text-sm text-muted-foreground">
                          {twoFactorConfig.primary_method === "totp"
                            ? "Application d'authentification (TOTP)"
                            : "SMS"
                          }
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2">
                          <Key className="h-4 w-4" />
                          Codes de secours
                        </Label>
                        <div className="text-sm text-muted-foreground">
                          {twoFactorConfig.backup_codes_count} code(s) disponible(s)
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRegenerateBackupCodes}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Régénérer
                      </Button>
                    </div>
                  </div>

                  {twoFactorConfig.last_used_at && (
                    <Alert>
                      <AlertDescription>
                        Dernière utilisation : {new Date(twoFactorConfig.last_used_at).toLocaleString("fr-FR")}
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

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

      {/* Dialog de configuration TOTP */}
      <Dialog open={setupDialogOpen} onOpenChange={setSetupDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurer l&apos;authentification à deux facteurs</DialogTitle>
            <DialogDescription>
              Scannez le QR code avec votre application d&apos;authentification (Google Authenticator, Authy, etc.)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {qrCodeUrl && (
              <div className="flex justify-center">
                <Image src={qrCodeUrl} alt="QR Code" width={256} height={256} className="w-64 h-64" />
              </div>
            )}

            <Alert>
              <AlertDescription className="font-mono text-xs break-all">
                Si vous ne pouvez pas scanner le QR code, entrez manuellement cette clé : <strong>{totpSecret}</strong>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="verification-code">Code de vérification</Label>
              <Input
                id="verification-code"
                placeholder="000000"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
              />
              <p className="text-sm text-muted-foreground">
                Entrez le code à 6 chiffres de votre application
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleEnable2FA}>
              Activer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog des codes de secours */}
      <Dialog open={showBackupCodes} onOpenChange={setShowBackupCodes}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Codes de secours</DialogTitle>
            <DialogDescription>
              Conservez ces codes dans un endroit sûr. Chaque code ne peut être utilisé qu&apos;une seule fois.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>
                ⚠️ Ces codes ne seront affichés qu&apos;une seule fois. Téléchargez-les ou notez-les maintenant.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg font-mono text-sm">
              {backupCodes.map((code, index) => (
                <div key={index} className="text-center">
                  {code}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={downloadBackupCodes}>
              <Download className="h-4 w-4 mr-2" />
              Télécharger
            </Button>
            <Button variant="outline" onClick={() => setShowBackupCodes(false)}>
              J&apos;ai sauvegardé mes codes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
