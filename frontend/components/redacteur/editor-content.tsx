"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import {
  Save,
  Download,
  Share2,
  Eye,
  MoreVertical,
  FileText,
  Settings,
  Plus,
  Info,
  Loader2,
} from "lucide-react"
import { mockDocuments, type Document } from "@/lib/redacteur-data"
import { CollaborativeTiptapEditor } from "./collaborative-tiptap-editor"
import { TiptapEditor } from "./tiptap-editor"
import { useToast } from "@/hooks/use-toast"

interface EditorContentProps {
  documentId: string
  collaborative?: boolean
}

export function EditorContent({ documentId, collaborative = true }: EditorContentProps) {
  const { toast } = useToast()
  const [document, setDocument] = useState<Document | null>(null)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate loading
    setLoading(true)
    setTimeout(() => {
      if (documentId === "new") {
        setTitle("Nouveau Document")
        setContent("<h1>Titre du Document</h1><p>Commencez à écrire...</p>")
      } else {
        const doc = mockDocuments.find((d) => d.id === documentId)
        if (doc) {
          setDocument(doc)
          setTitle(doc.title)
          // Convert blocks to HTML for Tiptap (simplified)
          const html = (doc.blocks || [])
            .map((block) => {
              if (block.type === "heading") {
                const level = block.content.level || 1
                return `<h${level}>${block.content.text}</h${level}>`
              }
              if (block.type === "paragraph") {
                return `<p>${block.content.text}</p>`
              }
              return ""
            })
            .join("")
          setContent(html || "<p>Contenu du document...</p>")
        }
      }
      setLoading(false)
    }, 500)
  }, [documentId])

  const handleSave = async () => {
    setIsSaving(true)
    // Simulate save
    setTimeout(() => {
      setIsSaving(false)
      toast({
        title: "Document sauvegardé",
        description: "Vos modifications ont été enregistrées avec succès",
      })
      console.log("Document saved:", { title, content })
    }, 1000)
  }

  const DocumentInfoSidebar = () => (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold">Informations</h3>
      <div>
        <label className="text-[10px] text-muted-foreground">Auteur</label>
        <Input className="mt-1 h-7 text-[11px]" value={document?.author.name || "Utilisateur"} readOnly />
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground">Version</label>
        <Input className="mt-1 h-7 text-[11px]" value={`v${document?.version || "1.0"}`} readOnly />
      </div>
      {document && (
        <>
          <div>
            <label className="text-[10px] text-muted-foreground">Statut</label>
            <select className="mt-1 w-full rounded border bg-background px-2 py-1 text-[11px]">
              <option>Brouillon</option>
              <option>En Révision</option>
              <option>Approuvé</option>
              <option>Publié</option>
              <option>Archivé</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Catégorie</label>
            <select className="mt-1 w-full rounded border bg-background px-2 py-1 text-[11px]">
              <option>Rapport Technique</option>
              <option>Procédure</option>
              <option>Contrat</option>
              <option>Note de Service</option>
              <option>Documentation</option>
              <option>Incident</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Confidentialité</label>
            <select className="mt-1 w-full rounded border bg-background px-2 py-1 text-[11px]">
              <option>Public</option>
              <option>Interne</option>
              <option>Confidentiel</option>
              <option>Restreint</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Date de Création</label>
            <Input
              className="mt-1 h-7 text-[11px]"
              value={new Date(document.createdAt).toLocaleDateString("fr-FR")}
              readOnly
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Dernière Modification</label>
            <Input
              className="mt-1 h-7 text-[11px]"
              value={new Date(document.updatedAt).toLocaleDateString("fr-FR")}
              readOnly
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Tags</label>
            <div className="mt-1 flex flex-wrap gap-1">
              {(document.tags || []).map((tag) => (
                <Badge key={tag} variant="secondary" className="h-5 text-[10px]">
                  {tag}
                </Badge>
              ))}
              <Button variant="outline" size="sm" className="h-5 w-5 p-0 bg-transparent">
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <Separator />
          <div>
            <label className="text-[10px] text-muted-foreground">Collaborateurs</label>
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <img src={document.author.avatar || "/placeholder.svg"} alt="" className="h-6 w-6 rounded-full" />
                <div className="flex-1">
                  <p className="text-[10px] font-medium">{document.author.name}</p>
                  <p className="text-[9px] text-muted-foreground">Auteur</p>
                </div>
              </div>
              {(document.collaborators || []).map((collab) => (
                <div key={collab.id} className="flex items-center gap-2">
                  <img src={collab.avatar || "/placeholder.svg"} alt="" className="h-6 w-6 rounded-full" />
                  <div className="flex-1">
                    <p className="text-[10px] font-medium">{collab.name}</p>
                    <p className="text-[9px] text-muted-foreground capitalize">{collab.role}</p>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="h-6 w-full gap-1 text-[10px] bg-transparent">
                <Plus className="h-3 w-3" />
                Ajouter
              </Button>
            </div>
          </div>
          <Separator />
          <div>
            <label className="text-[10px] text-muted-foreground">Historique des Versions</label>
            <div className="mt-2 space-y-2">
              {(document.versions || [])
                .slice(-3)
                .reverse()
                .map((version) => (
                  <div key={version.version} className="rounded border p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium">v{version.version}</span>
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(version.date).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                    <p className="mt-1 text-[9px] text-muted-foreground">{version.changes}</p>
                    <p className="mt-1 text-[9px] text-muted-foreground">{version.author}</p>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b bg-background px-4 py-2">
        <div className="flex items-center gap-2 flex-1">
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-[11px]" asChild>
            <a href="/redacteur/documents">
              <FileText className="h-3 w-3" />
              <span className="hidden sm:inline">Documents</span>
            </a>
          </Button>
          <Separator orientation="vertical" className="h-4 hidden sm:block" />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-7 flex-1 max-w-md border-0 px-2 text-[12px] font-medium focus-visible:ring-1"
            placeholder="Titre du document"
          />
        </div>

        <div className="flex items-center gap-2">
          {document && (
            <>
              <Badge variant="outline" className="h-5 text-[10px] hidden sm:inline-flex">
                v{document.version}
              </Badge>
              <div className="flex -space-x-2 hidden sm:flex">
                <img
                  src={document.author.avatar || "/placeholder.svg"}
                  alt={document.author.name}
                  className="h-6 w-6 rounded-full border-2 border-background"
                />
                {(document.collaborators || []).slice(0, 2).map((collab) => (
                  <img
                    key={collab.id}
                    src={collab.avatar || "/placeholder.svg"}
                    alt={collab.name}
                    className="h-6 w-6 rounded-full border-2 border-background"
                  />
                ))}
              </div>
            </>
          )}
          <Button
            variant="default"
            size="sm"
            className="h-7 gap-1.5 text-[11px]"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            <span className="hidden sm:inline">{isSaving ? "Enregistrement..." : "Enregistrer"}</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 bg-transparent">
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem className="text-[11px]">
                <Eye className="mr-2 h-3 w-3" />
                Aperçu
              </DropdownMenuItem>
              <DropdownMenuItem className="text-[11px]">
                <Share2 className="mr-2 h-3 w-3" />
                Partager
              </DropdownMenuItem>
              <DropdownMenuItem className="text-[11px]">
                <Download className="mr-2 h-3 w-3" />
                Exporter PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-[11px]">
                <Settings className="mr-2 h-3 w-3" />
                Paramètres
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Editor */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="mx-auto max-w-4xl">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : collaborative ? (
              <CollaborativeTiptapEditor
                documentId={documentId}
                userName={document?.author.name || "Utilisateur"}
                placeholder="Commencez à écrire en collaboration..."
              />
            ) : (
              <TiptapEditor
                content={content}
                onChange={setContent}
                placeholder="Commencez à écrire..."
              />
            )}
          </div>
        </div>

        {/* Right Sidebar - Desktop only */}
        <div className="hidden lg:block w-64 border-l bg-muted/30 p-3 overflow-auto">
          <DocumentInfoSidebar />
        </div>

        {/* Mobile Sidebar */}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="fixed bottom-20 right-4 h-10 w-10 rounded-full p-0 shadow-lg lg:hidden z-50 bg-transparent"
            >
              <Info className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Informations du Document</SheetTitle>
              <SheetDescription>Gérez les détails et collaborateurs</SheetDescription>
            </SheetHeader>
            <div className="mt-4">
              <DocumentInfoSidebar />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}
