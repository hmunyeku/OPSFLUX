# CLAUDE.md — Guide Claude Code pour OpsFlux

> **Lis ce fichier en premier. Toujours. Avant tout autre fichier du repo.**

---

## Ce qu'est OpsFlux

Plateforme ERP modulaire multi-tenant développée pour répondre aux problématiques opérationnelles de Perenco (Oil & Gas, Cameroun). Architecture **Core + Modules** : le core fournit les services horizontaux, les modules s'enregistrent au démarrage via `ModuleRegistry`.

**Stack** : FastAPI Python 3.12 + SQLAlchemy 2.0 async + PostgreSQL 16 (pg_trgm, pgvector, ltree, PostGIS, pg_partman) + Redis 7 + APScheduler + React 18 + TypeScript + Vite + shadcn/ui (Radix + Tailwind) + Zustand + React Query + S3-compatible

---

## Architecture multi-tenant (3 niveaux)

```
Tenant (schema PostgreSQL)      → isolation totale, 1 schema par organisation cliente
  └─ Entity (entity_id column)  → filiale/pays au sein d'un tenant, filtrage row-level
       └─ BU / Department       → sous-division d'entity, filtrage hybride par module
```

- **Tenant** : résolu depuis le sous-domaine (`perenco.app.opsflux.io`) + switchable au login. Chaque tenant = un schema PG. Routing via `SET search_path`.
- **Entity** : `entity_id UUID NOT NULL` sur toutes les tables métier. Header `X-Entity-ID`. Multi-entity possible.
- **BU** : certaines données scopées par `department_id` (projets, activités), d'autres cross-BU (PAX, assets, véhicules).
- **Base platform** : schema central avec la liste des tenants + config + comptes `platform_admin`.

---

## Ordre de lecture des specs

```
docs/
├── CLAUDE.md                              ← tu es ici
├── 03_DECISIONS.md                        ← LIRE EN PREMIER — décisions architecturales (prime sur tout)
├── 00_PROJECT.md                          ← architecture, stack, multi-tenant, conventions API
├── 01_CORE.md                             ← services Core (EventBus, Workflow, Notifications, Storage...)
├── 05_DEV_GUIDE.md                        ← structure projet, patterns, config, tests, sprints
├── 02_DESIGN_SYSTEM.md                    ← layout Pajamas, composants React, breakpoints, thème
├── 04_DATA_MODEL.md                       ← DDL PostgreSQL complet (tables, index, contraintes)
├── 06_RBAC.md                             ← RBAC complet (permissions granulaires, groupes, matrices)
├── 07_INTERACTIONS.md                     ← flux événements inter-modules (payloads complets)
├── 08_SETTINGS.md                         ← référence config (.env, settings DB, préférences)
├── 09_PROCESSUS.md                        ← processus fonctionnels complets (vue utilisateur)
├── 10_ROADMAP.md                          ← phases de développement
├── 11_FUNCTIONAL_ANALYSIS.md              ← analyse fonctionnelle globale
│
├── modules/
│   ├── core/
│   │   ├── ASSET_REGISTRY.md              ← hiérarchie dynamique, configurable par tenant
│   │   ├── TIERS.md                       ← entreprises, contacts, portail externe
│   │   ├── WORKFLOW_ENGINE.md             ← éditeur visuel drag-and-drop, versioning, délégation
│   │   ├── DASHBOARD.md                   ← hybride : onglets rôle + GridStack libre
│   │   ├── AUTH.md                        ← SSO multi-provider (SAML/OIDC/LDAP), JIT
│   │   └── AI_MCP.md                      ← IA embarquée + MCP core (plugins)
│   ├── v1/                                ← modules PAX/Logistique (premier déploiement)
│   │   ├── PROJETS.md + FUNC_PROJETS.md
│   │   ├── PLANNER.md + FUNC_PLANNER.md
│   │   ├── PAXLOG.md + FUNC_PAXLOG.md
│   │   └── TRAVELWIZ.md + FUNC_TRAVELWIZ.md
│   └── v2/                                ← modules futurs
│       ├── REPORT_EDITOR.md
│       ├── PID_PFD.md
│       └── CONNECTEURS.md               ← connecteurs données externes (fichier, API, DCS, DB)
```

