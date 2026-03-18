# OpsFlux — Guide Développeur

> Version unifiée — Mars 2026
> Ce document est la référence technique unique pour le développement OpsFlux.
> En cas de contradiction avec d'autres fichiers, `09_DECISIONS.md` prime.

---

## 1. Stack technique complète

| Composant | Technologie | Version | Notes |
|---|---|---|---|
| Backend API | FastAPI | 0.111+ | Python 3.12 |
| Base de données | PostgreSQL | 16+ | Extensions : pg_trgm, pgvector, ltree, PostGIS, pg_partman |
| ORM | SQLAlchemy 2.0 async | — | Alembic pour migrations. **Pas de SQLModel.** |
| Cache / Pub-Sub | Redis | 7+ | Sessions, OTP, rate limiting, positions IoT |
| Event bus | PostgreSQL LISTEN/NOTIFY | — | + table `event_store` pour idempotence. **Pas de dict Python.** |
| File d'attente | APScheduler | — | Crons (rotations, météo, stale detection). **Pas d'ARQ, pas de conteneur arq-worker.** |
| Stockage fichiers | S3-compatible | — | MinIO local ou AWS S3 |
| Frontend PWA | React 18 + TypeScript | — | Vite, shadcn/ui, Tailwind CSS |
| État global | Zustand + React Query | — | Zustand pour UI, React Query pour server state |
| Apps légères | React + Vite | — | Portail capitaine + portail externe PaxLog |
| Déploiement | Docker Compose | — | 6 conteneurs : backend, frontend, web-portal, postgres, redis, traefik |
| Domaines | *.opsflux.io | — | Sous-domaines par tenant |
| MCP | Embarqué dans le core | — | Un seul serveur MCP, modules = plugins |

---

## 2. Structure du projet

```
opsflux/
├── alembic/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       ├── 001_initial_schema.py
│       ├── 002_add_entity_id.py
│       └── ...
│
├── app/
│   ├── main.py                    # FastAPI app, lifespan, middlewares, ModuleRegistry
│   ├── core/
│   │   ├── config.py              # Settings via pydantic-settings (.env)
│   │   ├── database.py            # AsyncSession factory, get_db dependency
│   │   ├── redis_client.py        # Redis async client
│   │   ├── s3_client.py           # S3/MinIO client
│   │   ├── security.py            # JWT encode/decode, password hashing
│   │   ├── rbac.py                # require_role(), require_any_role() dependencies
│   │   ├── audit.py               # audit_log.record(), SQLAlchemy event listeners
│   │   ├── events.py              # EventBus PostgreSQL LISTEN/NOTIFY, emit(), subscribe()
│   │   ├── notifications.py       # send_email(), send_sms(), send_in_app()
│   │   ├── pagination.py          # PaginatedResponse, paginate()
│   │   ├── references.py          # generate_reference() avec advisory lock atomique
│   │   ├── module_registry.py     # ModuleRegistry singleton (chargement manifests)
│   │   └── middleware/
│   │       ├── tenant.py          # TenantSchemaMiddleware (SET search_path depuis sous-domaine)
│   │       ├── entity_scope.py    # EntityScopeMiddleware (entity_id)
│   │       ├── security_headers.py # CSP, HSTS, X-Frame-Options
│   │       └── rate_limit.py      # Rate limiting global
│   │
│   ├── models/                    # SQLAlchemy ORM models (pas de SQLModel)
│   │   ├── base.py                # Base, TimestampMixin
│   │   ├── common.py              # entities, assets, tiers, users, roles, groups
│   │   ├── projects.py
│   │   ├── planner.py
│   │   ├── paxlog.py
│   │   └── travelwiz.py
│   │
│   ├── schemas/                   # Pydantic schemas (request/response)
│   │   ├── common.py              # PaginatedResponse, ErrorResponse
│   │   ├── projects.py
│   │   ├── planner.py
│   │   ├── paxlog.py
│   │   └── travelwiz.py
│   │
│   ├── api/
│   │   ├── deps.py                # get_db, get_current_user, requires_permission
│   │   └── routes/
│   │       ├── core/              # auth, users, tenants, rbac, notifications, search...
│   │       └── modules/           # report, pid_pfd, dashboard, assets, tiers...
│   │
│   ├── services/
│   │   ├── core/
│   │   │   ├── event_bus.py       # PostgreSQL LISTEN/NOTIFY
│   │   │   └── reference_gen.py   # generate_reference()
│   │   ├── projects/
│   │   │   ├── project_service.py
│   │   │   ├── simulation_service.py
│   │   │   └── scheduling_engine.py
│   │   ├── planner/
│   │   │   ├── activity_service.py
│   │   │   ├── arbitrage_service.py
│   │   │   └── capacity_service.py
│   │   ├── paxlog/
│   │   │   ├── ads_service.py
│   │   │   ├── compliance_service.py
│   │   │   ├── dedup_service.py
│   │   │   ├── rotation_service.py
│   │   │   └── external_link_service.py
│   │   ├── travelwiz/
│   │   │   ├── manifest_service.py
│   │   │   ├── cargo_service.py
│   │   │   ├── deck_optimizer.py
│   │   │   ├── kpi_service.py
│   │   │   ├── weather_service.py
│   │   │   ├── iot_monitor.py
│   │   │   └── pdf_export.py
│   │   ├── ai/
│   │   │   ├── sap_matcher.py
│   │   │   ├── anomaly_detector.py
│   │   │   └── report_generator.py
│   │   └── intranet/
│   │       └── sync_service.py
│   │
│   ├── modules/                   # Manifests des modules
│   │   ├── report_editor/manifest.py
│   │   ├── pid_pfd/manifest.py
│   │   ├── dashboard/manifest.py
│   │   ├── asset_registry/manifest.py
│   │   └── tiers/manifest.py
│   │
│   ├── event_handlers/
│   │   ├── __init__.py            # register_all_handlers()
│   │   ├── paxlog_handlers.py
│   │   └── travelwiz_handlers.py
│   │
│   ├── mcp/
│   │   ├── register.py            # register_mcp_plugins() — appelé au startup
│   │   └── tools/
│   │       ├── common.py
│   │       ├── projects.py
│   │       ├── planner.py
│   │       ├── paxlog.py
│   │       └── travelwiz.py
│   │
│   └── tasks/                     # APScheduler taches periodiques
│       ├── scheduler.py           # Configuration APScheduler
│       ├── rotation_cron.py       # 0 6 * * *
│       ├── anomaly_cron.py        # 0 2 * * *
│       ├── weather_cron.py        # */30 * * * *
│       ├── iot_stale_cron.py      # */5 * * * *
│       ├── simulation_cleanup.py  # */15 * * * *
│       └── intranet_sync_cron.py  # 0 */4 * * *
│
├── apps/
│   ├── main/                      # PWA principale OpsFlux
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── router.tsx
│   │   │   ├── lib/
│   │   │   │   ├── api.ts         # Instance Axios (intercepteurs JWT, tenant, erreurs)
│   │   │   │   └── queryClient.ts # React Query config
│   │   │   ├── stores/            # Zustand stores
│   │   │   ├── hooks/             # React Query hooks
│   │   │   ├── components/        # shadcn/ui + composants metier
│   │   │   ├── pages/
│   │   │   └── services/
│   │   └── vite.config.ts
│   │
│   ├── captain/                   # Portail capitaine (app legere)
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── pages/
│   │   │   ├── sw.ts              # Service Worker offline
│   │   │   └── api.ts
│   │   └── vite.config.ts
│   │
│   └── ext-paxlog/                # Portail externe PaxLog (app legere)
│       ├── src/
│       │   ├── main.tsx
│       │   ├── pages/
│       │   ├── sw.ts
│       │   └── api.ts
│       └── vite.config.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── conftest.py
│
├── docker-compose.yml             # 6 conteneurs : backend, frontend, web-portal, postgres, redis, traefik
├── docker-compose.dev.yml
├── Dockerfile
├── pyproject.toml
└── .env.example
```

