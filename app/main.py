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
from app.core.middleware.mcp_cors import McpCorsMiddleware
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
from app.modules.conformite import MANIFEST as CONFORMITE_MANIFEST
from app.modules.projets import MANIFEST as PROJETS_MANIFEST
from app.modules.planner import MANIFEST as PLANNER_MANIFEST
from app.modules.travelwiz import MANIFEST as TRAVELWIZ_MANIFEST
from app.modules.packlog import MANIFEST as PACKLOG_MANIFEST
from app.modules.papyrus import MANIFEST as PAPYRUS_MANIFEST
from app.modules.pid_pfd import MANIFEST as PID_PFD_MANIFEST
from app.modules.messaging import MANIFEST as MESSAGING_MANIFEST
from app.modules.support import MANIFEST as SUPPORT_MANIFEST
from app.modules.moc import MANIFEST as MOC_MANIFEST

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
from app.api.routes.core.cost_imputations import router as cost_imputations_router
from app.api.routes.core.imputations import router as imputations_router
from app.api.routes.core.admin_tools import router as admin_tools_router
from app.api.routes.core.email_templates import router as email_templates_router
from app.api.routes.core.pdf_templates import router as pdf_templates_router
from app.api.routes.core.phones import router as phones_router
from app.api.routes.core.contact_emails import router as contact_emails_router
from app.api.routes.core.user_passports import router as user_passports_router
from app.api.routes.core.user_visas import router as user_visas_router
from app.api.routes.core.user_emergency_contacts import router as user_emergency_contacts_router
from app.api.routes.core.user_social_securities import router as user_social_securities_router
from app.api.routes.core.user_vaccines import router as user_vaccines_router
from app.api.routes.core.user_languages import router as user_languages_router
from app.api.routes.core.user_driving_licenses import router as user_driving_licenses_router
from app.api.routes.core.user_sso import router as user_sso_router
from app.api.routes.core.user_health_conditions import router as user_health_conditions_router
from app.api.routes.core.medical_checks import router as medical_checks_router
from app.api.routes.core.legal_identifiers import router as legal_identifiers_router
from app.api.routes.core.integrations import router as integrations_router
from app.api.routes.core.integration_connections import router as integration_connections_router
from app.api.routes.core.github_webhook import router as github_webhook_router
from app.api.routes.core.agent import router as agent_router
from app.api.routes.core.gouti_sync import router as gouti_sync_router
from app.api.routes.core.references import router as references_router
from app.api.routes.core.social_networks import router as social_networks_router
from app.api.routes.core.opening_hours import router as opening_hours_router
from app.api.routes.core.mcp import router as mcp_router
from app.api.routes.core.mcp_gateway import router as mcp_gateway_router, close_http_client
from app.mcp.mcp_native import close_all_backends as close_native_backends
from app.api.routes.core.ws_notifications import router as ws_notifications_router
from app.api.routes.core.workflow import router as workflow_router
from app.api.routes.core.dashboard import router as dashboard_router
from app.api.routes.core.roles import router as roles_router
from app.api.routes.core.groups import router as groups_router
from app.api.routes.modules.paxlog import router as paxlog_router
from app.api.routes.modules.planner import router as planner_router
from app.api.routes.modules.travelwiz import router as travelwiz_router
from app.api.routes.modules.packlog import router as packlog_router
from app.api.routes.modules.papyrus import router as papyrus_router
from app.api.routes.modules.pid_pfd import router as pid_pfd_router
from app.api.routes.modules.asset_registry import router as asset_registry_router
from app.api.routes.modules.messaging import router as messaging_router
from app.api.routes.modules.support import router as support_router
from app.api.routes.modules.moc import router as moc_router
from app.api.routes.core.entities import router as entities_router
from app.api.routes.core.admin import router as admin_router
from app.api.routes.core.import_assistant import router as import_assistant_router
from app.api.routes.core.user_sync import router as user_sync_router
from app.api.routes.core.departments import router as departments_router
from app.api.routes.core.preview import router as preview_router
from app.api.routes.core.dictionary import router as dictionary_router
from app.api.routes.core.i18n import router as i18n_router
from app.api.routes.core.mobile_pairing import router as mobile_pairing_router
from app.api.routes.core.verifications import router as verifications_router
from app.api.routes.core.tracking_osmand import router as tracking_osmand_router
from app.api.routes.core.tracking_ws import router as tracking_ws_router
from app.api.routes.core.ai_chat import router as ai_chat_router
from app.api.routes.core.gdpr import router as gdpr_router
from app.api.routes.core.modules import router as modules_router
from app.api.routes.core.mobile import router as mobile_router

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
    for manifest in [ASSET_MANIFEST, TIERS_MANIFEST, DASHBOARD_MANIFEST, WORKFLOW_MANIFEST, PAXLOG_MANIFEST, CONFORMITE_MANIFEST, PROJETS_MANIFEST, PLANNER_MANIFEST, TRAVELWIZ_MANIFEST, PACKLOG_MANIFEST, PAPYRUS_MANIFEST, PID_PFD_MANIFEST, MESSAGING_MANIFEST, SUPPORT_MANIFEST, MOC_MANIFEST]:
        await registry.register(manifest)

    # Sync module permissions & roles to DB (idempotent upsert — D-021)
    from app.services.core.permission_sync import sync_permissions_and_roles
    await sync_permissions_and_roles()

    # Event handlers
    from app.core.events import event_bus
    register_all_handlers(event_bus)

    # Widget data providers (dashboard)
    from app.services.modules.dashboard_widget_providers import register_all_widget_providers
    register_all_widget_providers()

    # MCP plugins
    await register_mcp_plugins()

    # Production essentials — ALWAYS run (idempotent: entity, admin, workflows, templates, etc.)
    try:
        from app.core.database import async_session_factory
        from app.services.core.seed_service import seed_production_essentials
        async with async_session_factory() as session:
            await seed_production_essentials(session)
    except Exception:
        logger.exception("Failed to seed production essentials (non-fatal)")

    # Dev-only test data (sample users, sample assets) — only when explicitly enabled
    if settings.is_dev and settings.DEV_SEED_ON_STARTUP:
        from app.services.core.seed_service import seed_dev_data
        logger.warning("DEV_SEED_ON_STARTUP enabled — seeding development test data")
        async with async_session_factory() as session:
            await seed_dev_data(session)

    # APScheduler
    await start_scheduler()

    logger.info("OpsFlux ready — %d modules loaded", len(registry.get_all_modules()))

    yield

    # ── SHUTDOWN ─────────────────────────────────────────────────
    await stop_scheduler()
    await close_native_backends()
    await close_http_client()
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
from app.core.middleware.sensitive_data_audit import SensitiveDataAuditMiddleware
from app.core.middleware.body_size_limit import BodySizeLimitMiddleware
app.add_middleware(SensitiveDataAuditMiddleware)
app.add_middleware(RateLimitMiddleware, max_requests=200, window_seconds=60)
# 2 MB soft cap on non-multipart JSON bodies — prevents memory-exhaustion
# DoS and stops the 422 handler from echoing MB-sized payloads.
app.add_middleware(BodySizeLimitMiddleware, max_bytes=2 * 1024 * 1024)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(EntityScopeMiddleware)
app.add_middleware(TenantSchemaMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=settings.cors_methods_list,
    allow_headers=settings.cors_headers_list,
    expose_headers=["X-Request-Id"],
)
app.add_middleware(McpCorsMiddleware)

