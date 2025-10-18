"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
} from "@/components/ui/alert-dialog"
import {
  IconUpload,
  IconDownload,
  IconTrash,
  IconRefresh,
  IconFile,
  IconFileText,
  IconPhoto,
  IconVideo,
  IconMusic,
  IconArchive,
  IconSearch,
} from "@tabler/icons-react"
import ContentSection from "../components/content-section"
import { useToast } from "@/hooks/use-toast"
import {
  uploadFile,
  listFiles,
  deleteFile,
  getFileUrl,
  FileCategory,
  type FileInfo,
} from "@/api/storage"

export default function StoragePage() {
  const [files, setFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<FileInfo | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [filterModule, setFilterModule] = useState<string>("")
  const [filterCategory, setFilterCategory] = useState<FileCategory | "">("")
  const [searchQuery, setSearchQuery] = useState("")
  const { toast } = useToast()

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listFiles(
        filterModule || undefined,
        filterCategory ? (filterCategory as FileCategory) : undefined
      )
      setFiles(data.files)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de charger les fichiers.",
      })
    } finally {
      setLoading(false)
    }
  }, [filterModule, filterCategory, toast])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  const handleUpload = async () => {
    if (!selectedFile) return

    setUploading(true)
    try {
      await uploadFile(selectedFile, "core", undefined, true)
      toast({
        title: "Fichier uploadé",
        description: `${selectedFile.name} a été uploadé avec succès.`,
      })
      setSelectedFile(null)
      setUploadDialogOpen(false)
      await fetchFiles()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur d'upload",
        description: error instanceof Error ? error.message : "Impossible d'uploader le fichier.",
      })
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!fileToDelete) return

    try {
      await deleteFile(fileToDelete.path)
      toast({
        title: "Fichier supprimé",
        description: `${fileToDelete.filename} a été supprimé.`,
      })
      setDeleteDialogOpen(false)
      setFileToDelete(null)
      await fetchFiles()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de supprimer le fichier.",
      })
    }
  }

  const getCategoryIcon = (category: FileCategory) => {
    switch (category) {
      case FileCategory.DOCUMENT:
        return <IconFileText className="h-4 w-4" />
      case FileCategory.IMAGE:
        return <IconPhoto className="h-4 w-4" />
      case FileCategory.VIDEO:
        return <IconVideo className="h-4 w-4" />
      case FileCategory.AUDIO:
        return <IconMusic className="h-4 w-4" />
      case FileCategory.ARCHIVE:
        return <IconArchive className="h-4 w-4" />
      default:
        return <IconFile className="h-4 w-4" />
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const filteredFiles = files.filter((file) =>
    searchQuery
      ? file.filename.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  )

  return (
    <ContentSection
      title="Gestion des Fichiers"
      desc="Upload, gestion et stockage de fichiers"
      className="w-full lg:max-w-full"
    >
      <div className="space-y-6">
        {/* Filters & Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1 min-w-[200px]">
              <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher un fichier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Toutes</SelectItem>
                <SelectItem value={FileCategory.DOCUMENT}>Documents</SelectItem>
                <SelectItem value={FileCategory.IMAGE}>Images</SelectItem>
                <SelectItem value={FileCategory.VIDEO}>Vidéos</SelectItem>
                <SelectItem value={FileCategory.AUDIO}>Audio</SelectItem>
                <SelectItem value={FileCategory.ARCHIVE}>Archives</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchFiles}>
              <IconRefresh className="mr-2 h-4 w-4" />
              Actualiser
            </Button>
            <Button size="sm" onClick={() => setUploadDialogOpen(true)}>
              <IconUpload className="mr-2 h-4 w-4" />
              Upload
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total fichiers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{files.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Taille totale</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatFileSize(files.reduce((acc, f) => acc + f.size, 0))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Catégories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Set(files.map((f) => f.category)).size}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Files List */}
        <Card>
          <CardHeader>
            <CardTitle>Fichiers</CardTitle>
            <CardDescription>
              {filteredFiles.length} fichier(s)
              {searchQuery && ` correspondant à "${searchQuery}"`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <IconRefresh className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <IconFile className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Aucun fichier</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFiles.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {getCategoryIcon(file.category)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{file.filename}</p>
                        <div className="flex gap-2 text-xs text-muted-foreground">
                          <span>{formatFileSize(file.size)}</span>
                          <span>•</span>
                          <Badge variant="outline" className="text-xs">
                            {file.category}
                          </Badge>
                          <span>•</span>
                          <span>{file.module}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(getFileUrl(file.path), "_blank")}
                      >
                        <IconDownload className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setFileToDelete(file)
                          setDeleteDialogOpen(true)
                        }}
                      >
                        <IconTrash className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload un fichier</DialogTitle>
            <DialogDescription>
              Sélectionnez un fichier à uploader sur le serveur
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            {selectedFile && (
              <div className="text-sm text-muted-foreground">
                <p>Fichier: {selectedFile.name}</p>
                <p>Taille: {formatFileSize(selectedFile.size)}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUploadDialogOpen(false)
                setSelectedFile(null)
              }}
              disabled={uploading}
            >
              Annuler
            </Button>
            <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
              {uploading ? "Upload..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le fichier ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer{" "}
              <span className="font-semibold">{fileToDelete?.filename}</span> ?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentSection>
  )
}