---

## 3. Configuration (.env essentiels)

```env
# ─── Application ──────────────────────────────────────────────
ENVIRONMENT=development                # development | staging | production
SECRET_KEY=CHANGEME_STRONG_SECRET
API_BASE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
ALLOWED_HOSTS=*
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
LOG_LEVEL=INFO

# ─── PostgreSQL ───────────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://opsflux:password@postgres:5432/opsflux
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=30

# ─── Redis ────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ─── Authentification (JWT) ──────────────────────────────────
JWT_SECRET_KEY=CHANGEME_STRONG_SECRET
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# ─── SSO (optionnel) ─────────────────────────────────────────
OAUTH2_ISSUER_URL=
OAUTH2_CLIENT_ID=opsflux
OAUTH2_CLIENT_SECRET=
OAUTH2_AUDIENCE=opsflux-api

# ─── Stockage S3-compatible ──────────────────────────────────
STORAGE_BACKEND=local                  # local | minio | s3
S3_ENDPOINT=http://minio:9000         # ou https://s3.amazonaws.com
S3_BUCKET=opsflux-documents
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
S3_REGION=eu-west-1
STORAGE_MAX_FILE_SIZE_MB=50

# ─── Email ────────────────────────────────────────────────────
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_ADDRESS=noreply@opsflux.io
SMTP_FROM_NAME=OpsFlux
SMTP_USE_TLS=false

# ─── IA / MCP ────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama3

# ─── Monitoring ───────────────────────────────────────────────
SENTRY_DSN=
PROMETHEUS_ENABLED=false

# ─── Domaines (production) ───────────────────────────────────
APP_URL=https://app.opsflux.io
CAPTAIN_APP_URL=https://captain.opsflux.io
EXT_PAXLOG_APP_URL=https://ext.opsflux.io
```

---

## 4. main.py — Application FastAPI avec lifespan, middlewares et ModuleRegistry

```python
# backend/app/main.py

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import settings
from app.core.database import init_db, close_db
from app.core.redis_client import init_redis, close_redis
from app.core.middleware.tenant import TenantSchemaMiddleware
from app.core.middleware.entity_scope import EntityScopeMiddleware
from app.core.middleware.security_headers import SecurityHeadersMiddleware
from app.core.middleware.rate_limit import RateLimitMiddleware
from app.core.module_registry import ModuleRegistry
from app.event_handlers import register_all_handlers
from app.tasks.scheduler import start_scheduler, stop_scheduler
from app.mcp.register import register_mcp_plugins

# ─── Import des manifests des modules ─────────────────────────
from app.modules.report_editor.manifest import MANIFEST as REPORT_MANIFEST
from app.modules.pid_pfd.manifest import MANIFEST as PID_MANIFEST
from app.modules.dashboard.manifest import MANIFEST as DASHBOARD_MANIFEST
from app.modules.asset_registry.manifest import MANIFEST as ASSET_MANIFEST
from app.modules.tiers.manifest import MANIFEST as TIERS_MANIFEST

# ─── Import des routes Core ───────────────────────────────────
from app.api.routes.core import (
    auth, users, tenants, rbac, notifications,
    search, extrafields, workflow, attachments,
    export, connectors, navigation, preferences,
    bookmarks, recommendations, share_links, ai,
)

# ─── Import des routes Modules ────────────────────────────────
from app.api.routes.modules import report, pid_pfd, dashboard, assets, tiers


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup et shutdown de l'application."""
    # ── STARTUP ──────────────────────────────────────────────
    await init_db()
    await init_redis()

    # Enregistrer tous les modules actifs via ModuleRegistry
    registry = ModuleRegistry()
    for manifest in [REPORT_MANIFEST, PID_MANIFEST, DASHBOARD_MANIFEST,
                     ASSET_MANIFEST, TIERS_MANIFEST]:
        await registry.register(manifest)

    # Handlers evenements inter-modules (PostgreSQL LISTEN/NOTIFY)
    await register_all_handlers()

    # Plugins MCP (enregistrement dans le MCP core)
    await register_mcp_plugins()

    # Crons APScheduler
    await start_scheduler()

    # Extensions PostgreSQL
    await init_db_extensions()  # pg_trgm, pgvector, ltree, PostGIS

    if settings.PROMETHEUS_ENABLED:
        from app.core.metrics import init_metrics
        init_metrics(app)

    yield

    # ── SHUTDOWN ─────────────────────────────────────────────
    await stop_scheduler()
    await close_db()
    await close_redis()


app = FastAPI(
    title="OpsFlux API",
    version="1.0.0",
    description="OpsFlux — Plateforme ERP operations",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/api/redoc" if settings.ENVIRONMENT != "production" else None,
)


# ─── Middlewares (ordre CRITIQUE — de l'exterieur vers l'interieur) ─
# L'ordre d'ajout est inverse de l'ordre d'execution.
# Le dernier ajoute est le premier execute sur la requete entrante.

# 1. Hotes de confiance (couche la plus externe)
if settings.ENVIRONMENT == "production":
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS)

# 2. CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Headers de securite (CSP, HSTS, X-Frame-Options)
app.add_middleware(SecurityHeadersMiddleware)

# 4. Rate limiting global
app.add_middleware(RateLimitMiddleware, calls=100, period=60)

# 5. Resolution tenant (SET search_path depuis sous-domaine *.opsflux.io)
app.add_middleware(TenantSchemaMiddleware)

# 6. Entity scope (injecte request.state.entity_id)
app.add_middleware(EntityScopeMiddleware)


# ─── Routes Core ─────────────────────────────────────────────
API_PREFIX = "/api/v1"

app.include_router(auth.router,            prefix=f"{API_PREFIX}/auth")
app.include_router(users.router,           prefix=f"{API_PREFIX}/users")
app.include_router(tenants.router,         prefix=f"{API_PREFIX}/tenants")
app.include_router(rbac.router,            prefix=f"{API_PREFIX}/rbac")
app.include_router(notifications.router,   prefix=f"{API_PREFIX}/notifications")
app.include_router(search.router,          prefix=f"{API_PREFIX}/search")
app.include_router(extrafields.router,     prefix=f"{API_PREFIX}/extrafields")
app.include_router(workflow.router,        prefix=f"{API_PREFIX}/workflow")
app.include_router(attachments.router,     prefix=f"{API_PREFIX}/attachments")
app.include_router(export.router,          prefix=f"{API_PREFIX}/export")
app.include_router(connectors.router,      prefix=f"{API_PREFIX}/connectors")
app.include_router(navigation.router,      prefix=f"{API_PREFIX}/navigation")
app.include_router(preferences.router,     prefix=f"{API_PREFIX}/me")
app.include_router(bookmarks.router,       prefix=f"{API_PREFIX}/me/bookmarks")
app.include_router(recommendations.router, prefix=f"{API_PREFIX}/recommendations")
app.include_router(share_links.router,     prefix=f"{API_PREFIX}/share")
app.include_router(ai.router,              prefix=f"{API_PREFIX}/ai")

# ─── Routes Modules ──────────────────────────────────────────
app.include_router(report.router,    prefix=f"{API_PREFIX}/documents")
app.include_router(pid_pfd.router,   prefix=f"{API_PREFIX}/pid")
app.include_router(dashboard.router, prefix=f"{API_PREFIX}/dashboards")
app.include_router(assets.router,    prefix=f"{API_PREFIX}/assets")
app.include_router(tiers.router,     prefix=f"{API_PREFIX}/tiers")


# ─── Health check ────────────────────────────────────────────
@app.get("/health", include_in_schema=False)
async def health_check():
    return {"status": "ok", "environment": settings.ENVIRONMENT}


# ─── Metrics Prometheus ──────────────────────────────────────
if settings.PROMETHEUS_ENABLED:
    from prometheus_client import generate_latest
    from fastapi import Response

    @app.get("/metrics", include_in_schema=False)
    async def metrics():
        return Response(generate_latest(), media_type="text/plain")
```

