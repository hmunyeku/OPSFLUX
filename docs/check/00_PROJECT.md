# OpsFlux — 00_PROJECT.md
# Architecture Générale, Stack, Décisions, Structure, CI/CD

> Ce fichier est la **référence technique du projet**. Claude Code lit ce fichier avant tout développement.
> Toute décision listée en section 3 est **définitive et non révisable**.

---

## 1. Vision & Principe Platform/Plugin

OpsFlux est une plateforme PWA enterprise multi-tenant. Son architecture suit le pattern **Platform/Plugin** :

```
CORE PLATFORM
│  Services horizontaux — Auth, RBAC, Workflow, EventBus, CustomFields,
│  AI, Map, Export, Notifications, Email, Scheduler, OCR, Storage, Search
│  ↓ Registration API (manifest)
├── Module ReportEditor     (slug: report_editor)
├── Module PID_PFD          (slug: pid_pfd)
├── Module Dashboard        (slug: dashboard)
├── Module AssetRegistry    (slug: asset_registry)
├── Module Tiers            (slug: tiers)
└── Module Calendar         (slug: calendar)
```

**Règle absolue** : un module ne réimplémente **jamais** un service Core. Il déclare un manifest et consomme les APIs Core. Si un module a besoin d'envoyer un email → il appelle `core.email.queue()`. S'il a besoin d'une notification → `core.notify()`. Jamais de code SMTP dans un module.

---

## 2. Stack technique — Versions exactes

### Backend

```
Python          3.12
FastAPI         0.111+
SQLModel        0.0.18+       (ORM, Pydantic v2 natif)
Alembic         1.13+         (migrations)
PostgreSQL      16
pgvector        0.7+          (extension PostgreSQL pour RAG)
Redis           7
ARQ             0.25+         (async job queue sur Redis)
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
shadcn/ui       latest        (composants UI)
React Router    6.23+         (routing)
React Query     5             (TanStack Query v5, state serveur)
Zustand         4.5+          (state client)
React Hook Form 7.51+         (formulaires)
Zod             3.23+         (validation schémas)
BlockNote       0.14+         (éditeur riche, basé TipTap/ProseMirror)
Yjs             13.6+         (CRDT collaboration)
Hocuspocus      2+            (serveur WebSocket Yjs)
React Flow      11.11+        (graphes workflow)
GridStack.js    10+           (dashboard drag&drop)
Recharts        2.12+         (graphiques)
Dexie.js        3.2+          (IndexedDB wrapper)
Workbox         7+            (Service Worker PWA)
Leaflet         1.9+          (cartographie)
Axios           1.6+          (HTTP client)
date-fns        3+            (dates)
Lucide React    0.380+        (icônes)
```

### Infrastructure

```
Docker          26+
Docker Compose  2.27+
Dokploy         latest        (PaaS self-hosted)
Traefik         3+            (reverse proxy + SSL)
GitHub Actions  latest        (CI/CD)
```

---

## 3. Décisions d'architecture — Finales et non révisables

