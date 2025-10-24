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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/password-input"
import SelectDropdown from "@/components/select-dropdown"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { User } from "../data/schema"
import { createUser, updateUser } from "../data/users-api"
import { getRoles } from "../roles/data/roles-api"
import { Role } from "../roles/data/schema"
import { getAddressTypes, createAddress, type AddressType } from "../data/addresses-api"
import { AddressInput, type AddressData } from "@/components/ui/address-input"
import { useState, useEffect, useMemo } from "react"
import { IconLoader2, IconCheck, IconX } from "@tabler/icons-react"

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
  const [addressTypes, setAddressTypes] = useState<AddressType[]>([])
  const [isLoadingAddressTypes, setIsLoadingAddressTypes] = useState(false)
  const [address, setAddress] = useState<AddressData | undefined>(undefined)

  // Zod schema with dynamic translations
  const getFormSchema = () =>
    z
      .object({
        firstName: z.string().min(1, { message: t("validation.first_name_required", "Le prénom est requis") }),
        lastName: z.string().min(1, { message: t("validation.last_name_required", "Le nom est requis") }),
        phoneNumber: z.string().min(1, { message: t("validation.phone_required", "Le numéro de téléphone est requis") }),
        email: z
          .string()
          .min(1, { message: t("validation.email_required", "L'email est requis") })
          .email({ message: t("validation.email_invalid", "Adresse email invalide") }),
        password: z.string().transform((pwd) => pwd.trim()),
        role_id: z.string().min(1, { message: t("validation.role_required", "Le rôle est requis") }),
        confirmPassword: z.string().transform((pwd) => pwd.trim()),
        isEdit: z.boolean(),
      })
      .superRefine(({ isEdit, password, confirmPassword }, ctx) => {
        if (!isEdit || (isEdit && password !== "")) {
          if (password === "") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t("validation.password_required", "Le mot de passe est requis"),
              path: ["password"],
            })
          }

          if (password.length < 8) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t("validation.password_min_length", "Le mot de passe doit contenir au moins 8 caractères"),
              path: ["password"],
            })
          }

          if (!password.match(/[a-z]/)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t("validation.password_lowercase", "Le mot de passe doit contenir au moins une minuscule"),
              path: ["password"],
            })
          }

          if (!password.match(/\d/)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t("validation.password_number", "Le mot de passe doit contenir au moins un chiffre"),
              path: ["password"],
            })
          }

          if (password !== confirmPassword) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t("validation.passwords_dont_match", "Les mots de passe ne correspondent pas"),
              path: ["confirmPassword"],
            })
          }
        }
      })

  type UserForm = z.infer<ReturnType<typeof getFormSchema>>

  const form = useForm<UserForm>({
    resolver: zodResolver(getFormSchema()),
    mode: "onChange",
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

  // Load roles and address types from API
  useEffect(() => {
    if (open) {
      loadRoles()
      loadAddressTypes()
    }
  }, [open])

  // Reset form with current user data when opening the drawer
  useEffect(() => {
    if (open && isEdit && currentRow) {
      form.reset({
        firstName: currentRow.firstName || "",
        lastName: currentRow.lastName || "",
        email: currentRow.email || "",
        phoneNumber: currentRow.phoneNumber || "",
        role_id: currentRow.role_id || "",
        password: "",
        confirmPassword: "",
        isEdit: true,
      })
    } else if (open && !isEdit) {
      form.reset({
        firstName: "",
        lastName: "",
        email: "",
        role_id: "",
        phoneNumber: "",
        password: "",
        confirmPassword: "",
        isEdit: false,
      })
    }
  }, [open, currentRow, isEdit, form])

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

  const loadAddressTypes = async () => {
    try {
      setIsLoadingAddressTypes(true)
      const data = await getAddressTypes()
      setAddressTypes(data)
    } catch (_error) {
      toast({
        title: t("toast.error_title", "Erreur"),
        description: t("toast.error_load_address_types", "Impossible de charger les types d'adresse"),
        variant: "destructive",
      })
    } finally {
      setIsLoadingAddressTypes(false)
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
          title: t("toast.user_updated_title", "Utilisateur mis à jour"),
          description: t("toast.user_updated_description", "L'utilisateur a été mis à jour avec succès"),
        })
      } else {
        // Create new user
        const newUser = await createUser({
          email: values.email,
          password: values.password,
          first_name: values.firstName,
          last_name: values.lastName,
          phone_numbers: values.phoneNumber ? [values.phoneNumber] : [],
          is_active: true,
        })

        // Create address if provided
        if (address && address.address_type_id && address.street_line1 && address.city) {
          try {
            await createAddress({
              ...address,
              entity_type: "user",
              entity_id: newUser.id,
            })
          } catch (addressError) {
            console.error("Failed to create address:", addressError)
            // Don't block user creation if address fails
          }
        }

        toast({
          title: t("toast.user_created_title", "Utilisateur créé"),
          description: t("toast.user_created_description", "L'utilisateur a été créé avec succès"),
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
        title: t("toast.error_title", "Erreur"),
        description: error instanceof Error ? error.message : t("toast.error_save_user", "Impossible d'enregistrer l'utilisateur"),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Password strength indicators
  const password = form.watch("password")
  const passwordStrength = useMemo(() => {
    if (!password || isEdit) return null
    return {
      hasMinLength: password.length >= 8,
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
    }
  }, [password, isEdit])

  const isPasswordTouched = !!form.formState.dirtyFields.password

  return (
    <Sheet
      open={open}
      onOpenChange={(state) => {
        form.reset()
        onOpenChange(state)
      }}
    >
      <SheetContent className="flex flex-col overflow-hidden w-full sm:max-w-xl lg:max-w-2xl">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>
            {isEdit ? t("create_dialog.title_edit", "Modifier l'utilisateur") : t("create_dialog.title_create", "Créer un utilisateur")}
          </SheetTitle>
          <SheetDescription>
            {isEdit ? t("create_dialog.description_edit", "Modifiez les informations") : t("create_dialog.description_create", "Remplissez les informations ci-dessous")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-1 -mx-1">
          <Form {...form}>
            <form
              id="user-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6 py-4"
            >
              {/* Personal Information Section */}
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
                    name="firstName"
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
                    name="lastName"
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
                        {t("fields.email.helper", "Adresse pour les notifications")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.phone_number.label", "Numéro de téléphone")}</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder={t("fields.phone_number.placeholder", "+33 6 12 34 56 78")}
                          autoComplete="tel"
                          inputMode="tel"
                          className="h-11"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Account Details Section */}
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
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.password.label", "Mot de passe")}</FormLabel>
                      <FormControl>
                        <PasswordInput
                          placeholder={t("fields.password.placeholder", "Entrez un mot de passe")}
                          autoComplete={isEdit ? "new-password" : "new-password"}
                          className="h-11"
                          {...field}
                        />
                      </FormControl>

                      {/* Password strength indicator */}
                      {passwordStrength && password && (
                        <div className="text-xs space-y-1 mt-2">
                          <p className="text-muted-foreground mb-1">
                            {t("fields.password.requirements", "Requis :")}
                          </p>
                          <div className="space-y-0.5">
                            <div className={`flex items-center gap-1.5 ${passwordStrength.hasMinLength ? "text-green-600 dark:text-green-500" : "text-muted-foreground"}`}>
                              {passwordStrength.hasMinLength ? (
                                <IconCheck className="h-3 w-3" />
                              ) : (
                                <IconX className="h-3 w-3" />
                              )}
                              <span>{t("fields.password.min_length", "8 caractères min.")}</span>
                            </div>
                            <div className={`flex items-center gap-1.5 ${passwordStrength.hasLowercase ? "text-green-600 dark:text-green-500" : "text-muted-foreground"}`}>
                              {passwordStrength.hasLowercase ? (
                                <IconCheck className="h-3 w-3" />
                              ) : (
                                <IconX className="h-3 w-3" />
                              )}
                              <span>{t("fields.password.lowercase", "1 minuscule")}</span>
                            </div>
                            <div className={`flex items-center gap-1.5 ${passwordStrength.hasNumber ? "text-green-600 dark:text-green-500" : "text-muted-foreground"}`}>
                              {passwordStrength.hasNumber ? (
                                <IconCheck className="h-3 w-3" />
                              ) : (
                                <IconX className="h-3 w-3" />
                              )}
                              <span>{t("fields.password.number", "1 chiffre")}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.confirm_password.label", "Confirmer le mot de passe")}</FormLabel>
                      <FormControl>
                        <PasswordInput
                          disabled={!isPasswordTouched}
                          placeholder={t("fields.confirm_password.placeholder", "Confirmez le mot de passe")}
                          autoComplete="new-password"
                          className="h-11"
                          {...field}
                        />
                      </FormControl>
                      {!isPasswordTouched && (
                        <FormDescription>
                          {t("fields.confirm_password.helper", "Entrez d'abord un mot de passe")}
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Address Section - Only for new users */}
              {!isEdit && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground">
                      {t("sections.address", "Adresse (Optionnel)")}
                    </h3>
                    <Separator className="flex-1" />
                  </div>

                  {isLoadingAddressTypes ? (
                    <div className="space-y-2">
                      <Skeleton className="h-32 w-full" />
                    </div>
                  ) : (
                    <AddressInput
                      value={address}
                      onChange={setAddress}
                      addressTypes={addressTypes}
                      required={false}
                    />
                  )}
                </div>
              )}
            </form>
          </Form>
        </div>

        <SheetFooter className="flex-shrink-0 border-t pt-4 bg-background">
          <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              {t("create_dialog.cancel", "Annuler")}
            </Button>
            <Button
              type="submit"
              form="user-form"
              disabled={isSubmitting || isLoadingRoles}
              className="w-full sm:w-auto"
            >
              {isSubmitting && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? t("create_dialog.saving", "Enregistrement...") : t("create_dialog.save_changes", "Enregistrer")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
