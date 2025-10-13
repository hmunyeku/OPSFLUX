"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Star, StarOff, ExternalLink, Settings, Folder, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

interface Bookmark {
  id: string
  title: string
  path: string
  icon?: React.ReactNode
  category?: string
}

// Données de démo - à remplacer par des données persistantes
const mockBookmarks: Bookmark[] = [
  {
    id: "1",
    title: "Dashboard Principal",
    path: "/",
    icon: <Folder className="h-4 w-4" />,
    category: "Dashboard"
  },
  {
    id: "2",
    title: "Gestion des utilisateurs",
    path: "/users",
    icon: <FileText className="h-4 w-4" />,
    category: "Administration"
  },
  {
    id: "3",
    title: "Paramètres système",
    path: "/settings",
    icon: <Settings className="h-4 w-4" />,
    category: "Configuration"
  },
]

export function BookmarksDropdown() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(mockBookmarks)
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const hasBookmarks = bookmarks.length > 0

  const handleNavigate = (path: string) => {
    setOpen(false)
    router.push(path)
  }

  const removeBookmark = (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    setBookmarks(prev => prev.filter(b => b.id !== id))
  }

  const clearAllBookmarks = () => {
    setBookmarks([])
    setOpen(false)
  }

  // Grouper par catégorie
  const groupedBookmarks = bookmarks.reduce((acc, bookmark) => {
    const category = bookmark.category || "Autres"
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(bookmark)
    return acc
  }, {} as Record<string, Bookmark[]>)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Star className={cn("h-5 w-5", hasBookmarks && "fill-yellow-400 text-yellow-400")} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Marquepages</span>
          {hasBookmarks && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={clearAllBookmarks}
            >
              Tout effacer
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!hasBookmarks ? (
          <div className="py-8 text-center">
            <StarOff className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Aucun marquepage</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cliquez sur l&apos;étoile dans les pages pour les ajouter
            </p>
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto">
            {Object.entries(groupedBookmarks).map(([category, items]) => (
              <div key={category}>
                <div className="px-2 py-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{category}</p>
                </div>
                {items.map((bookmark) => (
                  <DropdownMenuItem
                    key={bookmark.id}
                    onClick={() => handleNavigate(bookmark.path)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {bookmark.icon}
                      <span className="text-sm truncate">{bookmark.title}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => removeBookmark(bookmark.id, e)}
                        title="Retirer des marquepages"
                      >
                        <StarOff className="h-3 w-3" />
                      </Button>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
