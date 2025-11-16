import { GalleryContent } from "@/components/dashboard/gallery-content"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export default function GalleryPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Galerie de Dashboards</h1>
            <p className="text-xs text-muted-foreground">Gérez vos dashboards personnels et obligatoires</p>
          </div>
          <Button size="sm" className="h-8 gap-1.5 text-xs" asChild>
            <a href="/new">
              <Plus className="h-3.5 w-3.5" />
              Nouveau Dashboard
            </a>
          </Button>
        </div>
      </div>
      <GalleryContent />
    </div>
  )
}
