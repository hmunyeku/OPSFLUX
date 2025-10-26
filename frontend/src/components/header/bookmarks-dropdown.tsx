"use client"

import { useState, useEffect } from "react"
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
import { Star, StarOff, ExternalLink, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import {
  getBookmarks,
  deleteBookmark,
  deleteAllBookmarks,
  type Bookmark as BookmarkType,
} from "@/api/bookmarks"

export function BookmarksDropdown() {
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([])
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  const hasBookmarks = bookmarks.length > 0

  useEffect(() => {
    if (open) {
      loadBookmarks()
    }
  }, [open])

  // Listen for bookmark changes from other components
  useEffect(() => {
    const handleBookmarkChange = () => {
      if (open) {
        loadBookmarks()
      }
    }

    window.addEventListener('bookmarkChanged', handleBookmarkChange)
    return () => window.removeEventListener('bookmarkChanged', handleBookmarkChange)
  }, [open])

  async function loadBookmarks() {
    try {
      setIsLoading(true)
      const data = await getBookmarks()
      setBookmarks(data)
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les marque-pages",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleNavigate = (path: string) => {
    setOpen(false)
    router.push(path)
  }

  const removeBookmark = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    try {
      await deleteBookmark(id)
      setBookmarks(prev => prev.filter(b => b.id !== id))
      toast({
        title: "Marque-page supprimé",
        description: "Le marque-page a été supprimé avec succès",
      })
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le marque-page",
        variant: "destructive",
      })
    }
  }

  const clearAllBookmarks = async () => {
    try {
      await deleteAllBookmarks()
      setBookmarks([])
      setOpen(false)
      toast({
        title: "Marque-pages supprimés",
        description: "Tous les marque-pages ont été supprimés",
      })
    } catch (_error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer les marque-pages",
        variant: "destructive",
      })
    }
  }

  // Grouper par catégorie
  const groupedBookmarks = bookmarks.reduce((acc, bookmark) => {
    const category = bookmark.category || "Autres"
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(bookmark)
    return acc
  }, {} as Record<string, BookmarkType[]>)

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
        {isLoading ? (
          <div className="py-8 text-center">
            <Loader2 className="h-8 w-8 mx-auto text-muted-foreground mb-2 animate-spin" />
            <p className="text-sm text-muted-foreground">Chargement...</p>
          </div>
        ) : !hasBookmarks ? (
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
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
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
