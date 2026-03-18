"""OpsFlux API — FastAPI application with lifespan, middlewares, and ModuleRegistry."""

import logging
import os
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles

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

# Module manifests
from app.modules.asset_registry import MANIFEST as ASSET_MANIFEST
from app.modules.tiers import MANIFEST as TIERS_MANIFEST
from app.modules.dashboard import MANIFEST as DASHBOARD_MANIFEST
from app.modules.workflow import MANIFEST as WORKFLOW_MANIFEST
from app.modules.paxlog import MANIFEST as PAXLOG_MANIFEST

# Route imports
from app.api.routes.core.auth import router as auth_router
from app.api.routes.core.users import router as users_router
from app.api.routes.core.notifications import router as notifications_router
from app.api.routes.core.settings import router as settings_router
from app.api.routes.modules.assets import router as assets_router
from app.api.routes.modules.tiers import router as tiers_router
from app.api.routes.modules.conformite import router as conformite_router
from app.api.routes.modules.projets import router as projets_router
from app.api.routes.core.profile import router as profile_router
from app.api.routes.core.sessions import router as sessions_router
from app.api.routes.core.tokens import router as tokens_router
from app.api.routes.core.emails import router as emails_router
from app.api.routes.core.oauth_apps import router as oauth_router
from app.api.routes.core.addresses import router as addresses_router
from app.api.routes.core.audit import router as audit_router
from app.api.routes.core.preferences import router as preferences_router
from app.api.routes.core.mfa import router as mfa_router
from app.api.routes.core.search import router as search_router
from app.api.routes.core.tags import router as tags_router
from app.api.routes.core.notes import router as notes_router
from app.api.routes.core.attachments import router as attachments_router
from app.api.routes.core.email_templates import router as email_templates_router
from app.api.routes.core.phones import router as phones_router
from app.api.routes.core.contact_emails import router as contact_emails_router
from app.api.routes.core.integrations import router as integrations_router
from app.api.routes.core.references import router as references_router
from app.api.routes.core.mcp import router as mcp_router
from app.api.routes.core.ws_notifications import router as ws_notifications_router
from app.api.routes.core.workflow import router as workflow_router
from app.api.routes.core.dashboard import router as dashboard_router
from app.api.routes.core.roles import router as roles_router
from app.api.routes.core.groups import router as groups_router
from app.api.routes.modules.paxlog import router as paxlog_router

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    # ── STARTUP ──────────────────────────────────────────────────
    logger.info("OpsFlux starting — env=%s", settings.ENVIRONMENT)

    # Sentry (if configured)
    if settings.SENTRY_DSN:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENVIRONMENT,
            traces_sample_rate=0.1 if settings.is_prod else 1.0,
        )

    await init_db()
    await init_redis()

    # Register modules (idempotent)
    registry = ModuleRegistry()
    for manifest in [ASSET_MANIFEST, TIERS_MANIFEST, DASHBOARD_MANIFEST, WORKFLOW_MANIFEST, PAXLOG_MANIFEST]:
        await registry.register(manifest)

    # Sync module permissions & roles to DB (idempotent upsert — D-021)
    from app.services.core.permission_sync import sync_permissions_and_roles
    await sync_permissions_and_roles()

    # Event handlers
    from app.core.events import event_bus
    register_all_handlers(event_bus)

    # MCP plugins
    await register_mcp_plugins()

    # APScheduler
    await start_scheduler()

    logger.info("OpsFlux ready — %d modules loaded", len(registry.get_all_modules()))

    yield

    # ── SHUTDOWN ─────────────────────────────────────────────────
    await stop_scheduler()
    await close_db()
    await close_redis()
    logger.info("OpsFlux shutdown complete")


app = FastAPI(
    title="OpsFlux API",
    version="1.0.0",
    description="OpsFlux — Plateforme ERP opérations industrielles multi-tenant",
    lifespan=lifespan,
    docs_url="/api/docs" if not settings.is_prod else None,
    redoc_url="/api/redoc" if not settings.is_prod else None,
    openapi_url="/api/openapi.json" if not settings.is_prod else None,
)


# ─── Middlewares (order matters: last added = first executed) ──────────────
app.add_middleware(RateLimitMiddleware, max_requests=200, window_seconds=60)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(EntityScopeMiddleware)
app.add_middleware(TenantSchemaMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
)

if settings.ALLOWED_HOSTS != "*":
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.ALLOWED_HOSTS.split(","),
    )


# ─── Routes ────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(notifications_router)
app.include_router(settings_router)
app.include_router(assets_router)
app.include_router(tiers_router)
app.include_router(conformite_router)
app.include_router(projets_router)
app.include_router(profile_router)
app.include_router(sessions_router)
app.include_router(tokens_router)
app.include_router(emails_router)
app.include_router(oauth_router)
app.include_router(addresses_router)
app.include_router(audit_router)
app.include_router(preferences_router)
app.include_router(mfa_router)
app.include_router(search_router)
app.include_router(tags_router)
app.include_router(notes_router)
app.include_router(attachments_router)
app.include_router(email_templates_router)
app.include_router(phones_router)
app.include_router(contact_emails_router)
app.include_router(integrations_router)
app.include_router(ws_notifications_router)
app.include_router(workflow_router)
app.include_router(dashboard_router)
app.include_router(roles_router)
app.include_router(groups_router)
app.include_router(references_router)
app.include_router(mcp_router)
app.include_router(paxlog_router)


# ─── Static files (avatars, uploads) ──────────────────────────────────────
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
os.makedirs(os.path.join(STATIC_DIR, "avatars"), exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
    }
