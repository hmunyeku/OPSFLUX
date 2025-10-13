"use client"

import * as z from "zod"
import { useForm } from "react-hook-form"
import { useState, useMemo, useEffect } from "react"
import { IconHome, IconId, IconMessage2Question, IconChevronDown, IconChevronUp } from "@tabler/icons-react"
import { zodResolver } from "@hookform/resolvers/zod"
import Image from "next/image"
import Link from "next/link"
import { nofitySubmittedValues } from "@/lib/notify-submitted-values"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
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

interface ConfigItem {
  key: keyof z.infer<typeof formSchema>
  label: string
  description: string
  category: string
  renderField: (form: ReturnType<typeof useForm<z.infer<typeof formSchema>>>) => React.ReactNode
}

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

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({})

  const configItems: ConfigItem[] = useMemo(
    () => [
      // Application Configuration
      {
        key: "app_name",
        label: "Nom de l'application",
        description: "Le nom qui apparaîtra dans l'interface",
        category: "Configuration de l'application",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="app_name"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input placeholder="OpsFlux" {...field} className="w-full md:w-[300px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "app_logo",
        label: "Logo de l'application",
        description: "Logo affiché dans la barre latérale",
        category: "Configuration de l'application",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="app_logo"
            render={({ field: { value, onChange, ...fieldProps } }) => (
              <FormItem>
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
                      className="w-full md:w-[300px]"
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "default_theme",
        label: "Thème par défaut",
        description: "Thème de couleur par défaut pour tous les utilisateurs",
        category: "Configuration de l'application",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="default_theme"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <SelectTrigger className="w-full md:w-[300px]">
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
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "default_language",
        label: "Langue par défaut",
        description: "Langue par défaut de l'interface",
        category: "Configuration de l'application",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="default_language"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <SelectTrigger className="w-full md:w-[300px]">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fr">Français</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "font",
        label: "Police système",
        description: "Police utilisée dans l'interface",
        category: "Configuration de l'application",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="font"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <SelectTrigger className="w-full md:w-[300px]">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inter">Inter</SelectItem>
                      <SelectItem value="manrope">Manrope</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      // Company Configuration
      {
        key: "company_name",
        label: "Nom de l'entreprise",
        description: "Nom de votre entreprise",
        category: "Configuration de l'entreprise",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="company_name"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input placeholder="Mon entreprise" {...field} className="w-full md:w-[300px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "company_logo",
        label: "Logo de l'entreprise",
        description: "Logo de votre entreprise",
        category: "Configuration de l'entreprise",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="company_logo"
            render={({ field: { value, onChange, ...fieldProps } }) => (
              <FormItem>
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
                      className="w-full md:w-[300px]"
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "company_tax_id",
        label: "Numéro d'identification fiscale",
        description: "Numéro fiscal de l'entreprise",
        category: "Configuration de l'entreprise",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="company_tax_id"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  <FormControl>
                    <Input placeholder="FR123456789" {...field} className="w-full md:w-[300px]" />
                  </FormControl>
                  <Badge variant="outline" className="py-2">
                    <IconId size={20} strokeWidth={1.5} />
                  </Badge>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
      {
        key: "company_address",
        label: "Adresse de l'entreprise",
        description: "Adresse complète de l'entreprise",
        category: "Configuration de l'entreprise",
        renderField: (form) => (
          <FormField
            control={form.control}
            name="company_address"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  <FormControl>
                    <Input placeholder="123 Rue Example, Paris" {...field} className="w-full md:w-[300px]" />
                  </FormControl>
                  <Badge variant="outline" className="py-2">
                    <IconHome size={20} strokeWidth={1.5} />
                  </Badge>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        ),
      },
    ],
    []
  )

  const groupedConfig = useMemo(() => {
    const groups: Record<string, ConfigItem[]> = {}
    configItems.forEach((item) => {
      if (!groups[item.category]) {
        groups[item.category] = []
      }
      groups[item.category].push(item)
    })
    return groups
  }, [configItems])

  useEffect(() => {
    setExpandedCategories(
      Object.keys(groupedConfig).reduce((acc, key) => ({ ...acc, [key]: true }), {})
    )
  }, [groupedConfig])

  const columns = useMemo<ColumnDef<ConfigItem>[]>(
    () => [
      {
        accessorKey: "label",
        header: "Paramètre",
        cell: ({ row }) => (
          <div className="min-w-[200px]">
            <span className="font-medium">{row.original.label}</span>
          </div>
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <div className="text-muted-foreground text-sm max-w-md">
            {row.original.description}
          </div>
        ),
      },
      {
        accessorKey: "value",
        header: "Valeur",
        cell: ({ row }) => (
          <div className="min-w-[250px]">
            {row.original.renderField(form)}
          </div>
        ),
      },
    ],
    [form]
  )

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }))
  }

  function CategoryTable({ items, category }: { items: ConfigItem[]; category: string }) {
    const table = useReactTable({
      data: items,
      columns,
      getCoreRowModel: getCoreRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      getSortedRowModel: getSortedRowModel(),
    })

    const isExpanded = expandedCategories[category] ?? true

    return (
      <div className="rounded-lg border">
        <Button
          variant="ghost"
          onClick={() => toggleCategory(category)}
          className="w-full justify-between p-4 h-auto hover:bg-muted/50"
        >
          <h3 className="text-lg font-semibold">{category}</h3>
          {isExpanded ? (
            <IconChevronUp className="h-5 w-5" />
          ) : (
            <IconChevronDown className="h-5 w-5" />
          )}
        </Button>

        {isExpanded && (
          <>
            {/* Vue desktop */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-24 text-center"
                      >
                        Aucun résultat.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Vue mobile - Cards */}
            <div className="md:hidden p-4 space-y-3">
              {items.map((item) => (
                <div
                  key={item.key}
                  className="rounded-lg border p-4 space-y-3"
                >
                  <div className="space-y-1">
                    <h4 className="font-medium text-sm">{item.label}</h4>
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <div className="pt-2">
                    {item.renderField(form)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <Form {...form}>
      <div className="flex w-full flex-col items-start justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-center">
        <div className="flex flex-col items-start text-sm">
          <p className="font-bold tracking-wide">
            Votre application est actuellement sur le plan gratuit
          </p>
          <p className="text-muted-foreground font-medium">
            Les plans payants offrent des limites d&apos;utilisation plus élevées, des branches supplémentaires et bien plus encore. En savoir plus{" "}
            <Link href="" className="underline">
              ici
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary">
            <IconMessage2Question />
            Nous contacter
          </Button>
          <Button variant="outline">Mettre à niveau</Button>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-8">
        <div className="space-y-4">
          {Object.entries(groupedConfig).map(([category, items]) => (
            <CategoryTable key={category} items={items} category={category} />
          ))}
        </div>

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
