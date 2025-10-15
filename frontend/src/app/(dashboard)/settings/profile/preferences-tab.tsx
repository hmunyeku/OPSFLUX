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
import { IconSearch, IconFilter, IconArrowsSort, IconX } from "@tabler/icons-react"
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
      category: "Région",
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
      category: "Région",
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
      category: "Région",
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
      category: "Région",
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

  // Get all unique categories
  const categories = useMemo(() => {
    const cats = Array.from(new Set(preferencesConfig.map(item => item.category)))
    return ["all", ...cats]
  }, [])

  // Category filter state
  const [categoryFilter, setCategoryFilter] = useState<string>("all")

  // Filter preferences based on search and category
  const filteredPreferencesData = useMemo(() => {
    return filteredPreferences.filter(pref => {
      const matchesCategory = categoryFilter === "all" || pref.category === categoryFilter
      return matchesCategory
    })
  }, [filteredPreferences, categoryFilter])

  // Créer les colonnes du DataTable
  const columns = useMemo<ColumnDef<PreferenceItem>[]>(
    () => [
      {
        accessorKey: "category",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8 data-[state=open]:bg-accent"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Catégorie
              <IconArrowsSort className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => {
          const isFiltered = categoryFilter === row.original.category
          return (
            <div className="min-w-[150px]">
              <Button
                variant={isFiltered ? "default" : "secondary"}
                size="sm"
                className="h-6 text-xs px-2 cursor-pointer transition-colors gap-1.5"
                onClick={() => setCategoryFilter(isFiltered ? "all" : row.original.category)}
                title={isFiltered ? "Cliquer pour retirer le filtre" : `Filtrer par ${row.original.category}`}
              >
                {row.original.category}
                {isFiltered && <IconX className="h-3 w-3 ml-0.5" />}
              </Button>
            </div>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: "label",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8 data-[state=open]:bg-accent"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Préférence
              <IconArrowsSort className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => {
          const isRecentlyModified = recentlyModified.has(row.original.key)
          return (
            <div className="min-w-[200px] flex items-center gap-2">
              <span className="font-medium">{row.original.label}</span>
              {isRecentlyModified && (
                <Badge variant="outline" className="text-green-600 border-green-600 dark:text-green-400 dark:border-green-400 text-xs">
                  Modifié
                </Badge>
              )}
            </div>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: "description",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8 data-[state=open]:bg-accent"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Description
              <IconArrowsSort className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => (
          <div className="text-muted-foreground text-sm max-w-md">
            {row.original.description}
          </div>
        ),
        enableSorting: true,
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

  // Create table instance
  const table = useReactTable({
    data: filteredPreferencesData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

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

      {/* Search and Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        <div className="relative flex-1 w-full">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une préférence..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 w-full"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <IconFilter className="h-4 w-4 text-muted-foreground" />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full md:w-[250px]">
              <SelectValue placeholder="Toutes les catégories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les catégories</SelectItem>
              {categories.filter(cat => cat !== "all").map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {categoryFilter !== "all" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCategoryFilter("all")}
              className="h-8"
            >
              Effacer
            </Button>
          )}
        </div>
      </div>

      {/* Unified DataTable - Desktop */}
      <div className="hidden md:block rounded-lg border">
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
                const isRecentlyModified = recentlyModified.has(row.original.key)
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
                  Aucune préférence ne correspond à votre recherche.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile View - Cards */}
      <div className="md:hidden space-y-3">
        {filteredPreferencesData.length > 0 ? (
          filteredPreferencesData.map((pref) => {
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
                <div className="space-y-2">
                  {(() => {
                    const isFiltered = categoryFilter === pref.category
                    return (
                      <Button
                        variant={isFiltered ? "default" : "secondary"}
                        size="sm"
                        className="h-6 text-xs px-2 cursor-pointer transition-colors gap-1.5"
                        onClick={() => setCategoryFilter(isFiltered ? "all" : pref.category)}
                        title={isFiltered ? "Cliquer pour retirer le filtre" : `Filtrer par ${pref.category}`}
                      >
                        {pref.category}
                        {isFiltered && <IconX className="h-3 w-3 ml-0.5" />}
                      </Button>
                    )
                  })()}
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm">{pref.label}</h4>
                    {isRecentlyModified && (
                      <Badge variant="outline" className="text-green-600 border-green-600 dark:text-green-400 dark:border-green-400 text-xs">
                        Modifié
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {pref.description}
                  </p>
                </div>
                <div className="pt-2">
                  {pref.renderValue(currentValue, (value) =>
                    handleImmediateChange(pref.key, value)
                  )}
                </div>
              </div>
            )
          })
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            Aucune préférence ne correspond à votre recherche.
          </div>
        )}
      </div>

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
