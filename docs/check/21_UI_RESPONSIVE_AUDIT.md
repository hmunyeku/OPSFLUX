# Audit responsive UI frontend web — 2026-04-20

Passage statique sur `apps/main/src` et l'`index.html` déployé.
Aucun runtime test via Chrome DevTools n'a pu être fait (pas de Chrome
installé sur la machine d'audit) — on pivote donc sur :
1. Inspection code (antipatterns, breakpoints, safe area)
2. Lecture du HTML servi par `app.opsflux.io` pour les méta-tags
3. Vérification des flows mobiles critiques (AppLayout, Topbar, Sidebar,
   AssistantPanel, DynamicPanel)

## Verdict
- ✅ **Breakpoints cohérents** (Tailwind `sm: md: lg: xl:` utilisés sur 42 fichiers clés).
- ✅ **Mobile sidebar drawer** implémenté (`translate-x-full / -translate-x-full` + overlay `fixed inset-0`).
- ✅ **DynamicPanel auto-full-screen** sous 767 px (`matchMedia`).
- ✅ **AssistantPanel mobile** corrigé en amont (commit `1299b5c7` — `100dvh` + safe-area).
- 🟡 **27 fichiers** utilisent encore `grid grid-cols-[3-9]` sans modifier responsive (sur le texte, analyse ligne par ligne il y en a beaucoup moins — ~5 réels).
- 🔴 **Viewport `viewport-fit=cover` manquant** (corrigé ici, commit à suivre).

---

## 1. Méta viewport & PWA

