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
import { IconDotsVertical, IconEdit, IconMail, IconTrash, IconChevronLeft, IconChevronRight, IconChevronsLeft, IconChevronsRight, IconArrowUp } from "@tabler/icons-react"
import { useToast } from "@/hooks/use-toast"
import { apiClient } from "@/lib/api-client"

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
}

export default function EmailTemplatesTable({ onEdit }: EmailTemplatesTableProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  const { toast } = useToast()

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
      // Error fetching email templates
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

  const handleDelete = async (templateId: string, isSystem: boolean) => {
    if (isSystem) {
      toast({
        title: "Action impossible",
        description: "Les templates système ne peuvent pas être supprimés",
        variant: "destructive",
      })
      return
    }

    if (!confirm("Êtes-vous sûr de vouloir supprimer ce template ?")) {
      return
    }

    try {
      await apiClient.delete(`/api/v1/email-templates/${templateId}`)
      toast({
        title: "Succès",
        description: "Template supprimé avec succès",
      })
      fetchTemplates()
    } catch (_error) {
      // Error deleting template
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le template",
        variant: "destructive",
      })
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
      // Error sending test email
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
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const columns = useMemo<ColumnDef<EmailTemplate>[]>(() => [
      {
        accessorKey: "name",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Nom
              <IconArrowUp className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => {
          return (
            <div className="flex flex-col">
              <span className="font-medium">{row.getValue("name")}</span>
              <span className="text-xs text-muted-foreground">{row.original.slug}</span>
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
                  <div className="max-w-md truncate cursor-help">{subject}</div>
                </TooltipTrigger>
                <TooltipContent>{subject}</TooltipContent>
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
            <Badge variant={isActive ? "default" : "outline"}>
              {isActive ? "Actif" : "Inactif"}
            </Badge>
          )
        },
      },
      {
        accessorKey: "sent_count",
        header: "Envoyés",
        cell: ({ row }) => {
          return <span className="text-muted-foreground">{row.getValue("sent_count")}</span>
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
                <Button variant="ghost" size="icon">
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
    data: templates,
    columns,
    state: {
      sorting,
      pagination,
    },
    pageCount: Math.ceil(total / pagination.pageSize),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
  })

  if (loading) {
    return <div className="text-center py-8">Chargement...</div>
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border overflow-x-auto">
        <Table className="min-w-[800px]">
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
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Aucun template trouvé.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center space-x-2 text-xs sm:text-sm">
          <p className="text-muted-foreground">
            <span className="hidden sm:inline">Affichage de </span>
            {pagination.pageIndex * pagination.pageSize + 1}-{Math.min((pagination.pageIndex + 1) * pagination.pageSize, total)}
            <span className="hidden sm:inline"> sur</span>
            <span className="sm:hidden">/</span> {total}
          </p>
        </div>
        <div className="flex items-center justify-between sm:justify-end space-x-4 sm:space-x-6">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium">Lignes par page</p>
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
                {[10, 20, 30, 50, 100].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <IconChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <IconChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1">
              <div className="text-sm font-medium">
                Page {pagination.pageIndex + 1} sur {table.getPageCount()}
              </div>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <IconChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <IconChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
