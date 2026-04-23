# OPSFLUX — Analyse module par module

**Date** : Avril 2026
**Scope** : `apps/main/src/pages/*` + `app/api/routes/modules/*`
**Méthode** : inspection statique + stats LOC par fichier, focus UI / fonctionnalité / dette technique / simplification.

Lecture rapide en 30 secondes : section **Synthèse transverse** en bas.

---

## 1. Home / Accueil

**Stats** : 1 fichier `HomePage.tsx` (~500 lignes), 1 route backend.

**UI**
- Widget dashboards globaux + widgets quick-actions par module (Sprint récent)
- Réactif mais dense quand beaucoup d'entités activées

**Fonctionnel**
- ✅ Contextuel par permissions
- ⚠ Pas de personnalisation utilisateur au-delà du drag-drop widgets

**Dette / simplification**
- ⚠ `useDashboard` + `useHomePage` — la séparation reste floue, à unifier sous un seul hook `useHomeTabs(moduleId)`
- 🔧 Amélioration : onboarding progressif — afficher un état "premier login" avec tour des modules

---

## 2. Tableau de bord

**Stats** : 13 widgets pré-définis, système de dashboard tabs par module.

**UI**
- Widget catalog + drag-drop en place, mais pas de preview avant ajout
- ⚠ Quelques widgets lancent des Traceback dashboard_service (bug connu `capacity_heatmap`)

**Fonctionnel**
- ✅ Multi-tabs par module, permissions granulaires
- ⚠ Pas d'export PDF du dashboard
- ⚠ Pas de drill-down depuis les chiffres

**Dette**
- 🐛 `capacity_heatmap` throw en prod (visible dans backend logs)
- ⚠ Widget data provider manque d'un circuit-breaker — un provider en erreur tue tout le dashboard

**Simplification**
- 🔧 Uniformiser `WidgetCard` — actuellement chaque widget gère son propre skeleton + error state

---

## 3. Tiers

**Stats** : `TiersPage.tsx` **2067 lignes** (monolithe), 1 route backend.

**UI**
- Dashboard + liste + detail panel mélangés dans un seul fichier
- Formulaire de création très long (scrollable)

**Fonctionnel**
- ✅ Contact transfers, external refs, legal identifiers — couverture large
- ⚠ Pas de vue "graph" des relations (parent/filiale, partenaires)
- ⚠ Import CSV absent — à rapprocher de `ImportWizard`

**Dette**
- 🚨 **Monolithe 2067 lignes** — split en :
  - `TiersListPanel.tsx`
  - `TiersDashboardTab.tsx`
  - `TiersDetailPanel.tsx` (utilise `DynamicPanel`)
  - `TiersCreatePanel.tsx`

**Simplification**
- 🔧 Formulaire création → SmartForm wizard (3 steps : identité, adresse, métadata)

---

## 4. Projets

**Stats** : 11 fichiers, 7397 lignes. `ProjectDetailPanel.tsx` **2226 lignes**.

**UI**
- PageNavBar + panels + Gantt intégré
- ✅ Transfer de tâches entre projets

**Fonctionnel**
- ✅ Milestones, tasks, CPM, planner link
- ⚠ Pas de timeline visuelle globale (Roadmap) tous projets
- ⚠ Budgets/imputations non intégrés dans le detail project

**Dette**
- 🚨 `ProjectDetailPanel.tsx` à splitter : 4 onglets = 4 fichiers (`DetailsTab`, `TasksTab`, `MilestonesTab`, `TeamTab`)
- Pas de shared widget de progression (rebuild ad-hoc dans plusieurs places)

**Simplification**
- 🔧 Extraire `<ProjectProgressBar />` réutilisable (dashboard widget, detail, liste, ...)

---

## 5. Planner

**Stats** : 13 fichiers, 8579 lignes. `GanttView.tsx` **2093 lignes**.

**UI**
- Gantt custom + scenario-based planning (Sprint Phase 2)
- Revision requests en place

**Fonctionnel**
- ✅ Scénarios, revisions, capacity forecast
- ⚠ Drag-drop cross-scenario manuel (2 clics)
- ⚠ Heatmap capacity = widget buggy (voir Tableau de bord)

**Dette**
- 🚨 `GanttView.tsx` 2093 lignes — split :
  - `GanttCore.tsx` (rendu)
  - `GanttDependencies.tsx` (déjà séparé ✓)
  - `GanttInteractions.tsx` (drag, edit)
  - `GanttToolbar.tsx`

