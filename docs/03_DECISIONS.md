# OpsFlux — Registre unifie des decisions architecturales

> **Ce fichier est LE registre autoritaire de toutes les decisions architecturales OpsFlux.**
> Claude Code lit ce fichier EN PREMIER avant tout developpement.
> Chaque decision ici prime sur tout autre document en cas de contradiction.
> Aucune decision n'est revisable sans consensus explicite.

---

# PARTIE 1 — DECISIONS CORE (D-001 a D-030)

Ces decisions s'appliquent a l'ensemble de la plateforme OpsFlux.

---

## D-001 — Multi-tenancy : 3 niveaux

**Decision** : OpsFlux implemente un modele multi-tenant a 3 niveaux : **Tenant** (schema PostgreSQL) > **Entite** (`entity_id`) > **BU/Departement**. Une entite = une filiale ou organisation (ex: Perenco Cameroun = `PER_CMR`).

**Implications** :
- Chaque tenant dispose de son propre schema PostgreSQL pour l'isolation des donnees
- Toutes les tables metier principales ont `entity_id UUID NOT NULL REFERENCES entities(id)`
- Toutes les requetes API filtrent systematiquement par `entity_id` de l'utilisateur connecte
- Le header HTTP `X-Entity-ID` selectionne l'entite active quand l'utilisateur en a plusieurs
- La dependency FastAPI `get_current_entity()` injecte l'entity_id dans chaque handler
- Les referentiels globaux sans entity_id : `credential_types`, `article_catalog`, `roles`, `voyage_event_types`
- Tables avec `entity_id` : `projects`, `activities`, `asset_capacities`, `activity_conflicts`, `ads`, `ads_pax`, `pax_profiles`, `pax_groups`, `compliance_matrix`, `pax_incidents`, `pax_rotation_cycles`, `stay_programs`, `vehicles`, `rotations`, `trips`, `pax_manifests`, `cargo_manifests`, `cargo_items`, `ai_anomalies`, `user_groups`, `departments`, `cost_centers`, `intranet_sync_config`, `sap_export_configs`

**Phase** : Core (v1)

---

## D-002 — ORM : SQLAlchemy 2.0 async

**Decision** : L'ORM utilise est **SQLAlchemy 2.0 en mode async**. SQLModel n'est PAS utilise.

**Implications** :
- Tous les modeles heritent de `DeclarativeBase` de SQLAlchemy 2.0
- Les sessions DB sont AsyncSession
- Pas de dependance SQLModel dans le projet
- Les schemas Pydantic sont separes des modeles ORM (pattern schemas/ vs models/)

**Phase** : Core (v1)

---

## D-003 — Task queue : APScheduler

**Decision** : Le gestionnaire de taches planifiees est **APScheduler**. ARQ n'est PAS utilise comme task queue principale.

**Implications** :
- Jobs cron (backup, health check, deadlines workflow, rotations PAX) geres par APScheduler
- Les taches lourdes asynchrones (export PDF, indexation RAG) sont gerees via APScheduler
- Configuration dans `app/tasks/`

**Phase** : Core (v1)

---

## D-004 — Event bus : PostgreSQL LISTEN/NOTIFY

**Decision** : Le bus d'evenements inter-modules utilise **PostgreSQL LISTEN/NOTIFY** avec persistence dans `event_store`. Pas de dict Python en memoire.

**Implications** :
- Les evenements sont emis APRES `db.commit()` (jamais dans une transaction)
- Chaque event est persiste dans `event_store` pour replay et audit
- Les handlers d'evenements sont idempotents (verifier `event_id` avant traitement)
- Pattern : `await event_bus.publish(OpsFluxEvent(event_type="ads.approved", ...))`

**Phase** : Core (v1)

---

## D-005 — UI : shadcn/ui (style Pajamas)

**Decision** : L'interface utilise **shadcn/ui** avec un style inspire de GitLab Pajamas. Stack frontend : React 18 + TypeScript + Vite + Radix UI + Tailwind CSS + Zustand + React Query.

**Implications** :
- Composants shadcn/ui comme base, personnalises pour le style Pajamas
- Dark mode supporte des P0 via la classe `.dark` sur `<html>`
- Toggle light/dark/system dans Settings > Preferences

**Phase** : Core (v1)

---

## D-006 — MCP : embarque dans le core

**Decision** : Il n'y a qu'un seul serveur MCP OpsFlux, **embarque dans le core**. Les modules enregistrent leurs outils comme **plugins** au demarrage. Pas de serveur MCP separe.

**Implications** :
- Pas de `FastMCP()` ni de serveur MCP separe dans les modules
- Pattern d'enregistrement : `mcp_registry.register_plugin("paxlog", paxlog.get_tools())`
- Appele depuis `app/mcp/register.py` dans `lifespan` de `main.py`
- Le MCP core gere l'auth (JWT user) et l'audit
- Chaque appel outil est trace dans `mcp_tool_calls` avec `source='mcp'` dans `audit_log`

