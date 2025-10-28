# Plan de Migration Frontend OpsFlux

> **Version:** 1.0
> **Date:** 28 Octobre 2025
> **Objectif:** Migrer le frontend vers l'architecture App Shell conforme aux règles FRONTEND_RULES.md

---

## 📊 État des Lieux

### ✅ Points Positifs
1. **Radix UI déjà utilisé** - Tous les composants UI sont basés sur Radix UI
2. **Pas de shadcn/ui** - Aucune trace de shadcn/ui dans le code
3. **Structure partiellement correcte** - Layout avec Sidebar déjà en place
4. **Skeletons présents** - Composant skeleton.tsx existe

### ❌ Non-Conformités Identifiées

#### 1. **Spinners au lieu de Skeletons**
**Fichier:** `frontend/src/components/navigation-progress.tsx:89`
```tsx
// ❌ INTERDIT - Utilisation de Loader2 (spinner)
<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
```
**Fichiers affectés:**
- `navigation-progress.tsx` (NavigationSpinner component)
- `loading-button.tsx` (LoadingButton avec Loader2)
- `address-input.tsx`
- Tous les fichiers utilisant `Loader2` de lucide-react

**Action:** Remplacer tous les spinners par des skeletons Radix UI

---

#### 2. **Structure App Shell Incomplète**

**État actuel:**
```
✅ Header (existe - header.tsx)
✅ Sidebar (existe - app-sidebar.tsx)
❌ Drawer (manquant)
✅ Zone Centrale (existe - children dans layout)
❓ Footer (absent - normal si pas nécessaire)
```

**Problèmes:**
- Pas de zone dédiée pour le Drawer (zone contextuelle)
- Header et Sidebar non standardisés selon les spécifications exactes
- Pas de gestion claire des 5 zones

**Action:** Restructurer le layout pour respecter les 5 zones obligatoires

---

#### 3. **Navigation Incohérente**

**Problèmes identifiés:**
- Routes multiples pour dashboards: `/dashboards/[id]`, `/dashboards/menu/[menuKey]`
- Fichiers `-old.tsx` présents (page-old.tsx)
- Module dynamique `[...modulePath]` sans documentation claire

**Fichiers affectés:**
- `app/(dashboard)/dashboards/page-old.tsx`
- `app/(dashboard)/dashboards/[id]/page-old.tsx`
- `app/(dashboard)/dashboards/menu/[menuKey]/page-old.tsx`

**Action:**
- Supprimer les fichiers `-old.tsx`
- Standardiser les routes
- Documenter la navigation des modules

---

#### 4. **Composants UI Non Conformes**

**LoadingButton** (`components/ui/loading-button.tsx`)
```tsx
// ❌ Utilise un spinner au lieu d'un skeleton/state disabled
```

**Action:** Refactoriser pour utiliser l'état `disabled` avec un skeleton si nécessaire

---

#### 5. **Widgets Core à Standardiser**

**Widgets existants:**
- `chart-line.tsx`
- `placeholder-widget.tsx`
- `progress-card.tsx`
- `recent-activity.tsx`
- `stats-card.tsx`
- `task-list.tsx`
- `user-stats.tsx`

**Problèmes potentiels:**
- États de chargement à vérifier (skeletons vs spinners)
- Conformité avec les principes UI/UX

**Action:** Auditer et corriger chaque widget

---

## 🎯 Plan de Migration (7 Phases)

### Phase 1: Nettoyage et Préparation
**Durée estimée:** 1h

- [ ] Supprimer tous les fichiers `-old.tsx`
- [ ] Créer un inventaire complet des composants utilisant des spinners
- [ ] Documenter l'architecture actuelle vs cible

**Fichiers à supprimer:**
```
app/(dashboard)/dashboards/page-old.tsx
app/(dashboard)/dashboards/[id]/page-old.tsx
app/(dashboard)/dashboards/menu/[menuKey]/page-old.tsx
```

---

### Phase 2: Remplacement des Spinners par Skeletons
**Durée estimée:** 3h

**Fichiers à modifier:**