**Règle** : pour tout travail sur un module → lire `03_DECISIONS.md` + `00_PROJECT.md` + spec du module + analyse fonctionnelle associée.

---

## Phasing

| Phase | Contenu | Prérequis |
|---|---|---|
| **Core v1** | Auth, RBAC, Multi-tenant, Events, Workflow Engine, Dashboard, Asset Registry, Tiers, Notifications, Audit, Storage, AI/MCP, i18n FR/EN, PWA offline | — |
| **v1.x** | Projets, Planner, PaxLog, TravelWiz + portails captain/ext-paxlog | Core v1 |
| **v2** | ReportEditor, PID/PFD, Connecteurs, Library Builder, Collab RT (Yjs+Hocuspocus), Hébergement | Core v1 |

---

## Domaines et URLs

```bash
APP_URL=https://app.opsflux.io            # Application principale (tenant via sous-domaine)
WEB_URL=https://web.opsflux.io            # Portail public (landing, ShareLinks)
API_URL=https://api.opsflux.io            # Backend API
# Portails terrain (v1.x)
CAPTAIN_URL=https://captain.app.opsflux.io
EXT_PAXLOG_URL=https://ext.app.opsflux.io

# Dev local
APP_URL=http://localhost:5173
API_URL=http://localhost:8000
```

---

## Démarrage local

```bash
cp .env.example .env.dev
docker compose -f docker-compose.dev.yml up -d
cd app && alembic upgrade head
cd apps/main && npm install && npm run dev
```

- Frontend app : http://localhost:5173
- API + Swagger : http://localhost:8000/api/docs

---

## Architecture Docker (v1 core — 6 conteneurs)

| Conteneur | Image | Rôle |
|---|---|---|
| `backend` | opsflux-backend | FastAPI + APScheduler |
| `frontend` | opsflux-frontend | React PWA (nginx) |
| `web-portal` | opsflux-web-portal | web.opsflux.io |
| `postgres` | pgvector/pgvector:pg16 | DB (schemas par tenant) |
| `redis` | redis:7-alpine | Cache + Pub/Sub + OTP |
| `traefik` | traefik:v3 | Reverse proxy SSL |

*v1.x ajoute* : `captain-portal`, `ext-paxlog-portal`
*v2 ajoute* : `hocuspocus` (Node.js, collab RT)

---

## Module Registration

```python
# Chaque module s'enregistre au démarrage
def register(registry: ModuleRegistry):
    registry.add_routes(router, prefix="/api/v1/planner")
    registry.add_permissions([
        "planner.activity.create",
        "planner.activity.approve",
        "planner.conflict.resolve",
    ])
    registry.add_roles([
        Role("SITE_MGR", permissions=[...]),
        Role("MAINT_MGR", permissions=[...]),
    ])
    registry.add_widgets([...])
    registry.add_event_handlers([...])
    registry.add_mcp_tools([...])
```

Les modules sont **indépendants** : chacun fonctionne seul avec le core. Quand un autre module est actif, les interactions s'activent via events.

---

## Conventions

### Branches
```
main          → production
develop       → staging (deploy automatique)
feature/S{N}-{description}   ex: feature/S1-auth-jwt
fix/{description}
```

### Commits
```
feat(module): description
fix(core): description
migration(S1): ajouter tables auth
chore(infra): configurer traefik
```

---

## Règles absolues — Ce qu'un module NE FAIT JAMAIS

