"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Search,
  Plus,
  FileText,
  MoreVertical,
  Eye,
  Edit,
  Copy,
  Trash2,
  Download,
  Users,
  Calendar,
  FolderKanban,
  Paperclip,
  LayoutGrid,
  List,
  FileType,
  FilePlus,
  FileCheck,
  FileWarning,
  Clock,
  Star,
  Filter,
  SortAsc,
  ChevronRight,
  Folder,
} from "lucide-react"
import { mockDocuments, type DocumentStatus, type DocumentType } from "@/lib/redacteur-data"
import { cn } from "@/lib/utils"

const statusConfig: Record<DocumentStatus, { color: string; icon: typeof FileText; label: string }> = {
  draft: { color: "bg-gray-500/10 text-gray-700 border-gray-300", icon: FileType, label: "Brouillon" },
  review: { color: "bg-amber-500/10 text-amber-700 border-amber-300", icon: FileWarning, label: "En Révision" },
  approved: { color: "bg-green-500/10 text-green-700 border-green-300", icon: FileCheck, label: "Approuvé" },
  published: { color: "bg-blue-500/10 text-blue-700 border-blue-300", icon: FilePlus, label: "Publié" },
  archived: { color: "bg-gray-400/10 text-gray-500 border-gray-200", icon: Folder, label: "Archivé" },
}

const typeConfig: Record<DocumentType, { color: string; label: string }> = {
  report: { color: "bg-blue-500/10 text-blue-700 border-blue-300", label: "Rapport" },
  procedure: { color: "bg-green-500/10 text-green-700 border-green-300", label: "Procédure" },
  contract: { color: "bg-purple-500/10 text-purple-700 border-purple-300", label: "Contrat" },
  memo: { color: "bg-orange-500/10 text-orange-700 border-orange-300", label: "Note" },
  technical: { color: "bg-cyan-500/10 text-cyan-700 border-cyan-300", label: "Technique" },
  safety: { color: "bg-red-500/10 text-red-700 border-red-300", label: "Sécurité" },
}

// Document templates
const documentTemplates = [
  { id: "blank", name: "Document vierge", icon: FileText, description: "Commencez de zéro" },
  { id: "report", name: "Rapport", icon: FileType, description: "Rapport structuré" },
  { id: "procedure", name: "Procédure", icon: FileCheck, description: "Guide étape par étape" },
  { id: "memo", name: "Note de service", icon: FilePlus, description: "Communication interne" },
  { id: "technical", name: "Document technique", icon: FileWarning, description: "Spécifications techniques" },
]

type SortOption = "recent" | "name" | "status" | "type"

