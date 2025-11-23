"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { mockProjects, getProjectMetrics } from "@/lib/project-mock-data"
import type { Project } from "@/lib/project-management-types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  ArrowLeft,
  MoreVertical,
  Star,
  Edit,
  Archive,
  Trash2,
  Copy,
  Download,
  Share2,
  Building2,
  Calendar,
  DollarSign,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Target,
  FileText,
  Activity,
  Settings,
  Plus,
  Search,
  Filter,
  GripVertical,
  MoreHorizontal,
  ChevronRight,
  Upload,
  FileIcon,
  Tag,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ProjectDetailViewProps {
  projectId: string
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  draft: { label: "Brouillon", color: "text-gray-700", bgColor: "bg-gray-100" },
  planning: { label: "Planification", color: "text-blue-700", bgColor: "bg-blue-100" },
  active: { label: "Actif", color: "text-green-700", bgColor: "bg-green-100" },
  "on-hold": { label: "En pause", color: "text-yellow-700", bgColor: "bg-yellow-100" },
  completed: { label: "Termine", color: "text-purple-700", bgColor: "bg-purple-100" },
  cancelled: { label: "Annule", color: "text-red-700", bgColor: "bg-red-100" },
  archived: { label: "Archive", color: "text-gray-600", bgColor: "bg-gray-100" },
}

const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: "Basse", color: "bg-gray-100 text-gray-700" },
  medium: { label: "Moyenne", color: "bg-blue-100 text-blue-700" },
  high: { label: "Haute", color: "bg-orange-100 text-orange-700" },
  critical: { label: "Critique", color: "bg-red-100 text-red-700" },
}

const healthConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  good: { label: "Bon", color: "text-green-600", icon: CheckCircle2 },
  "at-risk": { label: "A risque", color: "text-orange-600", icon: AlertCircle },
  critical: { label: "Critique", color: "text-red-600", icon: TrendingDown },
}

const taskStatusConfig: Record<string, { label: string; color: string }> = {
  todo: { label: "A faire", color: "bg-gray-100 text-gray-700" },
  "in-progress": { label: "En cours", color: "bg-blue-100 text-blue-700" },
  review: { label: "En revue", color: "bg-purple-100 text-purple-700" },
  done: { label: "Termine", color: "bg-green-100 text-green-700" },
  blocked: { label: "Bloque", color: "bg-red-100 text-red-700" },
}

// Mock tasks data
const mockTasks = [
  { id: "1", title: "Inspection equipements de securite", status: "done", priority: "high", assignee: "Jean Dupont", dueDate: "2024-11-15" },
  { id: "2", title: "Verification systeme de pompage", status: "in-progress", priority: "critical", assignee: "Marie Martin", dueDate: "2024-11-20" },
  { id: "3", title: "Maintenance preventive turbines", status: "todo", priority: "high", assignee: "Pierre Durand", dueDate: "2024-11-25" },
  { id: "4", title: "Calibration capteurs temperature", status: "in-progress", priority: "medium", assignee: "Sophie Bernard", dueDate: "2024-11-22" },
  { id: "5", title: "Test systeme d'alarme incendie", status: "review", priority: "critical", assignee: "Lucas Petit", dueDate: "2024-11-18" },
  { id: "6", title: "Rapport d'avancement mensuel", status: "todo", priority: "low", assignee: "Emma Leroy", dueDate: "2024-11-30" },
]

// Mock activity data
const mockActivity = [
  { id: "1", type: "task_completed", user: "Jean Dupont", description: "a termine la tache 'Inspection equipements'", time: "Il y a 2 heures" },
  { id: "2", type: "comment", user: "Marie Martin", description: "a ajoute un commentaire sur le projet", time: "Il y a 4 heures" },
  { id: "3", type: "status_changed", user: "Pierre Durand", description: "a change le statut de la tache 'Verification pompage'", time: "Hier" },
  { id: "4", type: "member_added", user: "Admin", description: "a ajoute Sophie Bernard a l'equipe", time: "Il y a 2 jours" },
  { id: "5", type: "document_uploaded", user: "Lucas Petit", description: "a televerse 'Rapport_inspection.pdf'", time: "Il y a 3 jours" },
]

