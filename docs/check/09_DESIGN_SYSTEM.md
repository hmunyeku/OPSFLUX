# OpsFlux — 09_DESIGN_SYSTEM.md
# Design System Complet — Layout Pajamas, UX, Responsive, Personalization

> Ce fichier est la **référence de développement UI**. Claude Code doit pouvoir implémenter
> l'intégralité de l'interface à partir de ce document sans poser de questions.

---

## Table des matières

1. [Principes fondamentaux](#1-principes-fondamentaux)
2. [Application Chrome — Structure globale](#2-application-chrome--structure-globale)
3. [Zone 1 — Topbar](#3-zone-1--topbar)
4. [Zone 2 — Sidebar](#4-zone-2--sidebar)
5. [Zone 3 — Panneau Statique](#5-zone-3--panneau-statique)
6. [Zone 4 — Panneau Dynamique](#6-zone-4--panneau-dynamique)
7. [Zone 5 — Panneau IA](#7-zone-5--panneau-ia)
8. [Responsive — Breakpoints et comportements](#8-responsive--breakpoints-et-comportements)
9. [Design Tokens — Variables CSS complètes](#9-design-tokens--variables-css-complètes)
10. [Composants standards](#10-composants-standards)
11. [Personalization Engine — UX](#11-personalization-engine--ux)
12. [Intelligence Panel — Spec complète](#12-intelligence-panel--spec-complète)
13. [Page Settings — Pattern Pajamas](#13-page-settings--pattern-pajamas)
14. [Navigation — Enregistrement par modules](#14-navigation--enregistrement-par-modules)
15. [Empty States intelligents](#15-empty-states-intelligents)
16. [Accessibilité](#16-accessibilité)

---

## 1. Principes fondamentaux

### Philosophie

OpsFlux adopte le système de layout de **GitLab Pajamas** (https://design.gitlab.com/product-foundations/layout), adapté à React (Pajamas est Vue). La philosophie est :

- **Application Chrome** : couche la plus basse, fond permanent de l'interface. Comprend la topbar, la sidebar, et le conteneur des panneaux.
- **Panel-based layout** : jusqu'à 3 panneaux simultanément (Statique + Dynamique + IA). Un seul panneau de chaque type à la fois.
- **Progressive disclosure** : les informations secondaires (détails, IA) n'apparaissent que quand nécessaires.
- **Context-aware** : chaque zone s'adapte au contexte (tenant actif, BU active, objet sélectionné).

### Règles de design non négociables

```
1. Pas de gradients décoratifs
2. Pas d'ombres portées sauf pour les éléments superposés (modals, dropdowns)
3. Pas de couleurs de fond sur le conteneur racine (transparent)
4. Borders : toujours 1px solid var(--border), jamais 2px sauf focus
5. Border-radius : var(--radius-sm)=4px, var(--radius-md)=8px, var(--radius-lg)=12px
6. Espacement : multiples de 4px (4, 8, 12, 16, 20, 24, 32, 40, 48)
7. Typographie : Inter uniquement pour l'UI, JetBrains Mono pour le code/tags
8. Toutes les couleurs via variables CSS (supporte light/dark automatiquement)
9. Toute interaction a un état hover + focus + active + disabled
10. Tout contenu tronqué a un tooltip avec le contenu complet
```

---

## 2. Application Chrome — Structure globale

### Schéma des zones

```
Viewport (100vw × 100vh)
│
├── TOPBAR (position: fixed, top:0, left:0, right:0, height: 44px, z-index: 100)
│
└── BODY (position: fixed, top: 44px, bottom: 0, left: 0, right: 0, display: flex)
    │
    ├── SIDEBAR (flex-shrink: 0, height: 100%, overflow: hidden)
    │   width: 48px (icons) ou 180px (expanded), transition: width 200ms ease
    │
    ├── MAIN AREA (flex: 1, display: flex, min-width: 0, overflow: hidden)
    │   │
    │   ├── PANNEAU STATIQUE (flex: 1, display: flex, flex-direction: column, min-width: 0)
    │   │   ├── PANEL HEADER (flex-shrink: 0, height: 40px)
    │   │   └── PANEL CONTENT (flex: 1, overflow-y: auto)
    │   │
    │   ├── PANNEAU DYNAMIQUE (flex-shrink: 0, width: 240px, border-left: 1px solid var(--border))
    │   │   Transition: width 200ms ease (0px quand caché)
    │   │
    │   └── PANNEAU IA (flex-shrink: 0, width: 260px, border-left: 1px solid var(--border))
    │       Transition: width 200ms ease (0px quand caché)
```

### Implementation React (shell principal)

```tsx
// src/components/core/AppShell.tsx
import { useUIStore } from "@/stores/uiStore"
import { Topbar } from "./Topbar"
import { Sidebar } from "./Sidebar"
import { StaticPanel } from "./StaticPanel"
import { DynamicPanel } from "./DynamicPanel"
import { AIPanel } from "./AIPanel"

export const AppShell = ({ children }: { children: React.ReactNode }) => {
    const { sidebarExpanded, dynamicPanelOpen, aiPanelOpen } = useUIStore()

    return (
        <div className="h-screen w-screen overflow-hidden bg-background flex flex-col">
            {/* Zone 1 — Topbar fixe */}
            <Topbar />

            {/* Body sous la topbar */}
            <div className="flex flex-1 min-h-0">

                {/* Zone 2 — Sidebar */}
                <Sidebar />

                {/* Zone 3 — Panneau Statique (contenu principal) */}
                <main className="flex flex-col flex-1 min-w-0 overflow-hidden">
                    <StaticPanelHeader />
                    <div className="flex-1 overflow-y-auto">
                        {children}
                    </div>
                </main>

                {/* Zone 4 — Panneau Dynamique (optionnel) */}
                {dynamicPanelOpen && <DynamicPanel />}

                {/* Zone 5 — Panneau IA (collapsible) */}
                {aiPanelOpen && <AIPanel />}
            </div>
        </div>
    )
}
```

### Zustand store UI

```typescript
// src/stores/uiStore.ts
interface UIState {
    // Sidebar
    sidebarExpanded: boolean
    setSidebarExpanded: (v: boolean) => void

    // Panneaux
    dynamicPanelOpen: boolean
    aiPanelOpen: boolean
    toggleDynamicPanel: () => void
    toggleAIPanel: () => void

    // Objet sélectionné (alimente le panneau dynamique)
    selectedObject: { type: string; id: string } | null
    setSelectedObject: (obj: { type: string; id: string } | null) => void

    // Contexte BU actif
    activeBuId: string | null
    setActiveBuId: (id: string) => void

    // Tenant actif
    activeTenantId: string
    setActiveTenantId: (id: string) => void
}
```

---

## 3. Zone 1 — Topbar

### Dimensions et layout

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Height: 44px | bg: var(--background) | border-bottom: 1px solid var(--border)  │
│  padding: 0 12px | display: flex | align-items: center | gap: 8px               │
│                                                                                  │
│  [Logo + Nom]  [Tenant ▾]  [━━━━━━ Search ⌘K ━━━━━━━━━━]  [BU ▾]  [🔔] [⚙] [👤]│
│  ↑             ↑           ↑                               ↑       ↑    ↑   ↑   │
│  Sous-zone A   Sous-zone A Sous-zone B (flex:1, max:400px) Sub B   C    C   C   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Sous-zones (d'après Pajamas)

| Sous-zone | Pajamas | Contenu OpsFlux |
|---|---|---|
| A — Global navigation | Wayfinding across entire app | Logo + Tenant Switcher |
| B — Application navigation | Features impacting static panel | Search global ⌘K + BU Switcher |
| C — User actions | User-specific actions | Notifications + Settings + Avatar |
| D — AI navigation | AI panel controls | Bouton toggle IA (intégré dans C) |

### Implémentation Topbar

```tsx
// src/components/core/Topbar.tsx
export const Topbar = () => {
    return (
        <header className="
            fixed top-0 left-0 right-0 z-[100]
            h-[44px] bg-background border-b border-border
            flex items-center px-3 gap-2
        ">
            {/* ── Sous-zone A : Global navigation ── */}
            <div className="flex items-center gap-2 flex-shrink-0">
                <OpsFluxLogo className="h-6 w-6" />
                <span className="font-semibold text-sm text-foreground hidden sm:block">
                    OpsFlux
                </span>
                <TenantSwitcher />
            </div>

            {/* ── Séparateur ── */}
            <div className="w-px h-5 bg-border mx-1 flex-shrink-0" />

            {/* ── Sous-zone B : Application navigation ── */}
            <div className="flex items-center gap-2 flex-1 min-w-0 max-w-[400px]">
                <GlobalSearch />
                <BUSwitcher />
            </div>

            {/* ── Spacer ── */}
            <div className="flex-1" />

            {/* ── Sous-zone C : User actions + AI navigation ── */}
            <div className="flex items-center gap-1 flex-shrink-0">
                <AIToggleButton />     {/* Toggle panneau IA */}
                <NotificationBell />   {/* 🔔 avec badge */}
                <SettingsButton />     {/* ⚙ */}
                <UserAvatar />         {/* Avatar + menu */}
            </div>
        </header>
    )
}
```

### Tenant Switcher

```tsx
// Dropdown montrant les tenants accessibles par l'utilisateur
const TenantSwitcher = () => {
    const { activeTenantId, setActiveTenantId } = useUIStore()
    const { data: tenants } = useUserTenants()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs font-medium">
                    <Building2 className="h-3.5 w-3.5" />
                    {getActiveTenantName(tenants, activeTenantId)}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[200px]">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Mes organisations
                </DropdownMenuLabel>
                {tenants?.map(t => (
                    <DropdownMenuItem
                        key={t.id}
                        onClick={() => switchTenant(t.id)}
                        className="flex items-center gap-2"
                    >
                        {t.id === activeTenantId && (
                            <Check className="h-3.5 w-3.5 text-primary" />
                        )}
                        <span className={t.id !== activeTenantId ? "pl-5" : ""}>
                            {t.name}
                        </span>
                        <Badge variant="outline" className="ml-auto text-[10px]">
                            {t.role}
                        </Badge>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
```

### Global Search (⌘K)

```tsx
// Command palette style (shadcn/ui CommandDialog)
const GlobalSearch = () => {
    const [open, setOpen] = useState(false)

    // Ouvrir avec ⌘K ou Ctrl+K
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault()
                setOpen(true)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [])

    return (
        <>
            {/* Trigger visible */}
            <Button
                variant="outline"
                onClick={() => setOpen(true)}
                className="h-8 w-full max-w-[280px] justify-start text-muted-foreground text-sm gap-2"
            >
                <Search className="h-3.5 w-3.5" />
                <span>Rechercher...</span>
                <kbd className="ml-auto pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
                    ⌘K
                </kbd>
            </Button>

            {/* Dialog de recherche */}
            <CommandDialog open={open} onOpenChange={setOpen}>
                <CommandInput placeholder="Rechercher dans OpsFlux..." />
                <CommandList>
                    <CommandGroup heading="Favoris">
                        {/* Bookmarks de l'utilisateur en premier */}
                        <BookmarkResults onSelect={() => setOpen(false)} />
                    </CommandGroup>
                    <CommandGroup heading="Récents">
                        <RecentPagesResults onSelect={() => setOpen(false)} />
                    </CommandGroup>
                    <CommandGroup heading="Documents">
                        <DocumentSearchResults onSelect={() => setOpen(false)} />
                    </CommandGroup>
                    <CommandGroup heading="Assets">
                        <AssetSearchResults onSelect={() => setOpen(false)} />
                    </CommandGroup>
                </CommandList>
            </CommandDialog>
        </>
    )
}
```

### BU Switcher (Business Unit Context)

```tsx
// Bascule le contexte BU → filtre toute l'interface immédiatement
const BUSwitcher = () => {
    const { activeBuId, setActiveBuId } = useUIStore()
    const { data: userBUs } = useUserBusinessUnits()

    if (!userBUs || userBUs.length <= 1) return null  // Cacher si 1 seule BU

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    {getActiveBUName(userBUs, activeBuId)}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[220px]">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Contexte Business Unit
                </DropdownMenuLabel>
                {userBUs.map(bu => (
                    <DropdownMenuItem key={bu.id} onClick={() => {
                        setActiveBuId(bu.id)
                        // Persist en user_preferences via API
                        saveUserPreference("bu_context", bu.id)
                        // Invalider tous les caches React Query → rechargement filtré
                        queryClient.invalidateQueries()
                    }}>
                        {bu.id === activeBuId && <Check className="h-3.5 w-3.5 mr-2 text-primary" />}
                        <span className={bu.id !== activeBuId ? "ml-5" : ""}>
                            {bu.name}
                        </span>
                        {bu.is_primary && (
                            <Badge variant="secondary" className="ml-auto text-[10px]">
                                Principale
                            </Badge>
                        )}
                    </DropdownMenuItem>
                ))}
                {userBUs.length > 3 && (
                    <DropdownMenuItem onClick={() => setActiveBuId(null)}>
                        <Globe className="h-3.5 w-3.5 mr-2" />
                        Voir tout (toutes BU)
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
```

### Notification Bell

```tsx
// Combine notifications (passé) et recommandations (à faire)
const NotificationBell = () => {
    const { data } = useNotificationsAndRecommendations()
    const unreadCount = data?.unread_count || 0
    const urgentCount = data?.urgent_reco_count || 0

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 relative">
                    <Bell className="h-4 w-4" />
                    {(unreadCount + urgentCount) > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-medium">
                            {Math.min(unreadCount + urgentCount, 99)}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[380px] p-0" align="end">
                <Tabs defaultValue="todo">
                    <div className="flex items-center justify-between px-3 py-2 border-b">
                        <h4 className="font-medium text-sm">Notifications</h4>
                        <TabsList className="h-7">
                            <TabsTrigger value="todo" className="text-xs h-6">
                                À faire {urgentCount > 0 && `(${urgentCount})`}
                            </TabsTrigger>
                            <TabsTrigger value="activity" className="text-xs h-6">
                                Activité {unreadCount > 0 && `(${unreadCount})`}
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="todo" className="m-0">
                        <RecommendationsFeed />
                    </TabsContent>

                    <TabsContent value="activity" className="m-0">
                        <NotificationsFeed />
                    </TabsContent>
                </Tabs>
            </PopoverContent>
        </Popover>
    )
}
```

---

## 4. Zone 2 — Sidebar

### Dimensions et comportements

```
WIDTH ÉTATS :
  - Icônes (défaut) : 48px
  - Étendue         : 180px
  - Mobile drawer   : 240px (plein overlay)

TRANSITION : width 200ms cubic-bezier(0.4, 0, 0.2, 1)

STRUCTURE INTERNE :
  ├── Toggle button (en haut, alterne icônes ↔ étendu)
  ├── Section FAVORIS (si bookmarks > 0)
  │   ├── Label "Favoris" (visible seulement si étendu)
  │   └── NavItem × N (bookmarks de l'utilisateur)
  ├── Divider
  ├── Section NAVIGATION (items de tous les modules actifs)
  │   └── NavItem × N (filtrés par RBAC + ordre)
  ├── Divider
  ├── Spacer (flex: 1)
  └── Section ADMIN (si rôle admin/tenant_admin)
      └── NavItem Administration
```

### Structure d'un NavItem

```tsx
// src/components/core/NavItem.tsx
interface NavItemProps {
    icon: LucideIcon | string    // icône Lucide ou emoji custom (bookmarks)
    label: string
    href: string
    badge?: number               // compteur (ex: documents en attente)
    isActive?: boolean
    level?: 0 | 1               // 0 = top level, 1 = sous-item collapsible
    isExpanded?: boolean         // état sidebar
    customColor?: string         // pour les bookmarks personnalisés
}

const NavItem = ({ icon: Icon, label, href, badge, isActive, isExpanded, level = 0 }: NavItemProps) => {
    return (
        <Link
            to={href}
            className={cn(
                "flex items-center gap-2.5 rounded-md transition-colors duration-150",
                "h-9 w-full px-2.5",
                isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                !isExpanded && "justify-center px-0 w-9 mx-auto",
            )}
        >
            {typeof Icon === 'string'
                ? <span className="text-base leading-none">{Icon}</span>
                : <Icon className={cn("flex-shrink-0", level === 0 ? "h-4 w-4" : "h-3.5 w-3.5")} />
            }

            {isExpanded && (
                <>
                    <span className="text-sm font-medium truncate flex-1">{label}</span>
                    {badge !== undefined && badge > 0 && (
                        <Badge variant="secondary" className="h-4 text-[10px] px-1.5 ml-auto">
                            {badge > 99 ? '99+' : badge}
                        </Badge>
                    )}
                </>
            )}

            {/* Tooltip en mode icônes uniquement */}
            {!isExpanded && (
                <TooltipProvider delayDuration={300}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="sr-only">{label}</span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="flex items-center gap-2">
                            {label}
                            {badge !== undefined && badge > 0 && (
                                <Badge variant="secondary">{badge}</Badge>
                            )}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
        </Link>
    )
}
```

### Sidebar complète avec favoris

```tsx
// src/components/core/Sidebar.tsx
export const Sidebar = () => {
    const { sidebarExpanded, setSidebarExpanded } = useUIStore()
    const { data: bookmarks } = useUserBookmarks()
    const { data: navItems } = useRegisteredNavItems()  // depuis module manifests
    const isMobile = useBreakpoint('mobile')

    const sidebarContent = (
        <div className={cn(
            "flex flex-col h-full bg-background border-r border-border",
            "transition-[width] duration-200 ease-in-out overflow-hidden",
            sidebarExpanded ? "w-[180px]" : "w-[48px]",
        )}>
            {/* Toggle expand/collapse */}
            <div className="flex items-center h-[40px] border-b border-border px-1.5">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 ml-auto"
                    onClick={() => {
                        setSidebarExpanded(!sidebarExpanded)
                        saveUserPreference("sidebar.expanded", !sidebarExpanded)
                    }}
                >
                    {sidebarExpanded
                        ? <PanelLeftClose className="h-3.5 w-3.5" />
                        : <PanelLeft className="h-3.5 w-3.5" />
                    }
                </Button>
            </div>

            <nav className="flex flex-col flex-1 py-2 px-1.5 gap-0.5 overflow-y-auto overflow-x-hidden">

                {/* ── Section FAVORIS ── */}
                {bookmarks && bookmarks.length > 0 && (
                    <>
                        {sidebarExpanded && (
                            <div className="px-2 py-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                                    Favoris
                                </span>
                            </div>
                        )}
                        {bookmarks.map(bm => (
                            <NavItem
                                key={bm.id}
                                icon={bm.custom_icon || '⭐'}
                                label={bm.custom_title || bm.title}
                                href={bm.url_path}
                                isExpanded={sidebarExpanded}
                            />
                        ))}
                        <SidebarDivider />
                    </>
                )}

                {/* ── Section NAVIGATION (modules) ── */}
                {sidebarExpanded && (
                    <div className="px-2 py-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                            Navigation
                        </span>
                    </div>
                )}
                {navItems?.filter(i => i.zone === 'sidebar').map(item => (
                    <NavItem
                        key={item.route}
                        icon={item.icon}
                        label={item.label}
                        href={item.route}
                        badge={item.badge}
                        isExpanded={sidebarExpanded}
                    />
                ))}

                {/* ── Spacer ── */}
                <div className="flex-1" />

                {/* ── Section ADMIN ── */}
                <SidebarDivider />
                <AdminNavItem isExpanded={sidebarExpanded} />
            </nav>
        </div>
    )

    // Mobile : Drawer overlay
    if (isMobile) {
        return (
            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="fixed left-2 top-2 z-50 h-8 w-8">
                        <Menu className="h-4 w-4" />
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-[240px]">
                    {sidebarContent}
                </SheetContent>
            </Sheet>
        )
    }

    return sidebarContent
}
```

### Système de Bookmarks — Comportement complet

```tsx
// Suggestion automatique de bookmark
// Déclenché après 3 visites en 7j ou 2 jours consécutifs sur une même URL

const useBookmarkSuggestion = (currentPath: string) => {
    const { data: visitStats } = usePageVisitStats(currentPath)
    const [showSuggestion, setShowSuggestion] = useState(false)

    useEffect(() => {
        if (!visitStats) return
        const shouldSuggest = visitStats.count_7d >= 3 || visitStats.consecutive_days >= 2
        if (shouldSuggest && !visitStats.is_bookmarked && !visitStats.suggestion_dismissed) {
            setShowSuggestion(true)
        }
    }, [visitStats])

    return showSuggestion
}

// Bannière non-intrusive affichée sous le panel header
const BookmarkSuggestionBanner = ({ path, title }: { path: string; title: string }) => (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b border-border text-sm">
        <Star className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
        <span className="text-muted-foreground">
            Vous visitez souvent <strong className="text-foreground">{title}</strong>
        </span>
        <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs ml-auto"
            onClick={() => addBookmark(path, title)}
        >
            Ajouter aux favoris
        </Button>
        <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => dismissBookmarkSuggestion(path)}
        >
            <X className="h-3 w-3" />
        </Button>
    </div>
)

// Personnalisation d'un bookmark (modal)
const BookmarkEditModal = ({ bookmark }: { bookmark: Bookmark }) => (
    <Dialog>
        <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
                <DialogTitle>Personnaliser le favori</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
                {/* Icône personnalisée */}
                <div className="space-y-1.5">
                    <Label>Icône</Label>
                    <EmojiPicker
                        value={bookmark.custom_icon}
                        onChange={(emoji) => updateBookmark({ custom_icon: emoji })}
                    />
                </div>
                {/* Titre personnalisé */}
                <div className="space-y-1.5">
                    <Label>Nom dans les favoris</Label>
                    <Input
                        defaultValue={bookmark.custom_title || bookmark.title}
                        onChange={(e) => updateBookmark({ custom_title: e.target.value })}
                    />
                </div>
                {/* Bouton partager */}
                <Button variant="outline" className="w-full" onClick={() => shareBookmark(bookmark)}>
                    <Share2 className="h-3.5 w-3.5 mr-2" />
                    Partager ce lien avec un collègue
                </Button>
            </div>
        </DialogContent>
    </Dialog>
)
```

---

## 5. Zone 3 — Panneau Statique

### Structure du Panel Header

```
┌────────────────────────────────────────────────────────────────────┐
│  Height: 40px | bg: var(--background) | border-bottom: 1px border  │
│  padding: 0 14px | display: flex | align-items: center | gap: 8px  │
│                                                                     │
│  [Breadcrumb]                              [Toolbar actions →]      │
│  Module > Section > Page courante          [Filter] [Export] [+ New]│
└────────────────────────────────────────────────────────────────────┘
```

```tsx
// src/components/core/StaticPanelHeader.tsx
export const StaticPanelHeader = () => {
    const breadcrumbs = useBreadcrumbs()
    const headerActions = useHeaderActions()  // actions enregistrées par la page active

    return (
        <div className="flex items-center h-[40px] border-b border-border px-3.5 gap-2 flex-shrink-0 bg-background">

            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-1 flex-1 min-w-0">
                {breadcrumbs.map((crumb, i) => (
                    <React.Fragment key={crumb.href}>
                        {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />}
                        {i < breadcrumbs.length - 1 ? (
                            <Link
                                to={crumb.href}
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate max-w-[120px]"
                            >
                                {crumb.label}
                            </Link>
                        ) : (
                            <span className="text-xs font-medium text-foreground truncate">
                                {crumb.label}
                            </span>
                        )}
                    </React.Fragment>
                ))}
            </nav>

            {/* Toolbar (injecté par la page via Context) */}
            <div className="flex items-center gap-1 flex-shrink-0">
                {headerActions.map(action => (
                    <HeaderAction key={action.id} action={action} />
                ))}
            </div>
        </div>
    )
}
```

---

## 6. Zone 4 — Panneau Dynamique

### Comportement

```
RÈGLES :
  - Apparaît UNIQUEMENT quand un objet est sélectionné (setSelectedObject)
  - Disparaît à la navigation vers une autre page
  - Disparaît quand selectedObject redevient null
  - Lié au panneau statique : si le statique change de contexte, le dynamique se met à jour
  - Sur < 1280px : remplace le panneau IA (pas les deux simultanément)

CONTENU STANDARD (adapté selon object_type) :
  1. En-tête : type + titre de l'objet + bouton fermer
  2. Actions rapides : boutons contextuels (Éditer, Soumettre, Approuver...)
  3. Métadonnées : champs clés de l'objet
  4. Custom Fields : extrafields de l'objet
  5. Catégories & Labels
  6. Activity Timeline : dernières actions
  7. Relations : objets liés
  8. Pièces jointes : liste des PJ
```

```tsx
// src/components/core/DynamicPanel.tsx
export const DynamicPanel = () => {
    const { selectedObject } = useUIStore()
    if (!selectedObject) return null

    return (
        <aside className="
            w-[240px] flex-shrink-0
            border-l border-border bg-background
            flex flex-col overflow-hidden
        ">
            {/* En-tête */}
            <DynamicPanelHeader objectType={selectedObject.type} objectId={selectedObject.id} />

            {/* Contenu scrollable */}
            <div className="flex-1 overflow-y-auto">
                <DynamicPanelContent objectType={selectedObject.type} objectId={selectedObject.id} />
            </div>
        </aside>
    )
}

const DynamicPanelContent = ({ objectType, objectId }: { objectType: string; objectId: string }) => {
    const { data: obj } = useObjectDetails(objectType, objectId)
    if (!obj) return <DynamicPanelSkeleton />

    return (
        <div className="divide-y divide-border">
            {/* Actions rapides */}
            <QuickActions object={obj} />

            {/* Métadonnées */}
            <PanelSection title="Détails">
                <MetadataGrid fields={obj.key_fields} />
            </PanelSection>

            {/* Custom Fields */}
            {obj.extra_fields?.length > 0 && (
                <PanelSection title="Informations">
                    <ExtraFieldsDisplay fields={obj.extra_fields} />
                </PanelSection>
            )}

            {/* Catégories */}
            <PanelSection title="Catégories">
                <CategoriesDisplay objectType={objectType} objectId={objectId} />
            </PanelSection>

            {/* Timeline */}
            <PanelSection title="Activité récente" collapsible defaultCollapsed>
                <ActivityTimeline objectType={objectType} objectId={objectId} limit={5} />
            </PanelSection>

            {/* Relations */}
            <PanelSection title="Liens" collapsible defaultCollapsed>
                <RelationsDisplay objectType={objectType} objectId={objectId} />
            </PanelSection>

            {/* PJ */}
            <PanelSection title="Pièces jointes">
                <AttachmentsDisplay objectType={objectType} objectId={objectId} />
            </PanelSection>
        </div>
    )
}
```

---

## 7. Zone 5 — Panneau IA

### Comportement

```
RÈGLES :
  - Togglé via le bouton "IA" dans la topbar (sous-zone C)
  - Persiste entre les navigations (ne disparaît pas au changement de page)
  - Toujours contextuel : sait quelle page est active et quel objet est sélectionné
  - Sur < 1280px : remplace le panneau dynamique si les deux sont ouverts
  - Sur mobile : ouvre en fullscreen overlay

STRUCTURE :
  1. En-tête (fixe) : titre "Assistant OpsFlux" + bouton fermer
  2. Zone de briefing (au démarrage) : recommandations priorisées
  3. Zone de conversation : historique des échanges
  4. Zone de suggestions rapides : boutons cliquables contextuels
  5. Input (fixe en bas) : champ de saisie + bouton envoyer
```

```tsx
// src/components/core/AIPanel.tsx
export const AIPanel = () => {
    const { aiPanelOpen, toggleAIPanel, selectedObject } = useUIStore()
    const [messages, setMessages] = useState<AIMessage[]>([])
    const [input, setInput] = useState("")
    const { data: briefing } = useAIBriefing()  // recommandations du jour
    const inputRef = useRef<HTMLInputElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    if (!aiPanelOpen) return null

    return (
        <aside className="
            w-[260px] flex-shrink-0
            border-l border-border bg-background
            flex flex-col overflow-hidden
        ">
            {/* ── En-tête fixe ── */}
            <div className="flex items-center h-[40px] border-b border-border px-3 gap-2 flex-shrink-0">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="text-sm font-medium text-foreground">
                    Assistant OpsFlux
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-auto"
                    onClick={toggleAIPanel}
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* ── Zone de conversation scrollable ── */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">

                {/* Briefing du jour (si pas encore de messages) */}
                {messages.length === 0 && briefing && (
                    <AIBriefing briefing={briefing} />
                )}

                {/* Historique des messages */}
                {messages.map(msg => (
                    <AIMessageBubble key={msg.id} message={msg} />
                ))}

                {/* Suggestions contextuelles */}
                {messages.length > 0 && (
                    <ContextualSuggestions
                        currentPath={location.pathname}
                        selectedObject={selectedObject}
                        onSelect={(suggestion) => sendMessage(suggestion)}
                    />
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* ── Input fixe en bas ── */}
            <div className="border-t border-border p-2 flex gap-2">
                <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Demander à OpsFlux..."
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            sendMessage(input)
                        }
                    }}
                />
                <Button
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    disabled={!input.trim()}
                    onClick={() => sendMessage(input)}
                >
                    <Send className="h-3.5 w-3.5" />
                </Button>
            </div>
        </aside>
    )
}
```

---

## 8. Responsive — Breakpoints et comportements

### Variables CSS breakpoints

```css
/* Dans tailwind.config.ts */
screens: {
    'mobile': {'max': '767px'},
    'tablet': {'min': '768px', 'max': '1023px'},
    'desktop': {'min': '1024px', 'max': '1279px'},
    'wide': {'min': '1280px'},
}
```

### Tableau des comportements par breakpoint

| Zone | Mobile < 768 | Tablet 768-1023 | Desktop 1024-1279 | Wide ≥ 1280 |
|---|---|---|---|---|
| **Topbar** | Logo + hamburger + notif + avatar | Logo + tenant + search réduit + actions | Complet | Complet |
| **Sidebar** | Drawer overlay 240px (Sheet shadcn) | Icônes 48px (pas d'étendu) | Icônes 48px ou étendu 180px | Étendu 180px par défaut |
| **Panneau Statique** | 100% width, plein écran | flex:1 | flex:1 | flex:1 |
| **Panneau Dynamique** | Drawer depuis le bas (Sheet bottom) | Masqué par défaut, toggle | Visible si sélection, 240px | Visible si sélection, 240px |
| **Panneau IA** | Fullscreen overlay | Masqué par défaut, toggle 240px | Visible si toggle, 260px | Visible si toggle, 260px |
| **Panneaux simultanés** | 0 (jamais les deux) | 1 max | 1 max | 2 possibles (DynPanel + IA) |

### Hook responsive

```typescript
// src/hooks/useBreakpoint.ts
const breakpoints = {
    mobile: 768,
    tablet: 1024,
    desktop: 1280,
}

export const useBreakpoint = (bp: keyof typeof breakpoints) => {
    const [matches, setMatches] = useState(
        () => window.innerWidth < breakpoints[bp]
    )
    useEffect(() => {
        const handler = () => setMatches(window.innerWidth < breakpoints[bp])
        window.addEventListener('resize', handler)
        return () => window.removeEventListener('resize', handler)
    }, [bp])
    return matches
}
```

### Comportement panneaux sur mobile

```tsx
// Sur mobile, le panneau dynamique s'ouvre en Sheet (drawer bottom)
const MobileDynamicPanel = () => {
    const { selectedObject } = useUIStore()

    return (
        <Sheet open={!!selectedObject} onOpenChange={(o) => !o && setSelectedObject(null)}>
            <SheetContent side="bottom" className="h-[80vh] rounded-t-xl">
                <SheetHeader>
                    <SheetTitle>Détails</SheetTitle>
                </SheetHeader>
                {selectedObject && (
                    <DynamicPanelContent
                        objectType={selectedObject.type}
                        objectId={selectedObject.id}
                    />
                )}
            </SheetContent>
        </Sheet>
    )
}
```

---

## 9. Design Tokens — Variables CSS complètes

```css
/* src/styles/globals.css */

/* ─── Light mode ─────────────────────────────── */
:root {
    /* Backgrounds */
    --background: 0 0% 100%;           /* blanc pur */
    --background-subtle: 0 0% 98%;     /* très légèrement grisé */
    --background-muted: 210 40% 96.1%; /* gris bleuté léger */

    /* Foreground */
    --foreground: 222.2 84% 4.9%;      /* presque noir */
    --muted-foreground: 215.4 16.3% 46.9%;

    /* Couleurs primaires OpsFlux */
    --primary: 210 73% 25%;            /* #1B3A5C navy */
    --primary-foreground: 0 0% 100%;
    --primary-light: 206 62% 93%;      /* #EAF2F8 */

    /* Accent OpsFlux */
    --accent-blue: 202 57% 43%;        /* #2E86AB steel blue */
    --accent-green: 148 45% 42%;       /* #3BB273 */
    --accent-orange: 27 89% 67%;       /* #F4A261 */
    --accent-red: 356 76% 61%;         /* #E84855 */
    --accent-purple: 265 44% 43%;      /* #7B2D8B */

    /* Sémantique */
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --warning: 38 92% 50%;
    --warning-foreground: 0 0% 0%;
    --success: 142 71% 45%;
    --success-foreground: 0 0% 100%;

    /* Borders */
    --border: 214.3 31.8% 91.4%;

    /* Radius */
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius: var(--radius-md);

    /* Sidebar */
    --sidebar-width-icons: 48px;
    --sidebar-width-expanded: 180px;

    /* Topbar */
    --topbar-height: 44px;

    /* Panneaux */
    --panel-header-height: 40px;
    --panel-dynamic-width: 240px;
    --panel-ai-width: 260px;

    /* Z-index scale */
    --z-sidebar: 10;
    --z-topbar: 100;
    --z-dropdown: 200;
    --z-modal: 300;
    --z-toast: 400;
}

/* ─── Dark mode ──────────────────────────────── */
.dark {
    --background: 222.2 84% 4.9%;
    --background-subtle: 222.2 84% 7%;
    --background-muted: 217.2 32.6% 17.5%;
    --foreground: 210 40% 98%;
    --muted-foreground: 215 20.2% 65.1%;
    --border: 217.2 32.6% 17.5%;
    --primary: 210 73% 75%;
    /* ... autres tokens dark */
}
```

---

## 10. Composants standards

### PanelSection (réutilisable dans le panneau dynamique)

```tsx
// src/components/core/PanelSection.tsx
interface PanelSectionProps {
    title: string
    children: React.ReactNode
    collapsible?: boolean
    defaultCollapsed?: boolean
    action?: React.ReactNode      // bouton dans l'en-tête de section
}

const PanelSection = ({ title, children, collapsible, defaultCollapsed, action }: PanelSectionProps) => {
    const [collapsed, setCollapsed] = useState(defaultCollapsed || false)

    return (
        <div className="py-2 px-3">
            <div
                className={cn(
                    "flex items-center gap-1 mb-2",
                    collapsible && "cursor-pointer select-none"
                )}
                onClick={() => collapsible && setCollapsed(!collapsed)}
            >
                {collapsible && (
                    <ChevronRight className={cn(
                        "h-3 w-3 text-muted-foreground transition-transform",
                        !collapsed && "rotate-90"
                    )} />
                )}
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {title}
                </span>
                {action && <div className="ml-auto">{action}</div>}
            </div>
            {!collapsed && children}
        </div>
    )
}
```

### Smart Dropdown (valeurs personnalisées en tête)

```tsx
// src/components/core/SmartCombobox.tsx
// Wrapper autour de shadcn Combobox qui trie les options intelligemment

interface SmartComboboxProps {
    fieldKey: string      // clé pour retrouver les stats d'usage
    options: Option[]
    value: string
    onChange: (value: string) => void
    placeholder?: string
}

const SmartCombobox = ({ fieldKey, options, value, onChange, placeholder }: SmartComboboxProps) => {
    const { activeBuId } = useUIStore()
    const { data: usageStats } = useFieldUsageStats(fieldKey)

    const rankedOptions = useMemo(() => {
        if (!options) return []

        return [...options].sort((a, b) => {
            // 1. Options de la BU active en premier
            const aInBu = a.bu_id === activeBuId ? 0 : 1
            const bInBu = b.bu_id === activeBuId ? 0 : 1
            if (aInBu !== bInBu) return aInBu - bInBu

            // 2. Fréquence d'usage (de l'utilisateur courant)
            const aFreq = usageStats?.[a.value] || 0
            const bFreq = usageStats?.[b.value] || 0
            if (aFreq !== bFreq) return bFreq - aFreq

            // 3. Ordre alphabétique en fallback
            return a.label.localeCompare(b.label)
        })
    }, [options, activeBuId, usageStats])

    // Séparer : BU active + fréquents / reste
    const frequentOptions = rankedOptions.filter(o =>
        o.bu_id === activeBuId || (usageStats?.[o.value] || 0) > 2
    )
    const otherOptions = rankedOptions.filter(o =>
        o.bu_id !== activeBuId && (usageStats?.[o.value] || 0) <= 2
    )

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between">
                    {value ? rankedOptions.find(o => o.value === value)?.label : placeholder}
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0">
                <Command>
                    <CommandInput placeholder="Filtrer..." />
                    <CommandList>
                        {frequentOptions.length > 0 && (
                            <CommandGroup heading={activeBuId ? "Votre contexte & fréquents" : "Fréquents"}>
                                {frequentOptions.map(o => (
                                    <CommandItem key={o.value} onSelect={() => onChange(o.value)}>
                                        <Check className={cn("mr-2 h-3.5 w-3.5", value === o.value ? "opacity-100" : "opacity-0")} />
                                        {o.label}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                        {otherOptions.length > 0 && (
                            <CommandGroup heading="Autres">
                                {otherOptions.map(o => (
                                    <CommandItem key={o.value} onSelect={() => onChange(o.value)}>
                                        <Check className={cn("mr-2 h-3.5 w-3.5", value === o.value ? "opacity-100" : "opacity-0")} />
                                        {o.label}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
```

### Badges de statut documents

```tsx
// src/components/core/StatusBadge.tsx
const DOCUMENT_STATUSES = {
    draft:      { label: "Brouillon",    className: "bg-muted text-muted-foreground" },
    in_review:  { label: "En révision",  className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
    approved:   { label: "Approuvé",     className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
    published:  { label: "Publié",       className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
    obsolete:   { label: "Obsolète",     className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    archived:   { label: "Archivé",      className: "bg-muted text-muted-foreground line-through" },
}

export const StatusBadge = ({ status }: { status: keyof typeof DOCUMENT_STATUSES }) => {
    const config = DOCUMENT_STATUSES[status]
    return (
        <span className={cn(
            "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
            config.className
        )}>
            {config.label}
        </span>
    )
}
```

---

## 11. Personalization Engine — UX

### user_preferences — Toutes les clés

```typescript
// Sauvegardées en DB via API PATCH /api/v1/me/preferences
// Chargées au login et disponibles dans le store Zustand

const USER_PREFERENCE_KEYS = {
    // Interface
    "theme":                    "light" | "dark" | "system",
    "language":                 "fr" | "en",
    "density":                  "compact" | "comfortable" | "spacious",

    // Layout
    "sidebar.expanded":         boolean,
    "ai_panel.open":            boolean,

    // Contexte
    "active_bu_id":             string | null,
    "active_tenant_id":         string,

    // Tableaux (par table_id)
    "table.{id}.columns":       string[],       // colonnes visibles dans l'ordre
    "table.{id}.sort":          { field: string; direction: "asc" | "desc" },
    "table.{id}.page_size":     10 | 25 | 50 | 100,
    "table.{id}.density":       "compact" | "comfortable" | "spacious",

    // Filtres sauvegardés (par page)
    "filters.{page_key}":       FilterState,

    // Éditeur
    "editor.font_size":         number,
    "editor.show_word_count":   boolean,
    "editor.autosave_interval": number,   // secondes

    // Notifications
    "notifications.quiet_start": string,  // "20:00"
    "notifications.quiet_end":   string,  // "07:00"
    "notifications.email_digest": "immediate" | "daily" | "weekly" | "never",

    // IA
    "ai.autocomplete_enabled":  boolean,
    "ai.recommendation_types":  string[],  // types activés
}
```

### Sauvegarde temps réel des préférences

```typescript
// src/hooks/useUserPreference.ts
export const useUserPreference = <T>(key: string, defaultValue: T) => {
    const queryClient = useQueryClient()

    const { data: preferences } = useQuery({
        queryKey: ['user-preferences'],
        queryFn: () => api.get('/api/v1/me/preferences'),
        staleTime: Infinity,
    })

    const value = (preferences?.[key] ?? defaultValue) as T

    const setValue = useMutation({
        mutationFn: (newValue: T) =>
            api.patch('/api/v1/me/preferences', { [key]: newValue }),
        onMutate: async (newValue) => {
            // Optimistic update
            await queryClient.cancelQueries({ queryKey: ['user-preferences'] })
            queryClient.setQueryData(['user-preferences'], (old: any) => ({
                ...old,
                [key]: newValue,
            }))
        },
    })

    return [value, (v: T) => setValue.mutate(v)] as const
}

// Usage dans n'importe quel composant :
const [sidebarExpanded, setSidebarExpanded] = useUserPreference('sidebar.expanded', false)
```

---

## 12. Intelligence Panel — Spec complète

### Structure du briefing journalier

```tsx
// src/components/core/AIBriefing.tsx
// Affiché au démarrage du panneau IA si pas encore de conversation

interface Briefing {
    date: string
    urgent: Recommendation[]     // priority: critical
    today: Recommendation[]      // priority: high, due today
    suggestions: Recommendation[] // priority: medium|low
}

const AIBriefing = ({ briefing }: { briefing: Briefing }) => {
    const { user } = useAuth()

    return (
        <div className="space-y-3">
            {/* Salutation */}
            <div className="text-sm text-muted-foreground">
                Bonjour <span className="font-medium text-foreground">{user.first_name}</span>.{' '}
                {formatDate(briefing.date, 'EEEE d MMMM', 'fr')}
            </div>

            {/* URGENT */}
            {briefing.urgent.length > 0 && (
                <BriefingSection
                    title={`🔴 URGENT (${briefing.urgent.length})`}
                    items={briefing.urgent}
                    variant="urgent"
                />
            )}

            {/* AUJOURD'HUI */}
            {briefing.today.length > 0 && (
                <BriefingSection
                    title={`🟡 AUJOURD'HUI (${briefing.today.length})`}
                    items={briefing.today}
                    variant="today"
                />
            )}

            {/* SUGGESTIONS */}
            {briefing.suggestions.length > 0 && (
                <div className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        💡 SUGGESTIONS
                    </div>
                    {briefing.suggestions.slice(0, 3).map(s => (
                        <SuggestionItem key={s.id} suggestion={s} />
                    ))}
                </div>
            )}

            {/* Divider avant le chat */}
            <div className="border-t border-border pt-2">
                <p className="text-[11px] text-muted-foreground text-center">
                    Posez une question à OpsFlux
                </p>
            </div>
        </div>
    )
}

// Card de recommandation dans le briefing
const BriefingCard = ({ recommendation, variant }: { recommendation: Recommendation; variant: 'urgent' | 'today' }) => (
    <div className={cn(
        "rounded-md border p-2.5 space-y-1.5",
        variant === 'urgent' && "border-destructive/30 bg-destructive/5",
        variant === 'today' && "border-warning/30 bg-warning/5",
    )}>
        <p className="text-xs font-medium text-foreground leading-snug">
            {recommendation.title}
        </p>
        {recommendation.body && (
            <p className="text-[11px] text-muted-foreground">
                {recommendation.body}
            </p>
        )}
        <div className="flex gap-1.5">
            <Button
                size="sm"
                className="h-6 text-[11px] px-2"
                onClick={() => navigateToAction(recommendation)}
            >
                {recommendation.action_label}
            </Button>
            <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px] px-1.5 text-muted-foreground"
                onClick={() => dismissRecommendation(recommendation.id, 'snooze_1h')}
            >
                Plus tard
            </Button>
            <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 ml-auto text-muted-foreground"
                onClick={() => dismissRecommendation(recommendation.id, 'dismiss')}
            >
                <X className="h-3 w-3" />
            </Button>
        </div>
    </div>
)
```

### Suggestions contextuelles dans le chat

```tsx
// Suggestions proposées selon la page active et l'objet sélectionné
const ContextualSuggestions = ({ currentPath, selectedObject, onSelect }) => {
    const suggestions = useMemo(() => {
        if (currentPath.startsWith('/documents')) {
            return [
                "Résume ce document",
                "Quels documents similaires existent ?",
                "Soumettre pour validation",
            ]
        }
        if (currentPath.startsWith('/pid')) {
            return [
                "Trace cette ligne dans tous les PID",
                "Quels équipements sont sur cette plateforme ?",
                "Suggère un nom de tag conforme",
            ]
        }
        if (currentPath.startsWith('/dashboard')) {
            return [
                "Explique cette anomalie dans les données",
                "Comparer avec la semaine dernière",
                "Exporter ce dashboard en PDF",
            ]
        }
        return [
            "Qu'est-ce que je dois faire aujourd'hui ?",
            "Montre-moi mes documents en attente",
            "Chercher dans les rapports récents",
        ]
    }, [currentPath, selectedObject])

    return (
        <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Suggestions
            </p>
            {suggestions.map(s => (
                <button
                    key={s}
                    className="w-full text-left text-xs px-2 py-1.5 rounded border border-border hover:bg-accent transition-colors"
                    onClick={() => onSelect(s)}
                >
                    {s}
                </button>
            ))}
        </div>
    )
}
```

---

## 13. Page Settings — Pattern Pajamas

### Structure de navigation des settings

```tsx
// src/pages/settings/SettingsLayout.tsx
// Pattern : sidebar gauche (navigation) + contenu droit (form sections)

const SETTINGS_NAV = [
    {
        section: "Compte",
        items: [
            { key: "profile", label: "Mon profil", icon: User },
            { key: "preferences", label: "Préférences", icon: Settings },
            { key: "notifications", label: "Notifications", icon: Bell },
            { key: "security", label: "Sécurité & Accès", icon: Shield },
        ]
    },
    {
        section: "Organisation",
        items: [
            { key: "general", label: "Général", icon: Building2, requires: "tenant_admin" },
            { key: "users", label: "Utilisateurs", icon: Users, requires: "tenant_admin" },
            { key: "roles", label: "Rôles & Permissions", icon: Key, requires: "tenant_admin" },
            { key: "business-units", label: "Business Units", icon: Layers, requires: "tenant_admin" },
            { key: "delegations", label: "Délégations", icon: UserCheck, requires: "tenant_admin" },
        ]
    },
    {
        section: "Modules",
        items: [
            // Généré dynamiquement depuis les modules actifs + leur manifest.settings
        ]
    },
    {
        section: "Intégrations",
        items: [
            { key: "sso", label: "SSO / OAuth2", icon: Lock, requires: "tenant_admin" },
            { key: "smtp", label: "Email SMTP", icon: Mail, requires: "tenant_admin" },
            { key: "connectors", label: "Connecteurs de données", icon: Database, requires: "tenant_admin" },
            { key: "map", label: "Cartographie", icon: Map, requires: "tenant_admin" },
            { key: "webhooks", label: "Webhooks", icon: Webhook, requires: "tenant_admin" },
        ]
    },
    {
        section: "Intelligence",
        items: [
            { key: "ai-providers", label: "Providers IA", icon: Cpu, requires: "tenant_admin" },
            { key: "ai-usage", label: "Utilisation IA", icon: BarChart },
        ]
    },
    {
        section: "Audit",
        items: [
            { key: "audit-log", label: "Journal d'audit", icon: FileText },
            { key: "share-links", label: "Liens de partage", icon: Share2, requires: "tenant_admin" },
            { key: "backups", label: "Sauvegardes", icon: HardDrive, requires: "tenant_admin" },
        ]
    },
]

const SettingsLayout = ({ children }: { children: React.ReactNode }) => {
    const { section } = useParams()

    return (
        <div className="flex h-full">
            {/* Sidebar settings (220px) */}
            <aside className="w-[220px] flex-shrink-0 border-r border-border bg-background overflow-y-auto p-2">
                {SETTINGS_NAV.map(group => (
                    <div key={group.section} className="mb-4">
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
                            {group.section}
                        </div>
                        {group.items.map(item => (
                            <SettingsNavItem key={item.key} item={item} isActive={section === item.key} />
                        ))}
                    </div>
                ))}
            </aside>

            {/* Contenu settings */}
            <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
                {children}
            </div>
        </div>
    )
}
```

### Pattern d'une section settings

```tsx
// Chaque section settings suit ce pattern
const SettingsSection = ({ title, description, children }: SettingsSectionProps) => (
    <div className="space-y-6">
        {/* En-tête de section */}
        <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        <Separator />

        {/* Contenu : groupes de champs */}
        {children}
    </div>
)

// Groupe de champs dans une section
const SettingsGroup = ({ title, fields }: SettingsGroupProps) => (
    <div className="rounded-lg border border-border p-4 space-y-4">
        {title && (
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
        )}
        {fields}
    </div>
)

// Row individuelle de setting
const SettingRow = ({ label, description, control }: SettingRowProps) => (
    <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5 flex-1">
            <Label className="text-sm font-medium">{label}</Label>
            {description && (
                <p className="text-[12px] text-muted-foreground">{description}</p>
            )}
        </div>
        <div className="flex-shrink-0">
            {control}
        </div>
    </div>
)

// Danger zone (en bas de page)
const DangerZone = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-destructive">Zone dangereuse</h3>
        {children}
    </div>
)
```

---

## 14. Navigation — Enregistrement par modules

### Comment un module enregistre ses éléments de navigation

```typescript
// Backend : à l'activation d'un module, ses nav_items sont enregistrés
// Frontend : chargés via GET /api/v1/navigation/items

interface NavItemRegistration {
    module_slug: string
    zone: 'sidebar' | 'topbar' | 'contextual'
    label: { fr: string; en: string }
    icon: string        // nom d'icône Lucide React
    route: string
    display_order: number
    requires_permission?: string
    badge_source?: string   // endpoint pour obtenir le compteur badge
    // ex: "/api/v1/workflow/pending-count" → retourne {"count": 3}
}

// Exemple : module ReportEditor enregistre
{
    module_slug: "report_editor",
    zone: "sidebar",
    label: { fr: "Rédacteur", en: "Editor" },
    icon: "FilePen",
    route: "/documents",
    display_order: 30,
    requires_permission: "document.read",
    badge_source: "/api/v1/workflow/my-pending-count"
}
```

### Dynamisme des badges sidebar

```typescript
// src/hooks/useNavBadges.ts
// Polling toutes les 60s pour mettre à jour les compteurs

export const useNavBadges = () => {
    const { data: navItems } = useRegisteredNavItems()

    const badgeQueries = useQueries({
        queries: (navItems || [])
            .filter(item => item.badge_source)
            .map(item => ({
                queryKey: ['nav-badge', item.module_slug, item.route],
                queryFn: () => api.get(item.badge_source!).then(r => r.data.count),
                refetchInterval: 60_000,  // toutes les 60s
                staleTime: 30_000,
            }))
    })

    return Object.fromEntries(
        (navItems || [])
            .filter(i => i.badge_source)
            .map((item, idx) => [item.route, badgeQueries[idx].data || 0])
    )
}
```

---

## 15. Empty States intelligents

```tsx
// src/components/core/SmartEmptyState.tsx
interface SmartEmptyStateProps {
    objectType: string           // "document" | "asset" | "pid" | ...
    context?: {
        project?: string
        filters?: Record<string, any>
    }
    onPrimaryAction?: () => void
    primaryActionLabel?: string
}

const SmartEmptyState = ({ objectType, context, onPrimaryAction, primaryActionLabel }: SmartEmptyStateProps) => {
    const { data: historicalData } = useHistoricalComparison(objectType, context)
    const { data: suggestions } = useAISuggestions(objectType, context)

    const ICON_MAP = {
        document: FileText,
        asset: Building2,
        pid: GitBranch,
        dashboard: LayoutDashboard,
    }
    const Icon = ICON_MAP[objectType as keyof typeof ICON_MAP] || FileSearch

    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] p-8 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Icon className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
                <h3 className="text-sm font-medium">Aucun résultat</h3>
                {historicalData?.count > 0 && (
                    <p className="text-xs text-muted-foreground">
                        À la même période l'année dernière, vous aviez{' '}
                        <strong>{historicalData.count}</strong>{' '}
                        {objectType === 'document' ? 'document(s)' : 'élément(s)'}.
                    </p>
                )}
            </div>

            {/* Actions primaires */}
            <div className="flex gap-2 flex-wrap justify-center">
                {onPrimaryAction && (
                    <Button size="sm" onClick={onPrimaryAction}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        {primaryActionLabel || "Créer"}
                    </Button>
                )}
                {suggestions?.template && (
                    <Button size="sm" variant="outline" onClick={() => navigateTo(suggestions.template.url)}>
                        Utiliser le modèle "{suggestions.template.name}"
                    </Button>
                )}
            </div>
        </div>
    )
}
```

---

## 16. Accessibilité

### Standards minimaux

```tsx
// Tous les boutons icône ont aria-label
<Button variant="ghost" size="icon" aria-label="Fermer le panneau IA">
    <X className="h-4 w-4" />
</Button>

// Tous les champs de formulaire ont un label associé
<FormField name="project_id" render={({ field }) => (
    <FormItem>
        <FormLabel htmlFor="project_id">Projet</FormLabel>  {/* htmlFor obligatoire */}
        <FormControl>
            <Select {...field} id="project_id" aria-describedby="project_id-description" />
        </FormControl>
        <FormDescription id="project_id-description">
            Sélectionnez le projet auquel rattacher ce document
        </FormDescription>
        <FormMessage />
    </FormItem>
)} />

// Tables de données avec caption
<table aria-label="Liste des documents en attente de validation">
    <caption className="sr-only">Documents en attente de validation</caption>
    ...
</table>

// Navigation avec landmarks
<header role="banner">...</header>
<nav role="navigation" aria-label="Navigation principale">...</nav>
<main role="main">...</main>
<aside role="complementary" aria-label="Détails">...</aside>

// Focus trap dans les modals (shadcn Dialog gère ça nativement)
// Skip link vers le contenu principal
<a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-[500] bg-background px-4 py-2 rounded border">
    Aller au contenu principal
</a>
```

### Ordre de tabulation logique

```
1. Skip link
2. Topbar : Logo → Tenant → Search → BU → IA → Notif → Settings → Avatar
3. Sidebar : Toggle → NavItem × N (top to bottom)
4. Panel Header : Breadcrumb × N → Toolbar actions (left to right)
5. Panel Content : éléments dans l'ordre du document
6. Dynamic Panel : Header → Actions → Sections (top to bottom)
7. AI Panel : Header → Messages → Suggestions → Input → Send
```

---

## 17. DataTable — Composant universel

> Utilisé sur TOUTES les pages liste d'OpsFlux. Un seul composant, configuré différemment par module.
> Basé sur TanStack Table v8 + shadcn/ui. Pajamas : tri par glyphes ↑↓, actions toujours visibles, pagination > 20 items.

### Structure visuelle

```
┌─────────────────────────────────────────────────────────────────────┐
│ TOOLBAR (au-dessus de la table — dans le StaticPanelHeader)         │
│ [🔍 Search...] [Statut ▾] [Projet ▾] [Type ▾]   [Export] [+ Créer] │
├────┬──────────────┬──────────┬──────────┬──────┬────────────────────┤
│ ☐  │ Numéro ↕    │ Titre ↕  │ Statut   │ Date │ Actions            │
├────┼──────────────┼──────────┼──────────┼──────┼────────────────────┤
│ ☐  │ RPT-0042     │ Rapport… │ ● Publié │ 14/3 │ [⋯]               │
│ ☐  │ RPT-0041     │ Rapport… │ ● Révision│ 13/3│ [⋯]               │
├────┴──────────────┴──────────┴──────────┴──────┴────────────────────┤
│ [← 1  2  3 … 12 →]                        25 résultats  [25 ▾ /page]│
└─────────────────────────────────────────────────────────────────────┘
```

### Props du composant

```tsx
// src/components/core/DataTable.tsx

interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  isLoading?: boolean
  error?: Error | null

  // Sélection de lignes
  selectable?: boolean
  onSelectionChange?: (selected: T[]) => void

  // Tri
  defaultSort?: { field: string; direction: 'asc' | 'desc' }
  manualSorting?: boolean           // true = tri côté serveur
  onSortChange?: (sort: SortState) => void

  // Pagination
  pagination?: {
    total: number
    page: number
    pageSize: number
    onPageChange: (page: number) => void
    onPageSizeChange: (size: number) => void
    pageSizeOptions?: number[]      // défaut: [10, 25, 50, 100]
  }

  // Interaction lignes
  onRowClick?: (row: T) => void      // ouvre panneau dynamique
  getRowHref?: (row: T) => string    // si défini : la ligne entière est un lien

  // Affichage
  density?: 'compact' | 'comfortable' | 'spacious'  // défaut: comfortable
  stickyHeader?: boolean             // défaut: true
  emptyState?: React.ReactNode       // SmartEmptyState par défaut
  tableId?: string                   // pour persister colonnes/tri dans user_preferences
}
```

### Définition d'une colonne

```tsx
// Exemples de colonnes OpsFlux

const documentColumns: ColumnDef<Document>[] = [
  // Checkbox de sélection (toujours en première position si selectable)
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllRowsSelected()}
        onCheckedChange={table.getToggleAllRowsSelectedHandler()}
        aria-label="Sélectionner tout"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={row.getToggleSelectedHandler()}
        aria-label="Sélectionner"
        onClick={e => e.stopPropagation()}  // ne pas déclencher onRowClick
      />
    ),
    size: 40,
    enableSorting: false,
  },

  // Colonne texte avec lien
  {
    accessorKey: 'number',
    header: 'Numéro',
    size: 140,
    enableSorting: true,
    cell: ({ row }) => (
      <Link to={`/documents/${row.original.id}`}
        className="font-mono text-xs text-primary hover:underline"
        onClick={e => e.stopPropagation()}>
        {row.getValue('number')}
      </Link>
    ),
  },

  // Colonne avec truncate + tooltip
  {
    accessorKey: 'title',
    header: 'Titre',
    enableSorting: true,
    cell: ({ getValue }) => (
      <Tooltip content={getValue() as string} delayDuration={500}>
        <span className="block truncate max-w-[280px] text-sm">
          {getValue() as string}
        </span>
      </Tooltip>
    ),
  },

  // Colonne badge statut
  {
    accessorKey: 'status',
    header: 'Statut',
    size: 110,
    enableSorting: false,
    cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
  },

  // Colonne date
  {
    accessorKey: 'updated_at',
    header: 'Modifié',
    size: 100,
    enableSorting: true,
    cell: ({ getValue }) => (
      <Tooltip content={formatDate(getValue() as string, 'PPPp', 'fr')}>
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(getValue() as string)}
        </span>
      </Tooltip>
    ),
  },

  // Colonne Actions — TOUJOURS VISIBLE (règle Pajamas)
  {
    id: 'actions',
    header: 'Actions',
    size: 60,
    enableSorting: false,
    cell: ({ row }) => <RowActionsMenu row={row.original} />,
  },
]
```

### Tri — Comportement exact

```tsx
// Tri par glyphes ↑↓ dans l'en-tête (Pajamas)
// Pas d'icônes boutons — juste le glyphe inline après le label

const SortableHeader = ({ column, label }: { column: Column<any>; label: string }) => (
  <button
    className="flex items-center gap-1 text-left w-full hover:text-foreground transition-colors"
    onClick={column.getToggleSortingHandler()}
  >
    <span className="text-xs font-medium">{label}</span>
    <span className="text-[10px] text-muted-foreground w-3">
      {column.getIsSorted() === 'asc' ? '↑'
       : column.getIsSorted() === 'desc' ? '↓'
       : '↕'}
    </span>
  </button>
)
// ↕ = non trié (gris)
// ↑ = trié ascendant
// ↓ = trié descendant
// Clic 1 → ↑   Clic 2 → ↓   Clic 3 → ↕ (reset)
```

### Pagination — Règles Pajamas

```
Seuil pagination : > 20 items en densité normale, > 40 en densité compacte
Options page size : [10, 25, 50, 100]
Défaut par page : 25 (configurable via user_preferences "table.{id}.page_size")
Persistance du tri : sauvegardé dans user_preferences "table.{id}.sort"
Position : bas de table, flex entre [← pages →] et [N résultats | taille ▾]
```

```tsx
const TablePagination = ({ pagination }: { pagination: PaginationState }) => (
  <div className="flex items-center justify-between px-3 py-2 border-t border-border">
    {/* Navigation pages */}
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-7 w-7"
        disabled={pagination.page <= 1}
        onClick={() => pagination.onPageChange(pagination.page - 1)}>
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>

      {getPageNumbers(pagination.page, totalPages).map((p, i) =>
        p === '...' ? (
          <span key={i} className="text-xs text-muted-foreground px-1">…</span>
        ) : (
          <Button key={p} variant={p === pagination.page ? "secondary" : "ghost"}
            size="sm" className="h-7 w-7 text-xs"
            onClick={() => pagination.onPageChange(p as number)}>
            {p}
          </Button>
        )
      )}

      <Button variant="ghost" size="icon" className="h-7 w-7"
        disabled={pagination.page >= totalPages}
        onClick={() => pagination.onPageChange(pagination.page + 1)}>
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>

    {/* Résultats + taille de page */}
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground">
        {pagination.total} résultat{pagination.total > 1 ? 's' : ''}
      </span>
      <Select value={String(pagination.pageSize)}
        onValueChange={v => pagination.onPageSizeChange(Number(v))}>
        <SelectTrigger className="h-7 w-[80px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[10, 25, 50, 100].map(n => (
            <SelectItem key={n} value={String(n)} className="text-xs">
              {n} / page
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  </div>
)
```

### Actions en masse (sélection multiple)

```tsx
// Bannière qui apparaît au-dessus de la table quand des lignes sont sélectionnées
const BulkActionsBar = ({ selectedCount, onAction }: BulkActionsBarProps) => (
  <div className={cn(
    "flex items-center gap-3 px-3 py-2 bg-primary/5 border-b border-primary/20",
    "transition-all",
    selectedCount > 0 ? "opacity-100 h-10" : "opacity-0 h-0 overflow-hidden"
  )}>
    <span className="text-xs font-medium">
      {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
    </span>
    <div className="flex gap-1 ml-2">
      <Button variant="outline" size="sm" className="h-6 text-xs"
        onClick={() => onAction('export')}>
        <Download className="h-3 w-3 mr-1" />Export CSV
      </Button>
      <Button variant="outline" size="sm" className="h-6 text-xs"
        onClick={() => onAction('label')}>
        <Tag className="h-3 w-3 mr-1" />Étiquettes
      </Button>
      <Button variant="outline" size="sm" className="h-6 text-xs text-destructive"
        onClick={() => onAction('archive')}>
        <Archive className="h-3 w-3 mr-1" />Archiver
      </Button>
    </div>
    <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto"
      onClick={() => clearSelection()}>
      <X className="h-3 w-3" />
    </Button>
  </div>
)
```

### RowActionsMenu — Menu d'actions par ligne

```tsx
// Toujours visible (règle Pajamas — pas de "show on hover")
const RowActionsMenu = ({ row }: { row: any }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="h-7 w-7"
        aria-label="Actions" onClick={e => e.stopPropagation()}>
        <MoreHorizontal className="h-3.5 w-3.5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-[160px]">
      <DropdownMenuItem onClick={() => navigate(`/${row.type}/${row.id}`)}>
        <Eye className="h-3.5 w-3.5 mr-2" />Ouvrir
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => copyLink(row.id)}>
        <Link2 className="h-3.5 w-3.5 mr-2" />Copier le lien
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {row.can_edit && (
        <DropdownMenuItem onClick={() => edit(row.id)}>
          <Pencil className="h-3.5 w-3.5 mr-2" />Modifier
        </DropdownMenuItem>
      )}
      {row.can_archive && (
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => archive(row.id)}>
          <Archive className="h-3.5 w-3.5 mr-2" />Archiver
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
)
```

---

## 18. Page Layouts — Patterns standard

### Pattern A — Page Liste (le plus fréquent)

```
StaticPanelHeader (40px) :
  Breadcrumb [Module > Section]              [Filter btn] [Export] [+ Créer]

StaticPanelContent (flex-1, overflow-y-auto) :
  FilterBar (si filtres actifs)
  BulkActionsBar (si sélection)
  DataTable (flex-1)
    TableBody
    Pagination
```

```tsx
// src/components/core/PageLayout.tsx

export const ListPageLayout = ({
  title,
  breadcrumbs,
  filters,
  actions,
  children,  // DataTable
}: ListPageLayoutProps) => (
  <>
    {/* Injecté dans le StaticPanelHeader via Context */}
    <PageHeaderPortal>
      <Breadcrumbs items={breadcrumbs} />
      <div className="flex items-center gap-1.5 ml-auto">
        {actions}
      </div>
    </PageHeaderPortal>

    {/* Contenu principal */}
    <div className="flex flex-col h-full">
      {filters && <FilterBar {...filters} />}
      {children}
    </div>
  </>
)
```

### Pattern B — Page Détail / Fiche

```
StaticPanelHeader (40px) :
  Breadcrumb [Module > Liste > Objet courant]    [Actions contextuelles]

StaticPanelContent (flex-1, overflow-y-auto, p-4) :
  ObjectHeader (48px)
    [Icône type] Titre                           [Status badge]
    Description courte
  Tabs [Tab1] [Tab2] [Tab3]
  TabContent (scroll indépendant)
```

```tsx
export const DetailPageLayout = ({ object, tabs, actions }: DetailPageLayoutProps) => (
  <div className="flex flex-col h-full overflow-hidden">
    {/* En-tête objet */}
    <div className="flex items-start gap-3 p-4 border-b border-border flex-shrink-0">
      <ObjectTypeIcon type={object.type} className="h-10 w-10 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold truncate">{object.title}</h1>
          {object.status && <StatusBadge status={object.status} />}
        </div>
        {object.subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{object.subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {actions}
      </div>
    </div>

    {/* Tabs */}
    <Tabs defaultValue={tabs[0].value} className="flex flex-col flex-1 min-h-0">
      <TabsList className="flex-shrink-0 px-4 border-b border-border rounded-none h-9 bg-transparent justify-start gap-0">
        {tabs.map(tab => (
          <TabsTrigger key={tab.value} value={tab.value}
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary h-full px-3 text-xs">
            {tab.label}
            {tab.count !== undefined && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1">
                {tab.count}
              </Badge>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="flex-1 overflow-y-auto">
        {tabs.map(tab => (
          <TabsContent key={tab.value} value={tab.value} className="p-4 mt-0">
            {tab.content}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  </div>
)
```

### Pattern C — Page Formulaire (création / édition)

```
StaticPanelHeader : Breadcrumb + [Annuler] [Sauvegarder]

StaticPanelContent (max-w-2xl mx-auto p-6) :
  FormSection (titre + champs groupés)
  FormSection
  ...
  FormActions (sticky bottom : [Annuler] [Sauvegarder])
```

```tsx
export const FormSection = ({ title, description, children }: FormSectionProps) => (
  <div className="space-y-4">
    <div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {description && (
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      )}
    </div>
    <div className="rounded-lg border border-border p-4 space-y-4">
      {children}
    </div>
  </div>
)
```

---

## 19. Filtres — Niveaux par module

> Décision : Différent par module — docs=4, assets=3, tags=2.
> Basé sur les niveaux de complexité Pajamas Filtering.

### Niveau 2 — Tags DCS, Contacts, Tiers simples

```
[🔍 Search...  ]  [Type ▾]
```

```tsx
// FilterBar niveau 2 : search + 1-2 dropdowns simples, pas de sauvegarde
const TagsFilterBar = () => (
  <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
    <div className="relative flex-1 max-w-[240px]">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input placeholder="Rechercher un tag..." className="pl-8 h-8 text-sm" />
    </div>
    <SimpleDropdownFilter
      label="Type"
      options={TAG_TYPES}
      value={filterType}
      onChange={setFilterType}
    />
  </div>
)
```

### Niveau 3 — Assets, Tiers complets

```
[🔍 Search...  ]  [Statut ▾]  [Type ▾]  [Pays ▾]          [Effacer]
```

```tsx
// FilterBar niveau 3 : search + tabs statut + 2-3 dropdowns
const AssetsFilterBar = () => (
  <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
    <SearchInput />

    {/* Tabs statut (Pajamas pattern) */}
    <div className="flex items-center border border-border rounded-md overflow-hidden h-8">
      {['Tous', 'Actif', 'Inactif', 'Maintenance'].map(s => (
        <button key={s}
          className={cn("px-3 h-full text-xs transition-colors",
            activeStatus === s
              ? "bg-secondary text-foreground font-medium"
              : "hover:bg-muted text-muted-foreground"
          )}
          onClick={() => setStatus(s)}>
          {s}
        </button>
      ))}
    </div>

    <SimpleDropdownFilter label="Type" options={ASSET_TYPES} value={filterType} onChange={setFilterType} />
    <SimpleDropdownFilter label="Pays" options={COUNTRIES} value={filterCountry} onChange={setFilterCountry} />

    {hasActiveFilters && (
      <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground"
        onClick={clearFilters}>
        <X className="h-3 w-3 mr-1" />Effacer
      </Button>
    )}
  </div>
)
```

### Niveau 4 — Documents (le plus complet)

```
[🔍 Search...  ] [Tous ▾] [Projet ▾] [Type ▾] [Période ▾] [Rédacteur ▾]  [💾 Sauver]

Filtres actifs : [BIPAGA ×] [RPT ×] [En révision ×]                        [Tout effacer]
```

```tsx
// FilterBar niveau 4 : tous les filtres + sauvegarde de profil + affichage tokens
const DocumentsFilterBar = () => {
  const [savedFilters, setSavedFilters] = useUserPreference('filters.documents', {})
  const activeCount = countActiveFilters(filters)

  return (
    <div className="border-b border-border">
      {/* Barre principale */}
      <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
        <SearchInput value={search} onChange={setSearch} />

        <StatusTabFilter
          options={['Tous', 'Brouillon', 'En révision', 'Approuvé', 'Publié']}
          value={status}
          onChange={setStatus}
        />

        <ProjectFilter value={projectId} onChange={setProjectId} />
        <DocTypeFilter value={docTypeId} onChange={setDocTypeId} />
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
        <UserFilter label="Rédacteur" value={authorId} onChange={setAuthorId} />

        <div className="ml-auto flex gap-1">
          {hasActiveFilters && (
            <SaveFilterButton filters={filters} onSave={setSavedFilters} />
          )}
          <SavedFiltersMenu saved={savedFilters} onLoad={loadFilters} />
        </div>
      </div>

      {/* Tokens filtres actifs */}
      {activeCount > 0 && (
        <div className="flex items-center gap-1.5 px-3 pb-2 flex-wrap">
          {activeFiltersAsTokens.map(token => (
            <FilterToken key={token.key} token={token} onRemove={removeFilter} />
          ))}
          <Button variant="ghost" size="sm" className="h-5 text-[11px] text-muted-foreground"
            onClick={clearAll}>
            Tout effacer
          </Button>
        </div>
      )}
    </div>
  )
}

// Token visuel d'un filtre actif
const FilterToken = ({ token, onRemove }: FilterTokenProps) => (
  <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-primary/10 text-primary text-[11px]">
    {token.label}
    <button onClick={() => onRemove(token.key)} className="hover:text-destructive">
      <X className="h-3 w-3" />
    </button>
  </span>
)
```

---

## 20. Loading States & Skeletons

> Règle Pajamas :
> - **Skeleton** = chargement initial d'une section (page, panneau, liste)
> - **Spinner** = processus en cours sur un composant existant (bouton, refresh widget)
> - Ne jamais combiner les deux pour la même zone

### Quand utiliser quoi

| Cas | Composant | Exemple |
|---|---|---|
| Chargement initial d'une page liste | Skeleton table | Navigation vers /documents |
| Chargement initial d'une fiche | Skeleton détail | Ouverture /documents/{id} |
| Chargement panneau dynamique | Skeleton panneau | Clic sur un item de liste |
| Refresh d'un widget dashboard | Spinner overlay | Clic ↻ sur un widget |
| Bouton qui soumet un formulaire | Spinner dans le bouton | Clic "Sauvegarder" |
| Bouton qui charge des données | Spinner dans le bouton | Clic "Charger plus" |
| Upload de fichier | Progress bar | Drag & drop d'un fichier |

### Skeleton — Composants

```tsx
// src/components/core/Skeletons.tsx

// Skeleton table (chargement liste)
export const TableSkeleton = ({ rows = 8, cols = 5 }: TableSkeletonProps) => (
  <div className="w-full">
    {/* Header */}
    <div className="flex items-center gap-3 px-3 h-9 border-b border-border">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3 rounded", i === 0 ? "w-32" : "w-20")} />
      ))}
    </div>
    {/* Lignes */}
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-3 h-[52px] border-b border-border">
        <Skeleton className="h-3.5 w-3.5 rounded" />          {/* Checkbox */}
        <Skeleton className="h-3 w-28 rounded" />              {/* Numéro */}
        <Skeleton className="h-3 flex-1 rounded" />            {/* Titre */}
        <Skeleton className="h-5 w-16 rounded-full" />         {/* Status badge */}
        <Skeleton className="h-3 w-16 rounded" />              {/* Date */}
        <Skeleton className="h-7 w-7 rounded" />               {/* Actions */}
      </div>
    ))}
  </div>
)

// Skeleton fiche détail
export const DetailSkeleton = () => (
  <div className="p-4 space-y-4">
    {/* En-tête */}
    <div className="flex gap-3">
      <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-4 w-48 rounded" />
        <Skeleton className="h-3 w-32 rounded" />
      </div>
    </div>
    {/* Tabs */}
    <div className="flex gap-4 border-b border-border pb-2">
      {[80, 70, 90, 60].map((w, i) => (
        <Skeleton key={i} className={`h-3 w-${w/4} rounded`} />
      ))}
    </div>
    {/* Contenu */}
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-3 w-24 rounded flex-shrink-0" />
          <Skeleton className="h-3 flex-1 rounded" />
        </div>
      ))}
    </div>
  </div>
)

// Skeleton panneau dynamique
export const DynamicPanelSkeleton = () => (
  <div className="p-3 space-y-4">
    <div className="flex gap-2 items-center">
      <Skeleton className="h-8 w-8 rounded-md" />
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-24 rounded" />
        <Skeleton className="h-2.5 w-16 rounded" />
      </div>
    </div>
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex justify-between">
          <Skeleton className="h-2.5 w-20 rounded" />
          <Skeleton className="h-2.5 w-24 rounded" />
        </div>
      ))}
    </div>
  </div>
)
```

### Spinner dans un bouton

```tsx
// Pattern standard pour bouton avec loading state
const SubmitButton = ({ isLoading, children, ...props }: SubmitButtonProps) => (
  <Button disabled={isLoading} {...props}>
    {isLoading ? (
      <>
        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
        Enregistrement...
      </>
    ) : children}
  </Button>
)

// Utilisation
<SubmitButton isLoading={isPending} onClick={handleSubmit}>
  Sauvegarder
</SubmitButton>
```

---

## 21. Confirmation d'actions — Inline Confirm

> Décision OpsFlux : **Pas de modale de confirmation**.
> Approche inline : le bouton passe en état "danger" au premier clic,
> confirme au second clic dans les 3 secondes, sinon reset.
> Pajamas préconise modales pour les irréversibles — OpsFlux choisit l'inline
> pour rester dans le flux sans interrompre la navigation.

### Composant InlineConfirmButton

```tsx
// src/components/core/InlineConfirmButton.tsx

interface InlineConfirmButtonProps {
  onConfirm: () => void | Promise<void>
  confirmLabel?: string          // défaut: "Confirmer ?"
  children: React.ReactNode
  confirmTimeout?: number        // ms avant reset (défaut: 3000)
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

export const InlineConfirmButton = ({
  onConfirm,
  confirmLabel = "Confirmer ?",
  children,
  confirmTimeout = 3000,
  variant = "ghost",
  size = "sm",
  className,
}: InlineConfirmButtonProps) => {
  const [isPending, setIsPending] = useState(false)   // premier clic
  const [isLoading, setIsLoading] = useState(false)   // exécution
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const handleClick = async () => {
    if (!isPending) {
      // Premier clic → passer en état "danger"
      setIsPending(true)
      timerRef.current = setTimeout(() => setIsPending(false), confirmTimeout)
      return
    }

    // Second clic → confirmer
    clearTimeout(timerRef.current)
    setIsPending(false)
    setIsLoading(true)
    try {
      await onConfirm()
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return (
    <Button
      variant={isPending ? "destructive" : variant}
      size={size}
      className={cn(
        "transition-all duration-150",
        isPending && "animate-pulse",
        className
      )}
      disabled={isLoading}
      onClick={handleClick}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : isPending ? (
        <>
          <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
          {confirmLabel}
        </>
      ) : (
        children
      )}
    </Button>
  )
}
```

### Utilisation dans les actions courantes

```tsx
// Archiver un document
<InlineConfirmButton
  onConfirm={() => archiveDocument(doc.id)}
  confirmLabel="Archiver ?"
  variant="ghost"
  className="text-destructive hover:text-destructive"
>
  <Archive className="h-3.5 w-3.5 mr-1.5" />
  Archiver
</InlineConfirmButton>

// Supprimer un brouillon
<InlineConfirmButton
  onConfirm={() => deleteDocument(doc.id)}
  confirmLabel="Supprimer définitivement ?"
  confirmTimeout={5000}  // 5s pour les suppressions
>
  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
  Supprimer
</InlineConfirmButton>

// Dans le RowActionsMenu d'une table
<DropdownMenuItem asChild>
  <InlineConfirmButton
    onConfirm={() => archive(row.id)}
    confirmLabel="Confirmer l'archivage ?"
    className="w-full justify-start text-destructive"
  >
    <Archive className="h-3.5 w-3.5 mr-2" />Archiver
  </InlineConfirmButton>
</DropdownMenuItem>
```

### Exception — Modale pour les cas complexes

Même avec l'approche inline, 2 cas nécessitent une modale car ils demandent **une saisie obligatoire** avant d'agir :

```tsx
// 1. Rejet d'un document (motif obligatoire)
// 2. Fusion de tiers (sélection du tiers cible)

// Pour ces cas : DialogForm, pas InlineConfirmButton
<Dialog>
  <DialogTrigger asChild>
    <Button variant="outline">Rejeter</Button>
  </DialogTrigger>
  <DialogContent className="sm:max-w-[400px]">
    <DialogHeader>
      <DialogTitle>Motif du rejet</DialogTitle>
    </DialogHeader>
    <Textarea
      placeholder="Décrivez le motif du rejet (obligatoire)..."
      value={reason} onChange={e => setReason(e.target.value)}
      rows={4}
    />
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
      <Button variant="destructive" disabled={!reason.trim()}
        onClick={() => rejectDocument(reason)}>
        Rejeter le document
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## 22. Toasts

> Règles Pajamas adaptées pour OpsFlux :
> - Position : bas-gauche viewport sur desktop, centré-bas sur mobile
> - Message = phrase complète avec point final
> - Auto-dismiss selon criticité
> - Jamais de toast pour les actions irréversibles (utiliser InlineConfirmButton)

### Configuration

```typescript
// src/lib/toast.ts — Wrapper autour de shadcn useToast

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface OpsFluxToastOptions {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  duration?: number   // ms, défaut selon type
}

// Durées par type (OpsFlux)
const TOAST_DURATIONS: Record<ToastType, number> = {
  success: 3000,   // 3s — confirmation rapide, pas besoin de lire longtemps
  info:    4000,   // 4s
  warning: 6000,   // 6s — lire le message en entier
  error:   8000,   // 8s — erreur = besoin de comprendre
}

export const toast = {
  success: (options: OpsFluxToastOptions) =>
    baseToast({ ...options, variant: 'default', duration: TOAST_DURATIONS.success }),
  error: (options: OpsFluxToastOptions) =>
    baseToast({ ...options, variant: 'destructive', duration: TOAST_DURATIONS.error }),
  warning: (options: OpsFluxToastOptions) =>
    baseToast({ ...options, variant: 'warning', duration: TOAST_DURATIONS.warning }),
  info: (options: OpsFluxToastOptions) =>
    baseToast({ ...options, variant: 'default', duration: TOAST_DURATIONS.info }),
}
```

### Cas d'utilisation OpsFlux

```typescript
// ✅ Après une action réussie
toast.success({ title: "Document sauvegardé." })
toast.success({ title: "Import terminé.", description: "48 assets créés, 3 mis à jour." })

// ✅ Après une action réussie avec undo possible
toast.success({
  title: "Document archivé.",
  action: { label: "Annuler", onClick: () => unarchive(doc.id) },
  duration: 6000,  // plus long si action undo disponible
})

// ✅ Avertissement non-bloquant
toast.warning({ title: "Connexion instable.", description: "Les modifications sont sauvegardées localement." })

// ✅ Erreur utilisateur (déjà gérée dans le form si 422, toast si autre)
toast.error({ title: "Impossible de sauvegarder.", description: "Vérifiez votre connexion et réessayez." })

// ❌ Ne pas utiliser pour les actions irréversibles sans confirmation préalable
// ❌ Ne pas utiliser pour des messages qui nécessitent une action utilisateur complexe → modale
// ❌ Ne pas utiliser pour les erreurs de validation de formulaire → inline sous le champ
```

### Toasts multiples — Comportement Pajamas

```
Toasts empilés verticalement, du haut vers le bas (le plus récent en bas)
Bas-gauche viewport sur desktop (x: 24px, y: 24px depuis le bas)
Centré en bas sur mobile
Chaque toast a son propre timer indépendant
Max 3 toasts simultanés — le plus ancien disparaît si un 4ème arrive
```

---

## 23. États de formulaire

> Basé sur les design tokens Pajamas `control.*`.
> Tous les états visibles MÊME sans interaction (pas de "show on focus only").

### États visuels des champs

```tsx
// src/components/core/FormField.tsx — Extension de shadcn FormField

// ─── Champ en ERREUR (après validation Zod) ───────────────────────
// border: 1px solid var(--destructive)
// message d'erreur en rouge, sous le champ
// icône ⚠ à droite de l'input
<FormItem>
  <FormLabel>Numéro de séquence</FormLabel>
  <FormControl>
    <div className="relative">
      <Input
        {...field}
        className="border-destructive pr-8 focus-visible:ring-destructive"
        aria-invalid="true"
        aria-describedby="field-error"
      />
      <AlertCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-destructive" />
    </div>
  </FormControl>
  <FormMessage id="field-error" className="text-xs text-destructive" />
</FormItem>

// ─── Champ DISABLED ───────────────────────────────────────────────
// opacity: 0.5, cursor: not-allowed
// shadcn Input gère ça nativement avec l'attribut disabled
<Input disabled className="cursor-not-allowed" />
// Jamais de placeholder différent — juste l'opacité réduite

// ─── Champ READ-ONLY ──────────────────────────────────────────────
// bg: var(--muted), pas de focus ring
// Utilisé pour les champs auto-calculés (formules, auto-valeurs cartouche)
<Input
  readOnly
  value={autoValue}
  className="bg-muted text-muted-foreground cursor-default focus-visible:ring-0 focus-visible:ring-offset-0"
/>

// ─── Champ en LOADING (données qui chargent) ───────────────────────
// Spinner à droite, input disabled le temps du chargement
const LoadingInput = ({ isLoading, ...props }: LoadingInputProps) => (
  <div className="relative">
    <Input {...props} disabled={isLoading} />
    {isLoading && (
      <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
    )}
  </div>
)

// ─── Champ SAVED (confirmation visuelle 2s) ────────────────────────
// Après sauvegarde inline d'un champ : checkmark vert, border verte, 2s puis reset
const SavedIndicator = ({ show }: { show: boolean }) =>
  show ? (
    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-in fade-in-0 zoom-in-75">
      <Check className="h-3.5 w-3.5 text-green-600" />
    </span>
  ) : null
```

### Labels et messages d'aide

```tsx
// Pajamas : "optional" si le formulaire est majority required
// "required" si le formulaire est majority optional (ou ajouter * dans le label)

// OpsFlux : utiliser * pour les champs requis (plus compact)
<FormLabel>
  Titre du document
  <span className="text-destructive ml-1" aria-hidden="true">*</span>
</FormLabel>

// Message d'aide : sous le label, en gris, avant l'erreur
<FormDescription className="text-xs text-muted-foreground">
  Le titre sera visible dans toutes les listes et exports.
</FormDescription>

// Ordre vertical : Label → Description → Input → Message d'erreur
// (Description disparaît si erreur, pour économiser l'espace)
```

### Boutons de formulaire — Alignement

```
Formulaire de création (page entière) :
  [Annuler]  [Créer le document →]
  ↑ gauche    ↑ droite (primary)

Modal formulaire (small/medium) :
  [Annuler]  [Sauvegarder]
  ↑ footer left  ↑ footer right

Formulaire inline (dans une section) :
  [Annuler] [Sauvegarder]
  ↑ en ligne, à droite du formulaire
```

```tsx
// Boutons de formulaire toujours dans un DialogFooter ou FormActions sticky
const FormActions = ({ onCancel, isSubmitting, submitLabel = "Sauvegarder" }: FormActionsProps) => (
  <div className="flex items-center justify-end gap-2 pt-4 border-t border-border mt-4">
    <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
      Annuler
    </Button>
    <Button type="submit" disabled={isSubmitting}>
      {isSubmitting && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
      {submitLabel}
    </Button>
  </div>
)
```

---

## 24. Panneau Dynamique — Comportement Pin

> Décision OpsFlux : le panneau dynamique **se ferme à la navigation**,
> sauf si l'utilisateur l'a épinglé. Préférence persistée en user_preferences.

### Logique de contrôle

```tsx
// src/stores/uiStore.ts — extensions

interface UIState {
  // ... état existant ...
  dynamicPanelPinned: boolean        // épinglé = reste ouvert à la navigation
  setDynamicPanelPinned: (v: boolean) => void
}

// src/components/core/DynamicPanel.tsx — En-tête avec bouton pin

const DynamicPanelHeader = ({ objectType, objectId, onClose }: DynamicPanelHeaderProps) => {
  const { dynamicPanelPinned, setDynamicPanelPinned } = useUIStore()
  const [pinPref, setPinPref] = useUserPreference('dynamic_panel.pinned', false)

  const togglePin = () => {
    const next = !dynamicPanelPinned
    setDynamicPanelPinned(next)
    setPinPref(next)  // persister en DB
  }

  return (
    <div className="flex items-center h-[40px] border-b border-border px-3 gap-2 flex-shrink-0">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Détails
      </span>
      <div className="ml-auto flex items-center gap-0.5">
        {/* Pin button */}
        <Tooltip content={dynamicPanelPinned ? "Désépingler" : "Épingler le panneau"}>
          <Button
            variant="ghost" size="icon"
            className={cn("h-6 w-6", dynamicPanelPinned && "text-primary bg-primary/10")}
            onClick={togglePin}
            aria-label={dynamicPanelPinned ? "Désépingler le panneau" : "Épingler le panneau"}
          >
            <Pin className={cn("h-3.5 w-3.5", dynamicPanelPinned && "fill-current")} />
          </Button>
        </Tooltip>
        {/* Close button */}
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
```

### Fermeture automatique à la navigation

```tsx
// src/components/core/AppShell.tsx
// Le panneau se ferme automatiquement à chaque changement de route,
// SAUF si dynamicPanelPinned = true

const AppShell = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation()
  const { setSelectedObject, dynamicPanelPinned } = useUIStore()

  useEffect(() => {
    // À chaque navigation : fermer le panneau si non épinglé
    if (!dynamicPanelPinned) {
      setSelectedObject(null)
    }
  }, [location.pathname])

  // ...
}
```

### Comportement quand épinglé

```
Panneau épinglé (pin icon filled, fond primary/10) :
  → Navigate vers autre page : panneau reste, affiche le même objet
  → Clic sur un autre item de liste : panneau met à jour son contenu
  → Resize fenêtre < 1280px : panneau se ferme quand même (pas assez d'espace)
  → Désépingler : pin icon outline, panneau se fermera à la prochaine navigation
  → Fermer manuellement (X) : reset du pin aussi
```

---

## 25. Raccourcis clavier

> Pajamas : afficher le shortcut dans un tooltip sur l'élément.
> OpsFlux adopte le style GitHub/Linear : shortcuts en `<kbd>` dans les tooltips.
> Pas de mode "shortcuts actifs/désactivés" — toujours actifs.

### Catalogue complet des raccourcis OpsFlux

```typescript
// src/lib/keyboard-shortcuts.ts

export const KEYBOARD_SHORTCUTS = {
  // Navigation globale
  GLOBAL_SEARCH:         { key: 'k', meta: true,  label: '⌘K',         desc: 'Recherche globale' },
  GOTO_DOCUMENTS:        { key: 'd', meta: false,  label: 'G+D',         desc: 'Aller aux Documents' },
  GOTO_PID:              { key: 'p', meta: false,  label: 'G+P',         desc: 'Aller aux PID' },
  GOTO_ASSETS:           { key: 'a', meta: false,  label: 'G+A',         desc: 'Aller aux Assets' },
  GOTO_DASHBOARD:        { key: 'h', meta: false,  label: 'G+H',         desc: 'Aller à l\'accueil' },

  // Panneaux
  TOGGLE_AI_PANEL:       { key: '.', meta: true,   label: '⌘.',          desc: 'Ouvrir/fermer l\'IA' },
  TOGGLE_DYNAMIC_PANEL:  { key: 'i', meta: false,  label: 'I',           desc: 'Ouvrir/fermer Détails' },
  PIN_DYNAMIC_PANEL:     { key: 'i', shift: true,  label: '⇧I',          desc: 'Épingler/désépingler Détails' },
  CLOSE_PANEL:           { key: 'Escape',           label: 'Esc',         desc: 'Fermer modal/panneau' },

  // Éditeur (actifs uniquement dans l'éditeur de document)
  EDITOR_SAVE:           { key: 's', meta: true,   label: '⌘S',          desc: 'Forcer la sauvegarde' },
  EDITOR_SUBMIT:         { key: 'Enter', meta: true, shift: true, label: '⌘⇧↵', desc: 'Soumettre pour validation' },
  EDITOR_EXPORT_PDF:     { key: 'p', meta: true, shift: true, label: '⌘⇧P', desc: 'Exporter en PDF' },
  EDITOR_FULLSCREEN:     { key: 'F11',              label: 'F11',         desc: 'Mode plein écran' },

  // Dashboard (actifs uniquement sur une page dashboard)
  DASHBOARD_EDIT:        { key: 'e', meta: false,  label: 'E',           desc: 'Activer mode édition' },
  DASHBOARD_UNDO:        { key: 'z', meta: true,   label: '⌘Z',          desc: 'Annuler (mode édition)' },
  DASHBOARD_REDO:        { key: 'z', meta: true, shift: true, label: '⌘⇧Z', desc: 'Rétablir (mode édition)' },

  // PID Editor (actifs uniquement dans l'éditeur PID)
  PID_SAVE:              { key: 's', meta: true,   label: '⌘S',          desc: 'Sauvegarder le PID' },
  PID_REVISION:          { key: 'r', meta: true, shift: true, label: '⌘⇧R', desc: 'Créer une révision' },

  // Actions sur un objet sélectionné (dans le panneau dynamique)
  SELECTED_OPEN:         { key: 'Enter',            label: '↵',           desc: 'Ouvrir l\'objet sélectionné' },
  SELECTED_EDIT:         { key: 'e', meta: true,   label: '⌘E',          desc: 'Éditer' },

  // Aide
  SHOW_SHORTCUTS:        { key: '?',               label: '?',           desc: 'Afficher tous les raccourcis' },
} as const
```

### Hook d'enregistrement des raccourcis

```typescript
// src/hooks/useKeyboardShortcut.ts

export const useKeyboardShortcut = (
  shortcut: { key: string; meta?: boolean; shift?: boolean; ctrl?: boolean },
  handler: (e: KeyboardEvent) => void,
  options: { enabled?: boolean; preventDefault?: boolean } = {}
) => {
  const { enabled = true, preventDefault = true } = options

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const metaMatch = shortcut.meta ? (e.metaKey || e.ctrlKey) : !e.metaKey && !e.ctrlKey
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase()

      if (metaMatch && shiftMatch && keyMatch) {
        if (preventDefault) e.preventDefault()
        handler(e)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcut, handler, enabled, preventDefault])
}

// Utilisation
useKeyboardShortcut(KEYBOARD_SHORTCUTS.GLOBAL_SEARCH, () => setSearchOpen(true))
useKeyboardShortcut(KEYBOARD_SHORTCUTS.TOGGLE_AI_PANEL, () => toggleAIPanel())
```

### Affichage dans les tooltips (style Pajamas)

```tsx
// Afficher le shortcut dans un Tooltip sur l'élément
<Tooltip content={
  <span className="flex items-center gap-2">
    Recherche globale
    <kbd className="ml-1 inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
      ⌘K
    </kbd>
  </span>
}>
  <Button variant="outline" onClick={() => setSearchOpen(true)}>
    <Search className="h-3.5 w-3.5 mr-2" />
    Rechercher
  </Button>
</Tooltip>

// Modal "Tous les raccourcis" (touche ?)
const KeyboardShortcutsModal = () => (
  <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Raccourcis clavier</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 max-h-[60vh] overflow-y-auto">
        {Object.entries(groupedShortcuts).map(([group, shortcuts]) => (
          <div key={group}>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {group}
            </h4>
            <div className="space-y-1">
              {shortcuts.map(sc => (
                <div key={sc.label} className="flex items-center justify-between py-1">
                  <span className="text-sm text-muted-foreground">{sc.desc}</span>
                  <kbd className="inline-flex items-center rounded border bg-muted px-2 py-0.5 font-mono text-xs">
                    {sc.label}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </DialogContent>
  </Dialog>
)
```

---

## 26. Settings — Saving Pattern (Pajamas)

> Section critique. Ce comportement de sauvegarde est **identique pour toutes les pages Settings**
> d'OpsFlux (Settings compte, Settings modules, Settings tenant, etc.)
> Basé directement sur le pattern Pajamas "Saving and feedback".

### Règle fondamentale : 2 modes selon le type de champ

```
TOGGLE / CHECKBOX / RADIO  →  Auto-save immédiat au clic
                               Toast "Changement enregistré." + option Undo (5s)

CHAMP TEXTE / SELECT / DATE →  Bouton "Enregistrer" par section
                                Toast "Modifications enregistrées." après clic
```

### Layout d'une section Settings avec sauvegarde manuelle

```
┌──────────────────────────────────────────────────────┐
│  Email SMTP                                          │
│  Configuration du serveur d'envoi d'emails.          │  ← Titre h2 + description
│ ─────────────────────────────────────────────────── │
│                                                      │
│  Serveur SMTP *          [smtp.perenco.com      ]   │
│  Port *                  [587                   ]   │
│  Utilisateur             [noreply@perenco.com   ]   │
│  Mot de passe            [••••••••             ]   │
│  ☑ Utiliser TLS                                     │
│                                                      │
│  [Tester la connexion]          [Enregistrer →]     │  ← Actions alignées à droite
└──────────────────────────────────────────────────────┘
```

### Layout d'une section Settings avec auto-save (toggles)

```
┌──────────────────────────────────────────────────────┐
│  Fonctionnalités du module                           │
│ ─────────────────────────────────────────────────── │
│                                                      │
│  Auto-complétion IA dans l'éditeur          [●──]   │  ← Toggle → save immédiat
│  Activer les suggestions de tags            [──○]   │  ← Toast "Changement enregistré."
│  Mode strict nommage tags                   [●──]   │
│                                                      │
└──────────────────────────────────────────────────────┘
                                         ↑ Pas de bouton Save
```

### Composant SettingsSection

```tsx
// src/components/core/settings/SettingsSection.tsx

interface SettingsSectionProps {
  title: string
  description?: string
  children: React.ReactNode
  onSave?: () => Promise<void>        // undefined = section auto-save uniquement
  saveLabel?: string                  // défaut: "Enregistrer"
  danger?: boolean                    // section "Zone dangereuse" → border rouge
}

export const SettingsSection = ({
  title, description, children, onSave, saveLabel = "Enregistrer", danger
}: SettingsSectionProps) => {
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave?.()
      setIsDirty(false)
      toast.success({ title: "Modifications enregistrées." })
    } catch (e) {
      toast.error({ title: "Impossible d'enregistrer.", description: "Vérifiez les champs et réessayez." })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={cn(
      "rounded-lg border p-5 space-y-4",
      danger ? "border-destructive/30 bg-destructive/5" : "border-border"
    )}>
      {/* En-tête de section */}
      <div>
        <h2 className={cn("text-sm font-semibold", danger && "text-destructive")}>
          {title}
        </h2>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>

      <Separator />

      {/* Contenu (champs) — onChange → setIsDirty(true) via Context */}
      <SettingsDirtyContext.Provider value={{ setIsDirty }}>
        {children}
      </SettingsDirtyContext.Provider>

      {/* Bouton Save (seulement si la section a des champs manuels) */}
      {onSave && (
        <div className="flex items-center justify-end gap-2 pt-2">
          {isDirty && (
            <span className="text-xs text-muted-foreground mr-auto">
              Modifications non enregistrées
            </span>
          )}
          <Button
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            size="sm"
          >
            {isSaving && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            {saveLabel}
          </Button>
        </div>
      )}
    </div>
  )
}
```

### SettingsToggle — Auto-save immédiat

```tsx
// src/components/core/settings/SettingsToggle.tsx
// Pour les booleans qui se sauvegardent sans bouton

interface SettingsToggleProps {
  label: string
  description?: string
  settingKey: string
  tenantId?: string
  scope?: 'tenant' | 'user'
}

export const SettingsToggle = ({
  label, description, settingKey, scope = 'tenant'
}: SettingsToggleProps) => {
  const { data: currentValue, refetch } = useQuery({
    queryKey: ['setting', settingKey, scope],
    queryFn: () => api.get(`/api/v1/settings/${settingKey}`).then(r => r.data.value),
  })

  const mutation = useMutation({
    mutationFn: (newValue: boolean) =>
      api.patch(`/api/v1/settings/${settingKey}`, { value: newValue }),
    onMutate: async (newValue) => {
      // Optimistic update immédiat (Pajamas instant feedback)
      await queryClient.cancelQueries({ queryKey: ['setting', settingKey] })
      queryClient.setQueryData(['setting', settingKey, scope], newValue)
    },
    onSuccess: (_, newValue) => {
      // Toast avec option Undo (Pajamas : toujours proposer undo sur auto-save)
      toast.success({
        title: "Changement enregistré.",
        action: {
          label: "Annuler",
          onClick: async () => {
            await api.patch(`/api/v1/settings/${settingKey}`, { value: !newValue })
            refetch()
          }
        },
        duration: 5000,
      })
    },
    onError: () => {
      refetch()  // reset optimistic
      toast.error({ title: "Impossible d'enregistrer ce paramètre." })
    },
  })

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium cursor-pointer">{label}</Label>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <Switch
        checked={!!currentValue}
        onCheckedChange={(v) => mutation.mutate(v)}
        disabled={mutation.isPending}
        aria-label={label}
      />
    </div>
  )
}
```

### Safety Measure — Modal "Modifications non enregistrées"

```tsx
// src/hooks/useUnsavedChangesGuard.ts
// Déclenche une modale si l'user tente de naviguer avec des changements non sauvegardés
// C'est le SEUL cas dans OpsFlux où une modale s'impose (même avec la politique inline confirm)

export const useUnsavedChangesGuard = (isDirty: boolean) => {
  const navigate = useNavigate()
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const onSaveRef = useRef<(() => Promise<void>) | null>(null)

  // Intercepter les tentatives de navigation React Router
  useBlocker(({ nextLocation }) => {
    if (!isDirty) return false
    setPendingNavigation(nextLocation.pathname)
    setShowModal(true)
    return true  // bloquer la navigation
  })

  // Intercepter le rechargement/fermeture du navigateur
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const UnsavedChangesModal = () => (
    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Modifications non enregistrées</DialogTitle>
          <DialogDescription>
            Vous avez des modifications non enregistrées.
            Voulez-vous les enregistrer avant de quitter ?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => {
            // Quitter sans sauvegarder
            setShowModal(false)
            if (pendingNavigation) navigate(pendingNavigation)
          }}>
            Ignorer et quitter
          </Button>
          <Button onClick={async () => {
            // Sauvegarder puis naviguer
            await onSaveRef.current?.()
            setShowModal(false)
            if (pendingNavigation) navigate(pendingNavigation)
          }}>
            Enregistrer les modifications
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { UnsavedChangesModal, setOnSave: (fn: () => Promise<void>) => { onSaveRef.current = fn } }
}
```

### Exemple complet — Page Settings SMTP

```tsx
// src/pages/core/settings/SMTPSettings.tsx

const SMTPSettings = () => {
  const form = useForm<SMTPFormValues>({ resolver: zodResolver(SMTPSchema) })
  const { UnsavedChangesModal, setOnSave } = useUnsavedChangesGuard(form.formState.isDirty)

  const mutation = useMutation({
    mutationFn: (data: SMTPFormValues) => api.patch('/api/v1/settings/smtp', data),
  })

  const handleSave = async () => {
    const data = form.getValues()
    await mutation.mutateAsync(data)
    form.reset(data)  // reset isDirty
  }

  setOnSave(handleSave)

  return (
    <>
      <UnsavedChangesModal />

      <SettingsSection
        title="Email SMTP"
        description="Configuration du serveur d'envoi d'emails pour les notifications."
        onSave={handleSave}
      >
        <Form {...form}>
          <div className="grid grid-cols-2 gap-4">
            <FormField name="host" label="Serveur SMTP" required />
            <FormField name="port" label="Port" type="number" required />
            <FormField name="username" label="Utilisateur" />
            <FormField name="password" label="Mot de passe" type="password" />
          </div>
          <SettingsToggle
            label="Utiliser TLS"
            settingKey="smtp_use_tls"
            scope="tenant"
          />
        </Form>
        {/* Bouton test de connexion (action secondaire) */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={testSMTPConnection}>
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Tester la connexion
          </Button>
        </div>
      </SettingsSection>

      {/* Section Danger Zone */}
      <SettingsSection
        title="Zone dangereuse"
        danger
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Réinitialiser les paramètres SMTP</p>
            <p className="text-xs text-muted-foreground">Supprime toute la configuration SMTP du tenant.</p>
          </div>
          <InlineConfirmButton
            onConfirm={resetSMTP}
            confirmLabel="Réinitialiser ?"
            confirmTimeout={5000}
            variant="outline"
            className="text-destructive border-destructive/50 hover:bg-destructive/5"
          >
            Réinitialiser
          </InlineConfirmButton>
        </div>
      </SettingsSection>
    </>
  )
}
```

### Règles de sauvegarde — Récapitulatif

| Type de champ | Méthode | Toast | Undo |
|---|---|---|---|
| Toggle / Switch | Auto-save immédiat | "Changement enregistré." | Oui (5s) |
| Checkbox seule | Auto-save immédiat | "Changement enregistré." | Oui (5s) |
| Input texte | Bouton "Enregistrer" | "Modifications enregistrées." | Non |
| Select / Dropdown | Bouton "Enregistrer" | "Modifications enregistrées." | Non |
| Formulaire multi-champs | Bouton "Enregistrer" | "Modifications enregistrées." | Non |
| Navigation hors page avec dirty | **Modale safety measure** | — | — |

---

## 27. Quick Entry — Pattern ERPNext adapté

> Pattern universel appliqué à **tous les formulaires de création** d'OpsFlux.
> Inspiré d'ERPNext : afficher d'abord les champs requis, cacher les optionnels,
> laisser l'utilisateur décider d'expand ou d'aller sur la fiche complète.
> **Respecte nos patterns existants** : modal (objets simples) ou drawer (objets complexes).

---

### Principe

```
ÉTAT INITIAL (Quick Entry)        ÉTAT ÉTENDU (Full Entry)
┌─────────────────────────┐       ┌─────────────────────────┐
│ Nouveau Contact   [⛶][×]│       │ Nouveau Contact   [⛶][×]│
│ ─────────────────────── │       │ ─────────────────────── │
│ Prénom *  [          ]  │       │ Prénom *  [          ]  │
│ Nom *     [          ]  │  ──▶  │ Nom *     [          ]  │
│ Email *   [          ]  │ clic  │ Email *   [          ]  │
│                         │  ▼    │ ─────────────────────── │
│ ▼ 9 champs de plus      │       │ Téléphone [          ]  │
│                         │       │ Titre     [          ]  │
│ [Enregistrer] [+ Nouveau│       │ Société   [        ▾]   │
└─────────────────────────┘       │ Notes     [          ]  │
                                  │                         │
    Seuls les champs              │ ▲ Réduire               │
    required=True                 │                         │
    sont visibles                 │ [Enregistrer] [+ Nouveau│
                                  └─────────────────────────┘
```

---

### Décisions

| Paramètre | Valeur |
|---|---|
| Conteneur | Modal (objets ≤ 6 champs requis) ou Drawer (objets complexes) — §18 |
| Champs visibles par défaut | `is_required = True` uniquement |
| Toggle | `▼ N champs de plus` → expand inline dans la même modal/drawer |
| Réduire | `▲ Réduire` → re-cache les optionnels (si tous vides) |
| Bouton formulaire complet | `⛶` en haut à droite → navigue vers la page complète (perd le formulaire) |
| Après validation | Fermer + liste rafraîchie + toast avec action "Ouvrir" |
| Save & New | Bouton `+ Nouveau` : sauvegarde et rouvre le formulaire vide |
| Scope | **Tous les objets OpsFlux** |

---

### Composant QuickEntryForm

```tsx
// src/components/core/QuickEntryForm.tsx

interface QuickEntryFormProps {
  title: string
  objectType: string          // "contact", "asset_platform", "document", "dcs_tag"...
  fields: FieldDefinition[]   // tous les champs (requis + optionnels)
  onSubmit: (data: Record<string, any>) => Promise<{ id: string; label: string; url: string }>
  onClose: () => void
  fullFormUrl?: string        // URL de la page complète pour le bouton ⛶
  container?: "modal" | "drawer"  // défaut: "modal"
}

export const QuickEntryForm = ({
  title, objectType, fields, onSubmit, onClose, fullFormUrl, container = "modal"
}: QuickEntryFormProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const form = useForm({ resolver: zodResolver(buildZodSchema(fields)) })

  const requiredFields = fields.filter(f => f.is_required)
  const optionalFields = fields.filter(f => !f.is_required)
  const hasOptional = optionalFields.length > 0

  const handleSubmit = async (data: Record<string, any>, andNew = false) => {
    setIsSaving(true)
    try {
      const result = await onSubmit(data)

      // Toast avec action "Ouvrir la fiche"
      toast.success({
        title: `${title} créé.`,
        action: {
          label: "Ouvrir la fiche",
          onClick: () => navigate(result.url),
        },
        duration: 6000,
      })

      if (andNew) {
        form.reset()           // Vider le formulaire pour un nouveau
        setIsExpanded(false)   // Re-réduire au mode Quick Entry
      } else {
        onClose()
      }
    } finally {
      setIsSaving(false)
    }
  }

  const formContent = (
    <Form {...form}>
      <div className="space-y-3">

        {/* ── Champs REQUIS (toujours visibles) ── */}
        {requiredFields.map(field => (
          <QuickEntryField
            key={field.key}
            field={field}
            control={form.control}
            isRequired={true}
          />
        ))}

        {/* ── Toggle expand / réduire ── */}
        {hasOptional && (
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors py-1"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Réduire
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                {optionalFields.length} champ{optionalFields.length > 1 ? "s" : ""} de plus
              </>
            )}
          </button>
        )}

        {/* ── Champs OPTIONNELS (visibles si expanded) ── */}
        {isExpanded && (
          <div className="space-y-3 pt-1 border-t border-border/50 animate-in slide-in-from-top-1 duration-150">
            {optionalFields.map(field => (
              <QuickEntryField
                key={field.key}
                field={field}
                control={form.control}
                isRequired={false}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center gap-2 pt-4 mt-4 border-t border-border">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={isSaving}
        >
          Annuler
        </Button>
        <div className="flex gap-2 ml-auto">
          {/* Save & New */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSaving}
            onClick={form.handleSubmit(data => handleSubmit(data, true))}
          >
            + Nouveau
          </Button>
          {/* Save & Close */}
          <Button
            type="submit"
            size="sm"
            disabled={isSaving}
            onClick={form.handleSubmit(data => handleSubmit(data, false))}
          >
            {isSaving && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            Enregistrer
          </Button>
        </div>
      </div>
    </Form>
  )

  // Container Modal
  if (container === "modal") {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader className="flex-row items-center gap-2 pr-8">
            <DialogTitle className="flex-1">{title}</DialogTitle>
            {/* Bouton ⛶ formulaire complet */}
            {fullFormUrl && (
              <Tooltip content="Formulaire complet">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={() => { onClose(); navigate(fullFormUrl) }}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </Tooltip>
            )}
          </DialogHeader>
          {formContent}
        </DialogContent>
      </Dialog>
    )
  }

  // Container Drawer
  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="right" className="w-[420px] flex flex-col">
        <SheetHeader className="flex-row items-center gap-2">
          <SheetTitle className="flex-1">{title}</SheetTitle>
          {fullFormUrl && (
            <Tooltip content="Formulaire complet">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => { onClose(); navigate(fullFormUrl) }}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-4">
          {formContent}
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

---

### Composant QuickEntryField — Rendu par type avec badge requis

```tsx
// src/components/core/QuickEntryField.tsx

const QuickEntryField = ({
  field, control, isRequired
}: { field: FieldDefinition; control: Control; isRequired: boolean }) => (
  <FormField
    control={control}
    name={field.key}
    render={({ field: formField, fieldState }) => (
      <FormItem>
        <div className="flex items-center gap-1.5 mb-1">
          <FormLabel className="text-xs font-medium mb-0">
            {field.label[getCurrentLanguage()]}
          </FormLabel>
          {/* Badge distinctif REQUIS */}
          {isRequired && (
            <span
              className="inline-flex items-center h-4 px-1.5 rounded-sm bg-primary/10 text-primary text-[10px] font-semibold tracking-wide"
              aria-label="Champ obligatoire"
            >
              REQ
            </span>
          )}
        </div>

        <FormControl>
          <FieldInput field={field} formField={formField} hasError={!!fieldState.error} />
        </FormControl>

        {fieldState.error && (
          <FormMessage className="text-[11px]" />
        )}
      </FormItem>
    )}
  />
)

// Rendu du champ selon son type
const FieldInput = ({ field, formField, hasError }: FieldInputProps) => {
  const baseClass = cn(
    "h-8 text-sm",
    hasError && "border-destructive focus-visible:ring-destructive"
  )

  switch (field.field_type) {
    case "text_short":
    case "text_long":
      return <Input {...formField} className={baseClass} placeholder={field.placeholder} />

    case "number_int":
    case "number_decimal":
      return (
        <div className="flex items-center gap-1.5">
          <Input {...formField} type="number" className={baseClass} />
          {field.options?.unit && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {field.options.unit}
            </span>
          )}
        </div>
      )

    case "select_static":
      return (
        <SmartCombobox
          fieldKey={field.key}
          options={field.options?.options || []}
          value={formField.value}
          onChange={formField.onChange}
          placeholder="Sélectionner..."
        />
      )

    case "reference":
      return (
        <ObjectPicker
          objectType={field.options?.object_type}
          value={formField.value}
          onChange={formField.onChange}
          placeholder={`Chercher un${field.label.fr.startsWith('A') ? "n" : ""} ${field.label.fr.toLowerCase()}...`}
        />
      )

    case "date":
      return <DatePicker value={formField.value} onChange={formField.onChange} className={baseClass} />

    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <Switch checked={!!formField.value} onCheckedChange={formField.onChange} />
          <span className="text-xs text-muted-foreground">
            {formField.value ? "Oui" : "Non"}
          </span>
        </div>
      )

    default:
      return <Input {...formField} className={baseClass} />
  }
}
```

---

### Décision modal vs drawer par objet

| Objet | Container | Raison |
|---|---|---|
| Contact | Modal | 3 champs requis, simple |
| Tiers | Modal | 2-3 champs requis |
| Asset Platform | Drawer | 6 champs requis + géo |
| Asset Well | Drawer | 6 champs requis + parent |
| Asset Logistics | Modal | 3 champs requis |
| Document | Modal | 3 étapes wizard (projet, type, titre) |
| Tag DCS | Modal | 3 champs requis |
| PID Document | Modal | 4 champs requis |
| Projet | Modal | 2 champs requis |
| Dashboard | Modal | 1 champ requis (titre) |
| Connecteur | Drawer | Config complexe par type |

---

### Intégration dans les pages liste

```tsx
// Bouton "+ Nouveau" dans le StaticPanelHeader → ouvre le Quick Entry
// Partout dans OpsFlux, le même pattern

// Exemple : liste des contacts
const ContactsListPage = () => {
  const [showQuickEntry, setShowQuickEntry] = useState(false)
  const createMutation = useMutation({ mutationFn: createContact })

  return (
    <>
      <PageHeaderPortal>
        <Breadcrumbs items={[{ label: "Tiers" }, { label: "Contacts" }]} />
        <Button size="sm" onClick={() => setShowQuickEntry(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Nouveau contact
        </Button>
      </PageHeaderPortal>

      <DataTable data={contacts} columns={contactColumns} />

      {showQuickEntry && (
        <QuickEntryForm
          title="Nouveau contact"
          objectType="contact"
          container="modal"
          fields={CONTACT_QUICK_ENTRY_FIELDS}
          fullFormUrl="/tiers/contacts/new"
          onSubmit={async (data) => {
            const contact = await createMutation.mutateAsync(data)
            queryClient.invalidateQueries({ queryKey: ["contacts"] })
            return {
              id: contact.id,
              label: `${contact.first_name} ${contact.last_name}`,
              url: `/tiers/contacts/${contact.id}`,
            }
          }}
          onClose={() => setShowQuickEntry(false)}
        />
      )}
    </>
  )
}
```

---

### Définition des champs Quick Entry par objet

```typescript
// src/config/quick-entry-fields.ts
// Chaque module déclare ses champs Quick Entry

export const CONTACT_QUICK_ENTRY_FIELDS: FieldDefinition[] = [
  { key: "first_name",        label: { fr: "Prénom",      en: "First name"  }, field_type: "text_short",    is_required: true  },
  { key: "last_name",         label: { fr: "Nom",         en: "Last name"   }, field_type: "text_short",    is_required: true  },
  { key: "professional_email",label: { fr: "Email",       en: "Email"       }, field_type: "text_short",    is_required: false },
  { key: "tiers_id",          label: { fr: "Société",     en: "Company"     }, field_type: "reference",     is_required: false, options: { object_type: "tiers" } },
  { key: "job_title",         label: { fr: "Titre",       en: "Job title"   }, field_type: "text_short",    is_required: false },
  { key: "phone_mobile",      label: { fr: "Téléphone",   en: "Phone"       }, field_type: "text_short",    is_required: false },
  { key: "department",        label: { fr: "Département", en: "Department"  }, field_type: "text_short",    is_required: false },
]

export const DCS_TAG_QUICK_ENTRY_FIELDS: FieldDefinition[] = [
  { key: "tag_name",      label: { fr: "Nom du tag",   en: "Tag name"  }, field_type: "text_short",    is_required: true  },
  { key: "tag_type",      label: { fr: "Type",         en: "Type"      }, field_type: "select_static", is_required: true,  options: { options: TAG_TYPES } },
  { key: "area",          label: { fr: "Zone",         en: "Area"      }, field_type: "select_static", is_required: true,  options: { options: AREAS } },
  { key: "description",   label: { fr: "Description",  en: "Description"},field_type: "text_short",    is_required: false },
  { key: "equipment_id",  label: { fr: "Équipement",   en: "Equipment" }, field_type: "reference",     is_required: false, options: { object_type: "equipment" } },
  { key: "range_min",     label: { fr: "Plage min",    en: "Range min" }, field_type: "number_decimal",is_required: false },
  { key: "range_max",     label: { fr: "Plage max",    en: "Range max" }, field_type: "number_decimal",is_required: false },
  { key: "engineering_unit", label: { fr: "Unité",     en: "Unit"      }, field_type: "text_short",    is_required: false },
]
// idem pour Document, Asset, Tiers, PIDDocument, Project...
```

---

### Badge visuel REQ — Distinction exacte

```
Champ requis :    Label  [REQ]   Input border normale
Champ optionnel : Label           Input border normale (aucun badge)

Différence par rapport à l'astérisque * classique :
  * → minuscule, souvent raté, pas accessible
  [REQ] → badge coloré, visible, lisible au lecteur d'écran (aria-label="Champ obligatoire")

Couleur du badge [REQ] : bg-primary/10 + text-primary
  → même teinte que le brand OpsFlux, discret mais distinctif
  → pas rouge (le rouge = erreur, pas obligation)
```

---

### Règle ERPNext respectée : "form fields should tell a story"

```
Ordre des champs dans le Quick Entry :

1. Champs d'identification principale (toujours requis)
   → Nom, Code, Numéro...

2. Champs de classification (souvent requis)
   → Type, Statut, Catégorie...

3. Champs de contexte (souvent requis si pertinent)
   → Projet, Plateforme parent, Zone...

4. ─── toggle "N champs de plus" ───

5. Champs de détail (optionnels)
   → Description, Notes, coordonnées secondaires...

6. Champs techniques (optionnels)
   → Ranges, unités, adresses DCS...

7. Champs systèmes (optionnels, rarement utiles à la création)
   → Dates, métadonnées...
```

---

## 28. Inline Editing — Édition directe sans mode "Modifier"

> **Principe fondamental OpsFlux :** Si l'utilisateur a le droit de modifier un objet
> ET que l'objet est dans un état modifiable, il édite directement — sans bouton "Modifier",
> sans changement de page, sans mode édition explicite.
>
> L'interface détecte les droits + l'état, et rend les champs interactifs en conséquence.
> L'édition est toujours **asynchrone** (optimistic update → save en background).

---

### Règle d'activation de l'inline edit

```typescript
// src/hooks/useInlineEditPermission.ts

export const useInlineEditPermission = (
    objectType: string,
    objectId: string,
    requiredPermission: string,
) => {
    const { permissions } = useAuthStore()
    const { data: object } = useObjectStatus(objectType, objectId)

    const EDITABLE_STATUSES: Record<string, string[]> = {
        document:     ["draft"],                        // seulement en brouillon
        asset:        ["active", "maintenance"],
        tiers:        ["active", "pending_validation"],
        contact:      ["active"],
        dcs_tag:      ["active"],
        pid_document: ["ifc", "ifd"],                   // pas AFC ni as-built
        dashboard:    ["*"],                            // toujours éditable
    }

    const hasPermission = permissions.includes(requiredPermission)
    const allowedStatuses = EDITABLE_STATUSES[objectType] || ["*"]
    const isEditableStatus = allowedStatuses.includes("*")
        || allowedStatuses.includes(object?.status)

    return hasPermission && isEditableStatus
}
```

---

### Double-clic → édition inline d'un champ

```tsx
// src/components/core/InlineEditField.tsx
// Composant universel — couvre tous les types de champs

interface InlineEditFieldProps {
    value: any
    fieldType: "text" | "number" | "date" | "select" | "reference" | "textarea"
    onSave: (newValue: any) => Promise<void>
    canEdit: boolean                   // résultat de useInlineEditPermission
    placeholder?: string
    options?: { value: string; label: string }[]   // pour select
    renderDisplay?: (value: any) => React.ReactNode // rendu custom en mode affichage
    className?: string
}

export const InlineEditField = ({
    value, fieldType, onSave, canEdit,
    placeholder = "—", options, renderDisplay, className
}: InlineEditFieldProps) => {
    const [isEditing, setIsEditing] = useState(false)
    const [localValue, setLocalValue] = useState(value)
    const [isSaving, setIsSaving] = useState(false)
    const [displayValue, setDisplayValue] = useState(value) // optimistic
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

    // Synchroniser si la valeur externe change
    useEffect(() => {
        if (!isEditing) {
            setLocalValue(value)
            setDisplayValue(value)
        }
    }, [value, isEditing])

    const startEdit = () => {
        if (!canEdit) return
        setIsEditing(true)
        setLocalValue(value)
        // Focus auto après rendu
        setTimeout(() => inputRef.current?.focus(), 0)
    }

    const save = async () => {
        if (localValue === value) {
            setIsEditing(false)
            return
        }
        // Optimistic update immédiat
        setDisplayValue(localValue)
        setIsEditing(false)
        setIsSaving(true)
        try {
            await onSave(localValue)
        } catch {
            // Rollback si erreur
            setDisplayValue(value)
            setLocalValue(value)
            toast.error({ title: "Impossible de sauvegarder ce champ." })
        } finally {
            setIsSaving(false)
        }
    }

    const cancel = () => {
        setLocalValue(value)
        setIsEditing(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && fieldType !== "textarea") {
            e.preventDefault()
            save()
        }
        if (e.key === "Escape") {
            e.preventDefault()
            cancel()
        }
        if (e.key === "Tab") {
            save()  // Tab → sauvegarder et passer au champ suivant
        }
    }

    // ─── Mode AFFICHAGE ───────────────────────────────────────────
    if (!isEditing) {
        return (
            <div
                className={cn(
                    "group relative min-h-[28px] rounded px-1.5 py-0.5",
                    canEdit && [
                        "cursor-pointer",
                        "hover:bg-accent/60",
                        "hover:ring-1 hover:ring-border",
                        // Hint visuel au hover que c'est éditable
                        "after:content-[''] after:absolute after:inset-0",
                    ],
                    isSaving && "opacity-60",
                    className,
                )}
                onDoubleClick={startEdit}
                title={canEdit ? "Double-clic pour modifier" : undefined}
                role={canEdit ? "button" : undefined}
                tabIndex={canEdit ? 0 : undefined}
                onKeyDown={canEdit ? (e) => {
                    if (e.key === "Enter" || e.key === "F2") startEdit()
                } : undefined}
            >
                {/* Indicateur de sauvegarde */}
                {isSaving && (
                    <Loader2 className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
                )}

                {/* Icône crayon au hover (si éditable) */}
                {canEdit && !isSaving && (
                    <Pencil className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                )}

                {/* Valeur affichée */}
                {renderDisplay ? renderDisplay(displayValue) : (
                    <span className={cn(!displayValue && "text-muted-foreground italic")}>
                        {displayValue ?? placeholder}
                    </span>
                )}
            </div>
        )
    }

    // ─── Mode ÉDITION ─────────────────────────────────────────────
    return (
        <div className={cn("relative", className)}>
            {fieldType === "textarea" ? (
                <Textarea
                    ref={inputRef as React.Ref<HTMLTextAreaElement>}
                    value={localValue ?? ""}
                    onChange={e => setLocalValue(e.target.value)}
                    onBlur={save}
                    onKeyDown={handleKeyDown}
                    className="text-sm min-h-[60px] focus-visible:ring-primary"
                    autoFocus
                />
            ) : fieldType === "select" ? (
                <Select
                    value={localValue ?? ""}
                    onValueChange={async (v) => {
                        setLocalValue(v)
                        // Select → save immédiat au choix
                        setDisplayValue(v)
                        setIsEditing(false)
                        setIsSaving(true)
                        try { await onSave(v) }
                        catch { setDisplayValue(value); toast.error({ title: "Impossible de sauvegarder." }) }
                        finally { setIsSaving(false) }
                    }}
                    open
                    onOpenChange={(open) => { if (!open) cancel() }}
                >
                    <SelectTrigger className="h-7 text-sm" autoFocus>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {options?.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : (
                <Input
                    ref={inputRef as React.Ref<HTMLInputElement>}
                    type={fieldType === "number" ? "number" : fieldType === "date" ? "date" : "text"}
                    value={localValue ?? ""}
                    onChange={e => setLocalValue(
                        fieldType === "number" ? parseFloat(e.target.value) : e.target.value
                    )}
                    onBlur={save}
                    onKeyDown={handleKeyDown}
                    className="h-7 text-sm focus-visible:ring-primary"
                    autoFocus
                />
            )}

            {/* Hint raccourcis clavier */}
            {fieldType !== "select" && (
                <div className="absolute -bottom-5 left-0 flex items-center gap-2 text-[10px] text-muted-foreground whitespace-nowrap">
                    <kbd className="px-1 rounded border bg-muted">↵</kbd> sauvegarder
                    <kbd className="px-1 rounded border bg-muted">Esc</kbd> annuler
                </div>
            )}
        </div>
    )
}
```

---

### Utilisations type dans OpsFlux

```tsx
// ─── Fiche Tiers — titre inline ───────────────────────────────────
const TiersHeader = ({ tiers }: { tiers: Tiers }) => {
    const canEdit = useInlineEditPermission("tiers", tiers.id, "tiers.edit")
    const mutation = useMutation({
        mutationFn: (name: string) =>
            api.patch(`/api/v1/tiers/${tiers.id}`, { company_name: name }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tiers", tiers.id] }),
    })

    return (
        <h1 className="text-lg font-semibold">
            <InlineEditField
                value={tiers.company_name}
                fieldType="text"
                canEdit={canEdit}
                onSave={mutation.mutateAsync}
                className="text-lg font-semibold"
            />
        </h1>
    )
}

// ─── Fiche Asset — champs du panneau détail ───────────────────────
const AssetDetailFields = ({ asset, assetType }: AssetDetailProps) => {
    const canEdit = useInlineEditPermission("asset", asset.id, "asset.edit")

    return (
        <div className="space-y-2">
            {assetType.fields.map(field => (
                <div key={field.key} className="flex items-start gap-3">
                    <span className="text-xs text-muted-foreground w-32 flex-shrink-0 pt-1">
                        {field.label[lang]}
                    </span>
                    <InlineEditField
                        value={asset.properties[field.key]}
                        fieldType={field.field_type as any}
                        canEdit={canEdit}
                        options={field.options?.options}
                        onSave={async (v) => {
                            await api.patch(`/api/v1/assets/${assetType.slug}/${asset.id}`, {
                                properties: { [field.key]: v }
                            })
                            queryClient.invalidateQueries({ queryKey: ["asset", assetType.slug, asset.id] })
                        }}
                    />
                </div>
            ))}
        </div>
    )
}

// ─── Liste de tags DCS — tag_name inline dans la table ────────────
// Dans une colonne DataTable : double-clic sur la cellule
{
    accessorKey: "tag_name",
    header: "Tag",
    cell: ({ row }) => (
        <InlineEditField
            value={row.original.tag_name}
            fieldType="text"
            canEdit={canEdit}
            renderDisplay={(v) => (
                <code className="font-mono text-xs bg-muted px-1 rounded">{v}</code>
            )}
            onSave={async (newName) => {
                const validation = await api.post("/api/v1/pid/dcs-tags/validate", {
                    tag_name: newName, tag_type: row.original.tag_type,
                    project_id: row.original.project_id,
                })
                if (!validation.data.is_valid) {
                    throw new Error(validation.data.errors[0])
                }
                await api.patch(`/api/v1/pid/dcs-tags/${row.original.id}`,
                    { tag_name: newName })
                queryClient.invalidateQueries({ queryKey: ["dcs-tags"] })
            }}
        />
    ),
}
```

---

### Glissé-clic (Drag interactions)

Partout où le drag apporte de la valeur, il est activé :

```
DRAG ACTIVÉ dans OpsFlux :
  ✅ Arborescence projets       → réordonner les nœuds (dnd-kit)
  ✅ Sections d'un template     → réordonner les sections (dnd-kit)
  ✅ Champs d'un template       → réordonner les champs dans une section
  ✅ Dashboard widgets          → repositionner les widgets (GridStack natif)
  ✅ Fichiers/PJ                → drag & drop pour uploader (react-dropzone)
  ✅ Colonnes DataTable         → réordonner les colonnes visibles (dnd-kit)
  ✅ Objets bibliothèque PID    → déjà natif draw.io
  ✅ Steps du pipeline connecteur → réordonner les transformations
  ✅ Items de liste de distribution → réordonner les destinataires
  ✅ Nav items favoris sidebar  → réordonner les favoris (dnd-kit)

DRAG NON ACTIVÉ :
  ❌ Lignes d'une DataTable standard (ordre géré par tri)
  ❌ Commentaires inline
  ❌ Notifications
```

```tsx
// Règle implémentation dnd-kit :
// - PointerSensor avec activationConstraint: { distance: 8 }
//   → évite les déclenchements accidentels lors d'un clic simple
// - DragOverlay pour le ghost visuel pendant le drag
// - Toujours un feedback visuel sur la cible (bg-accent/50 + ring)
// - Save asynchrone onDragEnd (pas de refetch pendant le drag)

const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: { distance: 8 }  // ← critique : évite faux positifs
    }),
    useSensor(KeyboardSensor, {               // ← accessibility : drag au clavier
        coordinateGetter: sortableKeyboardCoordinates,
    })
)
```

---

### Raccourcis clavier — Inline edit

```
Double-clic    → passer en mode édition du champ
F2             → passer en mode édition du champ focusé (standard Windows)
Enter (affichage) → passer en mode édition si le champ est focusé
Enter (édition)   → sauvegarder (sauf textarea)
Tab (édition)     → sauvegarder + focus au champ suivant
Shift+Tab         → sauvegarder + focus au champ précédent
Escape            → annuler et revenir à la valeur originale
Ctrl+Z / ⌘Z       → dans un champ texte en édition : undo local du champ
```

**Focus management entre champs (Tab navigation) :**

```tsx
// Dans une fiche avec plusieurs InlineEditField,
// Tab après save doit passer au champ suivant automatiquement.
// Implémenter via tabIndex séquentiel + gestion onBlur/onFocus

const FIELD_ORDER = ["company_name", "short_name", "main_email", "main_phone", "website"]

const handleFieldSaveAndNext = (currentField: string, value: any) => {
    save(currentField, value)
    const nextIndex = FIELD_ORDER.indexOf(currentField) + 1
    if (nextIndex < FIELD_ORDER.length) {
        // Focus le prochain champ
        document.querySelector<HTMLElement>(
            `[data-field="${FIELD_ORDER[nextIndex]}"]`
        )?.focus()
    }
}
```

---

### États visuels — Synthèse

```
Champ non éditable (pas de droits ou objet verrouillé) :
  → Texte brut, aucune indication visuelle d'interactivité
  → Aucun cursor-pointer, aucun hover effect

Champ éditable (droits OK + état OK) :
  → Au hover : fond légèrement coloré (bg-accent/60) + ring border + icône crayon
  → Cursor : default (pas pointer — on double-clique, on ne clique pas)
  → Tooltip discret si champ focusé : "Double-clic ou F2 pour modifier"

Champ en cours d'édition :
  → Input/Textarea/Select avec focus ring primary
  → Hint raccourcis ↵ / Esc sous le champ
  → Fond légèrement différencié

Champ en cours de sauvegarde (optimistic) :
  → Valeur mise à jour immédiatement (optimistic)
  → Spinner discret en position absolue top-right
  → opacity-60 sur le champ

Erreur de sauvegarde (rollback) :
  → Valeur revient à l'originale
  → Toast erreur "Impossible de sauvegarder ce champ."
  → Champ repasse en mode affichage
```

---

### Règle de cohérence globale

```
JAMAIS dans OpsFlux :
  ❌ Bouton "Modifier" qui ouvre une page ou modal pour éditer un objet simple
  ❌ Mode "Edition" / "Lecture" explicite à basculer (sauf Dashboard et éditeur BlockNote)
  ❌ Formulaire de modification identique au formulaire de création pour les champs simples

TOUJOURS dans OpsFlux :
  ✅ Double-clic sur un champ → édition inline si droits OK
  ✅ Save asynchrone avec optimistic update
  ✅ Rollback propre si erreur
  ✅ Tab pour naviguer entre champs éditables
  ✅ Escape pour annuler
  ✅ Drag là où ça fait sens (liste ordonnée, réorganisation)

EXCEPTIONS LÉGITIMES où le formulaire/modal est justifié :
  → Création d'un objet (Quick Entry §27)
  → Champs qui nécessitent une saisie multi-étapes (wizard document §Q7)
  → Actions avec confirmation requise (InlineConfirmButton §21)
  → Motif de rejet (champ texte obligatoire avant action workflow)
```

---

## 29. Workflow Editor — React Flow

> Éditeur visuel de définition de workflow (Settings > Modules > Rédacteur > Workflows).
> Visualisateur d'instance (fiche document en cours de validation).
> Lib : React Flow 11.11+ (MIT).

---

### Types de nœuds — Palette complète

```
┌──────────────────────────────────────────────────────────────┐
│ PALETTE                                                       │
│                                                              │
│  ○ Début          Nœud de départ — unique par workflow       │
│                                                              │
│  □ Séquentiel     1 validateur assigné (rôle ou user)        │
│                                                              │
│  ⊞ Parallèle      N validateurs simultanés avec seuil        │
│                                                              │
│  ◇ Conditionnel   Branch selon un champ du document          │
│                                                              │
│  🔔 Notification  Envoyer un email/notif sans attendre action │
│                                                              │
│  ⊗ Fin Approuvé   Nœud terminal → status "approved"          │
│  ⊗ Fin Rejeté     Nœud terminal → status "rejected"          │
└──────────────────────────────────────────────────────────────┘
```

---

### Format `graph_json` — Spec exhaustive

```typescript
// Structure complète stockée dans workflow_definitions.graph_json

interface WorkflowGraph {
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
    viewport?: { x: number; y: number; zoom: number }
}

// ─── NŒUD ────────────────────────────────────────────────────
type WorkflowNodeType =
    | "start"
    | "sequential"
    | "parallel"
    | "conditional"
    | "notification"
    | "end_approved"
    | "end_rejected"

interface WorkflowNode {
    id: string               // ex: "node_1", "node_abc123"
    type: WorkflowNodeType
    position: { x: number; y: number }
    data: WorkflowNodeData
}

// Données selon le type de nœud
type WorkflowNodeData =
    | StartNodeData
    | SequentialNodeData
    | ParallelNodeData
    | ConditionalNodeData
    | NotificationNodeData
    | EndNodeData

interface StartNodeData {
    label: string            // "Début"
}

interface SequentialNodeData {
    label: string            // "Révision technique"
    assignee_type: "role" | "user" | "field"
    assignee_role?: string   // ex: "reviewer" — si type = role
    assignee_users?: string[] // UUIDs — si type = user
    assignee_field?: string  // champ du document — si type = field
    deadline_days?: number   // jours avant relance automatique
    rejection_target: string // id du nœud cible si rejet (souvent "start")
    rejection_creates_revision: boolean // créer une nouvelle révision au rejet ?
}

interface ParallelNodeData {
    label: string            // "Approbation comité"
    assignees: Array<{
        type: "role" | "user"
        value: string        // role name ou user UUID
        label: string        // label affiché
    }>
    threshold: "all" | "majority" | number
    // "all" = tous doivent approuver
    // "majority" = (N/2)+1
    // number = N parmi les assignés
    deadline_days?: number
    rejection_target: string
    rejection_behavior: "any" | "majority"
    // "any" = 1 rejet suffit pour bloquer
    // "majority" = majorité de rejets pour bloquer
}

interface ConditionalNodeData {
    label: string            // "Vérification montant"
    conditions: Array<{
        id: string
        field: string        // clé du form_data du document
        operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "is_empty" | "is_not_empty"
        value: any
        target_node_id: string  // nœud cible si condition vraie
        label: string           // label de l'edge (ex: "> 10 000 $")
    }>
    default_target_node_id: string  // nœud cible si aucune condition vraie
}

interface NotificationNodeData {
    label: string
    recipients: Array<{
        type: "role" | "user" | "field"
        value: string
    }>
    template_key: string     // clé du template email/notif
    auto_advance: boolean    // avancer automatiquement sans attendre d'action
}

interface EndNodeData {
    label: string            // "Approuvé" ou "Rejeté"
}

// ─── EDGE ─────────────────────────────────────────────────────
interface WorkflowEdge {
    id: string
    source: string           // id du nœud source
    target: string           // id du nœud cible
    label?: "approved" | "rejected" | "default" | string
    // "approved" = edge emprunté si action approve
    // "rejected" = edge emprunté si action reject
    // string custom = label conditionnel (ConditionalNode)
    animated?: boolean       // animé si edge actif
}
```

**Exemple complet — Workflow 2 validateurs séquentiels :**

```json
{
  "nodes": [
    { "id": "start",    "type": "start",
      "position": { "x": 100, "y": 200 },
      "data": { "label": "Début" } },

    { "id": "node_rev", "type": "sequential",
      "position": { "x": 300, "y": 200 },
      "data": {
        "label": "Révision technique",
        "assignee_type": "role",
        "assignee_role": "reviewer",
        "deadline_days": 3,
        "rejection_target": "start",
        "rejection_creates_revision": false
      }},

    { "id": "node_app", "type": "sequential",
      "position": { "x": 550, "y": 200 },
      "data": {
        "label": "Approbation Manager",
        "assignee_type": "role",
        "assignee_role": "tenant_admin",
        "deadline_days": 5,
        "rejection_target": "node_rev",
        "rejection_creates_revision": true
      }},

    { "id": "end_ok",  "type": "end_approved",
      "position": { "x": 800, "y": 200 },
      "data": { "label": "Approuvé" } },

    { "id": "end_ko",  "type": "end_rejected",
      "position": { "x": 550, "y": 350 },
      "data": { "label": "Rejeté" } }
  ],
  "edges": [
    { "id": "e1", "source": "start",    "target": "node_rev", "label": "default" },
    { "id": "e2", "source": "node_rev", "target": "node_app", "label": "approved" },
    { "id": "e3", "source": "node_rev", "target": "start",    "label": "rejected" },
    { "id": "e4", "source": "node_app", "target": "end_ok",   "label": "approved" },
    { "id": "e5", "source": "node_app", "target": "node_rev", "label": "rejected" }
  ]
}
```

---

### UI Éditeur React Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOOLBAR                                                              │
│ Workflow : Rapport de production     [Tester] [Sauvegarder] [Activer]│
├────────────────┬───────────────────────────────┬────────────────────┤
│ PALETTE        │ CANVAS (React Flow)            │ PROPRIÉTÉS         │
│                │                                │                    │
│ ○ Début        │  ○─────────────────────────→  │ [Nœud sélectionné] │
│ □ Séquentiel   │ start  node_rev  node_app  end │                    │
│ ⊞ Parallèle   │                                │ Type : Séquentiel  │
│ ◇ Conditionnel │  [drag depuis palette]         │                    │
│ 🔔 Notification│                                │ Label              │
│ ⊗ Fin Approuvé │                                │ [Révision tech.  ] │
│ ⊗ Fin Rejeté   │                                │                    │
│                │                                │ Assigné à          │
│ ─────────────  │                                │ ● Rôle [reviewer▾] │
│ Templates :    │                                │ ○ Utilisateur      │
│ Simple 2 valid │                                │ ○ Champ document   │
│ Comité 5 valid │                                │                    │
│ Urgence        │                                │ Deadline (jours)   │
│                │                                │ [3              ]  │
│                │                                │                    │
│                │                                │ Si rejeté → aller à│
│                │                                │ [Début          ▾] │
└────────────────┴───────────────────────────────┴────────────────────┘
```

```tsx
// src/components/modules/workflow/WorkflowEditor.tsx

import ReactFlow, {
    Background, Controls, MiniMap, Panel,
    useNodesState, useEdgesState,
    addEdge, Connection, Edge, Node,
    ReactFlowProvider,
} from "reactflow"
import "reactflow/dist/style.css"

// Nœuds custom React Flow
const NODE_TYPES = {
    start:        StartNode,
    sequential:   SequentialNode,
    parallel:     ParallelNode,
    conditional:  ConditionalNode,
    notification: NotificationNode,
    end_approved: EndApprovedNode,
    end_rejected: EndRejectedNode,
}

export const WorkflowEditor = ({ definitionId }: { definitionId: string }) => {
    const { data: definition } = useQuery({
        queryKey: ["workflow-definition", definitionId],
        queryFn: () => api.get(`/api/v1/workflow/definitions/${definitionId}`).then(r => r.data),
    })

    const [nodes, setNodes, onNodesChange] = useNodesState(definition?.graph_json?.nodes || [])
    const [edges, setEdges, onEdgesChange] = useEdgesState(definition?.graph_json?.edges || [])
    const [selectedNode, setSelectedNode] = useState<Node | null>(null)

    const onConnect = useCallback((params: Connection) => {
        // Valider la connexion avant d'ajouter
        if (!isValidConnection(params, nodes)) return
        setEdges(eds => addEdge({
            ...params,
            label: "approved",  // label par défaut
            animated: false,
        }, eds))
    }, [nodes])

    const addNode = (type: WorkflowNodeType, position: { x: number; y: number }) => {
        const newNode: Node = {
            id: `node_${Date.now()}`,
            type,
            position,
            data: getDefaultNodeData(type),
        }
        setNodes(nds => [...nds, newNode])
    }

    const saveDefinition = async () => {
        if (!validateGraph(nodes, edges)) {
            toast.error({ title: "Workflow invalide.", description: getValidationErrors(nodes, edges) })
            return
        }
        await api.patch(`/api/v1/workflow/definitions/${definitionId}`, {
            graph_json: { nodes, edges }
        })
        toast.success({ title: "Workflow sauvegardé." })
        queryClient.invalidateQueries({ queryKey: ["workflow-definition", definitionId] })
    }

    return (
        <ReactFlowProvider>
            <div className="flex h-full">
                {/* Palette */}
                <WorkflowNodePalette onAddNode={addNode} />

                {/* Canvas */}
                <div className="flex-1">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={NODE_TYPES}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={(_, node) => setSelectedNode(node)}
                        onPaneClick={() => setSelectedNode(null)}
                        fitView
                        snapToGrid
                        snapGrid={[20, 20]}
                        deleteKeyCode="Delete"    // ← supprimer nœud/edge avec Delete
                    >
                        <Background variant="dots" gap={20} size={1} />
                        <Controls />
                        <MiniMap />
                        <Panel position="top-right">
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm"
                                    onClick={() => testWorkflow(nodes, edges)}>
                                    Tester
                                </Button>
                                <Button size="sm" onClick={saveDefinition}>
                                    Sauvegarder
                                </Button>
                            </div>
                        </Panel>
                    </ReactFlow>
                </div>

                {/* Panneau propriétés */}
                {selectedNode && (
                    <WorkflowNodeProperties
                        node={selectedNode}
                        onChange={(data) => {
                            setNodes(nds => nds.map(n =>
                                n.id === selectedNode.id ? { ...n, data } : n
                            ))
                        }}
                        onDelete={() => {
                            setNodes(nds => nds.filter(n => n.id !== selectedNode.id))
                            setEdges(eds => eds.filter(e =>
                                e.source !== selectedNode.id && e.target !== selectedNode.id
                            ))
                            setSelectedNode(null)
                        }}
                        allNodes={nodes}
                    />
                )}
            </div>
        </ReactFlowProvider>
    )
}
```

---

### Nœuds custom React Flow

```tsx
// src/components/modules/workflow/nodes/SequentialNode.tsx

const SequentialNode = ({ data, selected }: NodeProps<SequentialNodeData>) => (
    <div className={cn(
        "bg-background border-2 rounded-lg px-4 py-3 min-w-[160px] shadow-sm",
        selected ? "border-primary" : "border-border",
    )}>
        {/* Handle entrée */}
        <Handle type="target" position={Position.Left}
            className="w-3 h-3 bg-border border-2 border-background" />

        {/* Contenu */}
        <div className="flex items-center gap-2 mb-1">
            <User className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-foreground">{data.label}</span>
        </div>
        <div className="text-[10px] text-muted-foreground">
            {data.assignee_role && `Rôle : ${data.assignee_role}`}
            {data.assignee_users?.length && `${data.assignee_users.length} utilisateur(s)`}
        </div>
        {data.deadline_days && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-600">
                <Clock className="h-3 w-3" />
                {data.deadline_days}j
            </div>
        )}

        {/* Handle sortie approuvé */}
        <Handle type="source" id="approved" position={Position.Right}
            className="w-3 h-3 bg-green-500 border-2 border-background" />
        {/* Handle sortie rejeté */}
        <Handle type="source" id="rejected" position={Position.Bottom}
            className="w-3 h-3 bg-destructive border-2 border-background" />
    </div>
)

// ParallelNode — affiche les avatars des assignés
const ParallelNode = ({ data, selected }: NodeProps<ParallelNodeData>) => (
    <div className={cn(
        "bg-background border-2 rounded-lg px-4 py-3 min-w-[180px] shadow-sm",
        selected ? "border-primary" : "border-border",
    )}>
        <Handle type="target" position={Position.Left}
            className="w-3 h-3 bg-border border-2 border-background" />

        <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-purple-500 flex-shrink-0" />
            <span className="text-xs font-semibold">{data.label}</span>
        </div>

        {/* Badges assignés */}
        <div className="flex flex-wrap gap-1 mb-1">
            {data.assignees.slice(0, 3).map(a => (
                <span key={a.value}
                    className="text-[10px] bg-purple-100 text-purple-700 px-1.5 rounded-full">
                    {a.label}
                </span>
            ))}
            {data.assignees.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                    +{data.assignees.length - 3}
                </span>
            )}
        </div>

        {/* Seuil */}
        <div className="text-[10px] text-muted-foreground">
            Seuil : {data.threshold === "all" ? "Unanimité"
                   : data.threshold === "majority" ? "Majorité"
                   : `${data.threshold}/${data.assignees.length}`}
        </div>

        <Handle type="source" id="approved" position={Position.Right}
            className="w-3 h-3 bg-green-500 border-2 border-background" />
        <Handle type="source" id="rejected" position={Position.Bottom}
            className="w-3 h-3 bg-destructive border-2 border-background" />
    </div>
)
```

---

### Validation du graphe avant sauvegarde

```typescript
// src/lib/workflow-validation.ts

export const validateGraph = (nodes: Node[], edges: Edge[]): boolean => {
    const errors = getValidationErrors(nodes, edges)
    return errors.length === 0
}

export const getValidationErrors = (nodes: Node[], edges: Edge[]): string => {
    const errors: string[] = []

    // 1. Exactement 1 nœud "start"
    const starts = nodes.filter(n => n.type === "start")
    if (starts.length === 0) errors.push("Le workflow doit avoir un nœud Début")
    if (starts.length > 1)  errors.push("Le workflow ne peut avoir qu'un seul nœud Début")

    // 2. Au moins 1 nœud "end_approved"
    if (!nodes.some(n => n.type === "end_approved"))
        errors.push("Le workflow doit avoir un nœud Fin Approuvé")

    // 3. Tous les nœuds non-end ont au moins un edge sortant
    const nodesWithEdges = new Set(edges.map(e => e.source))
    nodes.filter(n => !n.type?.startsWith("end_")).forEach(n => {
        if (!nodesWithEdges.has(n.id))
            errors.push(`Le nœud "${n.data.label}" n'a pas de connexion sortante`)
    })

    // 4. Tous les nœuds non-start ont au moins un edge entrant
    const nodesWithIncoming = new Set(edges.map(e => e.target))
    nodes.filter(n => n.type !== "start").forEach(n => {
        if (!nodesWithIncoming.has(n.id))
            errors.push(`Le nœud "${n.data.label}" n'est pas connecté`)
    })

    // 5. Les nœuds séquentiels/parallèles ont un assigné
    nodes.filter(n => ["sequential", "parallel"].includes(n.type!)).forEach(n => {
        const d = n.data as SequentialNodeData | ParallelNodeData
        const hasAssignee = "assignee_role" in d
            ? d.assignee_role || (d.assignee_users?.length ?? 0) > 0
            : (d as ParallelNodeData).assignees?.length > 0
        if (!hasAssignee)
            errors.push(`Le nœud "${d.label}" n'a pas d'assigné`)
    })

    return errors.join("\n")
}
```

---

### Visualisateur d'instance (fiche document)

```tsx
// src/components/modules/workflow/WorkflowInstanceViewer.tsx
// Mode lecture seule — affiche l'état courant de l'instance

export const WorkflowInstanceViewer = ({
    instanceId, graphJson
}: { instanceId: string; graphJson: WorkflowGraph }) => {
    const { data: instance } = useQuery({
        queryKey: ["workflow-instance", instanceId],
        queryFn: () => api.get(`/api/v1/workflow/instances/${instanceId}`).then(r => r.data),
    })
    const { data: transitions } = useQuery({
        queryKey: ["workflow-transitions", instanceId],
        queryFn: () => api.get(`/api/v1/workflow/instances/${instanceId}/transitions`).then(r => r.data),
    })

    // Colorier les nœuds selon leur état
    const completedNodeIds = new Set(transitions?.map((t: any) => t.from_node) ?? [])
    const currentNodeId = instance?.current_node_id

    const coloredNodes = graphJson.nodes.map(node => ({
        ...node,
        data: {
            ...node.data,
            _status: node.id === currentNodeId ? "current"
                   : completedNodeIds.has(node.id) ? "completed"
                   : instance?.status !== "in_progress" ? "pending"
                   : "pending",
        }
    }))

    const animatedEdges = graphJson.edges.map(edge => ({
        ...edge,
        animated: edge.source === currentNodeId,  // ← edge actif animé
        style: completedNodeIds.has(edge.source)
            ? { stroke: "#22c55e", strokeWidth: 2 }   // edge passé = vert
            : { stroke: "#e2e8f0" },
    }))

    return (
        <div className="h-[240px] border border-border rounded-lg overflow-hidden">
            <ReactFlow
                nodes={coloredNodes}
                edges={animatedEdges}
                nodeTypes={NODE_TYPES_READONLY}
                fitView
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                zoomOnScroll={false}
                panOnDrag={false}
            >
                <Background variant="dots" gap={20} size={1}
                    color="hsl(var(--muted-foreground))" />
            </ReactFlow>
        </div>
    )
}

// Nœud en lecture seule avec coloration selon statut
const ReadonlySequentialNode = ({ data }: NodeProps) => (
    <div className={cn(
        "border-2 rounded-lg px-3 py-2 min-w-[130px] text-center",
        data._status === "current"   && "border-primary bg-primary/10",
        data._status === "completed" && "border-green-500 bg-green-50 dark:bg-green-950/20",
        data._status === "pending"   && "border-border bg-background opacity-50",
    )}>
        <Handle type="target" position={Position.Left} className="opacity-0" />
        <div className="text-[11px] font-medium">{data.label}</div>
        {data._status === "current" && (
            <div className="text-[10px] text-primary mt-0.5">En cours</div>
        )}
        {data._status === "completed" && (
            <Check className="h-3 w-3 text-green-500 mx-auto mt-0.5" />
        )}
        <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
)
```

---

### Raccourcis clavier dans l'éditeur React Flow

```
Delete / Backspace   → Supprimer le nœud ou l'edge sélectionné
Ctrl+Z / ⌘Z          → Annuler (implémenté avec useHistoryState)
Ctrl+Y / ⌘⇧Z         → Rétablir
Ctrl+A / ⌘A          → Sélectionner tout
Ctrl+C / ⌘C          → Copier le nœud sélectionné
Ctrl+V / ⌘V          → Coller
Espace + drag         → Déplacer le canvas (pan)
Ctrl+scroll           → Zoom in/out
Ctrl+Shift+F / ⌘⇧F   → Fit view (recadrer sur tout le workflow)
```

```tsx
// Activer les raccourcis dans ReactFlow
<ReactFlow
    deleteKeyCode={["Delete", "Backspace"]}  // ← supprimer
    selectionKeyCode="Shift"                  // ← Shift+clic = multi-sélection
    multiSelectionKeyCode="Ctrl"              // ← Ctrl+clic = ajouter à la sélection
    panOnScroll={false}
    zoomOnDoubleClick={false}                 // ← éviter conflit avec inline edit
    ...
/>
```

---

## 30. BlockNote — Custom Blocks

> Les 3 blocs custom OpsFlux. Chacun est un `BlockNoteSchema` extension.
> Ils apparaissent dans le slash menu `/` de l'éditeur.

---

### CartoucheBlock

```tsx
// src/components/modules/report/blocks/CartoucheBlock.tsx
// Bloc verrouillé — toujours en premier dans un document.
// Non déplaçable, non supprimable, non sélectionnable comme texte.
// Rendu depuis les métadonnées du document (pas depuis le contenu BlockNote).

import { createReactBlockSpec } from "@blocknote/react"

export const CartoucheBlock = createReactBlockSpec(
    {
        type: "cartouche",
        propSchema: {
            document_id: { default: "" },
        },
        content: "none",  // pas de contenu éditeur
    },
    {
        render: ({ block }) => {
            const { data: doc } = useQuery({
                queryKey: ["document-meta", block.props.document_id],
                queryFn: () => api.get(`/api/v1/documents/${block.props.document_id}/meta`)
                    .then(r => r.data),
                staleTime: Infinity,  // les métadonnées ne changent pas pendant l'édition
            })

            return (
                // contentEditable={false} → empêche la sélection/édition
                <div contentEditable={false}
                    className="w-full border-2 border-foreground rounded-sm mb-6 select-none">
                    {/* Logo + titre */}
                    <div className="flex items-center border-b-2 border-foreground">
                        <div className="w-24 p-2 border-r-2 border-foreground flex-shrink-0">
                            <img src="/logo-perenco.svg" alt="Perenco" className="h-8 w-auto" />
                        </div>
                        <div className="flex-1 p-2 text-center">
                            <p className="text-sm font-bold uppercase tracking-wide">
                                {doc?.title}
                            </p>
                        </div>
                        <div className="w-32 p-2 border-l-2 border-foreground flex-shrink-0 text-center">
                            <p className="text-[10px] text-muted-foreground">N° document</p>
                            <p className="text-xs font-mono font-bold">{doc?.number}</p>
                        </div>
                    </div>

                    {/* Métadonnées */}
                    <div className="grid grid-cols-4 text-[10px]">
                        {[
                            { label: "Révision",      value: doc?.revision },
                            { label: "Statut",         value: doc?.status_label },
                            { label: "Date",           value: doc?.updated_at
                                ? format(new Date(doc.updated_at), "dd/MM/yyyy") : "—" },
                            { label: "Classification", value: doc?.classification || "Interne" },
                        ].map((cell, i) => (
                            <div key={i}
                                className={cn(
                                    "p-1.5 border-t-2 border-foreground",
                                    i < 3 && "border-r-2"
                                )}>
                                <p className="text-muted-foreground">{cell.label}</p>
                                <p className="font-semibold">{cell.value || "—"}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )
        },
    }
)
```

**Règles CartoucheBlock :**
- Toujours en position 0 dans le document — inséré automatiquement à la création
- Pas dans le slash menu `/` (ne peut pas être ajouté manuellement)
- Non supprimable : si l'utilisateur essaie → bloqué silencieusement
- En export PDF : rendu avec le logo officiel Perenco, marges de cartouche standard
- En mode révision (readonly) : identique à l'édition

---

### FormBlock

```tsx
// src/components/modules/report/blocks/FormBlock.tsx
// Bloc formulaire — contient des champs définis par le template.
// Chaque champ est un InlineEditField (§28).

export const FormBlock = createReactBlockSpec(
    {
        type: "form_block",
        propSchema: {
            section_id:  { default: "" },
            section_title: { default: "" },
            fields_json: { default: "[]" },
            // JSON stringifié de FieldDefinition[] — défini par le template
            // Exemple : '[{"key":"production_date","type":"date","label":{"fr":"Date"},"required":true}]'
            locked:      { default: false as boolean },
            // true = section verrouillée (template_manager uniquement peut modifier)
        },
        content: "none",
    },
    {
        render: ({ block, editor }) => {
            const fields: FieldDefinition[] = JSON.parse(block.props.fields_json || "[]")
            const isLocked = block.props.locked
            const canEdit = useInlineEditPermission("document", documentId, "document.edit")
                && !isLocked

            // form_data stocké dans Y.Map via Hocuspocus (§ form_data Y.Map)
            const { values, setValue } = useFormDataYMap(documentId, block.props.section_id)

            return (
                <div contentEditable={false}
                    className={cn(
                        "w-full border border-border rounded-lg p-4 mb-4",
                        isLocked && "bg-muted/30",
                    )}>
                    {/* En-tête de section */}
                    <div className="flex items-center gap-2 mb-3">
                        {isLocked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                        <h3 className="text-sm font-semibold">{block.props.section_title}</h3>
                    </div>

                    {/* Champs */}
                    <div className="grid gap-3"
                        style={{ gridTemplateColumns: fields.length > 4 ? "1fr 1fr" : "1fr" }}>
                        {fields.map(field => (
                            <div key={field.key} className="flex items-start gap-3">
                                <div className="flex items-center gap-1 w-32 flex-shrink-0 pt-0.5">
                                    <span className="text-xs text-muted-foreground">
                                        {field.label[currentLang]}
                                    </span>
                                    {field.is_required && (
                                        <span className="text-[10px] bg-primary/10 text-primary px-1 rounded-sm font-semibold">
                                            REQ
                                        </span>
                                    )}
                                </div>
                                <InlineEditField
                                    value={values[field.key]}
                                    fieldType={field.field_type as any}
                                    canEdit={canEdit}
                                    options={field.options?.options}
                                    onSave={async (v) => setValue(field.key, v)}
                                    className="flex-1 text-sm"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )
        },
    }
)
```

---

### DynamicDataBlock

```tsx
// src/components/modules/report/blocks/DynamicDataBlock.tsx
// Bloc connecté à une source de données (connecteur).
// Affiche : KPI single stat | graphe Recharts | tableau de données

export const DynamicDataBlock = createReactBlockSpec(
    {
        type: "dynamic_data",
        propSchema: {
            connector_id:    { default: "" },
            display_type:    { default: "kpi" as "kpi" | "chart_line" | "chart_bar" | "table" },
            title:           { default: "" },
            columns_json:    { default: "[]" },   // colonnes à afficher (pour table)
            chart_x_field:   { default: "" },
            chart_y_fields:  { default: "[]" },   // JSON array de strings
            kpi_field:       { default: "" },
            kpi_unit:        { default: "" },
            kpi_compare:     { default: "none" as "none" | "prev_period" | "target" },
            snapshot_data:   { default: "" },
            // JSON stringifié des données au moment de la dernière sync
            // Utilisé pour l'export PDF (données figées)
            last_synced_at:  { default: "" },
        },
        content: "none",
    },
    {
        render: ({ block, editor }) => {
            const isExporting = useExportStore(s => s.isExporting)

            // En mode export → utiliser le snapshot figé
            const { data: liveData, isLoading, refetch } = useQuery({
                queryKey: ["connector-data", block.props.connector_id],
                queryFn: () => api.get(`/api/v1/connectors/${block.props.connector_id}/data`)
                    .then(r => r.data),
                enabled: !isExporting && !!block.props.connector_id,
                staleTime: 5 * 60 * 1000,  // données fraîches 5 min
            })

            const displayData = isExporting
                ? JSON.parse(block.props.snapshot_data || "[]")
                : liveData?.rows || []

            return (
                <div contentEditable={false}
                    className="w-full border border-border rounded-lg p-4 mb-4">
                    {/* En-tête */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Database className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-semibold">{block.props.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {block.props.last_synced_at && !isExporting && (
                                <span className="text-[10px] text-muted-foreground">
                                    Mise à jour {formatRelativeTime(block.props.last_synced_at)}
                                </span>
                            )}
                            {!isExporting && (
                                <Button variant="ghost" size="icon" className="h-6 w-6"
                                    onClick={() => {
                                        refetch()
                                        // Sauvegarder le snapshot après refresh
                                        editor.updateBlock(block, {
                                            props: {
                                                snapshot_data: JSON.stringify(liveData?.rows || []),
                                                last_synced_at: new Date().toISOString(),
                                            }
                                        })
                                    }}>
                                    <RefreshCw className={cn("h-3 w-3",
                                        isLoading && "animate-spin")} />
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Contenu selon display_type */}
                    {isLoading ? (
                        <Skeleton className="h-24 w-full rounded" />
                    ) : block.props.display_type === "kpi" ? (
                        <KPIDisplay
                            data={displayData}
                            field={block.props.kpi_field}
                            unit={block.props.kpi_unit}
                            compare={block.props.kpi_compare}
                        />
                    ) : block.props.display_type.startsWith("chart_") ? (
                        <ChartDisplay
                            data={displayData}
                            type={block.props.display_type as "chart_line" | "chart_bar"}
                            xField={block.props.chart_x_field}
                            yFields={JSON.parse(block.props.chart_y_fields || "[]")}
                        />
                    ) : (
                        <TableDisplay
                            data={displayData}
                            columns={JSON.parse(block.props.columns_json || "[]")}
                        />
                    )}
                </div>
            )
        },
    }
)
```

---

### Enregistrement dans le schéma BlockNote

```typescript
// src/lib/blocknote-schema.ts

import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core"
import { CartoucheBlock, FormBlock, DynamicDataBlock } from "@/components/modules/report/blocks"

export const opsfluxSchema = BlockNoteSchema.create({
    blockSpecs: {
        ...defaultBlockSpecs,     // heading, paragraph, bullet, table, image...
        cartouche:     CartoucheBlock,
        form_block:    FormBlock,
        dynamic_data:  DynamicDataBlock,
    },
})

// Slash menu — ce qui apparaît quand l'user tape "/"
export const SLASH_MENU_ITEMS = [
    // Blocs natifs
    { name: "Titre 1",    aliases: ["h1"], group: "Texte" },
    { name: "Titre 2",    aliases: ["h2"], group: "Texte" },
    { name: "Paragraphe", aliases: ["p"],  group: "Texte" },
    { name: "Liste",      aliases: ["ul"], group: "Texte" },
    { name: "Tableau",    aliases: ["table"], group: "Contenu" },
    { name: "Image",      aliases: ["img"],   group: "Contenu" },
    // Blocs OpsFlux
    { name: "Section formulaire", aliases: ["form", "champs"], group: "OpsFlux",
      icon: <FileText />, description: "Section avec champs structurés" },
    { name: "Données connectées", aliases: ["data", "kpi", "graph"], group: "OpsFlux",
      icon: <Database />, description: "KPI, graphe ou tableau depuis un connecteur" },
    // CartoucheBlock absent du slash menu — inséré automatiquement uniquement
]
```

---

## 31. Template Builder — Interface

> L'interface que le `template_manager` utilise pour construire un template.
> Route : `/settings/modules/report/templates/{id}/edit`

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ HEADER                                                           │
│ ← Retour   Template : Rapport de production journalier          │
│            [Aperçu PDF]  [Dupliquer]  [Sauvegarder]  [Activer]  │
├─────────────────┬──────────────────────────┬────────────────────┤
│ SECTIONS        │ APERÇU (read-only)        │ PROPRIÉTÉS         │
│                 │                           │                    │
│ + Cartouche     │  ┌──────────────────────┐ │ [Section sélect.]  │
│ + Formulaire    │  │ CARTOUCHE            │ │                    │
│ + Texte riche   │  └──────────────────────┘ │ Titre de section : │
│ + Données conn. │  ┌──────────────────────┐ │ [Données de prod.] │
│ + Tableau       │  │ DONNÉES DE PROD.     │ │                    │
│ ─────────────── │  │ Date     [    ]      │ │ ☑ Verrouillée      │
│ [drag pour      │  │ Plateforme[ ▾ ]      │ │                    │
│  réordonner]    │  │ Prod. huile[  ]      │ │ CHAMPS (3)         │
│                 │  └──────────────────────┘ │ ┌─────────────┐   │
│                 │  ┌──────────────────────┐ │ │ Date        │   │
│                 │  │ COMMENTAIRES         │ │ │ type: date  │   │
│                 │  │ [Texte libre...]     │ │ │ requis: ✅  │   │
│                 │  └──────────────────────┘ │ ├─────────────┤   │
│                 │                           │ │ Plateforme  │   │
│                 │                           │ │ type: ref   │   │
│                 │                           │ │ requis: ✅  │   │
│                 │                           │ └─────────────┘   │
│                 │                           │ [+ Ajouter champ]  │
└─────────────────┴──────────────────────────┴────────────────────┘
```

```tsx
// src/pages/core/settings/TemplateBuilderPage.tsx

const TemplateBuilderPage = ({ templateId }: { templateId: string }) => {
    const { data: template } = useQuery({
        queryKey: ["template", templateId],
        queryFn: () => api.get(`/api/v1/templates/${templateId}`).then(r => r.data),
    })

    const [sections, setSections] = useState<TemplateSection[]>(
        template?.structure?.sections || []
    )
    const [selectedSection, setSelectedSection] = useState<TemplateSection | null>(null)

    const sensors = useSensors(useSensor(PointerSensor, {
        activationConstraint: { distance: 8 }
    }))

    const handleSectionDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return
        setSections(secs => {
            const oldIndex = secs.findIndex(s => s.id === active.id)
            const newIndex = secs.findIndex(s => s.id === over.id)
            return arrayMove(secs, oldIndex, newIndex)
        })
    }

    return (
        <div className="flex h-full">
            {/* Palette de sections */}
            <aside className="w-48 border-r border-border p-3 flex-shrink-0 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Ajouter une section
                </p>
                {SECTION_TYPES.map(type => (
                    <Button key={type.value} variant="ghost" size="sm"
                        className="w-full justify-start text-xs h-8"
                        onClick={() => addSection(type.value)}>
                        <type.icon className="h-3.5 w-3.5 mr-2 flex-shrink-0" />
                        {type.label}
                    </Button>
                ))}
            </aside>

            {/* Aperçu + réorganisation */}
            <div className="flex-1 overflow-y-auto p-6 bg-muted/20">
                <div className="max-w-2xl mx-auto space-y-3">
                    <DndContext sensors={sensors} onDragEnd={handleSectionDragEnd}
                        collisionDetection={closestCenter}>
                        <SortableContext items={sections.map(s => s.id)}
                            strategy={verticalListSortingStrategy}>
                            {sections.map(section => (
                                <SortableTemplateSection
                                    key={section.id}
                                    section={section}
                                    isSelected={selectedSection?.id === section.id}
                                    onClick={() => setSelectedSection(section)}
                                    onDelete={() => removeSection(section.id)}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                </div>
            </div>

            {/* Panneau propriétés de la section sélectionnée */}
            {selectedSection && (
                <aside className="w-64 border-l border-border flex-shrink-0 flex flex-col">
                    <TemplateSectionProperties
                        section={selectedSection}
                        onChange={(updated) => {
                            setSections(secs => secs.map(s =>
                                s.id === updated.id ? updated : s
                            ))
                            setSelectedSection(updated)
                        }}
                    />
                </aside>
            )}
        </div>
    )
}

// Types de sections disponibles dans la palette
const SECTION_TYPES = [
    { value: "cartouche",    label: "Cartouche",        icon: FileText   },
    { value: "form",         label: "Formulaire",       icon: List       },
    { value: "rich_text",    label: "Texte libre",      icon: AlignLeft  },
    { value: "dynamic_data", label: "Données connectées", icon: Database },
    { value: "table_input",  label: "Tableau de saisie", icon: Grid      },
]
```

### Panneau propriétés d'une section formulaire

```tsx
// TemplateSectionProperties — cas section "form"
const FormSectionProperties = ({ section, onChange }: FormSectionPropsProps) => {
    const [fields, setFields] = useState<FieldDefinition[]>(section.fields || [])

    const addField = () => {
        const newField: FieldDefinition = {
            id: `field_${Date.now()}`,
            key: "",
            label: { fr: "", en: "" },
            field_type: "text_short",
            is_required: false,
        }
        const updated = [...fields, newField]
        setFields(updated)
        onChange({ ...section, fields: updated })
    }

    return (
        <div className="flex flex-col h-full">
            <div className="p-3 border-b border-border">
                <Label className="text-xs">Titre de la section</Label>
                <Input value={section.title} className="h-7 text-xs mt-1"
                    onChange={e => onChange({ ...section, title: e.target.value })} />
                <div className="flex items-center gap-2 mt-2">
                    <Switch checked={section.locked}
                        onCheckedChange={v => onChange({ ...section, locked: v })} />
                    <Label className="text-xs">Section verrouillée</Label>
                </div>
            </div>

            {/* Liste des champs — draggable */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">
                    Champs ({fields.length})
                </p>
                <DndContext onDragEnd={handleFieldDragEnd}>
                    <SortableContext items={fields.map(f => f.id)}>
                        {fields.map(field => (
                            <SortableFieldRow
                                key={field.id}
                                field={field}
                                onChange={(updated) => {
                                    const updated_fields = fields.map(f =>
                                        f.id === updated.id ? updated : f)
                                    setFields(updated_fields)
                                    onChange({ ...section, fields: updated_fields })
                                }}
                                onDelete={() => {
                                    const updated_fields = fields.filter(f => f.id !== field.id)
                                    setFields(updated_fields)
                                    onChange({ ...section, fields: updated_fields })
                                }}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
                <Button variant="outline" size="sm" className="w-full text-xs h-7"
                    onClick={addField}>
                    <Plus className="h-3 w-3 mr-1" /> Ajouter un champ
                </Button>
            </div>
        </div>
    )
}

// Ligne de champ dans la liste — expandable pour configurer
const SortableFieldRow = ({ field, onChange, onDelete }: FieldRowProps) => {
    const [isExpanded, setIsExpanded] = useState(!field.key)  // nouveau champ = ouvert

    return (
        <div className="border border-border rounded-md overflow-hidden">
            {/* Ligne résumé */}
            <div className="flex items-center gap-2 px-2 py-1.5">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab flex-shrink-0" />
                <span className="text-xs flex-1 truncate">
                    {field.label.fr || <span className="text-muted-foreground italic">Nouveau champ</span>}
                </span>
                <Badge variant="outline" className="text-[10px] h-4 px-1">
                    {field.field_type}
                </Badge>
                {field.is_required && (
                    <span className="text-[10px] bg-primary/10 text-primary px-1 rounded-sm">REQ</span>
                )}
                <Button variant="ghost" size="icon" className="h-5 w-5"
                    onClick={() => setIsExpanded(!isExpanded)}>
                    <ChevronDown className={cn("h-3 w-3 transition-transform",
                        isExpanded && "rotate-180")} />
                </Button>
            </div>

            {/* Config détaillée */}
            {isExpanded && (
                <div className="border-t border-border p-2 space-y-2 bg-muted/20">
                    <FieldConfigForm field={field} onChange={onChange} onDelete={onDelete} />
                </div>
            )}
        </div>
    )
}
```

---

## 32. form_data — Collaboration via Y.Map

**Décision :** `form_data` est synchronisé via `Y.Map` Yjs — même CRDT que le contenu riche.

```typescript
// src/hooks/useFormDataYMap.ts

export const useFormDataYMap = (documentId: string, sectionId: string) => {
    const provider = useHocuspocusProvider(documentId)

    // Chaque section formulaire a sa propre Y.Map
    // Clé dans le document Yjs : "form_{sectionId}"
    const yMap = useMemo(() => {
        if (!provider?.document) return null
        return provider.document.getMap(`form_${sectionId}`)
    }, [provider, sectionId])

    const [values, setValues] = useState<Record<string, any>>({})

    useEffect(() => {
        if (!yMap) return

        // Lire les valeurs initiales
        setValues(Object.fromEntries(yMap.entries()))

        // Observer les changements (de tous les collaborateurs)
        const observer = () => {
            setValues(Object.fromEntries(yMap.entries()))
        }
        yMap.observe(observer)
        return () => yMap.unobserve(observer)
    }, [yMap])

    const setValue = useCallback((key: string, value: any) => {
        if (!yMap) return
        // Modification atomique dans la transaction Yjs
        // → propagée à tous les collaborateurs via Hocuspocus
        // → champ par champ, pas de collision possible
        provider?.document.transact(() => {
            yMap.set(key, value)
        })
    }, [yMap, provider])

    return { values, setValue }
}
```

**Ce que ça garantit :**
- User A remplit `production_date`, User B remplit `oil_production_bbl` → **aucun conflit**, chacun garde sa valeur
- Reconnexion offline → les modifications locales sont mergées via CRDT
- `onStoreDocument` dans Hocuspocus persiste la Y.Map entière en DB avec l'état Yjs

---

## 33. useUserPreference — localStorage + sync DB

```typescript
// src/hooks/useUserPreference.ts

export function useUserPreference<T>(
    key: string,
    defaultValue: T,
): [T, (value: T) => void] {
    // 1. Lire depuis localStorage (source de vérité locale, immédiate)
    const [value, setValueLocal] = useState<T>(() => {
        try {
            const stored = localStorage.getItem(`pref:${key}`)
            return stored !== null ? JSON.parse(stored) : defaultValue
        } catch {
            return defaultValue
        }
    })

    // 2. Au montage : hydratation depuis DB (au cas où autre appareil a changé)
    useEffect(() => {
        api.get(`/api/v1/me/preferences/${encodeURIComponent(key)}`)
            .then(r => {
                if (r.data.value !== undefined && r.data.value !== null) {
                    const dbValue = r.data.value as T
                    // DB > localStorage si elles diffèrent
                    // (décision de l'utilisateur depuis un autre appareil)
                    setValueLocal(dbValue)
                    localStorage.setItem(`pref:${key}`, JSON.stringify(dbValue))
                }
            })
            .catch(() => {})  // silencieux si offline
    }, [key])

    const setValue = useCallback((newValue: T) => {
        // Écriture immédiate localStorage → zéro latence perçue
        setValueLocal(newValue)
        localStorage.setItem(`pref:${key}`, JSON.stringify(newValue))

        // Sync async DB → fire and forget
        api.patch(`/api/v1/me/preferences`, { key, value: newValue })
            .catch(() => {
                // Offline → la valeur est déjà dans localStorage
                // sera synchée au prochain montage du hook
            })
    }, [key])

    return [value, setValue]
}
```

**Résolution en cas de conflit** : DB gagne (valeur d'un autre appareil). localStorage est un cache. Si offline → localStorage est la source de vérité jusqu'à reconnexion.

---

## 34. Recherche globale — Full-text + pgvector

```python
# app/services/core/search_service.py

async def global_search(
    query: str,
    tenant_id: str,
    bu_id: Optional[str],
    user_permissions: list[str],
    limit: int = 20,
) -> dict:
    """
    Recherche hybride :
    1. Full-text PostgreSQL (tsvector) → résultats exacts, rapide
    2. pgvector sémantique → résultats "similaires à", plus lents
    Les deux sont lancés en parallèle, les résultats sont fusionnés + dédupliqués.
    """

    # ─── Lancer les deux recherches en parallèle ─────────────────
    full_text_task = asyncio.create_task(
        _full_text_search(query, tenant_id, bu_id, user_permissions, limit)
    )
    semantic_task = asyncio.create_task(
        _semantic_search(query, tenant_id, bu_id, user_permissions, limit // 2)
    )

    full_text_results, semantic_results = await asyncio.gather(
        full_text_task, semantic_task,
        return_exceptions=True   # ne pas planter si pgvector/Ollama down
    )

    if isinstance(full_text_results, Exception):
        full_text_results = []
    if isinstance(semantic_results, Exception):
        semantic_results = []

    # ─── Fusionner + déduplication par (object_type, object_id) ──
    seen = set()
    merged = []

    # Full-text en premier (résultats exacts prioritaires)
    for r in full_text_results:
        key = (r["object_type"], r["object_id"])
        if key not in seen:
            seen.add(key)
            merged.append({**r, "match_type": "exact"})

    # Sémantique en complément
    for r in semantic_results:
        key = (r["object_type"], r["object_id"])
        if key not in seen:
            seen.add(key)
            merged.append({**r, "match_type": "similar"})

    # Trier : exact avant similar, puis par score
    merged.sort(key=lambda x: (0 if x["match_type"] == "exact" else 1, -x.get("score", 0)))

    return {
        "results": merged[:limit],
        "query": query,
        "total": len(merged),
    }


async def _full_text_search(query, tenant_id, bu_id, permissions, limit) -> list:
    """PostgreSQL full-text via tsvector — recherche exacte."""
    results = []

    # Documents
    if "document.read" in permissions:
        docs = await db.execute(text("""
            SELECT 'document' as object_type, id::text as object_id,
                   number as code, title,
                   ts_rank(search_vector, plainto_tsquery('french', :q)) as score
            FROM documents
            WHERE tenant_id = :tid
              AND is_active = TRUE
              AND (:bu IS NULL OR bu_id = :bu)
              AND search_vector @@ plainto_tsquery('french', :q)
            ORDER BY score DESC
            LIMIT :lim
        """), {"q": query, "tid": tenant_id, "bu": bu_id, "lim": limit // 3})
        results.extend(docs.mappings().all())

    # Assets
    if "asset.read" in permissions:
        assets = await db.execute(text("""
            SELECT 'asset' as object_type, id::text as object_id,
                   code, name as title,
                   ts_rank(search_vector, plainto_tsquery('french', :q)) as score
            FROM assets
            WHERE tenant_id = :tid AND is_active = TRUE
              AND search_vector @@ plainto_tsquery('french', :q)
            ORDER BY score DESC LIMIT :lim
        """), {"q": query, "tid": tenant_id, "lim": limit // 3})
        results.extend(assets.mappings().all())

    # Equipment / Tags DCS / Tiers...
    # ... même pattern pour chaque objet

    return [dict(r) for r in results]


async def _semantic_search(query, tenant_id, bu_id, permissions, limit) -> list:
    """pgvector — recherche sémantique sur les chunks indexés."""
    embedding = await ai_service.embed(query, tenant_id)

    similar = await db.execute(
        select(DocumentChunk)
        .where(
            DocumentChunk.tenant_id == tenant_id,
            DocumentChunk.object_type == "document",
        )
        .order_by(DocumentChunk.embedding.cosine_distance(embedding))
        .limit(limit)
    )
    chunks = similar.scalars().all()

    # Dédupliquer par document (un document peut avoir plusieurs chunks similaires)
    seen_docs = set()
    results = []
    for chunk in chunks:
        if str(chunk.object_id) not in seen_docs:
            seen_docs.add(str(chunk.object_id))
            meta = chunk.metadata or {}
            results.append({
                "object_type": "document",
                "object_id": str(chunk.object_id),
                "code": meta.get("document_number"),
                "title": meta.get("document_title"),
                "excerpt": chunk.content[:120] + "...",
                "score": 0.5,  # score approximatif (distance cosinus non exposée ici)
            })

    return results


# ─── Colonne tsvector sur les tables principales ──────────────────
# À ajouter dans la migration Alembic :

# ALTER TABLE documents ADD COLUMN search_vector tsvector
#     GENERATED ALWAYS AS (
#         to_tsvector('french',
#             coalesce(number, '') || ' ' ||
#             coalesce(title, '')
#         )
#     ) STORED;
# CREATE INDEX idx_documents_search ON documents USING GIN(search_vector);

# ALTER TABLE assets ADD COLUMN search_vector tsvector
#     GENERATED ALWAYS AS (
#         to_tsvector('french', coalesce(code, '') || ' ' || coalesce(name, ''))
#     ) STORED;
# CREATE INDEX idx_assets_search ON assets USING GIN(search_vector);
```

