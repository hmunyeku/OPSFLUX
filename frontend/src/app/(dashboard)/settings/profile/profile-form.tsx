"use client"

import { useState, useEffect } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ProfileAvatar } from "@/components/profile-avatar"
import { useAuth } from "@/hooks/use-auth"
import { api, UserUpdate, PasswordPolicy } from "@/lib/api"
import { auth } from "@/lib/auth"
import { useToast } from "@/hooks/use-toast"
import { useAppConfig } from "@/contexts/app-config-context"
import { useTranslation } from "@/hooks/use-translation"
import { Lock, CheckCircle2, XCircle, AlertCircle, Plus, X, ExternalLink, User, Mail, Phone, Building, Calendar, FileSignature, Shield, Clock, Activity, Key, Users } from "lucide-react"
import { PhoneInput } from "@/components/ui/phone-input"
import { SignatureInput } from "@/components/ui/signature-input"
import { UserAddressesCard } from "./components/user-addresses-card"
import { DeleteActions } from "../components/delete-actions"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { showLoadError } from "@/lib/toast-helpers"

// Function to create form schema with translations
const createAccountFormSchema = (t: (key: string) => string) => z.object({
  first_name: z
    .string()
    .min(2, {
      message: t("validation.first_name_min"),
    })
    .max(100, {
      message: t("validation.first_name_max"),
    })
    .optional(),
  last_name: z
    .string()
    .min(2, {
      message: t("validation.last_name_min"),
    })
    .max(100, {
      message: t("validation.last_name_max"),
    })
    .optional(),
  initials: z
    .string()
    .max(10, {
      message: t("validation.initials_max"),
    })
    .optional(),
  email: z
    .string({
      required_error: t("validation.email_required"),
    })
    .email(t("validation.email_invalid", "Adresse email invalide")),
  recovery_email: z
    .string()
    .email(t("validation.recovery_email_invalid", "Email de récupération invalide"))
    .optional()
    .or(z.literal("")),
  avatar_url: z.string().nullable().optional(),
  phone_numbers: z.array(z.string()).optional(),
  intranet_identifier: z.string().max(255).optional().or(z.literal("")),
  civility: z.string().max(10).optional().or(z.literal("")),
  birth_date: z.string().optional().or(z.literal("")),
  extension: z.string().max(20).optional().or(z.literal("")),
  signature: z.string().max(500).optional().or(z.literal("")),
  signature_image: z.string().optional().nullable(),
})

type AccountFormValues = {
  first_name?: string
  last_name?: string
  initials?: string
  email: string
  recovery_email?: string
  avatar_url?: string | null
  phone_numbers?: string[]
  intranet_identifier?: string
  civility?: string
  birth_date?: string
  extension?: string
  signature?: string
  signature_image?: string | null
}

interface PasswordStrength {
  score: number
  label: string
  color: string
}

interface UserRbacInfo {
  roles: Array<{
    id: string
    name: string
    description?: string
  }>
  groups: Array<{
    id: string
    name: string
    description?: string
  }>
  permissions: string[]
}

interface UserStats {
  total_logins?: number
  last_login?: string
  created_at?: string
  updated_at?: string
}

