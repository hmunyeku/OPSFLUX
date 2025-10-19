"use client"

import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "@/hooks/use-toast"
import { useTranslation } from "@/hooks/use-translation"
import { Button } from "@/components/ui/button"
import {
  Sheet,
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
import { PasswordInput } from "@/components/password-input"
import SelectDropdown from "@/components/select-dropdown"
import { User } from "../data/schema"
import { createUser, updateUser } from "../data/users-api"
import { getRoles } from "../roles/data/roles-api"
import { Role } from "../roles/data/schema"
import { useState, useEffect } from "react"

interface Props {
  currentRow?: User
  open: boolean
  onOpenChange: (open: boolean) => void
  onUserCreated?: () => void
}

export function UsersActionDialog({ currentRow, open, onOpenChange, onUserCreated }: Props) {
  const isEdit = !!currentRow
  const { t } = useTranslation("core.users")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoadingRoles, setIsLoadingRoles] = useState(false)

  // Zod schema with dynamic translations
  const getFormSchema = () =>
    z
      .object({
        firstName: z.string().min(1, { message: t("validation.first_name_required") }),
        lastName: z.string().min(1, { message: t("validation.last_name_required") }),
        phoneNumber: z.string().min(1, { message: t("validation.phone_required") }),
        email: z
          .string()
          .min(1, { message: t("validation.email_required") })
          .email({ message: t("validation.email_invalid") }),
        password: z.string().transform((pwd) => pwd.trim()),
        role_id: z.string().min(1, { message: t("validation.role_required") }),
        confirmPassword: z.string().transform((pwd) => pwd.trim()),
        isEdit: z.boolean(),
      })
      .superRefine(({ isEdit, password, confirmPassword }, ctx) => {
        if (!isEdit || (isEdit && password !== "")) {
          if (password === "") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t("validation.password_required"),
              path: ["password"],
            })
          }

          if (password.length < 8) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t("validation.password_min_length"),
              path: ["password"],
            })
          }

          if (!password.match(/[a-z]/)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t("validation.password_lowercase"),
              path: ["password"],
            })
          }

          if (!password.match(/\d/)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t("validation.password_number"),
              path: ["password"],
            })
          }

          if (password !== confirmPassword) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t("validation.passwords_dont_match"),
              path: ["confirmPassword"],
            })
          }
        }
      })

  type UserForm = z.infer<ReturnType<typeof getFormSchema>>

  const form = useForm<UserForm>({
    resolver: zodResolver(getFormSchema()),
    defaultValues: isEdit
      ? {
          ...currentRow,
          password: "",
          confirmPassword: "",
          role_id: "",
          isEdit,
        }
      : {
          firstName: "",
          lastName: "",
          email: "",
          role_id: "",
          phoneNumber: "",
          password: "",
          confirmPassword: "",
          isEdit,
        },
  })

  // Load roles from API
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

  const onSubmit = async (values: UserForm) => {
    try {
      setIsSubmitting(true)

      if (isEdit && currentRow) {
        // Update existing user
        await updateUser(currentRow.id, {
          email: values.email,
          first_name: values.firstName,
          last_name: values.lastName,
          phone_numbers: values.phoneNumber ? [values.phoneNumber] : [],
        })

        toast({
          title: t("toast.user_updated_title"),
          description: t("toast.user_updated_description"),
        })
      } else {
        // Create new user
        await createUser({
          email: values.email,
          password: values.password,
          first_name: values.firstName,
          last_name: values.lastName,
          phone_numbers: values.phoneNumber ? [values.phoneNumber] : [],
          is_active: true,
        })

        toast({
          title: t("toast.user_created_title"),
          description: t("toast.user_created_description"),
        })
      }

      form.reset()
      onOpenChange(false)

      // Call the callback to refresh the users list
      if (onUserCreated) {
        onUserCreated()
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("toast.error_title"),
        description: error instanceof Error ? error.message : t("toast.error_save_user"),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const isPasswordTouched = !!form.formState.dirtyFields.password

  return (
    <Sheet
      open={open}
      onOpenChange={(state) => {
        form.reset()
        onOpenChange(state)
      }}
    >
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {isEdit ? t("create_dialog.title_edit") : t("create_dialog.title_create")}
          </SheetTitle>
          <SheetDescription>
            {isEdit ? t("create_dialog.description_edit") : t("create_dialog.description_create")}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id="user-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem className="grid grid-cols-1 sm:grid-cols-6 items-start sm:items-center gap-2 sm:gap-x-4">
                  <FormLabel className="sm:col-span-2 sm:text-right">
                    {t("fields.first_name.label")}
                  </FormLabel>
                  <div className="sm:col-span-4">
                    <FormControl>
                      <Input
                        placeholder={t("fields.first_name.placeholder")}
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem className="grid grid-cols-1 sm:grid-cols-6 items-start sm:items-center gap-2 sm:gap-x-4">
                  <FormLabel className="sm:col-span-2 sm:text-right">
                    {t("fields.last_name.label")}
                  </FormLabel>
                  <div className="sm:col-span-4">
                    <FormControl>
                      <Input
                        placeholder={t("fields.last_name.placeholder")}
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="grid grid-cols-1 sm:grid-cols-6 items-start sm:items-center gap-2 sm:gap-x-4">
                  <FormLabel className="sm:col-span-2 sm:text-right">
                    {t("fields.email.label")}
                  </FormLabel>
                  <div className="sm:col-span-4">
                    <FormControl>
                      <Input
                        placeholder={t("fields.email.placeholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem className="grid grid-cols-1 sm:grid-cols-6 items-start sm:items-center gap-2 sm:gap-x-4">
                  <FormLabel className="sm:col-span-2 sm:text-right">
                    {t("fields.phone_number.label")}
                  </FormLabel>
                  <div className="sm:col-span-4">
                    <FormControl>
                      <Input
                        placeholder={t("fields.phone_number.placeholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role_id"
              render={({ field }) => (
                <FormItem className="grid grid-cols-1 sm:grid-cols-6 items-start sm:items-center gap-2 sm:gap-x-4">
                  <FormLabel className="sm:col-span-2 sm:text-right">
                    {t("fields.role.label")}
                  </FormLabel>
                  <div className="sm:col-span-4">
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
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem className="grid grid-cols-1 sm:grid-cols-6 items-start sm:items-center gap-2 sm:gap-x-4">
                  <FormLabel className="sm:col-span-2 sm:text-right">
                    {t("fields.password.label")}
                  </FormLabel>
                  <div className="sm:col-span-4">
                    <FormControl>
                      <PasswordInput
                        placeholder={t("fields.password.placeholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem className="grid grid-cols-1 sm:grid-cols-6 items-start sm:items-center gap-2 sm:gap-x-4">
                  <FormLabel className="sm:col-span-2 sm:text-right">
                    {t("fields.confirm_password.label")}
                  </FormLabel>
                  <div className="sm:col-span-4">
                    <FormControl>
                      <PasswordInput
                        disabled={!isPasswordTouched}
                        placeholder={t("fields.confirm_password.placeholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />
          </form>
        </Form>
        <SheetFooter className="mt-6">
          <Button type="submit" form="user-form" disabled={isSubmitting}>
            {isSubmitting ? t("create_dialog.saving") : t("create_dialog.save_changes")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
