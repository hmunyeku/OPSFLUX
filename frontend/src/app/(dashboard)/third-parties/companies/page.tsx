"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  IconPlus,
  IconSearch,
  IconFilter,
  IconBuilding,
  IconStar,
  IconTrendingUp,
  IconUsers,
  IconSparkles,
  IconEdit,
  IconTrash,
  IconEye,
} from "@tabler/icons-react"
import { getCompanies, getCompanyStats, deleteCompany } from "@/lib/api/third-parties"
import { auth } from "@/lib/auth"
import type { Company, CompanyStats } from "@/types/third-parties"
import { CompanyTypeLabels, CompanyStatusLabels } from "@/types/third-parties"
import Link from "next/link"
import { Skeleton } from "@/components/ui/skeleton"
import { PermissionGuard } from "@/components/permission-guard"
import { useToast } from "@/hooks/use-toast"
import { ScrollArea } from "@/components/ui/scroll-area"
import { motion, AnimatePresence } from "framer-motion"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
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

export default function CompaniesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [companies, setCompanies] = useState<Company[]>([])
  const [stats, setStats] = useState<CompanyStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; company: Company | null }>({
    open: false,
    company: null,
  })

  useEffect(() => {
    fetchData()
  }, [searchQuery, statusFilter, typeFilter])

  const fetchData = async () => {
    const token = auth.getToken()
    if (!token) return

    setIsLoading(true)
    try {
      const [companiesData, statsData] = await Promise.all([
        getCompanies(token, {
          search: searchQuery || undefined,
          status: statusFilter !== "all" ? statusFilter as any : undefined,
          company_type: typeFilter !== "all" ? typeFilter as any : undefined,
        }),
        getCompanyStats(token),
      ])
      setCompanies(companiesData.data)
      setStats(statsData)
    } catch (error) {
      console.error("Failed to fetch companies:", error)
      toast({
        title: "Erreur",
        description: "Impossible de charger les entreprises",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteDialog.company) return

    const token = auth.getToken()
    if (!token) return

    try {
      await deleteCompany(token, deleteDialog.company.id)
      toast({
        title: "Entreprise supprimée",
        description: `L'entreprise "${deleteDialog.company.name}" a été supprimée`,
      })
      fetchData()
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de supprimer l'entreprise",
        variant: "destructive",
      })
    } finally {
      setDeleteDialog({ open: false, company: null })
    }
  }

  const statsData = [
    {
      label: "Total",
      value: stats?.total || 0,
      icon: IconBuilding,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Actifs",
      value: stats?.by_status.active || 0,
      icon: IconStar,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      label: "Prospects",
      value: stats?.by_status.prospect || 0,
      icon: IconTrendingUp,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
    },
    {
      label: "Clients",
      value: stats?.by_type.clients || 0,
      icon: IconUsers,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
  ]

  return (
    <PermissionGuard permission="companies.read">
      <Header />
      <ScrollArea className="h-[calc(100vh-4rem)]">
        <div className="container py-8 space-y-8">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-purple-500/5 to-blue-500/5 p-8 border"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(120,119,198,0.1),rgba(255,255,255,0))]" />
            <div className="relative">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-3 rounded-xl bg-primary/10">
                      <IconSparkles className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold tracking-tight">Entreprises</h1>
                      <p className="text-muted-foreground mt-1">
                        Gérez vos clients, fournisseurs et partenaires
                      </p>
                    </div>
                  </div>
                </div>
                <PermissionGuard permission="companies.create">
                  <Button asChild size="lg" className="shadow-lg">
                    <Link href="/third-parties/companies/new">
                      <IconPlus className="h-5 w-5 mr-2" />
                      Nouvelle entreprise
                    </Link>
                  </Button>
                </PermissionGuard>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                {statsData.map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                    className="bg-background/50 backdrop-blur-sm rounded-xl p-4 border"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                        <stat.icon className={`h-5 w-5 ${stat.color}`} />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{stat.value}</p>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Filters & Search */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <div className="relative flex-1">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher une entreprise..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <IconFilter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="inactive">Inactif</SelectItem>
                <SelectItem value="prospect">Prospect</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="supplier">Fournisseur</SelectItem>
                <SelectItem value="partner">Partenaire</SelectItem>
                <SelectItem value="contractor">Sous-traitant</SelectItem>
              </SelectContent>
            </Select>
          </motion.div>

          {/* Companies List */}
          <div>
            {isLoading ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-48 rounded-xl" />
                ))}
              </div>
            ) : companies.length > 0 ? (
              <AnimatePresence mode="popLayout">
                <motion.div
                  layout
                  className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                >
                  {companies.map((company, index) => (
                    <motion.div
                      key={company.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.2, delay: index * 0.05 }}
                    >
                      <Card className="group hover:shadow-lg transition-all duration-300 cursor-pointer h-full">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex-1 min-w-0">
                              <Link href={`/third-parties/companies/${company.id}`}>
                                <h3 className="text-lg font-semibold truncate group-hover:text-primary transition-colors">
                                  {company.name}
                                </h3>
                              </Link>
                              {company.legal_name && (
                                <p className="text-sm text-muted-foreground truncate">
                                  {company.legal_name}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 mb-4">
                            <Badge variant="secondary" className="text-xs">
                              {CompanyTypeLabels[company.company_type]}
                            </Badge>
                            <Badge
                              variant={company.status === "active" ? "default" : "outline"}
                              className="text-xs"
                            >
                              {CompanyStatusLabels[company.status]}
                            </Badge>
                          </div>

                          {company.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                              {company.description}
                            </p>
                          )}

                          <div className="flex items-center justify-between pt-4 border-t">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <IconUsers className="h-4 w-4" />
                              <span>{company.contact_count || 0} contact(s)</span>
                            </div>

                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                                className="h-8 w-8"
                              >
                                <Link href={`/third-parties/companies/${company.id}`}>
                                  <IconEye className="h-4 w-4" />
                                </Link>
                              </Button>
                              <PermissionGuard permission="companies.update">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  asChild
                                  className="h-8 w-8"
                                >
                                  <Link href={`/third-parties/companies/${company.id}/edit`}>
                                    <IconEdit className="h-4 w-4" />
                                  </Link>
                                </Button>
                              </PermissionGuard>
                              <PermissionGuard permission="companies.delete">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setDeleteDialog({ open: true, company })}
                                >
                                  <IconTrash className="h-4 w-4" />
                                </Button>
                              </PermissionGuard>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </motion.div>
              </AnimatePresence>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-16 text-center"
              >
                <div className="rounded-full bg-muted p-6 mb-6">
                  <IconBuilding className="h-12 w-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Aucune entreprise</h3>
                <p className="text-sm text-muted-foreground max-w-md mb-6">
                  Commencez par créer votre première entreprise
                </p>
                <PermissionGuard permission="companies.create">
                  <Button asChild>
                    <Link href="/third-parties/companies/new">
                      <IconPlus className="h-4 w-4 mr-2" />
                      Créer une entreprise
                    </Link>
                  </Button>
                </PermissionGuard>
              </motion.div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, company: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'entreprise ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer l'entreprise "{deleteDialog.company?.name}" ?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PermissionGuard>
  )
}
