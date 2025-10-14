"use client"

import { useState, useEffect } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
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
import { Lock, CheckCircle2, XCircle, AlertCircle, Plus, X } from "lucide-react"

const accountFormSchema = z.object({
  first_name: z
    .string()
    .min(2, {
      message: "Le prénom doit contenir au moins 2 caractères.",
    })
    .max(100, {
      message: "Le prénom ne doit pas dépasser 100 caractères.",
    })
    .optional(),
  last_name: z
    .string()
    .min(2, {
      message: "Le nom doit contenir au moins 2 caractères.",
    })
    .max(100, {
      message: "Le nom ne doit pas dépasser 100 caractères.",
    })
    .optional(),
  initials: z
    .string()
    .max(10, {
      message: "Les initiales ne doivent pas dépasser 10 caractères.",
    })
    .optional(),
  email: z
    .string({
      required_error: "L'email est requis.",
    })
    .email("Email invalide."),
  recovery_email: z
    .string()
    .email("Email de récupération invalide.")
    .optional()
    .or(z.literal("")),
  avatar_url: z.string().nullable().optional(),
  phone_numbers: z.array(z.string()).optional(),
})

type AccountFormValues = z.infer<typeof accountFormSchema>

interface PasswordStrength {
  score: number
  label: string
  color: string
}

export function AccountForm() {
  const { user, isLoading } = useAuth()
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
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      initials: "",
      email: "",
      recovery_email: "",
      avatar_url: null,
      phone_numbers: [],
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
      return { score, label: "Faible", color: "red" }
    } else if (score <= 5) {
      return { score, label: "Moyen", color: "orange" }
    } else {
      return { score, label: "Fort", color: "green" }
    }
  }

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs",
        variant: "destructive",
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Erreur",
        description: "Les nouveaux mots de passe ne correspondent pas",
        variant: "destructive",
      })
      return
    }

    if (passwordStrength.score <= 3) {
      toast({
        title: "Mot de passe trop faible",
        description: "Veuillez choisir un mot de passe plus fort",
        variant: "destructive",
      })
      return
    }

    setIsChangingPassword(true)

    try {
      const token = auth.getToken()
      if (!token) {
        toast({
          title: "Erreur",
          description: "Vous devez être connecté",
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
          title: "Mot de passe changé",
          description: "Votre mot de passe a été changé avec succès",
        })
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
      } else {
        const error = await response.json()
        toast({
          title: "Erreur",
          description: error.detail || "Impossible de changer le mot de passe",
          variant: "destructive",
        })
      }
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite",
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
          title: "Erreur",
          description: "Vous devez être connecté pour mettre à jour votre profil",
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
      }

      await api.updateMe(token, updateData)

      toast({
        title: "Profil mis à jour",
        description: "Vos informations ont été mises à jour avec succès.",
      })

      // Reload the page to refresh user data
      window.location.reload()
    } catch (error: unknown) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Une erreur s'est produite lors de la mise à jour du profil",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <div className="space-y-4">Chargement...</div>
  }

  return (
    <div className="space-y-6">
      {/* Informations du profil */}
      <Card>
        <CardHeader>
          <CardTitle>Informations personnelles</CardTitle>
          <CardDescription>
            Mettez à jour vos informations de profil
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Grid Layout: Avatar à gauche, informations à droite */}
              <div className="grid gap-6 md:grid-cols-[250px_1fr]">
                {/* Colonne gauche : Photo de profil */}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="avatar_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Photo de profil</FormLabel>
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
                          Visible par les autres utilisateurs
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Colonne droite : Informations personnelles */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Prénom */}
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prénom</FormLabel>
                        <FormControl>
                          <Input placeholder="Jean" {...field} value={field.value || ""} />
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
                        <FormLabel>Nom</FormLabel>
                        <FormControl>
                          <Input placeholder="Dupont" {...field} value={field.value || ""} />
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
                        <FormLabel>Initiales</FormLabel>
                        <FormControl>
                          <Input placeholder="JD" maxLength={10} {...field} value={field.value || ""} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Affichées dans l&apos;avatar
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
                        <FormLabel>Adresse email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="jean.dupont@example.com" {...field} disabled className="bg-muted" />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Email de connexion (non modifiable)
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
                        <FormLabel>Email de récupération</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="recuperation@example.com" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Pour récupérer votre compte
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Téléphones */}
                  <div className="md:col-span-2 space-y-2">
                    <Label>Numéros de téléphone</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="+33 6 12 34 56 78"
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
                      Ajoutez un ou plusieurs numéros de téléphone
                    </p>
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Mise à jour..." : "Mettre à jour le profil"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Changement de mot de passe */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            <CardTitle>Mot de passe</CardTitle>
          </div>
          <CardDescription>
            Modifiez votre mot de passe pour sécuriser votre compte
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="current-password">Mot de passe actuel</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Entrez votre mot de passe actuel"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                >
                  {showCurrentPassword ? "Masquer" : "Afficher"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">Nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Entrez votre nouveau mot de passe"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? "Masquer" : "Afficher"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmez votre nouveau mot de passe"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? "Masquer" : "Afficher"}
                </Button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <div className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>Les mots de passe ne correspondent pas</span>
                </div>
              )}
            </div>
          </div>

          {/* Password strength indicator */}
          {newPassword && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Force du mot de passe</span>
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
                  <p className="text-xs text-muted-foreground mb-1">Exigences :</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
                    <div className={`flex items-center gap-1.5 ${
                      newPassword.length >= passwordPolicy.min_length ? "text-green-600" : "text-gray-500"
                    }`}>
                      {newPassword.length >= passwordPolicy.min_length ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      <span>Au moins {passwordPolicy.min_length} caractères</span>
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
                        <span>Une lettre majuscule</span>
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
                        <span>Une lettre minuscule</span>
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
                        <span>Un chiffre</span>
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
                        <span>Un caractère spécial</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <Button
            onClick={handleChangePassword}
            disabled={
              isChangingPassword ||
              !currentPassword ||
              !newPassword ||
              !confirmPassword ||
              newPassword !== confirmPassword ||
              passwordStrength.score <= 3
            }
            className="w-full sm:w-auto"
          >
            {isChangingPassword ? "Changement en cours..." : "Changer le mot de passe"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