---

## 5. Core patterns

### 5.1 Multi-tenancy : 3 niveaux

```
Tenant (schema PostgreSQL, SET search_path)
  └── Entity (entity_id FK, filtre obligatoire)
       └── BU (bu_id, preferences utilisateur)
```

**Resolution du tenant** : Le middleware `TenantSchemaMiddleware` extrait le sous-domaine de la requete (`acme.opsflux.io` -> schema `tenant_acme`) et execute `SET search_path TO tenant_acme, public`. Chaque tenant a son propre schema PostgreSQL.

**Resolution de l'entite** : Le header `X-Entity-ID` ou la preference utilisateur determine l'entite courante. Toutes les requetes metier filtrent par `entity_id`.

```python
# app/core/middleware/tenant.py
class TenantSchemaMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        host = request.headers.get("host", "")
        subdomain = host.split(".")[0]  # acme.opsflux.io -> acme
        schema = f"tenant_{subdomain}"

        # Verifier que le schema existe
        async with get_raw_connection() as conn:
            await conn.execute(text(f"SET search_path TO {schema}, public"))

        request.state.tenant_schema = schema
        request.state.tenant_id = await resolve_tenant_id(subdomain)
        return await call_next(request)
```

### 5.2 Dependency injection — entite et utilisateur

```python
# app/api/deps.py

from fastapi import Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db_dep

async def get_db(db: AsyncSession = Depends(get_db_dep)) -> AsyncSession:
    return db

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    payload = decode_jwt(token)
    user = await db.get(User, payload["sub"])
    if not user or not user.active:
        raise HTTPException(401)
    return user

async def get_current_entity(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> UUID:
    entity_id_header = request.headers.get("X-Entity-ID")
    if entity_id_header:
        entity_id = UUID(entity_id_header)
        if not await user_has_entity_access(current_user.id, entity_id, db):
            raise HTTPException(403, "Acces refuse a cette entite")
        return entity_id
    return current_user.default_entity_id

def requires_permission(permission: str):
    """
    Dependency verifiant une permission granulaire (resource.action).
    Usage : @router.post("/", dependencies=[requires_permission("document.create")])
    """
    async def check(request: Request, db: AsyncSession = Depends(get_db)):
        user_id = request.state.user_id
        tenant_id = request.state.tenant_id
        has_perm = await check_user_permission(db, user_id, tenant_id, permission)
        if not has_perm:
            raise HTTPException(403, f"Permission requise : {permission}")
    return Depends(check)
```

**Pattern endpoint correct** :

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

### 5.3 RBAC — Permissions granulaires (resource.action)

Les permissions suivent le format `resource.action`. Exemples : `document.create`, `ads.validate`, `asset.read`. Elles sont declarees dans les manifests des modules et synchronisees en base au demarrage par `ModuleRegistry`.

```python
# app/core/rbac.py

def require_role(*roles: str):
    async def dependency(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db)
    ) -> None:
        user_roles = await get_user_roles(current_user.id, db)
        if not any(r in user_roles for r in roles):
            raise HTTPException(403, f"Role requis: {', '.join(roles)}")
    return Depends(dependency)
```

### 5.4 Audit log

