"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Save, ArrowLeft, Eye, Plus, X, FileText, Settings, Layout } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

export function TemplateEditorContent() {
  const router = useRouter()
  const [templateName, setTemplateName] = useState("")
  const [templateDescription, setTemplateDescription] = useState("")
  const [templateCategory, setTemplateCategory] = useState("technical")
  const [templateTags, setTemplateTags] = useState<string[]>([])
  const [templateContent, setTemplateContent] = useState("")
  const [sections, setSections] = useState<Array<{ id: string; title: string; content: string; required: boolean }>>([
    { id: "1", title: "Introduction", content: "", required: true },
    { id: "2", title: "Objectifs", content: "", required: true },
    { id: "3", title: "Méthodologie", content: "", required: false },
    { id: "4", title: "Résultats", content: "", required: true },
    { id: "5", title: "Conclusion", content: "", required: true },
  ])

  const handleSave = () => {
    console.log("[v0] Saving template:", { templateName, templateDescription, templateCategory, sections })
    router.push("/redacteur/templates")
  }

  const addSection = () => {
    const newSection = {
      id: Date.now().toString(),
      title: "Nouvelle section",
      content: "",
      required: false,
    }
    setSections([...sections, newSection])
  }

  const removeSection = (id: string) => {
    setSections(sections.filter((s) => s.id !== id))
  }

  const updateSection = (id: string, field: string, value: any) => {
    setSections(sections.map((s) => (s.id === id ? { ...s, [field]: value } : s)))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-4 border-b bg-background">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/redacteur/templates">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Nouveau modèle de rapport</h1>
            <p className="text-xs text-muted-foreground">Créez un modèle réutilisable</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Eye className="h-4 w-4 mr-2" />
            Aperçu
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Enregistrer
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="general">
                <Settings className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Général</span>
              </TabsTrigger>
              <TabsTrigger value="structure">
                <Layout className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Structure</span>
              </TabsTrigger>
              <TabsTrigger value="content">
                <FileText className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Contenu</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Informations générales</CardTitle>
                  <CardDescription>Définissez les propriétés de base du modèle</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nom du modèle *</Label>
                    <Input
                      id="name"
                      placeholder="Ex: Rapport technique standard"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Décrivez l'usage de ce modèle..."
                      value={templateDescription}
                      onChange={(e) => setTemplateDescription(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Catégorie</Label>
                    <Select value={templateCategory} onValueChange={setTemplateCategory}>
                      <SelectTrigger id="category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="technical">Technique</SelectItem>
                        <SelectItem value="incident">Incident</SelectItem>
                        <SelectItem value="project">Projet</SelectItem>
                        <SelectItem value="test">Test</SelectItem>
                        <SelectItem value="audit">Audit</SelectItem>
                        <SelectItem value="procedure">Procédure</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {templateTags.map((tag, i) => (
                        <Badge key={i} variant="secondary">
                          {tag}
                          <button
                            onClick={() => setTemplateTags(templateTags.filter((_, idx) => idx !== i))}
                            className="ml-1 hover:text-destructive"
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <Input
                      placeholder="Ajouter un tag (Entrée pour valider)..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && e.currentTarget.value) {
                          setTemplateTags([...templateTags, e.currentTarget.value])
                          e.currentTarget.value = ""
                        }
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="structure" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Structure du document</CardTitle>
                  <CardDescription>Définissez les sections du modèle</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {sections.map((section, index) => (
                    <Card key={section.id}>
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                Section {index + 1}
                              </Badge>
                              {section.required && (
                                <Badge variant="secondary" className="text-xs">
                                  Obligatoire
                                </Badge>
                              )}
                            </div>
                            <Input
                              placeholder="Titre de la section"
                              value={section.title}
                              onChange={(e) => updateSection(section.id, "title", e.target.value)}
                            />
                            <Textarea
                              placeholder="Instructions ou contenu par défaut..."
                              value={section.content}
                              onChange={(e) => updateSection(section.id, "content", e.target.value)}
                              rows={2}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSection(section.id)}
                            disabled={section.required}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  <Button variant="outline" className="w-full bg-transparent" onClick={addSection}>
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter une section
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="content" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Contenu du modèle</CardTitle>
                  <CardDescription>Rédigez le contenu par défaut du modèle</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Contenu du modèle..."
                    value={templateContent}
                    onChange={(e) => setTemplateContent(e.target.value)}
                    rows={20}
                    className="font-mono text-sm"
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