1. **navigation-progress.tsx**
   - Remplacer `NavigationSpinner` par une barre de progression skeleton
   - Garder `NavigationProgress` (barre en haut)

2. **loading-button.tsx**
   - Supprimer `Loader2`
   - Utiliser l'état `disabled` uniquement
   - Optionnel: ajouter un mini skeleton si vraiment nécessaire

3. **Tous les composants utilisant Loader2:**
   ```bash
   # Liste complète
   - users-invite-dialog.tsx
   - users-action-dialog.tsx
   - upload-module-dialog.tsx
   - preferences-tab.tsx
   - email-template-dialog.tsx
   - address-input.tsx
   - ai-summary-button.tsx
   - ai-text-suggestions.tsx
   ```

**Règle:** AUCUN spinner tournant n'est autorisé. Utiliser:
- Skeleton pour les zones de contenu
- État `disabled` pour les boutons
- Barre de progression linéaire pour les chargements globaux

---

### Phase 3: Restructuration App Shell (5 Zones)
**Durée estimée:** 4h

**Objectif:** Créer une structure claire avec 5 zones distinctes

**Structure cible:**
```tsx
<RootLayout>
  {/* Zone 1: Header */}
  <Header>
    <SidebarTrigger />
    <Search />
    <Actions />
    <UserMenu />
  </Header>

  {/* Zone 2: Sidebar (navigation principale) */}
  <Sidebar>
    <TeamSwitcher />
    <NavGroups />
  </Sidebar>

  {/* Zone 3: Drawer (contextuel - si nécessaire) */}
  <Drawer>
    {/* Panneau contextuel */}
  </Drawer>

  {/* Zone 4: Zone Centrale (contenu principal) */}
  <MainContent>
    {children}
  </MainContent>

  {/* Zone 5: Footer (optionnel) */}
  <Footer />
</RootLayout>
```

**Fichiers à créer/modifier:**
- `app/(dashboard)/layout.tsx` - Restructurer avec les 5 zones
- `components/layout/main-content.tsx` - Nouvelle zone centrale standardisée
- `components/layout/drawer.tsx` - Nouvelle zone drawer (si nécessaire)

---

### Phase 4: Standardisation des Composants UI
**Durée estimée:** 2h

**Actions:**

1. **Vérifier tous les composants Radix UI** (`components/ui/`)
   - S'assurer qu'ils utilisent uniquement Radix UI primitives
   - Aucune dépendance shadcn/ui
   - Tous les états de chargement = skeletons

2. **Créer des composants manquants:**
   - `skeleton-button.tsx` - Bouton avec état skeleton
   - `skeleton-card.tsx` - Card avec skeleton
   - `skeleton-table.tsx` - Table avec skeleton rows

3. **Documenter les composants:**
   - Ajouter JSDoc pour chaque composant
   - Spécifier les props obligatoires
   - Exemples d'utilisation

---

### Phase 5: Widgets Core
**Durée estimée:** 3h

**Pour chaque widget:**

1. **Audit:**
   - Vérifie les dépendances (Radix UI only)
   - Vérifie les états de chargement (skeletons)
   - Vérifie l'accessibilité

2. **Correction:**
   - Remplacer spinners par skeletons
   - Ajouter aria-labels
   - Standardiser les props

3. **Test:**
   - Test de chargement
   - Test responsive
   - Test accessibilité

**Widgets à auditer:**
```
✅ chart-line.tsx
✅ placeholder-widget.tsx
✅ progress-card.tsx
✅ recent-activity.tsx
✅ stats-card.tsx
✅ task-list.tsx
✅ user-stats.tsx
```

---

### Phase 6: Navigation et Routes
**Durée estimée:** 2h

**Objectifs:**

1. **Nettoyer les routes:**
   - Supprimer doublons
   - Documenter chaque route
   - Standardiser les patterns

2. **Standardiser la navigation:**
   - Routes cohérentes pour les modules
   - Breadcrumbs automatiques
   - Navigation contextuelle dans le Drawer

3. **Documenter:**
   - Créer `docs/frontend/ROUTING.md`
   - Mapper toutes les routes
   - Expliquer la logique de navigation

---