```python
# app/core/audit.py

from sqlalchemy import event as sa_event

class AuditLogger:
    def record(
        self,
        entity_type: str,
        entity_id: UUID,
        action: str,
        old_values: dict | None = None,
        new_values: dict | None = None,
        performed_by: UUID | None = None,
        source_event: str | None = None,
        source_module: str | None = None,
    ) -> None:
        """Inserer dans audit_log."""
        pass

audit_log = AuditLogger()

# SQLAlchemy event listener — capture automatique des changements
@sa_event.listens_for(AsyncSession, "before_flush")
def capture_changes(session, flush_context, instances):
    for obj in session.dirty:
        if hasattr(obj, '__tablename__') and obj.__tablename__ in AUDITED_TABLES:
            old = {k: session.get_history(obj, k).deleted[0]
                   for k in get_changed_attrs(session, obj)}
            new = {k: getattr(obj, k) for k in old}
            audit_entries.append(AuditEntry(
                entity_type=obj.__tablename__,
                entity_id=obj.id,
                action="updated",
                old_values=old,
                new_values=new,
                performed_by=current_user_context.get()
            ))

AUDITED_TABLES = {
    "projects", "activities", "asset_capacities", "ads", "ads_pax",
    "pax_credentials", "compliance_matrix", "pax_incidents",
    "pax_rotation_cycles", "pax_manifests", "cargo_manifests",
    "trip_code_access", "voyage_events"
}
```

### 5.5 Pagination standardisee

```python
# app/core/pagination.py

from pydantic import BaseModel
from typing import TypeVar, Generic

T = TypeVar("T")

class PaginatedResponse(BaseModel, Generic[T]):
    data:        list[T]
    total:       int
    page:        int
    per_page:    int
    total_pages: int

async def paginate(
    query: Select,
    page: int,
    per_page: int,
    db: AsyncSession,
    schema: type
) -> PaginatedResponse:
    per_page = min(per_page, 100)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    items = await db.execute(query.offset((page - 1) * per_page).limit(per_page))
    return PaginatedResponse(
        data=[schema.model_validate(row) for row in items.scalars()],
        total=total,
        page=page,
        per_page=per_page,
        total_pages=ceil(total / per_page) if total else 0
    )
```

### 5.6 Generation de references atomiques

```python
# app/services/core/reference_gen.py

async def generate_reference(prefix: str, db: AsyncSession) -> str:
    """
    Genere une reference unique lisible avec reset annuel du compteur.
    Format : {PREFIX}-{YYYY}-{NNNNN} (ex: ADS-2026-04521)

    Thread-safe via advisory lock PostgreSQL (pg_advisory_xact_lock).
    La table reference_sequences a une PK composite (prefix, year).
    Le compteur repart a 1 chaque nouvelle annee automatiquement.
    """
    current_year = date.today().year

    async with db.begin():
        lock_key = hash(f"{prefix}_{current_year}") % (2**31)
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:key)"),
            {"key": lock_key}
        )

        result = await db.execute(
            text("""
                INSERT INTO reference_sequences (prefix, year, last_value)
                VALUES (:prefix, :year, 1)
                ON CONFLICT (prefix, year)
                DO UPDATE SET last_value = reference_sequences.last_value + 1
                RETURNING last_value
            """),
            {"prefix": prefix, "year": current_year}
        )
        seq_value = result.scalar_one()

    return f"{prefix}-{current_year}-{seq_value:05d}"

# Exemples :
# ADS-2025-09999 (31/12/2025)
# ADS-2026-00001 (01/01/2026) <- nouveau compteur
```

**Pourquoi `pg_advisory_xact_lock`** : La table `reference_sequences` peut ne pas avoir encore de ligne pour l'annee courante. `SELECT FOR UPDATE` ne peut pas verrouiller une ligne inexistante. L'advisory lock garantit qu'un seul processus a la fois execute l'UPSERT.

### 5.7 Upload S3 avec pre-signed URL

```python
# app/core/s3_client.py

class S3Client:
    async def generate_upload_url(
        self, key: str, content_type: str, expires_in: int = 3600
    ) -> dict:
        """Retourne une pre-signed URL pour upload direct depuis le client."""
        url = self.client.generate_presigned_url(
            "put_object",
            Params={"Bucket": settings.S3_BUCKET, "Key": key,
                    "ContentType": content_type},
            ExpiresIn=expires_in
        )
        return {"upload_url": url, "key": key, "expires_in": expires_in}

    async def get_download_url(self, key: str, expires_in: int = 3600) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET, "Key": key},
            ExpiresIn=expires_in
        )
```

### 5.8 Resolution tenant (schema PostgreSQL)

Chaque tenant a son propre schema PostgreSQL. Le middleware `TenantSchemaMiddleware` resout le schema depuis le sous-domaine de la requete et execute `SET search_path`. Les tables du schema `public` (referentiels partages) restent accessibles.

### 5.9 Event bus — PostgreSQL LISTEN/NOTIFY

```python
# app/core/events.py

# L'event bus utilise PostgreSQL LISTEN/NOTIFY (pas un dict Python).
# Les evenements sont persistes dans la table event_store pour garantir
# l'idempotence des handlers.

async def emit(event_type: str, payload: dict, db: AsyncSession):
    """Emettre un evenement APRES le commit de la transaction."""
    # 1. Persister dans event_store
    event_id = uuid4()
    await db.execute(insert(EventStore).values(
        id=event_id,
        event_type=event_type,
        payload=payload,
    ))
    await db.commit()

    # 2. Notifier via PostgreSQL NOTIFY
    await db.execute(text(
        f"NOTIFY opsflux_events, '{event_type}:{event_id}'"
    ))

async def subscribe(event_type: str, handler: Callable):
    """Abonner un handler a un type d'evenement."""
    # Utilise PostgreSQL LISTEN pour recevoir les notifications
    pass
```

---

## 6. Frontend patterns

### 6.1 api.ts — Instance Axios

