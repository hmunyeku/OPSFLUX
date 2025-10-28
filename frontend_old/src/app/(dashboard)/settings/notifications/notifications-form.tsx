"use client"

import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferencesUpdate
} from "@/api/notification-preferences"
import {
  IconLoader,
  IconBell,
  IconMail,
  IconShieldCheck,
  IconSpeakerphone,
  IconUsers,
  IconBellRinging,
  IconDeviceMobile,
  IconCheck,
  IconChevronDown
} from "@tabler/icons-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

const notificationsFormSchema = z.object({
  type: z.enum(["all", "mentions", "none"], {
    required_error: "Vous devez sélectionner un type de notification.",
  }),
  mobile: z.boolean().default(false).optional(),
  communication_emails: z.boolean().default(false).optional(),
  social_emails: z.boolean().default(false).optional(),
  marketing_emails: z.boolean().default(false).optional(),
  security_emails: z.boolean(),
})

type NotificationsFormValues = z.infer<typeof notificationsFormSchema>

export function NotificationsForm() {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const form = useForm<NotificationsFormValues>({
    resolver: zodResolver(notificationsFormSchema),
    defaultValues: {
      type: "mentions",
      communication_emails: false,
      marketing_emails: false,
      social_emails: true,
      security_emails: true,
      mobile: false,
    },
  })

  // Charger les préférences au montage du composant
  useEffect(() => {
    async function loadPreferences() {
      try {
        const prefs = await getNotificationPreferences()
        form.reset({
          type: prefs.notification_type as "all" | "mentions" | "none",
          mobile: prefs.mobile_enabled,
          communication_emails: prefs.communication_emails,
          social_emails: prefs.social_emails,
          marketing_emails: prefs.marketing_emails,
          security_emails: prefs.security_emails,
        })
      } catch (error) {
        console.error("Failed to load preferences:", error)
        toast({
          variant: "destructive",
          title: "Erreur",
          description: "Impossible de charger vos préférences",
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadPreferences()
  }, [form, toast])

  async function onSubmit(data: NotificationsFormValues) {
    setIsSaving(true)
    try {
      const updateData: NotificationPreferencesUpdate = {
        notification_type: data.type,
        mobile_enabled: data.mobile,
        communication_emails: data.communication_emails,
        social_emails: data.social_emails,
        marketing_emails: data.marketing_emails,
        security_emails: data.security_emails,
      }

      await updateNotificationPreferences(updateData)

      toast({
        title: "Préférences sauvegardées",
        description: "Vos préférences de notifications ont été mises à jour",
      })
    } catch (error) {
      console.error("Failed to save preferences:", error)
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de sauvegarder vos préférences",
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <IconLoader className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Accordion type="multiple" defaultValue={["notifications", "emails"]} className="w-full space-y-4">
          {/* Notifications push */}
          <AccordionItem value="notifications" className="border rounded-lg px-4 bg-card">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                  <IconBellRinging className="h-4 w-4 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm">Notifications push</div>
                  <div className="text-xs text-muted-foreground font-normal">
                    Choisissez quand recevoir des notifications
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pt-2">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="grid gap-2"
                      >
                        <label
                          htmlFor="all"
                          className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all hover:bg-accent/50 ${
                            field.value === "all" ? "border-primary bg-accent" : "border-border"
                          }`}
                        >
                          <RadioGroupItem value="all" id="all" />
                          <IconBell className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">Tous les messages</div>
                            <div className="text-xs text-muted-foreground">Toutes les notifications</div>
                          </div>
                        </label>
                        <label
                          htmlFor="mentions"
                          className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all hover:bg-accent/50 ${
                            field.value === "mentions" ? "border-primary bg-accent" : "border-border"
                          }`}
                        >
                          <RadioGroupItem value="mentions" id="mentions" />
                          <IconUsers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">Mentions uniquement</div>
                            <div className="text-xs text-muted-foreground">Messages directs et mentions</div>
                          </div>
                        </label>
                        <label
                          htmlFor="none"
                          className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all hover:bg-accent/50 ${
                            field.value === "none" ? "border-primary bg-accent" : "border-border"
                          }`}
                        >
                          <RadioGroupItem value="none" id="none" />
                          <IconBell className="h-4 w-4 text-muted-foreground opacity-50 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">Désactivées</div>
                            <div className="text-xs text-muted-foreground">Aucune notification</div>
                          </div>
                        </label>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Notifications par email */}
          <AccordionItem value="emails" className="border rounded-lg px-4 bg-card">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 flex-shrink-0">
                  <IconMail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm">Notifications par email</div>
                  <div className="text-xs text-muted-foreground font-normal">
                    Gérez les types d&apos;emails que vous recevez
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pt-2 space-y-3">
              <FormField
                control={form.control}
                name="communication_emails"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <IconMail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <FormLabel className="text-sm font-medium cursor-pointer">
                          Communication
                        </FormLabel>
                        <FormDescription className="text-xs">
                          Activité de votre compte
                        </FormDescription>
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="marketing_emails"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <IconSpeakerphone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <FormLabel className="text-sm font-medium cursor-pointer">
                          Marketing
                        </FormLabel>
                        <FormDescription className="text-xs">
                          Nouveautés et promotions
                        </FormDescription>
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="social_emails"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <IconUsers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <FormLabel className="text-sm font-medium cursor-pointer">
                          Social
                        </FormLabel>
                        <FormDescription className="text-xs">
                          Demandes et abonnements
                        </FormDescription>
                      </div>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="security_emails"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 p-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <IconShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <FormLabel className="text-sm font-medium">
                            Sécurité
                          </FormLabel>
                          <Badge variant="outline" className="text-[10px] h-5 border-green-600 text-green-700 dark:text-green-400">
                            Requis
                          </Badge>
                        </div>
                        <FormDescription className="text-xs text-green-700 dark:text-green-300">
                          Toujours activé
                        </FormDescription>
                      </div>
                    </div>
                    <FormControl>
                      <div className="flex h-5 w-9 items-center justify-center rounded-full bg-green-600">
                        <IconCheck className="h-3 w-3 text-white" />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Paramètres mobiles */}
          <AccordionItem value="mobile" className="border rounded-lg px-4 bg-card">
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 flex-shrink-0">
                  <IconDeviceMobile className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm">Appareils mobiles</div>
                  <div className="text-xs text-muted-foreground font-normal">
                    Paramètres spécifiques pour mobile
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pt-2">
              <FormField
                control={form.control}
                name="mobile"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-lg border p-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="mt-0.5"
                      />
                    </FormControl>
                    <div className="flex-1 space-y-1">
                      <FormLabel className="text-sm font-medium cursor-pointer">
                        Paramètres différents pour mobile
                      </FormLabel>
                      <FormDescription className="text-xs">
                        Configurez des préférences distinctes pour vos appareils mobiles dans{" "}
                        <Link
                          href="/settings"
                          className="font-medium text-primary hover:underline"
                        >
                          les paramètres
                        </Link>
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Separator />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Vos préférences sont sauvegardées automatiquement
          </p>
          <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
            {isSaving ? (
              <>
                <IconLoader className="mr-2 h-4 w-4 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <IconCheck className="mr-2 h-4 w-4" />
                Enregistrer les modifications
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  )
}