**Structure** :
```
app/mcp/
|-- register.py         -> register_mcp_plugins() appele au startup
|-- tools/
    |-- common.py       -> get_assets, get_projects, get_users, get_cost_centers
    |-- projets.py      -> get_project_detail, simulate_schedule_change, push_to_planner
    |-- planner.py      -> get_availability, get_conflicts, check_site_pax_load
    |-- paxlog.py       -> search_pax, get_pax_compliance, create_ads, validate_ads
    |-- travelwiz.py    -> get_vehicle_positions, get_trip_timeline, search_cargo
```

**Phase** : Core (v1)

---

## D-007 — RBAC : permissions granulaires

**Decision** : Le systeme RBAC utilise des **permissions granulaires**, pas des roles hierarchiques. Table `user_roles` + `role_permissions`. Cache Redis TTL 5min.

**Implications** :
- Chaque role a un ensemble de permissions explicites (`document.read`, `document.create`, `asset.edit`, etc.)
- Les permissions sont declarees par les modules via leurs manifests et synchronisees au demarrage
- `check_user_permission(db, user_id, tenant_id, permission)` est le point d'entree unique
- `super_admin` a toutes les permissions. `tenant_admin` a toutes les permissions de son tenant
- Les overrides de permissions par role/tenant sont stockes dans `role_permission_overrides`
- Cache Redis invalide via `invalidate_rbac_cache()` apres changement de role/permissions

**Phase** : Core (v1)

---

## D-008 — Asset Registry : hierarchie dynamique, acces en ecriture controle par role

**Decision** : L'Asset Registry configure une hierarchie dynamique par tenant. La hierarchie est traversee via l'extension `ltree`. L'acces en ecriture est controle par les permissions RBAC (pas lecture seule pour tous).

**Implications** :
- `GET /api/v1/assets` accessible aux modules metier pour la lecture
- `POST /api/v1/assets` reserve aux utilisateurs ayant la permission `asset.create`
- Les champs `asset_id` dans les tables metier sont des FK vers `assets.id`
- La hierarchie est traversee via `ltree` : `path` de type `ltree` sur `assets`
- L'heritage de compliance HSE remonte la hierarchie ltree
- Un seul router dynamique pour tous les types d'assets : `/{type_slug}/`
- `validate_asset_type()` verifie que le type existe pour le tenant

**Phase** : Core (v1)

---

## D-009 — Stockage : S3-compatible

**Decision** : Le stockage de fichiers utilise un backend **S3-compatible** (MinIO en self-hosted).

**Implications** :
- Tous les fichiers (documents, exports, backups) sont stockes via l'API S3
- Service `storage_service` abstrait l'acces S3
- URLs pre-signees pour le telechargement (expiration configurable)

**Phase** : Core (v1)

---

## D-010 — Domaines : *.opsflux.io

**Decision** : Les domaines de la plateforme sont sous `*.opsflux.io`, configurables via `.env`.

**Implications** :
```
APP_URL=https://app.opsflux.io          # Application principale
WEB_URL=https://web.opsflux.io          # Portail public (ShareLinks, formulaires)
WWW_URL=https://www.opsflux.io          # Landing page marketing
API_URL=https://api.opsflux.io          # API backend

# Dev local
APP_URL=http://localhost:5173
WEB_URL=http://localhost:5174
```
- SSL : HTTP en dev, Let's Encrypt en staging, wildcard `*.opsflux.io` en prod via Traefik
- `www.opsflux.io` ne mentionne jamais Perenco

**Phase** : Core (v1)

---

## D-011 — Auth : multi-provider (SAML/OIDC/LDAP)

**Decision** : L'authentification supporte **plusieurs providers** : SAML, OIDC (Azure AD / Entra ID), LDAP. JWT OpsFlux genere apres validation externe.

**Implications** :
- Flow PKCE OAuth2 pour Azure AD
- JWT OpsFlux : access token 8h + refresh token 7j
- Payload JWT : `sub`, `tenant_id`, `role`, `bu_id`, `name`, `email`, `type`
- Nouveaux users arrivent sans role (`pending`) — le tenant_admin assigne manuellement
- Mapping Azure tenant -> OpsFlux tenant via table `azure_tenant_mappings` configurable
- Endpoint `/auth/refresh` pour renouvellement

**Phase** : Core (v1)

---

## D-012 — i18n : FR + EN

**Decision** : La plateforme supporte **FR + EN**. Multi-langue configurable par tenant.

**Implications** :
- Interface (labels, boutons, messages) : traduite via fichiers i18n (react-i18next)
- Emails de notification : templates traduits par langue
- Labels custom fields : admin definit `{"fr": "...", "en": "..."}`
- Contenus de documents : dans la langue choisie a la creation (pas traduits)
- Resolution de la langue : 1) `user_preferences["language"]`, 2) `tenant.settings.default_language`, 3) `"fr"` (fallback)

**Phase** : Core (v1)

---

## D-013 — Offline : PWA offline-first

**Decision** : OpsFlux est une **PWA offline-first** avec Service Worker (Workbox).

**Implications** :
- Lecture documents recents : cache React Query + Dexie.js IndexedDB
- Modification document : Yjs CRDT continue en local, merge CRDT a reconnexion
- Navigation arborescence : Workbox NetworkFirst avec fallback cache (TTL 1h)
- Creation document offline : stocke dans IndexedDB avec ID temporaire, sync a reconnexion
- Dashboards : donnees du dernier snapshot, indicateur "Donnees du {date}"
- Mutations POST/PATCH/DELETE en queue Background Sync (max 24h)

