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
import { Lock, CheckCircle2, XCircle, AlertCircle } from "lucide-react"

const accountFormSchema = z.object({
  full_name: z
    .string()
    .min(2, {
      message: "Le nom complet doit contenir au moins 2 caractères.",
    })
    .max(255, {
      message: "Le nom complet ne doit pas dépasser 255 caractères.",
    }),
  email: z
    .string({
      required_error: "L'email est requis.",
    })
    .email("Email invalide."),
  avatar_url: z.string().nullable().optional(),
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
      full_name: "",
      email: "",
      avatar_url: null,
    },
  })

  // Load user data when available
  useEffect(() => {
    if (user) {
      form.reset({
        full_name: user.full_name || "",
        email: user.email || "",
        avatar_url: user.avatar_url || null,
      })
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

      const updateData: UserUpdate = {
        full_name: data.full_name,
        email: data.email,
        avatar_url: data.avatar_url,
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
              <div className="grid gap-6 md:grid-cols-2">
                {/* Avatar */}
                <FormField
                  control={form.control}
                  name="avatar_url"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
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
                      <FormDescription>
                        Choisissez une photo de profil. Elle sera visible par les autres utilisateurs.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Full Name */}
                <FormField
                  control={form.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nom complet</FormLabel>
                      <FormControl>
                        <Input placeholder="Jean Dupont" {...field} />
                      </FormControl>
                      <FormDescription>
                        Le nom affiché sur votre profil
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Email */}
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="jean.dupont@example.com" {...field} />
                      </FormControl>
                      <FormDescription>
                        Votre adresse email de connexion
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
