import sentry_sdk
from fastapi import FastAPI, Depends, Request
from fastapi.routing import APIRoute
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.api.main import api_router
from app.core.audit_middleware import AuditLogMiddleware
from app.core.proxy_middleware import ProxyHeadersMiddleware
from app.core.metrics_middleware import MetricsMiddleware
from app.core.config import settings
from app.core.module_loader import ModuleLoader
from app.core.api_key_auth import get_api_key_or_token

logger = logging.getLogger(__name__)


def custom_generate_unique_id(route: APIRoute) -> str:
    if route.tags:
        return f"{route.tags[0]}-{route.name}"
    return route.name or "default"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan event handler - Appelé au démarrage et à l'arrêt de l'application.

    Charge dynamiquement les modules activés au démarrage et démarre le hot reload.
    """
    # Startup: Charger les modules activés
    print("\n🚀 Application startup...")

    session = None
    try:
        from app.api.deps import get_db
        from app.core.module_hot_reload import hot_reload_service
        from app.services.module_service import ModuleManager

        # Obtenir une session DB pour charger les modules
        db_gen = get_db()
        session = next(db_gen)

        # Découvrir et enregistrer automatiquement les nouveaux modules
        try:
            discovered = ModuleManager.discover_modules(session)
            if discovered:
                print(f"🔍 Modules découverts: {len(discovered)}")
        except Exception as e:
            print(f"⚠️  Erreur lors de la découverte des modules: {e}")

        # Charger les modules activés (HOT RELOAD: passer l'instance app)
        loaded = ModuleLoader.load_active_modules(session, app=app)

        # Démarrer le service de hot reload
        hot_reload_service.set_app(app)
        hot_reload_service.set_db_session(session)
        hot_reload_service.start_watching()

    except Exception as e:
        print(f"⚠️  Erreur lors du chargement des modules: {e}")
        print("   L'application démarre sans modules.")

    yield

    # Shutdown
    print("\n👋 Application shutdown...")

    try:
        from app.core.module_hot_reload import hot_reload_service
        hot_reload_service.stop_watching()
    except Exception as e:
        print(f"⚠️  Erreur lors de l'arrêt du hot reload: {e}")

    if session:
        session.close()


if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=None,  # Désactiver /docs par défaut (on utilise notre route sécurisée)
    redoc_url=None,  # Désactiver /redoc par défaut (on ajoute une route sécurisée)
    generate_unique_id_function=custom_generate_unique_id,
    lifespan=lifespan,
)


# Temporary validation error handler for debugging
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Log validation errors for debugging purposes.
    This helps identify which fields are failing validation.
    """
    logger.error(f"❌ VALIDATION ERROR on {request.method} {request.url.path}")
    logger.error(f"Validation errors: {exc.errors()}")
    try:
        body = await request.body()
        logger.error(f"Request body: {body.decode('utf-8')}")
    except Exception as e:
        logger.error(f"Could not read request body: {e}")

    # Return the standard FastAPI validation error response
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )


# Set all CORS enabled origins
if settings.all_cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Add proxy headers middleware to handle X-Forwarded-* headers
# This ensures redirects use HTTPS when behind a reverse proxy
app.add_middleware(ProxyHeadersMiddleware)

# Add metrics middleware to track HTTP requests
app.add_middleware(MetricsMiddleware)

# Add audit logging middleware
app.add_middleware(AuditLogMiddleware)

app.include_router(api_router, prefix=settings.API_V1_STR)


# Securiser la documentation Swagger avec API Key
@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html(current_user=Depends(get_api_key_or_token)):
    """
    Swagger UI accessible avec API Key ou JWT token.

    Pour acceder a /docs:
    - Avec API Key: Ajouter header X-API-Key: ofs_votre_cle_ici
    - Avec JWT: Ajouter header Authorization: Bearer votre_token_ici
    """
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} - Swagger UI",
        swagger_favicon_url="/static/favicon.ico" if settings.ENVIRONMENT != "local" else None,
    )


@app.get("/redoc", include_in_schema=False)
async def custom_redoc_html(current_user=Depends(get_api_key_or_token)):
    """
    ReDoc UI accessible avec API Key ou JWT token.

    Pour acceder a /redoc:
    - Avec API Key: Ajouter header X-API-Key: ofs_votre_cle_ici
    - Avec JWT: Ajouter header Authorization: Bearer votre_token_ici
    """
    return get_redoc_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} - ReDoc",
        redoc_favicon_url="/static/favicon.ico" if settings.ENVIRONMENT != "local" else None,
    )


@app.get("/openapi.json", include_in_schema=False)
async def get_open_api_endpoint(current_user=Depends(get_api_key_or_token)):
    """
    OpenAPI schema accessible avec API Key ou JWT token.
    """
    return JSONResponse(app.openapi())