**Phase** : Core (v1)

---

## D-014 — Workflow Engine : editeur visuel drag-and-drop + FSM

**Decision** : Le moteur de workflow combine un **editeur visuel drag-and-drop** et une **FSM generique** du core. Tous les workflows de validation utilisent le moteur FSM. Les modules n'implementent pas leur propre logique de transition d'etat.

**Implications** :
- Table `workflow_definitions` appartient au core
- Les colonnes `status` sont maintenues par `WorkflowService` via `fsm_service.transition(entity, to_state, actor, workflow_id)`
- Transitions autorisees par role configurees dans `workflow_definitions.transitions` (JSONB)
- Exception : la logique d'arbitrage DO est du code metier custom dans `planner/arbitrage_service.py`

**Workflows enregistres au startup** :
```
planner_activity        -> draft|submitted|approved|rejected|cancelled|in_progress|completed
ads                     -> draft|submitted|pending_initiator_review|pending_project_review|
                           pending_compliance|pending_validation|
                           approved|rejected|cancelled|requires_review|
                           pending_arbitration|in_progress|completed
pax_manifest            -> draft|pending_validation|validated|requires_review|closed|cancelled
cargo_manifest          -> draft|pending_validation|validated|requires_review|closed|cancelled
rotation_travelwiz      -> draft|submitted|active|suspended|cancelled
project                 -> draft|active|on_hold|completed|cancelled
```

**Phase** : Core (v1)

---

## D-015 — Dashboard : hybride (onglets par role + GridStack personnel)

**Decision** : Le dashboard est **hybride** : onglets obligatoires par role + zone personnalisable GridStack.

**Implications** :
- Chaque module expose ses KPIs comme widgets enregistrables dans le dashboard core
- Les vues operationnelles completes (Gantt, carte tracking, manifestes) restent dans les pages module
- Les widgets du dashboard core appellent les memes endpoints API que les pages module
- Pas de duplication de logique

**Phase** : Core (v1)

---

## D-016 — Scope v1 : Core only. v1.x = PAX/Logistique. v2 = ReportEditor, PID/PFD

**Decision** : Le perimetre est strictement defini par version :
- **v1 (Core)** : Auth, RBAC, multi-tenant, Asset Registry, Tiers, Workflow Engine, Dashboard, AI/MCP, Event Bus, Audit
- **v1.x** : Modules Projets, Planner, PaxLog, TravelWiz
- **v2** : ReportEditor (avec collaboration temps reel), PID/PFD, module Hebergement

**Implications** :
- Ne pas developper de fonctionnalites v2 pendant les sprints v1/v1.x
- Les placeholders v2 dans le schema sont commentes
- Le module Hebergement est hors scope v1

**Phase** : Transverse

---

## D-017 — Collaboration temps reel : v2 avec ReportEditor (Yjs + Hocuspocus)

**Decision** : La collaboration temps reel est un feature **v2**, livree avec le ReportEditor. Stack : **Yjs + Hocuspocus**.

**Implications** :
- Hocuspocus server Node.js avec meme JWT que FastAPI (SECRET_KEY partagee)
- Hocuspocus down : toast + edition solo + retry 15s en arriere-plan
- Service token genere au demarrage FastAPI, partage via volume Docker
- Les etats Yjs sont persistes en DB via endpoints internes

**Phase** : v2

---

## D-018 — Fuseaux horaires : UTC en base, configurable en affichage

**Decision** : Tous les `TIMESTAMPTZ` sont stockes en UTC dans PostgreSQL. L'interface affiche dans la timezone configuree (defaut : UTC+1, `Africa/Douala`). Configurable dans le profil utilisateur.

**Implications** :
- Jamais de `TIMESTAMP WITHOUT TIME ZONE` dans le schema
- Les `DATE` (sans heure) sont saisies et affichees telles quelles
- L'API retourne des ISO 8601 UTC : `"2026-05-10T07:30:00Z"`
- Le frontend convertit via `Intl.DateTimeFormat` ou `date-fns-tz`

**Phase** : Core (v1)

---

## D-019 — Module Tiers : etendu par PaxLog

**Decision** : Le module Tiers core gere les entreprises. PaxLog l'etend avec des tables dediees sans modifier les tables core.

**Implications** :
- Tables d'extension PaxLog : `pax_groups`, `pax_company_groups`, `external_access_links`
- PaxLog ne fait jamais de `INSERT INTO tiers`
- PaxLog lit `tiers.id` pour les FK `company_id`

**Phase** : Core (v1) + v1.x (extension PaxLog)

---

## D-020 — Portails externes : applications legeres separees

**Decision** : Les portails externes sont des **mini-apps React separees**, deployees sur des sous-domaines distincts.

