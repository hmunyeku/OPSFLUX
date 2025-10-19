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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
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
        .min(1, { message: t("validation.email_required") })
        .email({ message: t("validation.email_invalid") }),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      role_id: z.string().min(1, { message: t("validation.role_required") }),
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
        title: t("toast.error_title"),
        description: t("toast.error_load_roles"),
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
        throw new Error(error.detail || t("toast.error_send_invitation"))
      }

      form.reset()
      toast({
        title: t("toast.invitation_sent_title"),
        description: t("toast.invitation_sent_description", { email: values.email }),
      })
      onOpenChange(false)
      onUserCreated?.()
    } catch (error) {
      toast({
        title: t("toast.error_title"),
        description: error instanceof Error ? error.message : t("toast.error_send_invitation"),
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
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <IconMailPlus /> {t("invite_dialog.title")}
          </SheetTitle>
          <SheetDescription>
            {t("invite_dialog.description")}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id="user-invite-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("fields.first_name.label")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("fields.first_name.placeholder")}
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
                    <FormLabel>{t("fields.last_name.label")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("fields.last_name.placeholder")}
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
                  <FormLabel>{t("fields.email.label")}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder={t("fields.email.placeholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role_id"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>{t("fields.role.label")}</FormLabel>
                  <SelectDropdown
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                    placeholder={isLoadingRoles ? t("fields.role.loading") : t("fields.role.placeholder")}
                    disabled={isLoadingRoles}
                    items={roles.map((role) => ({
                      label: role.name,
                      value: role.id,
                    }))}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <SheetFooter className="gap-y-2 mt-6">
          <SheetClose asChild>
            <Button variant="outline" disabled={isSubmitting}>
              {t("invite_dialog.cancel")}
            </Button>
          </SheetClose>
          <Button type="submit" form="user-invite-form" disabled={isSubmitting}>
            {isSubmitting ? t("invite_dialog.sending") : t("invite_dialog.send_invitation")} <IconSend />
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
