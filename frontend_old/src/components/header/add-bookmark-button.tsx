"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import {
  getBookmarks,
  createBookmark,
  deleteBookmark,
  type Bookmark,
} from "@/api/bookmarks"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface AddBookmarkButtonProps {
  title?: string
  category?: string
  className?: string
}

export function AddBookmarkButton({
  title,
  category,
  className,
}: AddBookmarkButtonProps) {
  const pathname = usePathname()
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [bookmarkId, setBookmarkId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    checkIfBookmarked()
  }, [pathname])

  async function checkIfBookmarked() {
    try {
      const bookmarks = await getBookmarks()
      const existing = bookmarks.find((b: Bookmark) => b.path === pathname)
      if (existing) {
        setIsBookmarked(true)
        setBookmarkId(existing.id)
      } else {
        setIsBookmarked(false)
        setBookmarkId(null)
      }
    } catch (_error) {
      // Silently fail - user might not be logged in
    }
  }

  const getPageTitle = () => {
    if (title) return title

    // Extract title from pathname
    const segments = pathname.split("/").filter(Boolean)
    if (segments.length === 0) return "Accueil"

    // Get the last segment and format it
    const lastSegment = segments[segments.length - 1]
    return lastSegment
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  const getPageCategory = () => {
    if (category) return category

    const segments = pathname.split("/").filter(Boolean)
    if (segments.length === 0) return "Navigation"

    // First segment as category
    const firstSegment = segments[0]
    return firstSegment
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  async function toggleBookmark() {
    if (isLoading) return

    try {
      setIsLoading(true)

      if (isBookmarked && bookmarkId) {
        // Remove bookmark
        await deleteBookmark(bookmarkId)
        setIsBookmarked(false)
        setBookmarkId(null)
        toast({
          title: "Marque-page retiré",
          description: "Cette page a été retirée de vos marque-pages",
        })
        // Notify other components
        window.dispatchEvent(new Event('bookmarkChanged'))
      } else {
        // Add bookmark
        const bookmark = await createBookmark({
          title: getPageTitle(),
          path: pathname,
          category: getPageCategory(),
        })
        setIsBookmarked(true)
        setBookmarkId(bookmark.id)
        toast({
          title: "Marque-page ajouté",
          description: "Cette page a été ajoutée à vos marque-pages",
        })
        // Notify other components
        window.dispatchEvent(new Event('bookmarkChanged'))
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
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleBookmark}
            disabled={isLoading}
            className={cn("relative", className)}
          >
            <Star
              className={cn(
                "h-5 w-5 transition-all duration-200",
                isBookmarked
                  ? "fill-yellow-400 text-yellow-400 scale-110"
                  : "text-muted-foreground hover:text-yellow-400 hover:scale-110"
              )}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {isBookmarked ? "Retirer des marque-pages" : "Ajouter aux marque-pages"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