| ID | Décision | Choix retenu | Raison |
|---|---|---|---|
| D01 | Multi-tenant DB | `tenant_id` sur toutes les tables | Simple, maintenable solo. Middleware injecte tenant_id automatiquement. |
| D02 | Offline / Collaboration | CRDT Yjs partout | Aucune perte de données possible. Critique pour offshore satellite. |
| D03 | Éditeur riche | BlockNote (MIT) | Notion-like OOTB, basé TipTap/ProseMirror, extensions compatibles. |
| D04 | Collab RT | Yjs + Hocuspocus | Standard industrie. Merge offline/online automatique. |
| D05 | Workflow UI | React Flow (MIT) | JSON portable, FSM interprété côté backend Python. |
| D06 | PID/PFD moteur graphique | draw.io (mxGraph) via iframe API | Open source, connu ingénieurs, export DXF natif. |
| D07 | IA proxy | LiteLLM | Interface unifiée multi-provider. Ollama on-premise en défaut. |
| D08 | Vecteurs RAG | pgvector | Extension PostgreSQL existante. Pas d'infra supplémentaire. |
| D09 | Chiffrement credentials | AES-256-GCM | `SECRET_KEY` env var → clé 32 bytes. Credentials chiffrés en DB. |
| D10 | Cartographie | Provider configurable via Settings | Leaflet/OSM gratuit par défaut. Google Maps / Mapbox en option. |
| D11 | TagRegistry DSL | Formulaire visuel + pattern textuel généré | UI génère `{AREA}-{TYPE}-{SEQ:3}`. Les deux modes (visuel et texte) disponibles. |
| D12 | Testing | Tests unitaires critiques | Endpoints FastAPI + services métier clés. Critère : 0 bug bloquant. |
| D13 | CI/CD | GitHub Actions | Lint+test à chaque push, build+deploy staging auto sur develop, deploy prod manuel sur main. |
| D14 | Monitoring | Sentry + Grafana + Prometheus | Sentry (erreurs), Prometheus (métriques), Grafana (dashboards ops). |
| D15 | Envs | 3 envs distincts (dev/staging/prod) | `.env` par env. Zéro modification manuelle au déploiement. |
| D16 | State management frontend | Zustand (client) + React Query (serveur) | Zustand pour UI state, React Query pour toutes les données serveur avec cache. |
| D17 | Formulaires | React Hook Form + Zod | Standard, performances, validation typée. |
| D18 | Styling | TailwindCSS + shadcn/ui | Cohérence design, composants accessibles, dark mode natif. |

---

## 4. Structure complète du projet

