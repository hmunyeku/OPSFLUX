"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Settings2, Link2, FileText, ExternalLink, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// Types
interface ReferenceConfig {
  referenceType: "report" | "document" | "section" | "external"
  referenceId?: string
  referenceTitle?: string
  displayAs: "link" | "card" | "embed"
  sectionId?: string
}

interface ReferenceAttributes {
  config: ReferenceConfig
  metadata?: {
    title: string
    author?: string
    createdAt?: string
    excerpt?: string
  }
}

// Composant de rendu
const ReferenceBlockComponent = ({ node, updateAttributes, deleteNode, editor }: any) => {
  const { config, metadata } = node.attrs as ReferenceAttributes
  const [showConfig, setShowConfig] = useState(false)
  const [editConfig, setEditConfig] = useState<ReferenceConfig>(config || {
    referenceType: "report",
    displayAs: "link",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [localMetadata, setLocalMetadata] = useState(metadata)

  // Fetch metadata when reference ID changes
  const fetchMetadata = async () => {
    if (!config?.referenceId || config.referenceType === "external") return

    setIsLoading(true)
    try {
      // Appel API pour récupérer les métadonnées
      const endpoint =
        config.referenceType === "report"
          ? `/api/v1/redacteur/reports/${config.referenceId}`
          : `/api/v1/redacteur/documents/${config.referenceId}`

      const response = await fetch(endpoint)
      if (response.ok) {
        const data = await response.json()
        const meta = {
          title: data.title || data.name,
          author: data.created_by_name,
          createdAt: data.created_at,
          excerpt: data.description || data.excerpt,
        }
        setLocalMetadata(meta)
        updateAttributes({ metadata: meta })
      }
    } catch (error) {
      console.error("Error fetching reference metadata:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (config && !metadata) {
      fetchMetadata()
    }
  }, [])

  const handleSaveConfig = () => {
    updateAttributes({ config: editConfig, metadata: undefined })
    setShowConfig(false)

    // Fetch metadata for new reference
    if (editConfig.referenceId && editConfig.referenceType !== "external") {
      fetchMetadata()
    }
  }

  const getIcon = () => {
    switch (config?.referenceType) {
      case "report":
        return <FileText className="h-4 w-4" />
      case "document":
        return <FileText className="h-4 w-4" />
      case "section":
        return <Link2 className="h-4 w-4" />
      case "external":
        return <ExternalLink className="h-4 w-4" />
      default:
        return <Link2 className="h-4 w-4" />
    }
  }

  const getUrl = () => {
    const { referenceType, referenceId, sectionId } = config

    if (referenceType === "external") {
      return referenceId || "#"
    }

    if (referenceType === "report") {
      return `/redacteur/editor/${referenceId}${sectionId ? `#${sectionId}` : ""}`
    }

    if (referenceType === "document") {
      return `/redacteur/documents/${referenceId}`
    }

    if (referenceType === "section") {
      return `#${sectionId || referenceId}`
    }

    return "#"
  }

  // Render based on displayAs
  const renderReference = () => {
    if (isLoading) {
      return (
        <div className="flex items-center gap-2 p-3 bg-muted/30 rounded">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Chargement...</span>
        </div>
      )
    }

    const url = getUrl()
    const title = localMetadata?.title || config?.referenceTitle || "Référence sans titre"

    switch (config?.displayAs) {
      case "link":
        return (
          <a
            href={url}
            className="inline-flex items-center gap-2 text-primary hover:underline"
            target={config.referenceType === "external" ? "_blank" : undefined}
            rel={config.referenceType === "external" ? "noopener noreferrer" : undefined}
          >
            {getIcon()}
            <span>{title}</span>
            {config.referenceType === "external" && (
              <ExternalLink className="h-3 w-3" />
            )}
          </a>
        )

      case "card":
        return (
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <a href={url} className="block">
              <CardHeader className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <div className="text-primary">{getIcon()}</div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base line-clamp-2">{title}</CardTitle>
                      {localMetadata?.excerpt && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {localMetadata.excerpt}
                        </p>
                      )}
                    </div>
                  </div>
                  {config.referenceType === "external" && (
                    <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              </CardHeader>
              {(localMetadata?.author || localMetadata?.createdAt) && (
                <CardContent className="p-4 pt-0">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {localMetadata.author && <span>Par {localMetadata.author}</span>}
                    {localMetadata.createdAt && (
                      <span>{new Date(localMetadata.createdAt).toLocaleDateString("fr-FR")}</span>
                    )}
                  </div>
                </CardContent>
              )}
            </a>
          </Card>
        )

      case "embed":
        // Pour l'embed, on afficherait le contenu du document référencé
        // Pour l'instant, on affiche un placeholder
        return (
          <Card className="border-2 border-dashed">
            <CardContent className="p-4 text-center">
              <div className="text-primary mb-2">{getIcon()}</div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Contenu embarqué (à implémenter)
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => window.open(url, "_blank")}
              >
                Ouvrir dans un nouvel onglet
              </Button>
            </CardContent>
          </Card>
        )

      default:
        return null
    }
  }

  return (
    <NodeViewWrapper className="reference-block my-2">
      <div className="relative group">
        {renderReference()}

        {editor.isEditable && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <Dialog open={showConfig} onOpenChange={setShowConfig}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 bg-background/80 backdrop-blur">
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Configuration de la Référence</DialogTitle>
                  <DialogDescription>
                    Configurez le type et l'affichage de la référence
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="referenceType">Type de référence</Label>
                      <Select
                        value={editConfig.referenceType}
                        onValueChange={(value: any) =>
                          setEditConfig({ ...editConfig, referenceType: value })
                        }
                      >
                        <SelectTrigger id="referenceType">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="report">Rapport</SelectItem>
                          <SelectItem value="document">Document</SelectItem>
                          <SelectItem value="section">Section</SelectItem>
                          <SelectItem value="external">Lien externe</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="displayAs">Mode d'affichage</Label>
                      <Select
                        value={editConfig.displayAs}
                        onValueChange={(value: any) =>
                          setEditConfig({ ...editConfig, displayAs: value })
                        }
                      >
                        <SelectTrigger id="displayAs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="link">Lien simple</SelectItem>
                          <SelectItem value="card">Carte</SelectItem>
                          <SelectItem value="embed">Embarqué</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {editConfig.referenceType === "external" ? (
                    <div className="space-y-2">
                      <Label htmlFor="referenceId">URL</Label>
                      <Input
                        id="referenceId"
                        value={editConfig.referenceId || ""}
                        onChange={(e) =>
                          setEditConfig({ ...editConfig, referenceId: e.target.value })
                        }
                        placeholder="https://example.com"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="referenceId">ID du {editConfig.referenceType}</Label>
                        <Input
                          id="referenceId"
                          value={editConfig.referenceId || ""}
                          onChange={(e) =>
                            setEditConfig({ ...editConfig, referenceId: e.target.value })
                          }
                          placeholder="UUID ou identifiant"
                        />
                        <p className="text-xs text-muted-foreground">
                          L'ID unique du rapport/document à référencer
                        </p>
                      </div>

                      {editConfig.referenceType === "section" && (
                        <div className="space-y-2">
                          <Label htmlFor="sectionId">ID de la section (optionnel)</Label>
                          <Input
                            id="sectionId"
                            value={editConfig.sectionId || ""}
                            onChange={(e) =>
                              setEditConfig({ ...editConfig, sectionId: e.target.value })
                            }
                            placeholder="section-1"
                          />
                        </div>
                      )}
                    </>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="referenceTitle">Titre (optionnel)</Label>
                    <Input
                      id="referenceTitle"
                      value={editConfig.referenceTitle || ""}
                      onChange={(e) =>
                        setEditConfig({ ...editConfig, referenceTitle: e.target.value })
                      }
                      placeholder="Titre personnalisé pour la référence"
                    />
                    <p className="text-xs text-muted-foreground">
                      Si vide, le titre sera récupéré automatiquement
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={() => setShowConfig(false)}>
                      Annuler
                    </Button>
                    <Button onClick={handleSaveConfig}>Enregistrer</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 bg-background/80 backdrop-blur text-destructive hover:text-destructive"
              onClick={deleteNode}
            >
              ×
            </Button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

// Extension Tiptap
export const ReferenceExtension = Node.create({
  name: "reference",

  group: "block",

  atom: true,

  addAttributes() {
    return {
      config: {
        default: {
          referenceType: "report",
          displayAs: "link",
        },
      },
      metadata: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='reference']",
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "reference" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReferenceBlockComponent)
  },

  addCommands() {
    return {
      setReference:
        (attributes: Partial<ReferenceAttributes>) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          })
        },
    }
  },
})
