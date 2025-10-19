"use client"

import * as React from "react"
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

  // === CORE Services Configuration ===

  // Cache (Redis)
  redis_host: z.string().optional(),
  redis_port: z.number().optional(),
  redis_db: z.number().optional(),
  redis_password: z.string().optional(),

  // Storage (S3/MinIO)
  storage_backend: z.enum(["local", "s3", "minio"]).optional(),
  s3_endpoint: z.string().optional(),
  s3_access_key: z.string().optional(),
  s3_secret_key: z.string().optional(),
  s3_bucket: z.string().optional(),
  s3_region: z.string().optional(),

  // Search (PostgreSQL/Elasticsearch/Meilisearch)
  search_backend: z.enum(["postgresql", "elasticsearch", "meilisearch"]).optional(),
  search_language: z.enum(["french", "english", "spanish"]).optional(),
  elasticsearch_url: z.string().optional(),
  typesense_api_key: z.string().optional(),
  typesense_host: z.string().optional(),

  // Audit Logs
  audit_retention_days: z.number().optional(),
  audit_log_level: z.enum(["DEBUG", "INFO", "WARNING", "ERROR"]).optional(),
  audit_enabled: z.boolean().optional(),

  // User Invitations
  invitation_expiry_days: z.number().min(1).max(365).optional(),
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
    mode: "onChange",
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
      // CORE Services
      redis_host: config.redis_host || "localhost",
      redis_port: config.redis_port || 6379,
      redis_db: config.redis_db || 0,
      redis_password: config.redis_password || "",
      storage_backend: (config.storage_backend || "local") as "local" | "s3" | "minio",
      s3_endpoint: config.s3_endpoint || "",
      s3_access_key: config.s3_access_key || "",
      s3_secret_key: config.s3_secret_key || "",
      s3_bucket: config.s3_bucket || "",
      s3_region: config.s3_region || "us-east-1",
      search_backend: (config.search_backend || "postgresql") as "postgresql" | "elasticsearch" | "meilisearch",
      search_language: (config.search_language || "french") as "french" | "english" | "spanish",
      elasticsearch_url: config.elasticsearch_url || "",
      typesense_api_key: config.typesense_api_key || "",
      typesense_host: config.typesense_host || "",
      audit_retention_days: config.audit_retention_days || 90,
      audit_log_level: (config.audit_log_level || "INFO") as "DEBUG" | "INFO" | "WARNING" | "ERROR",
      audit_enabled: config.audit_enabled ?? true,
      invitation_expiry_days: config.invitation_expiry_days || 7,
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
        // CORE Services
        redis_host: config.redis_host || "localhost",
        redis_port: config.redis_port || 6379,
        redis_db: config.redis_db || 0,
        redis_password: config.redis_password || "",
        storage_backend: (config.storage_backend || "local") as "local" | "s3" | "minio",
        s3_endpoint: config.s3_endpoint || "",
        s3_access_key: config.s3_access_key || "",
        s3_secret_key: config.s3_secret_key || "",
        s3_bucket: config.s3_bucket || "",
        s3_region: config.s3_region || "us-east-1",
        search_backend: (config.search_backend || "postgresql") as "postgresql" | "elasticsearch" | "meilisearch",
        search_language: (config.search_language || "french") as "french" | "english" | "spanish",
        elasticsearch_url: config.elasticsearch_url || "",
        typesense_api_key: config.typesense_api_key || "",
        typesense_host: config.typesense_host || "",
        audit_retention_days: config.audit_retention_days || 90,
        audit_log_level: (config.audit_log_level || "INFO") as "DEBUG" | "INFO" | "WARNING" | "ERROR",
        audit_enabled: config.audit_enabled ?? true,
        invitation_expiry_days: config.invitation_expiry_days || 7,
      })
    }
  }, [config, form, isInitialized])
  useEffect(() => {
    setIsInitialized(true)
  }, [])

  // Clean up "Modified" tags after 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const updated = new Map(recentlyModified)
      let hasChanges = false

      updated.forEach((timestamp, key) => {
        if (now - timestamp > 2000) { // 2 seconds
          updated.delete(key)
          hasChanges = true
        }
      })

      if (hasChanges) {
        setRecentlyModified(updated)
      }
    }, 100)

    return () => clearInterval(interval)
  }, [recentlyModified])

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
          // CORE Services
          redis_host: data.redis_host || null,
          redis_port: data.redis_port || null,
          redis_db: data.redis_db || null,
          redis_password: data.redis_password || null,
          storage_backend: data.storage_backend || null,
          s3_endpoint: data.s3_endpoint || null,
          s3_access_key: data.s3_access_key || null,
          s3_secret_key: data.s3_secret_key || null,
          s3_bucket: data.s3_bucket || null,
          s3_region: data.s3_region || null,
          search_backend: data.search_backend || null,
          search_language: data.search_language || null,
          elasticsearch_url: data.elasticsearch_url || null,
          typesense_api_key: data.typesense_api_key || null,
          typesense_host: data.typesense_host || null,
          audit_retention_days: data.audit_retention_days || null,
          audit_log_level: data.audit_log_level || null,
          audit_enabled: data.audit_enabled ?? null,
          invitation_expiry_days: data.invitation_expiry_days || null,
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

  // Handler for field blur - save only when user leaves the field
  const handleFieldBlur = useCallback((fieldName: string) => {
    if (!isInitialized) return

    // Mark as recently modified
    setRecentlyModified(prev => new Map(prev).set(fieldName, Date.now()))

    // Save immediately on blur
    saveSettings(form.getValues())
  }, [isInitialized, form, saveSettings])

  // Handler for field change - doesn't save, just marks as typing
  const handleFieldChange = useCallback((_fieldName: string) => {
    // Just tracking that a change occurred, actual save happens on blur
  }, [])

  // Helper to wrap Input with blur/change handlers
  const wrapInput = useCallback((fieldName: keyof z.infer<typeof formSchema>, input: React.ReactElement) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputProps = input.props as any
    return React.cloneElement(input, {
      ...inputProps,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        inputProps.onChange?.(e)
        handleFieldChange(fieldName)
      },
      onBlur: () => {
        inputProps.onBlur?.()
        handleFieldBlur(fieldName)
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur() // Trigger blur to save
        }
        inputProps.onKeyDown?.(e)
      },
    })
  }, [handleFieldChange, handleFieldBlur])

  const configItems: ConfigItem[] = useMemo(
    () => [
      // Application Configuration
      {
        key: "app_name",
        label: "Nom de l'application",
        description: "Le nom qui apparaîtra dans l'interface",
        category: "Application",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="app_name"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("app_name", <Input placeholder="OpsFlux" {...field} className="w-full md:w-[300px]" />)}
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
        category: "Application",
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
        category: "Application",
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
        category: "Application",
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
        category: "Application",
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
        category: "Entreprise",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="company_name"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("company_name", <Input placeholder="Mon entreprise" {...field} className="w-full md:w-[300px]" />)}
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
        category: "Entreprise",
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
        category: "Entreprise",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="company_tax_id"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  <FormControl>
                    {wrapInput("company_tax_id", <Input placeholder="FR123456789" {...field} className="w-full md:w-[300px]" />)}
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
        category: "Entreprise",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="company_address"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  <FormControl>
                    {wrapInput("company_address", <Input placeholder="123 Rue Example, Paris" {...field} className="w-full md:w-[300px]" />)}
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
        category: "Application",
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
        category: "Sécurité",
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
        category: "Sécurité",
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
        category: "Sécurité",
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
        category: "Sécurité",
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
        category: "Sécurité",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="sms_provider_account_sid"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("sms_provider_account_sid", <Input placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" {...field} className="w-full md:w-[300px]" />)}
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
        category: "Sécurité",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="sms_provider_auth_token"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("sms_provider_auth_token", <Input
                    type="password"
                    placeholder="••••••••••••••••••••••••"
                    {...field}
                    className="w-full md:w-[300px]"
                  />)}
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
        category: "Sécurité",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="sms_provider_phone_number"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("sms_provider_phone_number", <Input placeholder="+33123456789" {...field} className="w-full md:w-[300px]" />)}
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
        category: "Email",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="email_host"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("email_host", <Input placeholder="smtp.gmail.com" {...field} className="w-full md:w-[300px]" />)}
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
        category: "Email",
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
        category: "Email",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="email_username"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("email_username", <Input placeholder="votre@email.com" {...field} className="w-full md:w-[300px]" />)}
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
        category: "Email",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="email_password"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("email_password", <Input
                    type="password"
                    placeholder="••••••••••••••••"
                    {...field}
                    className="w-full md:w-[300px]"
                  />)}
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
        category: "Email",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="email_from"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("email_from", <Input placeholder="noreply@votre-domaine.com" {...field} className="w-full md:w-[300px]" />)}
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
        category: "Email",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="email_from_name"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("email_from_name", <Input placeholder="OpsFlux" {...field} className="w-full md:w-[300px]" />)}
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
        category: "Email",
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
        category: "Email",
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
        category: "Intranet",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="intranet_url"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("intranet_url", <Input placeholder="https://intranet.company.com/user/{user_id}" {...field} className="w-full md:w-[300px]" />)}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },

      // === CORE Services Configuration ===

      // Cache (Redis) - 4 fields
      {
        key: "redis_host",
        label: "Redis Host",
        description: "Hostname ou adresse IP du serveur Redis",
        category: "Cache (Redis)",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="redis_host"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("redis_host", <Input placeholder="localhost" {...field} className="w-full md:w-[300px]" />)}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "redis_port",
        label: "Redis Port",
        description: "Port du serveur Redis (par défaut: 6379)",
        category: "Cache (Redis)",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="redis_port"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="6379"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 6379)}
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
        key: "redis_db",
        label: "Redis DB",
        description: "Numéro de base de données Redis (0-15, par défaut: 0)",
        category: "Cache (Redis)",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="redis_db"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    max="15"
                    placeholder="0"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
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
        key: "redis_password",
        label: "Redis Password",
        description: "Mot de passe pour l'authentification Redis (optionnel)",
        category: "Cache (Redis)",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="redis_password"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("redis_password", <Input
                    type="password"
                    placeholder="••••••••"
                    {...field}
                    className="w-full md:w-[300px]"
                  />)}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },

      // Storage (S3/MinIO) - 6 fields
      {
        key: "storage_backend",
        label: "Backend de stockage",
        description: "Type de stockage pour les fichiers (local, S3, ou MinIO)",
        category: "Storage (S3/MinIO)",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="storage_backend"
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
                      <SelectItem value="local">Local</SelectItem>
                      <SelectItem value="s3">AWS S3</SelectItem>
                      <SelectItem value="minio">MinIO</SelectItem>
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
        key: "s3_endpoint",
        label: "S3/MinIO Endpoint",
        description: "URL de l'endpoint S3/MinIO (ex: https://s3.amazonaws.com ou http://minio:9000)",
        category: "Storage (S3/MinIO)",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="s3_endpoint"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("s3_endpoint", <Input placeholder="https://s3.amazonaws.com" {...field} className="w-full md:w-[300px]" />)}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "s3_access_key",
        label: "S3/MinIO Access Key",
        description: "Clé d'accès pour l'authentification S3/MinIO",
        category: "Storage (S3/MinIO)",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="s3_access_key"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("s3_access_key", <Input placeholder="AKIAIOSFODNN7EXAMPLE" {...field} className="w-full md:w-[300px]" />)}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "s3_secret_key",
        label: "S3/MinIO Secret Key",
        description: "Clé secrète pour l'authentification S3/MinIO",
        category: "Storage (S3/MinIO)",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="s3_secret_key"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("s3_secret_key", <Input
                    type="password"
                    placeholder="••••••••••••••••••••••••"
                    {...field}
                    className="w-full md:w-[300px]"
                  />)}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "s3_bucket",
        label: "S3/MinIO Bucket",
        description: "Nom du bucket S3/MinIO pour stocker les fichiers",
        category: "Storage (S3/MinIO)",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="s3_bucket"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("s3_bucket", <Input placeholder="my-app-bucket" {...field} className="w-full md:w-[300px]" />)}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "s3_region",
        label: "S3 Region",
        description: "Région AWS S3 (ex: us-east-1, eu-west-1)",
        category: "Storage (S3/MinIO)",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="s3_region"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("s3_region", <Input placeholder="us-east-1" {...field} className="w-full md:w-[300px]" />)}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },

      // Search - 5 fields
      {
        key: "search_backend",
        label: "Backend de recherche",
        description: "Moteur de recherche full-text (PostgreSQL, Elasticsearch, ou Meilisearch)",
        category: "Search",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="search_backend"
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
                      <SelectItem value="postgresql">PostgreSQL Full-Text</SelectItem>
                      <SelectItem value="elasticsearch">Elasticsearch</SelectItem>
                      <SelectItem value="meilisearch">Meilisearch</SelectItem>
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
        key: "search_language",
        label: "Langue de recherche",
        description: "Langue pour l'analyse et le stemming des textes",
        category: "Search",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="search_language"
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
                      <SelectItem value="french">Français</SelectItem>
                      <SelectItem value="english">English</SelectItem>
                      <SelectItem value="spanish">Español</SelectItem>
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
        key: "elasticsearch_url",
        label: "Elasticsearch URL",
        description: "URL de connexion à Elasticsearch (ex: http://localhost:9200)",
        category: "Search",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="elasticsearch_url"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("elasticsearch_url", <Input placeholder="http://elasticsearch:9200" {...field} className="w-full md:w-[300px]" />)}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "typesense_api_key",
        label: "Typesense API Key",
        description: "Clé API pour l'authentification Typesense",
        category: "Search",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="typesense_api_key"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("typesense_api_key", <Input
                    type="password"
                    placeholder="••••••••••••••••"
                    {...field}
                    className="w-full md:w-[300px]"
                  />)}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "typesense_host",
        label: "Typesense Host",
        description: "Hostname du serveur Typesense (ex: typesense:8108)",
        category: "Search",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="typesense_host"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  {wrapInput("typesense_host", <Input placeholder="typesense:8108" {...field} className="w-full md:w-[300px]" />)}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },

      // Audit - 3 fields
      {
        key: "audit_retention_days",
        label: "Rétention des logs d'audit",
        description: "Nombre de jours de conservation des logs d'audit (par défaut: 90)",
        category: "Audit",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="audit_retention_days"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    placeholder="90"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 90)}
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
        key: "audit_log_level",
        label: "Niveau de log",
        description: "Niveau de détail des logs d'audit (DEBUG, INFO, WARNING, ERROR)",
        category: "Audit",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="audit_log_level"
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
                      <SelectItem value="DEBUG">DEBUG</SelectItem>
                      <SelectItem value="INFO">INFO</SelectItem>
                      <SelectItem value="WARNING">WARNING</SelectItem>
                      <SelectItem value="ERROR">ERROR</SelectItem>
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
        key: "audit_enabled",
        label: "Activer l'audit",
        description: "Activer ou désactiver les logs d'audit système",
        category: "Audit",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="audit_enabled"
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

      // User Invitations - 1 field
      {
        key: "invitation_expiry_days",
        label: "Durée de validité des invitations",
        description: "Nombre de jours de validité d'une invitation utilisateur (par défaut: 7)",
        category: "Invitations utilisateurs",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="invitation_expiry_days"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    max="365"
                    placeholder="7"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 7)}
                    className="w-full md:w-[300px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
    ],
    [wrapInput]
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
    [form, recentlyModified, categoryFilter]
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
      <div className="space-y-6">
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
                        <Button
                          variant={isFiltered ? "default" : "secondary"}
                          size="sm"
                          className="h-6 text-xs px-2 cursor-pointer transition-colors gap-1.5"
                          onClick={() => setCategoryFilter(isFiltered ? "all" : item.category)}
                          title={isFiltered ? "Cliquer pour retirer le filtre" : `Filtrer par ${item.category}`}
                        >
                          {item.category}
                          {isFiltered && <IconX className="h-3 w-3 ml-0.5" />}
                        </Button>
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
    </Form>
  )
}