```
opsflux/
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                 # lint + test à chaque push
│   │   └── deploy.yml             # build + deploy staging/prod
│   └── CODEOWNERS
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                # Point d'entrée FastAPI, middlewares, routes
│   │   │
│   │   ├── api/
│   │   │   ├── deps.py            # FastAPI dependencies (get_current_user, get_tenant, etc.)
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
│   │   │           ├── report.py
│   │   │           ├── pid_pfd.py
│   │   │           ├── dashboard.py
│   │   │           ├── assets.py
│   │   │           ├── tiers.py
│   │   │           └── calendar.py
│   │   │
│   │   ├── core/
│   │   │   ├── config.py          # Settings Pydantic (depuis env vars)
│   │   │   ├── security.py        # JWT, OAuth2, password hashing
│   │   │   ├── database.py        # Engine SQLAlchemy async, session factory
│   │   │   ├── redis.py           # Redis connection pool
│   │   │   └── middleware/
│   │   │       ├── tenant.py      # Résolution tenant_id depuis JWT
│   │   │       ├── bu_scope.py    # Injection BU active dans request.state
│   │   │       ├── rbac.py        # Décorateur @requires_permission
│   │   │       ├── security_headers.py
│   │   │       └── rate_limit.py
│   │   │
│   │   ├── models/
│   │   │   ├── core/
│   │   │   │   ├── tenant.py
│   │   │   │   ├── user.py
│   │   │   │   ├── rbac.py
│   │   │   │   ├── business_unit.py
│   │   │   │   ├── notification.py
│   │   │   │   ├── extrafield.py
│   │   │   │   ├── workflow.py
│   │   │   │   ├── attachment.py
│   │   │   │   ├── object_activity.py
│   │   │   │   ├── object_relation.py
│   │   │   │   └── module_settings.py
│   │   │   └── modules/
│   │   │       ├── document.py
│   │   │       ├── pid.py
│   │   │       ├── dashboard.py
│   │   │       ├── asset.py
│   │   │       ├── tiers.py
│   │   │       └── calendar.py
│   │   │
│   │   ├── services/
│   │   │   ├── core/
│   │   │   │   ├── auth_service.py
│   │   │   │   ├── notification_service.py
│   │   │   │   ├── email_service.py
│   │   │   │   ├── workflow_service.py
│   │   │   │   ├── extrafield_service.py
│   │   │   │   ├── export_service.py
│   │   │   │   ├── storage_service.py
│   │   │   │   ├── search_service.py
│   │   │   │   ├── ai_service.py
│   │   │   │   ├── map_service.py
│   │   │   │   ├── ocr_service.py
│   │   │   │   ├── recommendation_service.py
│   │   │   │   └── bookmark_service.py
│   │   │   └── modules/
│   │   │       ├── report_service.py
│   │   │       ├── nomenclature_service.py
│   │   │       ├── pid_service.py
│   │   │       ├── tag_service.py
│   │   │       ├── dashboard_service.py
│   │   │       ├── asset_service.py
│   │   │       └── tiers_service.py
│   │   │
│   │   ├── workers/               # ARQ background jobs
│   │   │   ├── settings.py        # Configuration ARQ worker
│   │   │   ├── email_worker.py
│   │   │   ├── ai_indexer.py
│   │   │   ├── report_scheduler.py
│   │   │   └── recommendation_worker.py
│   │   │
│   │   └── mcp/                   # MCP Server
│   │       ├── server.py
│   │       ├── security.py
│   │       └── tools/
│   │           ├── documents.py
│   │           ├── workflow.py
│   │           ├── data.py
│   │           ├── assets.py
│   │           ├── pid.py
│   │           └── reports.py
│   │
│   ├── alembic/
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/
│   │       ├── 0001_core_tenants_users.py
│   │       ├── 0002_core_rbac_bu.py
│   │       ├── 0003_core_object_capabilities.py
│   │       ├── 0004_core_workflow.py
│   │       ├── 0005_core_extrafields.py
│   │       ├── 0006_core_notifications.py
│   │       ├── 0007_module_report.py
│   │       ├── 0008_module_dashboard.py
│   │       └── ...
│   │
│   ├── tests/
│   │   ├── conftest.py            # fixtures pytest (db test, client, auth)
│   │   ├── core/
│   │   │   ├── test_auth.py
│   │   │   ├── test_rbac.py
│   │   │   ├── test_workflow.py
│   │   │   └── test_extrafields.py
│   │   └── modules/
│   │       ├── test_report.py
│   │       ├── test_pid.py
│   │       └── test_dashboard.py
│   │
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx               # Entry point
│   │   ├── App.tsx                # Router + Providers
│   │   │
│   │   ├── components/
│   │   │   ├── core/
│   │   │   │   ├── AppShell.tsx   # Layout principal (topbar + sidebar + panneaux)
│   │   │   │   ├── Topbar.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── NavItem.tsx
│   │   │   │   ├── StaticPanel.tsx
│   │   │   │   ├── DynamicPanel.tsx
│   │   │   │   ├── AIPanel.tsx
│   │   │   │   ├── GlobalSearch.tsx
│   │   │   │   ├── NotificationBell.tsx
│   │   │   │   ├── TenantSwitcher.tsx
│   │   │   │   ├── BUSwitcher.tsx
│   │   │   │   ├── StatusBadge.tsx
│   │   │   │   ├── SmartCombobox.tsx
│   │   │   │   ├── SmartEmptyState.tsx
│   │   │   │   ├── PanelSection.tsx
│   │   │   │   ├── ActivityTimeline.tsx
│   │   │   │   └── BookmarkSuggestion.tsx
│   │   │   ├── ui/                # shadcn/ui components (generated)
│   │   │   └── modules/
│   │   │       ├── report/
│   │   │       ├── pid/
│   │   │       ├── dashboard/
│   │   │       ├── assets/
│   │   │       └── tiers/
│   │   │
│   │   ├── pages/
│   │   │   ├── core/
│   │   │   │   └── settings/
│   │   │   └── modules/
│   │   │       ├── documents/
│   │   │       ├── pid/
│   │   │       ├── dashboards/
│   │   │       ├── assets/
│   │   │       └── tiers/
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
│   │   │   ├── uiStore.ts         # Zustand : layout, panneaux, objets sélectionnés
│   │   │   ├── authStore.ts       # Zustand : user, tenant, permissions
│   │   │   └── offlineStore.ts    # Zustand : queue de sync offline
│   │   │
│   │   ├── lib/
│   │   │   ├── api.ts             # Axios instance configurée (auth, tenant header)
│   │   │   ├── offline.ts         # Dexie.js schema + helpers
│   │   │   ├── queryClient.ts     # TanStack Query configuration
│   │   │   └── utils.ts           # cn(), formatDate(), etc.
│   │   │
│   │   ├── styles/
│   │   │   └── globals.css        # Variables CSS + Tailwind imports
│   │   │
│   │   └── service-worker.ts      # Workbox configuration
│   │
│   ├── public/
│   │   └── manifest.json          # PWA manifest
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── Dockerfile
│
├── docker/
│   ├── docker-compose.base.yml    # Services communs (postgres, redis)
│   ├── docker-compose.dev.yml     # Volumes locaux, hot reload
│   ├── docker-compose.staging.yml # Images registry, env staging
│   └── docker-compose.prod.yml    # Images registry, env prod, Traefik
│
├── .env.example                   # Template avec TOUTES les clés (valeurs vides)
├── .env.dev                       # Dev local (dans .gitignore)
├── .gitignore
├── README.md
└── CHANGELOG.md
```

