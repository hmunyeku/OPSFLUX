"use client"

import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Star, StarOff, ExternalLink, Plus } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import {
  getBookmarks,
  createBookmark,
  deleteBookmark,
  deleteAllBookmarks,
  type Bookmark as BookmarkType,
} from "@/api/bookmarks"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function Bookmarks() {
  const pathname = usePathname()
  const router = useRouter()

  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([])
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isCurrentPageBookmarked, setIsCurrentPageBookmarked] = useState(false)
  const [currentBookmarkId, setCurrentBookmarkId] = useState<string | null>(null)

  const hasBookmarks = bookmarks.length > 0

  // Check if current page is bookmarked
  useEffect(() => {
    checkCurrentPage()
  }, [pathname, bookmarks])

  // Load bookmarks when dropdown opens
  useEffect(() => {
    if (open) {
      loadBookmarks()
    }
  }, [open])

  async function loadBookmarks() {
    try {
      setIsLoading(true)
      const data = await getBookmarks()
      setBookmarks(data)
    } catch (_error) {
      // Silently fail
    } finally {
      setIsLoading(false)
    }
  }

  function checkCurrentPage() {
    const existing = bookmarks.find((b: BookmarkType) => b.path === pathname)
    if (existing) {
      setIsCurrentPageBookmarked(true)
      setCurrentBookmarkId(existing.id)
    } else {
      setIsCurrentPageBookmarked(false)
      setCurrentBookmarkId(null)
    }
  }

  function getPageTitle() {
    const segments = pathname.split("/").filter(Boolean)
    if (segments.length === 0) return "Accueil"

    const lastSegment = segments[segments.length - 1]
    return lastSegment
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  function getPageCategory() {
    const segments = pathname.split("/").filter(Boolean)
    if (segments.length === 0) return "Navigation"

    const firstSegment = segments[0]
    return firstSegment
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  async function toggleCurrentPageBookmark(event?: React.MouseEvent) {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }

    try {
      if (isCurrentPageBookmarked && currentBookmarkId) {
        // Remove bookmark
        await deleteBookmark(currentBookmarkId)
        setBookmarks(prev => prev.filter(b => b.id !== currentBookmarkId))
        toast({
          title: "Marque-page retiré",
          description: "Cette page a été retirée de vos marque-pages",
        })
      } else {
        // Add bookmark
        const bookmark = await createBookmark({
          title: getPageTitle(),
          path: pathname,
          category: getPageCategory(),
        })
        setBookmarks(prev => [...prev, bookmark])
        toast({
          title: "Marque-page ajouté",
          description: "Cette page a été ajoutée à vos marque-pages",
        })
      }
    } catch (error) {
      toast({
        title: "Erreur",
        description:
          error instanceof Error
            ? error.message
            : "Une erreur est survenue",
        variant: "destructive",
      })
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

  // Group by category
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
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                onContextMenu={(e) => {
                  e.preventDefault()
                  setOpen(true)
                }}
              >
                <Star
                  className={cn(
                    "h-5 w-5 transition-all duration-200",
                    isCurrentPageBookmarked
                      ? "fill-yellow-400 text-yellow-400"
                      : hasBookmarks
                      ? "fill-yellow-400 text-yellow-400 opacity-60"
                      : "text-muted-foreground"
                  )}
                />
                {hasBookmarks && !isCurrentPageBookmarked && (
                  <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-yellow-400 rounded-full text-[8px] font-bold text-white flex items-center justify-center">
                    {bookmarks.length > 9 ? '9+' : bookmarks.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              {isCurrentPageBookmarked
                ? "Page dans les marque-pages - Cliquer pour retirer"
                : hasBookmarks
                ? `${bookmarks.length} marque-page${bookmarks.length > 1 ? 's' : ''} - Cliquer pour ajouter cette page`
                : "Ajouter cette page aux marque-pages"}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Marque-pages</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => toggleCurrentPageBookmark(e)}
            >
              {isCurrentPageBookmarked ? (
                <>
                  <StarOff className="h-3 w-3 mr-1" />
                  Retirer
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3 mr-1" />
                  Ajouter
                </>
              )}
            </Button>
            {hasBookmarks && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={clearAllBookmarks}
              >
                Tout effacer
              </Button>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isLoading ? (
          <div className="py-4 px-2 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !hasBookmarks ? (
          <div className="py-8 text-center">
            <StarOff className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Aucun marque-page</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cliquez sur l&apos;étoile pour ajouter cette page
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
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                      <span className="text-sm truncate">{bookmark.title}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => removeBookmark(bookmark.id, e)}
                        title="Retirer des marque-pages"
                      >
                        <StarOff className="h-3 w-3" />
                      </Button>
                      {bookmark.path !== pathname && (
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      )}
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