**Implications** :
- `web.opsflux.io/share/{token}` : ShareLinks (lecture seule ou fill_form)
- `web.opsflux.io/form/{token}` : Formulaires externes
- `web.opsflux.io/partner/{token}` : Portail lecture partenaire
- Bundle < 200kb gzipped
- Offline-first via Service Worker
- Auth par code/token uniquement
- Rate limiting strict : 10 req/min par IP

**Phase** : Core (v1)

---

## D-021 — ModuleRegistry : idempotent a chaque demarrage

**Decision** : Toutes les operations d'enregistrement des modules sont des **UPSERTS idempotents**. Un module ne peut pas casser au redemarrage.

**Implications** :
- Permissions, settings definitions, notification templates : upsert via `on_conflict_do_nothing` ou `on_conflict_do_update`
- Event handlers subscribes a l'EventBus apres sync
- Appele dans `lifespan` de `main.py`

**Phase** : Core (v1)

---

## D-022 — Soft delete : filtre manuel systematique

**Decision** : Pas de DELETE physique. Chaque requete ajoute `.where(Model.is_active == True)` manuellement.

**Implications** :
- Helper `active(Model)` fourni dans `app/core/database.py`
- Tables avec `is_active` : `users`, `user_tenants`, `business_units`, `tenants`, `documents`, `doc_types`, `templates`, `projects`, `assets`, `asset_types`, `tiers`, `contacts`, `pid_documents`, `equipment`, `connectors`, `distribution_lists`
- Tables immuables (pas de filtre) : `workflow_transitions`, `object_activity`, `audit_log`, `revisions`
- Checklist PR : toute query sur une table avec `is_active` filtre `active(Model)`

**Phase** : Core (v1)

---

## D-023 — Integration SAP : export CSV uniquement

**Decision** : OpsFlux n'a pas d'interface SAP bidirectionnelle. Le lien SAP = export CSV genere par OpsFlux, saisi manuellement dans SAP.

**Implications** :
- Pas de SAP RFC, pas d'API SAP, pas de middleware
- Endpoints d'export CSV configurables via `sap_export_configs`
- Reconnaissance IA de codes SAP via `article_catalog` (base importee)
- Index TF-IDF + pgvector reconstruit apres chaque import

**Phase** : v1.x (TravelWiz)

---

## D-024 — Architecture Docker : multi-conteneurs

**Decision** : L'architecture Docker comprend les conteneurs suivants : backend, frontend, web-portal, worker (APScheduler), hocuspocus (v2), infrastructure (postgres, redis, traefik), monitoring (prometheus, grafana).

**Implications** :
- Dockerfiles multi-stage : builder -> runtime slim
- Frontend : nginx alpine pour servir le build Vite
- `docker-compose.prod.yml` avec Traefik, wildcard certs
- draw.io self-hosted en prod (`drawio.app.opsflux.io`)
- Ollama conteneur avec init sidecar pour pull models
- `www.opsflux.io` : conteneur nginx statique sur meme VPS

**Phase** : Core (v1)

---

## D-025 — Audit log et infrastructure health

**Decision** : Audit log a retention illimitee, exportable CSV. Dashboard infrastructure health pour super_admin avec alertes automatiques.

**Implications** :
- Audit log : accessible tenant_admin (son tenant) + super_admin (tous)
- Dashboard `/admin/health` : statut global, metriques par tenant, alertes actives, projections
- Seuils d'alerte : stockage (60%/80%/95%), DB, connexions, Redis, queue
- Job quotidien health check a 8h00 et 14h00
- Grafana pour les metriques techniques detaillees

**Phase** : Core (v1)

---

## D-026 — Tenant middleware et resolution

**Decision** : JWT pour l'auth, `X-Tenant-ID` pour le switch actif verifie en DB. Cache Redis 10min.

**Implications** :
- `TenantMiddleware` resout `tenant_id`, `user_id`, `bu_id` a chaque requete
- Injecte dans `request.state`
- `X-Tenant-ID` permet le switch sans regenerer un JWT
- `X-BU-ID` pour le scope BU
- Paths exclus : `/health`, `/docs`, `/api/public/*`, `/auth/*`

**Phase** : Core (v1)

---

## D-027 — Notifications temps reel : WebSocket FastAPI

**Decision** : Les notifications temps reel passent par un endpoint WebSocket FastAPI `/ws/notifications`.

**Implications** :
- Auth via token JWT en query param
- `NotificationConnectionManager` gere les connexions multi-onglets par user
- Heartbeat toutes les 30s pour garder la connexion
- Push notification via `ws_manager.send_to_user()` apres creation en DB
- Frontend : reconnexion automatique apres 5s en cas de deconnexion

**Phase** : Core (v1)

---

## D-028 — Pagination : offset + cursor

**Decision** : Pagination offset pour les listes DataTable, pagination cursor (timestamp) pour les flux temps reel.

**Implications** :
- Offset : `page` + `page_size` (max 100), `PaginatedResponse` generique
- Cursor : `after` (timestamp ISO) + `limit`, `CursorPage` avec `has_more`
- Notifications et activity : cursor pagination
- Documents, assets, listes : offset pagination

**Phase** : Core (v1)

---

## D-029 — Backup PostgreSQL : pg_dump automatique

**Decision** : pg_dump quotidien a 02h30, retention 30 jours, stocke sur le VPS dans `/opt/opsflux/backups/`.