**Simplification**
- 🔧 Extraire la logique conflict-detection dans un hook `usePlannerConflicts()` — actuellement dispersée

---

## 6. PaxLog

**Stats** : 22 fichiers, 7119 lignes frontend. Backend `paxlog.py` 11,631 lignes (splitté récemment en subrouters via commit `b0d1238e` mais le reste pèse toujours).

**UI**
- `AdsDetailPanel.tsx` 1621 lignes — encore un monolithe malgré le split
- Signalements, rotations, ads, boarding — modules bien séparés en sous-routes

**Fonctionnel**
- ✅ Scan QR ADS via mobile, pax groups, incident reporting
- ⚠ L'interface boarding bureau ne montre pas le statut ramassage mobile en temps réel

**Dette**
- 🚨 Backend encore 11k lignes malgré le split — certaines fonctions ont plus de 200 lignes
- Plusieurs services redondants (`lookupCache`, `syncManifest`) pourraient être unifiés

**Simplification**
- 🔧 `AdsDetailPanel.tsx` → split par phase ADS (création, saisie pax, check-in, boarding, clôture)
- 🔧 `paxlog.py` backend → extraire `incidents/`, `pax/`, `rotations/` en fichiers séparés

---

## 7. TravelWiz

**Stats** : 21 fichiers, 4787 lignes. Backend 4494 lignes.

**UI**
- Voyage list + detail, manifests, weather provider dashboard

**Fonctionnel**
- ✅ Integration météo, vecteurs flight, manifests cargo
- ⚠ Pas de timeline multi-voyage
- ⚠ Cancel/reschedule workflow n'existe pas — tout passe par suppression + recréation

**Dette**
- Backend 4494 lignes en un fichier — à splitter comme paxlog
- Voyage ↔ vector ↔ manifest relationships ont 3 versions de requête presque-identiques

**Simplification**
- 🔧 Créer un service partagé `voyage_query_service.py` pour les jointures voyage+vector+pax+cargo

---

## 8. PackLog

**Stats** : 7 fichiers, 4144 lignes.

**UI**
- Cargo requests (LT), réception, scan assistant — tout déjà modulaire

**Fonctionnel**
- ✅ Staging polymorphique, imputations, tracking
- ⚠ Pas de workflow d'approbation multi-niveau pour cargo sensible

**Dette**
- Relativement sain par rapport aux autres modules
- Quelques helpers dupliqués avec travelwiz (weight/volume calculation)

**Simplification**
- 🔧 Extraire `packlog_shared.py` qui est déjà 1470 lignes — partager avec travelwiz au niveau volume/weight

---

## 9. Conformité

**Stats** : 17 fichiers, 3894 lignes. Backend 2165 lignes.

**UI**
- Rules CRUD + records + verifications = 3 surfaces UI
- ⚠ Navigation entre les 3 pas évidente

**Fonctionnel**
- ✅ Vérifications workflow, compliance types, rules engine
- ⚠ Pas de rappels email pour échéances de conformité
- ⚠ Pas de "matrice" vue globale (asset × compliance_type)

**Dette**
- Beaucoup de duplications schema (Record vs Rule ont 80% de champs identiques)

**Simplification**
- 🔧 Matrice grid view → produit **gros** impact UX
- 🔧 Unifier `record_schema` et `rule_schema` via héritage Pydantic

---

## 10. Assets

**Stats** : 1 fichier page (15 lignes — placeholder), logique dans `asset-registry/` (1579 lignes `DetailPanels.tsx`).

**UI**
- Hiérarchie asset visible en tree + liste plate
- ✅ Import KMZ avec rollback

**Fonctionnel**
- ✅ Import/export KMZ, hierarchy, scope on entity
- ⚠ Pas de carte visuelle interactive
- ⚠ Pas de link avec les imputations

**Dette**
- `AssetPage.tsx` vide (15 lignes) — page réelle = `AssetRegistryPage`
- DetailPanels.tsx 1579 lignes à splitter

**Simplification**
- 🔧 Une page `/assets` unique qui redirige vers asset-registry

---

## 11. Entités / Comptes

**Stats** : Small modules, admin only.

**UI**
- CRUD simples, peu de UX research

**Fonctionnel**
- ✅ Multi-tenant via entity_id, membership groups
- ⚠ Pas de vue "audit trail" par entité

**Dette**
- Minimal

**Simplification**
- 🔧 Merger avec settings → "Paramètres → Administration → Entités"

---

## 12. Support

**Stats** : 3 fichiers, 1769 lignes. `SupportPage.tsx` ~1200 lignes, avec le nouveau module agent IA (Sprint récent).

