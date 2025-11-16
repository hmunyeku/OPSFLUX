"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import {
  Home,
  Search,
  Star,
  Bot,
  Bell,
  ChevronRight,
  Loader2,
  MoreVertical,
  X,
  Settings,
  Menu,
  LogOut,
  GripVertical,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "./theme-toggle"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { mockNotifications, mockUser } from "@/lib/mock-data"
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog"
import Link from "next/link"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { NotificationsDrawer } from "./notifications-drawer"
import { AIDrawer } from "./ai/ai-drawer"
import { useHeaderContext } from "./header-context"
import { useFavorites } from "@/lib/favorites-context"
import { useAuth } from "@/lib/auth-context"
import { useNotifications } from "@/lib/notifications-context"
import { BookmarksApi } from "@/lib/bookmarks-api"
import { usePermissions } from "@/lib/permissions-context"
import {
  getContextualActionsForRoute,
  filterContextualActions,
} from "@/lib/contextual-actions-permissions"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

type HeaderProps = {}

function TruncatedBreadcrumb({ label, isLast }: { label: string; isLast: boolean }) {
  const maxLength = 20

  if (label.length <= maxLength) {
    return <span>{label}</span>
  }

  // Show first 8 and last 8 characters with ellipsis in middle
  const start = label.slice(0, 8)
  const end = label.slice(-8)

  return (
    <span title={label}>
      {start}...{end}
    </span>
  )
}