---

## 5. Multi-tenant — Implémentation complète

### tenant_id dans toutes les tables

```python
# app/models/core/base.py
# Tous les modèles qui nécessitent l'isolation par tenant héritent de TenantMixin

class TenantMixin:
    tenant_id: UUID = Field(foreign_key="tenants.id", index=True, nullable=False)
```

### Middleware de résolution du tenant

```python
# app/core/middleware/tenant.py

class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        # Routes publiques sans tenant (auth, health check)
        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        # Extraire le JWT
        token = extract_bearer_token(request)
        if not token:
            return JSONResponse(status_code=401, content={"detail": "Non authentifié"})

        payload = decode_jwt(token)
        user_id = payload.get("sub")
        tenant_id = payload.get("tenant_id")

        if not tenant_id:
            return JSONResponse(status_code=400, content={"detail": "tenant_id manquant dans le token"})

        # Vérifier que l'user appartient bien au tenant
        async with get_db() as db:
            user_tenant = await db.execute(
                select(UserTenant).where(
                    UserTenant.user_id == user_id,
                    UserTenant.tenant_id == tenant_id,
                    UserTenant.is_active == True
                )
            ).scalar_one_or_none()

            if not user_tenant:
                return JSONResponse(status_code=403, content={"detail": "Accès tenant refusé"})

            # Injecter dans request.state
            request.state.tenant_id = tenant_id
            request.state.user_id = user_id
            request.state.user_role = user_tenant.role

            # BU active (depuis préférences ou BU primaire)
            request.state.bu_id = await get_active_bu(user_id, tenant_id)

        return await call_next(request)
```

### RBAC — Décorateur de permission

```python
# app/core/middleware/rbac.py

def requires_permission(permission: str):
    """Décorateur FastAPI pour vérifier une permission sur un endpoint."""
    async def dependency(request: Request, db: AsyncSession = Depends(get_db)):
        user_id = request.state.user_id
        tenant_id = request.state.tenant_id

        has_perm = await check_user_permission(db, user_id, tenant_id, permission)
        if not has_perm:
            raise HTTPException(
                status_code=403,
                detail=f"Permission '{permission}' requise"
            )
    return Depends(dependency)

# Usage dans une route
@router.post("/documents", dependencies=[requires_permission("document.create")])
async def create_document(...):
    ...
```

---

## 6. Schéma DB — Tables fondamentales Core

> Les tables des modules sont dans leurs fichiers respectifs (02_MODULE_*.md)

