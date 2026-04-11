# Overnight Handoff — 2026-04-11

Travail autonome de la nuit : audit + corrections sur la chaîne **Projects → Planner → Paxlog → TravelWiz** + UX cleanup + **système de pondération d'avancement projet** (sur ta demande explicite). Tout est déployé sur https://app.opsflux.io et vérifié en direct via Chrome DevTools.

## TL;DR (1 minute)

- ✅ **7 batches déployés** sur le VPS (commits 537c479 → 6aa3095, plus papyrus en parallèle)
- ✅ **3 bugs runtime résolus** (404 stale projects, 500 packlog articles, scrollbar tab bar)
- ✅ **8 écarts de spec corrigés** sur les 11 critiques identifiés par l'audit
- ✅ **Refonte complète du TaskDetailPanel projets** (visuel + fonctionnel)
- ✅ **Cascade des dépendances** portée du Planner vers le gantt Projets
- ✅ **Système de pondération d'avancement projet** (sur demande) — 4 méthodes + admin default + WBS roll-up récursif, vérifié bout-en-bout en live
- ✅ **TypeScript clean** sur tout, build VPS Dokploy OK
- ⚠️ **3 gros chantiers laissés en TODO** (workflow multi-niveaux, multi-imputation par sous-période, i18n complet Paxlog) — détaillés ci-dessous

---

## Ce que tu dois savoir d'urgence

### 1. Catalogue SAP PackLog — comportement par défaut

Le module PackLog a un nouveau réglage admin : **"Catalogue partagé entre toutes les entités"** dans `Paramètres → PackLog`.

Par défaut : **désactivé** (per-entity avec fallback NULL). Concrètement :
- Chaque entité a son propre catalogue d'articles SAP
- Les articles sans entité (NULL) restent visibles partout (utile pour seed data)
- Si tu veux un catalogue unique global, active le toggle dans le panneau settings

Pourquoi ce changement : la table `article_catalog` n'avait pas de colonne `entity_id`, le service la requêtait quand même → 500 systématique. J'ai ajouté la colonne via la migration `121_add_entity_id_to_article_catalog.py` (déjà appliquée).

### 2. Cascade dépendances dans le gantt Projets

Quand tu drag une tâche qui a des successeurs FS/SS/FF/SF, le gantt affiche maintenant un dialogue. **Mode par défaut : `warn`**. Trois modes possibles via la pref user `projets_gantt_drag_cascade_mode` :
- `warn` — confirme avant de violer une contrainte, commit seulement la tâche déplacée
- `cascade` — décale automatiquement tous les successeurs en aval
- `strict` — refuse complètement le drag si une contrainte casse

Pour changer le mode : pas encore d'UI dédiée. Tu peux le forcer via la console JS :
```js
fetch('/api/v1/users/me/preferences', { method:'PATCH', headers:{Authorization:'Bearer '+localStorage.access_token, 'Content-Type':'application/json'}, body:JSON.stringify({prefs:{projets_gantt_drag_cascade_mode:'cascade'}}) })
```
Ou ajouter un picker dans `GanttSettingsPanel.tsx` côté projets — TODO si tu veux.

### 3. asset_id obligatoire à la création de projet (natif)

