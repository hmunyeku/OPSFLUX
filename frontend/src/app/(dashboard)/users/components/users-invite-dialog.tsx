"use client"

import { useState, useEffect } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { IconMailPlus, IconSend, IconRefresh, IconEye, IconEyeOff } from "@tabler/icons-react"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Textarea } from "@/components/ui/textarea"
import SelectDropdown from "@/components/select-dropdown"
import { createUser } from "../data/users-api"
import { getRoles } from "../roles/data/roles-api"
import { Role } from "../roles/data/schema"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUserCreated?: () => void
}

// Password validation according to security policy
const passwordSchema = z
  .string()
  .min(8, { message: "Le mot de passe doit contenir au moins 8 caractères." })
  .regex(/[A-Z]/, { message: "Le mot de passe doit contenir au moins une majuscule." })
  .regex(/[a-z]/, { message: "Le mot de passe doit contenir au moins une minuscule." })
  .regex(/[0-9]/, { message: "Le mot de passe doit contenir au moins un chiffre." })
  .regex(/[^A-Za-z0-9]/, { message: "Le mot de passe doit contenir au moins un caractère spécial." })

const formSchema = z.object({
  email: z
    .string()
    .min(1, { message: "L'email est requis." })
    .email({ message: "L'email est invalide." }),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone_number: z.string().optional(),
  role_id: z.string().min(1, { message: "Le rôle est requis." }),
  password: passwordSchema,
  desc: z.string().optional(),
})
type UserInviteForm = z.infer<typeof formSchema>

// Generate a secure password
function generateSecurePassword(): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const numbers = '0123456789'
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?'
  const all = uppercase + lowercase + numbers + special

  // Ensure at least one of each type
  let password = ''
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += special[Math.floor(Math.random() * special.length)]

  // Fill the rest randomly (total 16 characters)
  for (let i = password.length; i < 16; i++) {
    password += all[Math.floor(Math.random() * all.length)]
  }

  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('')
}

export function UsersInviteDialog({ open, onOpenChange, onUserCreated }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [roles, setRoles] = useState<Role[]>([])
  const [showPassword, setShowPassword] = useState(false)
  const [isLoadingRoles, setIsLoadingRoles] = useState(false)

  const form = useForm<UserInviteForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      first_name: "",
      last_name: "",
      phone_number: "",
      role_id: "",
      password: "",
      desc: ""
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
        title: "Erreur",
        description: "Impossible de charger les rôles",
        variant: "destructive",
      })
    } finally {
      setIsLoadingRoles(false)
    }
  }

  const handleGeneratePassword = () => {
    const newPassword = generateSecurePassword()
    form.setValue('password', newPassword)
    toast({
      title: "Mot de passe généré",
      description: "Un mot de passe sécurisé a été généré automatiquement.",
    })
  }

  const onSubmit = async (values: UserInviteForm) => {
    try {
      setIsSubmitting(true)

      const payload: {
        email: string
        password: string
        first_name?: string
        last_name?: string
        full_name?: string
        phone_numbers?: string[]
        is_active: boolean
      } = {
        email: values.email,
        password: values.password,
        first_name: values.first_name,
        last_name: values.last_name,
        full_name: values.first_name && values.last_name
          ? `${values.first_name} ${values.last_name}`
          : undefined,
        is_active: true,
      }

      // Add phone number if provided
      if (values.phone_number && values.phone_number.trim()) {
        payload.phone_numbers = [values.phone_number.trim()]
      }

      const newUser = await createUser(payload)

      // Assign role to user after creation
      if (values.role_id && newUser.id) {
        try {
          const { assignRolesToUser } = await import('../data/users-api')
          await assignRolesToUser(newUser.id, [values.role_id])
        } catch (_roleError) {
          // Don't fail the whole operation if role assignment fails
          toast({
            title: "Attention",
            description: "L'utilisateur a été créé mais le rôle n'a pas pu être assigné.",
            variant: "default",
          })
        }
      }

      form.reset()
      toast({
        title: "Utilisateur créé",
        description: `L'utilisateur ${values.email} a été créé avec succès.`,
      })
      onOpenChange(false)
      onUserCreated?.()
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de créer l'utilisateur",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        form.reset()
        onOpenChange(state)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <IconMailPlus /> Invite User
          </DialogTitle>
          <DialogDescription>
            Invite new user to join your team by sending them an email
            invitation. Assign a role to define their access level.
          </DialogDescription>
        </DialogHeader>
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
                    <FormLabel>Prénom</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Jean"
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
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="jean.dupont@exemple.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Téléphone (optionnel)</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="+33 6 12 34 56 78"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mot de passe</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Minimum 8 caractères"
                        {...field}
                        className="pr-20"
                      />
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={handleGeneratePassword}
                          title="Générer un mot de passe"
                        >
                          <IconRefresh className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setShowPassword(!showPassword)}
                          title={showPassword ? "Masquer" : "Afficher"}
                        >
                          {showPassword ? (
                            <IconEyeOff className="h-4 w-4" />
                          ) : (
                            <IconEye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
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
              name="role_id"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>Rôle</FormLabel>
                  <SelectDropdown
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                    placeholder={isLoadingRoles ? "Chargement..." : "Sélectionner un rôle"}
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
            <FormField
              control={form.control}
              name="desc"
              render={({ field }) => (
                <FormItem className="">
                  <FormLabel>Description (optionnel)</FormLabel>
                  <FormControl>
                    <Textarea
                      className="resize-none"
                      placeholder="Ajouter une note personnelle (optionnel)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter className="gap-y-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={isSubmitting}>Annuler</Button>
          </DialogClose>
          <Button type="submit" form="user-invite-form" disabled={isSubmitting}>
            {isSubmitting ? "Création..." : "Créer l'utilisateur"} <IconSend />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
