"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
} from "lucide-react"
import { mockDocuments, type DocumentStatus, type DocumentType } from "@/lib/redacteur-data"

const statusColors: Record<DocumentStatus, string> = {
  draft: "bg-gray-500/10 text-gray-700 border-gray-300",
  review: "bg-blue-500/10 text-blue-700 border-blue-300",
  approved: "bg-green-500/10 text-green-700 border-green-300",
  published: "bg-purple-500/10 text-purple-700 border-purple-300",
  archived: "bg-gray-400/10 text-gray-600 border-gray-200",
}

const statusLabels: Record<DocumentStatus, string> = {
  draft: "Brouillon",
  review: "En Révision",
  approved: "Approuvé",
  published: "Publié",
  archived: "Archivé",
}

const typeColors: Record<DocumentType, string> = {
  report: "bg-blue-500/10 text-blue-700",
  procedure: "bg-green-500/10 text-green-700",
  contract: "bg-purple-500/10 text-purple-700",
  memo: "bg-orange-500/10 text-orange-700",
  technical: "bg-cyan-500/10 text-cyan-700",
  safety: "bg-red-500/10 text-red-700",
}

const typeLabels: Record<DocumentType, string> = {
  report: "Rapport",
  procedure: "Procédure",
  contract: "Contrat",
  memo: "Note",
  technical: "Technique",
  safety: "Sécurité",
}

export function DocumentsContent() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState<DocumentStatus | "all">("all")
  const [selectedType, setSelectedType] = useState<DocumentType | "all">("all")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  const filteredDocuments = mockDocuments.filter((doc) => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = selectedStatus === "all" || doc.status === selectedStatus
    const matchesType = selectedType === "all" || doc.type === selectedType
    return matchesSearch && matchesStatus && matchesType
  })

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Documents</h1>
          <p className="text-[11px] text-muted-foreground">{filteredDocuments.length} documents</p>
        </div>
        <Button size="sm" className="h-7 gap-1.5 text-[11px]" asChild>
          <a href="/redacteur/editor/new">
            <Plus className="h-3 w-3" />
            Nouveau Document
          </a>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un document..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-7 text-[11px]"
          />
        </div>
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value as DocumentStatus | "all")}
          className="h-7 rounded-md border bg-background px-2 text-[11px]"
        >
          <option value="all">Tous les statuts</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as DocumentType | "all")}
          className="h-7 rounded-md border bg-background px-2 text-[11px]"
        >
          <option value="all">Tous les types</option>
          {Object.entries(typeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Documents Grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredDocuments.map((doc) => (
            <Card key={doc.id} className="group relative flex flex-col gap-2 p-2 transition-all hover:shadow-md">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-primary" />
                  <Badge variant="outline" className={`h-4 px-1 text-[9px] ${typeColors[doc.type]}`}>
                    {typeLabels[doc.type]}
                  </Badge>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100">
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem className="text-[11px]">
                      <Eye className="mr-2 h-3 w-3" />
                      Aperçu
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-[11px]" asChild>
                      <a href={`/redacteur/editor/${doc.id}`}>
                        <Edit className="mr-2 h-3 w-3" />
                        Éditer
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-[11px]">
                      <Copy className="mr-2 h-3 w-3" />
                      Dupliquer
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-[11px]">
                      <Download className="mr-2 h-3 w-3" />
                      Exporter
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-[11px] text-destructive">
                      <Trash2 className="mr-2 h-3 w-3" />
                      Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Title */}
              <a href={`/redacteur/editor/${doc.id}`} className="group/title">
                <h3 className="line-clamp-2 text-[11px] font-medium leading-tight group-hover/title:text-primary">
                  {doc.title}
                </h3>
              </a>

              {/* Status */}
              <Badge variant="outline" className={`w-fit h-4 px-1.5 text-[9px] ${statusColors[doc.status]}`}>
                {statusLabels[doc.status]}
              </Badge>

              {/* Meta Info */}
              <div className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>Modifié {new Date(doc.updatedAt).toLocaleDateString("fr-FR")}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>{doc.author.name}</span>
                  {doc.collaborators.length > 0 && <span>+{doc.collaborators.length}</span>}
                </div>
                {doc.project && (
                  <div className="flex items-center gap-1">
                    <FolderKanban className="h-3 w-3" />
                    <span className="truncate">{doc.project}</span>
                  </div>
                )}
                {doc.attachments > 0 && (
                  <div className="flex items-center gap-1">
                    <Paperclip className="h-3 w-3" />
                    <span>{doc.attachments} pièces jointes</span>
                  </div>
                )}
              </div>

              {/* Tags */}
              {doc.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {doc.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="secondary" className="h-4 px-1 text-[9px]">
                      {tag}
                    </Badge>
                  ))}
                  {doc.tags.length > 3 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                      +{doc.tags.length - 3}
                    </Badge>
                  )}
                </div>
              )}

              {/* Version */}
              <div className="text-[9px] text-muted-foreground">v{doc.version}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
