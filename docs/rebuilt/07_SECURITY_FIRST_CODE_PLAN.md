# 07 Security First Code Plan

Date: 2026-04-03

## Objet

Plan d'exécution code priorisé, fichier par fichier, selon les arbitrages validés:

- sécurité d'abord
- Dashboard comme module plein
- permissions fines pilotées par rôles forts
- PaxLog opérationnel ce week-end

## 1. Ordre global

### Phase 1

Durcir le socle sécurité.

### Phase 2

Corriger les permissions de lecture et la cohérence des rôles sur les modules transverses.

### Phase 3

Réparer le contrat Dashboard backend/frontend.

### Phase 4

Fermer le chemin nominal PaxLog.

## 2. Phase 1 — socle sécurité

### P1.1 Stopper le seed dev automatique

Fichiers:

- [main.py](/app/main.py)
- [seed_service.py](/app/services/core/seed_service.py)

Objectif:

- ne plus lancer `seed_dev_data()` au démarrage normal
- réserver le seed à un mode explicite ou une commande dédiée

### P1.2 Durcir l'isolation tenant

Fichiers:

- [tenant.py](/app/core/middleware/tenant.py)
- [database.py](/app/core/database.py)
- [deps.py](/app/api/deps.py)

Objectif:

- supprimer la confiance directe dans `X-Tenant`
- empêcher le fallback permissif non maîtrisé
- lier plus explicitement tenant, user, entité et schéma

### P1.3 Durcir login / secrets / CAPTCHA

Fichiers:

- [config.py](/app/core/config.py)
- [login_security.py](/app/core/login_security.py)
- [auth.py](/app/api/routes/core/auth.py)

Objectif:

- refuser les secrets par défaut hors dev
- revoir les comportements `fail open`
- clarifier la politique CAPTCHA

## 3. Phase 2 — permissions de lecture et rôles forts

### P2.1 Tiers

Fichiers:

- [tiers.py](/app/api/routes/modules/tiers.py)
- [TiersPage.tsx](/apps/main/src/pages/tiers/TiersPage.tsx)

Objectif:

- ajouter `tier.read` sur toutes les routes de lecture pertinentes
- conserver `tier.update` et `tier.delete` pour les actions d'écriture
- vérifier que l'UI ne suppose pas d'accès implicite

### P2.2 Projets

Fichiers:

- [projets.py](/app/api/routes/modules/projets.py)
- [ProjetsPage.tsx](/apps/main/src/pages/projets/ProjetsPage.tsx)

Objectif:

- ajouter `project.read` sur toutes les lectures
- garder la granularité existante sur tâches, membres, deliverables, actions

### P2.3 Planner

Fichiers:

- [planner.py](/app/api/routes/modules/planner.py)
- [__init__.py](/app/modules/planner/__init__.py)
- [PlannerPage.tsx](/apps/main/src/pages/planner/PlannerPage.tsx)

Objectif:

- ajouter les permissions de lecture explicites sur les lectures
- aligner les permissions utilisées en route avec celles déclarées au manifest
- décider clairement du traitement des routes `capacity.update` et `priority.override`

## 4. Phase 3 — Dashboard comme module plein

### P3.1 Unifier le contrat API

Fichiers:

- [dashboard.py](/app/api/routes/core/dashboard.py)
- [dashboardService.ts](/apps/main/src/services/dashboardService.ts)
- [useDashboard.ts](/apps/main/src/hooks/useDashboard.ts)
- [DashboardPage.tsx](/apps/main/src/pages/dashboard/DashboardPage.tsx)

Objectif:

- choisir un seul contrat lisible
- arrêter les divergences `/dashboard/*` vs `/dashboards/*` côté client
- corriger `setHomeDashboard`
- clarifier tabs globales et tabs de module

### P3.2 Faire du Dashboard un socle transverse filtré

Fichiers:

- [dashboard.py](/app/api/routes/core/dashboard.py)
- [dashboard_widget_providers.py](/app/services/modules/dashboard_widget_providers.py)
- [DASHBOARD.md](/docs/rebuilt/modules/DASHBOARD.md)

Objectif:

- imposer permission + rôle sur chaque widget
- distinguer dashboard global et dashboards de module
- empêcher un insight d'exposer une donnée non accessible dans le module source

### P3.3 Finaliser la homepage hiérarchique

Fichiers:

- [dashboard.py](/app/api/routes/core/dashboard.py)
- services dashboard associés

Objectif:

- terminer la résolution `user > role > BU > global`
- enlever le `TODO` sur BU

## 5. Phase 4 — PaxLog week-end

### P4.1 Vérifier le nominal AdS

Fichiers:

- [paxlog.py](/app/api/routes/modules/paxlog.py)
- [paxlogService.ts](/apps/main/src/services/paxlogService.ts)
- [usePaxlog.ts](/apps/main/src/hooks/usePaxlog.ts)
- [PaxLogPage.tsx](/apps/main/src/pages/paxlog/PaxLogPage.tsx)

Objectif:

- profils PAX interne / externe
- AdS user/contact
- soumission
- approbation / rejet
- PDF si déjà branché

### P4.2 Vérifier le lien TravelWiz

Fichiers:

- [paxlog.py](/app/api/routes/modules/paxlog.py)
- [travelwiz_handlers.py](/app/event_handlers/travelwiz_handlers.py)
- [module_handlers.py](/app/event_handlers/module_handlers.py)

Objectif:

- confirmer l'événement émis
- confirmer l'ajout au manifeste ou la notification LOG_BASE
- confirmer les statuts visibles

### P4.3 Vérifier la compliance minimale

Fichiers:

- [paxlog.py](/app/api/routes/modules/paxlog.py)
- [conformite routes et UI](/app/api/routes/modules)
- [ConformitePage.tsx](/apps/main/src/pages/conformite/ConformitePage.tsx)

Objectif:

- garantir la décision minimale d'accès site exploitable par PaxLog

## 6. Points techniques à traiter sans ambiguïté

1. Toute route de lecture sensible doit avoir une permission explicite.
2. Tout widget dashboard doit hériter d'un contrôle d'accès explicite.
3. Aucun fallback silencieux ne doit masquer une erreur de sécurité ou de contrat.
4. Les rôles forts doivent être reconstruits comme agrégats contrôlés des permissions fines.
5. Les docs `rebuilt` doivent être mises à jour à chaque phase fermée.

## 7. Recommandation d'exécution immédiate

Ordre recommandé dès maintenant:

1. `app/main.py`
2. `app/core/middleware/tenant.py`
3. `app/core/login_security.py`
4. `app/api/routes/modules/tiers.py`
5. `app/api/routes/modules/projets.py`
6. `app/api/routes/modules/planner.py`
7. `app/api/routes/core/dashboard.py`
8. `apps/main/src/services/dashboardService.ts`
9. `apps/main/src/hooks/useDashboard.ts`
10. `apps/main/src/pages/dashboard/DashboardPage.tsx`
11. `app/api/routes/modules/paxlog.py`
12. `apps/main/src/services/paxlogService.ts`
13. `apps/main/src/hooks/usePaxlog.ts`
14. `apps/main/src/pages/paxlog/PaxLogPage.tsx`