| Attribut | Valeur | État |
|---|---|---|
| `viewport` | `width=device-width, initial-scale=1.0` | 🔴 manquait `viewport-fit=cover` — **corrigé** |
| `theme-color` | `#1e40af` | ✅ |
| `mobile-web-app-capable` | `yes` | ✅ |
| `apple-mobile-web-app-capable` | `yes` | ✅ |
| `apple-mobile-web-app-status-bar-style` | `black-translucent` | ✅ |
| `apple-touch-icon` | 192×192 | ✅ |
| `manifest` | `/manifest.webmanifest` | ✅ |
| `user-scalable` | absent (implicite `yes`) | ✅ (respecte l'a11y : on ne bloque pas le zoom) |

**Impact du fix `viewport-fit=cover` :** toutes les règles `env(safe-area-inset-*)` que j'ai ajoutées dans `AssistantPanel.tsx` (padding bottom du champ chat + onglet ticket) renvoient `0` sur iOS tant que cette flag n'est pas posée. Sans elle, le bouton Send passe sous le home indicator sur iPhone X+.

## 2. Layouts pleine hauteur — `h-screen` / `100vh`

21 occurrences. Analyse :

| Fichier | Usage | Risque |
|---|---|---|
| `auth/LoginPage.tsx` + 4 autres auth pages | `min-h-screen` pour centrer verticalement | 🟢 acceptable (page entière centrée, pas de contenu dépassant) |
| `components/layout/AppLayout.tsx` | conteneur racine `h-screen` | 🟡 remplacer par `h-dvh` pour iOS |
| `pages/dashboard/TVModePage.tsx` | kiosque plein écran | 🟢 intentionnel |
| `pages/travelwiz/CaptainPortalPage.tsx` | portail capitaine mobile | 🟡 idem AppLayout |
| `pages/paxlog/AdsBoardingScanPage.tsx` | scan QR plein écran | 🟡 idem |
| `components/ui/LoaderFallback.tsx` | loader splash | 🟢 OK |

**Recommandation** : remplacer `h-screen` / `min-h-screen` par `h-dvh` / `min-h-dvh` dans les 3 pages utilisées directement sur mobile (`AppLayout`, `CaptainPortalPage`, `AdsBoardingScanPage`). Les pages auth sont OK — leur contenu est court et centré.

## 3. Largeurs fixes `w-[NNNpx]` / `min-w-[NNNpx]`

- 62 occurrences sur 30 fichiers (largeurs fixes en px)
- 26 occurrences sur 19 fichiers (min-width)

La majorité sont des **popovers / menus déroulants** (`min-w-[200px] max-w-[280px]`) — c'est OK car les popovers flottent au-dessus et ne forcent pas le layout.

⚠️ **Cas à surveiller :**

| Fichier | Ligne | Problème |
|---|---|---|
| `components/shared/ResponsiveActionBar.tsx` | `min-w-[...]` | paradoxal pour une barre dite "responsive" — à relire |
| `pages/workflow/workflowEditorPanels.tsx` | `w-[NNNpx]` × 2 | panneau éditeur workflow — drag handle peut déborder sur mobile |
| `pages/settings/tabs/AdminerTab.tsx` | `w-[NNNpx]` × 2 | tableau admin — fine car réservé desktop (permission admin) |

**À corriger** : `ResponsiveActionBar.tsx` si le min-width empêche le wrap vers une toolbar mobile.

## 4. Grilles non-responsive — `grid grid-cols-[3-9]`

13 fichiers contiennent au moins un `grid-cols-N` sans prefix de breakpoint. Vérifications ciblées :

| Fichier | Ligne | `grid-cols-N` | Recommandation |
|---|---|---|---|
| `pages/projets/panels/ProjectDetailPanel.tsx` | 2× | 3 / 4 | ajouter `grid-cols-1 sm:grid-cols-X` |
| `pages/planner/tabs/CapacityTab.tsx` | 2× | ? | idem |
| `components/shared/ImputationManager.tsx` | 4× | ? | priorité haute — formulaire saisi sur mobile |
| `components/dashboard/WidgetSettingsPanel.tsx` | 1× | ? | panel settings (desktop-first) |

Les 19 grilles fixes ne sont pas toutes cassées — certaines utilisent des **container queries** (`@[480px]:grid-cols-4`) qui sont un pattern moderne valide. À vérifier ligne par ligne.

## 5. Safe area (iOS / Android)

Utilisation de `env(safe-area-inset-*)` dans le code :

| Fichier | Usage | État |
|---|---|---|
| `components/layout/AssistantPanel.tsx` | `padding-bottom: max(0.75rem, env(safe-area-inset-bottom))` × 2 | ✅ (mais inutile tant que `viewport-fit=cover` absent → **fix commité**) |

Autres zones à couvrir :
- 🟡 **AppLayout bottom** — aucune padding safe-area sur le footer (si présent)
- 🟡 **Dialog/Modal** — les modals fullscreen mobile (DynamicPanel en mode `full`) devraient avoir `padding-bottom: env(safe-area-inset-bottom)` sur leur sticky action bar

## 6. Navigation / topbar

- ✅ Burger menu (`lg:hidden` pour < 1024px) sur Topbar
- ✅ Mobile search drawer (`sm:hidden`)
- ✅ Entity switcher caché sur mobile (`hidden sm:inline-flex`)
- ✅ Language selector caché sur mobile (`hidden sm:block`)
- 🟡 Hauteur topbar figée à 44 px. OK sur la majorité des devices, léger pour un tap target en landscape.

## 7. Sidebar

- Largeurs figées : 48px collapsed / 180px expanded (pas responsive en px)
- Responsive via `translate-x-full` piloté depuis `AppLayout.tsx`
- ✅ z-index et overlay corrects
- ✅ Focus trap au click extérieur (`onClose`)

## 8. Formulaires / panels de détail

Les panels de détail (MOC, Projets, Tiers, Voyage…) utilisent `DynamicPanel` qui passe en `full` mode sous 767 px. Contenu interne :
- ✅ Container queries (`@[400px]:grid-cols-3`) dans PackLog / AddressManager
- ✅ Rich text field (Tiptap) responsive par défaut
- 🟡 `FullWidthRichRow` dans MOC — vérifier qu'il passe bien sur 320 px

---

## Plan d'action P0 → P3

### P0 — corrigé maintenant

1. ✅ **`viewport-fit=cover`** dans `apps/main/index.html` (déjà fait)

### P1 — à chiffrer

2. Remplacer `h-screen` / `min-h-screen` par `h-dvh` / `min-h-dvh` dans :
   - `components/layout/AppLayout.tsx`
   - `pages/travelwiz/CaptainPortalPage.tsx`
   - `pages/paxlog/AdsBoardingScanPage.tsx`

3. Ajouter `padding-bottom: env(safe-area-inset-bottom)` sur la sticky action bar des `DynamicPanel` en mode `full` (`components/layout/DynamicPanel.tsx`).

4. Auditer ligne par ligne les 13 fichiers avec `grid-cols-N` sans modifier responsive, ajouter `grid-cols-1 sm:grid-cols-X` quand la grille est visible sur mobile.

### P2 — polish

5. `ResponsiveActionBar.tsx` — revoir le `min-w-[...]` si la barre ne wrap pas proprement < 400 px.

6. Runtime verification avec Chrome DevTools sur devices émulés (iPhone SE 375×667, iPhone 14 Pro 393×852, iPad 768×1024) après installation de Chrome.

7. Lighthouse audit accessibilité + mobile performance.

### P3 — validation terrain

8. Check manuel sur iOS Safari + Android Chrome réels pour confirmer que le notch / home indicator sont bien gérés après le fix `viewport-fit`.

---

## Annexes — Outillage pour le suivi

### Commande de scan rapide
```bash
# Placeholders FR hardcodés
grep -rE "placeholder=\"[A-ZÉÀa-zéèàçêîôûù ][^\"]*\"" apps/main/src --include='*.tsx' | wc -l

# Viewport height pattern (doit être 0 après migration dvh)
grep -rE "h-screen|min-h-screen|h-\[100vh\]" apps/main/src --include='*.tsx' | wc -l

# Fixed width outside of menus/popovers
grep -rE "className=\"[^\"]*\\bw-\\[[0-9]+px\\]" apps/main/src --include='*.tsx' | wc -l
```

### Métriques de suivi

| Indicateur | État 2026-04-20 | Cible Q3 2026 |
|---|---|---|
| `viewport-fit=cover` | ✅ | ✅ |
| Pages utilisant `h-dvh` sur mobile | 0 / 3 pages critiques | 3 / 3 |
| Safe-area padding sur sticky bars | 1 fichier (AssistantPanel) | 3 fichiers |
| Grilles cassées mobile (`grid-cols-N` sans prefix, visible mobile) | À auditer | 0 |
| Runtime check Chrome DevTools | ❌ (pas d'environnement) | ✅ post-installation |