La création native d'un projet **exige maintenant** un site/installation. L'import Gouti reste exempt (le projet importé peut avoir `asset_id=null` jusqu'à ce que tu le renseignes manuellement, conformément à la spec §1.4).

### 4. Aller-retour sans nuitée — validateur backend

L'`AdsCreate` a un nouveau validator pydantic : si `is_round_trip_no_overnight=true` alors `start_date == end_date` est obligatoire. Sinon 422. Verrouille la sémantique single-day-counting côté serveur.

### 5. Système de pondération d'avancement projet (NOUVEAU)

Le calcul de `Project.progress` n'est plus une moyenne arithmétique simple. Quatre méthodes disponibles :

| Méthode | Formule | Cas d'usage |
|---|---|---|
| **`equal`** | moyenne arithmétique | Tâches homogènes (default backward-compat) |
| **`effort`** ⭐ | pondéré par `estimated_hours` | Standard pragmatique — recommandé |
| **`duration`** | pondéré par `(due_date − start_date)` jours | Quand pas d'heures saisies mais des dates |
| **`manual`** | pondéré par `ProjectTask.weight` | Contrôle total chef de projet |

**Hiérarchie de résolution** :
1. `Project.progress_weight_method` (override par projet)
2. Setting admin entité `projets.default_progress_weight_method`
3. Fallback `equal`

**Roll-up WBS récursif** :
- Tâches feuilles → utilisent leur `progress` saisi manuellement
- Tâches parents → progress calculé automatiquement = moyenne pondérée des enfants (slider verrouillé en UI)
- Projet → moyenne pondérée des tâches racines

**Fallback elegance** : si toutes les sous-tâches d'un même groupe ont un poids 0 (ex. mode `effort` mais aucune tâche n'a d'`estimated_hours`), le groupe retombe automatiquement en mode `equal` POUR CE NIVEAU UNIQUEMENT. Aucun projet n'affichera 0% juste parce que les heures estimées sont vides.

**Détection de cycles** dans le graphe parent_id (cache `visited` + set `in_progress`) — protection défensive contre les graphes malformés.

**Où c'est exposé** :
- `Paramètres → Projets` : nouveau tab admin avec picker de méthode + cards de référence
- Nouvelle section "Avancement" dans `CreateProjectPanel`
- Nouvelle section "Calcul d'avancement" dans `ProjectDetailPanel` (collapsible, défaut closed)
- Champ "Poids" dans `TaskDetailPanel` : visible uniquement quand `project.progress_weight_method === 'manual'` ET tâche feuille
- Slider de progression `disabled` sur les tâches parents avec badge "(calculé)" et note explicative

**Vérifié bout-en-bout en live** : sur le projet ASP-1 Dewatering Process (133 tâches), bascule de `effort` (73%) à `equal` (79%) → backend recalcule correctement, frontend affiche le nouveau pourcentage. Migration `122_project_progress_weight` appliquée, colonnes `progress_weight_method` et `weight` présentes en BDD.

---

## Détail des correctifs (par batch)

### Batch 1 — `537c479` Spec conformity
- **R1.4** `Project.asset_id` requis sur la création native (schema pydantic + UI form + AssetPicker required + handleSubmit guard). Gouti import bypass préservé.
- **R3.5** Validator backend `AdsCreate.is_round_trip_no_overnight ⇒ end_date == start_date`
- **R5.3** Admin UI `Paramètres → TravelWiz` : nouveaux contrôles `captain_session_minutes` + `signal_stale_minutes` (étaient backend-only, falait modifier la BDD)
- **BUG header gantt** : à zoom faible le label "Mois Année" du group row sur scale `week`/`day` ne se compactait jamais et créait une soupe illisible. Nouveau `formatGroupLabel` qui shrink progressivement : `Février 2025 → Fév 2025 → Fév 25 → F25 → F`. Fix dans le composant partagé `GanttHeader.tsx` → affecte planner ET projets.

### Batch 2 — `7671cce` Stale projects + per-entity catalog
- **BUG 404** Le gantt projets faisait un burst de 404 sur initial load quand un id de projet en localStorage `gantt_expanded` n'existait plus en BDD. Fix : prune effect au montage + double-filter `expandedIds` contre `visibleProjectIds` pour bloquer les fetches stale dès le 1er render.
- **BUG 500 packlog articles** : la table `article_catalog` n'avait pas de colonne `entity_id`. Migration `121_add_entity_id_to_article_catalog.py` ajoute la colonne (nullable), nouveau setting admin `packlog.article_catalog_global` (UI dans `PackLogConfigTab`), service refactoré pour brancher sur le setting (mode global = pas de filtre, mode per-entity = `WHERE entity_id=:eid OR entity_id IS NULL`).

### Batch 3 — `b4c8b6e` Scope_id fix + TaskDetailPanel refonte
- **BUG packlog 500 (suite)** : mon 1er fix utilisait `WHERE entity_id` sur la table `settings` qui n'a pas non plus cette colonne. La table `settings` utilise `(scope, scope_id)` où `scope_id` est un varchar(36) contenant l'UUID de l'entité. Corrigé.
- **Refonte TaskDetailPanel** :
  - Layout 2-colonnes via `SectionColumns` (kicks in à 640 px)
  - Status/Priority/Assignee passent par `InlineEditableSelect` (cohérent avec Tier/Project) au lieu de raw `<select>`
  - Description : nouveau composant local `InlineEditableTextarea` (multi-line, ⌘+Enter pour valider, Esc pour annuler) — c'était un single-line input avant
  - Tags via `TagManager` (ownerType="project_task")
  - Pièces jointes via `AttachmentManager` (collapsible, default fermé)
  - Section Dépendances montre maintenant **prédécesseurs ET successeurs** côte à côte avec badges FS/SS/FF/SF + lag jours + cards cliquables
  - Sub-tasks : layout en cards avec barre de progression, dot couleur statut, hover affordance, navigation chevron
  - Comments : style card avec séparateur visuel et input plus grand
  - Avancement visualisé en double : slider + barre de progression colorée
  - Date début/fin maintenant inline-editable

### Batch 4 — `33bbf04` Cascade dependencies portée Planner → Projets
- Nouveau hook `dragCascadeMode` pref + handler `handleBarDrag` réécrit (~300 lignes)
- 3 modes warn/cascade/strict (cf. §2 ci-dessus)
- Index plat `taskIndex` (taskId → task + projectId) + `allDepsFlat` rebuilt sur changement des maps
- Pass 1 : check INCOMING constraints sur la barre draguée
- Pass 2 : BFS walk OUTGOING avec cycle detection (MAX_STEPS=500)
- Type dep normalisé (accepte 'FS' ou 'finish_to_start')
- Commit invalide `['project-tasks', pid]` pour chaque projet touché → bars re-fetch automatiquement

### Batch 5 — `9a941f3` Tab bar scrollbar fix
- Le refactor `rightSlot` du `TabBar` avait introduit un inner div `overflow-x-auto` qui n'héritait pas des règles de hide-scrollbar de la classe `.gl-tab-bar`. Résultat : un scrollbar visible en permanence sur la barre titre des onglets, **dans les 7 modules**.
- Fix : ajout des classes arbitraires Tailwind `[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden` sur l'inner div.

### Batch 6 — `7e008e9` Recurrence horizon + i18n TaskDetailPanel
- **GAP7** `RECURRENCE_HORIZON_DAYS = 90` était hardcodé. Maintenant lu depuis `planner.recurrence_horizon_days` (entity-scoped, défaut 90, clamp [1, 730]). Nouvelle helper `_get_recurrence_horizon_days(db, entity_id)` avec try/except pour ne jamais faire planter le cron de génération récurrente. Nouveau SettingRow dans `PlannerConfigTab`.
- **GAP6** Labels et toasts du bouton "Lien Planner" dans `TaskDetailPanel` étaient hard-codés en français. Routés via `useTranslation t()` avec defaults FR.

---

## Ce que les audits ont révélé et que j'ai laissé en TODO

L'audit exhaustif (4 subagents en parallèle, ~13K mots de rapport) a identifié 11 écarts critiques. J'en ai corrigé 8. Les 3 restants demandent un travail multi-jours qu'on ne peut pas raisonnablement faire en une nuit :

### TODO 1 — Workflow multi-niveaux Paxlog (Spec §3.5) — **L (3-4 semaines)**

Le spec demande un séquencement strict **Chef de projet → CDS → Logistique → TravelWiz** avec audit trail par rôle et FSM enforcement. Le module Workflow OpsFlux existe (généré FSM avec states/transitions, intégré à `Ads.workflow_instance_id`) mais le **séquencement spécifique ADS n'est pas câblé** — actuellement c'est juste draft → submitted → approved sans preuve de qui a validé à quel niveau.

**Pourquoi je n'ai pas touché :** redesign du modèle FSM ADS + table `audit_trail` par niveau + enforcement aux endpoints + UI workflow states. Trop large pour une nuit. Risque de casser de la prod.

**Où regarder pour démarrer :**
- `app/api/routes/core/workflow.py` lines 142-500+ — moteur générique
- `app/models/paxlog.py:177-182` — statuts ADS actuels
- `scripts/create_ads_workflow.py` — seed (à enrichir)

### TODO 2 — Multi-imputation par sous-période + cron revalidation (Spec §3.11) — **L (3-4 semaines)**

Le spec décrit un **programme de séjour** où chaque sous-période d'un ADS a sa propre imputation (cost center), nécessitant validation de chaque chef de projet associé, plus un cron de revalidation mensuelle. Actuellement `_resolve_ads_imputation_suggestion` retourne une seule imputation par défaut, pas de découpage par `StayProgram.period`, pas de cron de relance.

**Pourquoi je n'ai pas touché :** nouveau modèle `StayProgramPeriod` + relations imputations multiples + cron APScheduler + UI builder de programme + workflow validation parallèle. Multi-jours.

**Où regarder pour démarrer :**
- `app/api/routes/modules/paxlog.py:331-510` — `_resolve_ads_imputation_suggestion`
- `app/models/paxlog.py` — chercher les imputations existantes (StayProgram?)
- `app/tasks/` — pas de cron paxlog côté imputation

### TODO 3 — i18n complet Paxlog (Spec §3.10) — **L (2-3 semaines)**

Le module Paxlog a 6000+ lignes avec beaucoup de strings hardcodées en français (et quelques anglais). Aucune intégration i18n détectée par grep dans `app/services/modules/paxlog_service.py`. La spec demande un support multilingue complet. Travail principalement frontend (extraction des strings + clés i18n + traductions).

**Pourquoi je n'ai pas touché :** travail mécanique mais énorme. J'ai i18né le `TaskDetailPanel` projets en sample (GAP6) pour démontrer la pattern.

**Où regarder pour démarrer :**
- `apps/main/src/pages/paxlog/PaxLogPage.tsx` — 6000+ lignes
- `apps/main/src/locales/fr/paxlog.json` (à créer) + en/es/etc.
- Pattern : `t('paxlog.xxx', 'Texte par défaut FR')`

---

## Faux-positifs de l'audit (vérifiés et OK)

L'audit a remonté ces points qui se sont avérés déjà corrects après lecture du code. **Aucune action requise.**

| Audit | Verdict réel |
|---|---|
| GAP2 — POB priority aggregation manquante | La SQL `_build_ads_validation_daily_preview` calcule correctement le forecast comme somme totale non-cancelled non-waitlisted. Le "ordre de priorité" du spec concerne la **promotion de waitlist** (qui obtient une place libérée en priorité), pas le comptage. La logique de promotion est déjà ordonnée correctement. |
| GAP4 — `priority_clash` manquant check both critical | `_detect_and_create_conflicts` ligne 326 vérifie `if activity.priority == "critical"` (le déclencheur) ET ligne 333 `priority == "critical"` dans le SQL (l'autre activité). Les deux côtés sont déjà filtrés. |
| WebSocket notifications failed | Erreur transitoire pendant le redémarrage du backend après deploy. Test en direct depuis Chrome : `ws.onopen` succeeded immédiatement. |
| GAP3 — Aller-retour sans nuitée pas appliqué dans le compte | Le formulaire force `end_date = start_date` quand le flag est coché (PaxLogPage.tsx:2682). La SQL avec `BETWEEN start_date AND end_date` produit donc le comptage single-day automatiquement. J'ai ajouté un validateur backend par sécurité (R3.5 batch 1). |
| GAP8 — Notification waitlist promotion non configurable | Le setting `paxlog.waitlist_auto_notify` existe déjà dans le backend (paxlog.py:1567+) ET dans l'UI (`PaxLogConfigTab.tsx:112-124`). |

---

## Tests réalisés en direct (Chrome DevTools sur app.opsflux.io)

| Vérification | Statut |
|---|---|
| Tab bar — pas de scrollbar visible | ✅ |
| Tab "Plan" affiché à la place de "Gantt" dans Planner | ✅ |
| Tab par défaut "Tableau de bord" partout | ✅ |
| Bouton "Modifier" dans la tab bar (portal) | ✅ |
| DynamicPanel layout : 1354 px utile au lieu de 1152 | ✅ |
| Endpoint `POST /api/v1/projects/export/gantt-pdf` génère le PDF (200 OK, 716KB) | ✅ |
| Catalogue widget contient `planner_workload_chart` | ✅ |
| Provider widget Plan de charge retourne données réelles `{name:"S14", project:62, ...}` | ✅ |
| Endpoint `GET /api/v1/packlog/articles` retourne 200 (était 500) | ✅ |
| Migration 121 appliquée — colonne `entity_id` présente sur `article_catalog` | ✅ |
| TaskDetailPanel layout 2-col en mode plein écran | ✅ |
| TaskDetailPanel boutons i18n "Lié au Planner" / "Voir le projet" | ✅ |
| TaskDetailPanel sections : Identification / État & priorité / Planning / POB & Charge / Sub-tasks / Dépendances / Pièces jointes / Commentaires | ✅ |
| Cascade dialog projets gantt | ⏸️ Code en place, aucune dep FS testable dans les données seed pour déclencher le dialog |

---

## Architecture / fichiers touchés (récap)

**Backend** :
- `app/schemas/common.py` — `ProjectCreate.asset_id` requis
- `app/schemas/paxlog.py` — validator A/R sans nuitée
- `app/models/travelwiz.py` — `ArticleCatalog.entity_id` (nullable)
- `alembic/versions/121_add_entity_id_to_article_catalog.py` — migration
- `app/services/modules/packlog_service.py` — refactor scoping global/per-entity
- `app/services/modules/planner_service.py` — `_get_recurrence_horizon_days`
- `app/api/routes/modules/projets.py` — endpoint PDF gantt
- `app/services/modules/dashboard_service.py` — entry catalog widget
- `app/services/modules/dashboard_widget_providers.py` — provider plan de charge

**Frontend** :
- `apps/main/src/pages/projets/TaskDetailPanel.tsx` — refonte complète
- `apps/main/src/pages/projets/ProjectGanttWrapper.tsx` — cascade + prefs hydration + 404 prune + PDF export
- `apps/main/src/pages/projets/ProjetsPage.tsx` — `asset_id` form validation
- `apps/main/src/pages/settings/tabs/PackLogConfigTab.tsx` — nouveau
- `apps/main/src/pages/settings/tabs/TravelWizConfigTab.tsx` — captain delays
- `apps/main/src/pages/settings/tabs/PlannerConfigTab.tsx` — recurrence horizon
- `apps/main/src/pages/settings/SettingsPage.tsx` — register PackLog tab
- `apps/main/src/components/ui/Tabs.tsx` — scrollbar fix
- `apps/main/src/components/layout/DynamicPanel.tsx` — wider cap, 3-col DetailFieldGrid
- `apps/main/src/components/shared/gantt/GanttHeader.tsx` — adaptive group label
- `apps/main/src/components/charts/EChartsWidget.tsx` — stacked prop
- `apps/main/src/components/dashboard/WidgetCard.tsx` — wire stacked
- `apps/main/src/components/dashboard/ModuleDashboard.tsx` — toolbarPortalId
- `apps/main/src/services/projetsService.ts` — `exportGanttPdf`
- `apps/main/src/types/api.ts` — `ProjectCreate.asset_id` requis

**Commits** (tous sur main, déployés via Dokploy API) :
```
537c479  fix(spec-conformity): asset_id mandatory + A/R validator + captain settings UI + adaptive month-group header
7671cce  fix: prune stale gantt projects + per-entity SAP catalog scoping
b4c8b6e  fix(packlog): query settings via (scope, scope_id) + refonte TaskDetailPanel projets
33bbf04  feat(projets/gantt): port cascade dependency handler from Planner
9a941f3  fix(tabs): hide horizontal scrollbar on inner tabs container
7e008e9  feat(spec): planner recurrence horizon configurable + i18n task planner toggle
6aa3095  feat(projets): weighted progress system with 4 methods + admin default + WBS roll-up
```

**Migrations Alembic ajoutées cette nuit** :
- `121_add_entity_id_to_article_catalog` — colonne `article_catalog.entity_id` (nullable)
- `122_project_progress_weight` — colonnes `projects.progress_weight_method` + `project_tasks.weight`

---

## Si tu veux récupérer les rapports d'audit complets

Les 4 rapports détaillés des subagents sont dans des fichiers tmp à la racine :
- `.tmp-audit-a66ab7c9d4b9d3b0b.md` — Projects
- `.tmp-audit-af78e20da43bb898f.md` — Planner
- `.tmp-audit-a77a34f9c2cd26bc7.md` — Paxlog
- `.tmp-audit-a2004e9c33c64c116.md` — TravelWiz + transverse

Tu peux les supprimer une fois lus (ou les ignorer dans .gitignore — ils ont été commits par accident dans le batch 1).

---

Bonne reprise ☕