```
❌ DELETE physique              → archived=TRUE ou status='cancelled'
❌ UPDATE asset_capacities     → INSERT nouvel enregistrement (effective_date + reason)
❌ Event dans une transaction  → émettre APRÈS db.commit()
❌ Requête sans entity_id      → toujours filtrer par entity_id
❌ Transition de statut directe → fsm_service.transition()
❌ Serveur MCP séparé          → plugin via mcp_registry
❌ Logique métier en route     → tout dans les services
❌ Swagger en prod             → docs_url=None si ENVIRONMENT != "development"
❌ Séquence maison             → generate_reference(prefix, db)
❌ Rôle/permission hardcodé    → enregistrer via ModuleRegistry
❌ Champs adresse sur un objet → table `addresses` polymorphique (owner_type + owner_id)
❌ Code saisi manuellement     → generate_reference() avec template configurable
❌ Composant adresse dupliqué  → utiliser <AddressManager> partagé
❌ Notes/commentaires dupliqués → table `notes` polymorphique + <NoteManager>
❌ Tags/catégories dupliqués    → table `tags` polymorphique + <TagManager>
❌ Fichiers joints dupliqués    → table `attachments` polymorphique + <AttachmentManager>
❌ Config API/clé en dur        → Settings DB scope=entity, page Intégrations centralisée
❌ Moteur de carte hardcodé     → configurable via Settings (OSM/Google Maps/Mapbox)
❌ OAuth2/tokens recréés par module → accès centralisé dans Intégrations, réutilisable partout
❌ Upload image sans éditeur     → composant ImageEditor (crop, rotate, text) réutilisable partout
❌ Indicateur offline absent     → LED TopBar obligatoire (vert/orange/rouge)
```

### Composants mutualisés (Core) — Toujours réutiliser, jamais dupliquer

| Fonctionnalité | Table DB | Composant | Règle |
|---|---|---|---|
| Adresses | `addresses` | `<AddressManager>` | Polymorphique `owner_type`+`owner_id`. GPS via geolocation API |
| Tags | `tags` | `<TagManager>` | Classification publique/privée. Filtrage par tag |
| Notes | `notes` | `<NoteManager>` | Historisable, public/privé. Onglet sur chaque objet |
| Fichiers joints | `attachments` | `<AttachmentManager>` | Upload, download, delete. Polymorphique |
| Extra Fields | `extra_fields` | `<ExtraFieldsManager>` | Champs personnalisés par tenant/user |
| Templates | `form_templates` | `<TemplateSelector>` | Modèles de formulaire. Exclut champs uniques/sécurité |
| Code/Référence | `reference_sequences` | Lecture seule | `generate_reference(prefix)`. Template configurable |
| RowID | Colonne `id` UUID | Non affiché | Immuable. L'utilisateur voit le `code`, pas le UUID |
| Image Editor | — | `<ImageEditor>` | Crop, rotation, texte sur import image. Désactivable en settings |

### Services externes & Cartographie

| Composant | Lieu | Description |
|---|---|---|
| **Intégrations** | Settings → Général → Intégrations | Page centralisée pour toutes les clés API, configs OAuth2, moteurs externes |
| **Moteur de carte** | Configurable via Settings | OpenStreetMap (défaut), Google Maps, Mapbox. Choix dans Intégrations |
| **OAuth2 centralisé** | Settings → Intégrations | Google, Azure AD, etc. Configuré une fois, exploitable par tous les modules |
| **SMTP** | Settings → Intégrations | Serveur mail transactionnel centralisé |
| **Stockage S3** | Settings → Intégrations | Local/S3/MinIO, configurable |
| **Geocoding** | Settings → Intégrations | Nominatim (gratuit), Google, Mapbox |

**Règle** : tout service externe doit être configurable dans la page Intégrations. Aucun module ne doit recréer ses propres accès/tokens. Les modules inscrivent leurs besoins dans cette page via le registre de settings.

### Architecture UI — Règles de layout

```
┌──────────────────────────────────────────────────────────────┐
│ Top NavBar (globale)                                         │
├────┬──────────────────────────┬──────────────┬───────────────┤
│Left│   Static Panel (main)    │ Dynamic Panel│ Right Context │
│Bar │   (liste, formulaire)    │ (resizable)  │ Bar (actions, │
│    │                          │              │  chat, aide)  │
│icon│                          │              │               │
│    │                          │              │               │
└────┴──────────────────────────┴──────────────┴───────────────┘
```

1. **Left Bar** (icônes) : zone contextuelle d'actions rapides (chat, aide, raccourcis). Toujours visible.
2. **Static Panel** : contenu principal (table, formulaire en mode full).
3. **Dynamic Panel** : panneau secondaire redimensionnable (détail, création, édition).
4. **Right Context Bar** : optionnelle, affiche des outils contextuels.

### Système d'onglets applicatif (multi-tâches)

