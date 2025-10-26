"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
import { useToast } from "@/hooks/use-toast"
import { Upload, Loader2 } from "lucide-react"
import { checkForNewModules } from "@/lib/module-loader"

export function UploadModuleDialog() {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const token = localStorage.getItem("access_token")
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/modules/upload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || "Upload failed")
      }

      const result = await response.json()

      toast({
        title: "Module installé !",
        description: `Le module "${result.module.name}" a été installé et compilé avec succès.`,
      })

      // Forcer le rechargement des modules sans recharger la page
      console.log("🔄 Checking for new modules...")
      await checkForNewModules()

      toast({
        title: "Modules rechargés",
        description: "Les nouveaux modules sont maintenant disponibles.",
      })

      setOpen(false)
      setFile(null)
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message || "Échec de l'upload du module",
        variant: "destructive",
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="mr-2 h-4 w-4" />
          Installer un module
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Installer un nouveau module</DialogTitle>
          <DialogDescription>
            Uploadez un fichier ZIP contenant un module. Le module sera
            automatiquement compilé et chargé sans redémarrage.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="module-file">Fichier ZIP du module</Label>
            <Input
              id="module-file"
              type="file"
              accept=".zip"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={uploading}
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                Fichier sélectionné : {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>
          <div className="rounded-lg border p-4 bg-muted/50">
            <h4 className="text-sm font-medium mb-2">Structure requise du ZIP :</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>📄 manifest.json (obligatoire)</li>
              <li>📁 frontend/ (optionnel)</li>
              <li>📁 backend/ (optionnel)</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={uploading}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
          >
            {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {uploading ? "Installation..." : "Installer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
