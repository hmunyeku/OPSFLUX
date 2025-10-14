"use client"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
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
import { useToast } from "@/hooks/use-toast"
import { api } from "@/lib/api"
import { auth } from "@/lib/auth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const securityFormSchema = z.object({
  twofa_max_attempts: z.number().min(1).max(20),
  twofa_sms_timeout_minutes: z.number().min(1).max(60),
  twofa_sms_rate_limit: z.number().min(1).max(20),
  sms_provider: z.string().min(1),
  sms_provider_account_sid: z.string().optional(),
  sms_provider_auth_token: z.string().optional(),
  sms_provider_phone_number: z.string().optional(),
})

type SecurityFormValues = z.infer<typeof securityFormSchema>

export function SecuritySettingsForm() {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)

  const form = useForm<SecurityFormValues>({
    resolver: zodResolver(securityFormSchema),
    defaultValues: {
      twofa_max_attempts: 5,
      twofa_sms_timeout_minutes: 10,
      twofa_sms_rate_limit: 5,
      sms_provider: "twilio",
      sms_provider_account_sid: "",
      sms_provider_auth_token: "",
      sms_provider_phone_number: "",
    },
  })

  // Charger les paramètres actuels
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await api.getAppSettings()
        form.reset({
          twofa_max_attempts: settings.twofa_max_attempts || 5,
          twofa_sms_timeout_minutes: settings.twofa_sms_timeout_minutes || 10,
          twofa_sms_rate_limit: settings.twofa_sms_rate_limit || 5,
          sms_provider: settings.sms_provider || "twilio",
          sms_provider_account_sid: settings.sms_provider_account_sid || "",
          sms_provider_auth_token: settings.sms_provider_auth_token || "",
          sms_provider_phone_number: settings.sms_provider_phone_number || "",
        })
      } catch {
        toast({
          title: "Erreur",
          description: "Impossible de charger les paramètres",
          variant: "destructive",
        })
      } finally {
        setIsFetching(false)
      }
    }

    loadSettings()
  }, [form, toast])

  async function onSubmit(data: SecurityFormValues) {
    setIsLoading(true)
    try {
      const token = auth.getToken()
      if (!token) {
        throw new Error("Non authentifié")
      }

      await api.updateAppSettings(token, data)

      toast({
        title: "Paramètres enregistrés",
        description: "Les paramètres de sécurité ont été mis à jour avec succès",
      })
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de sauvegarder les paramètres",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (isFetching) {
    return <div className="text-center py-8">Chargement...</div>
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Paramètres 2FA */}
          <Card>
            <CardHeader>
              <CardTitle>Authentification à deux facteurs (2FA)</CardTitle>
              <CardDescription>
                Configurez les paramètres de sécurité pour l&apos;authentification à deux facteurs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="twofa_max_attempts"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre maximum de tentatives</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Nombre de tentatives autorisées avant blocage du compte (1-20)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="twofa_sms_timeout_minutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Durée de validité du code SMS (minutes)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Durée pendant laquelle le code SMS reste valide (1-60 minutes)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="twofa_sms_rate_limit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Limite de SMS par heure</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Nombre maximum de SMS pouvant être envoyés par heure (1-20)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Configuration SMS Provider */}
          <Card>
            <CardHeader>
              <CardTitle>Fournisseur SMS</CardTitle>
              <CardDescription>
                Configuration du service d&apos;envoi de SMS (Twilio, etc.)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="sms_provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fournisseur</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>
                      Nom du fournisseur SMS (twilio, etc.)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="sms_provider_account_sid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account SID</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormDescription>
                      Identifiant du compte fournisseur SMS
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sms_provider_auth_token"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Auth Token</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormDescription>
                      Token d&apos;authentification du fournisseur SMS
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sms_provider_phone_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Numéro émetteur</FormLabel>
                    <FormControl>
                      <Input placeholder="+33612345678" {...field} />
                    </FormControl>
                    <FormDescription>
                      Numéro de téléphone utilisé pour envoyer les SMS (format international)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Enregistrement..." : "Enregistrer les modifications"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