```typescript
// apps/main/src/lib/api.ts

import axios, {
    type AxiosInstance,
    type AxiosError,
    type InternalAxiosRequestConfig
} from "axios"
import { useAuthStore } from "@/stores/authStore"
import { useUIStore } from "@/stores/uiStore"
import { toast } from "@/components/ui/use-toast"

// ─── Instance Axios principale ────────────────────────────────
const api: AxiosInstance = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
    timeout: 30_000,
    headers: { "Content-Type": "application/json" },
})

// ─── Intercepteur REQUEST ─────────────────────────────────────
// Injecte automatiquement : Bearer token + X-Tenant-ID + Accept-Language
api.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const authStore = useAuthStore.getState()
        const uiStore = useUIStore.getState()

        if (authStore.accessToken) {
            config.headers.Authorization = `Bearer ${authStore.accessToken}`
        }
        if (uiStore.activeTenantId) {
            config.headers["X-Tenant-ID"] = uiStore.activeTenantId
        }
        config.headers["Accept-Language"] = authStore.user?.language || "fr"

        return config
    },
    (error) => Promise.reject(error)
)

// ─── Intercepteur RESPONSE ────────────────────────────────────
// Gestion globale des erreurs + refresh token automatique

let isRefreshing = false
let failedQueue: Array<{
    resolve: (token: string) => void
    reject: (error: any) => void
}> = []

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach(promise => {
        if (error) promise.reject(error)
        else if (token) promise.resolve(token)
    })
    failedQueue = []
}

api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & {
            _retry?: boolean
        }

        // 401 -> Tenter le refresh token
        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject })
                }).then((token) => {
                    originalRequest.headers.Authorization = `Bearer ${token}`
                    return api(originalRequest)
                }).catch((err) => Promise.reject(err))
            }

            originalRequest._retry = true
            isRefreshing = true

            try {
                const authStore = useAuthStore.getState()
                const newToken = await authStore.refreshToken()
                processQueue(null, newToken)
                originalRequest.headers.Authorization = `Bearer ${newToken}`
                return api(originalRequest)
            } catch (refreshError) {
                processQueue(refreshError, null)
                useAuthStore.getState().logout()
                window.location.href = "/login"
                return Promise.reject(refreshError)
            } finally {
                isRefreshing = false
            }
        }

        // 403 -> Toast permission refusee
        if (error.response?.status === 403) {
            toast({
                title: "Acces refuse",
                description: (error.response.data as any)?.detail
                    || "Vous n'avez pas les droits necessaires.",
                variant: "destructive",
            })
        }

        // 404 -> Laisser gerer localement
        if (error.response?.status === 404) return Promise.reject(error)

        // 422 -> Erreurs de validation (gerees par le formulaire)
        if (error.response?.status === 422) return Promise.reject(error)

        // 500+ -> Toast erreur serveur + Sentry
        if (error.response && error.response.status >= 500) {
            toast({
                title: "Erreur serveur",
                description: "Une erreur inattendue s'est produite.",
                variant: "destructive",
            })
            if (window.Sentry) window.Sentry.captureException(error)
        }

        // Reseau / timeout
        if (!error.response) {
            toast({
                title: "Probleme de connexion",
                description: "Impossible de contacter le serveur.",
                variant: "destructive",
            })
        }

        return Promise.reject(error)
    }
)

export default api

// ─── Helper upload ────────────────────────────────────────────
export const uploadFile = async (
    file: File,
    folder: string = "uploads",
    onProgress?: (percent: number) => void,
): Promise<{ file_id: string; url: string }> => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("folder", folder)

    const response = await api.post("/api/v1/files/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
            if (onProgress && e.total) {
                onProgress(Math.round((e.loaded * 100) / e.total))
            }
        },
    })
    return response.data
}
```

### 6.2 React Query — queryClient.ts

```typescript
// apps/main/src/lib/queryClient.ts

import { QueryClient, type QueryClientConfig } from "@tanstack/react-query"
import { toast } from "@/components/ui/use-toast"
import { AxiosError } from "axios"

const queryClientConfig: QueryClientConfig = {
    defaultOptions: {
        queries: {
            staleTime: 30_000,           // 30 secondes
            gcTime: 5 * 60 * 1000,       // 5 minutes
            retry: (failureCount, error) => {
                if (error instanceof AxiosError) {
                    const status = error.response?.status
                    if (status && status >= 400 && status < 500) return false
                }
                return failureCount < 2
            },
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
            refetchOnWindowFocus: (query) => {
                const dataAge = Date.now() - (query.state.dataUpdatedAt || 0)
                return dataAge > 60_000
            },
            networkMode: "online",
        },
        mutations: {
            onError: (error) => {
                if (error instanceof AxiosError) {
                    const status = error.response?.status
                    if (status === 422 || status === 403) return
                    const message = (error.response?.data as any)?.detail
                        || "Une erreur s'est produite"
                    toast({ title: "Erreur", description: message, variant: "destructive" })
                }
            },
            networkMode: "online",
        },
    },
}

export const queryClient = new QueryClient(queryClientConfig)

// ─── Helpers d'invalidation ──────────────────────────────────
export const invalidateObject = (objectType: string, objectId?: string) => {
    if (objectId) queryClient.invalidateQueries({ queryKey: [objectType, objectId] })
    queryClient.invalidateQueries({ queryKey: [objectType] })
}

export const invalidateAllTenantData = () => {
    queryClient.clear()  // Appele lors d'un switch de tenant
}
```

### 6.3 Zustand — State UI

```tsx
// Donnees serveur -> React Query
const { data } = useQuery({
    queryKey: ["ads", filters],
    queryFn: () => api.get("/api/v1/pax/ads", { params: filters }).then(r => r.data),
})

// State UI -> Zustand
const { sidebarExpanded } = useUIStore()
```

### 6.4 App.tsx — Providers et routing

```tsx
// apps/main/src/App.tsx

import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { RouterProvider, createBrowserRouter } from "react-router-dom"
import { Toaster } from "@/components/ui/toaster"
import { queryClient } from "@/lib/queryClient"
import { AppShell } from "@/components/core/AppShell"
import { AuthGuard } from "@/components/core/AuthGuard"
import { lazy } from "react"

// Pages (lazy loaded)
const DocumentsPage = lazy(() => import("@/pages/modules/documents"))
const PIDPage = lazy(() => import("@/pages/modules/pid"))
const DashboardsPage = lazy(() => import("@/pages/modules/dashboards"))
const AssetsPage = lazy(() => import("@/pages/modules/assets"))
const TiersPage = lazy(() => import("@/pages/modules/tiers"))

const router = createBrowserRouter([
    { path: "/login", element: <LoginPage /> },
    { path: "/share/:token", element: <SharedObjectPage /> },
    {
        element: <AuthGuard><AppShell /></AuthGuard>,
        children: [
            { path: "/", element: <HomePage /> },
            { path: "/documents", element: <DocumentsPage /> },
            { path: "/documents/:id", element: <DocumentDetailPage /> },
            { path: "/pid", element: <PIDPage /> },
            { path: "/dashboards", element: <DashboardsPage /> },
            { path: "/assets", element: <AssetsPage /> },
            { path: "/tiers", element: <TiersPage /> },
            { path: "/settings", element: <SettingsLayout />, children: [
                { path: ":section", element: <SettingsSectionPage /> },
            ]},
        ],
    },
])

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
            <Toaster />
            {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
        </QueryClientProvider>
    )
}
```