if settings.ALLOWED_HOSTS != "*":
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.ALLOWED_HOSTS.split(","),
    )


# ─── Global exception handler with CORS headers ────────────────────────────
# When an uncaught Python exception bubbles up, FastAPI's default handler
# does NOT run through CORSMiddleware, so the browser sees a misleading
# "CORS policy blocked" error instead of the real 500. This handler ensures
# the browser always gets a clean JSON error + the proper CORS headers.
# ── 422 validation-error scrubbing on auth endpoints ─────────────────
# Pydantic V2's default ValidationError serializer includes the offending
# input under `errors[].input`. For auth routes this means a typo like
# {"pasword": "MySecret"} ends up echoed verbatim in the response — any
# error-logging layer (Sentry, NGINX body capture) now stores cleartext
# credentials. Override the 422 handler for auth paths to strip `input`
# and redact any field whose name matches a secret pattern.
from fastapi.exceptions import RequestValidationError as _RequestValidationError

_AUTH_PATH_PREFIXES = ("/api/v1/auth/", "/api/v1/profile/change-password")
_SENSITIVE_FIELD_NAMES = {
    "password", "new_password", "old_password", "current_password",
    "refresh_token", "access_token", "mfa_token", "otp", "verification_code",
    "code", "token",
}


def _is_sensitive_route(path: str) -> bool:
    return any(path.startswith(p) for p in _AUTH_PATH_PREFIXES)


def _scrub_validation_errors(errors: list) -> list:
    out = []
    for err in errors:
        # err is a dict with loc, msg, type, input, url, ctx…
        cleaned = {k: v for k, v in err.items() if k != "input"}
        loc = cleaned.get("loc") or ()
        last = str(loc[-1]).lower() if loc else ""
        if any(s in last for s in _SENSITIVE_FIELD_NAMES):
            cleaned["msg"] = "Invalid or missing credential field"
        out.append(cleaned)
    return out