**UI**
- Tabs : Dashboard, Tickets, Announcements
- Ticket detail + Agent IA tab (Sprint 1-6 finalisé)

**Fonctionnel**
- ✅ Sync GitHub bidirectionnelle (Sprint 2)
- ✅ Agent IA autonomous maintenance (Sprint 1-6)
- ⚠ Pas de SLA tracking
- ⚠ Pas de satisfaction survey post-résolution

**Dette**
- `SupportPage.tsx` mélange List + Detail + Stats — à splitter

**Simplification**
- 🔧 Dashboard supervision agent (runs, coûts, success rate) — pas encore UI

---

## 13. Users

**Stats** : 1 fichier `UsersPage.tsx` **2790 lignes** — PIRE monolithe du projet.

**UI**
- Overview + Users + Groups + Roles tous dans le même fichier

**Fonctionnel**
- ✅ RBAC, groupes, rôles, delegation, identity documents, medical
- ⚠ Pas de bulk edit

**Dette**
- 🚨 **2790 lignes** — split en 4 fichiers minimum :
  - `UsersOverviewTab.tsx`
  - `UsersListPanel.tsx`
  - `UsersGroupsPanel.tsx`
  - `UsersRolesPanel.tsx`
- Lots d'éléments UI dupliqués (form sections répétées)

**Simplification**
- 🔧 Un composant `<UserProfileSection title icon>` réutilisable pour toutes les sections de profil (identity, medical, driving, etc.)

---

## 14. Papyrus

**Stats** : 3 fichiers, `PapyrusCorePage.tsx` **2675 lignes**.

**UI**
- Workflow de documents, signatures, distribution lists
- Editor form builder intégré

**Fonctionnel**
- ✅ Revisions, signatures électroniques, distributions, dispatches
- ⚠ Pas de viewer PDF inline
- ⚠ Search dans les documents absent

**Dette**
- 🚨 2675 lignes à splitter

**Simplification**
- 🔧 Éclater par rôle : `DocumentListPage`, `DocumentEditorPage`, `DistributionPage`, `SignaturePage`

---

## 15. MOC

**Stats** : 4 fichiers, 3203 lignes. `MOCDetailPanel.tsx` 1766 lignes. Backend 2092 lignes.

**UI**
- ✅ Export PDF (templates Jinja2 + WeasyPrint déjà fonctionnel)
- Detail panel complet avec matrice de validation

**Fonctionnel**
- ✅ Full workflow MOC paper form (rev. 06 Octobre 2025)
- ⚠ Pas de notification email "MOC en attente d'approbation"

**Dette**
- `MOCDetailPanel.tsx` 1766 lignes — splitter par phase (demande, revue, étude, validation, exécution)

**Simplification**
- 🔧 Éclater en `MOCDemandeTab`, `MOCRevueTab`, etc.

---

## 16. Workflow

**Stats** : 6 fichiers, 3099 lignes.

**UI**
- Visual flow editor
- ⚠ UX avancée mais peu découvrable

**Fonctionnel**
- ✅ FSM engine, transitions, validations
- ⚠ Pas de test "dry run" d'un workflow avant publication

**Dette**
- Pas de gros monolithe ici, bien découpé

**Simplification**
- 🔧 Ajouter "dry-run" : simuler une instance avec données fictives

---

## 17. PID/PFD

**Stats** : 1 fichier `PidPfdPage.tsx` **2001 lignes**.

**UI**
- Éditeur graphique tuyaux + flow
- Assez spécifique au métier

**Fonctionnel**
- ✅ Drawing + data binding
- ⚠ Pas d'import depuis format standard (DEXPI, AutoCAD)

**Dette**
- 🚨 2001 lignes à splitter (Editor / Toolbar / SidePanel)

**Simplification**
- Similaire planner : extraire logique drag dans hook

---

## 18. Settings / Paramètres

**Stats** : 50+ onglets, certains énormes (`RbacAdminTab.tsx` **2300 lignes**, `EditPdfTemplatePanel.tsx` **1687 lignes**).

**UI**
- Navigation arborescente entre groupes/sections — cohérent
- ✅ Shadcn + container queries

**Fonctionnel**
- ✅ Intégrations (Sprint 1), PDF/Email templates, i18n, permissions
- ⚠ Pas de diff visible avant save pour templates
- ⚠ Pas d'export/import de toute la config entité (disaster recovery)

**Dette**
- `RbacAdminTab.tsx` 2300 lignes — split urgent par section (roles, permissions, groups, overrides)
- `EditPdfTemplatePanel.tsx` 1687 lignes — workflow preview+edit+publish à éclater

