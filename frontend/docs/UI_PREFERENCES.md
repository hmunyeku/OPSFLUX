# Système de Préférences UI

## Vue d'ensemble

Le système de préférences UI permet de sauvegarder et synchroniser automatiquement toutes les préférences d'interface utilisateur avec le backend. Les préférences sont chargées au démarrage de l'application et sauvegardées automatiquement à chaque modification.

## Préférences disponibles

### 1. Thème (theme)
- **Valeurs**: `light`, `dark`, `system`
- **Description**: Définit le thème de couleur de l'application
- **Persistance**: Backend + localStorage (via next-themes)

### 2. État du menu latéral (sidebarCollapsed)
- **Type**: `boolean`
- **Description**: Définit si le menu latéral est replié ou déplié par défaut
- **Synchronisation**: Automatique lors du toggle du sidebar

### 3. Taille de fenêtre (windowSize)
- **Valeurs**: `normal`, `fullscreen`, `compact`
- **Description**: Définit la taille par défaut de la fenêtre principale
- **Utilisation**: Peut être utilisé pour ajuster les marges et espacements

### 4. Modes d'affichage par page (pageViewModes)
- **Type**: `Record<string, ViewMode>`
- **ViewMode**: `list`, `grid`, `kanban`, `table`
- **Description**: Enregistre le mode d'affichage préféré pour chaque page
- **Clé**: Chemin de la page (ex: `/projects/list`)

### 5. Taille de police (fontSize)
- **Type**: `number` (75-150)
- **Description**: Multiplicateur de la taille de police (100 = normal)
- **Unité**: Pourcentage

### 6. Mode compact (compactMode)
- **Type**: `boolean`
- **Description**: Réduit les espacements pour une interface plus dense

## Utilisation

### 1. Hook useUIPreferences

Hook principal pour accéder aux préférences:

```typescript
import { useUIPreferences } from "@/lib/ui-preferences-context"

function MyComponent() {
  const {
    preferences,
    isLoading,
    setTheme,
    setSidebarCollapsed,
    toggleSidebar,
    setWindowSize,
    toggleFullscreen,
    getPageViewMode,
    setPageViewMode,
    setFontSize,
    setCompactMode,
    toggleCompactMode,
    refresh,
    resetToDefaults,
  } = useUIPreferences()

  // Utilisation
  const handleThemeChange = async () => {
    await setTheme("dark")
  }

  return <div>Theme: {preferences.theme}</div>
}
```

### 2. Hook useViewMode

Hook simplifié pour gérer le mode d'affichage d'une page:

```typescript
import { useViewMode } from "@/hooks/use-view-mode"

function MyPage() {
  const { viewMode, setViewMode, isListView, isGridView } = useViewMode("list")

  return (
    <div>
      <button onClick={() => setViewMode("grid")}>
        Grille
      </button>

      {isListView && <ListView />}
      {isGridView && <GridView />}
    </div>
  )
}
```

### 3. Composant ViewModeToggle

Composant prêt à l'emploi pour basculer entre les modes d'affichage:

```typescript
import { ViewModeToggle, ViewModeToggleSimple } from "@/components/view-mode-toggle"

function MyPage() {
  return (
    <div>
      <h1>Ma Page</h1>

      {/* Version complète avec dropdown */}
      <ViewModeToggle
        availableModes={["list", "grid", "table"]}
        defaultMode="list"
      />

      {/* Version simple qui cycle entre les modes */}
      <ViewModeToggleSimple
        availableModes={["list", "grid"]}
      />

      {/* Version button group */}
      <ViewModeToggle
        availableModes={["list", "grid", "kanban"]}
        asButtonGroup
        size="sm"
      />
    </div>
  )
}
```

### 4. Composant ThemeToggle

Composant pour changer le thème:

```typescript
import { ThemeToggle, ThemeToggleDropdown } from "@/components/theme-toggle"

function Header() {
  return (
    <div>
      {/* Simple switch light/dark */}
      <ThemeToggle />

      {/* Dropdown avec light/dark/system */}
      <ThemeToggleDropdown />
    </div>
  )
}
```

### 5. Panneau de préférences complet

Composant pour gérer toutes les préférences UI:

```typescript
import { UIPreferencesPanel } from "@/components/ui-preferences-panel"

function SettingsPage() {
  return (
    <div>
      <h1>Préférences</h1>
      <UIPreferencesPanel />
    </div>
  )
}
```

