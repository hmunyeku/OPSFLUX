# OpsFlux — 00_PROJECT.md
# Architecture Generale, Stack, Decisions, Structure, CI/CD

> Ce fichier est la **reference technique unique et autoritaire** du projet OpsFlux.
> Claude Code lit ce fichier avant tout developpement.
> Toute decision listee en section 3 est **definitive et non revisable**.

---

## 1. Vision & Principe Platform/Plugin

OpsFlux est une plateforme PWA enterprise **multi-tenant** pour la gestion des operations industrielles. Son architecture suit le pattern **Platform/Plugin** :

```
CORE PLATFORM (modules/core/*)
|  Services horizontaux — Auth, RBAC, Workflow, EventBus, CustomFields,
|  AI, Map, Export, Notifications, Email, Scheduler, OCR, Storage, Search,
|  AuditLog, AssetRegistry, Tiers, MCP
|  ↓ Registration API (core.register_module())
|
├── v1 Modules (modules/v1/*)
│   ├── Module Projets        (slug: projets)
│   ├── Module Planner        (slug: planner)
│   ├── Module PaxLog         (slug: paxlog)
│   └── Module TravelWiz      (slug: travelwiz)
|
├── v2 Modules (modules/v2/*)  — futur
│   ├── Module ReportEditor   (slug: report_editor)
│   ├── Module PID_PFD        (slug: pid_pfd)
│   └── Module Collab RT      (slug: collab_rt)
|
├── Module Dashboard          (slug: dashboard)
└── Module Calendar           (slug: calendar)
```

**Scope de livraison** :
- **v1.0** : Core uniquement (Auth, RBAC, Multi-tenant, Asset Registry, Tiers, Workflow, EventBus, etc.)
- **v1.x** : Modules PAX/Logistique (Projets, Planner, PaxLog, TravelWiz)
- **v2** : ReportEditor, PID/PFD, Collab RT

**Regle absolue** : un module ne reimplemente **jamais** un service Core. Il declare un manifest et consomme les APIs Core. Si un module a besoin d'envoyer un email → il appelle `core.email.queue()`. S'il a besoin d'une notification → `core.notify()`. Jamais de code SMTP dans un module.

### 1.1. Enregistrement des modules (ModuleRegistry)

Chaque module s'enregistre au demarrage via `core.register_module()` :

```python
# modules/v1/paxlog/__init__.py
from core.registry import register_module

MODULE_MANIFEST = {
    "slug": "paxlog",
    "name": "PaxLog",
    "version": "1.0.0",
    "depends_on": [],                    # pas de dependance dure
    "enriches": ["projets", "planner"],  # enrichissement conditionnel
    "roles": [
        "PAX_ADMIN", "HSE_ADMIN", "REQUESTER",
        "VAL_N1", "VAL_N2", "EXT_SUPV", "MEDICAL"
    ],
    "permissions": [
        "paxlog.ads.create", "paxlog.ads.read", "paxlog.ads.validate",
        "paxlog.compliance.manage", "paxlog.rotation.manage",
    ],
    "event_subscriptions": [
        "planner.activity.approved",
        "projets.task.assigned",
    ],
    "event_publications": [
        "paxlog.ads.validated",
        "paxlog.pax.checked_in",
    ],
    "routes_prefix": "/api/v1/pax",
    "settings_definitions": [...],
}

async def init_module(app):
    register_module(app, MODULE_MANIFEST)
```

### 1.2. Dependances inter-modules

Les modules sont **independants** les uns des autres. L'enrichissement se fait par **evenements** : quand un module detecte la presence d'un autre module enregistre, il active des fonctionnalites supplementaires.

```python
# Enrichissement conditionnel
if module_registry.is_active("planner"):
    # Activer le listener planner.activity.approved → generer AdS auto
    event_bus.subscribe("planner.activity.approved", handle_activity_approved)
```

---

## 2. Stack technique — Versions exactes

### Backend

```
Python          3.12
FastAPI         0.111+
SQLAlchemy      2.0+          (ORM async — PAS SQLModel)
Alembic         1.13+         (migrations)
PostgreSQL      16
pgvector        0.7+          (extension PostgreSQL pour RAG)
Redis           7
APScheduler     3.10+         (task queue / cron — PAS ARQ)
LiteLLM         1.40+         (proxy IA multi-provider)
Ollama          latest        (provider IA on-premise)
Pytesseract     0.3+          (OCR)
Pypdf2          3+            (lecture PDF)
Cryptography    42+           (AES-256-GCM)
Python-jose     3.3+          (JWT)
Httpx           0.27+         (client HTTP async)
Pytest          8+            (tests)
Ruff            0.4+          (linter + formatter)
```

### Frontend

```
Node            20 LTS
React           18.3+
TypeScript      5.4+
Vite            5+
TailwindCSS     3.4+
shadcn/ui       latest        (Radix UI + Tailwind — style visuel Pajamas)
React Router    6.23+         (routing)
React Query     5             (TanStack Query v5, state serveur)
Zustand         4.5+          (state client)
React Hook Form 7.51+         (formulaires)
Zod             3.23+         (validation schemas)
BlockNote       0.14+         (editeur riche, base TipTap/ProseMirror)
Yjs             13.6+         (CRDT collaboration)
Hocuspocus      2+            (serveur WebSocket Yjs)
React Flow      11.11+        (graphes workflow)
GridStack.js    10+           (dashboard drag&drop)
Recharts        2.12+         (graphiques)
Dexie.js        3.2+          (IndexedDB wrapper)
Workbox         7+            (Service Worker PWA — offline-first)
Leaflet         1.9+          (cartographie)
Axios           1.6+          (HTTP client)
date-fns        3+            (dates)
Lucide React    0.380+        (icones)
```

### Infrastructure

```
Docker          26+
Docker Compose  2.27+
Dokploy         latest        (PaaS self-hosted)
Traefik         3+            (reverse proxy + SSL)
GitHub Actions  latest        (CI/CD)
MinIO           latest        (S3-compatible — dev)
AWS S3                        (S3-compatible — prod)
```

### Extensions PostgreSQL

```
pg_trgm         (recherche floue)
pgvector        (embeddings RAG)
ltree           (hierarchie assets)
PostGIS         (coordonnees geographiques)
pg_partman      (partitionnement audit_log)
```

### Docker v1 — 6 conteneurs

```
┌─────────────────────────────────────────────────┐
│  traefik        (reverse proxy + SSL + routing) │
├─────────────────────────────────────────────────┤
│  backend        (FastAPI + APScheduler)         │
│  frontend       (React PWA principale)          │
│  web-portal     (portail web public)            │
│  postgres       (PostgreSQL 16 + extensions)    │
│  redis          (cache + pub/sub)               │
└─────────────────────────────────────────────────┘

Portails supplementaires deployes plus tard :
  captain         (portail capitaine TravelWiz)
  ext-paxlog      (portail externe PaxLog)
```

> **Note** : APScheduler est embarque dans le conteneur backend. Pas de conteneur worker separe.

---

## 3. Decisions d'architecture — Finales et non revisables