@app.exception_handler(_RequestValidationError)
async def _validation_error_handler(request, exc):  # type: ignore[no-untyped-def]
    from starlette.responses import JSONResponse as _JSONResponse

    if _is_sensitive_route(request.url.path):
        return _JSONResponse(
            status_code=422,
            content={"detail": _scrub_validation_errors(list(exc.errors()))},
        )
    # Default behavior for non-auth routes (FastAPI's default format).
    return _JSONResponse(
        status_code=422,
        content={"detail": list(exc.errors())},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):  # type: ignore[no-untyped-def]
    import logging as _logging
    from starlette.responses import JSONResponse as _JSONResponse
    _logging.getLogger("app.main").exception(
        "Unhandled exception on %s %s", request.method, request.url.path
    )
    origin = request.headers.get("origin", "")
    allowed_origins = set(settings.allowed_origins_list)
    cors_origin = origin if origin in allowed_origins or origin.startswith("https://") else "*"
    return _JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": "Une erreur interne est survenue.",
            "path": request.url.path,
        },
        headers={
            "Access-Control-Allow-Origin": cors_origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        },
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
app.include_router(asset_registry_router)
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
app.include_router(cost_imputations_router)
app.include_router(imputations_router)
app.include_router(admin_tools_router)
app.include_router(email_templates_router)
app.include_router(pdf_templates_router)
app.include_router(phones_router)
app.include_router(contact_emails_router)
app.include_router(user_passports_router)
app.include_router(user_visas_router)
app.include_router(user_emergency_contacts_router)
app.include_router(user_social_securities_router)
app.include_router(user_vaccines_router)
app.include_router(user_languages_router)
app.include_router(user_driving_licenses_router)
app.include_router(user_sso_router)
app.include_router(user_health_conditions_router)
app.include_router(medical_checks_router)
app.include_router(legal_identifiers_router)
app.include_router(integrations_router)
app.include_router(integration_connections_router)
app.include_router(github_webhook_router)
app.include_router(agent_router)
app.include_router(gouti_sync_router)
app.include_router(ws_notifications_router)
app.include_router(workflow_router)
app.include_router(dashboard_router)
app.include_router(roles_router)
app.include_router(groups_router)
app.include_router(references_router)
app.include_router(mcp_router)
app.include_router(mcp_gateway_router)
app.include_router(paxlog_router)
app.include_router(planner_router)
app.include_router(travelwiz_router)
app.include_router(packlog_router)
app.include_router(papyrus_router)
app.include_router(pid_pfd_router)
app.include_router(messaging_router)
app.include_router(support_router)
app.include_router(moc_router)
app.include_router(entities_router)
app.include_router(admin_router)
app.include_router(import_assistant_router)
app.include_router(user_sync_router)
app.include_router(departments_router)
app.include_router(social_networks_router)
app.include_router(opening_hours_router)
app.include_router(preview_router)
app.include_router(dictionary_router)
app.include_router(i18n_router)
app.include_router(mobile_pairing_router)
app.include_router(verifications_router)
app.include_router(tracking_osmand_router)
app.include_router(tracking_ws_router)
app.include_router(ai_chat_router)
app.include_router(gdpr_router)
app.include_router(modules_router)
app.include_router(mobile_router)


# ─── Static files (avatars, uploads) ──────────────────────────────────────
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
os.makedirs(os.path.join(STATIC_DIR, "avatars"), exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/api/v1/ping")
async def ping():
    """
    Ultra-cheap reachability probe.

    The mobile app polls this from its NetInfo reachability configuration
    to tell "really online" (can reach our backend) from "on a captive
    wifi that routes to nowhere". Must stay dependency-free (no DB /
    Redis), respond within a few ms, and always return 2xx while the
    HTTP server is up — so NetInfo doesn't flip offline on a degraded
    DB.
    """
    return {"ok": True}


@app.get("/api/health")
async def health_check():
    """Public health check — tests DB and Redis, returns 503 if any critical service is down."""
    from app.core.database import async_session_factory
    from app.core.redis_client import get_redis
    from sqlalchemy import text
    from starlette.responses import JSONResponse

    db_ok = True
    redis_ok = True

    # ── Database ──────────────────────────────────────────────────
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    # ── Redis ─────────────────────────────────────────────────────
    try:
        redis = get_redis()
        await redis.ping()
    except Exception:
        redis_ok = False

    overall = "healthy" if (db_ok and redis_ok) else "degraded"
    status_code = 200 if overall == "healthy" else 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": overall,
            "version": "1.0.0",
            "environment": settings.ENVIRONMENT,
            "database": "ok" if db_ok else "error",
            "redis": "ok" if redis_ok else "error",
        },
    )