**Implications** :
- Dump compresse gzip
- Alerte email au super_admin si le dump echoue
- Nettoyage automatique des dumps > 30 jours
- Volume Docker partage entre backend et worker
- Bouton backup manuel dans `/admin/health`

**Phase** : Core (v1)

---

## D-030 — Creation tenants : super admin uniquement

**Decision** : Pas de self-signup. Super admin uniquement via `/admin` dedie.

**Implications** :
- Interface `/admin` separee de l'interface tenant normale
- `/admin/tenants`, `/admin/users`, `/admin/health`, `/admin/ai-usage`, `/admin/audit`
- Tenant cree avec `onboarding_completed: false`
- Email d'invitation au tenant_admin

**Phase** : Core (v1)

---

# PARTIE 2 — DECISIONS PAR MODULE

---

## Module Projets

---

### D-040 — Gantt Projets : SVAR React Gantt MIT + extensions custom

**Decision** : Le module Projets utilise **SVAR React Gantt edition MIT (gratuite)** comme socle interactif, complete par des extensions custom pour les fonctionnalites habituellement PRO (chemin critique, baselines, export PDF).

**Implications** :
- Le CPM et les baselines sont calcules backend (Python)
- La librairie frontend affiche les resultats (colorisation `is_critical`, overlay baseline)
- Extensions custom : ~2-3 jours de dev, parite fonctionnelle complete avec SVAR PRO a cout zero
- Export PDF via WeasyPrint

**Phase** : v1.x

---

### D-041 — CPM (Critical Path Method) : calcul backend Python

**Decision** : Le calcul du chemin critique est effectue cote backend en Python, pas en frontend.

**Implications** :
- Algorithme CPM standard avec early start/finish, late start/finish, float
- Resultat stocke dans `activities.is_critical` et expose via API
- Le frontend colore les taches critiques via les donnees API

**Phase** : v1.x

---

### D-042 — Simulation de planning

**Decision** : La simulation de changements de planning est une fonctionnalite backend exposee via API et outil MCP.

**Implications** :
- `simulate_schedule_change` : calcule l'impact d'un changement sans persister
- Retourne les taches impactees, le delta de duree, les conflits potentiels
- Accessible via MCP pour l'assistant IA

**Phase** : v1.x

---

## Module Planner

---

### D-050 — Planner remplace le module Calendrier du core

**Decision** : Planner est le calendrier d'OpsFlux. Il remplace et absorbe completement le module Calendrier generique.

**Implications** :
- Reunions, deadlines, evenements deviennent des `Activity` de type `event` (avec `pax_quota=0`)
- Planner expose les vues calendrier standard : mensuelle, hebdomadaire, timeline asset, PERT
- Tout autre module qui a besoin d'un calendrier utilise Planner

**Phase** : v1.x

---

### D-051 — Gantt Planner : React Modern Gantt

**Decision** : Le module Planner utilise **React Modern Gantt**, adapte aux vues multi-assets et multi-types d'activites.

**Phase** : v1.x

---

### D-052 — Modele de capacite

**Decision** : La capacite des sites est geree via `asset_capacities` en mode INSERT-only (historique complet avec motif obligatoire).

**Implications** :
- Jamais de UPDATE sur `asset_capacities`
- Chaque changement = nouvel enregistrement avec `effective_date` + `reason`
- L'arbitrage DO utilise la capacite courante pour les calculs

**Phase** : v1.x

---

### D-053 — CMMS : Planner gere nativement les maintenances

**Decision** : Il n'existe pas de CMMS chez Perenco Cameroun. OpsFlux via Planner est le premier systeme de gestion des maintenances.

**Implications** :
- Le type `maintenance` dans `activities` est enrichi : `maintenance_type`, `equipment_asset_id`, `work_order_ref`, `estimated_duration_h`, `actual_duration_h`, `completion_notes`
- Les ordres de travail sont crees directement dans Planner par le role `MAINT_MGR`
- Pas d'import depuis un CMMS externe

**Phase** : v1.x

---

## Module PaxLog

---

### D-060 — Workflow AdS : etapes 0-A et 0-B obligatoires

**Decision** : Le workflow AdS inclut deux etapes prealables au circuit principal :
- Etape 0-A (validation INITIATEUR) : active si `created_by != requester_id`
- Etape 0-B (validation CHEF_PROJET) : active si AdS liee a un projet/tache
- Exception : `ads_maintenance_urgent` n'a pas l'etape 0-B

**Implications** :
- Deux statuts FSM supplementaires : `pending_initiator_review`, `pending_project_review`
- Circuit complet : draft -> 0-A -> 0-B -> pending_compliance -> pending_validation -> approved

**Phase** : v1.x

---

### D-061 — Compliance PAX : 3 couches

**Decision** : La verification compliance PAX combine 3 couches :
1. **Asset** (existant) : ce que le site exige de tous
2. **Profil metier** (nouveau) : ce que le metier exige
3. **Autodeclaration avec preuve** (nouveau) : ce que le PAX affirme posseder, valide par CHSE

**Phase** : v1.x

---