export function Header() {
  const [searchValue, setSearchValue] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const [favoritesOpen, setFavoritesOpen] = React.useState(false)
  const { favorites, addFavorite, removeFavorite, isFavorite, refreshFavorites } = useFavorites()
  const [notifications, setNotifications] = React.useState(mockNotifications)
  const starClickTimeoutRef = React.useRef<NodeJS.Timeout>()
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)
  const { user: authUser, logout } = useAuth()
  const [favoritesSearch, setFavoritesSearch] = React.useState("")
  const [draggedItem, setDraggedItem] = React.useState<string | null>(null)
  const [dragOverItem, setDragOverItem] = React.useState<string | null>(null)
  const [addFavoriteDialogOpen, setAddFavoriteDialogOpen] = React.useState(false)
  const [newFavoriteTitle, setNewFavoriteTitle] = React.useState("")
  const [newFavoriteCategory, setNewFavoriteCategory] = React.useState("")
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading: permissionsLoading } = usePermissions()

  const pathname = usePathname()

  const getBreadcrumbs = () => {
    const paths = pathname.split("/").filter(Boolean)
    const breadcrumbs = [{ label: "Accueil", href: "/" }]

    let currentPath = ""
    paths.forEach((path, index) => {
      currentPath += `/${path}`
      const label = path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, " ")
      breadcrumbs.push({ label, href: currentPath })
    })

    return breadcrumbs
  }

  const breadcrumbs = getBreadcrumbs()

  const headerContext = useHeaderContext()

  const getSearchPlaceholder = () => {
    if (headerContext.searchPlaceholder) {
      return headerContext.searchPlaceholder
    }
    if (pathname.includes("/settings/users")) return "Rechercher des utilisateurs... (Ctrl+K)"
    if (pathname.includes("/projects")) return "Rechercher des projets... (Ctrl+K)"
    if (pathname.includes("/tiers")) return "Rechercher des tiers... (Ctrl+K)"
    if (pathname.includes("/redacteur")) return "Rechercher des documents... (Ctrl+K)"
    return "Rechercher... (Ctrl+K)"
  }

  /**
   * Get and filter contextual options based on user permissions
   */
  const contextualOptions = React.useMemo(() => {
    // Get actions for the current route
    const actions = getContextualActionsForRoute(pathname)

    // Filter based on user permissions
    if (permissionsLoading) {
      return actions // Show all while loading
    }

    return filterContextualActions(
      actions,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions
    )
  }, [pathname, permissionsLoading, hasPermission, hasAnyPermission, hasAllPermissions])

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault()
        setShortcutsOpen(true)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const handleFavoriteClick = () => {
    if (starClickTimeoutRef.current) {
      clearTimeout(starClickTimeoutRef.current)
      starClickTimeoutRef.current = undefined
      setFavoritesOpen(true)
    } else {
      starClickTimeoutRef.current = setTimeout(() => {
        if (!isFavorite(pathname)) {
          // Open dialog to name the favorite
          const breadcrumbs = getBreadcrumbs()
          const currentPage = breadcrumbs[breadcrumbs.length - 1]
          setNewFavoriteTitle(currentPage.label)
          setNewFavoriteCategory(breadcrumbs.length > 1 ? breadcrumbs[1].label : "Général")
          setAddFavoriteDialogOpen(true)
        }
        starClickTimeoutRef.current = undefined
      }, 250)
    }
  }

  const handleSaveFavorite = async () => {
    try {
      await addFavorite({
        title: newFavoriteTitle.trim() || "Sans titre",
        path: pathname,
        category: newFavoriteCategory.trim() || "Général",
      })
      setAddFavoriteDialogOpen(false)
      setNewFavoriteTitle("")
      setNewFavoriteCategory("")
    } catch (error) {
      console.error("Failed to add favorite:", error)
    }
  }

  const { unreadCount } = useNotifications()

  const handleSearchChange = (value: string) => {
    setSearchValue(value)
    if (headerContext.onSearchChange) {
      headerContext.onSearchChange(value)
    }
  }

  // Filter favorites based on search
  const filteredFavorites = React.useMemo(() => {
    if (!favoritesSearch.trim()) return favorites
    const search = favoritesSearch.toLowerCase()
    return favorites.filter(
      (fav) =>
        (fav?.title?.toLowerCase() ?? '').includes(search) ||
        (fav?.path?.toLowerCase() ?? '').includes(search) ||
        (fav?.category?.toLowerCase() ?? '').includes(search)
    )
  }, [favorites, favoritesSearch])

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItem(id)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (draggedItem !== id) {
      setDragOverItem(id)
    }
  }

  const handleDragEnd = async () => {
    if (draggedItem && dragOverItem && draggedItem !== dragOverItem) {
      const draggedIndex = favorites.findIndex((f) => f.id === draggedItem)
      const overIndex = favorites.findIndex((f) => f.id === dragOverItem)

      if (draggedIndex !== -1 && overIndex !== -1) {
        const newFavorites = [...favorites]
        const [removed] = newFavorites.splice(draggedIndex, 1)
        newFavorites.splice(overIndex, 0, removed)

        // Update positions on server
        try {
          const bookmarkIds = newFavorites.map((f) => f.id)
          await BookmarksApi.reorderBookmarks(bookmarkIds)
          // Refresh favorites list to reflect new order
          await refreshFavorites()
        } catch (error) {
          console.error("Failed to reorder bookmarks:", error)
        }
      }
    }
    setDraggedItem(null)
    setDragOverItem(null)
  }

  return (
    <>
      <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b bg-card px-4 shadow-sm w-full">
        {/* Left Section */}
        <div className="flex items-center gap-3">
          <SidebarTrigger className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground transition-colors">
            <Menu className="h-4 w-4" />
            <span className="sr-only">Replier/Déplier le menu (Ctrl+B)</span>
          </SidebarTrigger>

          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
              OF
            </div>
            <span className="hidden sm:inline-block font-semibold text-base">OpsFlux</span>
          </div>

          {/* Home Button */}
          <Button variant="ghost" size="icon" className="hidden md:flex" title="Accueil" asChild>
            <Link href="/">
              <Home className="h-4 w-4" />
            </Link>
          </Button>

          <nav className="hidden md:flex items-center gap-1 text-sm text-muted-foreground max-w-md">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.href}>
                {index > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0" />}
                <Link
                  href={crumb.href}
                  className={`hover:text-foreground transition-colors truncate ${
                    index === breadcrumbs.length - 1 ? "font-semibold text-foreground" : ""
                  }`}
                  title={crumb.label}
                >
                  <TruncatedBreadcrumb label={crumb.label} isLast={index === breadcrumbs.length - 1} />
                </Link>
              </React.Fragment>
            ))}
          </nav>
        </div>

        {/* Center Section - Contextual Search */}
        <div className="flex-1 max-w-md mx-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={getSearchPlaceholder()}
              value={headerContext.searchValue ?? searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 pr-9 h-9 text-sm"
            />
            {isLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-1">
          {headerContext.customRender ? (
            headerContext.customRender
          ) : headerContext.contextualButtons && headerContext.contextualButtons.length > 0 ? (
            <>
              {headerContext.contextualButtons.map((button, index) => (
                <Button
                  key={index}
                  variant={button.variant || "ghost"}
                  size="sm"
                  onClick={button.onClick}
                  className="hidden lg:flex gap-2"
                >
                  {button.icon && <button.icon className="h-4 w-4" />}
                  {button.label}
                </Button>
              ))}
            </>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="hidden lg:flex" title="Options contextuelles">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {contextualOptions.map((option, index) => (
                  <DropdownMenuItem key={index} onClick={option.action}>
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            variant="ghost"
            size="icon"
            title={isFavorite(pathname) ? "Page dans les favoris (Double-clic pour voir tous)" : "Ajouter aux favoris (Double-clic pour voir tous)"}
            onClick={handleFavoriteClick}
          >
            <Star className={`h-4 w-4 ${isFavorite(pathname) ? "fill-primary text-primary" : ""}`} />
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" title="Assistant IA">
                <Bot className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[400px] sm:w-[500px] p-0">
              <AIDrawer />
            </SheetContent>
          </Sheet>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" title="Notifications">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                    {unreadCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[400px] sm:w-[500px] p-0">
              <NotificationsDrawer />
            </SheetContent>
          </Sheet>

          {/* Quick Settings */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" title="Paramètres rapides">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Paramètres Rapides</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="flex items-center justify-between">
                <span>Mode Sombre</span>
                <ThemeToggle />
              </DropdownMenuItem>
              <DropdownMenuItem>Langue: Français</DropdownMenuItem>
              <DropdownMenuItem>Densité: Compacte</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={authUser?.avatar} alt={authUser?.name || "User"} />
                  <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                    {authUser?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden lg:inline-block text-sm font-medium">{authUser?.name || mockUser.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">{authUser?.name || mockUser.name}</p>
                  <p className="text-xs text-muted-foreground">{authUser?.email || mockUser.email}</p>
                  <Badge variant="secondary" className="w-fit text-[10px] mt-1">
                    {authUser?.role || mockUser.role}
                  </Badge>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href="/profile">Mon Profil</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/profile?tab=settings">Paramètres personnels</a>
              </DropdownMenuItem>
              <DropdownMenuItem>Préférences</DropdownMenuItem>
              <DropdownMenuItem>Documentation</DropdownMenuItem>
              <DropdownMenuItem>Support & Aide</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                Déconnexion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Loading Progress Bar */}
        {isLoading && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/20">
            <div className="h-full bg-primary animate-pulse" style={{ width: "60%" }} />
          </div>
        )}
      </header>

      <Sheet open={favoritesOpen} onOpenChange={setFavoritesOpen}>
        <SheetContent side="right" className="w-full sm:w-[400px] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b shrink-0 space-y-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2 text-base">
                <Star className="h-4 w-4 text-primary" />
                Mes Favoris
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                  {favorites.length}
                </Badge>
              </SheetTitle>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-4 py-3 shrink-0 border-b">
              <Input
                placeholder="Rechercher..."
                value={favoritesSearch}
                onChange={(e) => setFavoritesSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <ScrollArea className="flex-1 px-4">
              {filteredFavorites.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Star className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {favoritesSearch ? "Aucun résultat" : "Aucun favori"}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-[250px]">
                    {favoritesSearch
                      ? "Essayez une autre recherche"
                      : "Cliquez sur l'étoile pour ajouter des pages"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1 py-3">
                  {filteredFavorites.map((favorite) => (
                    <div
                      key={favorite.id}
                      draggable={!favoritesSearch}
                      onDragStart={(e) => handleDragStart(e, favorite.id)}
                      onDragOver={(e) => handleDragOver(e, favorite.id)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-2 p-2 rounded-md hover:bg-accent group transition-all ${
                        draggedItem === favorite.id ? "opacity-50 cursor-grabbing" : ""
                      } ${dragOverItem === favorite.id ? "border-l-2 border-primary bg-accent/50" : ""}`}
                    >
                      {!favoritesSearch && (
                        <GripVertical className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors flex-shrink-0 cursor-grab active:cursor-grabbing" />
                      )}
                      <div
                        className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                        onClick={() => {
                          window.location.href = favorite.path
                          setFavoritesOpen(false)
                        }}
                      >
                        <Star className="h-3.5 w-3.5 text-primary fill-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium truncate">{favorite.title}</p>
                            {favorite.category && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
                                {favorite.category}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{favorite.path}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive transition-all flex-shrink-0 opacity-60 group-hover:opacity-100"
                        title="Supprimer de mes favoris"
                        onClick={async (e) => {
                          e.stopPropagation()
                          try {
                            await removeFavorite(favorite.id)
                          } catch (error) {
                            console.error("Failed to remove favorite:", error)
                          }
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>

      {/* Add Favorite Dialog */}
      <Dialog open={addFavoriteDialogOpen} onOpenChange={setAddFavoriteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Ajouter aux favoris</DialogTitle>
            <DialogDescription>
              Personnalisez le nom et la catégorie de ce favori pour mieux l'organiser.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="favorite-title">Nom du favori</Label>
              <Input
                id="favorite-title"
                value={newFavoriteTitle}
                onChange={(e) => setNewFavoriteTitle(e.target.value)}
                placeholder="Nom personnalisé"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveFavorite()
                  }
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="favorite-category">Catégorie</Label>
              <Input
                id="favorite-category"
                value={newFavoriteCategory}
                onChange={(e) => setNewFavoriteCategory(e.target.value)}
                placeholder="Catégorie"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveFavorite()
                  }
                }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Chemin:</span> {pathname}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFavoriteDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSaveFavorite}>Ajouter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  )
}