| ID | Decision | Choix retenu | Raison |
|---|---|---|---|
| D01 | Multi-tenant DB | Schema PostgreSQL par tenant (isolation schema) + entity_id (filtre ligne) + BU/dept (filtre hybride par module) | 3 niveaux d'isolation. `SET search_path` pour le routing. DB centrale stocke la liste des tenants. |
| D02 | ORM | SQLAlchemy 2.0 async | ORM complet, pas SQLModel. Pydantic v2 pour les schemas separement. |
| D03 | Task queue | APScheduler | Embarque dans le backend, pas de conteneur worker separe. Pas d'ARQ. |
| D04 | Event bus | PostgreSQL LISTEN/NOTIFY + event_store | Persistance native, pas de dict Python en memoire. Redis pub/sub en fallback si scale requis. |
| D05 | UI | shadcn/ui (Radix UI + Tailwind CSS) | Style visuel Pajamas. Composants accessibles, dark mode natif. |
| D06 | Storage | S3-compatible (MinIO dev, AWS S3 prod) | Pas d'Azure. Backend `minio` ou `s3` uniquement. |
| D07 | Domaines | *.opsflux.io | `www.opsflux.io` (vitrine), `app.opsflux.io` (PWA), `web.opsflux.io` (portail public), `api.opsflux.io` (API) |
| D08 | MCP | Embarque dans le core, modules = plugins | Pas de serveur MCP separe. `mcp_registry` dans le core. |
| D09 | RBAC | Permissions granulaires `resource.action` | Roles = groupements de permissions. Modules definissent leurs propres roles. User → Group → Roles → Permissions + scope optionnel (entity, asset). Roles core : `platform_admin`, `tenant_admin`. |
| D10 | Module registration | ModuleRegistry au startup | Chaque module appelle `core.register_module()`. |
| D11 | Module dependencies | Independants + enrichissement | Events activent des fonctionnalites quand d'autres modules sont presents. |
| D12 | Asset Registry | Hierarchie dynamique, types configurables par tenant | Pas en lecture seule — acces selon les roles. Admin cree directement, ingenieur cree en draft avec validation. |
| D13 | Auth | Multi-provider configurable | SAML 2.0 + OIDC + LDAP. JIT provisioning. |
| D14 | i18n | FR + EN | Interface bilingue, labels en JSONB `{"fr": "...", "en": "..."}`. |
| D15 | Offline | PWA offline-first | Workbox (Service Worker) + IndexedDB (Dexie.js). Sync auto reconnexion. |
| D16 | Scope v1 | Core d'abord | v1.0 = Core. v1.x = PAX/Logistique. v2 = ReportEditor, PID/PFD, Collab RT. |
| D17 | Editeur riche | BlockNote (MIT) | Notion-like OOTB, base TipTap/ProseMirror, extensions compatibles. |
| D18 | Collab RT | Yjs + Hocuspocus | Standard industrie. Merge offline/online automatique. CRDT partout. |
| D19 | Workflow UI | React Flow (MIT) | JSON portable, FSM interprete cote backend Python. |
| D20 | PID/PFD moteur | draw.io (mxGraph) via iframe API | Open source, connu ingenieurs, export DXF natif. |
| D21 | IA proxy | LiteLLM | Interface unifiee multi-provider. Ollama on-premise par defaut. |
| D22 | Vecteurs RAG | pgvector | Extension PostgreSQL existante. Pas d'infra supplementaire. |
| D23 | Chiffrement | AES-256-GCM | `SECRET_KEY` env var → cle 32 bytes. Credentials chiffres en DB. |
| D24 | Cartographie | Provider configurable via Settings | Leaflet/OSM gratuit par defaut. Google Maps / Mapbox en option. |
| D25 | Testing | Tests unitaires critiques | Endpoints FastAPI + services metier cles. Critere : 0 bug bloquant. |
| D26 | CI/CD | GitHub Actions | Lint+test a chaque push, build+deploy staging auto sur develop, deploy prod manuel sur main. |
| D27 | Monitoring | Sentry + Grafana + Prometheus | Sentry (erreurs), Prometheus (metriques), Grafana (dashboards ops). |
| D28 | Envs | 3 envs distincts | dev / staging / prod. `.env` par env. Zero modification manuelle au deploiement. |
| D29 | State management | Zustand (client) + React Query (serveur) | Zustand pour UI state, React Query pour toutes les donnees serveur avec cache. |
| D30 | Formulaires | React Hook Form + Zod | Standard, performances, validation typee. |

---

## 4. Multi-tenant — Modele a 3 niveaux

### Niveau 1 : Tenant (isolation par schema PostgreSQL)

Chaque tenant a son propre schema PostgreSQL. Le routage se fait via `SET search_path`.

```python
# modules/core/database.py

async def get_tenant_session(tenant_slug: str) -> AsyncSession:
    """Retourne une session DB avec le search_path du tenant."""
    session = async_session_factory()
    await session.execute(text(f"SET search_path TO tenant_{tenant_slug}, shared, public"))
    return session
```

```sql
-- Base de donnees centrale (schema public)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,    -- utilise pour le nom du schema
    settings JSONB NOT NULL DEFAULT '{}',
    modules_enabled JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chaque tenant a un schema : tenant_<slug>
-- Ex: tenant_perenco_cmr, tenant_perenco_gab
```

### Niveau 2 : Entity (filtre entity_id par ligne)

Au sein d'un schema tenant, les donnees sont filtrees par `entity_id` (filiale, site, organisation).

```sql
-- Dans le schema du tenant
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,      -- ex: "PER_CMR"
    name VARCHAR(200) NOT NULL,            -- ex: "Perenco Cameroun"
    country VARCHAR(100),
    timezone VARCHAR(50) DEFAULT 'Africa/Douala',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Regles d'implementation** :
- Toutes les tables metier principales ont `entity_id UUID NOT NULL REFERENCES entities(id)`
- Toutes les requetes API filtrent par `entity_id` de l'utilisateur connecte
- Le header HTTP `X-Entity-ID` selectionne l'entite active si l'utilisateur en a plusieurs
- Les referentiels globaux (`credential_types`, `article_catalog`, `roles`) n'ont PAS d'`entity_id`
- Les referentiels par entite (`compliance_matrix`, `asset_capacities`) ONT un `entity_id`

```python
# modules/core/deps.py — Dependency FastAPI
async def get_current_entity(
    request: Request,
    current_user: User = Depends(get_current_user)
) -> UUID:
    entity_id = request.headers.get("X-Entity-ID")
    if entity_id:
        if not await user_has_entity_access(current_user.id, UUID(entity_id)):
            raise HTTPException(403, "Acces refuse a cette entite")
        return UUID(entity_id)
    return current_user.default_entity_id

# Toujours filtrer par entity_id — jamais d'exception
result = await db.execute(
    select(Activity).where(
        Activity.entity_id == entity_id,  # OBLIGATOIRE
        Activity.status == "approved"
    )
)
```

### Niveau 3 : BU / Departement (filtre hybride par module)

```sql
CREATE TABLE business_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    parent_bu_id UUID REFERENCES business_units(id),
    entity_id UUID NOT NULL REFERENCES entities(id),
    metadata JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (entity_id, code)
);

CREATE TABLE user_business_units (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bu_id UUID NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    scope_level VARCHAR(20) NOT NULL DEFAULT 'full',
    -- full = acces complet, read = lecture seule hors BU primaire
    PRIMARY KEY (user_id, bu_id)
);
```

### Middleware de resolution tenant + entity

```python
# modules/core/middleware/tenant.py

class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        token = extract_bearer_token(request)
        if not token:
            return JSONResponse(status_code=401, content={"detail": "Non authentifie"})

        payload = decode_jwt(token)
        user_id = payload.get("sub")
        tenant_slug = payload.get("tenant_slug")

        if not tenant_slug:
            return JSONResponse(status_code=400, content={"detail": "tenant manquant dans le token"})

        # SET search_path pour isoler le schema
        request.state.tenant_slug = tenant_slug
        request.state.user_id = user_id

        # BU active (depuis preferences ou BU primaire)
        request.state.bu_id = await get_active_bu(user_id)

        return await call_next(request)
```

---

## 5. RBAC — Permissions granulaires

### Modele : User → Group → Roles → Permissions

```sql
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(200) UNIQUE NOT NULL,    -- ex: "paxlog.ads.create"
    description TEXT,
    module_slug VARCHAR(100),             -- module qui a enregistre cette permission
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,     -- ex: "PAX_ADMIN"
    name JSONB NOT NULL,                  -- {"fr": "Admin PaxLog", "en": "PaxLog Admin"}
    module_slug VARCHAR(100),             -- NULL = role core
    is_system BOOLEAN DEFAULT FALSE,      -- roles non supprimables
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    entity_id UUID REFERENCES entities(id),  -- NULL = groupe cross-entity
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE group_roles (
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, role_id)
);

