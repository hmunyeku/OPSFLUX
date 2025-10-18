"use client"

import { useCallback, useState } from "react"
import {
  AlertCircle,
  CheckCircle,
  Download,
  File,
  FileText,
  HelpCircle,
  Upload,
  UploadIcon,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"

interface FileWithPreview {
  name: string
  type: string
  size: string
  progress?: number
  status?: "uploading" | "success" | "error"
}

interface ImportDialogProps {
  disabled?: boolean
}

export default function ImportDialog({ disabled }: ImportDialogProps) {
  const [open, setOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState<FileWithPreview[]>([])

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFiles = useCallback((files: File[]) => {
    const updatedFiles = files.map((file) => {
      return {
        name: file.name,
        size: (file.size / 1024).toFixed(2) + " KB",
        type: file.type,
        progress: 0,
        status: "uploading" as const,
      }
    })

    setFiles((prevFiles) => [...prevFiles, ...updatedFiles])
    updatedFiles.forEach(uploadFile)
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const droppedFiles = Array.from(e.dataTransfer.files)
      handleFiles(droppedFiles)
    },
    [handleFiles]
  )

  const uploadFile = (file: FileWithPreview) => {
    let progress = 0
    const intervalId = setInterval(() => {
      progress += 10
      setFiles((prevFiles) =>
        prevFiles.map((f) => (f.name === file.name ? { ...f, progress } : f))
      )
      if (progress >= 100) {
        clearInterval(intervalId)

        setTimeout(() => {
          setFiles((prevFiles) =>
            prevFiles.map((f) =>
              f.name === file.name ? { ...f, status: "success" } : f
            )
          )
        }, 500)
      }
    }, 300)

    // Simulate potential errors (1 in 10 chance)
    if (Math.random() < 0.1) {
      setTimeout(() => {
        clearInterval(intervalId)
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f === file ? { ...f, status: "error", progress: 100 } : f
          )
        )
      }, 2000)
    }
  }

  /* Manual Upload */
  const onManualUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const files = Array.from(e.target.files)
        handleFiles(files)
      }
    },
    [handleFiles]
  )

  const removeFile = useCallback((fileToRemove: FileWithPreview) => {
    setFiles((prevFiles) => prevFiles.filter((file) => file !== fileToRemove))
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>Importer</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Importer</DialogTitle>
          <DialogDescription>
            Importez vos données ici. Cliquez sur téléverser lorsque vous êtes prêt.
          </DialogDescription>
        </DialogHeader>

        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            "border-muted flex h-full min-h-[150px] w-full cursor-pointer items-center justify-center rounded-sm border border-dashed transition-colors",
            {
              "border-muted-foreground": isDragging,
            }
          )}
        >
          <input
            type="file"
            onChange={onManualUpload}
            multiple
            id="file-upload"
            className="sr-only"
          />
          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-2"
            htmlFor="file-upload"
          >
            <UploadIcon strokeWidth={1.4} size={22} />
            <p className="text-xs text-gray-500">
              Glissez-déposez des fichiers ici, ou cliquez pour sélectionner des fichiers
            </p>
          </label>
        </div>

        <div>
          {files.length > 0 && (
            <ul className="mt-4 space-y-2">
              {files.map((file, index) => (
                <li
                  key={index}
                  className="bg-muted/50 flex items-center justify-between rounded p-2"
                >
                  <div className="flex flex-1 flex-col items-start gap-2">
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-2">
                        <File className="opacity-50" size={22} />
                        <div className="flex flex-col">
                          <span className="truncate text-xs">{file.name}</span>
                          <span className="text-xs text-gray-500">
                            {file.size}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFile(file)}
                        className="text-red-500 hover:text-red-600"
                        aria-label={`Supprimer ${file.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex w-full items-center justify-between gap-3">
                      <Progress
                        value={file.progress}
                        className="h-[2px] opacity-60 transition-all"
                      />
                      <div className="flex w-[30px] items-center justify-end">
                        {file.status === "uploading" && (
                          <span className="text-xs text-gray-500">
                            {file.progress}%
                          </span>
                        )}
                        {file.status === "success" && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        {file.status === "error" && (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-4">
          <Separator className="flex-1" />
          <p className="text-xs font-medium">OR</p>
          <Separator className="flex-1" />
        </div>

        <Label htmlFor="url-import">Importer depuis une URL</Label>
        <Input id="url-import" placeholder="Ajouter une URL de fichier" />

        <DialogFooter>
          <Popover>
            <PopoverTrigger asChild>
              <Button className="mr-auto p-0" variant="link">
                <HelpCircle />
                <span>Centre d&apos;aide</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <h3 className="mb-2 text-base font-semibold">
                Aide Import/Export
              </h3>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="import">
                  <AccordionTrigger>
                    <div className="flex items-center">
                      <Upload className="mr-2 h-4 w-4" />
                      Importation de données
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>Formats supportés : CSV, JSON, XML</li>
                      <li>Taille maximale du fichier : 50MB</li>
                      <li>Assurez-vous que votre fichier a les bons en-têtes de colonnes</li>
                      <li>Utilisez l&apos;encodage UTF-8 pour de meilleurs résultats</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="export">
                  <AccordionTrigger>
                    <div className="flex items-center">
                      <Download className="mr-2 h-4 w-4" />
                      Exportation de données
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>Choisissez parmi les formats CSV, JSON ou XML</li>
                      <li>Sélectionnez des plages de données spécifiques ou exportez tout</li>
                      <li>Les fichiers exportés sont compressés pour plus d&apos;efficacité</li>
                      <li>Vérifiez l&apos;exactitude des données exportées</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="format">
                  <AccordionTrigger>
                    <div className="flex items-center">
                      <FileText className="mr-2 h-4 w-4" />
                      Directives de format de fichier
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="mb-2">
                      Assurez-vous que vos fichiers respectent ces directives :
                    </p>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>Utilisez des types de données cohérents par colonne</li>
                      <li>Évitez les caractères spéciaux dans les en-têtes</li>
                      <li>Utilisez le format de date ISO (AAAA-MM-JJ)</li>
                      <li>Séparez le texte avec des virgules, pas des points-virgules</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              <div className="bg-muted mt-4 rounded-md p-3">
                <div className="mb-2 flex items-center">
                  <AlertCircle className="mr-2 h-4 w-4" />
                  <span className="text-sm font-semibold">Note importante</span>
                </div>
                <p className="text-xs text-gray-400">
                  Sauvegardez toujours vos données avant d&apos;effectuer toute opération d&apos;importation ou d&apos;exportation.
                </p>
              </div>
            </PopoverContent>
          </Popover>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                setFiles([])
                setOpen(false)
              }}
              type="button"
              variant="outline"
            >
              Annuler
            </Button>
            <Button type="submit">Importer</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
