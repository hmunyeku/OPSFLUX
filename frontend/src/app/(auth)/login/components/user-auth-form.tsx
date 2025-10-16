"use client"

import { HTMLAttributes, useState } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/password-input"
import { useToast } from "@/hooks/use-toast"
import { TwoFactorVerificationModal } from "@/components/two-factor-verification-modal"

const formSchema = z.object({
  email: z
    .string()
    .min(1, { message: "Veuillez entrer votre email" })
    .email({ message: "Adresse email invalide" }),
  password: z
    .string()
    .min(1, {
      message: "Veuillez entrer votre mot de passe",
    })
    .min(7, {
      message: "Le mot de passe doit contenir au moins 7 caractères",
    }),
})

export function UserAuthForm({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const [isLoading, setIsLoading] = useState(false)
  const { login, verify2FA, cancel2FA, twoFactorRequired } = useAuth()
  const { toast } = useToast()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)
    try {
      await login(data.email, data.password)

      // Si le 2FA n'est pas requis, le hook redirigera automatiquement
      if (!twoFactorRequired) {
        toast({
          title: "Succès",
          description: "Vous êtes connecté avec succès",
        })
      }
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Identifiants invalides",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  async function handle2FAVerify(code: string, method: string) {
    try {
      await verify2FA(code, method)
      toast({
        title: "Succès",
        description: "Vous êtes connecté avec succès",
      })
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Code 2FA invalide",
        variant: "destructive",
      })
      throw error // Re-throw pour que le modal garde l'état de chargement
    }
  }

  function handle2FACancel() {
    cancel2FA()
    setIsLoading(false)
  }

  return (
    <div className={cn("grid gap-6", className)} {...props}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-2">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="name@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <div className="flex items-center justify-between">
                    <FormLabel>Mot de passe</FormLabel>
                    <Link
                      href="/forgot-password"
                      className="text-muted-foreground text-sm font-medium hover:opacity-75"
                    >
                      Mot de passe oublié ?
                    </Link>
                  </div>
                  <FormControl>
                    <PasswordInput placeholder="********" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button className="mt-2" disabled={isLoading}>
              {isLoading ? "Connexion..." : "Se connecter"}
            </Button>
          </div>
        </form>
      </Form>

      {/* Modal de vérification 2FA */}
      {twoFactorRequired && (
        <TwoFactorVerificationModal
          open={!!twoFactorRequired}
          twoFactorData={twoFactorRequired}
          onVerify={handle2FAVerify}
          onCancel={handle2FACancel}
        />
      )}
    </div>
  )
}