### D-062 — Rotations PAX permanents : gerees par OpsFlux

**Decision** : OpsFlux gere les cycles de rotation du personnel permanent (ex: 28j on / 28j off). A partir d'un cycle configure, OpsFlux pre-cree automatiquement les AdS.

**Implications** :
- Table : `pax_rotation_cycles` avec `rotation_days_on`, `rotation_days_off`, `cycle_start_date`
- Batch quotidien a 6h00 (`rotation_cron.py`)
- L'AdS auto-creee est en statut `draft`, doit etre confirmee
- Contrainte UNIQUE `(pax_id, site_asset_id, status)` garantit un seul cycle actif par PAX/site

**Phase** : v1.x

---

### D-063 — Donnees medicales PAX : a definir selon politique Perenco

**Decision** : Non tranchee. En attente de validation avec le service medical et RH Perenco.

**Comportement par defaut implemente** :
- OpsFlux stocke uniquement la date d'aptitude et le statut dans `pax_credentials` pour le type `MEDIC_FIT`
- Aucun contenu medical n'est stocke
- Acces : seuls le role `MEDICAL` et le PAX lui-meme voient la date exacte

**Marqueur dans le code** :
```python
# TODO: MEDICAL_POLICY -- Valider avec DRH Perenco avant mise en production
```

**Phase** : v1.x

---

### D-064 — Signalements PAX

**Decision** : Les incidents PAX sont traces dans `pax_incidents` avec un workflow de traitement lie au module PaxLog.

**Phase** : v1.x

---

## Module TravelWiz

---

### D-070 — Rapports TravelWiz : hybride Report Editor + WeasyPrint

**Decision** : Les rapports formels utilisent le Report Editor core avec templates predifinis. Les exports terrain utilisent WeasyPrint.

**Regle de decision** :
```
Rapport officiel / diffuse / archive / signe  ->  Report Editor core
Export terrain / temps reel / format fixe      ->  WeasyPrint
```

**Rapports formels (Report Editor core)** : manifeste PAX officiel, manifeste cargo officiel, rapport de dechargement, rapport mensuel flotte, rapport retour site.

**Exports terrain (WeasyPrint)** : manifeste PAX imprimable, journal de bord, liste de chargement deck, fiche colis individuelle QR code, timeline voyage portail capitaine.

**Phase** : v1.x

---

### D-071 — IoT et tracking vehicules

**Decision** : TravelWiz integre le tracking des vehicules via IoT pour la localisation en temps reel.

**Phase** : v1.x

---

### D-072 — Portail capitaine

**Decision** : Le portail capitaine est une mini-app React separee, accessible via un code a 6 chiffres.

**Implications** :
- App legere, bundle < 200kb gzipped
- Offline-first via Service Worker
- Auth par code uniquement
- Rate limiting strict

**Phase** : v1.x

---

### D-073 — Export SAP

**Decision** : Export CSV configurable, pas d'interface bidirectionnelle (voir D-023).

**Phase** : v1.x

---

## Module ReportEditor (v2)

---

### D-080 — Reviewer en mode revision

**Decision** : Quand un document est "En revision", le reviewer voit le document en lecture seule avec possibilite d'ajouter des commentaires inline et un panneau Revision dedie (Approuver / Rejeter + commentaire general).

**Implications** :
- Commentaires inline via extension BlockNote (surlignes en jaune)
- Stockes dans `object_comments` avec champ `inline_position: {from, to}`
- Resolution : reviewer ou auteur peuvent marquer "Resolu"

**Phase** : v2

---

### D-081 — Editeur BlockNote

**Decision** : L'editeur de documents utilise **BlockNote** avec 3 blocs custom : CartoucheBlock, FormBlock, DynamicDataBlock.

**Implications** :
- Lecture seule sur mobile (edition >= 1024px uniquement)
- Rendu HTML pour export PDF via Puppeteer
- Collaboration temps reel via Yjs/Hocuspocus (v2)

**Phase** : v2

---

### D-082 — Library Builder

**Decision** : Les objets crees dans le Library Builder sont exportes au format XML draw.io et apparaissent dans le panneau de bibliotheques natif de draw.io via `customLibraries` URL.

**Implications** :
- Pas de panel React custom pour la bibliotheque
- Endpoint public : `GET /api/v1/pid/library/drawio.xml`
- URL passee a l'iframe draw.io au moment de l'ouverture

**Phase** : v2

---

### D-083 — Statut "Publie" : manuel apres approbation

**Decision** : La publication est une action manuelle distincte de l'approbation. Le bouton "Publier" n'est visible que pour l'auteur ou le tenant_admin.

**Implications** :
- Flux : `draft -> in_review -> approved -> published`
- L'event `document.published` declenche la distribution automatique
- Distribution : email PDF + notification in-app aux listes de distribution configurees

**Phase** : v2

---

## Module PID/PFD (v2)

---

### D-090 — draw.io : integration native

**Decision** : L'editeur PID/PFD utilise **draw.io** en iframe. CDN en dev/staging, self-hosted Docker en prod.

**Implications** :
- `DRAWIO_URL` configurable via `.env`
- Proprietes via panneau natif draw.io "Edit Data" (pas de panel OpsFlux custom)
- Les attributs `opsflux_*` sont parses au save pour la synchronisation DB

