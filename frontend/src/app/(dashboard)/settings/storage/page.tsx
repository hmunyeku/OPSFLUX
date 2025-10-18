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
import { useTranslation } from "@/hooks/use-translation"
import {
  uploadFile,
  listFiles,
  deleteFile,
  getFileUrl,
  FileCategory,
  type FileInfo,
} from "@/api/storage"
import { PermissionGuard } from "@/components/permission-guard"
import { usePermissions } from "@/hooks/use-permissions"

export default function StoragePage() {
  return (
    <PermissionGuard permission="core.storage.read">
      <StoragePageContent />
    </PermissionGuard>
  )
}

function StoragePageContent() {
  const { hasPermission } = usePermissions()
  const [files, setFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<FileInfo | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [_filterModule, _setFilterModule] = useState<string>("")
  const [filterCategory, setFilterCategory] = useState<FileCategory | "">("")
  const [searchQuery, setSearchQuery] = useState("")
  const { toast } = useToast()
  const { t } = useTranslation("core.storage")

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listFiles(
        _filterModule || undefined,
        filterCategory ? (filterCategory as FileCategory) : undefined
      )
      setFiles(data.files)
    } catch (_error) {
      toast({
        variant: "destructive",
        title: t("toast.error.title"),
        description: t("toast.error.load"),
      })
    } finally {
      setLoading(false)
    }
  }, [_filterModule, filterCategory, toast, t])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  const handleUpload = async () => {
    if (!selectedFile) return

    setUploading(true)
    try {
      await uploadFile(selectedFile, "core", undefined, true)
      toast({
        title: t("toast.upload.success"),
        description: t("toast.upload.success_description", { filename: selectedFile.name }),
      })
      setSelectedFile(null)
      setUploadDialogOpen(false)
      await fetchFiles()
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("toast.upload.error"),
        description: error instanceof Error ? error.message : t("toast.error.load"),
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
        title: t("toast.delete.success"),
        description: t("toast.delete.success_description", { filename: fileToDelete.filename }),
      })
      setDeleteDialogOpen(false)
      setFileToDelete(null)
      await fetchFiles()
    } catch (_error) {
      toast({
        variant: "destructive",
        title: t("toast.error.title"),
        description: t("toast.error.delete"),
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
      title={t("page.title")}
      desc={t("page.description")}
      className="w-full lg:max-w-full"
    >
      <div className="space-y-6">
        {/* Filters & Actions */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1 w-full sm:min-w-[200px]">
              <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("actions.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder={t("actions.category")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("actions.category_all")}</SelectItem>
                <SelectItem value={FileCategory.DOCUMENT}>{t("actions.category_documents")}</SelectItem>
                <SelectItem value={FileCategory.IMAGE}>{t("actions.category_images")}</SelectItem>
                <SelectItem value={FileCategory.VIDEO}>{t("actions.category_videos")}</SelectItem>
                <SelectItem value={FileCategory.AUDIO}>{t("actions.category_audio")}</SelectItem>
                <SelectItem value={FileCategory.ARCHIVE}>{t("actions.category_archives")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 justify-end sm:justify-start">
            <Button variant="outline" size="sm" onClick={fetchFiles}>
              <IconRefresh className="mr-2 h-4 w-4" />
              {t("actions.refresh")}
            </Button>
            <Button size="sm" onClick={() => setUploadDialogOpen(true)} disabled={!hasPermission("core.storage.upload")}>
              <IconUpload className="mr-2 h-4 w-4" />
              {t("actions.upload")}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("stats.total_files")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{files.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("stats.total_size")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatFileSize(files.reduce((acc, f) => acc + f.size, 0))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("stats.categories")}</CardTitle>
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
            <CardTitle>{t("files.title")}</CardTitle>
            <CardDescription>
              {t("files.count", { count: filteredFiles.length })}
              {searchQuery && ` ${t("files.search_results", { query: searchQuery })}`}
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
                <p>{t("files.empty")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFiles.map((file) => (
                  <div
                    key={file.path}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {getCategoryIcon(file.category)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{file.filename}</p>
                        <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span>{formatFileSize(file.size)}</span>
                          <span className="hidden sm:inline">•</span>
                          <Badge variant="outline" className="text-xs">
                            {file.category}
                          </Badge>
                          <span className="hidden sm:inline">•</span>
                          <span className="truncate max-w-[100px]">{file.module}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 justify-end sm:justify-start">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => window.open(getFileUrl(file.path), "_blank")}
                      >
                        <IconDownload className="h-4 w-4" />
                        <span className="sr-only">Télécharger</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          setFileToDelete(file)
                          setDeleteDialogOpen(true)
                        }}
                        disabled={!hasPermission("core.storage.delete")}
                      >
                        <IconTrash className="h-4 w-4 text-destructive" />
                        <span className="sr-only">Supprimer</span>
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
            <DialogTitle>{t("dialog.upload.title")}</DialogTitle>
            <DialogDescription>
              {t("dialog.upload.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            {selectedFile && (
              <div className="text-sm text-muted-foreground">
                <p>{t("dialog.upload.file_label")}: {selectedFile.name}</p>
                <p>{t("dialog.upload.size_label")}: {formatFileSize(selectedFile.size)}</p>
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
              {t("dialog.upload.cancel")}
            </Button>
            <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
              {uploading ? t("dialog.upload.uploading") : t("dialog.upload.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialog.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("dialog.delete.description", { filename: fileToDelete?.filename || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("dialog.delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("dialog.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentSection>
  )
}