---

## 7. Module registration pattern

### 7.1 ModuleRegistry (singleton)

```python
# backend/app/core/module_registry.py

from typing import TypedDict

class ModuleManifest(TypedDict):
    slug: str
    version: str
    depends_on: list[str]
    objects: list[dict]
    permissions: list[str]          # Format resource.action
    menu_items: list[dict]
    notification_templates: list[dict]
    email_templates: list[str]
    settings: list[dict]
    mcp_tools: list[str]
    map_layers: list[dict]
    migrations_path: str


class ModuleRegistry:
    """
    Registre global des modules OpsFlux.
    Singleton — charge les manifests au demarrage de l'application.
    """
    _instance = None
    _registered: dict[str, ModuleManifest] = {}
    _nav_items: list[dict] = []
    _permissions: dict[str, list[str]] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def register(self, manifest: ModuleManifest):
        """Enregistre un module a partir de son manifest."""
        slug = manifest["slug"]
        self._registered[slug] = manifest

        # Nav items
        for item in manifest.get("menu_items", []):
            self._nav_items.append({**item, "module_slug": slug})

        # Permissions -> RBAC (sync en base)
        self._permissions[slug] = manifest.get("permissions", [])
        await self._sync_permissions_to_db(slug, manifest.get("permissions", []))

        # Settings du module
        await self._sync_settings_to_db(slug, manifest.get("settings", []))

        # Templates de notification
        await self._sync_notification_templates(slug, manifest.get("notification_templates", []))

        # Event handlers du module (PostgreSQL LISTEN/NOTIFY)
        await self._register_event_hooks(slug, manifest)

        print(f"Module registered: {slug} v{manifest.get('version', '?')}")

    def get_nav_items(self, tenant_id: str, user_permissions: list[str]) -> list[dict]:
        """Retourne les nav items filtres par permissions de l'utilisateur."""
        items = []
        for item in self._nav_items:
            if item.get("zone") != "sidebar":
                continue
            required = item.get("requires_permission")
            if required and required not in user_permissions:
                continue
            items.append(item)
        return sorted(items, key=lambda x: x.get("order", 999))

    def get_module(self, slug: str) -> ModuleManifest | None:
        return self._registered.get(slug)

    def get_all_permissions(self) -> list[str]:
        """Retourne toutes les permissions declarees par tous les modules."""
        all_perms = []
        for perms in self._permissions.values():
            all_perms.extend(perms)
        return list(set(all_perms))

    async def _sync_permissions_to_db(self, module_slug, permissions):
        """Synchronise les permissions du module en DB (upsert)."""
        async with get_db() as db:
            for perm in permissions:
                existing = await db.execute(
                    select(Permission).where(Permission.key == perm)
                ).scalar_one_or_none()
                if not existing:
                    db.add(Permission(key=perm, module_slug=module_slug, label=perm))
            await db.commit()

    async def _sync_settings_to_db(self, module_slug, settings_defs):
        """Synchronise les definitions de settings du module en DB."""
        async with get_db() as db:
            for i, setting in enumerate(settings_defs):
                existing = await db.execute(
                    select(ModuleSettingsDefinition).where(
                        ModuleSettingsDefinition.module_slug == module_slug,
                        ModuleSettingsDefinition.setting_key == setting["key"],
                    )
                ).scalar_one_or_none()
                if not existing:
                    db.add(ModuleSettingsDefinition(
                        module_slug=module_slug,
                        setting_key=setting["key"],
                        label=setting.get("label", {"fr": setting["key"]}),
                        field_type=setting.get("type", "text"),
                        options=setting.get("options", {}),
                        default_value=setting.get("default"),
                        scope=setting.get("scope", "tenant"),
                        display_order=i,
                        requires_permission=setting.get("requires_permission"),
                    ))
            await db.commit()

    async def _sync_notification_templates(self, module_slug, templates):
        """Synchronise les templates de notification en DB."""
        async with get_db() as db:
            for tmpl in templates:
                existing = await db.execute(
                    select(NotificationTemplate).where(
                        NotificationTemplate.template_key == tmpl["key"],
                    )
                ).scalar_one_or_none()
                if not existing:
                    db.add(NotificationTemplate(
                        template_key=tmpl["key"],
                        module_slug=module_slug,
                        title=tmpl["title"],
                        body=tmpl.get("body"),
                        action_url_template=tmpl.get("action_url"),
                        action_label=tmpl.get("action_label"),
                        default_channels=tmpl.get("default_channels", ["in_app"]),
                        default_priority=tmpl.get("priority", "normal"),
                    ))
            await db.commit()

    async def _register_event_hooks(self, module_slug, manifest):
        """Abonne les handlers d'events du module a l'EventBus PostgreSQL LISTEN/NOTIFY."""
        from app.services.core.event_bus import subscribe
        try:
            module_pkg = __import__(
                f"app.modules.{module_slug}.event_handlers",
                fromlist=["HANDLERS"]
            )
            for event_type, handler in getattr(module_pkg, "HANDLERS", {}).items():
                subscribe(event_type, handler)
        except ImportError:
            pass  # Module sans event handlers — normal
```

### 7.2 Endpoint navigation dynamique

```python
# app/api/routes/core/navigation.py

from fastapi import APIRouter, Request
from app.core.module_registry import ModuleRegistry

router = APIRouter()

@router.get("/navigation/items")
async def get_nav_items(request: Request):
    """Retourne les items de navigation filtres par permissions utilisateur."""
    registry = ModuleRegistry()
    user_permissions = await get_user_permissions(
        request.state.user_id,
        request.state.tenant_id,
    )
    items = registry.get_nav_items(request.state.tenant_id, user_permissions)

    # Ajouter les badges (compteurs) en temps reel
    items_with_badges = []
    for item in items:
        if item.get("badge_source"):
            try:
                count = await fetch_badge_count(item["badge_source"], request)
                items_with_badges.append({**item, "badge": count})
            except Exception:
                items_with_badges.append(item)
        else:
            items_with_badges.append(item)

    return items_with_badges
```

---

## 8. Regles absolues

### 8.1 Ne JAMAIS faire

