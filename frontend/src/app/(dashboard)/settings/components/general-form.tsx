"use client"

import * as z from "zod"
import { useForm } from "react-hook-form"
import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { IconHome, IconId, IconMessage2Question, IconShield, IconSearch, IconFilter, IconArrowsSort, IconX } from "@tabler/icons-react"
import { zodResolver } from "@hookform/resolvers/zod"
import Image from "next/image"
import Link from "next/link"
import { useAppConfig } from "@/contexts/app-config-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DeleteActions } from "./delete-actions"
import { themes } from "@/config/themes"

const formSchema = z.object({
  // Application Settings
  app_name: z.string().min(1, {
    message: "Le nom de l'application est requis.",
  }),
  app_logo: z
    .instanceof(File)
    .refine(
      (file) =>
        ["image/webp", "image/jpeg", "image/png", "image/svg+xml"].includes(
          file.type
        ),
      {
        message: "Seuls les fichiers WebP, JPEG, PNG ou SVG sont autorisés",
      }
    )
    .optional(),
  default_theme: z.string({
    required_error: "Le thème par défaut est requis.",
  }),
  default_language: z.string({
    required_error: "La langue par défaut est requise.",
  }),
  font: z.string({
    required_error: "La police est requise.",
  }),

  // Company Settings
  company_name: z.string().optional(),
  company_logo: z
    .instanceof(File)
    .refine(
      (file) =>
        ["image/webp", "image/jpeg", "image/png", "image/svg+xml"].includes(
          file.type
        ),
      {
        message: "Seuls les fichiers WebP, JPEG, PNG ou SVG sont autorisés",
      }
    )
    .optional(),
  company_tax_id: z.string().optional(),
  company_address: z.string().optional(),

  // 2FA & Security Settings
  auto_save_delay_seconds: z.number().min(1).max(60),
  twofa_max_attempts: z.number().min(1).max(10),
  twofa_sms_timeout_minutes: z.number().min(1).max(60),
  twofa_sms_rate_limit: z.number().min(1).max(20),
  sms_provider: z.enum(["twilio", "bulksms", "ovh", "messagebird", "vonage"]),
  sms_provider_account_sid: z.string().optional(),
  sms_provider_auth_token: z.string().optional(),
  sms_provider_phone_number: z.string().optional(),

  // Email Settings
  email_host: z.string().optional(),
  email_port: z.number().optional(),
  email_username: z.string().optional(),
  email_password: z.string().optional(),
  email_from: z.string().email().optional().or(z.literal("")),
  email_from_name: z.string().optional(),
  email_use_tls: z.boolean(),
  email_use_ssl: z.boolean(),

  // Intranet Settings
  intranet_url: z.string().optional(),
})

interface ConfigItem {
  key: keyof z.infer<typeof formSchema>
  label: string
  description: string
  category: string
  renderField: (form: ReturnType<typeof useForm<z.infer<typeof formSchema>>>) => React.ReactNode
}