**Phase** : v2

---

### D-091 — Tag Registry

**Decision** : Les tags DCS sont geres dans un registre centralise avec regles de nommage par tenant.

**Phase** : v2

---

### D-092 — Lock mecanisme PID : lock optimiste Redis

**Decision** : Un PID = un seul editeur actif a la fois. Lock optimiste via Redis avec TTL 30 minutes.

**Implications** :
- Heartbeat toutes les 5 minutes pour renouveler le lock
- Banniere "Verrouille par X" pour le 2eme utilisateur
- Force release disponible pour `pid.admin`
- Lock expire automatiquement si le navigateur est ferme sans liberer

**Phase** : v2

---

### D-093 — Objet supprime du canvas draw.io

**Decision** : Le traitement depend du contexte du PID.

**Implications** :
- Projet nouveau (aucun document publie) : suppression physique de l'equipement en DB
- PID existant (projet actif) : `removed_from_pid = True`, l'equipement reste dans la DB pour l'historique
- Les equipements `removed_from_pid = True` restent visibles dans la recherche globale

**Phase** : v2

---

# PARTIE 3 — DECISIONS TECHNIQUES TRANSVERSES

---

## D-100 — Onboarding : wizard guide nouveau tenant

**Decision** : Un wizard multi-etapes guide a la premiere connexion d'un tenant_admin.

**Etapes** : Bienvenue -> Business Units -> Inviter utilisateurs -> Activer modules -> Configurer SMTP (optionnel) -> Page d'accueil (optionnel) -> Termine.

**Implications** :
- Progression stockee dans `tenants.settings` (JSONB)
- Redirect automatique vers `/onboarding` si `onboarding_completed = false`

**Phase** : Core (v1)

---

## D-101 — Pages d'erreur : toast + reste en place

**Decision** : Pas de page d'erreur dediee. Toast + reste sur la page courante.

**Implications** :
- 401 : redirect silencieux vers `/login`
- 403 : toast warning 6s
- 404 : toast info 4s, `NotFoundPanel` pour les URLs directes
- 422 : gere inline par le formulaire
- 429 : toast warning 8s
- 500+ : toast error 8s

**Phase** : Core (v1)

---

## D-102 — Email templates : surcharge par tenant

**Decision** : Templates par defaut dans le code (Jinja2). Le tenant_admin peut surcharger le body via Settings > Emails. Overrides stockes dans `email_template_overrides`.

**Phase** : Core (v1)

---

## D-103 — Editeurs sur mobile

**Decision** :
- Editeur de documents (BlockNote) : lecture seule sur mobile (edition >= 1024px)
- Editeur PID (draw.io) : bloque sur mobile ET tablette (desktop >= 1024px uniquement)

**Phase** : Core (v1)

---

## D-104 — Connector Manager : niveau Advanced

**Decision** : Formulaire UI par type de source + mapping visuel des colonnes + editeur de transformation (renommer, calculer, filtrer).

**Types supportes** : `excel_csv`, `api_rest`, `csv_dcs`, `database`.

**Phase** : v2

---

## D-105 — Numerotation : configurable par tenant

**Decision** : Entierement configurable dans Settings > Modules > Redacteur > Nomenclature. Debordement naturel au-dela de la capacite du pattern. Warning email a 9000. Patterns alphanumeriques recommandes.

**Phase** : Core (v1)

---

## D-106 — pgvector : dimension 768 (nomic-embed-text)

**Decision** : Les embeddings utilisent `nomic-embed-text` via Ollama, dimension 768.

