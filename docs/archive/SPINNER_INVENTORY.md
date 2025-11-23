# Inventaire des Spinners à Remplacer

> **Date:** 28 Octobre 2025
> **Phase:** PHASE 1 - Nettoyage

---

## 📊 Résumé

**Total de fichiers avec spinners:** 14
**Priorité:** 🔴 CRITIQUE (Violation règle FRONTEND_RULES.md)

---

## 🗂️ Fichiers par Catégorie

### 🔴 CRITIQUE - Composants UI Core (Priorité 1)

#### 1. `components/navigation-progress.tsx`
- **Ligne:** 89
- **Code:** `<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />`
- **Composant:** `NavigationSpinner`
- **Usage:** Affiché dans le Header lors de la navigation
- **Impact:** HAUT - Visible sur toutes les pages
- **Remplacement:** Barre de progression skeleton ou supprimer (déjà une barre en haut)

#### 2. `components/ui/loading-button.tsx`
- **Code:** Utilise `Loader2` pour l'état loading
- **Composant:** `LoadingButton`
- **Usage:** Boutons avec état de chargement
- **Impact:** MOYEN - Utilisé dans formulaires
- **Remplacement:** État `disabled` uniquement ou skeleton minimal

---

### 🟡 MOYEN - Composants Métier (Priorité 2)

#### 3. `components/ai/ai-summary-button.tsx`
- **Composant:** Bouton d'IA pour résumés
- **Impact:** MOYEN
- **Remplacement:** État disabled ou skeleton

#### 4. `components/ai/ai-text-suggestions.tsx`
- **Composant:** Suggestions de texte IA
- **Impact:** MOYEN
- **Remplacement:** Skeleton pour suggestions

---

### 🟢 FAIBLE - Composants Header (Priorité 3)

#### 5. `components/header/bookmarks.tsx`
- **Composant:** Gestion des favoris
- **Impact:** FAIBLE
- **Remplacement:** Skeleton dropdown

#### 6. `components/header/bookmarks-dropdown.tsx`
- **Composant:** Dropdown favoris
- **Impact:** FAIBLE
- **Remplacement:** Skeleton liste

#### 7. `components/header/language-switcher.tsx`
- **Composant:** Sélecteur de langue
- **Impact:** FAIBLE
- **Remplacement:** État disabled

#### 8. `components/header/notifications-panel.tsx`
- **Composant:** Panneau notifications
- **Impact:** FAIBLE
- **Remplacement:** Skeleton liste notifications

---

### 🟢 FAIBLE - Dialogs Settings (Priorité 4)

#### 9. `app/(dashboard)/settings/emailing/components/email-template-dialog.tsx`
- **Composant:** Dialog template email
- **Impact:** FAIBLE
- **Remplacement:** Skeleton formulaire

#### 10. `app/(dashboard)/settings/modules/upload-module-dialog.tsx`
- **Composant:** Upload de modules
- **Impact:** FAIBLE
- **Remplacement:** Progress bar + skeleton

#### 11. `app/(dashboard)/settings/profile/preferences-tab.tsx`
- **Composant:** Onglet préférences
- **Impact:** FAIBLE
- **Remplacement:** Skeleton form

---

### 🟢 FAIBLE - Dialogs Users (Priorité 5)

#### 12. `app/(dashboard)/users/components/users-action-dialog.tsx`
- **Composant:** Actions utilisateurs
- **Impact:** FAIBLE
- **Remplacement:** État disabled

#### 13. `app/(dashboard)/users/components/users-invite-dialog.tsx`
- **Composant:** Invitation utilisateurs
- **Impact:** FAIBLE
- **Remplacement:** État disabled

---

### 🟢 FAIBLE - Autres (Priorité 6)

#### 14. `components/ui/address-input.tsx`
- **Composant:** Input adresse avec autocomplétion
- **Impact:** FAIBLE
- **Remplacement:** Skeleton liste suggestions

---

## 🎯 Plan d'Action

### Phase 2.1 - Composants Critiques (30 min)
1. ✅ `navigation-progress.tsx` - Supprimer NavigationSpinner
2. ✅ `loading-button.tsx` - Refactoriser sans Loader2

### Phase 2.2 - Composants Métier (20 min)
3. ✅ `ai-summary-button.tsx`
4. ✅ `ai-text-suggestions.tsx`

### Phase 2.3 - Header (15 min)
5. ✅ `bookmarks.tsx`
6. ✅ `bookmarks-dropdown.tsx`
7. ✅ `language-switcher.tsx`
8. ✅ `notifications-panel.tsx`

### Phase 2.4 - Settings Dialogs (15 min)
9. ✅ `email-template-dialog.tsx`
10. ✅ `upload-module-dialog.tsx`
11. ✅ `preferences-tab.tsx`

### Phase 2.5 - Users Dialogs (10 min)
12. ✅ `users-action-dialog.tsx`
13. ✅ `users-invite-dialog.tsx`

### Phase 2.6 - Autres (5 min)
14. ✅ `address-input.tsx`

---

## 📝 Règles de Remplacement

### Règle 1: Boutons
```tsx
// ❌ AVANT
<Button disabled={isLoading}>
  {isLoading && <Loader2 className="animate-spin" />}
  Submit
</Button>

// ✅ APRÈS
<Button disabled={isLoading}>
  Submit
</Button>
```

### Règle 2: Listes/Contenu
```tsx
// ❌ AVANT
{isLoading ? <Loader2 className="animate-spin" /> : <Content />}

// ✅ APRÈS
{isLoading ? <Skeleton className="h-20" /> : <Content />}
```

### Règle 3: Dropdowns
```tsx
// ❌ AVANT
{isLoading && <Loader2 className="animate-spin" />}

// ✅ APRÈS
{isLoading && (
  <div className="space-y-2">
    <Skeleton className="h-8" />
    <Skeleton className="h-8" />
  </div>
)}
```

### Règle 4: Navigation Globale
```tsx
// ❌ AVANT
<NavigationSpinner /> // Affiche Loader2

// ✅ APRÈS
// Option 1: Supprimer complètement (déjà une barre en haut)
// Option 2: Garde seulement la barre de progression linéaire
```

---

## ✅ Validation

Après chaque modification:
1. ✅ Aucun import de `Loader2` de lucide-react
2. ✅ Aucun `animate-spin` dans le code
3. ✅ Tous les états de chargement utilisent Skeleton ou disabled
4. ✅ Tests visuels sur les 3 breakpoints

---

## 🚫 Imports à Supprimer

Vérifier et supprimer dans tous les fichiers:
```tsx
import { Loader2 } from "lucide-react"  // ❌ À SUPPRIMER
```

Remplacer par:
```tsx
import { Skeleton } from "@/components/ui/skeleton"  // ✅ OK
```

---

## 📊 Métriques

**Temps estimé total:** 1h30
**Difficulté:** Faible à Moyenne
**Risque de régression:** Faible
**Impact utilisateur:** Positif (meilleure UX)

---

**Status:** 🔄 EN COURS
**Prochaine étape:** Phase 2.1 - Composants Critiques
