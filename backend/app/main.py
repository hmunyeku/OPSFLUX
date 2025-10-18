import sentry_sdk
from fastapi import FastAPI, Depends
from fastapi.routing import APIRoute
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.api.main import api_router
from app.core.audit_middleware import AuditLogMiddleware
from app.core.config import settings
from app.core.module_loader import ModuleLoader
from app.core.api_key_auth import verify_api_key


def custom_generate_unique_id(route: APIRoute) -> str:
    return f"{route.tags[0]}-{route.name}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan event handler - Appelé au démarrage et à l'arrêt de l'application.

    Charge dynamiquement les modules activés au démarrage.
    """
    # Startup: Charger les modules activés
    print("\n🚀 Application startup...")

    try:
        from app.api.deps import get_db

        # Obtenir une session DB pour charger les modules
        db_gen = get_db()
        session = next(db_gen)

        # Charger les modules activés (HOT RELOAD: passer l'instance app)
        loaded = ModuleLoader.load_active_modules(session, app=app)

        session.close()

    except Exception as e:
        print(f"⚠️  Erreur lors du chargement des modules: {e}")
        print("   L'application démarre sans modules.")

    yield

    # Shutdown
    print("\n👋 Application shutdown...")


if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
    lifespan=lifespan,
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

# Add audit logging middleware
app.add_middleware(AuditLogMiddleware)

app.include_router(api_router, prefix=settings.API_V1_STR)


# Securiser la documentation Swagger avec API Key
@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html(current_user=Depends(verify_api_key)):
    """
    Swagger UI accessible uniquement avec API Key valide.

    Pour acceder a /docs:
    1. Generer votre cle API via POST /api/v1/users/me/api-key
    2. Utiliser l'extension ModHeader ou similaire pour ajouter le header:
       X-API-Key: ofs_votre_cle_ici
    3. Acceder a /docs
    """
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} - Swagger UI",
        swagger_favicon_url="/static/favicon.ico" if settings.ENVIRONMENT != "local" else None,
    )


@app.get("/openapi.json", include_in_schema=False)
async def get_open_api_endpoint(current_user=Depends(verify_api_key)):
    """
    OpenAPI schema accessible uniquement avec API Key valide.
    """
    return JSONResponse(app.openapi())