export function DocumentsContent() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState<DocumentStatus | "all">("all")
  const [selectedType, setSelectedType] = useState<DocumentType | "all">("all")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [sortBy, setSortBy] = useState<SortOption>("recent")
  const [showTemplates, setShowTemplates] = useState(false)

  // Statistics
  const stats = useMemo(() => {
    return {
      total: mockDocuments.length,
      draft: mockDocuments.filter(d => d.status === "draft").length,
      review: mockDocuments.filter(d => d.status === "review").length,
      published: mockDocuments.filter(d => d.status === "published").length,
    }
  }, [])

  // Filtered and sorted documents
  const filteredDocuments = useMemo(() => {
    let docs = mockDocuments.filter((doc) => {
      const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (doc.tags || []).some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      const matchesStatus = selectedStatus === "all" || doc.status === selectedStatus
      const matchesType = selectedType === "all" || doc.type === selectedType
      return matchesSearch && matchesStatus && matchesType
    })

    // Sort
    switch (sortBy) {
      case "name":
        docs = [...docs].sort((a, b) => a.title.localeCompare(b.title))
        break
      case "status":
        docs = [...docs].sort((a, b) => a.status.localeCompare(b.status))
        break
      case "type":
        docs = [...docs].sort((a, b) => a.type.localeCompare(b.type))
        break
      case "recent":
      default:
        docs = [...docs].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    }

    return docs
  }, [searchQuery, selectedStatus, selectedType, sortBy])

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Header with Stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Gérez vos documents, rapports et procédures
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTemplates(!showTemplates)}
            className="gap-2"
          >
            <FileType className="h-4 w-4" />
            Templates
          </Button>
          <Button size="sm" className="gap-2" asChild>
            <a href="/redacteur/editor/new">
              <Plus className="h-4 w-4" />
              Nouveau
            </a>
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card
          className={cn(
            "p-3 cursor-pointer transition-all hover:shadow-md",
            selectedStatus === "all" && "ring-2 ring-primary"
          )}
          onClick={() => setSelectedStatus("all")}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="rounded-full bg-primary/10 p-2">
              <FileText className="h-4 w-4 text-primary" />
            </div>
          </div>
        </Card>
        <Card
          className={cn(
            "p-3 cursor-pointer transition-all hover:shadow-md",
            selectedStatus === "draft" && "ring-2 ring-gray-500"
          )}
          onClick={() => setSelectedStatus(selectedStatus === "draft" ? "all" : "draft")}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">{stats.draft}</p>
              <p className="text-xs text-muted-foreground">Brouillons</p>
            </div>
            <div className="rounded-full bg-gray-500/10 p-2">
              <FileType className="h-4 w-4 text-gray-600" />
            </div>
          </div>
        </Card>
        <Card
          className={cn(
            "p-3 cursor-pointer transition-all hover:shadow-md",
            selectedStatus === "review" && "ring-2 ring-amber-500"
          )}
          onClick={() => setSelectedStatus(selectedStatus === "review" ? "all" : "review")}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">{stats.review}</p>
              <p className="text-xs text-muted-foreground">En révision</p>
            </div>
            <div className="rounded-full bg-amber-500/10 p-2">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
          </div>
        </Card>
        <Card
          className={cn(
            "p-3 cursor-pointer transition-all hover:shadow-md",
            selectedStatus === "published" && "ring-2 ring-blue-500"
          )}
          onClick={() => setSelectedStatus(selectedStatus === "published" ? "all" : "published")}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">{stats.published}</p>
              <p className="text-xs text-muted-foreground">Publiés</p>
            </div>
            <div className="rounded-full bg-blue-500/10 p-2">
              <FileCheck className="h-4 w-4 text-blue-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Templates Section */}
      {showTemplates && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Créer à partir d'un template</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowTemplates(false)}>
              Fermer
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {documentTemplates.map((template) => (
              <a
                key={template.id}
                href={`/redacteur/editor/new?template=${template.id}`}
                className="flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-all hover:border-primary hover:bg-muted/50"
              >
                <div className="rounded-full bg-primary/10 p-3">
                  <template.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground">{template.description}</p>
                </div>
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher par titre ou tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={selectedType} onValueChange={(v) => setSelectedType(v as DocumentType | "all")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              {Object.entries(typeConfig).map(([value, config]) => (
                <SelectItem key={value} value={value}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[130px]">
              <SortAsc className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Plus récent</SelectItem>
              <SelectItem value="name">Nom</SelectItem>
              <SelectItem value="status">Statut</SelectItem>
              <SelectItem value="type">Type</SelectItem>
            </SelectContent>
          </Select>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "grid" | "list")}>
            <TabsList className="h-9">
              <TabsTrigger value="grid" className="px-2">
                <LayoutGrid className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="list" className="px-2">
                <List className="h-4 w-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Active Filters */}
      {(selectedStatus !== "all" || selectedType !== "all" || searchQuery) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Filtres actifs:</span>
          {selectedStatus !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {statusConfig[selectedStatus].label}
              <button
                type="button"
                onClick={() => setSelectedStatus("all")}
                className="ml-1 hover:text-destructive"
              >
                ×
              </button>
            </Badge>
          )}
          {selectedType !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {typeConfig[selectedType].label}
              <button
                type="button"
                onClick={() => setSelectedType("all")}
                className="ml-1 hover:text-destructive"
              >
                ×
              </button>
            </Badge>
          )}
          {searchQuery && (
            <Badge variant="secondary" className="gap-1">
              "{searchQuery}"
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="ml-1 hover:text-destructive"
              >
                ×
              </button>
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => {
              setSelectedStatus("all")
              setSelectedType("all")
              setSearchQuery("")
            }}
          >
            Effacer tout
          </Button>
        </div>
      )}

      {/* Documents Grid/List */}
      <div className="flex-1 overflow-auto">
        {filteredDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">Aucun document trouvé</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Modifiez vos filtres ou créez un nouveau document
            </p>
            <Button asChild>
              <a href="/redacteur/editor/new">
                <Plus className="mr-2 h-4 w-4" />
                Créer un document
              </a>
            </Button>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredDocuments.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDocuments.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </div>
        )}
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground text-center py-2 border-t">
        {filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''} sur {stats.total}
      </div>
    </div>
  )
}

// Document Card Component
function DocumentCard({ doc }: { doc: typeof mockDocuments[0] }) {
  const StatusIcon = statusConfig[doc.status].icon

  return (
    <Card className="group relative flex flex-col gap-3 p-4 transition-all hover:shadow-lg hover:border-primary/50">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={cn("rounded-lg p-2", typeConfig[doc.type].color.split(' ')[0])}>
            <FileText className="h-4 w-4" />
          </div>
          <Badge variant="outline" className={cn("text-[10px]", typeConfig[doc.type].color)}>
            {typeConfig[doc.type].label}
          </Badge>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem>
              <Eye className="mr-2 h-4 w-4" />
              Aperçu
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/redacteur/editor/${doc.id}`}>
                <Edit className="mr-2 h-4 w-4" />
                Éditer
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Copy className="mr-2 h-4 w-4" />
              Dupliquer
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Download className="mr-2 h-4 w-4" />
              Exporter PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Title */}
      <a href={`/redacteur/editor/${doc.id}`} className="group/title">
        <h3 className="line-clamp-2 font-medium leading-tight group-hover/title:text-primary transition-colors">
          {doc.title}
        </h3>
      </a>

      {/* Status Badge */}
      <Badge variant="outline" className={cn("w-fit gap-1", statusConfig[doc.status].color)}>
        <StatusIcon className="h-3 w-3" />
        {statusConfig[doc.status].label}
      </Badge>

      {/* Meta Info */}
      <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5" />
          <span>Modifié {new Date(doc.updatedAt).toLocaleDateString("fr-FR")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5" />
          <span>{doc.author?.name || "Inconnu"}</span>
          {(doc.collaborators || []).length > 0 && (
            <Badge variant="secondary" className="h-5 text-[10px]">
              +{(doc.collaborators || []).length}
            </Badge>
          )}
        </div>
        {doc.project && (
          <div className="flex items-center gap-2">
            <FolderKanban className="h-3.5 w-3.5" />
            <span className="truncate">{doc.project}</span>
          </div>
        )}
      </div>

      {/* Tags */}
      {(doc.tags || []).length > 0 && (
        <div className="flex flex-wrap gap-1 pt-2 border-t">
          {(doc.tags || []).slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px]">
              {tag}
            </Badge>
          ))}
          {(doc.tags || []).length > 3 && (
            <Badge variant="secondary" className="text-[10px]">
              +{(doc.tags || []).length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
        <span>v{doc.version}</span>
        {doc.attachments > 0 && (
          <div className="flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            <span>{doc.attachments}</span>
          </div>
        )}
      </div>
    </Card>
  )
}

// Document Row Component (List View)
function DocumentRow({ doc }: { doc: typeof mockDocuments[0] }) {
  const StatusIcon = statusConfig[doc.status].icon

  return (
    <Card className="group flex items-center gap-4 p-3 transition-all hover:shadow-md hover:border-primary/50">
      {/* Icon */}
      <div className={cn("rounded-lg p-2 shrink-0", typeConfig[doc.type].color.split(' ')[0])}>
        <FileText className="h-5 w-5" />
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <a href={`/redacteur/editor/${doc.id}`} className="font-medium hover:text-primary truncate">
            {doc.title}
          </a>
          <Badge variant="outline" className={cn("shrink-0 text-[10px]", typeConfig[doc.type].color)}>
            {typeConfig[doc.type].label}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(doc.updatedAt).toLocaleDateString("fr-FR")}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {doc.author?.name || "Inconnu"}
          </span>
          {doc.project && (
            <span className="flex items-center gap-1 truncate">
              <FolderKanban className="h-3 w-3" />
              {doc.project}
            </span>
          )}
        </div>
      </div>

      {/* Status */}
      <Badge variant="outline" className={cn("shrink-0 gap-1", statusConfig[doc.status].color)}>
        <StatusIcon className="h-3 w-3" />
        {statusConfig[doc.status].label}
      </Badge>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild title="Éditer">
          <a href={`/redacteur/editor/${doc.id}`} title="Éditer le document">
            <Edit className="h-4 w-4" />
          </a>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem>
              <Eye className="mr-2 h-4 w-4" />
              Aperçu
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Copy className="mr-2 h-4 w-4" />
              Dupliquer
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Download className="mr-2 h-4 w-4" />
              Exporter PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  )
}