## Architecture

### Flux de données

```
User Action → Component
            ↓
    useUIPreferences hook
            ↓
    Update local state (optimistic)
            ↓
    Save to backend API
            ↓
    Sync with other contexts (theme, sidebar)
```

### Providers hiérarchie

```typescript
<ThemeProvider>           // next-themes
  <AuthProvider>          // Auth context
    <UIPreferencesProvider>  // UI preferences (needs auth)
      <App />
    </UIPreferencesProvider>
  </AuthProvider>
</ThemeProvider>
```

### API Backend

Le système utilise l'API des préférences utilisateur:

```typescript
// Récupérer toutes les préférences
GET /api/v1/user-preferences/all

// Créer/Mettre à jour une préférence
POST /api/v1/user-preferences/
{
  preference_key: "ui.theme",
  preference_value: "dark",
  preference_type: "string"
}

// Mise à jour en masse
POST /api/v1/user-preferences/bulk
{
  preferences: {
    "ui.theme": { value: "dark", type: "string" },
    "ui.sidebar.collapsed": { value: false, type: "boolean" }
  }
}
```

### Clés de préférences

Toutes les préférences UI utilisent le préfixe `ui.`:

- `ui.theme` - Thème de couleur
- `ui.sidebar.collapsed` - État du sidebar
- `ui.window.size` - Taille de fenêtre
- `ui.page.viewModes` - Modes d'affichage par page (JSON)
- `ui.fontSize` - Taille de police
- `ui.compactMode` - Mode compact

## Exemples d'utilisation

### Page avec mode d'affichage personnalisé

```typescript
"use client"

import { useViewMode } from "@/hooks/use-view-mode"
import { ViewModeToggle } from "@/components/view-mode-toggle"

export default function ProjectsPage() {
  const { viewMode, isListView, isGridView } = useViewMode("list")

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1>Projets</h1>
        <ViewModeToggle
          availableModes={["list", "grid", "kanban"]}
          defaultMode="list"
        />
      </div>

      {isListView && <ProjectsList />}
      {isGridView && <ProjectsGrid />}
      {viewMode === "kanban" && <ProjectsKanban />}
    </div>
  )
}
```

### Composant sensible au mode compact

```typescript
import { useUIPreferences } from "@/lib/ui-preferences-context"

function Card() {
  const { preferences } = useUIPreferences()

  return (
    <div className={preferences.compactMode ? "p-2 gap-1" : "p-4 gap-3"}>
      {/* Contenu */}
    </div>
  )
}
```

### Bouton de basculement plein écran

```typescript
import { useUIPreferences } from "@/lib/ui-preferences-context"
import { Maximize2, Minimize2 } from "lucide-react"

function FullscreenToggle() {
  const { preferences, toggleFullscreen } = useUIPreferences()

  return (
    <button onClick={toggleFullscreen}>
      {preferences.windowSize === "fullscreen" ? (
        <Minimize2 />
      ) : (
        <Maximize2 />
      )}
    </button>
  )
}
```

## Bonnes pratiques

1. **Toujours utiliser le hook** : Évitez de manipuler directement les préférences
2. **Gestion des erreurs** : Les fonctions de modification retournent des Promises - gérer les erreurs si nécessaire
3. **Optimistic updates** : Les modifications locales sont immédiates, la sauvegarde backend est asynchrone
4. **Loading states** : Utiliser `isLoading` pour afficher un état de chargement
5. **Page keys** : Utiliser des clés descriptives pour les modes d'affichage (ex: `projects-list` plutôt que le pathname complet)

## Dépannage

### Les préférences ne se chargent pas
- Vérifier que l'utilisateur est connecté
- Vérifier que le backend API répond correctement
- Regarder la console pour les erreurs

### Les préférences ne se sauvegardent pas
- Vérifier la connexion réseau
- Vérifier les permissions utilisateur
- Regarder les erreurs dans la console

### Le thème ne change pas
- Vérifier que ThemeProvider est bien présent dans le layout
- Vérifier que `next-themes` est correctement configuré
- S'assurer que les classes de thème sont appliquées au HTML

## Support

Pour toute question ou problème, consulter la documentation technique ou contacter l'équipe de développement.
