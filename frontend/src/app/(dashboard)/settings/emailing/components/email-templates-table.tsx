"use client"

import { useEffect, useState, useMemo } from "react"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  PaginationState,
} from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { IconDotsVertical, IconEdit, IconMail, IconTrash, IconChevronLeft, IconChevronRight, IconChevronsLeft, IconChevronsRight, IconArrowUp, IconClock } from "@tabler/icons-react"
import { useToast } from "@/hooks/use-toast"
import { apiClient } from "@/lib/api-client"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"
import { usePreferences } from "@/hooks/use-preferences"

interface EmailTemplate {
  id: string
  name: string
  slug: string
  description: string | null
  category: string
  subject: string
  is_active: boolean
  is_system: boolean
  sent_count: number
  created_at: string
  updated_at: string
}

interface EmailTemplatesTableProps {
  onEdit: (templateId: string) => void
  searchQuery?: string
  categoryFilter?: string
}

export default function EmailTemplatesTable({ onEdit, searchQuery = "", categoryFilter = "all" }: EmailTemplatesTableProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sorting, setSorting] = useState<SortingState>([])
  const { toast } = useToast()
  const { preferences, isLoaded } = usePreferences()

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null)

  // Update page size when preferences are loaded
  useEffect(() => {
    if (isLoaded && preferences.itemsPerPage) {
      setPagination((prev) => ({
        ...prev,
        pageSize: preferences.itemsPerPage,
        pageIndex: 0, // Reset to first page when changing page size
      }))
    }
  }, [isLoaded, preferences.itemsPerPage])

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get("/api/v1/email-templates/", {
        params: {
          skip: pagination.pageIndex * pagination.pageSize,
          limit: pagination.pageSize,
        },
      })
      const responseData = response.data as { data: EmailTemplate[]; count: number }
      setTemplates(responseData.data)
      setTotal(responseData.count)
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les templates d'email",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.pageIndex, pagination.pageSize])

  // Filter templates based on search and category
  const filteredTemplates = useMemo(() => {
    let filtered = templates

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.slug.toLowerCase().includes(query) ||
          t.description?.toLowerCase().includes(query) ||
          t.subject.toLowerCase().includes(query)
      )
    }

    // Apply category filter
    if (categoryFilter && categoryFilter !== "all") {
      filtered = filtered.filter((t) => t.category === categoryFilter)
    }

    return filtered
  }, [templates, searchQuery, categoryFilter])

  const handleDelete = (templateId: string, isSystem: boolean) => {
    if (isSystem) {
      toast({
        title: "Action impossible",
        description: "Les templates système ne peuvent pas être supprimés",
        variant: "destructive",
      })
      return
    }

    setTemplateToDelete(templateId)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!templateToDelete) return

    setDeleteDialogOpen(false)

    try {
      await apiClient.delete(`/api/v1/email-templates/${templateToDelete}`)
      toast({
        title: "Succès",
        description: "Template supprimé avec succès",
      })
      fetchTemplates()
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le template",
        variant: "destructive",
      })
    } finally {
      setTemplateToDelete(null)
    }
  }

  const handleSendTest = async (templateId: string) => {
    const email = prompt("Entrez l'adresse email pour le test:")
    if (!email) return

    try {
      await apiClient.post("/api/v1/email-templates/send-test", {
        template_id: templateId,
        to_email: email,
        test_data: {},
      })
      toast({
        title: "Succès",
        description: `Email de test envoyé à ${email}`,
      })
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } } }
      toast({
        title: "Erreur",
        description: err.response?.data?.message || "Impossible d'envoyer l'email de test",
        variant: "destructive",
      })
    }
  }

  const getCategoryBadge = (category: string) => {
    const categoryMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
      transactional: { label: "Transactionnel", variant: "default" },
      notification: { label: "Notification", variant: "secondary" },
      marketing: { label: "Marketing", variant: "outline" },
      system: { label: "Système", variant: "destructive" },
      custom: { label: "Personnalisé", variant: "outline" },
    }
    const config = categoryMap[category] || { label: category, variant: "outline" }
    return <Badge variant={config.variant} className="text-xs">{config.label}</Badge>
  }

  const columns = useMemo<ColumnDef<EmailTemplate>[]>(() => [
      {
        accessorKey: "name",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8 text-xs sm:text-sm"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Nom
              <IconArrowUp className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => {
          return (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-sm">{row.getValue("name")}</span>
              <span className="text-xs text-muted-foreground font-mono">{row.original.slug}</span>
            </div>
          )
        },
      },
      {
        accessorKey: "category",
        header: "Catégorie",
        cell: ({ row }) => getCategoryBadge(row.getValue("category")),
      },
      {
        accessorKey: "subject",
        header: "Sujet",
        cell: ({ row }) => {
          const subject = row.getValue("subject") as string
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="max-w-md truncate cursor-help text-sm">{subject}</div>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">{subject}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        },
      },
      {
        accessorKey: "is_active",
        header: "Statut",
        cell: ({ row }) => {
          const isActive = row.getValue("is_active") as boolean
          return (
            <Badge variant={isActive ? "default" : "outline"} className="text-xs">
              {isActive ? "Actif" : "Inactif"}
            </Badge>
          )
        },
      },
      {
        accessorKey: "sent_count",
        header: "Envoyés",
        cell: ({ row }) => {
          return <span className="text-muted-foreground text-sm">{row.getValue("sent_count")}</span>
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const template = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <IconDotsVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onEdit(template.id)}>
                  <IconEdit className="mr-2 h-4 w-4" />
                  Modifier
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSendTest(template.id)}>
                  <IconMail className="mr-2 h-4 w-4" />
                  Envoyer un test
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => handleDelete(template.id, template.is_system)}
                  disabled={template.is_system}
                >
                  <IconTrash className="mr-2 h-4 w-4" />
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], []
  )

  const table = useReactTable({
    data: filteredTemplates,
    columns,
    state: {
      sorting,
      pagination,
    },
    pageCount: Math.ceil(filteredTemplates.length / pagination.pageSize),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: false, // Changed to false since we're filtering client-side
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-muted-foreground">Chargement des templates...</div>
      </div>
    )
  }

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <IconMail className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Aucun template</h3>
        <p className="text-sm text-muted-foreground">
          Créez votre premier template d&apos;email pour commencer
        </p>
      </div>
    )
  }

  if (filteredTemplates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <IconMail className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Aucun résultat</h3>
        <p className="text-sm text-muted-foreground">
          Essayez de modifier vos filtres ou votre recherche
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 w-full">
      {/* Vue Desktop - Table */}
      <div className="hidden md:block w-full">
        <div className="rounded-md border w-full overflow-auto">
          <Table className="min-w-full">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/50">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Vue Mobile - Cards */}
      <div className="md:hidden space-y-3">
        {table.getRowModel().rows.map((row) => {
          const template = row.original
          return (
            <Card
              key={template.id}
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
              onClick={() => onEdit(template.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <IconMail className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate mb-0.5">{template.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono truncate">{template.slug}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                        <IconDotsVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(template.id) }}>
                        <IconEdit className="mr-2 h-4 w-4" />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSendTest(template.id) }}>
                        <IconMail className="mr-2 h-4 w-4" />
                        Test
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleDelete(template.id, template.is_system) }}
                        disabled={template.is_system}
                      >
                        <IconTrash className="mr-2 h-4 w-4" />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Sujet</p>
                    <p className="text-xs line-clamp-2 font-medium">{template.subject}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {getCategoryBadge(template.category)}
                    <Badge variant={template.is_active ? "default" : "outline"} className="text-[10px] py-0.5 px-2">
                      {template.is_active ? "Actif" : "Inactif"}
                    </Badge>
                    {template.is_system && (
                      <Badge variant="destructive" className="text-[10px] py-0.5 px-2">Système</Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                    <span className="flex items-center gap-1">
                      <IconMail className="h-3 w-3" />
                      {template.sent_count} envoyés
                    </span>
                    <span className="flex items-center gap-1">
                      <IconClock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(template.updated_at), { addSuffix: true, locale: fr })}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Pagination */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2 w-full">
        <div className="flex items-center justify-between sm:justify-start gap-3 text-xs sm:text-sm">
          <p className="text-muted-foreground whitespace-nowrap">
            {pagination.pageIndex * pagination.pageSize + 1}-
            {Math.min((pagination.pageIndex + 1) * pagination.pageSize, filteredTemplates.length)} sur {filteredTemplates.length}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs hidden xs:inline">Lignes:</span>
            <Select
              value={`${pagination.pageSize}`}
              onValueChange={(value) => {
                setPagination((prev) => ({ ...prev, pageSize: Number(value), pageIndex: 0 }))
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue placeholder={pagination.pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 25, 50, 100].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1 sm:gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 hidden sm:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <IconChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <IconChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-xs sm:text-sm font-medium px-2 min-w-[80px] sm:min-w-[100px] text-center">
            Page {pagination.pageIndex + 1}/{table.getPageCount()}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <IconChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 hidden sm:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <IconChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* AlertDialog pour confirmer la suppression */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce template ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer ce template ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