```sql
-- ═══════════════════════════════════════════════════════
-- TENANTS & USERS
-- ═══════════════════════════════════════════════════════

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}',
    -- {smtp: {...}, map_provider: "leaflet_osm", ai_providers: [...]}
    modules_enabled JSONB NOT NULL DEFAULT '[]',
    -- ["report_editor", "pid_pfd", "dashboard", ...]
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    oauth_sub VARCHAR(255) UNIQUE,      -- subject du provider SSO
    avatar_url TEXT,
    primary_bu_id UUID,                  -- BU principale de l'utilisateur
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_tenants (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    -- super_admin | tenant_admin | template_manager | editor | reviewer | reader | pid_manager
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, tenant_id)
);

-- ═══════════════════════════════════════════════════════
-- BUSINESS UNITS
-- ═══════════════════════════════════════════════════════

CREATE TABLE business_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    parent_bu_id UUID REFERENCES business_units(id),
    metadata JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (tenant_id, code)
);

CREATE TABLE user_business_units (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bu_id UUID NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    scope_level VARCHAR(20) NOT NULL DEFAULT 'full',
    -- full = accès complet, read = lecture seule hors BU primaire
    PRIMARY KEY (user_id, bu_id)
);

-- ═══════════════════════════════════════════════════════
-- OBJECT CAPABILITIES (toutes polymorphiques)
-- Pattern : object_type + object_id (UUID)
-- Exemples object_type : "document", "pid_document", "equipment", "asset"
-- ═══════════════════════════════════════════════════════

CREATE TABLE object_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    version_label VARCHAR(20) NOT NULL,  -- "0", "A", "B", "1.0", ...
    data JSONB NOT NULL,                  -- snapshot complet de l'objet
    change_summary TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- IMMUABLE : jamais UPDATE/DELETE
);
CREATE INDEX idx_object_versions_lookup ON object_versions(tenant_id, object_type, object_id);

CREATE TABLE object_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    file_id UUID NOT NULL REFERENCES stored_files(id),
    label VARCHAR(255),
    display_order INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_object_attachments_lookup ON object_attachments(tenant_id, object_type, object_id);

CREATE TABLE object_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    author_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    parent_id UUID REFERENCES object_comments(id),   -- réponse à un commentaire
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_object_comments_lookup ON object_comments(tenant_id, object_type, object_id);

CREATE TABLE object_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    actor_id UUID REFERENCES users(id),
    actor_type VARCHAR(20) NOT NULL DEFAULT 'user',  -- user | ai | system
    action VARCHAR(100) NOT NULL,
    -- ex: "created", "status_changed", "workflow.approved", "ai.summarized"
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- IMMUABLE : jamais UPDATE/DELETE
);
CREATE INDEX idx_object_activity_lookup ON object_activity(tenant_id, object_type, object_id, created_at DESC);

CREATE TABLE object_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    from_type VARCHAR(100) NOT NULL,
    from_id UUID NOT NULL,
    relation_type VARCHAR(100) NOT NULL,
    -- ex: "references", "derived_from", "supersedes", "linked_to"
    to_type VARCHAR(100) NOT NULL,
    to_id UUID NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, from_type, from_id, relation_type, to_type, to_id)
);

CREATE TABLE object_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
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
    tenant_id UUID NOT NULL,
    PRIMARY KEY (object_type, object_id, user_id)
);

-- ═══════════════════════════════════════════════════════
-- CUSTOM FIELDS ENGINE (Extrafields style Dolibarr)
-- ═══════════════════════════════════════════════════════

CREATE TABLE extrafield_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    object_type VARCHAR(100) NOT NULL,
    field_key VARCHAR(100) NOT NULL,
    label JSONB NOT NULL,                -- {"fr": "...", "en": "..."}
    field_type VARCHAR(50) NOT NULL,
    -- text_short|text_long|number_int|number_decimal|boolean|date|datetime
    -- select_static|select_dynamic|reference|formula|file|geolocation
    options JSONB NOT NULL DEFAULT '{}',
    -- select_static: {"options": [{"value": "...", "label": {...}}]}
    -- select_dynamic: {"connector_id": "...", "value_field": "...", "label_field": "..."}
    -- reference: {"object_type": "...", "display_fields": ["name", "code"]}
    -- formula: {"expression": "{field_a} * {field_b}", "result_type": "number"}
    -- number: {"min": 0, "max": 100, "unit": "bbl/j", "decimals": 2}
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_searchable BOOLEAN NOT NULL DEFAULT TRUE,
    is_filterable BOOLEAN NOT NULL DEFAULT TRUE,
    is_exportable BOOLEAN NOT NULL DEFAULT TRUE,
    is_importable BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    display_group VARCHAR(100),          -- groupe d'affichage dans l'UI
    scope VARCHAR(20) NOT NULL DEFAULT 'tenant',  -- tenant|user|bu
    module_origin VARCHAR(100),          -- NULL si créé par admin, slug si créé par module
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, object_type, field_key)
);

CREATE TABLE extrafield_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    definition_id UUID NOT NULL REFERENCES extrafield_definitions(id) ON DELETE CASCADE,
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    value_text TEXT,
    value_number NUMERIC,
    value_date TIMESTAMPTZ,
    value_json JSONB,                    -- pour reference, file, geolocation, multi-select
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (definition_id, object_id)
);
CREATE INDEX idx_extrafield_values_lookup ON extrafield_values(tenant_id, object_type, object_id);

-- ═══════════════════════════════════════════════════════
-- STORAGE (fichiers)
-- ═══════════════════════════════════════════════════════

CREATE TABLE stored_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    storage_backend VARCHAR(20) NOT NULL DEFAULT 'local',  -- local|minio|azure
    storage_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    checksum VARCHAR(64),               -- SHA-256
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ              -- NULL = permanent
);

-- ═══════════════════════════════════════════════════════
-- MODULE SETTINGS
-- ═══════════════════════════════════════════════════════

CREATE TABLE module_settings_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_slug VARCHAR(100) NOT NULL,
    setting_key VARCHAR(100) NOT NULL,
    label JSONB NOT NULL,
    field_type VARCHAR(50) NOT NULL,
    options JSONB NOT NULL DEFAULT '{}',
    default_value JSONB,
    scope VARCHAR(20) NOT NULL DEFAULT 'tenant',  -- tenant|user|bu
    display_group VARCHAR(100),
    display_order INTEGER NOT NULL DEFAULT 0,
    requires_permission VARCHAR(255),
    UNIQUE (module_slug, setting_key)
);

CREATE TABLE module_settings_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id UUID NOT NULL REFERENCES module_settings_definitions(id) ON DELETE CASCADE,
    scope_type VARCHAR(20) NOT NULL,    -- tenant|user|bu
    scope_id UUID NOT NULL,
    value JSONB,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (definition_id, scope_type, scope_id)
);

-- ═══════════════════════════════════════════════════════
-- PERSONALIZATION
-- ═══════════════════════════════════════════════════════

CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    preference_key VARCHAR(200) NOT NULL,
    preference_value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, tenant_id, preference_key)
);

CREATE TABLE user_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    url_path TEXT NOT NULL,
    title VARCHAR(500) NOT NULL,
    custom_title VARCHAR(500),
    custom_icon VARCHAR(50),            -- emoji ou code icône Lucide
    display_order INTEGER NOT NULL DEFAULT 0,
    visit_count INTEGER NOT NULL DEFAULT 0,
    last_visited_at TIMESTAMPTZ,
    is_auto_suggested BOOLEAN NOT NULL DEFAULT FALSE,
    suggestion_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, tenant_id, url_path)
);

CREATE TABLE user_behavior_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,    -- page_visit|field_value_used|filter_applied
    entity_type VARCHAR(100),           -- ex: "document_type_dropdown"
    entity_key VARCHAR(200),            -- ex: "select.doc_type_id"
    entity_value VARCHAR(500),          -- ex: "rapport_journalier"
    count INTEGER NOT NULL DEFAULT 1,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, tenant_id, event_type, entity_key, entity_value)
);

-- ═══════════════════════════════════════════════════════
-- WORKFLOW ENGINE
-- ═══════════════════════════════════════════════════════

CREATE TABLE workflow_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    graph_json JSONB NOT NULL,          -- JSON React Flow complet
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workflow_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    definition_id UUID NOT NULL REFERENCES workflow_definitions(id),
    current_node_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    -- in_progress|approved|rejected|cancelled
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX idx_workflow_instances_object ON workflow_instances(tenant_id, object_type, object_id);

CREATE TABLE workflow_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    instance_id UUID NOT NULL REFERENCES workflow_instances(id),
    from_node VARCHAR(100) NOT NULL,
    to_node VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,        -- approve|reject|delegate|cancel
    actor_id UUID REFERENCES users(id),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- IMMUABLE : jamais UPDATE/DELETE
);
CREATE INDEX idx_workflow_transitions_instance ON workflow_transitions(instance_id, created_at);

CREATE TABLE delegations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    delegator_id UUID NOT NULL REFERENCES users(id),
    delegate_id UUID NOT NULL REFERENCES users(id),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ NOT NULL,
    scope JSONB NOT NULL DEFAULT '{}',  -- {object_types: [...], roles: [...]}
    reason TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- NOTIFICATIONS & EMAIL
-- ═══════════════════════════════════════════════════════

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_key VARCHAR(100) NOT NULL,
    context JSONB NOT NULL DEFAULT '{}',
    channel VARCHAR(20) NOT NULL,       -- in_app|email|push
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, tenant_id, is_read, created_at DESC);

CREATE TABLE email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    to_addresses JSONB NOT NULL,        -- ["user@example.com", ...]
    template_key VARCHAR(100) NOT NULL,
    context JSONB NOT NULL DEFAULT '{}',
    attachments JSONB NOT NULL DEFAULT '[]', -- [{file_id: "...", filename: "..."}]
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending|sending|sent|failed
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_email_queue_pending ON email_queue(status, scheduled_at) WHERE status = 'pending';

-- ═══════════════════════════════════════════════════════
-- RECOMMENDATIONS
-- ═══════════════════════════════════════════════════════

CREATE TABLE recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rec_type VARCHAR(100) NOT NULL,
    priority VARCHAR(20) NOT NULL,      -- critical|high|medium|low
    title VARCHAR(500) NOT NULL,
    body TEXT,
    action_label VARCHAR(100),
    action_url TEXT,
    context JSONB NOT NULL DEFAULT '{}',
    source VARCHAR(50) NOT NULL,        -- workflow|calendar|ai|data|behavior|system
    is_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
    is_acted_on BOOLEAN NOT NULL DEFAULT FALSE,
    snoozed_until TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_recommendations_user ON recommendations(user_id, tenant_id, is_dismissed, created_at DESC);

-- ═══════════════════════════════════════════════════════
-- SHARE LINKS
-- ═══════════════════════════════════════════════════════

CREATE TABLE share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(255) UNIQUE NOT NULL,  -- UUID v4 aléatoire
    tenant_id UUID NOT NULL,
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    permission VARCHAR(20) NOT NULL DEFAULT 'read',  -- read|fill_form
    form_config JSONB,                   -- si permission=fill_form: champs accessibles
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
    external_user_email VARCHAR(255),   -- si l'accès externe s'est identifié
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- AI / RAG
-- ═══════════════════════════════════════════════════════

CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),             -- pgvector
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunks_object ON document_chunks(tenant_id, object_type, object_id);

CREATE TABLE structured_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    object_type VARCHAR(100) NOT NULL,
    object_id UUID NOT NULL,
    fact_key VARCHAR(255) NOT NULL,
    fact_value TEXT NOT NULL,
    fact_type VARCHAR(20) NOT NULL DEFAULT 'text',  -- text|number|date
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 7. Environnements & Configuration

### `.env.example` — Toutes les variables

```bash
# ─── Général ──────────────────────────────────────────────────────
ENVIRONMENT=development           # development | staging | production
DEBUG=true                        # false en prod
SECRET_KEY=CHANGE_ME_32_BYTES    # openssl rand -hex 32

