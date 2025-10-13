"use client"

import * as z from "zod"
import { useForm } from "react-hook-form"
import { IconHome, IconId, IconMessage2Question } from "@tabler/icons-react"
import { zodResolver } from "@hookform/resolvers/zod"
import Image from "next/image"
import Link from "next/link"
import { nofitySubmittedValues } from "@/lib/notify-submitted-values"
import { Badge } from "@/components/ui/badge"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DeleteActions } from "./delete-actions"
import { themes } from "@/config/themes"

const formSchema = z.object({
  // Application Settings
  app_name: z.string().min(1, {
    message: "Application name is required.",
  }),
  app_logo: z
    .instanceof(File)
    .refine(
      (file) =>
        ["image/webp", "image/jpeg", "image/png", "image/svg+xml"].includes(
          file.type
        ),
      {
        message: "Only WebP, JPEG, PNG, or SVG files are allowed",
      }
    )
    .optional(),
  default_theme: z.string({
    required_error: "Default theme is required.",
  }),
  default_language: z.string({
    required_error: "Default language is required.",
  }),
  font: z.string({
    required_error: "Font is required.",
  }),

  // Company Settings
  company_name: z.string().optional(),
  company_logo: z
    .instanceof(File)
    .refine(
      (file) =>
        ["image/webp", "image/jpeg", "image/png", "image/svg+xml"].includes(
          file.type
        ),
      {
        message: "Only WebP, JPEG, PNG, or SVG files are allowed",
      }
    )
    .optional(),
  company_tax_id: z.string().optional(),
  company_address: z.string().optional(),
})

