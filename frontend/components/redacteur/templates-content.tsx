"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Search, Plus, FileText, MoreVertical, Eye, Edit, Copy, Trash2, Star } from "lucide-react"
import { mockTemplates, type DocumentType } from "@/lib/redacteur-data"

const typeLabels: Record<DocumentType, string> = {
  report: "Rapport",
  procedure: "Procédure",
  contract: "Contrat",
  memo: "Note",
  technical: "Technique",
  safety: "Sécurité",
}

export function TemplatesContent() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedType, setSelectedType] = useState<DocumentType | "all">("all")

  const filteredTemplates = mockTemplates.filter((template) => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = selectedType === "all" || template.type === selectedType
    return matchesSearch && matchesType
  })

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Templates</h1>
          <p className="text-[11px] text-muted-foreground">{filteredTemplates.length} templates disponibles</p>
        </div>
        <Button size="sm" className="h-7 gap-1.5 text-[11px]">
          <Plus className="h-3 w-3" />
          Nouveau Template
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un template..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-7 text-[11px]"
          />
        </div>
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

      {/* Templates Grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="group relative flex flex-col gap-2 p-3 transition-all hover:shadow-md">
              {/* Thumbnail */}
              <div className="relative overflow-hidden rounded">
                <img
                  src={template.thumbnail || "/placeholder.svg"}
                  alt={template.name}
                  className="h-40 w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button size="sm" className="h-7 gap-1.5 text-[11px]" asChild>
                    <a href={`/redacteur/editor/new?template=${template.id}`}>
                      <FileText className="h-3 w-3" />
                      Utiliser
                    </a>
                  </Button>
                </div>
              </div>

              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className="text-[11px] font-medium leading-tight">{template.name}</h3>
                  <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{template.description}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem className="text-[11px]">
                      <Eye className="mr-2 h-3 w-3" />
                      Aperçu
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-[11px]">
                      <Edit className="mr-2 h-3 w-3" />
                      Éditer
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-[11px]">
                      <Copy className="mr-2 h-3 w-3" />
                      Dupliquer
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-[11px]">
                      <Star className="mr-2 h-3 w-3" />
                      Favoris
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-[11px] text-destructive">
                      <Trash2 className="mr-2 h-3 w-3" />
                      Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Meta */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{template.usageCount} utilisations</span>
                <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                  {typeLabels[template.type]}
                </Badge>
              </div>

              {/* Variables Count */}
              {template.variables.length > 0 && (
                <div className="text-[10px] text-muted-foreground">
                  {template.variables.length} variable{template.variables.length > 1 ? "s" : ""}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
