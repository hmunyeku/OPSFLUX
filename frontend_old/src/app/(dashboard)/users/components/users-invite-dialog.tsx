"use client"

import { useState, useEffect } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { IconMailPlus, IconSend } from "@tabler/icons-react"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "@/hooks/use-toast"
import { useTranslation } from "@/hooks/use-translation"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import SelectDropdown from "@/components/select-dropdown"
import { getRoles } from "../roles/data/roles-api"
import { Role } from "../roles/data/schema"
import { getAccessToken } from "@/lib/auth"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUserCreated?: () => void
}

export function UsersInviteDialog({ open, onOpenChange, onUserCreated }: Props) {
  const { t } = useTranslation("core.users")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoadingRoles, setIsLoadingRoles] = useState(false)

  // Zod schema with dynamic translations
  const getFormSchema = () =>
    z.object({
      email: z
        .string()
        .min(1, { message: t("validation.email_required", "L'email est requis") })
        .email({ message: t("validation.email_invalid", "Adresse email invalide") }),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      role_id: z.string().min(1, { message: t("validation.role_required", "Le rôle est requis") }),
    })

  type UserInviteForm = z.infer<ReturnType<typeof getFormSchema>>

  const form = useForm<UserInviteForm>({
    resolver: zodResolver(getFormSchema()),
    defaultValues: {
      email: "",
      first_name: "",
      last_name: "",
      role_id: "",
    },
  })

  // Load roles from database
  useEffect(() => {
    if (open) {
      loadRoles()
    }
  }, [open])

  const loadRoles = async () => {
    try {
      setIsLoadingRoles(true)
      const data = await getRoles(false)
      setRoles(data)
    } catch (_error) {
      toast({
        title: t("toast.error_title", "Erreur"),
        description: t("toast.error_load_roles", "Impossible de charger les rôles"),
        variant: "destructive",
      })
    } finally {
      setIsLoadingRoles(false)
    }
  }

  const onSubmit = async (values: UserInviteForm) => {
    try {
      setIsSubmitting(true)

      const payload = {
        email: values.email,
        first_name: values.first_name || null,
        last_name: values.last_name || null,
        role_id: values.role_id,
      }

      // Call invitation API
      const token = await getAccessToken()
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/invitations/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || t("toast.error_send_invitation", "Error send invitation"))
      }

      form.reset()
      toast({
        title: t("toast.invitation_sent_title", "Invitation envoyée"),
        description: t("toast.invitation_sent_description", `Invitation envoyée à ${values.email}`),
      })
      onOpenChange(false)
      onUserCreated?.()
    } catch (error) {
      toast({
        title: t("toast.error_title", "Erreur"),
        description: error instanceof Error ? error.message : t("toast.error_send_invitation", "Échec de l'envoi"),
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(state) => {
        form.reset()
        onOpenChange(state)
      }}
    >
      <SheetContent className="flex flex-col overflow-hidden w-full sm:max-w-lg">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <IconMailPlus className="h-5 w-5" />
            {t("invite_dialog.title", "Inviter un utilisateur")}
          </SheetTitle>
          <SheetDescription>
            {t("invite_dialog.description", "Envoyez une invitation par email avec un lien pour créer un compte.")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-1 -mx-1">
          <Form {...form}>
            <form
              id="user-invite-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6 py-4"
            >
              {/* Personal Information */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-foreground">
                    {t("sections.personal_info", "Informations")}
                  </h3>
                  <Separator className="flex-1" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.first_name.label", "Prénom")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("fields.first_name.placeholder", "Jean")}
                            autoComplete="given-name"
                            className="h-11"
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
                        <FormLabel>{t("fields.last_name.label", "Nom")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("fields.last_name.placeholder", "Dupont")}
                            autoComplete="family-name"
                            className="h-11"
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
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.email.label", "Email")}</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder={t("fields.email.placeholder", "jean.dupont@example.com")}
                          autoComplete="email"
                          inputMode="email"
                          className="h-11"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {t("fields.email.invite_helper", "Un email sera envoyé à cette adresse")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Role Selection */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-foreground">
                    {t("sections.account", "Compte")}
                  </h3>
                  <Separator className="flex-1" />
                </div>

                {isLoadingRoles ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-11 w-full" />
                  </div>
                ) : (
                  <FormField
                    control={form.control}
                    name="role_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.role.label", "Rôle")}</FormLabel>
                        <SelectDropdown
                          defaultValue={field.value}
                          onValueChange={field.onChange}
                          placeholder={t("fields.role.placeholder", "Sélectionnez un rôle")}
                          items={roles.map((role) => ({
                            label: role.name,
                            value: role.id,
                          }))}
                        />
                        <FormDescription>
                          {t("fields.role.helper", "Définit les permissions de l'utilisateur")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </form>
          </Form>
        </div>

        <SheetFooter className="flex-shrink-0 border-t pt-4 bg-background">
          <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:justify-end">
            <SheetClose asChild>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                {t("invite_dialog.cancel", "Annuler")}
              </Button>
            </SheetClose>
            <Button
              type="submit"
              form="user-invite-form"
              disabled={isSubmitting || isLoadingRoles}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  
                  {t("invite_dialog.sending", "Envoi...")}
                </>
              ) : (
                <>
                  <IconSend className="mr-2 h-4 w-4" />
                  {t("invite_dialog.send_invitation", "Envoyer")}
                </>
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
