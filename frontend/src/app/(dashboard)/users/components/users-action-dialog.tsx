"use client"

import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "@/hooks/use-toast"
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
import { userTypes } from "../data/data"
import { User } from "../data/schema"
import { createUser, updateUser } from "../data/users-api"
import { useState } from "react"

interface Props {
  currentRow?: User
  open: boolean
  onOpenChange: (open: boolean) => void
  onUserCreated?: () => void
}

const formSchema = z
  .object({
    firstName: z.string().min(1, { message: "First Name is required." }),
    lastName: z.string().min(1, { message: "Last Name is required." }),
    username: z.string().min(1, { message: "Username is required." }),
    phoneNumber: z.string().min(1, { message: "Phone number is required." }),
    email: z
      .string()
      .min(1, { message: "Email is required." })
      .email({ message: "Email is invalid." }),
    password: z.string().transform((pwd) => pwd.trim()),
    role: z.string().min(1, { message: "Role is required." }),
    confirmPassword: z.string().transform((pwd) => pwd.trim()),
    isEdit: z.boolean(),
  })
  .superRefine(({ isEdit, password, confirmPassword }, ctx) => {
    if (!isEdit || (isEdit && password !== "")) {
      if (password === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Password is required.",
          path: ["password"],
        })
      }

      if (password.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Password must be at least 8 characters long.",
          path: ["password"],
        })
      }

      if (!password.match(/[a-z]/)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Password must contain at least one lowercase letter.",
          path: ["password"],
        })
      }

      if (!password.match(/\d/)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Password must contain at least one number.",
          path: ["password"],
        })
      }

      if (password !== confirmPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Passwords don't match.",
          path: ["confirmPassword"],
        })
      }
    }
  })
type UserForm = z.infer<typeof formSchema>

export function UsersActionDialog({ currentRow, open, onOpenChange, onUserCreated }: Props) {
  const isEdit = !!currentRow
  const [isSubmitting, setIsSubmitting] = useState(false)
  const form = useForm<UserForm>({
    resolver: zodResolver(formSchema),
    defaultValues: isEdit
      ? {
          ...currentRow,
          password: "",
          confirmPassword: "",
          isEdit,
        }
      : {
          firstName: "",
          lastName: "",
          username: "",
          email: "",
          role: "",
          phoneNumber: "",
          password: "",
          confirmPassword: "",
          isEdit,
        },
  })

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
          title: "User updated",
          description: "The user has been updated successfully.",
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
          title: "User created",
          description: "The user has been created successfully.",
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
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save user",
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
          <SheetTitle>{isEdit ? "Edit User" : "Add New User"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Update the user here. " : "Create new user here. "}
            Click save when you&apos;re done.
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
                    First Name
                  </FormLabel>
                  <div className="sm:col-span-4">
                    <FormControl>
                      <Input
                        placeholder="John"
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
                    Last Name
                  </FormLabel>
                  <div className="sm:col-span-4">
                    <FormControl>
                      <Input
                        placeholder="Doe"
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
              name="username"
              render={({ field }) => (
                <FormItem className="grid grid-cols-1 sm:grid-cols-6 items-start sm:items-center gap-2 sm:gap-x-4">
                  <FormLabel className="sm:col-span-2 sm:text-right">
                    Username
                  </FormLabel>
                  <div className="sm:col-span-4">
                    <FormControl>
                      <Input
                        placeholder="john_doe"
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
                  <FormLabel className="sm:col-span-2 sm:text-right">Email</FormLabel>
                  <div className="sm:col-span-4">
                    <FormControl>
                      <Input
                        placeholder="john.doe@gmail.com"
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
                    Phone Number
                  </FormLabel>
                  <div className="sm:col-span-4">
                    <FormControl>
                      <Input
                        placeholder="+123456789"
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
              name="role"
              render={({ field }) => (
                <FormItem className="grid grid-cols-1 sm:grid-cols-6 items-start sm:items-center gap-2 sm:gap-x-4">
                  <FormLabel className="sm:col-span-2 sm:text-right">Role</FormLabel>
                  <div className="sm:col-span-4">
                    <SelectDropdown
                      defaultValue={field.value}
                      onValueChange={field.onChange}
                      placeholder="Select a role"
                      items={userTypes.map(({ label, value }) => ({
                        label,
                        value,
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
                    Password
                  </FormLabel>
                  <div className="sm:col-span-4">
                    <FormControl>
                      <PasswordInput
                        placeholder="********"
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
                    Confirm Password
                  </FormLabel>
                  <div className="sm:col-span-4">
                    <FormControl>
                      <PasswordInput
                        disabled={!isPasswordTouched}
                        placeholder="********"
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
            {isSubmitting ? "Saving..." : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
