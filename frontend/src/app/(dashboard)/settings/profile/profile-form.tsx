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
import { ProfileAvatar } from "@/components/profile-avatar"
import { useAuth } from "@/hooks/use-auth"
import { api, UserUpdate, PasswordPolicy } from "@/lib/api"
import { auth } from "@/lib/auth"
import { useToast } from "@/hooks/use-toast"
import { useAppConfig } from "@/contexts/app-config-context"
import { useTranslation } from "@/hooks/use-translation"
import { Lock, CheckCircle2, XCircle, AlertCircle, Plus, X, ExternalLink } from "lucide-react"

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
    .email(t("validation.email_invalid")),
  recovery_email: z
    .string()
    .email(t("validation.recovery_email_invalid"))
    .optional()
    .or(z.literal("")),
  avatar_url: z.string().nullable().optional(),
  phone_numbers: z.array(z.string()).optional(),
  intranet_identifier: z.string().max(255).optional().or(z.literal("")),
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
}

interface PasswordStrength {
  score: number
  label: string
  color: string
}

export function AccountForm() {
  const { t } = useTranslation("core.profile")
  const { user, isLoading } = useAuth()
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

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(createAccountFormSchema(t)),
    defaultValues: {
      first_name: "",
      last_name: "",
      initials: "",
      email: "",
      recovery_email: "",
      avatar_url: null,
      phone_numbers: [],
      intranet_identifier: "",
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
      })
      setPhoneNumbers(user.phone_numbers || [])
    }
  }, [user, form])

  useEffect(() => {
    fetchPasswordPolicy()
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
      }

      await api.updateMe(token, updateData)

      toast({
        title: t("toast.profile_updated"),
        description: t("toast.profile_updated_desc"),
      })

      // Reload the page to refresh user data
      window.location.reload()
    } catch (error: unknown) {
      toast({
        title: t("toast.error"),
        description: error instanceof Error ? error.message : t("toast.error_update"),
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <div className="space-y-4">{t("loading")}</div>
  }

  return (
    <div className="space-y-6">
      {/* Informations du profil */}
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Grid Layout: Avatar à gauche, informations à droite */}
              <div className="grid gap-6 grid-cols-1 md:grid-cols-[250px_1fr]">
                {/* Colonne gauche : Photo de profil */}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="avatar_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.avatar.label")}</FormLabel>
                        <FormControl>
                          <ProfileAvatar
                            currentAvatarUrl={field.value}
                            fullName={user?.full_name}
                            email={user?.email}
                            onAvatarChange={field.onChange}
                            size="xl"
                            editable={true}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {t("fields.avatar.helper")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Colonne droite : Informations personnelles */}
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  {/* Prénom */}
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.first_name.label")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("fields.first_name.placeholder")} className="h-11" {...field} value={field.value || ""} />
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
                        <FormLabel>{t("fields.last_name.label")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("fields.last_name.placeholder")} className="h-11" {...field} value={field.value || ""} />
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
                        <FormLabel>{t("fields.initials.label")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("fields.initials.placeholder")} maxLength={10} className="h-11" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {t("fields.initials.helper")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Email principal */}
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.email.label")}</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder={t("fields.email.placeholder")} inputMode="email" className="h-11 bg-muted" {...field} disabled />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {t("fields.email.helper")}
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
                        <FormLabel>{t("fields.recovery_email.label")}</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder={t("fields.recovery_email.placeholder")} inputMode="email" className="h-11" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {t("fields.recovery_email.helper")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Identifiant Intranet */}
                  <FormField
                    control={form.control}
                    name="intranet_identifier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.intranet_id.label")}</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input placeholder={t("fields.intranet_id.placeholder")} className="h-11" {...field} value={field.value || ""} />
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
                              title={t("fields.intranet_id.access")}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <FormDescription className="text-xs">
                          {t("fields.intranet_id.helper")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Téléphones */}
                  <div className="col-span-1 md:col-span-2 space-y-2">
                    <Label>{t("fields.phone_numbers.label")}</Label>
                    <div className="flex gap-2">
                      <Input
                        type="tel"
                        placeholder={t("fields.phone_numbers.placeholder")}
                        inputMode="tel"
                        className="h-11"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            addPhoneNumber()
                          }
                        }}
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
                      {t("fields.phone_numbers.helper")}
                    </p>
                  </div>
                </div>
              </div>

              <LoadingButton
                type="submit"
                loading={isSubmitting}
                loadingText={t("actions.updating")}
              >
                {t("actions.update")}
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
            <CardTitle>{t("password.title")}</CardTitle>
          </div>
          <CardDescription>
            {t("password.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <div className="space-y-2 col-span-1 md:col-span-2">
              <Label htmlFor="current-password">{t("password.current")}</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  className="h-11"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t("password.current_placeholder")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                >
                  {showCurrentPassword ? t("password.hide") : t("password.show")}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">{t("password.new")}</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  className="h-11"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("password.new_placeholder")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? t("password.hide") : t("password.show")}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t("password.confirm")}</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  className="h-11"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("password.confirm_placeholder")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? t("password.hide") : t("password.show")}
                </Button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <div className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>{t("password.mismatch")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Password strength indicator */}
          {newPassword && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("password.strength")}</span>
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
                  <p className="text-xs text-muted-foreground mb-1">{t("password.requirements")}</p>
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
                        <span>{t("password.req_uppercase")}</span>
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
                        <span>{t("password.req_lowercase")}</span>
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
                        <span>{t("password.req_digit")}</span>
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
                        <span>{t("password.req_special")}</span>
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
            loadingText={t("actions.changing")}
            disabled={
              !currentPassword ||
              !newPassword ||
              !confirmPassword ||
              newPassword !== confirmPassword ||
              passwordStrength.score <= 3
            }
            className="w-full sm:w-auto"
          >
            {t("actions.change_password")}
          </LoadingButton>
        </CardContent>
      </Card>
    </div>
  )
}