export function AccountForm() {
  const { t } = useTranslation("core.profile")
  const { user, isLoading, refreshUser } = useAuth()
  const { config } = useAppConfig()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Password change states
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy | null>(null)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>({ score: 0, label: "weak", color: "red" })
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // RBAC info states
  const [rbacInfo, setRbacInfo] = useState<UserRbacInfo | null>(null)
  const [stats, setStats] = useState<UserStats>({})
  const [loadingRbac, setLoadingRbac] = useState(true)

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(createAccountFormSchema(t)),
    mode: "onChange",
    defaultValues: {
      first_name: "",
      last_name: "",
      initials: "",
      email: "",
      recovery_email: "",
      avatar_url: null,
      phone_numbers: [],
      intranet_identifier: "",
      civility: "",
      birth_date: "",
      extension: "",
      signature: "",
      signature_image: null,
    },
  })

  // State for phone numbers management
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([])
  const [newPhone, setNewPhone] = useState("")

  // Load user data when available
  useEffect(() => {
    if (user) {
      form.reset({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        initials: user.initials || "",
        email: user.email || "",
        recovery_email: user.recovery_email || "",
        avatar_url: user.avatar_url || null,
        phone_numbers: user.phone_numbers || [],
        intranet_identifier: user.intranet_identifier || "",
        civility: user.civility || "",
        birth_date: user.birth_date || "",
        extension: user.extension || "",
        signature: user.signature || "",
        signature_image: user.signature_image || null,
      })
      setPhoneNumbers(user.phone_numbers || [])
    }
  }, [user, form])

  useEffect(() => {
    fetchPasswordPolicy()
    loadRbacInfo()
  }, [])

  useEffect(() => {
    if (newPassword && passwordPolicy) {
      setPasswordStrength(calculatePasswordStrength(newPassword, passwordPolicy))
    } else {
      setPasswordStrength({ score: 0, label: "weak", color: "red" })
    }
  }, [newPassword, passwordPolicy])

  const fetchPasswordPolicy = async () => {
    try {
      const token = auth.getToken()
      if (!token) return

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/security/password-policy`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (response.ok) {
        const data = await response.json()
        setPasswordPolicy(data)
      }
    } catch (_error) {
      // Silently fail
    }
  }

  const loadRbacInfo = async () => {
    try {
      setLoadingRbac(true)
      const token = auth.getToken()
      if (!token) {
        setLoadingRbac(false)
        return
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me?with_rbac=true`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setRbacInfo({
          roles: data.roles || [],
          groups: data.groups || [],
          permissions: data.permissions || [],
        })
        setStats({
          total_logins: data.total_logins,
          last_login: data.last_login,
          created_at: data.created_at,
          updated_at: data.updated_at,
        })
      }
    } catch (error) {
      console.error("Failed to load RBAC info:", error)
      showLoadError(t("rbac.title", "les informations RBAC"), loadRbacInfo)
    } finally {
      setLoadingRbac(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "-"
    return new Date(dateString).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const calculatePasswordStrength = (password: string, policy: PasswordPolicy): PasswordStrength => {
    let score = 0
    const checks = {
      length: password.length >= policy.min_length,
      uppercase: !policy.require_uppercase || /[A-Z]/.test(password),
      lowercase: !policy.require_lowercase || /[a-z]/.test(password),
      digit: !policy.require_digit || /[0-9]/.test(password),
      special: !policy.require_special || new RegExp(`[${policy.special_chars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(password),
    }

    // Count passed checks
    if (checks.length) score++
    if (checks.uppercase) score++
    if (checks.lowercase) score++
    if (checks.digit) score++
    if (checks.special) score++

    // Additional points for length
    if (password.length >= policy.min_length + 4) score++
    if (password.length >= policy.min_length + 8) score++

    if (score <= 3) {
      return { score, label: t("password.strength_weak"), color: "red" }
    } else if (score <= 5) {
      return { score, label: t("password.strength_medium"), color: "orange" }
    } else {
      return { score, label: t("password.strength_strong"), color: "green" }
    }
  }

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: t("toast.fields_required"),
        description: t("toast.fields_required_desc"),
        variant: "destructive",
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: t("toast.password_mismatch"),
        description: t("toast.password_mismatch_desc"),
        variant: "destructive",
      })
      return
    }

    if (passwordStrength.score <= 3) {
      toast({
        title: t("toast.password_weak"),
        description: t("toast.password_weak_desc"),
        variant: "destructive",
      })
      return
    }

    setIsChangingPassword(true)

    try {
      const token = auth.getToken()
      if (!token) {
        toast({
          title: t("toast.error"),
          description: t("toast.error_auth"),
          variant: "destructive",
        })
        setIsChangingPassword(false)
        return
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })

      if (response.ok) {
        toast({
          title: t("toast.password_changed"),
          description: t("toast.password_changed_desc"),
        })
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
      } else {
        const error = await response.json()
        toast({
          title: t("toast.error"),
          description: error.detail || t("toast.error_password"),
          variant: "destructive",
        })
      }
    } catch (_error) {
      toast({
        title: t("toast.error"),
        description: t("toast.error_generic"),
        variant: "destructive",
      })
    } finally {
      setIsChangingPassword(false)
    }
  }

  const addPhoneNumber = () => {
    if (newPhone.trim() && !phoneNumbers.includes(newPhone.trim())) {
      const updatedPhones = [...phoneNumbers, newPhone.trim()]
      setPhoneNumbers(updatedPhones)
      form.setValue("phone_numbers", updatedPhones)
      setNewPhone("")
    }
  }

  const removePhoneNumber = (index: number) => {
    const updatedPhones = phoneNumbers.filter((_, i) => i !== index)
    setPhoneNumbers(updatedPhones)
    form.setValue("phone_numbers", updatedPhones)
  }

  async function onSubmit(data: AccountFormValues) {
    setIsSubmitting(true)
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

      // Générer automatiquement le nom complet à partir du prénom et du nom
      const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ").trim() || undefined

      const updateData: UserUpdate = {
        full_name: fullName,
        first_name: data.first_name,
        last_name: data.last_name,
        initials: data.initials,
        email: data.email,
        recovery_email: data.recovery_email || undefined,
        avatar_url: data.avatar_url,
        phone_numbers: phoneNumbers,
        intranet_identifier: data.intranet_identifier || undefined,
        civility: data.civility || undefined,
        birth_date: data.birth_date || undefined,
        extension: data.extension || undefined,
        signature: data.signature || undefined,
        signature_image: data.signature_image || undefined,
      }

      await api.updateMe(token, updateData)

      toast({
        title: t("toast.profile_updated"),
        description: t("toast.profile_updated_desc"),
      })

      // Refresh user data without full page reload
      await refreshUser()
    } catch (error: unknown) {
      // Extract error message from API response
      let errorMessage = t("toast.error_update", "Erreur lors de la mise à jour")

      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === "object" && error !== null) {
        // Try to extract detail from API error response
        const apiError = error as any
        errorMessage = apiError.response?.data?.detail || apiError.detail || apiError.message || t("toast.error_update", "Erreur lors de la mise à jour")
      }

      toast({
        title: t("toast.error"),
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <div className="space-y-4">{t("loading", "Chargement...")}</div>
  }

  return (
    <div className="space-y-6">
      {/* Profile Header with Stats */}
      <Card className="border-primary/20">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Avatar Section */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <ProfileAvatar
                  currentAvatarUrl={user?.avatar_url}
                  fullName={user?.full_name}
                  email={user?.email}
                  onAvatarChange={(url) => form.setValue('avatar_url', url)}
                  size="2xl"
                  editable={true}
                />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg">{user?.full_name || user?.email}</h3>
                {user?.initials && (
                  <p className="text-sm text-muted-foreground">{user.initials}</p>
                )}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Member Since */}
              <div className="flex flex-col gap-2 p-4 rounded-lg border bg-accent/20">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">{t("stats.member_since", "Membre depuis")}</span>
                </div>
                <p className="text-2xl font-bold">
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : '-'}
                </p>
              </div>

              {/* Last Login */}
              <div className="flex flex-col gap-2 p-4 rounded-lg border bg-accent/20">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">{t("stats.last_login", "Dernière connexion")}</span>
                </div>
                <p className="text-2xl font-bold">
                  {user?.last_login ? new Date(user.last_login).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '-'}
                </p>
              </div>

              {/* Account Status */}
              <div className="flex flex-col gap-2 p-4 rounded-lg border bg-accent/20">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">{t("stats.status", "Statut")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${user?.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <p className="text-lg font-semibold">
                    {user?.is_active ? t("stats.active", "Actif") : t("stats.inactive", "Inactif")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Informations du profil */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <CardTitle>{t("title", "Informations du profil")}</CardTitle>
          </div>
          <CardDescription>
            {t("description", "Gérez vos informations personnelles")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Informations personnelles */}
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {t("section.personal", "Informations personnelles")}
                </h3>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  {/* Prénom */}
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.first_name.label", "Prénom")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("fields.first_name.placeholder", "Jean")} className="h-11" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Nom */}
                  <FormField
                    control={form.control}
                    name="last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.last_name.label", "Nom")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("fields.last_name.placeholder", "Dupont")} className="h-11" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Initiales */}
                  <FormField
                    control={form.control}
                    name="initials"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.initials.label", "Initiales")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("fields.initials.placeholder", "J.D.")} maxLength={10} className="h-11" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {t("fields.initials.helper", "Vos initiales (ex: J.D.)")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Civilité */}
                  <FormField
                    control={form.control}
                    name="civility"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.civility.label", "Civilité")}</FormLabel>
                        <FormControl>
                          <select
                            {...field}
                            value={field.value || ""}
                            className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value="">{t("fields.civility.placeholder", "Sélectionner")}</option>
                            <option value="M.">M.</option>
                            <option value="Mme">Mme</option>
                            <option value="Mlle">Mlle</option>
                            <option value="Dr.">Dr.</option>
                            <option value="Prof.">Prof.</option>
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Date de naissance */}
                  <FormField
                    control={form.control}
                    name="birth_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.birth_date.label", "Date de naissance")}</FormLabel>
                        <FormControl>
                          <Input type="date" className="h-11" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Extension téléphonique */}
                  <FormField
                    control={form.control}
                    name="extension"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.extension.label", "Extension")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("fields.extension.placeholder", "Ex: 1234")}
                            maxLength={20}
                            className="h-11"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {t("fields.extension.helper", "Extension téléphonique interne")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Section Contact */}
              <div className="pt-6 border-t">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {t("section.contact", "Coordonnées")}
                </h3>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  {/* Email principal */}
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.email.label", "Email")}</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder={t("fields.email.placeholder", "jean.dupont@example.com")} inputMode="email" className="h-11 bg-muted" {...field} disabled />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {t("fields.email.helper", "L'utilisateur recevra des notifications à cette adresse")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Email de récupération */}
                  <FormField
                    control={form.control}
                    name="recovery_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.recovery_email.label", "Email de récupération")}</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder={t("fields.recovery_email.placeholder", "jean.dupont@personnel.com")} inputMode="email" className="h-11" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {t("fields.recovery_email.helper", "Email de secours pour récupérer votre compte")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Téléphones */}
                  <div className="col-span-1 md:col-span-2 space-y-2">
                    <Label>{t("fields.phone_numbers.label", "Téléphones")}</Label>
                    <div className="flex gap-2">
                      <PhoneInput
                        value={newPhone}
                        onChange={(value) => setNewPhone(value || "")}
                        placeholder={t("fields.phone_numbers.placeholder", "+33 6 12 34 56 78")}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={addPhoneNumber}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {phoneNumbers.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {phoneNumbers.map((phone, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-1 bg-secondary text-secondary-foreground px-3 py-1 rounded-md text-sm"
                          >
                            <span>{phone}</span>
                            <button
                              type="button"
                              onClick={() => removePhoneNumber(index)}
                              className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t("fields.phone_numbers.helper", "Ajoutez vos numéros de téléphone")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Section Professionnel */}
              <div className="pt-6 border-t">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  {t("section.professional", "Informations professionnelles")}
                </h3>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  {/* Colonne gauche : Intranet et Signature texte */}
                  <div className="space-y-4">
                    {/* Identifiant Intranet */}
                    <FormField
                      control={form.control}
                      name="intranet_identifier"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("fields.intranet_id.label", "Identifiant Intranet")}</FormLabel>
                          <div className="flex gap-2">
                            <FormControl>
                              <Input placeholder={t("fields.intranet_id.placeholder", "ID12345")} className="h-11" {...field} value={field.value || ""} />
                            </FormControl>
                            {config.intranet_url && field.value && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => {
                                  const url = config.intranet_url?.replace('{user_id}', field.value || '')
                                  window.open(url, '_blank')
                                }}
                                title={t("fields.intranet_id.access", "Accéder à l'intranet")}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <FormDescription className="text-xs">
                            {t("fields.intranet_id.helper", "Votre identifiant dans l'intranet")}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Signature Texte */}
                    <FormField
                      control={form.control}
                      name="signature"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("fields.signature.label", "Signature (Texte)")}</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t("fields.signature.placeholder", "Votre signature professionnelle...")}
                              className="resize-none min-h-[80px]"
                              maxLength={500}
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormDescription className="text-xs flex justify-between">
                            <span>{t("fields.signature.helper", "Utilisée dans les emails et documents")}</span>
                            <span className="text-muted-foreground">
                              {(field.value || "").length}/500
                            </span>
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Colonne droite : Signature image */}
                  <div>
                    <FormField
                      control={form.control}
                      name="signature_image"
                      render={({ field }) => (
                        <FormItem>
                          <SignatureInput
                            value={field.value}
                            onChange={field.onChange}
                            label={t("fields.signature_image.label", "Signature (Image)")}
                            description={t("fields.signature_image.helper", "Dessinez votre signature ou importez une image")}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              <LoadingButton
                type="submit"
                loading={isSubmitting}
                loadingText={t("actions.updating", "Mise à jour...")}
              >
                {t("actions.update", "Mettre à jour")}
              </LoadingButton>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Changement de mot de passe */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            <CardTitle>{t("password.title", "Changer le mot de passe")}</CardTitle>
          </div>
          <CardDescription>
            {t("password.description", "Modifiez votre mot de passe pour sécuriser votre compte")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <div className="space-y-2 col-span-1 md:col-span-2">
              <Label htmlFor="current-password">{t("password.current", "Mot de passe actuel")}</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  className="h-11"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t("password.current_placeholder", "Entrez votre mot de passe actuel")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                >
                  {showCurrentPassword ? t("password.hide", "Masquer") : t("password.show", "Afficher")}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">{t("password.new", "Nouveau mot de passe")}</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  className="h-11"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("password.new_placeholder", "Entrez le nouveau mot de passe")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? t("password.hide", "Masquer") : t("password.show", "Afficher")}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t("password.confirm", "Confirmer le mot de passe")}</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  className="h-11"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("password.confirm_placeholder", "Confirmez le nouveau mot de passe")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? t("password.hide", "Masquer") : t("password.show", "Afficher")}
                </Button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <div className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>{t("password.mismatch", "Les mots de passe ne correspondent pas")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Password strength indicator */}
          {newPassword && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("password.strength", "Force du mot de passe")}</span>
                <span className={`font-medium ${
                  passwordStrength.color === "green" ? "text-green-600" :
                  passwordStrength.color === "orange" ? "text-orange-600" :
                  "text-red-600"
                }`}>
                  {passwordStrength.label}
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    passwordStrength.color === "green" ? "bg-green-600" :
                    passwordStrength.color === "orange" ? "bg-orange-600" :
                    "bg-red-600"
                  }`}
                  style={{ width: `${(passwordStrength.score / 7) * 100}%` }}
                />
              </div>

              {/* Password policy checks */}
              {passwordPolicy && (
                <div className="space-y-1 pt-2">
                  <p className="text-xs text-muted-foreground mb-1">{t("password.requirements", "Exigences du mot de passe")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                    <div className={`flex items-center gap-1.5 ${
                      newPassword.length >= passwordPolicy.min_length ? "text-green-600" : "text-gray-500"
                    }`}>
                      {newPassword.length >= passwordPolicy.min_length ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      <span>{t("password.req_length", { count: passwordPolicy.min_length })}</span>
                    </div>

                    {passwordPolicy.require_uppercase && (
                      <div className={`flex items-center gap-1.5 ${
                        /[A-Z]/.test(newPassword) ? "text-green-600" : "text-gray-500"
                      }`}>
                        {/[A-Z]/.test(newPassword) ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        <span>{t("password.req_uppercase", "Au moins une majuscule")}</span>
                      </div>
                    )}

                    {passwordPolicy.require_lowercase && (
                      <div className={`flex items-center gap-1.5 ${
                        /[a-z]/.test(newPassword) ? "text-green-600" : "text-gray-500"
                      }`}>
                        {/[a-z]/.test(newPassword) ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        <span>{t("password.req_lowercase", "Au moins une minuscule")}</span>
                      </div>
                    )}

                    {passwordPolicy.require_digit && (
                      <div className={`flex items-center gap-1.5 ${
                        /[0-9]/.test(newPassword) ? "text-green-600" : "text-gray-500"
                      }`}>
                        {/[0-9]/.test(newPassword) ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        <span>{t("password.req_digit", "Au moins un chiffre")}</span>
                      </div>
                    )}

                    {passwordPolicy.require_special && (
                      <div className={`flex items-center gap-1.5 ${
                        new RegExp(`[${passwordPolicy.special_chars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(newPassword) ? "text-green-600" : "text-gray-500"
                      }`}>
                        {new RegExp(`[${passwordPolicy.special_chars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(newPassword) ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        <span>{t("password.req_special", "Au moins un caractère spécial")}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <LoadingButton
            onClick={handleChangePassword}
            loading={isChangingPassword}
            loadingText={t("actions.changing", "Changement en cours...")}
            disabled={
              !currentPassword ||
              !newPassword ||
              !confirmPassword ||
              newPassword !== confirmPassword ||
              passwordStrength.score <= 3
            }
            className="w-full sm:w-auto"
          >
            {t("actions.change_password", "Changer le mot de passe")}
          </LoadingButton>
        </CardContent>
      </Card>

      {/* Mes Adresses */}
      <UserAddressesCard />

      {/* Rôles et Groupes */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>{t("role_group.title", "Rôles et groupes")}</CardTitle>
          </div>
          <CardDescription>
            {t("role_group.description", "Vos rôles et groupes dans le système")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingRbac ? (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-7 w-24" />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-5 w-32" />
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("role_group.role_label", "Rôles")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("role_group.role_desc", "Vos rôles dans le système")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {rbacInfo?.roles && rbacInfo.roles.length > 0 ? (
                    rbacInfo.roles.map((role) => (
                      <Badge key={role.id} variant="default" className="text-sm px-3 py-1">
                        {role.name}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="secondary" className="text-sm px-3 py-1">
                      {t("role_group.no_role", "Aucun rôle")}
                    </Badge>
                  )}
                </div>
              </div>

              <Separator />

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("role_group.group_label", "Groupes")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("role_group.group_desc", "Groupes auxquels vous appartenez")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {rbacInfo?.groups && rbacInfo.groups.length > 0 ? (
                    rbacInfo.groups.map((group) => (
                      <div key={group.id} className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{group.name}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {t("role_group.no_group", "Aucun groupe")}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Permissions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <CardTitle>{t("permissions.title", "Permissions")}</CardTitle>
          </div>
          <CardDescription>
            {t("permissions.description", "Vos permissions dans le système")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRbac ? (
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-6 w-24" />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {rbacInfo?.permissions && rbacInfo.permissions.length > 0 ? (
                rbacInfo.permissions.map((permission) => (
                  <Badge key={permission} variant="outline" className="text-xs">
                    {permission}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("permissions.none", "Aucune permission spécifique")}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Désactivation du compte */}
      <Card>
        <CardHeader>
          <CardTitle>{t("account.deactivate_title", "Désactiver le compte")}</CardTitle>
          <CardDescription>
            {t("account.deactivate_desc", "Vous pouvez désactiver votre compte pour faire une pause.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteActions />
        </CardContent>
      </Card>
    </div>
  )
}