CREATE TABLE user_groups (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    scope_type VARCHAR(50),               -- 'entity' | 'asset' | NULL (global)
    scope_id UUID,                        -- id de l'entity ou asset concerne
    PRIMARY KEY (user_id, group_id)
);
```

### Roles core (systeme)

| Role | Code | Description |
|---|---|---|
| Admin Plateforme | `platform_admin` | Super-admin, acces total cross-tenant |
| Admin Tenant | `tenant_admin` | Admin d'un tenant, gestion users/roles/config |

### Roles metier (enregistres par les modules)

| Role | Code | Module | Description |
|---|---|---|---|
| Directeur Operations | `DO` | planner | Arbitre final Planner |
| Admin HSE | `HSE_ADMIN` | paxlog | Matrice prerequis |
| Admin PaxLog | `PAX_ADMIN` | paxlog | Configuration PaxLog |
| Responsable Site | `SITE_MGR` | core | Gestion site, capacites asset |
| Chef de Projet | `PROJ_MGR` | projets | CRUD projets, WBS, Gantt |
| Responsable Maintenance | `MAINT_MGR` | planner | Activites maintenance |
| Coordinateur Logistique | `LOG_COORD` | travelwiz | Manifestes, cargo |
| Coordinateur Transport | `TRANSP_COORD` | travelwiz | Vecteurs, rotations |
| Validateur N1 | `VAL_N1` | paxlog | Validation AdS niveau 1 |
| Validateur N2 | `VAL_N2` | paxlog | Validation AdS niveau 2 |
| Demandeur interne | `REQUESTER` | paxlog | Creer AdS |
| Superviseur Externe | `EXT_SUPV` | paxlog | Portail externe, saisie PAX |
| Service Medical | `MEDICAL` | paxlog | Donnees aptitude medicale |
| Lecteur | `READER` | core | Consultation seule, aucune ecriture |

### Decorateur de permission

```python
# modules/core/rbac.py

def requires_permission(permission: str):
    """Dependency FastAPI pour verifier une permission granulaire."""
    async def dependency(request: Request, db: AsyncSession = Depends(get_db)):
        user_id = request.state.user_id
        has_perm = await check_user_permission(db, user_id, permission)
        if not has_perm:
            raise HTTPException(
                status_code=403,
                detail=f"Permission '{permission}' requise"
            )
    return Depends(dependency)

# Shortcuts pour compatibilite
def require_role(role_code: str):
    """Verifie que l'utilisateur a un role specifique."""
    ...

def require_any_role(*role_codes: str):
    """Verifie que l'utilisateur a au moins un des roles."""
    ...

# Usage
@router.post("/documents", dependencies=[requires_permission("document.create")])
async def create_document(...): ...

@router.post("/conflicts/{id}/resolve", dependencies=[Depends(require_role("DO"))])
async def resolve_conflict(...): ...
```

---

## 6. Hierarchie des assets (Asset Registry)

**Decision D12** : Asset Registry est un module core. La hierarchie est dynamique et les types sont configurables par tenant. L'acces est base sur les roles :
- **Admin** : cree des assets directement
- **Ingenieur** : cree en draft avec validation requise

```
Filiale (entity)
  └── Champ (field)
        └── Site
              └── Plateforme
                    └── Puits
```

La hierarchie est stockee avec l'extension `ltree` :

```sql
ALTER TABLE assets ADD COLUMN path ltree;
-- ex: 'perenco_cam.champ_ebome.site_munja.plateforme_esf1'

-- Tous les enfants d'un champ
SELECT * FROM assets WHERE path <@ 'perenco_cam.champ_ebome';

-- Tous les parents d'un asset
SELECT * FROM assets WHERE 'perenco_cam.champ_ebome.site_munja' <@ path;
```

**API Asset Registry** :
```
GET  /api/v1/assets                    → liste (filtrable par type, parent, entity_id)
GET  /api/v1/assets/:id                → detail (avec coordonnees GPS)
GET  /api/v1/assets/:id/children       → enfants directs
GET  /api/v1/assets/:id/ancestors      → parents jusqu'a la racine
GET  /api/v1/assets/search?q=munja     → recherche textuelle
POST /api/v1/assets                    → creation (admin: directe, ingenieur: draft)
PUT  /api/v1/assets/:id                → mise a jour
POST /api/v1/assets/:id/validate       → validation d'un draft
```

---

## 7. Module Tiers

Le module Tiers du core gere les entreprises. Les modules metier l'etendent (ex: PaxLog ajoute les groupes sous-traitants).

```sql
-- Table core (modules/core/models/tiers.py)
CREATE TABLE tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50),           -- contractor | supplier | client | internal
    active BOOLEAN DEFAULT TRUE,
    archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extension PaxLog : groupes et habilitations sous-traitants
CREATE TABLE pax_company_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    tiers_id UUID NOT NULL REFERENCES tiers(id),
    group_name VARCHAR(200) NOT NULL,      -- "Equipe Drilling DIXSTONE"
    supervisor_id UUID REFERENCES users(id),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Un superviseur externe ne voit que les PAX de son groupe
```

---

## 8. Event bus inter-modules

**Decision D04** : PostgreSQL LISTEN/NOTIFY + table `event_store` pour persistance et replay.

```python
# modules/core/events.py

async def emit_event(event_name: str, payload: dict, db: AsyncSession) -> None:
    """
    Emet un evenement APRES le COMMIT de la transaction.
    NE JAMAIS emettre dans une transaction (risque de rollback sans notification).
    """
    # 1. Persister dans event_store
    await db.execute(
        insert(event_store).values(
            event_name=event_name,
            payload=payload,
            emitted_at=func.now()
        )
    )
    await db.commit()

    # 2. Notifier les listeners via PostgreSQL NOTIFY
    await db.execute(
        text(f"NOTIFY {event_name}, :payload"),
        {"payload": json.dumps(payload)}
    )

# modules/core/event_listener.py
async def start_event_listeners():
    """Demarre les listeners PostgreSQL LISTEN au startup."""
    conn = await asyncpg.connect(DATABASE_URL)
    for event_name, handler in event_registry.items():
        await conn.add_listener(event_name, handler)