```python
# INTERDIT : Supprimer physiquement
await db.delete(entity)
await db.execute("DELETE FROM ads WHERE ...")

# INTERDIT : Mettre a jour asset_capacities
await db.execute("UPDATE asset_capacities SET max_pax_total = ...")
# -> Toujours INSERT un nouvel enregistrement avec effective_date

# INTERDIT : Emettre un evenement dans une transaction
async with db.begin():
    ads.status = "approved"
    await db.flush()
    await event_bus.emit("ads.approved", ...)  # <- INTERDIT ici
    await db.commit()
# -> Emettre APRES le commit

# INTERDIT : Requete sans entity_id sur les tables metier
ads = await db.query(AdS).filter(AdS.status == "approved").all()
# -> Toujours filtrer par entity_id

# INTERDIT : Creer des assets depuis les modules
await db.execute(insert(Asset).values(...))
# -> Asset Registry uniquement, lecture seule pour les autres modules

# INTERDIT : Workflow de statut implemente manuellement
if ads.status == "pending_validation" and user.role == "CDS":
    ads.status = "approved"
# -> Utiliser le moteur FSM du core pour toutes les transitions

# INTERDIT : Serveur MCP separe
from fastmcp import FastMCP
mcp = FastMCP("paxlog-mcp")  # <- INTERDIT
# -> Enregistrer les outils comme plugins du MCP core

# INTERDIT : SQLModel
from sqlmodel import SQLModel, Field  # <- INTERDIT
# -> SQLAlchemy 2.0 async uniquement

# INTERDIT : ARQ / arq-worker
from arq import create_pool  # <- INTERDIT
# -> APScheduler uniquement

# INTERDIT : Event handlers en dict Python
HANDLERS = {"ads.approved": handle_ads_approved}  # <- INTERDIT comme event bus
# -> PostgreSQL LISTEN/NOTIFY

# INTERDIT : Logique metier dans les routes
@router.post("/ads")
async def create_ads(body: AdSCreate, db: AsyncSession = Depends(get_db)):
    ads = AdS(**body.dict())  # <- Logique ici = INTERDIT
    db.add(ads)
# -> Tout dans les services

# INTERDIT : Swagger en production
docs_url="/docs"  # <- Pas en prod
# -> docs_url=None si ENVIRONMENT == "production"

# INTERDIT : Sequence maison pour les references
counter = await db.scalar(select(func.max(AdS.ref_number))) + 1
# -> generate_reference(prefix, db)
```

### 8.2 TOUJOURS faire

```python
# Soft delete
entity.archived = True
entity.status = "cancelled"
await db.commit()

# Nouvelle capacite = nouvel enregistrement
await db.execute(insert(AssetCapacity).values(
    asset_id=asset_id,
    max_pax_total=new_capacity,
    effective_date=effective_date,
    reason=reason,       # OBLIGATOIRE
    set_by=actor.id
))

# Emettre apres commit
await db.commit()
await event_bus.emit("ads.approved", payload, db)

# Toujours filtrer par entity_id
ads = await db.query(AdS).filter(
    AdS.entity_id == entity_id,  # <- OBLIGATOIRE
    AdS.status == "approved"
).all()

# FSM core pour les transitions
await fsm_service.transition(
    entity=ads,
    to_state="approved",
    actor=current_user,
    workflow_id=ads.workflow_id
)

# Plugin MCP
from app.mcp.register import mcp_registry
@mcp_registry.tool("paxlog.create_ads")
async def create_ads_tool(...): ...

# Audit log sur chaque changement significatif
await audit_log.record(
    entity_type="ads",
    entity_id=ads.id,
    action="status_changed",
    old_values={"status": old_status},
    new_values={"status": new_status},
    performed_by=actor.id
)

# Reference atomique
reference = await generate_reference("ADS", db)

# Idempotence dans les handlers d'evenements
if await event_store.is_processed(event_id, handler_name):
    return
```

---

## 9. Tests patterns

### 9.1 Commandes

```bash
cd app && pytest tests/ -x --tb=short          # Backend
cd apps/main && npm run test                     # Frontend
cd apps/main && npm run typecheck                # TypeScript
```

Critere : **0 test casse** avant tout commit sur `develop`.

### 9.2 Pattern test d'integration

```python
# tests/integration/test_ads_workflow.py

@pytest.mark.asyncio
async def test_ads_creation_triggers_compliance_check(
    db: AsyncSession, client: AsyncClient
):
    """Une AdS creee doit immediatement verifier la compliance HSE."""
    # Given: un PAX avec certifications manquantes
    pax = await create_test_pax(db, missing_credentials=["H2S_AWARENESS"])
    asset = await create_test_asset(db, requires=["H2S_AWARENESS"])

    # When: creation d'une AdS pour ce PAX sur cet asset
    response = await client.post("/api/v1/pax/ads", json={
        "entity_id": str(test_entity_id),
        "pax_ids": [str(pax.id)],
        "site_entry_asset_id": str(asset.id),
        "visit_category": "project_work",
        "start_date": "2026-06-01",
        "end_date": "2026-06-10",
        "imputations": [{"project_id": ..., "cost_center_id": ..., "percentage": 100}]
    })

    # Then: AdS creee avec PAX en statut blocked
    assert response.status_code == 201
    data = response.json()["data"]
    pax_in_ads = data["pax_list"][0]
    assert pax_in_ads["status"] == "blocked"
    assert pax_in_ads["blocking_count"] == 1
    assert any(
        item["credential_type_code"] == "H2S_AWARENESS"
        and item["status"] == "missing"
        for item in pax_in_ads["compliance_summary"]
    )


@pytest.mark.asyncio
async def test_ads_approval_triggers_travelwiz_manifest(
    db: AsyncSession, client: AsyncClient, event_bus_mock
):
    """L'approbation d'une AdS doit declencher la creation d'un manifeste."""
    # Given: une AdS soumise avec PAX compliant
    ads = await create_approved_ads_pending_validation(db)

    # When: le validateur approuve
    response = await client.post(
        f"/api/v1/pax/ads/{ads.id}/validate",
        json={"action": "approve"}
    )

    # Then: evenement ads.approved emis
    assert response.status_code == 200
    assert event_bus_mock.was_emitted("ads.approved")
    payload = event_bus_mock.get_payload("ads.approved")
    assert len(payload["pax_list"]) == len(ads.pax_list)
```

### 9.3 Checklist PR

```
[ ] ruff check + format -> 0 erreur
[ ] pytest -> 0 test casse
[ ] npm run typecheck -> 0 erreur TypeScript
[ ] alembic upgrade head sur DB vide -> OK
[ ] .env.example mis a jour si nouvelles variables
[ ] Pas de TODO non resolu dans le code commite
```

---

## 10. Performance — cibles et strategies

