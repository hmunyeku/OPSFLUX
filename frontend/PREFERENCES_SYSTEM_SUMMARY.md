# Système de Préférences UI - Résumé de l'implémentation

## ✅ Ce qui a été implémenté

### 1. Contexte principal (`lib/ui-preferences-context.tsx`)

**Fonctionnalités :**
- Gestion centralisée de toutes les préférences UI
- Chargement automatique des préférences depuis le backend au montage
- Sauvegarde automatique des modifications sur le backend
- Synchronisation bidirectionnelle avec les autres contextes (theme, sidebar)

**Préférences gérées :**
- ✅ **Thème** (light/dark/system) - Synchronisé avec next-themes
- ✅ **État du sidebar** (collapsed/expanded) - Synchronisé avec SidebarProvider
- ✅ **Taille de fenêtre** (normal/fullscreen/compact)
- ✅ **Modes d'affichage par page** (list/grid/kanban/table) - Un mode par page
- ✅ **Taille de police** (75% - 150%) - Multiplicateur de taille de police
- ✅ **Mode compact** - Réduit les espacements de l'interface

**API exposée :**
```typescript
{
  preferences: UIPreferences,
  isLoading: boolean,
  setTheme(theme: Theme),
  setSidebarCollapsed(collapsed: boolean),
  toggleSidebar(),
  setWindowSize(size: WindowSize),
  toggleFullscreen(),
  getPageViewMode(pageKey: string): ViewMode,
  setPageViewMode(pageKey: string, mode: ViewMode),
  setFontSize(size: number),
  setCompactMode(compact: boolean),
  toggleCompactMode(),
  refresh(),
  resetToDefaults()
}
```

### 2. Hook de mode d'affichage (`hooks/use-view-mode.ts`)

**Deux variantes :**

1. **useViewMode()** - Mode automatique basé sur le pathname actuel
   ```typescript
   const { viewMode, setViewMode, isListView, isGridView } = useViewMode("list")
   ```

2. **useCustomViewMode(key)** - Mode personnalisé avec clé spécifique
   ```typescript
   const { viewMode, setViewMode } = useCustomViewMode("projects-list", "grid")
   ```

**Avantages :**
- Sauvegarde automatique du mode par page
- Helpers booléens pour chaque mode (isListView, isGridView, etc.)
- Valeur par défaut configurable

### 3. Composant ViewModeToggle (`components/view-mode-toggle.tsx`)

**Trois variantes :**

1. **ViewModeToggle** - Dropdown complet avec tous les modes
   ```typescript
   <ViewModeToggle
     availableModes={["list", "grid", "table"]}
     defaultMode="list"
   />
   ```

2. **ViewModeToggle avec asButtonGroup** - Boutons individuels
   ```typescript
   <ViewModeToggle
     availableModes={["list", "grid"]}
     asButtonGroup
     size="sm"
   />
   ```

3. **ViewModeToggleSimple** - Bouton unique qui cycle entre les modes
   ```typescript
   <ViewModeToggleSimple availableModes={["list", "grid"]} />
   ```

### 4. ThemeToggle amélioré (`components/theme-toggle.tsx`)

**Deux variantes :**

1. **ThemeToggle** - Simple switch light/dark
   - Persistance automatique sur le backend
   - Synchronisé avec next-themes

2. **ThemeToggleDropdown** - Dropdown avec light/dark/system
   - Option système pour suivre les préférences OS
   - Icône dynamique selon le thème actuel

### 5. Panneau de préférences complet (`components/ui-preferences-panel.tsx`)

**Interface complète de gestion incluant :**
- ✅ Sélection du thème (light/dark/system) avec boutons visuels
- ✅ Slider de taille de police avec affichage du pourcentage
- ✅ Toggle du mode compact
- ✅ Switch pour l'état par défaut du sidebar
- ✅ Select pour la taille de fenêtre
- ✅ Liste des modes d'affichage enregistrés par page
- ✅ Bouton de réinitialisation aux valeurs par défaut
- ✅ Feedback utilisateur via toasts

**Utilisation :**
```typescript
import { UIPreferencesPanel } from "@/components/ui-preferences-panel"

function PreferencesPage() {
  return <UIPreferencesPanel />
}
```

### 6. Intégration dans l'application

**Modifications apportées :**