- L'application implémente un **système d'onglets interne** permettant le multi-traitement.
- Chaque vue/page peut être ouverte dans un **onglet applicatif** (pas nécessairement un onglet navigateur).
- Un onglet peut être **détaché en modal** flottante non-bloquante (l'utilisateur continue à travailler derrière).
- Plusieurs modaux peuvent se **superposer** pour consulter des infos et remplir ailleurs.
- Support du **multi-fenêtres** (onglets navigateur) comme tous les logiciels professionnels : chaque URL est routable et peut fonctionner dans sa propre fenêtre indépendante.
- Le Dynamic Panel peut être **détaché en modal** via un bouton, ce qui le transforme en fenêtre flottante.

### Panneau détachable → Modal

- Tout panneau secondaire (Dynamic Panel) doit avoir un bouton "Détacher" qui le transforme en modal non-bloquant.
- Le modal est repositionnable et redimensionnable.
- L'utilisateur peut continuer à interagir avec le contenu derrière le modal.
- Plusieurs modaux peuvent coexister simultanément.

### Indicateur de connectivité (offline-first)

- **LED dans la TopBar** signale l'état de la connexion réseau en temps réel
- Vert : en ligne, synchronisé
- Orange : synchronisation en cours
- Rouge : hors ligne, mode offline actif
- Les actions effectuées offline sont mises en file d'attente et synchronisées au retour de la connexion
- Utiliser `navigator.onLine` + heartbeat API pour détecter l'état

### Méthodologie de développement : PDCA

**Plan → Do → Check → Act** — Toujours appliquer ce cycle :

1. **Plan** : Consulter les docs (`03_DECISIONS.md`, spec module, `02_DESIGN_SYSTEM.md`, `CLAUDE.md`). Définir le plan d'attaque. Interroger si pas clair.
2. **Do** : Implémenter conformément au plan et aux patterns documentés.
3. **Check** : `tsc --noEmit` (0 erreur), `ruff check`, tests, vérification visuelle.
4. **Act** : Corriger, documenter, mettre à jour les docs si nouvelles règles.

**Règle Claude** : toujours consulter les docs avant de définir un plan d'attaque pour chaque modification.

### Pattern endpoint FastAPI correct

```python
@router.post("/pax/ads")
async def create_ads(
    body: AdSCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_permission("paxlog.ads.create")),
    db: AsyncSession = Depends(get_db),
):
    return await ads_service.create_ads(
        body=body, entity_id=entity_id,
        created_by=current_user.id, db=db,
    )
```

### Pattern composant React correct

```tsx
// Données serveur → React Query
const { data } = useQuery({
    queryKey: ["ads", filters],
    queryFn: () => api.get("/api/v1/pax/ads", { params: filters }).then(r => r.data),
})

// State UI → Zustand
const { sidebarExpanded } = useUIStore()

// Préférences persistées → hook
const [pageSize, setPageSize] = useUserPreference("table.ads.page_size", 25)
```

---

## Tests

```bash
cd app && pytest tests/ -x --tb=short
cd apps/main && npm run test
cd apps/main && npm run typecheck
```

Critère : 0 test cassé avant tout commit sur `develop`.

---

## Checklist PR

```
□ ruff check + format → 0 erreur
□ pytest → 0 test cassé
□ npm run typecheck → 0 erreur TypeScript
□ alembic upgrade head sur DB vide → OK
□ .env.example mis à jour si nouvelles variables
□ Pas de TODO non résolu dans le code commité
```

---

## Quand tu es bloqué

1. `03_DECISIONS.md` — consulter d'abord (prime sur tout)
2. Spec du module concerné (`modules/core/`, `modules/v1/`, `modules/v2/`)
3. Analyse fonctionnelle (`modules/v1/FUNC_*.md` ou `11_FUNCTIONAL_ANALYSIS.md`)
4. `00_PROJECT.md` — architecture, conventions API
5. `01_CORE.md` — services Core disponibles
6. `05_DEV_GUIDE.md` — patterns d'implémentation
7. `02_DESIGN_SYSTEM.md` — composants UI
8. **Ne jamais inventer une architecture non spécifiée — poser la question**
