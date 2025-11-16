"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Settings2, Braces } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// Types de variables système
type SystemVariable =
  | "current_date"
  | "current_time"
  | "current_datetime"
  | "author_name"
  | "author_email"
  | "document_title"
  | "document_version"
  | "page_number"
  | "total_pages"

interface VariableConfig {
  type: "system" | "custom"
  systemVariable?: SystemVariable
  customKey?: string
  customValue?: string
  format?: string
}

interface VariableAttributes {
  config: VariableConfig
}

// Formateurs de variables système
const getSystemVariableValue = (variable: SystemVariable, format?: string): string => {
  const now = new Date()

  switch (variable) {
    case "current_date":
      if (format === "iso") return now.toISOString().split("T")[0]
      return now.toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })

    case "current_time":
      return now.toLocaleTimeString("fr-FR")

    case "current_datetime":
      if (format === "iso") return now.toISOString()
      return now.toLocaleString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })

    case "author_name":
      // À récupérer du contexte utilisateur
      return "{{author_name}}"

    case "author_email":
      return "{{author_email}}"

    case "document_title":
      return "{{document_title}}"

    case "document_version":
      return "{{document_version}}"

    case "page_number":
      return "{{page_number}}"

    case "total_pages":
      return "{{total_pages}}"

    default:
      return ""
  }
}

const SYSTEM_VARIABLES: { value: SystemVariable; label: string; description: string }[] = [
  { value: "current_date", label: "Date actuelle", description: "Date du jour" },
  { value: "current_time", label: "Heure actuelle", description: "Heure actuelle" },
  { value: "current_datetime", label: "Date et heure", description: "Date et heure actuelles" },
  { value: "author_name", label: "Nom de l'auteur", description: "Nom de l'utilisateur connecté" },
  { value: "author_email", label: "Email de l'auteur", description: "Email de l'utilisateur connecté" },
  { value: "document_title", label: "Titre du document", description: "Titre du rapport" },
  { value: "document_version", label: "Version du document", description: "Numéro de version" },
  { value: "page_number", label: "Numéro de page", description: "Numéro de la page actuelle" },
  { value: "total_pages", label: "Total de pages", description: "Nombre total de pages" },
]

// Composant de rendu
const VariableBlockComponent = ({ node, updateAttributes, deleteNode, editor }: any) => {
  const { config } = node.attrs as VariableAttributes
  const [showConfig, setShowConfig] = useState(false)
  const [editConfig, setEditConfig] = useState<VariableConfig>(config || {
    type: "system",
    systemVariable: "current_date",
    format: "default",
  })

  const handleSaveConfig = () => {
    updateAttributes({ config: editConfig })
    setShowConfig(false)
  }

  const getValue = (): string => {
    if (config.type === "system" && config.systemVariable) {
      return getSystemVariableValue(config.systemVariable, config.format)
    }

    if (config.type === "custom" && config.customValue) {
      return config.customValue
    }

    return ""
  }

  const getLabel = (): string => {
    if (config.type === "system" && config.systemVariable) {
      const sysVar = SYSTEM_VARIABLES.find((v) => v.value === config.systemVariable)
      return sysVar?.label || config.systemVariable
    }

    if (config.type === "custom" && config.customKey) {
      return config.customKey
    }

    return "Variable"
  }

  const value = getValue()

  return (
    <NodeViewWrapper className="variable-inline inline-block" as="span">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 border border-primary/20 rounded text-sm group hover:bg-primary/20 transition-colors">
        <Braces className="h-3 w-3 text-primary" />
        <span className="font-medium text-primary">{value || getLabel()}</span>

        {editor.isEditable && (
          <span className="inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Dialog open={showConfig} onOpenChange={setShowConfig}>
              <DialogTrigger asChild>
                <button
                  className="hover:bg-primary/30 rounded p-0.5"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowConfig(true)
                  }}
                >
                  <Settings2 className="h-3 w-3" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Configuration de la Variable</DialogTitle>
                  <DialogDescription>
                    Choisissez une variable système ou définissez une variable personnalisée
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Type de variable</Label>
                    <Select
                      value={editConfig.type}
                      onValueChange={(value: any) =>
                        setEditConfig({ ...editConfig, type: value })
                      }
                    >
                      <SelectTrigger id="type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">Variable système</SelectItem>
                        <SelectItem value="custom">Variable personnalisée</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {editConfig.type === "system" ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="systemVariable">Variable</Label>
                        <Select
                          value={editConfig.systemVariable}
                          onValueChange={(value: any) =>
                            setEditConfig({ ...editConfig, systemVariable: value })
                          }
                        >
                          <SelectTrigger id="systemVariable">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SYSTEM_VARIABLES.map((v) => (
                              <SelectItem key={v.value} value={v.value}>
                                <div>
                                  <div className="font-medium">{v.label}</div>
                                  <div className="text-xs text-muted-foreground">{v.description}</div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {(editConfig.systemVariable === "current_date" ||
                        editConfig.systemVariable === "current_datetime") && (
                        <div className="space-y-2">
                          <Label htmlFor="format">Format</Label>
                          <Select
                            value={editConfig.format || "default"}
                            onValueChange={(value: string) =>
                              setEditConfig({ ...editConfig, format: value })
                            }
                          >
                            <SelectTrigger id="format">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">Par défaut</SelectItem>
                              <SelectItem value="iso">ISO 8601</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="customKey">Clé</Label>
                        <Input
                          id="customKey"
                          value={editConfig.customKey || ""}
                          onChange={(e) =>
                            setEditConfig({ ...editConfig, customKey: e.target.value })
                          }
                          placeholder="nom_variable"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="customValue">Valeur</Label>
                        <Input
                          id="customValue"
                          value={editConfig.customValue || ""}
                          onChange={(e) =>
                            setEditConfig({ ...editConfig, customValue: e.target.value })
                          }
                          placeholder="Valeur de la variable"
                        />
                      </div>
                    </>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={() => setShowConfig(false)}>
                      Annuler
                    </Button>
                    <Button onClick={handleSaveConfig}>Enregistrer</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <button
              className="hover:bg-destructive/30 rounded p-0.5 text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                deleteNode()
              }}
            >
              ×
            </button>
          </span>
        )}
      </span>
    </NodeViewWrapper>
  )
}

// Extension Tiptap
export const VariablesExtension = Node.create({
  name: "variable",

  group: "inline",

  inline: true,

  atom: true,

  addAttributes() {
    return {
      config: {
        default: {
          type: "system",
          systemVariable: "current_date",
          format: "default",
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "span[data-type='variable']",
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "variable" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(VariableBlockComponent)
  },

  addCommands() {
    return {
      setVariable:
        (attributes: Partial<VariableAttributes>) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          })
        },
    }
  },
})