export default function GeneralForm() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      app_name: "OpsFlux",
      default_theme: "amethyst-haze",
      default_language: "fr",
      font: "inter",
      company_name: "",
      company_tax_id: "",
      company_address: "",
    },
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    nofitySubmittedValues(values)
  }

  return (
    <Form {...form}>
      <div className="flex w-full flex-col items-start justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-center">
        <div className="flex flex-col items-start text-sm">
          <p className="font-bold tracking-wide">
            Your application is currently on the free plan
          </p>
          <p className="text-muted-foreground font-medium">
            Paid plans offer higher usage limits, additional branches, and much
            more. Learn more{" "}
            <Link href="" className="underline">
              here
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary">
            <IconMessage2Question />
            Chat to us
          </Button>
          <Button variant="outline">Upgrade</Button>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-8">
        {/* Application Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration de l&apos;application</CardTitle>
            <CardDescription>
              Paramètres généraux de votre application OpsFlux
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="app_name"
              render={({ field }) => (
                <FormItem className="flex flex-col items-start justify-between md:flex-row md:items-center">
                  <div>
                    <FormLabel>Nom de l&apos;application</FormLabel>
                    <FormDescription>
                      Le nom qui apparaîtra dans l&apos;interface
                    </FormDescription>
                    <FormMessage />
                  </div>
                  <div className="w-full md:w-[300px]">
                    <FormControl>
                      <Input placeholder="OpsFlux" {...field} />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="app_logo"
              render={({ field: { value, onChange, ...fieldProps } }) => (
                <FormItem className="flex flex-col items-start justify-between md:flex-row md:items-center">
                  <div>
                    <FormLabel>Logo de l&apos;application</FormLabel>
                    <FormDescription>
                      Logo affiché dans la barre latérale
                    </FormDescription>
                    <FormMessage />
                  </div>
                  <div className="flex items-center gap-2">
                    {value && (
                      <Image
                        alt="app-logo"
                        width={35}
                        height={35}
                        className="h-[35px] w-[35px] rounded-md object-cover"
                        src={URL.createObjectURL(value)}
                      />
                    )}
                    <FormControl>
                      <Input
                        {...fieldProps}
                        type="file"
                        placeholder="Logo"
                        accept="image/webp,image/jpeg,image/png,image/svg+xml"
                        onChange={(event) =>
                          onChange(event.target.files && event.target.files[0])
                        }
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="default_theme"
              render={({ field }) => (
                <FormItem className="flex flex-col items-start justify-between md:flex-row md:items-center">
                  <div>
                    <FormLabel>Thème par défaut</FormLabel>
                    <FormDescription>
                      Thème de couleur par défaut pour tous les utilisateurs
                    </FormDescription>
                    <FormMessage />
                  </div>
                  <div>
                    <FormControl>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        defaultValue={field.value}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Sélectionner un thème" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(themes).map(([key, theme]) => (
                            <SelectItem key={key} value={key}>
                              {theme.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="default_language"
              render={({ field }) => (
                <FormItem className="flex flex-col items-start justify-between md:flex-row md:items-center">
                  <div>
                    <FormLabel>Langue par défaut</FormLabel>
                    <FormDescription>
                      Langue par défaut de l&apos;interface
                    </FormDescription>
                    <FormMessage />
                  </div>
                  <div>
                    <FormControl>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        defaultValue={field.value}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Sélectionner" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fr">Français</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="font"
              render={({ field }) => (
                <FormItem className="flex flex-col items-start justify-between md:flex-row md:items-center">
                  <div>
                    <FormLabel>Police système</FormLabel>
                    <FormDescription>
                      Police utilisée dans l&apos;interface
                    </FormDescription>
                    <FormMessage />
                  </div>
                  <div>
                    <FormControl>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        defaultValue={field.value}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Sélectionner" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inter">Inter</SelectItem>
                          <SelectItem value="manrope">Manrope</SelectItem>
                          <SelectItem value="system">System</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Company Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration de l&apos;entreprise</CardTitle>
            <CardDescription>
              Informations sur votre entreprise (optionnel)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="company_name"
              render={({ field }) => (
                <FormItem className="flex flex-col items-start justify-between md:flex-row md:items-center">
                  <div>
                    <FormLabel>Nom de l&apos;entreprise</FormLabel>
                    <FormDescription>Nom de votre entreprise</FormDescription>
                    <FormMessage />
                  </div>
                  <div className="w-full md:w-[300px]">
                    <FormControl>
                      <Input placeholder="Mon entreprise" {...field} />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="company_logo"
              render={({ field: { value, onChange, ...fieldProps } }) => (
                <FormItem className="flex flex-col items-start justify-between md:flex-row md:items-center">
                  <div>
                    <FormLabel>Logo de l&apos;entreprise</FormLabel>
                    <FormDescription>
                      Logo de votre entreprise
                    </FormDescription>
                    <FormMessage />
                  </div>
                  <div className="flex items-center gap-2">
                    {value && (
                      <Image
                        alt="company-logo"
                        width={35}
                        height={35}
                        className="h-[35px] w-[35px] rounded-md object-cover"
                        src={URL.createObjectURL(value)}
                      />
                    )}
                    <FormControl>
                      <Input
                        {...fieldProps}
                        type="file"
                        placeholder="Logo entreprise"
                        accept="image/webp,image/jpeg,image/png,image/svg+xml"
                        onChange={(event) =>
                          onChange(event.target.files && event.target.files[0])
                        }
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="company_tax_id"
              render={({ field }) => (
                <FormItem className="flex flex-col items-start justify-between md:flex-row md:items-center">
                  <div>
                    <FormLabel>Numéro d&apos;identification fiscale</FormLabel>
                    <FormDescription>
                      Numéro fiscal de l&apos;entreprise
                    </FormDescription>
                    <FormMessage />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-full md:w-[300px]">
                      <FormControl>
                        <Input placeholder="FR123456789" {...field} />
                      </FormControl>
                    </div>
                    <Badge variant="outline" className="py-2">
                      <IconId size={20} strokeWidth={1.5} />
                    </Badge>
                  </div>
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="company_address"
              render={({ field }) => (
                <FormItem className="flex flex-col items-start justify-between md:flex-row md:items-center">
                  <div>
                    <FormLabel>Adresse de l&apos;entreprise</FormLabel>
                    <FormDescription>
                      Adresse complète de l&apos;entreprise
                    </FormDescription>
                    <FormMessage />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-full md:w-[300px]">
                      <FormControl>
                        <Input placeholder="123 Rue Example, Paris" {...field} />
                      </FormControl>
                    </div>
                    <Badge variant="outline" className="py-2">
                      <IconHome size={20} strokeWidth={1.5} />
                    </Badge>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Button type="submit">Enregistrer les modifications</Button>
      </form>

      <div className="mt-10 mb-4 flex w-full flex-col items-start justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-center">
        <div className="flex flex-col items-start text-sm">
          <p className="font-bold tracking-wide">Supprimer le compte</p>
          <p className="text-muted-foreground font-medium">
            Vous pouvez désactiver votre compte pour faire une pause.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DeleteActions />
        </div>
      </div>
    </Form>
  )
}
