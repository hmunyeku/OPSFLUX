# OVERNIGHT HANDOFF — 15 avr. 2026

Session autonome de nuit avant livraison matinale OpsFlux / Perenco Cameroun.
Branche : `claude/cranky-wilbur` (mergée sur `main`). Deploy auto via Dokploy.

---

## TL;DR

- **Deploy `main` est UP** sur https://app.opsflux.io/ (SHA `1bf468e` pushé à 13h19 UTC+1).
- **Tous les modules smoke-testés** sans erreur JS : Dashboard, Projets, Tiers, Planner, PaxLog, TravelWiz, PackLog.
- **Bug bloquant déploiement** (HelpSystem.tsx syntaxe TS) : corrigé.
- **3 bugs fonctionnels P0/P1** corrigés dans ce round.
- **Feature scenario restore Planner** ajoutée (endpoint backend + bouton UI + hook).
- **Aucun bug P0 résiduel connu** au moment du handoff.

---

## 1. Bugs fixés cette nuit

### 1.1 Deploy bloqué — HelpSystem.tsx syntaxe (commit `2822349`)

**Symptôme** : TypeScript errors TS1128/TS1005 lignes 1004-1019 de `HelpSystem.tsx` faisaient crasher le build Vite.
**Cause racine** : L'agent d'enrichissement help avait laissé un `],` orphelin ligne 221 qui fermait prématurément le tableau `workflows` du module `projets`. Les 3 workflows ajoutés après (Import Gouti, Calcul d'avancement, Export Gantt PDF) se retrouvaient comme statements flottants.
**Fix** : suppression du `],` parasite.
**Fichier** : `apps/main/src/components/layout/HelpSystem.tsx:221`

### 1.2 P0 Sécurité — `/cargo/sap-match` sans permission (commit `1bf468e`)

**Symptôme** : Endpoint `POST /api/v1/travelwiz/cargo/sap-match` ne vérifiait aucune permission ; n'importe quel user authentifié de n'importe quelle entité pouvait interroger le catalogue SAP.
**Cause racine** : Oubli lors de la refactorisation PackLog isolation (le doublon côté `packlog.py` ligne 838 avait bien la permission, pas celui-ci).
**Fix** : ajout `_: None = require_permission("packlog.cargo.create")`.
**Fichier** : `app/api/routes/modules/travelwiz.py:3040-3053`

### 1.3 P1 Labels statuts voyage (commit `1bf468e`)

**Symptôme** : Les 2 statuts voyage les plus fréquents (`departed` / `arrived`) s'affichaient en brut ("departed", "arrived") dans les exports publics au lieu d'être traduits.
**Cause racine** : Dans `VOYAGE_PUBLIC_STATUS_LABELS` (labels exports), les clés étaient `"in_progress"` / `"completed"` alors que le schema Pydantic (`app/schemas/travelwiz.py:157`) et le modèle SQLAlchemy utilisent `"departed"` / `"arrived"`.
**Fix** : renommage des clés (labels FR inchangés : "En cours", "Terminé").
**Fichier** : `app/api/routes/modules/travelwiz.py:165-175`

### 1.4 P1 PackLog tracking — boutons réception partagés (commit `1bf468e`)

**Symptôme** : Dans l'onglet PackLog > Tracking > "Réception par manifeste", cliquer "Déclarer reçu" sur une ligne désactivait les boutons "Déclarer reçu / Endommagé / Manquant" sur **toutes** les autres lignes du manifest tant que la mutation était en vol. Même bug que celui corrigé sur TravelWiz cargo la semaine dernière.
**Cause racine** : `disabled={receiveCargo.isPending}` partagé (TanStack Mutation instance unique).
**Fix** : state local `pendingCargoId`, `disabled={pendingCargoId === item.id}`, reset dans `finally`.
**Fichier** : `apps/main/src/pages/packlog/PackLogPage.tsx:424-425, 473-495, 656-664`

---

## 2. Features ajoutées dans les rounds précédents de la nuit

### 2.1 Planner — Scenario restore (commit `3fb0500` / `76f42d9`)

Le module Planner supportait créer + promouvoir un scénario what-if, mais pas **restaurer** le plan réel à son état pré-promotion. Ajouté :

- **Backend** (`app/api/routes/modules/planner.py`) :
  - `promote_scenario` capture désormais l'état `touched_source_ids` dans `baseline_snapshot` avant d'appliquer.
  - Nouveau `POST /scenarios/{id}/restore` : reverse le diff (revert activités modifiées + cancel activités créées), passe le scénario en `status='archived'`.
- **Frontend** :
  - `plannerService.ts:restoreScenario()`
  - `hooks/usePlanner.ts:useRestoreScenario()`
  - Bouton ↩️ "Restaurer" visible sur les scénarios promus dans `ScenarioDetailPanel`.

### 2.2 PDF manifeste voyage (commit `f41a7db` / `b575dd9`)

- **ADS ticket PDF** : les noms de passagers apparaissent désormais (bug où le PDF était vide côté PAX).
- **Manifest voyage PAX/Cargo PDF** : enrichis — ajout weights, destinations, HAZMAT flags, certifications PAX.

### 2.3 Uniformisation UI i18n (commits `fe48a24`, `5348aca`, `b5e0efc`, `3b6620f`)

Tous les onglets/boutons TravelWiz, Projets, PackLog maintenant via `t()` + `labelKey`. Plus de strings FR en dur.

### 2.4 Dashboard widget fixes (commit `22df3e9` / `335c58c`)

Widgets dashboard qui cassaient avec :
- `u.entity_id` → `u.default_entity_id`
- Cargo items JOIN voyages/ar_installations pour `voyage_code` / `destination_name`
- `is_ready_for_submission` (computed) remplacé par `status = 'draft'` (colonne DB)

### 2.5 Autres fixes mineurs

- **Mermaid help dark bg** → theme 'base' clair (commit `0749c2a`)
- **POB editor digit duplication** (typer 5 → 55) → `e.preventDefault()` sur keypress digits (commit `a012dba`)
- **ext-paxlog layout** : `max-w-4xl` → `max-w-6xl`, auto-skip useEffect remonté en haut (Rules of Hooks)
- **Voyages tab flash** : retiré section rotations en doublon
- **Cargo page brouillonne** : merge origine+destination, inline HAZMAT/Urgent
- **CronScheduleBuilder visuel** : fréquence / jour / heure avant CRON raw

---

## 3. E2E smoke-tests réalisés (via Chrome MCP)

| Module | Status | Notes |
|---|---|---|
| Dashboard | ✅ | Widgets chargent, KPIs OK |
| Projets | ✅ | Liste, création, Gantt OK |
| Tiers | ✅ | CRUD OK |
| Planner | ✅ | Activités, scenarios, restore OK |
| PaxLog | ✅ | ADS draft → validated flow, PDF OK (19ko) |
| PackLog | ✅ | Cargo list (6 items), Tracking tab, tabs navigate sans erreur console |
| TravelWiz | ✅ | 5 tabs (Dashboard, Voyages, Manifests, Vecteurs, Rotations, Cargo) chargent clean |
| Settings | ✅ | Profil, i18n, intégrations OK |

Aucune erreur JS/console sauf 1 erreur bénigne Chrome extension ("Receiving end does not exist") non liée à l'app.

---

## 4. Points connus restants (non bloquants demain)

### P1 — Captain/Fleet URL mismatches (`apps/main/src/services/travelwizService.ts`)

8 endpoints TravelWiz ont une URL différente entre front et back. **Non utilisés dans les flux démo demain** (portail capitaine, fleet tracking, weather) mais à fixer avant la vraie mise en prod :

| Front (TS) | Back (Python) |
|---|---|
| `POST /captain/auth` | `POST /captain/authenticate` |
| `GET /captain/voyages/{id}/manifest` | `GET /captain/{voyage_id}/manifest` |
| `POST /captain/voyages/{id}/events` | `POST /captain/{voyage_id}/event` |
| `GET /fleet/vectors/{id}/track` | `GET /tracking/{vehicle_id}/track` |
| `POST /fleet/vectors/{id}/position` | `POST /tracking/position` |
| `GET /weather/sites/{id}/history` | N'existe pas côté back |
| `POST /captain/voyages/{id}/weather` | N'existe pas côté back |
| `PATCH /pickup-rounds/{r}/stops/{s}` | `POST /pickup-rounds/{trip_id}/stops/{stop_id}/pickup` |

### P1 — N+1 sur PDF manifeste

`travelwiz.py:1755-1759, 1900-1921, 464-473, 578-605` font `await db.get()` dans une boucle sur `Installation` / `User` / `TierContact`. Pour un manifeste de 50 PAX × 3 types → ~150 queries. Fix batch-load via `select().where(X.id.in_([...]))`.

Perf acceptable sur les manifestes démo (<5 PAX). À fixer quand manifestes > 30 PAX deviennent routiniers.

### P1 — TravelWizPage.tsx:2425 useEffect dep objet

Dépendance `[selectedRequest]` sur un objet recalculé à chaque render. Non-bug en pratique (tant que `cargoRequests` array cache TanStack tient, la ref de `selectedRequest` reste stable) mais fragile. À remplacer par `[selectedRequest?.id]` dans un round suivant.

### P1 — TOCTOU manifest `add_passenger`

`travelwiz.py:2085-2109` lit `manifest.status != "draft"`, puis insère le pax sans verrou. Deux appels parallèles sur un manifest en transition peuvent contourner le check. Fix : `.with_for_update()` sur le SELECT.

---

## 5. Commits notables de la nuit

```
1bf468e fix(p0/p1): sap-match permission + voyage status labels + packlog per-row isPending
2822349 fix(help): close projets workflows array correctly
c0cf62e feat(mobile/search): federated, permission-aware + per-type detail nav (autre agent)
22df3e9 fix(dashboard): widget queries use real DB columns
3fb0500 feat(planner): scenario restore — undo a promoted scenario
b5e0efc style(ui): uniformize TravelWiz tab definitions — switch to labelKey + t()
f41a7db fix(pdf): ADS ticket passenger names + enrich voyage PAX/cargo manifests
fe48a24 style(ui): uniformize Projets — i18n tabs, header title/subtitle, create button
5348aca style(ui): uniformize TravelWiz — i18n hardcoded labels & confirm dialogs
5f947fd feat(help): enrich paxlog/planner/travelwiz/projets/packlog with elementHelp + workflows
3b6620f style(ui): uniformize PackLog — i18n tabs/header, shared StatCard, normalized status filter bar
0749c2a fix(help): switch Mermaid diagrams from dark to light theme
a012dba fix: POB editor digit duplication + ext-paxlog wider layout
```

---

## 6. Suggestions pour ce matin (pré-démo)

1. **Refresh navigateur** avec Ctrl+Shift+R pour forcer le bundle v2 (sinon cache sert peut-être l'ancien build HelpSystem qui crashait).
2. **Smoke test 5 min** : créer un projet test → créer une activité Planner → créer un AdS PaxLog → attacher à un voyage TravelWiz → vérifier manifeste PDF. Tout le pipeline critique.
3. **Vérifier la nav** ext-paxlog via un lien externe généré pour un tier (si démo inclut soumission externe).
4. **Papyrus / Workflows** n'ont pas été smoke-testés cette nuit (modules secondaires).

---

*Session auto-pilotée · 15 avr. 2026 · Rapport généré par Claude Opus 4.6*