```

```sql
CREATE TABLE event_store (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name VARCHAR(200) NOT NULL,
    payload JSONB NOT NULL,
    emitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ
);
CREATE INDEX idx_event_store_name ON event_store(event_name, emitted_at DESC);
CREATE INDEX idx_event_store_pending ON event_store(processed, emitted_at) WHERE processed = FALSE;
```

Les handlers sont dans `modules/*/event_handlers/`. Voir `05_INTERACTIONS.md` pour tous les evenements et leurs payloads.

---

## 9. Audit log

Toute modification d'une entite metier genere un enregistrement dans `audit_log` :

```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,       -- created | updated | status_changed | archived
    changed_fields JSONB,
    old_values JSONB,
    new_values JSONB,
    performed_by UUID REFERENCES users(id),
    performed_at TIMESTAMPTZ DEFAULT NOW(),
    source VARCHAR(20) DEFAULT 'api',  -- api | mcp | system | batch
    mcp_tool VARCHAR(100),             -- si source=mcp
    ip_address INET,
    user_agent TEXT
) PARTITION BY RANGE (performed_at);
-- Partition trimestrielle via pg_partman

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_user   ON audit_log(performed_by);
CREATE INDEX idx_audit_at     ON audit_log(performed_at DESC);
```

**Middleware d'audit** :
```python
# modules/core/audit.py
# Intercepte automatiquement les INSERT/UPDATE SQLAlchemy via event listeners
# Loguer old_values/new_values sur UPDATE
# Loguer performed_by depuis le contexte de la requete HTTP
```

**Regle absolue** : les tables de donnees metier ne sont JAMAIS supprimees physiquement (`DELETE`). Uniquement `archived=TRUE` ou `active=FALSE`.

---

## 10. Conventions API

### Format de reponse standard

```json
// Succes — liste paginee
{
  "data": [...],
  "meta": {
    "total": 150,
    "page": 1,
    "per_page": 20,
    "total_pages": 8
  }
}

// Succes — objet unique
{
  "data": { ... }
}

// Erreur
{
  "error": {
    "code": "CAPACITY_EXCEEDED",
    "message": "Le quota de PAX depasse la capacite residuelle de l'asset",
    "details": {
      "requested": 8,
      "residual": 3,
      "asset_id": "uuid",
      "period": "2026-05-01 / 2026-05-15"
    }
  }
}
```

### Codes d'erreur

| HTTP | Code | Description |
|---|---|---|
| 400 | `INVALID_DATES` | end_date < start_date |
| 400 | `MISSING_REQUIRED_FIELD` | Champ obligatoire absent |
| 400 | `INVALID_TRANSITION` | Transition de statut non autorisee |
| 400 | `MISSING_REASON` | Motif obligatoire absent |
| 400 | `IMPUTATION_NOT_100` | Sum(percentage) ≠ 100 |
| 401 | `UNAUTHORIZED` | JWT absent ou invalide |
| 403 | `FORBIDDEN` | Droits insuffisants |
| 403 | `ASSET_NOT_IN_ENTITY` | Asset n'appartient pas a l'entite de l'user |
| 404 | `NOT_FOUND` | Entite introuvable |
| 409 | `CAPACITY_EXCEEDED` | Depassement capacite PAX |
| 409 | `WOULD_CREATE_CYCLE` | Dependance creerait un cycle dans le planning |
| 409 | `DUPLICATE_CODE` | Code deja utilise |
| 409 | `USE_SIMULATION` | Modification sur schedule active → passer par simulation |
| 422 | `VALIDATION_ERROR` | Pydantic validation error (format standard FastAPI) |
| 429 | `RATE_LIMITED` | Trop de requetes |
| 500 | `INTERNAL_ERROR` | Erreur serveur |

### Pagination

Toutes les listes supportent `?page=1&per_page=20` (max 100). Headers Link pour la navigation.

### Timestamps

Tous les timestamps sont en UTC dans la base (`TIMESTAMPTZ`). L'API retourne du ISO 8601 UTC. Le frontend affiche en timezone configuree (defaut UTC+1 Douala), modifiable dans le profil utilisateur.

### Versioning API

Routes prefixees `/api/v1/`. Pas de breaking changes sans bump de version.

### i18n

Toutes les reponses API supportent le header `Accept-Language: fr|en`. Labels en JSONB `{"fr": "...", "en": "..."}` dans la base.

---

## 11. Structure complete du projet

```
opsflux/
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                     # lint + test a chaque push
│   │   └── deploy.yml                 # build + deploy staging/prod
│   └── CODEOWNERS
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                    # Point d'entree FastAPI, middlewares, routes
│   │   │
│   │   ├── api/
│   │   │   ├── deps.py                # Dependencies (get_current_user, get_entity, etc.)
│   │   │   └── routes/
│   │   │       ├── core/
│   │   │       │   ├── auth.py
│   │   │       │   ├── users.py
│   │   │       │   ├── tenants.py
│   │   │       │   ├── rbac.py
│   │   │       │   ├── notifications.py
│   │   │       │   ├── search.py
│   │   │       │   ├── extrafields.py
│   │   │       │   ├── workflow.py
│   │   │       │   ├── attachments.py
│   │   │       │   ├── export.py
│   │   │       │   ├── connectors.py
│   │   │       │   ├── navigation.py
│   │   │       │   ├── preferences.py
│   │   │       │   ├── bookmarks.py
│   │   │       │   └── recommendations.py
│   │   │       └── modules/
│   │   │           ├── assets.py
│   │   │           ├── tiers.py
│   │   │           ├── dashboard.py
│   │   │           ├── calendar.py
│   │   │           ├── projets.py         # v1.x
│   │   │           ├── planner.py         # v1.x
│   │   │           ├── paxlog.py          # v1.x
│   │   │           ├── travelwiz.py       # v1.x
│   │   │           ├── report.py          # v2
│   │   │           └── pid_pfd.py         # v2
│   │   │
│   │   ├── core/                          # modules/core/*
│   │   │   ├── config.py                  # Settings Pydantic (depuis env vars)
│   │   │   ├── security.py                # JWT, OAuth2, password hashing
│   │   │   ├── database.py                # Engine SQLAlchemy 2.0 async, session factory
│   │   │   ├── redis.py                   # Redis connection pool
│   │   │   ├── events.py                  # Event bus (PG LISTEN/NOTIFY + event_store)
│   │   │   ├── audit.py                   # Audit log middleware
│   │   │   ├── registry.py               # ModuleRegistry
│   │   │   └── middleware/
│   │   │       ├── tenant.py              # Resolution tenant schema (SET search_path)
│   │   │       ├── entity_scope.py        # Injection entity_id dans request.state
│   │   │       ├── bu_scope.py            # Injection BU active dans request.state
│   │   │       ├── rbac.py                # @requires_permission
│   │   │       ├── security_headers.py
│   │   │       └── rate_limit.py
│   │   │
│   │   ├── models/                        # SQLAlchemy 2.0 ORM models
│   │   │   ├── core/
│   │   │   │   ├── tenant.py
│   │   │   │   ├── user.py
│   │   │   │   ├── rbac.py                # permissions, roles, groups, user_groups
│   │   │   │   ├── entity.py
│   │   │   │   ├── business_unit.py
│   │   │   │   ├── notification.py
│   │   │   │   ├── extrafield.py
│   │   │   │   ├── workflow.py
│   │   │   │   ├── attachment.py
│   │   │   │   ├── event_store.py
│   │   │   │   ├── audit_log.py
│   │   │   │   ├── object_activity.py
│   │   │   │   ├── object_relation.py
│   │   │   │   └── module_settings.py
│   │   │   └── modules/
│   │   │       ├── asset.py
│   │   │       ├── tiers.py
│   │   │       ├── dashboard.py
│   │   │       ├── calendar.py
│   │   │       ├── projets/               # v1.x
│   │   │       ├── planner/               # v1.x
│   │   │       ├── paxlog/                # v1.x
│   │   │       ├── travelwiz/             # v1.x
│   │   │       ├── document.py            # v2
│   │   │       └── pid.py                 # v2
│   │   │
│   │   ├── schemas/                       # Pydantic v2 request/response schemas
│   │   │   ├── core/
│   │   │   └── modules/
│   │   │
│   │   ├── services/
│   │   │   ├── core/
│   │   │   │   ├── auth_service.py
│   │   │   │   ├── rbac_service.py
│   │   │   │   ├── notification_service.py
│   │   │   │   ├── email_service.py
│   │   │   │   ├── workflow_service.py
│   │   │   │   ├── extrafield_service.py
│   │   │   │   ├── export_service.py
│   │   │   │   ├── storage_service.py     # S3-compatible (MinIO/S3)
│   │   │   │   ├── search_service.py
│   │   │   │   ├── ai_service.py
│   │   │   │   ├── map_service.py
│   │   │   │   ├── ocr_service.py
│   │   │   │   ├── recommendation_service.py
│   │   │   │   └── bookmark_service.py
│   │   │   └── modules/
│   │   │       ├── asset_service.py
│   │   │       ├── tiers_service.py
│   │   │       ├── dashboard_service.py
│   │   │       ├── projets_service.py     # v1.x
│   │   │       ├── planner_service.py     # v1.x
│   │   │       ├── paxlog_service.py      # v1.x
│   │   │       ├── travelwiz_service.py   # v1.x
│   │   │       ├── report_service.py      # v2
│   │   │       └── pid_service.py         # v2
│   │   │
│   │   ├── event_handlers/                # Handlers evenements inter-modules
│   │   │   ├── paxlog_handlers.py
│   │   │   ├── planner_handlers.py
│   │   │   └── travelwiz_handlers.py
│   │   │
│   │   ├── tasks/                         # APScheduler crons (embarque dans backend)
│   │   │   ├── scheduler.py               # Configuration APScheduler
│   │   │   ├── email_tasks.py
│   │   │   ├── ai_indexer.py
│   │   │   └── recommendation_tasks.py
│   │   │
│   │   └── mcp/                           # MCP embarque dans le core
│   │       ├── registry.py                # mcp_registry — modules s'enregistrent comme plugins
│   │       ├── security.py
│   │       └── tools/
│   │           ├── documents.py
│   │           ├── workflow.py
│   │           ├── data.py
│   │           ├── assets.py
│   │           └── reports.py
│   │
│   ├── alembic/
│   │   ├── env.py                         # Multi-schema aware
│   │   ├── script.py.mako
│   │   └── versions/
│   │       ├── 0001_core_tenants_users.py
│   │       ├── 0002_core_rbac_permissions.py
│   │       ├── 0003_core_entities_bu.py
│   │       ├── 0004_core_workflow.py
│   │       ├── 0005_core_extrafields.py
│   │       ├── 0006_core_notifications.py
│   │       ├── 0007_core_event_store.py
│   │       ├── 0008_core_audit_log.py
│   │       └── ...
│   │
│   ├── tests/
│   │   ├── conftest.py                    # fixtures pytest (db test, client, auth)
│   │   ├── core/
│   │   │   ├── test_auth.py
│   │   │   ├── test_rbac.py
│   │   │   ├── test_workflow.py
│   │   │   ├── test_events.py
│   │   │   └── test_extrafields.py
│   │   └── modules/
│   │       ├── test_assets.py
│   │       ├── test_tiers.py
│   │       ├── test_paxlog.py
│   │       └── test_dashboard.py
│   │
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   └── Dockerfile
│
├── frontend/                              # PWA principale
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                        # Router + Providers
│   │   │
│   │   ├── components/
│   │   │   ├── core/
│   │   │   │   ├── AppShell.tsx           # Layout (topbar + sidebar + panneaux)
│   │   │   │   ├── Topbar.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── NavItem.tsx
│   │   │   │   ├── StaticPanel.tsx
│   │   │   │   ├── DynamicPanel.tsx
│   │   │   │   ├── AIPanel.tsx
│   │   │   │   ├── GlobalSearch.tsx
│   │   │   │   ├── NotificationBell.tsx
│   │   │   │   ├── TenantSwitcher.tsx
│   │   │   │   ├── EntitySwitcher.tsx
│   │   │   │   ├── BUSwitcher.tsx
│   │   │   │   ├── StatusBadge.tsx
│   │   │   │   ├── SmartCombobox.tsx
│   │   │   │   ├── SmartEmptyState.tsx
│   │   │   │   ├── PanelSection.tsx
│   │   │   │   ├── ActivityTimeline.tsx
│   │   │   │   └── BookmarkSuggestion.tsx
│   │   │   ├── ui/                        # shadcn/ui (Radix UI + Tailwind)
│   │   │   └── modules/
│   │   │       ├── assets/
│   │   │       ├── tiers/
│   │   │       ├── dashboard/
│   │   │       ├── projets/               # v1.x
│   │   │       ├── planner/               # v1.x
│   │   │       ├── paxlog/                # v1.x
│   │   │       ├── travelwiz/             # v1.x
│   │   │       ├── report/                # v2
│   │   │       └── pid/                   # v2
│   │   │
│   │   ├── pages/
│   │   │   ├── core/
│   │   │   │   └── settings/
│   │   │   └── modules/
│   │   │       ├── assets/
│   │   │       ├── tiers/
│   │   │       ├── dashboards/
│   │   │       ├── projets/
│   │   │       ├── planner/
│   │   │       ├── paxlog/
│   │   │       ├── travelwiz/
│   │   │       ├── documents/
│   │   │       └── pid/
│   │   │
│   │   ├── hooks/
│   │   │   ├── useBreakpoint.ts
│   │   │   ├── useUserPreference.ts
│   │   │   ├── useBreadcrumbs.ts
│   │   │   ├── useObjectDetails.ts
│   │   │   ├── useNavBadges.ts
│   │   │   └── useAIBriefing.ts
│   │   │
│   │   ├── stores/
│   │   │   ├── uiStore.ts                 # Zustand : layout, panneaux, selection
│   │   │   ├── authStore.ts               # Zustand : user, tenant, entity, permissions
│   │   │   └── offlineStore.ts            # Zustand : queue de sync offline
│   │   │
│   │   ├── lib/
│   │   │   ├── api.ts                     # Axios (auth, tenant header, entity header)
│   │   │   ├── offline.ts                 # Dexie.js schema + helpers
│   │   │   ├── queryClient.ts             # TanStack Query configuration
│   │   │   └── utils.ts                   # cn(), formatDate(), etc.
│   │   │
│   │   ├── styles/
│   │   │   └── globals.css                # Variables CSS + Tailwind imports
│   │   │
│   │   └── service-worker.ts              # Workbox (offline-first PWA)
│   │
│   ├── public/
│   │   └── manifest.json                  # PWA manifest
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── Dockerfile
│
├── apps/                                  # Portails externes (apps legeres)
│   ├── captain/                           # Portail capitaine TravelWiz
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── pages/TripDashboard.tsx
│   │   │   ├── pages/ManifestCheck.tsx
│   │   │   ├── pages/EventLogger.tsx
│   │   │   └── sw.ts                      # Service Worker offline
│   │   └── vite.config.ts
│   └── ext-paxlog/                        # Portail externe PaxLog
│       ├── src/
│       │   ├── App.tsx
│       │   ├── pages/AdSForm.tsx
│       │   ├── pages/PaxEntry.tsx
│       │   └── sw.ts
│       └── vite.config.ts
│
├── docker/
│   ├── docker-compose.base.yml            # Services communs (postgres, redis, minio)
│   ├── docker-compose.dev.yml             # Volumes locaux, hot reload
│   ├── docker-compose.staging.yml         # Images registry, env staging
│   └── docker-compose.prod.yml            # Images registry, env prod, Traefik
│
├── .env.example
├── .env.dev                               # Dev local (dans .gitignore)
├── .gitignore
└── CHANGELOG.md
```

---

## 12. Portails externes (apps legeres)

Deux mini-apps React separees, deployees sur sous-domaines distincts.

| App | URL | Acces | Techno |
|---|---|---|---|
| Portail capitaine | `captain.opsflux.io/{code}` | Code 6 chiffres | React leger + Service Worker |
| Portail externe PaxLog | `ext.opsflux.io/{token}` | Token OTP | React leger + Service Worker |

**Contraintes des apps legeres** :
- Bundle < 200kb gzipped (pas de lib lourde)
- Offline-first : Service Worker obligatoire — actions bufferisees si pas de reseau, sync auto a la reconnexion
- Pas d'authentification JWT — acces par code/token uniquement
- Rate limiting strict : 10 req/min par IP sur leurs endpoints API
- Pas d'acces a d'autres donnees OpsFlux que celles du trip/AdS cible

---

## 13. Schema DB — Tables fondamentales Core

> Les tables des modules sont dans leurs fichiers respectifs (01_MODULE_*.md a 04_MODULE_*.md)

```sql
-- =====================================================
-- USERS (dans le schema du tenant)
-- =====================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    oauth_sub VARCHAR(255) UNIQUE,        -- subject du provider SSO
    avatar_url TEXT,
    primary_bu_id UUID,
    default_entity_id UUID REFERENCES entities(id),
    preferred_lang VARCHAR(5) DEFAULT 'fr', -- fr | en
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- OBJECT CAPABILITIES (polymorphiques)
-- Pattern : object_type + object_id (UUID)
-- =====================================================

CREATE TABLE object_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    version_label VARCHAR(20) NOT NULL,
    data JSONB NOT NULL,                   -- snapshot complet
    change_summary TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- IMMUABLE : jamais UPDATE/DELETE
);
CREATE INDEX idx_object_versions_lookup ON object_versions(object_type, object_id);

CREATE TABLE object_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    file_id UUID NOT NULL REFERENCES stored_files(id),
    label VARCHAR(255),
    display_order INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_object_attachments_lookup ON object_attachments(object_type, object_id);

CREATE TABLE object_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    author_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    parent_id UUID REFERENCES object_comments(id),
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_object_comments_lookup ON object_comments(object_type, object_id);

CREATE TABLE object_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    actor_id UUID REFERENCES users(id),
    actor_type VARCHAR(20) NOT NULL DEFAULT 'user',  -- user | ai | system
    action VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- IMMUABLE : jamais UPDATE/DELETE
);
CREATE INDEX idx_object_activity_lookup ON object_activity(object_type, object_id, created_at DESC);

CREATE TABLE object_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_type VARCHAR(100) NOT NULL,
    from_id UUID NOT NULL,
    relation_type VARCHAR(100) NOT NULL,
    to_type VARCHAR(100) NOT NULL,
    to_id UUID NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (from_type, from_id, relation_type, to_type, to_id)
);

CREATE TABLE object_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    label_text VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#6B7280',
    created_by UUID REFERENCES users(id)
);

CREATE TABLE object_watchers (
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (object_type, object_id, user_id)
);

-- =====================================================
-- CUSTOM FIELDS ENGINE (Extrafields)
-- =====================================================

CREATE TABLE extrafield_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_type VARCHAR(100) NOT NULL,
    field_key VARCHAR(100) NOT NULL,
    label JSONB NOT NULL,                  -- {"fr": "...", "en": "..."}
    field_type VARCHAR(50) NOT NULL,
    -- text_short|text_long|number_int|number_decimal|boolean|date|datetime
    -- select_static|select_dynamic|reference|formula|file|geolocation
    options JSONB NOT NULL DEFAULT '{}',
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_searchable BOOLEAN NOT NULL DEFAULT TRUE,
    is_filterable BOOLEAN NOT NULL DEFAULT TRUE,
    is_exportable BOOLEAN NOT NULL DEFAULT TRUE,
    is_importable BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    display_group VARCHAR(100),
    scope VARCHAR(20) NOT NULL DEFAULT 'tenant',
    module_origin VARCHAR(100),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (object_type, field_key)
);

CREATE TABLE extrafield_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id UUID NOT NULL REFERENCES extrafield_definitions(id) ON DELETE CASCADE,
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    value_text TEXT,
    value_number NUMERIC,
    value_date TIMESTAMPTZ,
    value_json JSONB,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (definition_id, object_id)
);
CREATE INDEX idx_extrafield_values_lookup ON extrafield_values(object_type, object_id);

-- =====================================================
-- STORAGE (S3-compatible : MinIO dev, S3 prod)
-- =====================================================

CREATE TABLE stored_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_filename VARCHAR(500) NOT NULL,
    storage_backend VARCHAR(20) NOT NULL DEFAULT 'minio',  -- minio | s3
    storage_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    checksum VARCHAR(64),                  -- SHA-256
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- =====================================================
-- MODULE SETTINGS
-- =====================================================

CREATE TABLE module_settings_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_slug VARCHAR(100) NOT NULL,
    setting_key VARCHAR(100) NOT NULL,
    label JSONB NOT NULL,
    field_type VARCHAR(50) NOT NULL,
    options JSONB NOT NULL DEFAULT '{}',
    default_value JSONB,
    scope VARCHAR(20) NOT NULL DEFAULT 'tenant',
    display_group VARCHAR(100),
    display_order INTEGER NOT NULL DEFAULT 0,
    requires_permission VARCHAR(255),
    UNIQUE (module_slug, setting_key)
);

CREATE TABLE module_settings_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id UUID NOT NULL REFERENCES module_settings_definitions(id) ON DELETE CASCADE,
    scope_type VARCHAR(20) NOT NULL,       -- tenant | user | bu
    scope_id UUID NOT NULL,
    value JSONB,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (definition_id, scope_type, scope_id)
);

-- =====================================================
-- PERSONALIZATION
-- =====================================================

CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preference_key VARCHAR(200) NOT NULL,
    preference_value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, preference_key)
);

CREATE TABLE user_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url_path TEXT NOT NULL,
    title VARCHAR(500) NOT NULL,
    custom_title VARCHAR(500),
    custom_icon VARCHAR(50),
    display_order INTEGER NOT NULL DEFAULT 0,
    visit_count INTEGER NOT NULL DEFAULT 0,
    last_visited_at TIMESTAMPTZ,
    is_auto_suggested BOOLEAN NOT NULL DEFAULT FALSE,
    suggestion_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, url_path)
);

CREATE TABLE user_behavior_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(100),
    entity_key VARCHAR(200),
    entity_value VARCHAR(500),
    count INTEGER NOT NULL DEFAULT 1,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, event_type, entity_key, entity_value)
);

-- =====================================================
-- WORKFLOW ENGINE
-- =====================================================

CREATE TABLE workflow_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    graph_json JSONB NOT NULL,             -- JSON React Flow complet
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workflow_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    definition_id UUID NOT NULL REFERENCES workflow_definitions(id),
    current_node_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX idx_workflow_instances_object ON workflow_instances(object_type, object_id);

CREATE TABLE workflow_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES workflow_instances(id),
    from_node VARCHAR(100) NOT NULL,
    to_node VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,           -- approve | reject | delegate | cancel
    actor_id UUID REFERENCES users(id),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- IMMUABLE
);
CREATE INDEX idx_workflow_transitions_instance ON workflow_transitions(instance_id, created_at);

CREATE TABLE delegations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delegator_id UUID NOT NULL REFERENCES users(id),
    delegate_id UUID NOT NULL REFERENCES users(id),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ NOT NULL,
    scope JSONB NOT NULL DEFAULT '{}',
    reason TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- NOTIFICATIONS & EMAIL
-- =====================================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_key VARCHAR(100) NOT NULL,
    context JSONB NOT NULL DEFAULT '{}',
    channel VARCHAR(20) NOT NULL,          -- in_app | email | push
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_addresses JSONB NOT NULL,
    template_key VARCHAR(100) NOT NULL,
    context JSONB NOT NULL DEFAULT '{}',
    attachments JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_email_queue_pending ON email_queue(status, scheduled_at) WHERE status = 'pending';

-- =====================================================
-- RECOMMENDATIONS
-- =====================================================

CREATE TABLE recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rec_type VARCHAR(100) NOT NULL,
    priority VARCHAR(20) NOT NULL,
    title VARCHAR(500) NOT NULL,
    body TEXT,
    action_label VARCHAR(100),
    action_url TEXT,
    context JSONB NOT NULL DEFAULT '{}',
    source VARCHAR(50) NOT NULL,
    is_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
    is_acted_on BOOLEAN NOT NULL DEFAULT FALSE,
    snoozed_until TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_recommendations_user ON recommendations(user_id, is_dismissed, created_at DESC);

-- =====================================================
-- SHARE LINKS
-- =====================================================

CREATE TABLE share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(255) UNIQUE NOT NULL,
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    permission VARCHAR(20) NOT NULL DEFAULT 'read',
    form_config JSONB,
    created_by UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ,
    max_uses INTEGER,
    current_uses INTEGER NOT NULL DEFAULT 0,
    ip_whitelist JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE share_link_accesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id UUID NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
    ip_address INET,
    user_agent TEXT,
    external_user_email VARCHAR(255),
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- AI / RAG
-- =====================================================

CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),                -- pgvector
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunks_object ON document_chunks(object_type, object_id);

CREATE TABLE structured_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    fact_key VARCHAR(255) NOT NULL,
    fact_value TEXT NOT NULL,
    fact_type VARCHAR(20) NOT NULL DEFAULT 'text',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> **Note** : les tables ci-dessus sont dans le schema du tenant (pas de `tenant_id` colonne — l'isolation est au niveau schema). L'`entity_id` est present sur les tables metier qui necessitent un filtre supplementaire.

---

## 14. Integrations externes

| Systeme | Mode | Direction | Detail |
|---|---|---|---|
| Intranet / LDAP | LDAP, SAML 2.0, OIDC (configurable) | → OpsFlux | Sync utilisateurs, JIT provisioning |
| SAP | Export CSV uniquement | OpsFlux → CSV | Import manuel dans SAP |
| AIS (transponders navires) | API polling (MarineTraffic) | → OpsFlux | Optionnel — TravelWiz |
| IoT GPS trackers | HTTPS POST endpoint | Vecteurs → OpsFlux | TravelWiz |
| API Meteo | HTTP GET polling | → OpsFlux | Open-Meteo (gratuit) ou StormGlass (maritime) |

---

## 15. Domaines et URLs

```bash
# Production
APP_URL=https://app.opsflux.io             # PWA principale
WEB_URL=https://web.opsflux.io             # Portail web public
API_URL=https://api.opsflux.io             # API backend
CAPTAIN_URL=https://captain.opsflux.io     # Portail capitaine TravelWiz
EXT_PAXLOG_URL=https://ext.opsflux.io      # Portail externe PaxLog

# Dev local
APP_URL=http://localhost:5173
API_URL=http://localhost:8000
CAPTAIN_URL=http://localhost:5174
EXT_PAXLOG_URL=http://localhost:5175
```

---

## 16. Environnements & Configuration

### `.env.example` — Toutes les variables

```bash
# --- General -------------------------------------------------------
ENVIRONMENT=development                    # development | staging | production
DEBUG=true                                 # false en prod
SECRET_KEY=CHANGE_ME_32_BYTES              # openssl rand -hex 32

# --- PostgreSQL ----------------------------------------------------
DATABASE_URL=postgresql+asyncpg://opsflux:password@localhost:5432/opsflux_dev

# --- Redis ---------------------------------------------------------
REDIS_URL=redis://localhost:6379/0

# --- Auth Multi-provider -------------------------------------------
# SAML 2.0
SAML_METADATA_URL=
SAML_ENTITY_ID=
SAML_ACS_URL=

# OIDC
OIDC_ISSUER_URL=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_AUDIENCE=opsflux-api
OIDC_SCOPES=openid profile email

# LDAP
LDAP_URL=
LDAP_BASE_DN=
LDAP_BIND_DN=
LDAP_BIND_PASSWORD=

AUTH_PROVIDERS_ENABLED=oidc               # oidc | saml | ldap | local (comma-separated)

# --- Frontend (Vite) -----------------------------------------------
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
VITE_APP_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# --- Storage (S3-compatible) ----------------------------------------
STORAGE_BACKEND=minio                      # minio | s3
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET=opsflux
S3_REGION=                                 # pour AWS S3 prod
S3_BUCKET=
STORAGE_MAX_FILE_SIZE_MB=50

# --- Email ----------------------------------------------------------
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_ADDRESS=noreply@opsflux.io
SMTP_FROM_NAME=OpsFlux
SMTP_USE_TLS=false

# --- IA --------------------------------------------------------------
AI_DEFAULT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama3
LITELLM_MASTER_KEY=CHANGE_ME
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# --- Cartographie ----------------------------------------------------
MAP_PROVIDER=leaflet_osm
GOOGLE_MAPS_API_KEY=
MAPBOX_ACCESS_TOKEN=

# --- Hocuspocus (collab RT) ------------------------------------------
HOCUSPOCUS_SECRET=CHANGE_ME
HOCUSPOCUS_PORT=1234

# --- Monitoring -------------------------------------------------------
SENTRY_DSN=
PROMETHEUS_ENABLED=false
PROMETHEUS_PORT=9090

# --- i18n --------------------------------------------------------------
DEFAULT_LANG=fr                             # fr | en
SUPPORTED_LANGS=fr,en
```

---

## 17. CI/CD — Pipeline GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [develop, main, 'feature/**', 'fix/**']
  pull_request:
    branches: [develop]

env:
  PYTHON_VERSION: "3.12"
  NODE_VERSION: "20"

jobs:
  lint-backend:
    name: Lint Backend
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: pip
      - run: pip install ruff
      - name: Ruff check
        run: ruff check backend/app/ --output-format=github
      - name: Ruff format check
        run: ruff format --check backend/app/

  lint-frontend:
    name: Lint Frontend
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: cd frontend && npm ci
      - name: ESLint
        run: cd frontend && npm run lint
      - name: TypeScript check
        run: cd frontend && npm run typecheck

  test-backend:
    name: Test Backend
    runs-on: ubuntu-latest
    needs: lint-backend
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: opsflux_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: --health-cmd "redis-cli ping" --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: pip
      - run: cd backend && pip install -r requirements.txt -r requirements-dev.txt
      - name: Run migrations
        run: cd backend && alembic upgrade head
        env:
          DATABASE_URL: postgresql+asyncpg://test:test@localhost:5432/opsflux_test
      - name: Run tests
        run: cd backend && pytest tests/ -x --tb=short --cov=app --cov-report=term-missing
        env:
          DATABASE_URL: postgresql+asyncpg://test:test@localhost:5432/opsflux_test
          REDIS_URL: redis://localhost:6379/0
          ENVIRONMENT: test
          SECRET_KEY: test-secret-key-32-bytes-minimum-x
          STORAGE_BACKEND: minio
          MINIO_ENDPOINT: localhost:9000

  test-frontend:
    name: Test Frontend
    runs-on: ubuntu-latest
    needs: lint-frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: cd frontend && npm ci
      - name: Vitest
        run: cd frontend && npm run test -- --reporter=verbose

  build-push:
    name: Build & Push Docker
    runs-on: ubuntu-latest
    needs: [test-backend, test-frontend]
    if: github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Login to registry
        uses: docker/login-action@v3
        with:
          registry: ${{ secrets.DOCKER_REGISTRY_URL }}
          username: ${{ secrets.DOCKER_REGISTRY_USER }}
          password: ${{ secrets.DOCKER_REGISTRY_PASSWORD }}
      - name: Build and push backend
        uses: docker/build-push-action@v5
        with:
          context: backend/
          push: true
          tags: |
            ${{ secrets.DOCKER_REGISTRY_URL }}/opsflux-backend:${{ github.sha }}
            ${{ secrets.DOCKER_REGISTRY_URL }}/opsflux-backend:latest
      - name: Build and push frontend
        uses: docker/build-push-action@v5
        with:
          context: frontend/
          push: true
          tags: |
            ${{ secrets.DOCKER_REGISTRY_URL }}/opsflux-frontend:${{ github.sha }}
            ${{ secrets.DOCKER_REGISTRY_URL }}/opsflux-frontend:latest

  deploy-staging:
    name: Deploy Staging
    runs-on: ubuntu-latest
    needs: build-push
    if: github.ref == 'refs/heads/develop'
    steps:
      - name: Trigger Dokploy deploy (staging)
        run: |
          curl -f -X POST \
            "${{ secrets.DOKPLOY_API_URL }}/api/v1/application/deploy" \
            -H "Authorization: Bearer ${{ secrets.DOKPLOY_API_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{"applicationId": "${{ secrets.DOKPLOY_STAGING_APP_ID }}", "imageTag": "${{ github.sha }}"}'

  deploy-production:
    name: Deploy Production
    runs-on: ubuntu-latest
    needs: build-push
    if: github.ref == 'refs/heads/main'
    environment:
      name: production
      url: https://app.opsflux.io
    steps:
      - name: Trigger Dokploy deploy (production)
        run: |
          curl -f -X POST \
            "${{ secrets.DOKPLOY_API_URL }}/api/v1/application/deploy" \
            -H "Authorization: Bearer ${{ secrets.DOKPLOY_API_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{"applicationId": "${{ secrets.DOKPLOY_PROD_APP_ID }}", "imageTag": "${{ github.sha }}"}'
```

---

## 18. Securite

### Headers HTTP obligatoires (production)

```python
# modules/core/middleware/security_headers.py

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
    "Content-Security-Policy": " ".join([
        "default-src 'self';",
        "script-src 'self' 'unsafe-inline';",
        "style-src 'self' 'unsafe-inline';",
        "img-src 'self' data: blob: https://tile.openstreetmap.org;",
        "connect-src 'self' wss: ws:;",
        "frame-src 'self' https://embed.diagrams.net;",
        "worker-src 'self' blob:;",
    ])
}
```

### Chiffrement AES-256-GCM des credentials

```python
# modules/core/security.py

import os, base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def get_encryption_key() -> bytes:
    import hashlib
    return hashlib.sha256(settings.SECRET_KEY.encode()).digest()

def encrypt(plaintext: str) -> str:
    key = get_encryption_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ciphertext).decode()

def decrypt(ciphertext_b64: str) -> str:
    key = get_encryption_key()
    aesgcm = AESGCM(key)
    data = base64.b64decode(ciphertext_b64)
    nonce, ciphertext = data[:12], data[12:]
    return aesgcm.decrypt(nonce, ciphertext, None).decode()
```

---

## 19. Monitoring

### Prometheus metrics personnalisees

```python
# modules/core/metrics.py
from prometheus_client import Counter, Histogram, Gauge, generate_latest

# API
http_requests_total = Counter(
    "opsflux_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"]
)
http_request_duration = Histogram(
    "opsflux_http_request_duration_seconds",
    "HTTP request duration",
    ["method", "endpoint"],
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]
)

# Jobs (APScheduler)
scheduler_job_runs = Counter("opsflux_scheduler_job_runs_total", "Scheduler job runs", ["job_name"])
scheduler_job_failures = Counter("opsflux_scheduler_job_failures_total", "Scheduler job failures", ["job_name"])

# Collab
websocket_connections = Gauge("opsflux_ws_connections_active", "Active WebSocket connections")

# IA
ai_tokens_used = Counter(
    "opsflux_ai_tokens_total",
    "AI tokens consumed",
    ["provider", "model", "function"]
)
ai_request_duration = Histogram(
    "opsflux_ai_request_duration_seconds",
    "AI request latency",
    ["provider", "function"]
)

# Endpoint Prometheus
@app.get("/metrics", include_in_schema=False)
async def metrics():
    return Response(generate_latest(), media_type="text/plain")
```

---

## 20. Regles absolues — Ce qu'un module NE FAIT JAMAIS

```
* DELETE physique             → archived=TRUE ou status='cancelled'
* UPDATE asset_capacities    → INSERT nouvel enregistrement avec effective_date + reason
* Event dans une transaction → emettre APRES db.commit()
* Requete sans entity_id     → toujours filtrer par entity_id
* Transition de statut directe → fsm_service.transition()
* Serveur MCP separe         → enregistrer en plugin via mcp_registry
* Logique metier en route    → tout dans les services
* Swagger en prod            → docs_url=None si ENVIRONMENT != "development"
* Sequence maison            → generate_reference(prefix, db)
* SQLModel                   → utiliser SQLAlchemy 2.0 async uniquement
* ARQ / worker separe        → APScheduler embarque dans backend
* Azure Storage              → S3-compatible (MinIO / S3) uniquement
* Dict Python event handlers → PostgreSQL LISTEN/NOTIFY + event_store
```

### Pattern endpoint FastAPI correct

```python
@router.post(
    "/pax/ads",
    dependencies=[Depends(require_any_role("REQUESTER", "PROJ_MGR", "DO"))]
)
async def create_ads(
    body: AdSCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await ads_service.create_ads(
        body=body,
        entity_id=entity_id,
        created_by=current_user.id,
        db=db,
    )
```

### Pattern composant React correct

```tsx
// Donnees serveur → React Query
const { data } = useQuery({
    queryKey: ["ads", filters],
    queryFn: () => api.get("/api/v1/pax/ads", { params: filters }).then(r => r.data),
})

// State UI → Zustand
const { sidebarExpanded } = useUIStore()
```

---

## 21. References croisees

| Si vous developpez... | Lisez aussi... |
|---|---|
| Les workflows de statut | `09_DECISIONS.md` — FSM core |
| Les outils MCP | `08_MODULE_AI_MCP.md` — plugin du MCP core |
| Les vues calendrier | `02_MODULE_PLANNER.md` section calendrier |
| Le portail capitaine | `04_MODULE_TRAVELWIZ.md` Annexe portails |
| Les rotations PAX | `03_MODULE_PAXLOG.md` Annexe rotations |
| L'integration intranet | `04_MODULE_TRAVELWIZ.md` Annexe integration |
| Le tracking IoT | `04_MODULE_TRAVELWIZ.md` Annexe IoT |
| Les rapports officiels | `04_MODULE_TRAVELWIZ.md` Annexe rapports |
| Multi-tenant / Multi-entite | Section 4 ci-dessus |
| RBAC et permissions | Section 5 ci-dessus + `14_ROLES_RBAC.md` |
| Asset Registry | Section 6 ci-dessus + `16_MODULE_ASSET_REGISTRY.md` |
| Module Tiers | Section 7 ci-dessus + `15_MODULE_TIERS.md` |
| Event bus et interactions | Section 8 ci-dessus + `05_INTERACTIONS.md` |
| Audit log | Section 9 ci-dessus |
| Auth multi-provider | `18_MODULE_AUTH_ONBOARDING.md` |
| AVM (Avis de Mission) | `03_MODULE_PAXLOG.md` section AVM |

---

## 22. Fichiers de specification du projet

```
docs/
├── 00_PROJECT.md                          ← CE FICHIER (reference unique)
├── 09_DECISIONS.md                        ← Decisions architecturales (prime sur tout sauf ce fichier)
├── 07_DEV_GUIDE.md                        ← Structure projet, patterns, variables d'env, sprints
├── 06_DATA_MODEL.md                       ← DDL PostgreSQL complet
│
├── 01_MODULE_PROJETS.md                   ← Module Projets (WBS, CPM, Gantt)
├── 02_MODULE_PLANNER.md                   ← Module Planner (activites, capacite, arbitrage DO)
├── 03_MODULE_PAXLOG.md                    ← Module PaxLog (AdS, compliance HSE, rotations, AVM)
├── 04_MODULE_TRAVELWIZ.md                 ← Module TravelWiz (transport, cargo, IoT, meteo)
├── 05_INTERACTIONS.md                     ← Flux evenements inter-modules
├── 08_MODULE_AI_MCP.md                    ← IA embarquee + MCP core (plugins)
│
├── 10_FUNC_PROJETS.md                     ← Analyse fonctionnelle Projets
├── 11_FUNC_PLANNER.md                     ← Analyse fonctionnelle Planner
├── 12_FUNC_PAXLOG.md                      ← Analyse fonctionnelle PaxLog
├── 13_FUNC_TRAVELWIZ.md                   ← Analyse fonctionnelle TravelWiz
│
├── 14_ROLES_RBAC.md                       ← RBAC complet (roles, groupes, permissions)
├── 15_MODULE_TIERS.md                     ← Module Tiers (entreprises, portail externe)
├── 16_MODULE_ASSET_REGISTRY.md            ← Asset Registry (hierarchie ltree)
├── 17_MODULE_WORKFLOW_ENGINE.md           ← Workflow Engine (editeur visuel, delegation)
├── 18_MODULE_AUTH_ONBOARDING.md           ← Auth (SAML/OIDC/LDAP, JIT provisioning)
├── 19_MODULE_ADMIN_DASHBOARD.md           ← Admin + Dashboard
├── 20_PROCESSUS_FONCTIONNELS.md           ← Processus fonctionnels complets
└── 21_CORE_SETTINGS.md                    ← Reference configuration
```

**Regle de lecture** : pour tout travail → lire `00_PROJECT.md` (ce fichier) + `09_DECISIONS.md` + spec du module concerne + analyse fonctionnelle associee.

**Hierarchie de priorite** : `00_PROJECT.md` > `09_DECISIONS.md` > Spec module > Analyse fonctionnelle
