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

interface AddBookmarkButtonProps {
  title: string
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
      } else {
        // Add bookmark
        const bookmark = await createBookmark({
          title,
          path: pathname,
          category: category || "Autres",
        })
        setIsBookmarked(true)
        setBookmarkId(bookmark.id)
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
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleBookmark}
      disabled={isLoading}
      className={cn("relative", className)}
      title={isBookmarked ? "Retirer des marque-pages" : "Ajouter aux marque-pages"}
    >
      <Star
        className={cn(
          "h-5 w-5 transition-colors",
          isBookmarked && "fill-yellow-400 text-yellow-400"
        )}
      />
    </Button>
  )
}