**Simplification**
- 🔧 `SettingsSearch` — barre de recherche transverse à travers tous les settings

---

## Synthèse transverse

### Top 5 dettes techniques à traiter en priorité

1. 🚨 **Monolithes frontend** — 11 fichiers > 1500 lignes. Règle : split systématique quand un fichier dépasse 800 lignes.
   - `UsersPage.tsx` (2790) — le pire
   - `PapyrusCorePage.tsx` (2675)
   - `RbacAdminTab.tsx` (2300)
   - `ProjectDetailPanel.tsx` (2226)

2. 🚨 **paxlog.py backend** — 11,631 lignes encore malgré split précédent. Finaliser l'extraction en sous-routers.

3. 🐛 **`capacity_heatmap` widget** — throw en prod à chaque dashboard render. Fix ou disable.

4. ⚠ **Duplication schema** — Record vs Rule en conformité, voyage/vector dans travelwiz. Consolider via Pydantic héritage.

5. ⚠ **Assets page 15 lignes placeholder** — redirect vers asset-registry ou supprimer.

### Top 5 améliorations fonctionnelles impactantes

1. 🎯 **Matrice conformité (asset × compliance_type)** — gros gain UX, simple à coder.

2. 🎯 **Dashboard supervision agent IA** (`/admin/support/agent`) — métriques runs / coûts / success rate. Mentionné dans spec Sprint mais UI pas shippée.

3. 🎯 **SLA Support + satisfaction post-résolution** — pro feature, 1 jour de dev.

4. 🎯 **Search transverse dans Settings** — 50+ onglets = un barre de recherche est critique.

5. 🎯 **Viewer PDF inline dans Papyrus** — pour l'instant télécharge pour voir.

### Top 5 simplifications UX

1. 🔧 **SmartForm wizard** appliqué aux 3 formulaires long (Tiers create, User create, Settings provider) — réduction mental load.

2. 🔧 **Composants génériques** : `<ProgressBar>`, `<UserSection>`, `<WidgetCard>`, `<CritBadge>` — déjà éparpillés ad-hoc.

3. 🔧 **Diff viewer dans Edit PDF/Email Template** — voir quoi change avant publier.

4. 🔧 **Dry-run Workflow** — tester une transition sans créer d'instance réelle.

5. 🔧 **Onboarding progressif** sur HomePage — tour guidé pour nouveaux users.

### Top 3 patterns à standardiser

1. **Panel Layout** : `PanelContentLayout` déjà existant — forcer son usage partout (j'ai migré 5 panels dans les sprints récents, reste ~20).

2. **Permission gating** : pattern `const canFoo = hasPermission('x.y.z')` dispersé. Wrapper HOC `<IfPerm>` serait plus lisible.

3. **Data fetching** : mélange entre `useQuery` direct et hooks custom. Tout wrapper dans `useX()` hook dédié par ressource.

### Dette infra

- **Docker images 3 separate CI workflows** (agent-runner, agent-worker, playwright-runner) — les unifier en un workflow matrix saverait minutes/mois de GHA quota.
- **Alembic heads** actuellement 148 puis 149-153 — surveiller que les merges ne recréent pas de multi-heads.
- **Frontend bundle** : le main bundle `index-*.js` pèse 590 KB (visible dans logs frontend). Potential pour lazy loading par module.

### Scoring global

| Dimension | État | Commentaire |
|-----------|------|-------------|
| Cohérence UI | 7/10 | SmartForm + PanelContentLayout améliorent vite |
| Couverture fonctionnelle | 9/10 | Ops terrain, doc, workflow — presque tout est là |
| Dette technique | 5/10 | Monolithes récurrents, backend fichiers géants |
| Tests | 3/10 | Peu visible (estimation — à auditer) |
| Observabilité | 7/10 | Sentry + logs structurés OK |
| Mobile | 8/10 | App Expo complète, 35 écrans, offline-first |
| Agent IA | 8/10 | Sprints 1-6 shippés, reste config utilisateur |

### Verdict

OPSFLUX est en **bonne santé fonctionnelle** avec une **dette UI concentrée** sur ~10 fichiers monolithiques. 2 semaines de refactoring ciblé (1 monolithe par jour) suffiraient à ramener le projet à un état "easy-to-contribute-to" pour un potentiel passage open-source.

Les features agent IA (Sprints 1-6) sont maintenant **supérieures au reste du projet en maturité** — c'est une anomalie de cadence à niveler sur les autres modules.