// Mock documents data
const mockDocuments = [
  { id: "1", name: "Cahier des charges.pdf", type: "pdf", size: "2.4 MB", category: "specification", uploadedBy: "Jean Dupont", uploadedAt: "2024-10-15" },
  { id: "2", name: "Plan de projet.xlsx", type: "xlsx", size: "1.2 MB", category: "plan", uploadedBy: "Marie Martin", uploadedAt: "2024-10-20" },
  { id: "3", name: "Rapport d'inspection.pdf", type: "pdf", size: "5.1 MB", category: "report", uploadedBy: "Pierre Durand", uploadedAt: "2024-11-10" },
  { id: "4", name: "Budget previsionnel.xlsx", type: "xlsx", size: "890 KB", category: "other", uploadedBy: "Sophie Bernard", uploadedAt: "2024-10-25" },
  { id: "5", name: "Contrat client.pdf", type: "pdf", size: "3.2 MB", category: "contract", uploadedBy: "Admin", uploadedAt: "2024-10-01" },
]

export function ProjectDetailView({ projectId }: ProjectDetailViewProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [project, setProject] = useState<Project | null>(null)
  const [activeTab, setActiveTab] = useState("overview")
  const [isLoading, setIsLoading] = useState(true)
  const [isFavorite, setIsFavorite] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [taskFilter, setTaskFilter] = useState("all")
  const [taskSearch, setTaskSearch] = useState("")

  // Load project from mock data
  useEffect(() => {
    const found = mockProjects.find((p) => p.id === projectId)
    if (found) {
      setProject(found)
      setIsFavorite(found.isFavorite || false)
    }
    setIsLoading(false)
  }, [projectId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
        <AlertCircle className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Projet non trouve</h2>
        <p className="text-muted-foreground">Le projet demande n'existe pas ou a ete supprime.</p>
        <Button onClick={() => router.push("/projects/list")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour aux projets
        </Button>
      </div>
    )
  }

  const metrics = getProjectMetrics(project)
  const statusCfg = statusConfig[project.status] || statusConfig.draft
  const priorityCfg = priorityConfig[project.priority] || priorityConfig.medium
  const healthCfg = healthConfig[project.health] || healthConfig.good
  const HealthIcon = healthCfg.icon

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
  }

  const handleToggleFavorite = () => {
    setIsFavorite(!isFavorite)
    toast({
      title: isFavorite ? "Retire des favoris" : "Ajoute aux favoris",
      description: isFavorite
        ? "Le projet a ete retire de vos favoris."
        : "Le projet a ete ajoute a vos favoris.",
    })
  }

  const handleArchive = () => {
    toast({
      title: "Projet archive",
      description: "Le projet a ete archive avec succes.",
    })
    router.push("/projects/list")
  }

  const handleDelete = () => {
    setShowDeleteDialog(false)
    toast({
      title: "Projet supprime",
      description: "Le projet a ete supprime avec succes.",
      variant: "destructive",
    })
    router.push("/projects/list")
  }

  const handleDuplicate = () => {
    toast({
      title: "Projet duplique",
      description: "Une copie du projet a ete creee.",
    })
  }

  const handleExport = (format: string) => {
    toast({
      title: "Export en cours",
      description: `Le projet sera exporte au format ${format.toUpperCase()}.`,
    })
  }

  const handleShare = () => {
    toast({
      title: "Lien copie",
      description: "Le lien du projet a ete copie dans le presse-papier.",
    })
  }

  const handleNewTask = () => {
    toast({
      title: "Nouvelle tache",
      description: "Fonctionnalite en cours de developpement.",
    })
  }

  const handleTaskAction = (action: string, taskTitle: string) => {
    toast({
      title: action,
      description: `Action "${action}" sur "${taskTitle}".`,
    })
  }

  const handleAddMember = () => {
    toast({
      title: "Ajouter un membre",
      description: "Fonctionnalite en cours de developpement.",
    })
  }

  const handleMemberAction = (action: string, memberName: string) => {
    toast({
      title: action,
      description: `Action "${action}" sur ${memberName}.`,
    })
  }

  const handleUploadDocument = () => {
    toast({
      title: "Telecharger un document",
      description: "Fonctionnalite en cours de developpement.",
    })
  }

  const handleDownloadDocument = (docName: string) => {
    toast({
      title: "Telechargement",
      description: `Telechargement de "${docName}" en cours.`,
    })
  }

  const handleDocumentAction = (action: string, docName: string) => {
    toast({
      title: action,
      description: `Action "${action}" sur "${docName}".`,
    })
  }

  const filteredTasks = mockTasks.filter((task) => {
    const matchesFilter = taskFilter === "all" || task.status === taskFilter
    const matchesSearch = task.title.toLowerCase().includes(taskSearch.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header - Compact */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-8" onClick={() => router.push("/projects/list")}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Projets
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px] h-5 px-1.5">
                {project.code}
              </Badge>
              <h1 className="text-sm font-semibold">{project.name}</h1>
              {isFavorite && <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleToggleFavorite}>
              <Star className={cn("h-3.5 w-3.5", isFavorite && "fill-yellow-400 text-yellow-400")} />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleShare}>
              <Share2 className="h-3.5 w-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Exporter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("pdf")}>
                  <FileText className="h-3.5 w-3.5 mr-2" />
                  PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("xlsx")}>
                  <FileText className="h-3.5 w-3.5 mr-2" />
                  Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("json")}>
                  <FileText className="h-3.5 w-3.5 mr-2" />
                  JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowEditDialog(true)}>
              <Edit className="h-3.5 w-3.5 mr-1.5" />
              Modifier
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDuplicate}>
                  <Copy className="h-3.5 w-3.5 mr-2" />
                  Dupliquer
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleArchive}>
                  <Archive className="h-3.5 w-3.5 mr-2" />
                  Archiver
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Quick Stats Bar - Compact */}
        <div className="flex items-center gap-4 px-3 pb-2 text-xs">
          <Badge className={cn(statusCfg.bgColor, statusCfg.color, "h-5 text-[10px]")}>{statusCfg.label}</Badge>
          <Badge className={cn(priorityCfg.color, "h-5 text-[10px]")}>{priorityCfg.label}</Badge>
          <div className={cn("flex items-center gap-1", healthCfg.color)}>
            <HealthIcon className="h-3.5 w-3.5" />
            <span className="font-medium">{healthCfg.label}</span>
          </div>
          <Separator orientation="vertical" className="h-3.5" />
          <div className="flex items-center gap-1 text-muted-foreground">
            <Target className="h-3.5 w-3.5" />
            <span>{project.progress}%</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {metrics.daysOverdue > 0 ? (
              <span className="text-red-600">+{metrics.daysOverdue}j</span>
            ) : (
              <span>{metrics.daysRemaining}j</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>{project.team?.length || 0}</span>
          </div>
        </div>
      </div>

      {/* Tabs Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <div className="border-b bg-background">
          <TabsList className="h-9 w-full justify-start rounded-none border-b-0 bg-transparent p-0 px-3">
            <TabsTrigger
              value="overview"
              className="relative h-9 rounded-none border-b-2 border-b-transparent bg-transparent px-3 pb-2 pt-1.5 text-xs font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <Target className="h-3.5 w-3.5 mr-1.5" />
              Vue d'ensemble
            </TabsTrigger>
            <TabsTrigger
              value="tasks"
              className="relative h-9 rounded-none border-b-2 border-b-transparent bg-transparent px-3 pb-2 pt-1.5 text-xs font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Taches
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                {project.totalTasks}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="team"
              className="relative h-9 rounded-none border-b-2 border-b-transparent bg-transparent px-3 pb-2 pt-1.5 text-xs font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Equipe
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                {project.team?.length || 0}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="documents"
              className="relative h-9 rounded-none border-b-2 border-b-transparent bg-transparent px-3 pb-2 pt-1.5 text-xs font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Documents
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                {mockDocuments.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="relative h-9 rounded-none border-b-2 border-b-transparent bg-transparent px-3 pb-2 pt-1.5 text-xs font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <Activity className="h-3.5 w-3.5 mr-1.5" />
              Activite
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="relative h-9 rounded-none border-b-2 border-b-transparent bg-transparent px-3 pb-2 pt-1.5 text-xs font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Parametres
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Overview Tab */}
        <TabsContent value="overview" className="p-3 space-y-3">
          <div className="grid gap-3 lg:grid-cols-3">
            {/* Main Info */}
            <div className="lg:col-span-2 space-y-3">
              {/* Description */}
              <Card className="!py-0 !gap-0">
                <CardHeader className="px-3 py-2">
                  <CardTitle className="text-xs font-semibold">Description du projet</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  <p className="text-xs text-muted-foreground">{project.description}</p>
                  {project.tags && project.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {project.tags.map((tag, idx) => (
                        <Badge key={idx} variant="secondary" className="h-5 text-[10px] px-1.5">
                          <Tag className="h-2.5 w-2.5 mr-0.5" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Progress & Metrics */}
              <Card className="!py-0 !gap-0">
                <CardHeader className="px-3 py-2">
                  <CardTitle className="text-xs font-semibold">Progression</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0 space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">Avancement global</span>
                      <span className="text-[11px] font-semibold">{project.progress}%</span>
                    </div>
                    <Progress value={project.progress} className="h-2" />
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center p-2 bg-muted/50 rounded-md">
                      <p className="text-lg font-bold">{project.totalTasks}</p>
                      <p className="text-[10px] text-muted-foreground">Total</p>
                    </div>
                    <div className="text-center p-2 bg-green-50 dark:bg-green-950 rounded-md">
                      <p className="text-lg font-bold text-green-600">{project.completedTasks}</p>
                      <p className="text-[10px] text-muted-foreground">Terminees</p>
                    </div>
                    <div className="text-center p-2 bg-blue-50 dark:bg-blue-950 rounded-md">
                      <p className="text-lg font-bold text-blue-600">
                        {project.totalTasks - project.completedTasks}
                      </p>
                      <p className="text-[10px] text-muted-foreground">En cours</p>
                    </div>
                    <div className="text-center p-2 bg-orange-50 dark:bg-orange-950 rounded-md">
                      <p className="text-lg font-bold text-orange-600">{metrics.daysRemaining}</p>
                      <p className="text-[10px] text-muted-foreground">Jours</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Budget */}
              <Card className="!py-0 !gap-0">
                <CardHeader className="px-3 py-2">
                  <CardTitle className="text-xs font-semibold">Budget</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0 space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">Consommation</span>
                      <span className="text-[11px] font-semibold">{metrics.budgetUsedPercent}%</span>
                    </div>
                    <Progress
                      value={metrics.budgetUsedPercent}
                      className={cn("h-2", metrics.budgetUsedPercent > 90 && "[&>div]:bg-red-500")}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 border rounded-md">
                      <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                        <DollarSign className="h-3 w-3" />
                        <span className="text-[10px]">Budget</span>
                      </div>
                      <p className="text-sm font-bold text-green-600">{formatCurrency(project.budget)}</p>
                    </div>
                    <div className="p-2 border rounded-md">
                      <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                        <TrendingDown className="h-3 w-3" />
                        <span className="text-[10px]">Depense</span>
                      </div>
                      <p className="text-sm font-bold text-orange-600">
                        {formatCurrency(project.spent || 0)}
                      </p>
                    </div>
                    <div className="p-2 border rounded-md">
                      <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                        <TrendingUp className="h-3 w-3" />
                        <span className="text-[10px]">Restant</span>
                      </div>
                      <p className="text-sm font-bold">{formatCurrency(metrics.budgetRemaining)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-3">
              {/* Project Info */}
              <Card className="!py-0 !gap-0">
                <CardHeader className="px-3 py-2">
                  <CardTitle className="text-xs font-semibold">Informations</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      Client
                    </span>
                    <span className="text-[11px] font-medium">{project.client}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Debut
                    </span>
                    <span className="text-[11px] font-medium">{formatDate(project.startDate)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Fin
                    </span>
                    <span className="text-[11px] font-medium">{formatDate(project.endDate)}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Cree le</span>
                    <span className="text-[10px]">{formatDate(project.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Modifie le</span>
                    <span className="text-[10px]">{formatDate(project.updatedAt)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Team Preview */}
              <Card className="!py-0 !gap-0">
                <CardHeader className="px-3 py-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-semibold">Equipe</CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setActiveTab("team")}>
                    Voir tout
                    <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  <div className="space-y-2">
                    {(project.team || []).slice(0, 4).map((member, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={member.avatar} />
                          <AvatarFallback className="text-[9px]">
                            {member.name?.slice(0, 2) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium truncate">{member.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{member.role}</p>
                        </div>
                      </div>
                    ))}
                    {(project.team?.length || 0) > 4 && (
                      <p className="text-[10px] text-muted-foreground text-center">
                        +{(project.team?.length || 0) - 4} autres membres
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity Preview */}
              <Card className="!py-0 !gap-0">
                <CardHeader className="px-3 py-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-semibold">Activite recente</CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setActiveTab("activity")}>
                    Voir tout
                    <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  <div className="space-y-2">
                    {mockActivity.slice(0, 3).map((activity) => (
                      <div key={activity.id} className="flex gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px]">
                            <span className="font-medium">{activity.user}</span>{" "}
                            <span className="text-muted-foreground">{activity.description}</span>
                          </p>
                          <p className="text-[10px] text-muted-foreground">{activity.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Rechercher..."
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  className="pl-7 h-7 w-48 text-xs"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    <Filter className="h-3 w-3 mr-1" />
                    {taskFilter === "all" ? "Tous" : taskStatusConfig[taskFilter]?.label}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setTaskFilter("all")}>
                    Tous les statuts
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {Object.entries(taskStatusConfig).map(([key, config]) => (
                    <DropdownMenuItem key={key} onClick={() => setTaskFilter(key)}>
                      {config.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={handleNewTask}>
              <Plus className="h-3 w-3 mr-1" />
              Nouvelle tache
            </Button>
          </div>

          <Card className="!py-0 !gap-0">
            <CardContent className="p-0">
              <div className="divide-y">
                {filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 transition-colors"
                  >
                    <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab" />
                    <CheckCircle2
                      className={cn(
                        "h-3.5 w-3.5 cursor-pointer shrink-0",
                        task.status === "done" ? "text-green-600" : "text-muted-foreground"
                      )}
                      onClick={() => handleTaskAction("Basculer statut", task.title)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-[11px] font-medium", task.status === "done" && "line-through text-muted-foreground")}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <Users className="h-2.5 w-2.5" />
                          {task.assignee}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Calendar className="h-2.5 w-2.5" />
                          {task.dueDate}
                        </span>
                      </div>
                    </div>
                    <Badge className={cn(taskStatusConfig[task.status]?.color || "bg-gray-100", "h-5 text-[10px] px-1.5")}>
                      {taskStatusConfig[task.status]?.label || task.status}
                    </Badge>
                    <Badge className={cn(priorityConfig[task.priority]?.color || "bg-gray-100", "h-5 text-[10px] px-1.5")}>
                      {priorityConfig[task.priority]?.label || task.priority}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleTaskAction("Modifier", task.title)}>Modifier</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleTaskAction("Assigner", task.title)}>Assigner</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => handleTaskAction("Supprimer", task.title)}>Supprimer</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team" className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold">Membres de l'equipe</h2>
            <Button size="sm" className="h-7 text-xs" onClick={handleAddMember}>
              <Plus className="h-3 w-3 mr-1" />
              Ajouter
            </Button>
          </div>

          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(project.team || []).map((member, idx) => (
              <Card key={idx} className="!py-0 !gap-0">
                <CardContent className="p-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={member.avatar} />
                      <AvatarFallback className="text-[10px]">{member.name?.slice(0, 2) || "?"}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[11px] font-semibold truncate">{member.name}</h3>
                      <p className="text-[10px] text-muted-foreground truncate">{member.role}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleMemberAction("Voir le profil", member.name || "")}>Voir le profil</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMemberAction("Modifier le role", member.name || "")}>Modifier le role</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => handleMemberAction("Retirer du projet", member.name || "")}>
                          Retirer du projet
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input placeholder="Rechercher..." className="pl-7 h-7 w-48 text-xs" />
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={handleUploadDocument}>
              <Upload className="h-3 w-3 mr-1" />
              Telecharger
            </Button>
          </div>

          <Card className="!py-0 !gap-0">
            <CardContent className="p-0">
              <div className="divide-y">
                {mockDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className="h-7 w-7 rounded bg-muted flex items-center justify-center shrink-0">
                      <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">{doc.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {doc.size} • {doc.uploadedBy} • {doc.uploadedAt}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 capitalize">
                      {doc.category}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleDownloadDocument(doc.name)}>
                      <Download className="h-3 w-3" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDocumentAction("Telecharger", doc.name)}>Telecharger</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDocumentAction("Renommer", doc.name)}>Renommer</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDocumentAction("Deplacer", doc.name)}>Deplacer</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDocumentAction("Supprimer", doc.name)}>Supprimer</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="p-3">
          <Card className="!py-0 !gap-0">
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-xs font-semibold">Historique d'activite</CardTitle>
              <CardDescription className="text-[10px]">Toutes les actions effectuees sur ce projet</CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="space-y-3">
                {mockActivity.map((activity, idx) => (
                  <div key={activity.id} className="flex gap-2">
                    <div className="relative">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <Activity className="h-3 w-3 text-primary" />
                      </div>
                      {idx < mockActivity.length - 1 && (
                        <div className="absolute top-6 left-1/2 -translate-x-1/2 w-px h-full bg-border" />
                      )}
                    </div>
                    <div className="flex-1 pb-3">
                      <p className="text-[11px]">
                        <span className="font-semibold">{activity.user}</span>{" "}
                        <span className="text-muted-foreground">{activity.description}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="p-3 space-y-3">
          <Card className="!py-0 !gap-0">
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-xs font-semibold">Parametres du projet</CardTitle>
              <CardDescription className="text-[10px]">Configurez les options avancees</CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 space-y-3">
              <div className="space-y-2">
                <h3 className="text-[11px] font-medium">Actions rapides</h3>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleDuplicate}>
                    <Copy className="h-3 w-3 mr-1" />
                    Dupliquer
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleArchive}>
                    <Archive className="h-3 w-3 mr-1" />
                    Archiver
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleExport("pdf")}>
                    <Download className="h-3 w-3 mr-1" />
                    Exporter
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <h3 className="text-[11px] font-medium text-destructive">Zone de danger</h3>
                <p className="text-[10px] text-muted-foreground">
                  Ces actions sont irreversibles.
                </p>
                <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="h-7 text-xs">
                      <Trash2 className="h-3 w-3 mr-1" />
                      Supprimer le projet
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Etes-vous sur ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Cette action est irreversible. Toutes les donnees du projet seront
                        definitivement supprimees, y compris les taches, documents et l'historique.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                        Supprimer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