### Phase 7: Tests et Validation
**Durée estimée:** 3h

**Tests à effectuer:**

1. **Tests de non-régression:**
   - [ ] Toutes les pages se chargent
   - [ ] Aucun spinner visible
   - [ ] Navigation fluide

2. **Tests de conformité:**
   - [ ] Uniquement Radix UI utilisé
   - [ ] Skeletons partout (pas de spinners)
   - [ ] 5 zones App Shell respectées

3. **Tests d'accessibilité:**
   - [ ] Navigation au clavier
   - [ ] ARIA labels présents
   - [ ] Contraste suffisant

4. **Tests responsive:**
   - [ ] Mobile (< 640px)
   - [ ] Tablet (640-1024px)
   - [ ] Desktop (> 1024px)

---

## 📋 Checklist de Validation Finale

### Règles FRONTEND_RULES.md

- [ ] **R1:** Aucun composant shadcn/ui
- [ ] **R2:** Uniquement Radix UI primitives
- [ ] **R3:** Skeletons pour tous les chargements (ZERO spinner)
- [ ] **R4:** App Shell avec 5 zones clairement définies
- [ ] **R5:** Navigation cohérente et documentée
- [ ] **R6:** Tailwind CSS uniquement (pas de CSS inline)
- [ ] **R7:** TypeScript strict
- [ ] **R8:** Accessibilité (ARIA)
- [ ] **R9:** Responsive design
- [ ] **R10:** Performance (lazy loading, code splitting)

---

## 🚀 Ordre d'Exécution Recommandé

1. **Phase 1** (Nettoyage) - PRIORITAIRE
2. **Phase 2** (Spinners → Skeletons) - PRIORITAIRE
3. **Phase 3** (App Shell) - IMPORTANT
4. **Phase 4** (Composants UI) - IMPORTANT
5. **Phase 5** (Widgets) - MOYEN
6. **Phase 6** (Navigation) - MOYEN
7. **Phase 7** (Tests) - FINAL

---

## 📝 Notes Importantes

### Spinners INTERDITS
**RÈGLE ABSOLUE:** Aucun spinner tournant n'est autorisé dans l'application.

**Pourquoi?**
- Spinners = distraction visuelle
- Skeletons = meilleure UX (affichent la structure du contenu)
- Skeletons = perception de vitesse améliorée

**Exceptions:** AUCUNE. Même pour:
- Chargement de boutons → État `disabled` ou skeleton
- Chargement de formulaires → Skeleton du formulaire
- Navigation → Barre de progression linéaire (pas spinner)

### Radix UI Uniquement
**Composants autorisés:**
- Tous les primitives Radix UI officiels
- Composants custom basés sur Radix UI
- Aucun composant shadcn/ui (même s'ils utilisent Radix en interne)

---

## 📊 Métrique de Succès

**Avant migration:**
- ❌ ~10 fichiers avec spinners
- ❌ Structure App Shell partielle
- ❌ Routes incohérentes

**Après migration:**
- ✅ 0 spinner dans toute l'application
- ✅ App Shell standardisé (5 zones)
- ✅ Routes documentées et cohérentes
- ✅ 100% Radix UI
- ✅ Accessibilité A+ (WCAG 2.1 AA)

---

## 🔄 Migration Incrémentale

**Option 1: Big Bang** (2-3 jours)
- Tout migrer d'un coup
- Risque élevé
- Deploy unique

**Option 2: Incrémentale** (1-2 semaines) ⭐ RECOMMANDÉ
- Phase par phase
- Tests continus
- Rollback facile

---

## 📞 Support et Questions

**Documentation de référence:**
- `docs/instructions/FRONTEND_RULES.md` - Règles complètes
- `docs/instructions/CLAUDE.md` - Instructions générales
- Radix UI Docs: https://www.radix-ui.com/primitives

**Points de vigilance:**
- Toujours vérifier l'absence de spinners après chaque modification
- Tester sur les 3 breakpoints (mobile, tablet, desktop)
- Valider l'accessibilité avec un screen reader

---

**Prêt à commencer?** 🚀

Prochain step: Phase 1 - Nettoyage et Préparation
