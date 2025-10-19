"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { IconCheck, IconAlertCircle } from "@tabler/icons-react"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/password-input"
import { Alert, AlertDescription } from "@/components/ui/alert"

// Password validation according to security policy
const passwordSchema = z
  .string()
  .min(8, { message: "Le mot de passe doit contenir au moins 8 caractères." })
  .regex(/[A-Z]/, { message: "Le mot de passe doit contenir au moins une majuscule." })
  .regex(/[a-z]/, { message: "Le mot de passe doit contenir au moins une minuscule." })
  .regex(/[0-9]/, { message: "Le mot de passe doit contenir au moins un chiffre." })
  .regex(/[^A-Za-z0-9]/, { message: "Le mot de passe doit contenir au moins un caractère spécial." })

const formSchema = z.object({
  first_name: z.string().min(1, { message: "Le prénom est requis." }),
  last_name: z.string().min(1, { message: "Le nom est requis." }),
  password: passwordSchema,
  confirmPassword: passwordSchema,
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas.",
  path: ["confirmPassword"],
})

type AcceptInvitationForm = z.infer<typeof formSchema>

export function AcceptInvitationForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<AcceptInvitationForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      password: "",
      confirmPassword: "",
    },
  })

  useEffect(() => {
    if (!token) {
      setError("Token d'invitation manquant. Veuillez vérifier le lien dans votre email.")
    }
  }, [token])

  const onSubmit = async (values: AcceptInvitationForm) => {
    if (!token) {
      setError("Token d'invitation manquant.")
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      const payload = {
        token,
        first_name: values.first_name,
        last_name: values.last_name,
        password: values.password,
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/invitations/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || "Impossible d'accepter l'invitation")
      }

      toast({
        title: "Compte créé !",
        description: "Votre compte a été créé avec succès. Vous pouvez maintenant vous connecter.",
      })

      // Redirect to login page
      router.push("/login")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Impossible d'accepter l'invitation"
      setError(errorMessage)
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (error && !token) {
    return (
      <Alert variant="destructive">
        <IconAlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <IconAlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="first_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prénom</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Jean"
                    autoComplete="given-name"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="last_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nom</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Dupont"
                    autoComplete="family-name"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mot de passe</FormLabel>
              <FormControl>
                <PasswordInput
                  placeholder="Créez un mot de passe sécurisé"
                  autoComplete="new-password"
                  {...field}
                />
              </FormControl>
              <FormDescription className="text-xs">
                Doit contenir: 8+ caractères, majuscule, minuscule, chiffre, caractère spécial
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirmer le mot de passe</FormLabel>
              <FormControl>
                <PasswordInput
                  placeholder="Confirmez votre mot de passe"
                  autoComplete="new-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Création du compte..." : "Créer mon compte"}
          <IconCheck className="ml-2 h-4 w-4" />
        </Button>
      </form>
    </Form>
  )
}