**Implications** :
- `Column(Vector(768))` (pas 1536)
- Index ivfflat avec `lists = 100` (correct jusqu'a ~1M chunks)
- Verification au demarrage que le modele produit la bonne dimension

**Phase** : Core (v1)

---

## D-107 — IA : RAG first, LLM decide

**Decision** : Pas de `classify_intent()` prealable. Toujours RAG d'abord. Le LLM recoit le corpus de sources + les tools MCP et decide lui-meme si une action est necessaire.

**Implications** :
- Pipeline unique : embedding -> recherche RAG (top 5) -> contexte + tools -> LLM -> reponse
- Si action necessaire : bloc JSON `action` dans la reponse
- Temperature 0.3, max 1000 tokens

**Phase** : Core (v1)

---

## D-108 — React Query : strategie d'invalidation

**Decision** : Mutations Core invalident large (nav + briefing + reco), mutations modules invalident cible (liste + badge).

**Implications** :
- CREATE/DELETE : invalidation large (badges sidebar, briefing IA, recommendations)
- UPDATE : invalidation ciblee (objet seul + liste)
- WORKFLOW action : invalidation complete (document, workflow, badges, validations, reco, briefing)
- SETTINGS save : section concernee seulement

**Phase** : Core (v1)

---

## D-109 — JWT OpsFlux : payload exact

**Decision** : Access token 8h, refresh token 7j. Payload : `sub`, `tenant_id`, `role`, `bu_id`, `name`, `email`, `type`, `jti`, `iat`, `exp`.

**Phase** : Core (v1)

---

## D-110 — Export PDF : job asynchrone

**Decision** : Export PDF via job asynchrone. L'user recoit une notification in-app + email quand le PDF est pret.

**Implications** :
- Rendu HTML depuis BlockNote JSON via `render_document_to_html()`
- HTML -> PDF via Puppeteer (Node.js subprocess)
- Stockage dans S3, lien valable 24h
- Polling frontend toutes les 2s pour le statut

**Phase** : Core (v1)

---

## D-111 — Share Links : token + magic link email

**Decision** : Token signe dans l'URL + email de confirmation optionnel (magic link).

**Implications** :
- Permissions : `view`, `fill_form`, `download`
- Expiration configurable (defaut 30 jours)
- Mot de passe optionnel
- Acces logge dans `share_link_accesses`

**Phase** : Core (v1)

---

## D-112 — Object Relations : bidirectionnel

**Decision** : Les relations entre objets (asset <-> document, etc.) sont creables depuis les deux cotes et visibles bidirectionnellement.

**Phase** : Core (v1)

---

## D-113 — Dark mode : des P0

**Decision** : Toggle light/dark/system dans Settings > Compte > Preferences, des P0.

**Implications** :
- `user_preferences["theme"]` = `"light"` | `"dark"` | `"system"`
- Applique immediatement, persiste en DB
- shadcn/ui gere le dark mode nativement via la classe `.dark` sur `<html>`

**Phase** : Core (v1)

---

## D-114 — Securite : masquage de la stack

**Decision** : Ne jamais reveler la stack technique en production.

**Implications** :
- Header `Server: OpsFlux` (pas `uvicorn`)
- Swagger/ReDoc desactives en staging et prod
- `robots.txt` sur `www.opsflux.io` : `Disallow: /api/`, `Disallow: /admin/`

**Phase** : Core (v1)

---

## D-115 — Custom Fields : section "Informations complementaires"

**Decision** : Les custom fields apparaissent dans l'onglet "Informations" apres les champs standards, dans une section "Informations complementaires".

**Phase** : Core (v1)

---

# PARTIE 4 — REGLES ABSOLUES DE DEVELOPPEMENT

**Ces regles ne souffrent aucune exception :**

| # | Regle | Raison |
|---|---|---|
| 1 | Jamais de `DELETE` physique | Tracabilite complete -- toujours `archived=TRUE` ou `status='cancelled'` |
| 2 | `asset_capacities` = INSERT only | Historique complet des changements de capacite avec motif obligatoire |
| 3 | Evenements emis APRES `db.commit()` | Eviter les notifications sur des donnees rollbackees |
| 4 | `entity_id` filtre obligatoire | Isolation des donnees multi-entite -- jamais de requete sans |
| 5 | FSM core pour les transitions | Pas de `ads.status = "approved"` direct -- passer par `fsm_service.transition()` |
| 6 | Pas de serveur MCP separe | Un seul MCP core -- enregistrer en plugin via `mcp_registry` |
| 7 | Asset Registry : ecriture controlee par RBAC | Jamais de creation d'asset sans la permission `asset.create` |
| 8 | `audit_log` sur tout changement | Source de verite pour la conformite -- automatise via SQLAlchemy listener |
| 9 | Idempotence des handlers d'evenements | Verifier `event_id` avant de traiter -- safe a rejouer |
| 10 | References via `generate_reference()` | Atomique via LOCK PostgreSQL -- jamais de sequence maison |

---

# PARTIE 5 — RESUME DES IMPACTS PAR FICHIER

| Decision | Fichiers principalement impactes |
|---|---|
| D-001 Multi-tenant 3 niveaux | `00_OVERVIEW`, `06_DATA_MODEL`, `07_DEV_GUIDE` |
| D-002 SQLAlchemy 2.0 | `07_DEV_GUIDE`, `06_DATA_MODEL` |
| D-003 APScheduler | `07_DEV_GUIDE`, `05_INTERACTIONS` |
| D-004 PG LISTEN/NOTIFY | `05_INTERACTIONS`, `07_DEV_GUIDE` |
| D-006 MCP embarque | `08_AI_MCP`, `07_DEV_GUIDE` |
| D-008 Asset Registry | `00_OVERVIEW`, `03_PAXLOG`, `04_TRAVELWIZ`, `16_MODULE_ASSET_REGISTRY` |
| D-014 Workflow FSM | `01_PROJETS`, `02_PLANNER`, `03_PAXLOG`, `04_TRAVELWIZ`, `17_MODULE_WORKFLOW_ENGINE` |
| D-023 SAP CSV only | `04_TRAVELWIZ`, `08_AI_MCP` |
| D-050 Planner = Calendrier | `02_PLANNER` |
| D-060 AdS workflow | `03_PAXLOG`, `05_INTERACTIONS` |
| D-062 Rotations | `03_PAXLOG`, `05_INTERACTIONS`, `06_DATA_MODEL` |
| D-070 Rapports hybrides | `04_TRAVELWIZ` |
| D-080 Reviewer mode | `17_MODULE_WORKFLOW_ENGINE` |

---

**Fin du registre unifie des decisions.**