export default function GeneralForm() {
  const { config, refetch } = useAppConfig()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      app_name: config.app_name || "OpsFlux",
      default_theme: config.default_theme || "amethyst-haze",
      default_language: config.default_language || "fr",
      font: config.font || "inter",
      company_name: config.company_name || "",
      company_tax_id: config.company_tax_id || "",
      company_address: config.company_address || "",
      auto_save_delay_seconds: config.auto_save_delay_seconds || 3,
      twofa_max_attempts: config.twofa_max_attempts || 3,
      twofa_sms_timeout_minutes: config.twofa_sms_timeout_minutes || 10,
      twofa_sms_rate_limit: config.twofa_sms_rate_limit || 5,
      sms_provider: (config.sms_provider || "twilio") as "twilio" | "bulksms" | "ovh" | "messagebird" | "vonage",
      sms_provider_account_sid: config.sms_provider_account_sid || "",
      sms_provider_auth_token: config.sms_provider_auth_token || "",
      sms_provider_phone_number: config.sms_provider_phone_number || "",
      email_host: config.email_host || "",
      email_port: config.email_port || 587,
      email_username: config.email_username || "",
      email_password: config.email_password || "",
      email_from: config.email_from || "",
      email_from_name: config.email_from_name || "",
      email_use_tls: config.email_use_tls ?? true,
      email_use_ssl: config.email_use_ssl ?? false,
      intranet_url: config.intranet_url || "",
    },
  })

  // Track modified fields (like preferences-tab)
  const [recentlyModified, setRecentlyModified] = useState<Map<string, number>>(new Map())
  const [isInitialized, setIsInitialized] = useState(false)
  const hasInitialized = useRef(false)

  // Search and filter states
  const [globalFilter, setGlobalFilter] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")

  // Update form when config changes (only on initial mount)
  useEffect(() => {
    if (!hasInitialized.current && isInitialized) {
      hasInitialized.current = true
      form.reset({
        app_name: config.app_name || "OpsFlux",
        default_theme: config.default_theme || "amethyst-haze",
        default_language: config.default_language || "fr",
        font: config.font || "inter",
        company_name: config.company_name || "",
        company_tax_id: config.company_tax_id || "",
        company_address: config.company_address || "",
        auto_save_delay_seconds: config.auto_save_delay_seconds || 3,
        twofa_max_attempts: config.twofa_max_attempts || 3,
        twofa_sms_timeout_minutes: config.twofa_sms_timeout_minutes || 10,
        twofa_sms_rate_limit: config.twofa_sms_rate_limit || 5,
        sms_provider: (config.sms_provider || "twilio") as "twilio" | "bulksms" | "ovh" | "messagebird" | "vonage",
        sms_provider_account_sid: config.sms_provider_account_sid || "",
        sms_provider_auth_token: config.sms_provider_auth_token || "",
        sms_provider_phone_number: config.sms_provider_phone_number || "",
        email_host: config.email_host || "",
        email_port: config.email_port || 587,
        email_username: config.email_username || "",
        email_password: config.email_password || "",
        email_from: config.email_from || "",
        email_from_name: config.email_from_name || "",
        email_use_tls: config.email_use_tls ?? true,
        email_use_ssl: config.email_use_ssl ?? false,
        intranet_url: config.intranet_url || "",
      })
    }
  }, [config, form, isInitialized])
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setIsInitialized(true)
  }, [])

  // Clean up "Modified" tags when save completes
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const updated = new Map(recentlyModified)
      let hasChanges = false
      const maxDelay = Math.min(config.auto_save_delay_seconds || 3, 5) * 1000

      updated.forEach((timestamp, key) => {
        if (now - timestamp > maxDelay) {
          updated.delete(key)
          hasChanges = true
        }
      })

      if (hasChanges) {
        setRecentlyModified(updated)
      }
    }, 100) // Check every 100ms for more precision

    return () => clearInterval(interval)
  }, [recentlyModified, config.auto_save_delay_seconds])

  // Save function (immediate save like preferences)
  const saveSettings = useCallback(async (data: z.infer<typeof formSchema>) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/settings/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          app_name: data.app_name,
          default_theme: data.default_theme,
          default_language: data.default_language,
          font: data.font,
          company_name: data.company_name,
          company_tax_id: data.company_tax_id,
          company_address: data.company_address,
          auto_save_delay_seconds: data.auto_save_delay_seconds,
          twofa_max_attempts: data.twofa_max_attempts,
          twofa_sms_timeout_minutes: data.twofa_sms_timeout_minutes,
          twofa_sms_rate_limit: data.twofa_sms_rate_limit,
          sms_provider: data.sms_provider,
          sms_provider_account_sid: data.sms_provider_account_sid || null,
          sms_provider_auth_token: data.sms_provider_auth_token || null,
          sms_provider_phone_number: data.sms_provider_phone_number || null,
          email_host: data.email_host || null,
          email_port: data.email_port || null,
          email_username: data.email_username || null,
          email_password: data.email_password || null,
          email_from: data.email_from || null,
          email_from_name: data.email_from_name || null,
          email_use_tls: data.email_use_tls,
          email_use_ssl: data.email_use_ssl,
          intranet_url: data.intranet_url || null,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save settings')
      }

      await refetch()
    } catch {
      // Silently fail - user can retry by making another change
    }
  }, [refetch])

  // Watch for field changes with delay
  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
      if (!isInitialized || !name) return

      // Only track changes from actual user input, not from filtering/rendering
      if (type !== 'change') return

      // Clear existing timer
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

      // Mark as recently modified immediately
      setRecentlyModified(prev => new Map(prev).set(name, Date.now()))

      // Start save timer with configured delay
      const delay = (config.auto_save_delay_seconds || 3) * 1000
      saveTimerRef.current = setTimeout(() => {
        saveSettings(form.getValues())
      }, delay)
    })
    return () => subscription.unsubscribe()
  }, [form, isInitialized, config.auto_save_delay_seconds, saveSettings])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const configItems: ConfigItem[] = useMemo(
    () => [
      // Application Configuration
      {
        key: "app_name",
        label: "Nom de l'application",
        description: "Le nom qui apparaîtra dans l'interface",
        category: "Configuration de l'application",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="app_name"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input placeholder="OpsFlux" {...field} className="w-full md:w-[300px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "app_logo",
        label: "Logo de l'application",
        description: "Logo affiché dans la barre latérale",
        category: "Configuration de l'application",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="app_logo"
            render={({ field: { value, onChange, ...fieldProps } }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  {value && value instanceof File && (
                    <Image
                      alt="app-logo"
                      width={35}
                      height={35}
                      className="h-[35px] w-[35px] rounded-md object-cover"
                      src={URL.createObjectURL(value)}
                    />
                  )}
                  <FormControl>
                    <Input
                      {...fieldProps}
                      type="file"
                      placeholder="Logo"
                      accept="image/webp,image/jpeg,image/png,image/svg+xml"
                      onChange={(event) =>
                        onChange(event.target.files && event.target.files[0])
                      }
                      className="w-full md:w-[300px]"
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "default_theme",
        label: "Thème par défaut",
        description: "Thème de couleur par défaut pour tous les utilisateurs",
        category: "Configuration de l'application",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="default_theme"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <SelectTrigger className="w-full md:w-[300px]">
                      <SelectValue placeholder="Sélectionner un thème" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(themes).map(([key, theme]) => (
                        <SelectItem key={key} value={key}>
                          {theme.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "default_language",
        label: "Langue par défaut",
        description: "Langue par défaut de l'interface",
        category: "Configuration de l'application",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="default_language"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <SelectTrigger className="w-full md:w-[300px]">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fr">Français</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "font",
        label: "Police système",
        description: "Police utilisée dans l'interface",
        category: "Configuration de l'application",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="font"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <SelectTrigger className="w-full md:w-[300px]">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inter">Inter</SelectItem>
                      <SelectItem value="manrope">Manrope</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      // Company Configuration
      {
        key: "company_name",
        label: "Nom de l'entreprise",
        description: "Nom de votre entreprise",
        category: "Configuration de l'entreprise",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="company_name"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input placeholder="Mon entreprise" {...field} className="w-full md:w-[300px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "company_logo",
        label: "Logo de l'entreprise",
        description: "Logo de votre entreprise",
        category: "Configuration de l'entreprise",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="company_logo"
            render={({ field: { value, onChange, ...fieldProps } }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  {value && value instanceof File && (
                    <Image
                      alt="company-logo"
                      width={35}
                      height={35}
                      className="h-[35px] w-[35px] rounded-md object-cover"
                      src={URL.createObjectURL(value)}
                    />
                  )}
                  <FormControl>
                    <Input
                      {...fieldProps}
                      type="file"
                      placeholder="Logo entreprise"
                      accept="image/webp,image/jpeg,image/png,image/svg+xml"
                      onChange={(event) =>
                        onChange(event.target.files && event.target.files[0])
                      }
                      className="w-full md:w-[300px]"
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "company_tax_id",
        label: "Numéro d'identification fiscale",
        description: "Numéro fiscal de l'entreprise",
        category: "Configuration de l'entreprise",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="company_tax_id"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  <FormControl>
                    <Input placeholder="FR123456789" {...field} className="w-full md:w-[300px]" />
                  </FormControl>
                  <Badge variant="outline" className="py-2">
                    <IconId size={20} strokeWidth={1.5} />
                  </Badge>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "company_address",
        label: "Adresse de l'entreprise",
        description: "Adresse complète de l'entreprise",
        category: "Configuration de l'entreprise",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="company_address"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  <FormControl>
                    <Input placeholder="123 Rue Example, Paris" {...field} className="w-full md:w-[300px]" />
                  </FormControl>
                  <Badge variant="outline" className="py-2">
                    <IconHome size={20} strokeWidth={1.5} />
                  </Badge>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "auto_save_delay_seconds",
        label: "Délai d'auto-sauvegarde",
        description: "Temps en secondes avant l'enregistrement automatique",
        category: "Configuration de l'application",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="auto_save_delay_seconds"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    placeholder="3"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                    className="w-full md:w-[300px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      // 2FA & Security Settings
      {
        key: "twofa_max_attempts",
        label: "Nombre max de tentatives 2FA",
        description: "Nombre maximum de tentatives de vérification 2FA",
        category: "Paramètres 2FA",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="twofa_max_attempts"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      placeholder="3"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                      className="w-full md:w-[300px]"
                    />
                  </FormControl>
                  <Badge variant="outline" className="py-2">
                    <IconShield size={20} strokeWidth={1.5} />
                  </Badge>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "twofa_sms_timeout_minutes",
        label: "Timeout code SMS (minutes)",
        description: "Durée de validité d'un code SMS en minutes",
        category: "Paramètres 2FA",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="twofa_sms_timeout_minutes"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    placeholder="10"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                    className="w-full md:w-[300px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "twofa_sms_rate_limit",
        label: "Limite SMS par heure",
        description: "Nombre maximum de SMS envoyés par heure et par utilisateur",
        category: "Paramètres 2FA",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="twofa_sms_rate_limit"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    placeholder="5"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                    className="w-full md:w-[300px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "sms_provider",
        label: "Fournisseur SMS",
        description: "Fournisseur SMS pour l'envoi des codes 2FA",
        category: "Paramètres 2FA",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="sms_provider"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <SelectTrigger className="w-full md:w-[300px]">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="twilio">Twilio</SelectItem>
                      <SelectItem value="bulksms">BulkSMS</SelectItem>
                      <SelectItem value="ovh">OVH</SelectItem>
                      <SelectItem value="messagebird">MessageBird</SelectItem>
                      <SelectItem value="vonage">Vonage</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "sms_provider_account_sid",
        label: "Account SID / API Key",
        description: "Identifiant du compte SMS (Account SID pour Twilio, API Key pour autres)",
        category: "Paramètres 2FA",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="sms_provider_account_sid"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" {...field} className="w-full md:w-[300px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "sms_provider_auth_token",
        label: "Auth Token / API Secret",
        description: "Token d'authentification ou secret API du fournisseur SMS",
        category: "Paramètres 2FA",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="sms_provider_auth_token"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="••••••••••••••••••••••••"
                    {...field}
                    className="w-full md:w-[300px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "sms_provider_phone_number",
        label: "Numéro de téléphone émetteur",
        description: "Numéro de téléphone utilisé pour l'envoi des SMS (format international)",
        category: "Paramètres 2FA",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="sms_provider_phone_number"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input placeholder="+33123456789" {...field} className="w-full md:w-[300px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      // Email Configuration
      {
        key: "email_host",
        label: "Serveur SMTP",
        description: "Adresse du serveur SMTP (ex: smtp.gmail.com)",
        category: "Configuration Email",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="email_host"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input placeholder="smtp.gmail.com" {...field} className="w-full md:w-[300px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "email_port",
        label: "Port SMTP",
        description: "Port du serveur SMTP (587 pour TLS, 465 pour SSL, 25 pour non sécurisé)",
        category: "Configuration Email",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="email_port"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="587"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 587)}
                    className="w-full md:w-[300px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "email_username",
        label: "Nom d'utilisateur SMTP",
        description: "Nom d'utilisateur pour l'authentification SMTP",
        category: "Configuration Email",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="email_username"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input placeholder="votre@email.com" {...field} className="w-full md:w-[300px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "email_password",
        label: "Mot de passe SMTP",
        description: "Mot de passe ou token d'application pour l'authentification SMTP",
        category: "Configuration Email",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="email_password"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="••••••••••••••••"
                    {...field}
                    className="w-full md:w-[300px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "email_from",
        label: "Email expéditeur",
        description: "Adresse email utilisée comme expéditeur",
        category: "Configuration Email",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="email_from"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input placeholder="noreply@votre-domaine.com" {...field} className="w-full md:w-[300px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "email_from_name",
        label: "Nom de l'expéditeur",
        description: "Nom affiché comme expéditeur des emails",
        category: "Configuration Email",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="email_from_name"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input placeholder="OpsFlux" {...field} className="w-full md:w-[300px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "email_use_tls",
        label: "Utiliser TLS",
        description: "Activer le chiffrement TLS (recommandé pour port 587)",
        category: "Configuration Email",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="email_use_tls"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Select
                    onValueChange={(value) => field.onChange(value === "true")}
                    value={field.value ? "true" : "false"}
                  >
                    <SelectTrigger className="w-full md:w-[300px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Activé</SelectItem>
                      <SelectItem value="false">Désactivé</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "email_use_ssl",
        label: "Utiliser SSL",
        description: "Activer le chiffrement SSL (recommandé pour port 465)",
        category: "Configuration Email",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="email_use_ssl"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Select
                    onValueChange={(value) => field.onChange(value === "true")}
                    value={field.value ? "true" : "false"}
                  >
                    <SelectTrigger className="w-full md:w-[300px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Activé</SelectItem>
                      <SelectItem value="false">Désactivé</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      // Intranet Configuration
      {
        key: "intranet_url",
        label: "URL Intranet",
        description: "URL de l'intranet avec placeholder {user_id} pour l'identifiant utilisateur",
        category: "Configuration Intranet",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="intranet_url"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input placeholder="https://intranet.company.com/user/{user_id}" {...field} className="w-full md:w-[300px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
    ],
    []
  )

  const columns = useMemo<ColumnDef<ConfigItem>[]>(
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
              <Badge
                variant={isFiltered ? "default" : "secondary"}
                className="text-xs cursor-pointer hover:bg-secondary/80 transition-colors flex items-center gap-1.5"
                onClick={() => setCategoryFilter(isFiltered ? "all" : row.original.category)}
                title={isFiltered ? "Retirer le filtre" : `Filtrer par ${row.original.category}`}
              >
                {row.original.category}
                {isFiltered && <IconX className="h-3 w-3" />}
              </Badge>
            </div>
          )
        },
        filterFn: (row, id, value) => {
          return value === "all" || row.getValue(id) === value
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
              Paramètre
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
        cell: ({ row }) => (
          <div className="min-w-[250px]">
            {row.original.renderField(form)}
          </div>
        ),
      },
    ],
    [form, recentlyModified]
  )

  // Get all unique categories
  const categories = useMemo(() => {
    const cats = Array.from(new Set(configItems.map(item => item.category)))
    return ["all", ...cats]
  }, [configItems])

  // Filter config items based on search and category
  const filteredConfigItems = useMemo(() => {
    return configItems.filter(item => {
      const matchesSearch =
        item.label.toLowerCase().includes(globalFilter.toLowerCase()) ||
        item.description.toLowerCase().includes(globalFilter.toLowerCase())

      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter

      return matchesSearch && matchesCategory
    })
  }, [configItems, globalFilter, categoryFilter])

  // Create table instance for the unified view
  const table = useReactTable({
    data: filteredConfigItems,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
  })

  return (
    <Form {...form}>
      <div className="flex w-full flex-col items-start justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-center">
        <div className="flex flex-col items-start text-sm">
          <p className="font-bold tracking-wide">
            Votre application est actuellement sur le plan gratuit
          </p>
          <p className="text-muted-foreground font-medium">
            Les plans payants offrent des limites d&apos;utilisation plus élevées, des branches supplémentaires et bien plus encore. En savoir plus{" "}
            <Link href="" className="underline">
              ici
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary">
            <IconMessage2Question />
            Nous contacter
          </Button>
          <Button variant="outline">Mettre à niveau</Button>
        </div>
      </div>

      <div className="space-y-6 py-8">
        {/* Search and Filter Bar */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="relative flex-1 w-full">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un paramètre..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
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
                    Aucun paramètre ne correspond à votre recherche.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile View - Cards */}
        <div className="md:hidden space-y-3">
          {filteredConfigItems.length > 0 ? (
            filteredConfigItems.map((item) => {
              const isRecentlyModified = recentlyModified.has(item.key)
              return (
                <div
                  key={item.key}
                  className={`rounded-lg border p-4 space-y-3 ${
                    isRecentlyModified
                      ? "bg-green-50 dark:bg-green-950/10 border-green-200 dark:border-green-900"
                      : ""
                  }`}
                >
                  <div className="space-y-2">
                    {(() => {
                      const isFiltered = categoryFilter === item.category
                      return (
                        <Badge
                          variant={isFiltered ? "default" : "secondary"}
                          className="text-xs cursor-pointer hover:bg-secondary/80 transition-colors flex items-center gap-1.5 w-fit"
                          onClick={() => setCategoryFilter(isFiltered ? "all" : item.category)}
                          title={isFiltered ? "Retirer le filtre" : `Filtrer par ${item.category}`}
                        >
                          {item.category}
                          {isFiltered && <IconX className="h-3 w-3" />}
                        </Badge>
                      )
                    })()}
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-sm">{item.label}</h4>
                      {isRecentlyModified && (
                        <Badge variant="outline" className="text-green-600 border-green-600 dark:text-green-400 dark:border-green-400 text-xs">
                          Modifié
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <div className="pt-2">
                    {item.renderField(form)}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Aucun paramètre ne correspond à votre recherche.
            </div>
          )}
        </div>
      </div>

      <div className="mt-10 mb-4 flex w-full flex-col items-start justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-center">
        <div className="flex flex-col items-start text-sm">
          <p className="font-bold tracking-wide">Supprimer le compte</p>
          <p className="text-muted-foreground font-medium">
            Vous pouvez désactiver votre compte pour faire une pause.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DeleteActions />
        </div>
      </div>
    </Form>
  )
}
