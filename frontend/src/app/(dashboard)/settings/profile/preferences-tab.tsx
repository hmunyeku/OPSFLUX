"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import Image from "next/image"
import { usePreferencesContext } from "@/contexts/preferences-context"
import { useThemeColors } from "@/hooks/use-theme-colors"
import { useTheme } from "next-themes"
import { useSidebar } from "@/components/ui/sidebar"
import { themes, type ThemeName } from "@/config/themes"
import { useTranslation } from "@/hooks/use-translation"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { IconSearch, IconFilter, IconArrowsSort, IconX, IconLoader2 } from "@tabler/icons-react"
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
  const { t } = useTranslation("core.profile")
  const { preferences, updatePreferences } = usePreferencesContext()
  const { changeTheme } = useThemeColors()
  const { setTheme } = useTheme()
  const { setOpen } = useSidebar()
  const { toast } = useToast()

  const [recentlyModified, setRecentlyModified] = useState<Map<keyof UserPreferences, number>>(new Map())
  const [savingPreference, setSavingPreference] = useState<keyof UserPreferences | null>(null)
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

  // Confirmation dialogs
  const [disable2FADialogOpen, setDisable2FADialogOpen] = useState(false)
  const [regenerateCodesDialogOpen, setRegenerateCodesDialogOpen] = useState(false)

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
          title: t("toast.error"),
          description: t("toast.error_auth"),
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
          title: t("toast.error"),
          description: errorData.detail || t("toast.error_setup"),
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: t("toast.error"),
        description: error instanceof Error ? error.message : t("toast.error_generic"),
        variant: "destructive",
      })
    }
  }

  const handleEnable2FA = async () => {
    if (!verificationCode) {
      toast({
        title: t("toast.code_required"),
        description: t("toast.code_required_desc"),
        variant: "destructive",
      })
      return
    }

    try {
      const token = auth.getToken()
      if (!token) {
        toast({
          title: t("toast.error"),
          description: t("toast.error_auth"),
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
          title: t("toast.2fa_enabled"),
          description: t("toast.2fa_enabled_desc"),
        })

        await fetchTwoFactorConfig()
      } else {
        const error = await response.json()
        toast({
          title: t("toast.code_invalid"),
          description: error.detail || t("toast.code_invalid_desc"),
          variant: "destructive",
        })
      }
    } catch (_error) {
      toast({
        title: t("toast.error"),
        description: t("toast.error_generic"),
        variant: "destructive",
      })
    }
  }

  const confirmDisable2FA = async () => {
    setDisable2FADialogOpen(false)

    try {
      const token = auth.getToken()
      if (!token) {
        toast({
          title: t("toast.error"),
          description: t("toast.error_auth"),
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
          title: t("toast.2fa_disabled"),
          description: t("toast.2fa_disabled_desc"),
        })
        await fetchTwoFactorConfig()
      } else {
        toast({
          title: t("toast.error"),
          description: t("toast.error_disable"),
          variant: "destructive",
        })
      }
    } catch (_error) {
      toast({
        title: t("toast.error"),
        description: t("toast.error_generic"),
        variant: "destructive",
      })
    }
  }

  const confirmRegenerateBackupCodes = async () => {
    setRegenerateCodesDialogOpen(false)

    try {
      const token = auth.getToken()
      if (!token) {
        toast({
          title: t("toast.error"),
          description: t("toast.error_auth"),
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
          title: t("toast.codes_regenerated"),
          description: t("toast.codes_regenerated_desc"),
        })

        await fetchTwoFactorConfig()
      } else {
        toast({
          title: t("toast.error"),
          description: t("toast.error_regenerate"),
          variant: "destructive",
        })
      }
    } catch (_error) {
      toast({
        title: t("toast.error"),
        description: t("toast.error_generic"),
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

  const handleImmediateChange = useCallback(async (key: keyof UserPreferences, value: PreferenceValue) => {
    // Indiquer qu'on est en train de sauvegarder
    setSavingPreference(key)

    try {
      // Sauvegarder immédiatement
      await updatePreferences({ [key]: value })

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
    } catch (error) {
      console.error('Failed to save preference:', error)
      toast({
        title: t("toast.error"),
        description: t("toast.error_saving_pref", "Erreur lors de la sauvegarde de la préférence"),
        variant: "destructive",
      })
    } finally {
      setSavingPreference(null)
    }
  }, [updatePreferences, changeTheme, setTheme, setOpen, toast, t])

  const preferencesConfig: PreferenceItem[] = [
    // Apparence
    {
      key: "colorTheme",
      label: t("items.color_theme.label"),
      description: t("items.color_theme.desc"),
      category: t("categories.appearance"),
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
      label: t("items.dark_mode.label"),
      description: t("items.dark_mode.desc"),
      category: t("categories.appearance"),
      renderValue: (value, onChange) => (
        <Select value={value as string} onValueChange={onChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">{t("items.dark_mode.light")}</SelectItem>
            <SelectItem value="dark">{t("items.dark_mode.dark")}</SelectItem>
            <SelectItem value="system">{t("items.dark_mode.system")}</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "sidebarCollapsed",
      label: t("items.sidebar_collapsed.label"),
      description: t("items.sidebar_collapsed.desc"),
      category: t("categories.appearance"),
      renderValue: (value, onChange) => (
        <div className="flex items-center gap-3">
          <Switch
            checked={value as boolean}
            onCheckedChange={onChange}
          />
          <span className="text-sm text-muted-foreground">
            {(value as boolean) ? t("items.sidebar_collapsed.enabled") : t("items.sidebar_collapsed.disabled")}
          </span>
        </div>
      ),
    },
    {
      key: "sidebarVariant",
      label: t("items.sidebar_variant.label"),
      description: t("items.sidebar_variant.desc"),
      category: t("categories.appearance"),
      renderValue: (value, onChange) => (
        <Select value={value as string} onValueChange={onChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inset">{t("items.sidebar_variant.inset")}</SelectItem>
            <SelectItem value="floating">{t("items.sidebar_variant.floating")}</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "fontSize",
      label: t("items.font_size.label"),
      description: t("items.font_size.desc"),
      category: t("categories.appearance"),
      renderValue: (value, onChange) => (
        <Select value={value as string} onValueChange={onChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="small">{t("items.font_size.small")}</SelectItem>
            <SelectItem value="normal">{t("items.font_size.normal")}</SelectItem>
            <SelectItem value="large">{t("items.font_size.large")}</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    // Langue & Région
    {
      key: "language",
      label: t("items.language.label"),
      description: t("items.language.desc"),
      category: t("categories.region"),
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
      label: t("items.timezone.label"),
      description: t("items.timezone.desc"),
      category: t("categories.region"),
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
      label: t("items.date_format.label"),
      description: t("items.date_format.desc"),
      category: t("categories.region"),
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
      label: t("items.time_format.label"),
      description: t("items.time_format.desc"),
      category: t("categories.region"),
      renderValue: (value, onChange) => (
        <Select value={value as string} onValueChange={onChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="12h">{t("items.time_format.12h")}</SelectItem>
            <SelectItem value="24h">{t("items.time_format.24h")}</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    // Notifications
    {
      key: "emailNotifications",
      label: t("items.email_notifications.label"),
      description: t("items.email_notifications.desc"),
      category: t("categories.notifications"),
      renderValue: (value, onChange) => (
        <div className="flex items-center gap-3">
          <Switch
            checked={value as boolean}
            onCheckedChange={onChange}
          />
          <span className="text-sm text-muted-foreground">
            {(value as boolean) ? t("items.sidebar_collapsed.enabled") : t("items.sidebar_collapsed.disabled")}
          </span>
        </div>
      ),
    },
    {
      key: "pushNotifications",
      label: t("items.push_notifications.label"),
      description: t("items.push_notifications.desc"),
      category: t("categories.notifications"),
      renderValue: (value, onChange) => (
        <div className="flex items-center gap-3">
          <Switch
            checked={value as boolean}
            onCheckedChange={onChange}
          />
          <span className="text-sm text-muted-foreground">
            {(value as boolean) ? t("items.sidebar_collapsed.enabled") : t("items.sidebar_collapsed.disabled")}
          </span>
        </div>
      ),
    },
    {
      key: "notificationSound",
      label: t("items.notification_sound.label"),
      description: t("items.notification_sound.desc"),
      category: t("categories.notifications"),
      renderValue: (value, onChange) => (
        <div className="flex items-center gap-3">
          <Switch
            checked={value as boolean}
            onCheckedChange={onChange}
          />
          <span className="text-sm text-muted-foreground">
            {(value as boolean) ? t("items.sidebar_collapsed.enabled") : t("items.sidebar_collapsed.disabled")}
          </span>
        </div>
      ),
    },
    // Affichage
    {
      key: "itemsPerPage",
      label: t("items.items_per_page.label"),
      description: t("items.items_per_page.desc"),
      category: t("categories.display"),
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
              {t("table.category")}
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
                title={isFiltered ? t("table.filter_tooltip") : t("table.filter_by", { category: row.original.category })}
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
              {t("table.preference")}
              <IconArrowsSort className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => {
          const isRecentlyModified = recentlyModified.has(row.original.key)
          const isSaving = savingPreference === row.original.key
          return (
            <div className="min-w-[200px] flex items-center gap-2">
              <span className="font-medium">{row.original.label}</span>
              {isSaving && (
                <IconLoader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
              {!isSaving && isRecentlyModified && (
                <Badge variant="outline" className="text-green-600 border-green-600 dark:text-green-400 dark:border-green-400 text-xs">
                  {t("table.modified")}
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
              {t("table.description")}
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
        header: t("table.value"),
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
    [recentlyModified, savingPreference, preferences, handleImmediateChange, categoryFilter, t]
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
                {t("2fa.title")}
              </CardTitle>
              <CardDescription>
                {t("2fa.description")}
              </CardDescription>
            </div>
            {twoFactorConfig?.is_enabled && (
              <Badge variant="default" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                {t("2fa.enabled_badge")}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading2FA ? (
            <div className="text-sm text-muted-foreground">{t("2fa.loading")}</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("2fa.status")}</Label>
                  <div className="text-sm text-muted-foreground">
                    {twoFactorConfig?.is_enabled
                      ? t("2fa.enabled")
                      : t("2fa.disabled")
                    }
                  </div>
                </div>
                <Switch
                  checked={twoFactorConfig?.is_enabled || false}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      handleSetupTotp()
                    } else {
                      setDisable2FADialogOpen(true)
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
                          {t("2fa.primary_method")}
                        </Label>
                        <div className="text-sm text-muted-foreground">
                          {twoFactorConfig.primary_method === "totp"
                            ? t("2fa.method_totp")
                            : t("2fa.method_sms")
                          }
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2">
                          <Key className="h-4 w-4" />
                          {t("2fa.backup_codes")}
                        </Label>
                        <div className="text-sm text-muted-foreground">
                          {t("2fa.backup_codes_count", { count: twoFactorConfig.backup_codes_count })}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRegenerateCodesDialogOpen(true)}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t("2fa.regenerate")}
                      </Button>
                    </div>
                  </div>

                  {twoFactorConfig.last_used_at && (
                    <Alert>
                      <AlertDescription>
                        {t("2fa.last_used", { date: new Date(twoFactorConfig.last_used_at).toLocaleString("fr-FR") })}
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
            placeholder={t("search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 w-full h-11"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <IconFilter className="h-4 w-4 text-muted-foreground" />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full md:w-[250px]">
              <SelectValue placeholder={t("filter")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filter")}</SelectItem>
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
              {t("clear_filter")}
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
                  {t("no_results")}
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
            const isSaving = savingPreference === pref.key
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
                        title={isFiltered ? t("table.filter_tooltip") : t("table.filter_by", { category: pref.category })}
                      >
                        {pref.category}
                        {isFiltered && <IconX className="h-3 w-3 ml-0.5" />}
                      </Button>
                    )
                  })()}
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm">{pref.label}</h4>
                    {isSaving && (
                      <IconLoader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                    {!isSaving && isRecentlyModified && (
                      <Badge variant="outline" className="text-green-600 border-green-600 dark:text-green-400 dark:border-green-400 text-xs">
                        {t("table.modified")}
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
            {t("no_results")}
          </div>
        )}
      </div>

      {/* Dialog de configuration TOTP */}
      <Dialog open={setupDialogOpen} onOpenChange={setSetupDialogOpen}>
        <DialogContent className="w-full sm:max-w-md lg:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("2fa.setup_dialog.title")}</DialogTitle>
            <DialogDescription>
              {t("2fa.setup_dialog.description")}
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
                {t("2fa.setup_dialog.manual_key")} <strong>{totpSecret}</strong>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="verification-code">{t("2fa.setup_dialog.verification_code")}</Label>
              <Input
                id="verification-code"
                placeholder={t("2fa.setup_dialog.verification_placeholder")}
                maxLength={6}
                inputMode="numeric"
                className="h-11"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
              />
              <p className="text-sm text-muted-foreground">
                {t("2fa.setup_dialog.verification_helper")}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupDialogOpen(false)}>
              {t("2fa.setup_dialog.cancel")}
            </Button>
            <Button onClick={handleEnable2FA}>
              {t("2fa.setup_dialog.activate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog des codes de secours */}
      <Dialog open={showBackupCodes} onOpenChange={setShowBackupCodes}>
        <DialogContent className="w-full sm:max-w-md lg:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("2fa.backup_dialog.title")}</DialogTitle>
            <DialogDescription>
              {t("2fa.backup_dialog.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>
                {t("2fa.backup_dialog.warning")}
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg font-mono text-xs sm:text-sm overflow-x-auto">
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
              {t("2fa.backup_dialog.download")}
            </Button>
            <Button variant="outline" onClick={() => setShowBackupCodes(false)}>
              {t("2fa.backup_dialog.saved")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog pour confirmer la désactivation de 2FA */}
      <AlertDialog open={disable2FADialogOpen} onOpenChange={setDisable2FADialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("2fa.confirm.disable_title") || "Désactiver l'authentification à deux facteurs ?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("2fa.confirm.disable")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("2fa.confirm.cancel") || "Annuler"}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDisable2FA}>
              {t("2fa.confirm.confirm") || "Confirmer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog pour confirmer la régénération des codes de secours */}
      <AlertDialog open={regenerateCodesDialogOpen} onOpenChange={setRegenerateCodesDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("2fa.confirm.regenerate_title") || "Régénérer les codes de secours ?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("2fa.confirm.regenerate")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("2fa.confirm.cancel") || "Annuler"}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRegenerateBackupCodes}>
              {t("2fa.confirm.confirm") || "Confirmer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