# ─── PostgreSQL ───────────────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://opsflux:password@localhost:5432/opsflux_dev
# Format staging/prod : postgresql+asyncpg://user:pass@host:5432/dbname

# ─── Redis ────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ─── Auth SSO ─────────────────────────────────────────────────────
OAUTH2_ISSUER_URL=https://sso.perenco.com/realms/perenco
OAUTH2_CLIENT_ID=opsflux
OAUTH2_CLIENT_SECRET=CHANGE_ME
OAUTH2_AUDIENCE=opsflux-api
OAUTH2_SCOPES=openid profile email

# ─── Frontend (Vite) ──────────────────────────────────────────────
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
VITE_APP_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# ─── Storage ──────────────────────────────────────────────────────
STORAGE_BACKEND=local             # local | minio | azure
STORAGE_LOCAL_PATH=./uploads
STORAGE_MAX_FILE_SIZE_MB=50
MINIO_ENDPOINT=                   # ex: minio:9000
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET=opsflux
AZURE_STORAGE_CONNECTION_STRING=

# ─── Email ────────────────────────────────────────────────────────
SMTP_HOST=mailhog                 # mailhog en dev, vrai SMTP en prod
SMTP_PORT=1025                    # 587 en prod
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_ADDRESS=noreply@opsflux.perenco.com
SMTP_FROM_NAME=OpsFlux
SMTP_USE_TLS=false                # true en prod

