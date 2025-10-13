"use client"

import { useState, useEffect } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
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
import { api, UserUpdate } from "@/lib/api"
import { auth } from "@/lib/auth"
import { useToast } from "@/hooks/use-toast"

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

export function AccountForm() {
  const { user, isLoading } = useAuth()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Avatar */}
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
                C&apos;est le nom qui sera affiché sur votre profil et dans les emails.
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
                Votre adresse email principale pour la connexion et les notifications.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Mise à jour..." : "Mettre à jour le profil"}
        </Button>
      </form>
    </Form>
  )
}
