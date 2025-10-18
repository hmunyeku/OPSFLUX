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
import { useTranslation } from "@/hooks/use-translation"

// On définira le schema dans le composant pour avoir accès à t()
function getFormSchema(t: (key: string) => string) {
  return z.object({
    email: z
      .string()
      .min(1, { message: t("validation.email_required") })
      .email({ message: t("validation.email_invalid") }),
    password: z
      .string()
      .min(1, {
        message: t("validation.password_required"),
      })
      .min(7, {
        message: t("validation.password_min_length"),
      }),
  })
}

export function UserAuthForm({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const [isLoading, setIsLoading] = useState(false)
  const { login, verify2FA, cancel2FA, twoFactorRequired } = useAuth()
  const { toast } = useToast()
  const { t } = useTranslation("core.auth")

  const formSchema = getFormSchema(t)

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
          title: t("message.success"),
          description: t("message.login_success"),
        })
      }
    } catch (error) {
      toast({
        title: t("message.error"),
        description: error instanceof Error ? error.message : t("message.login_error"),
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
        title: t("message.success"),
        description: t("message.login_success"),
      })
    } catch (error) {
      toast({
        title: t("message.error"),
        description: error instanceof Error ? error.message : t("message.2fa_error"),
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
                  <FormLabel>{t("login.email")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("login.email_placeholder")} {...field} />
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
                    <FormLabel>{t("login.password")}</FormLabel>
                    <Link
                      href="/forgot-password"
                      className="text-muted-foreground text-sm font-medium hover:opacity-75"
                    >
                      {t("login.forgot_password")}
                    </Link>
                  </div>
                  <FormControl>
                    <PasswordInput placeholder={t("login.password_placeholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button className="mt-2" disabled={isLoading}>
              {isLoading ? t("login.button_loading") : t("login.button")}
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