# ─── IA ───────────────────────────────────────────────────────────
AI_DEFAULT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama3
LITELLM_MASTER_KEY=CHANGE_ME
# Optionnel si tenant autorise cloud :
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# ─── Cartographie ─────────────────────────────────────────────────
MAP_PROVIDER=leaflet_osm          # leaflet_osm | google_maps | mapbox
GOOGLE_MAPS_API_KEY=
MAPBOX_ACCESS_TOKEN=

# ─── Hocuspocus (collab RT) ───────────────────────────────────────
HOCUSPOCUS_SECRET=CHANGE_ME
HOCUSPOCUS_PORT=1234

# ─── Monitoring ───────────────────────────────────────────────────
SENTRY_DSN=                       # vide en dev, URL Sentry en staging/prod
PROMETHEUS_ENABLED=false          # true en staging/prod
PROMETHEUS_PORT=9090

# ─── Dokploy ──────────────────────────────────────────────────────
DOKPLOY_API_URL=https://dokploy.perenco.com
DOKPLOY_API_TOKEN=CHANGE_ME
DOCKER_REGISTRY_URL=registry.perenco.com
DOCKER_REGISTRY_USER=
DOCKER_REGISTRY_PASSWORD=
```

---

## 8. CI/CD — Pipeline GitHub Actions complet

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
  # ──────────────────────────────────────────────
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

  # ──────────────────────────────────────────────
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

  # ──────────────────────────────────────────────
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
          OAUTH2_ISSUER_URL: http://mock-sso
          STORAGE_BACKEND: local
          STORAGE_LOCAL_PATH: /tmp/test-uploads

  # ──────────────────────────────────────────────
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

  # ──────────────────────────────────────────────
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

  # ──────────────────────────────────────────────
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

  # ──────────────────────────────────────────────
  deploy-production:
    name: Deploy Production
    runs-on: ubuntu-latest
    needs: build-push
    if: github.ref == 'refs/heads/main'
    environment:
      name: production         # ← requiert approbation manuelle dans GitHub Environments
      url: https://opsflux.perenco.com
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

## 9. Sécurité

### Headers HTTP obligatoires (production)

```python
# app/core/middleware/security_headers.py

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
    "Content-Security-Policy": " ".join([
        "default-src 'self';",
        "script-src 'self' 'unsafe-inline';",     # TipTap, draw.io nécessitent unsafe-inline
        "style-src 'self' 'unsafe-inline';",
        "img-src 'self' data: blob: https://tile.openstreetmap.org;",
        "connect-src 'self' wss: ws:;",
        "frame-src 'self' https://embed.diagrams.net;",  # draw.io iframe
        "worker-src 'self' blob:;",                # Service Worker
    ])
}
```

### Chiffrement AES-256-GCM des credentials

```python
# app/core/security.py

import os, base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def get_encryption_key() -> bytes:
    """Dérive une clé 32 bytes depuis SECRET_KEY."""
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

## 10. Monitoring

### Prometheus metrics personnalisées

```python
# app/core/metrics.py
from prometheus_client import Counter, Histogram, Gauge, generate_latest

# API
http_requests_total = Counter(
    "opsflux_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code", "tenant_id"]
)
http_request_duration = Histogram(
    "opsflux_http_request_duration_seconds",
    "HTTP request duration",
    ["method", "endpoint"],
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]
)

# Jobs
arq_job_queue_size = Gauge("opsflux_arq_queue_size", "ARQ job queue depth", ["queue"])
arq_job_failures = Counter("opsflux_arq_job_failures_total", "ARQ job failures", ["job_name"])

# Collab
websocket_connections = Gauge("opsflux_ws_connections_active", "Active WebSocket connections")

# IA
ai_tokens_used = Counter(
    "opsflux_ai_tokens_total",
    "AI tokens consumed",
    ["provider", "model", "function", "tenant_id"]
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