| Endpoint | Cible P95 | Strategie |
|---|---|---|
| `GET /planner/availability` | < 50ms | Index partiel sur activities + cache Redis 5min |
| `GET /planner/gantt` | < 200ms | Vue materialisee `daily_pax_load` + index composites |
| `GET /pax/ads/pending-validation` | < 100ms | Index sur (entity_id, status) |
| `POST /pax/profiles/check-duplicate` | < 200ms | Index GIN pg_trgm sur noms normalises |
| `GET /iot/stream` | Connexion maintenue | SSE + Redis Pub/Sub + heartbeat 30s |
| `POST /iot/vehicle-position` | < 20ms | INSERT simple + Redis SET async |
| `GET /travelwiz/vehicles/live` | < 100ms | Cache Redis exclusivement (pas de DB) |
| `GET /travelwiz/gantt` | < 300ms | Cache Redis positions + index GiST PostGIS |

### Extensions PostgreSQL requises

```sql
-- Migration Alembic 001_initial_schema.py
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- Fuzzy search PAX
CREATE EXTENSION IF NOT EXISTS vector;      -- Embeddings SAP matching (pgvector)
CREATE EXTENSION IF NOT EXISTS ltree;       -- Hierarchie assets
CREATE EXTENSION IF NOT EXISTS postgis;     -- Geometrie surfaces deck + assets
CREATE EXTENSION IF NOT EXISTS pg_partman;  -- Partitionnement automatique

-- Index GIN pour pg_trgm
CREATE INDEX idx_pax_trgm_last ON pax_profiles
    USING gin(last_name_normalized gin_trgm_ops);
CREATE INDEX idx_pax_trgm_first ON pax_profiles
    USING gin(first_name_normalized gin_trgm_ops);

-- Partitionnement audit_log par trimestre
SELECT partman.create_parent(
    p_parent_table => 'public.audit_log',
    p_control => 'performed_at',
    p_type => 'native',
    p_interval => '3 months'
);

-- Partitionnement vehicle_positions par semaine
SELECT partman.create_parent(
    p_parent_table => 'public.vehicle_positions',
    p_control => 'recorded_at',
    p_type => 'native',
    p_interval => '1 week'
);

-- Vue materialisee charge PAX journaliere
CREATE MATERIALIZED VIEW daily_pax_load AS
SELECT
    a.asset_id,
    a.entity_id,
    d::date AS load_date,
    SUM(a.pax_quota) AS total_pax_booked,
    c.max_pax_total - c.permanent_ops_quota AS net_capacity
FROM activities a
CROSS JOIN generate_series(a.start_date, a.end_date, '1 day'::interval) d
JOIN current_asset_capacity c ON c.asset_id = a.asset_id
WHERE a.status = 'approved'
GROUP BY a.asset_id, a.entity_id, d::date, c.max_pax_total, c.permanent_ops_quota;

CREATE UNIQUE INDEX ON daily_pax_load(asset_id, entity_id, load_date);
```

---

## 11. Phases de developpement

### Phase 1 — Core (Sprint 1, semaines 1-3)

Priorite absolue. Aucun module metier avant que le core soit stable.

1. Auth (JWT access + refresh + logout)
2. RBAC (roles, groupes, permissions granulaires `resource.action`)
3. Multi-tenancy (schemas PostgreSQL par tenant, `TenantSchemaMiddleware`)
4. Multi-entite (`entities` table, `X-Entity-ID` header, `get_current_entity()`)
5. Referentiels communs (assets readonly, tiers, cost_centers, departments)
6. Audit log middleware (SQLAlchemy event listeners)
7. Event bus (PostgreSQL LISTEN/NOTIFY + `event_store`)
8. Extensions PostgreSQL (pg_trgm, pgvector, ltree, PostGIS, pg_partman)
9. Pagination standardisee
10. Generation de references atomiques
11. ModuleRegistry + manifests
12. Docker Compose 6 conteneurs (backend, frontend, web-portal, postgres, redis, traefik)

### Phase 2 — Modules v1.x (Sprints 2-6, semaines 4-16)

**Sprint 2 — Projets (semaines 4-5)**
- CRUD projets + WBS + historique statuts
- ProjectSchedule (versions de planning)
- Taches + liens de dependance (CPM TypeScript + Python)
- Simulation (session temporaire Redis)
- Activation de version (emet `project.schedule_updated`)
- Export CSV SAP imputations

**Sprint 3 — Planner (semaines 6-7)**
- CRUD activites + verification disponibilite
- Calcul capacite + vue materialisee `daily_pax_load`
- Detection conflits + workflow arbitrage DO
- Modal d'impact (preview avant modification)
- Vues Gantt + calendrier
- Push vers PaxLog (suggestions d'activite)

**Sprint 4 — PaxLog (semaines 8-10)**
- Profils PAX + normalisation + deduplication fuzzy pg_trgm
- Credentials + validation HSE + matrice compliance
- Creation AdS + imputations
- Verification compliance (remontee hierarchie ltree)
- Workflow validation AdS (FSM core)
- Portail externe securise (OTP + token)
- Incidents
- Cycles de rotation + batch auto-creation AdS

**Sprint 5 — TravelWiz (semaines 11-13)**
- Vecteurs + surfaces de deck (PostGIS)
- Trips + manifestes PAX (auto-generation depuis ads.approved)
- Manifestes cargo + items
- Organisation de deck (algo bin packing)
- Journal de bord + portail capitaine
- Tracking IoT (endpoint position + SSE)
- Meteo (fetch API + saisie manuelle)
- KPIs voyages
- Dashboard vue carte
- Exports PDF WeasyPrint (terrain)

**Sprint 6 — IA, MCP et integrations (semaines 14-16)**
- Matching SAP (TF-IDF sur article_catalog)
- Deduplication PAX (RapidFuzz + pg_trgm)
- Detection anomalies (batch nocturne)
- Plugins MCP (enregistrement dans MCP core)
- Synchronisation intranet (api/ldap/csv)
- Apps legeres (portail capitaine + portail ext. PaxLog)
- Rapports narratifs (API Claude)

### Phase 3 — v2 (Sprint 7+, semaines 17+)

- Tests d'integration complets
- Performance (requetes < 200ms, index, vue materialisee)
- Partitionnement audit_log + vehicle_positions
- Monitoring et alertes (Prometheus, Sentry)
- Documentation API (OpenAPI auto-generee)
- Optimisations avancees et nouveaux modules

---

*Fin du document — Guide Developpeur OpsFlux*