1. **`app/layout.tsx`** - Ajout du UIPreferencesProvider
   - Placé après AuthProvider (nécessite l'authentification)
   - Englobe tous les autres providers

2. **`components/app-shell.tsx`** - Synchronisation du sidebar
   - Charge l'état initial depuis les préférences
   - Sauvegarde automatique lors des changements
   - AppShellWrapper pour attendre le chargement des préférences

3. **`components/theme-toggle.tsx`** - Synchronisation du thème
   - Mise à jour de next-themes ET des préférences backend
   - Support de l'option "system"

### 7. Documentation (`docs/UI_PREFERENCES.md`)

**Contenu complet :**
- Guide d'utilisation de chaque hook et composant
- Exemples de code pour tous les cas d'usage
- Architecture et flux de données
- API backend requise
- Bonnes pratiques
- Guide de dépannage

## 🔄 Flux de sauvegarde des préférences

```
User Action
    ↓
Hook/Component (useUIPreferences)
    ↓
Update Local State (optimistic - immédiat)
    ↓
Save to Backend API (async)
    ↓
UserPreferencesAPI.upsert()
    ↓
POST /api/v1/user-preferences/
    ↓
Backend Database
```

## 📊 Clés de préférences dans le backend

Toutes les préférences utilisent le préfixe `ui.`:

| Clé | Type | Description |
|-----|------|-------------|
| `ui.theme` | string | Thème de couleur (light/dark/system) |
| `ui.sidebar.collapsed` | boolean | État du sidebar (replié/déplié) |
| `ui.window.size` | string | Taille de fenêtre (normal/fullscreen/compact) |
| `ui.page.viewModes` | json | Modes d'affichage par page |
| `ui.fontSize` | number | Taille de police (75-150) |
| `ui.compactMode` | boolean | Mode compact de l'interface |

## 🎯 Cas d'usage

### 1. Page avec mode d'affichage

```typescript
import { useViewMode } from "@/hooks/use-view-mode"
import { ViewModeToggle } from "@/components/view-mode-toggle"

export default function ProjectsPage() {
  const { viewMode, isListView, isGridView } = useViewMode("list")

  return (
    <div>
      <ViewModeToggle availableModes={["list", "grid"]} />

      {isListView && <ProjectsList />}
      {isGridView && <ProjectsGrid />}
    </div>
  )
}
```

### 2. Utiliser les préférences dans un composant

```typescript
import { useUIPreferences } from "@/lib/ui-preferences-context"

function MyComponent() {
  const { preferences, setFontSize } = useUIPreferences()

  return (
    <div style={{ fontSize: `${preferences.fontSize}%` }}>
      <button onClick={() => setFontSize(125)}>
        Augmenter la taille
      </button>
    </div>
  )
}
```

### 3. Mode compact conditionnel

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

## 🎨 Fichiers créés

| Fichier | Description | Lignes |
|---------|-------------|--------|
| `lib/ui-preferences-context.tsx` | Contexte principal des préférences UI | 280 |
| `hooks/use-view-mode.ts` | Hook pour gérer les modes d'affichage | 50 |
| `components/view-mode-toggle.tsx` | Composants de toggle de vue | 160 |
| `components/theme-toggle.tsx` | Composants de toggle de thème | 110 |
| `components/ui-preferences-panel.tsx` | Panneau de gestion complet | 290 |
| `docs/UI_PREFERENCES.md` | Documentation complète | 400 |
| **TOTAL** | **6 nouveaux fichiers** | **~1290 lignes** |

## 📝 Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `app/layout.tsx` | Ajout du UIPreferencesProvider |
| `components/app-shell.tsx` | Synchronisation du sidebar avec les préférences |
| `lib/email-api.ts` | Correction d'une erreur de type TypeScript |

## ✨ Fonctionnalités clés

✅ **Persistance automatique** - Toutes les modifications sont sauvegardées automatiquement sur le backend
✅ **Optimistic updates** - L'interface se met à jour immédiatement, sans attendre la réponse du serveur
✅ **Synchronisation multi-contextes** - Le thème et le sidebar sont synchronisés avec leurs contextes respectifs
✅ **Par utilisateur** - Chaque utilisateur a ses propres préférences
✅ **Type-safe** - Tout est typé avec TypeScript
✅ **Rechargement** - Les préférences sont rechargées au démarrage de l'application
✅ **Réinitialisation** - Possibilité de réinitialiser toutes les préférences aux valeurs par défaut

## 🔧 Configuration requise côté backend

Le système nécessite l'API des préférences utilisateur avec ces endpoints:

```
GET  /api/v1/user-preferences/all
POST /api/v1/user-preferences/
POST /api/v1/user-preferences/bulk
```

Chaque préférence doit avoir:
- `preference_key` (string) - ex: "ui.theme"
- `preference_value` (any) - valeur de la préférence
- `preference_type` (string) - "string" | "number" | "boolean" | "json"

## 🚀 Prochaines étapes possibles

### Extensions futures (non implémentées)

1. **Préférences de couleur**
   - Thèmes personnalisés
   - Couleurs d'accentuation
   - Couleurs de fond personnalisées

2. **Préférences de langue**
   - Langue de l'interface
   - Format de date préféré
   - Format de nombre

3. **Préférences d'accessibilité**
   - Contraste élevé
   - Réduction des animations
   - Navigation au clavier améliorée

4. **Préférences de notifications**
   - Sons activés/désactivés
   - Position des toasts
   - Durée d'affichage

## 📋 Notes importantes

### Performance
- Les préférences sont chargées une seule fois au démarrage
- Les mises à jour locales sont instantanées (optimistic)
- Les sauvegardes backend sont asynchrones et ne bloquent pas l'interface

### Sécurité
- Les préférences sont liées à l'utilisateur authentifié
- Pas d'accès aux préférences sans authentification
- Validation côté backend recommandée

### Compatibilité
- Compatible avec Next.js 16.0.0
- Fonctionne avec React 19
- Utilise les dernières features de React (hooks, context)

## 🎉 Résultat final

Un système complet de gestion des préférences UI qui permet de:
✅ Sauvegarder automatiquement toutes les préférences d'interface
✅ Gérer le thème (clair/sombre/système)
✅ Mémoriser l'état du menu latéral
✅ Enregistrer les modes d'affichage par page (liste/grille/kanban/table)
✅ Personnaliser la taille de police
✅ Activer un mode compact
✅ Réinitialiser toutes les préférences

Le tout avec une interface utilisateur intuitive et une API simple à utiliser pour les développeurs.
