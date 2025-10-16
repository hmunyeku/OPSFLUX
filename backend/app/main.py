import sentry_sdk
from fastapi import FastAPI
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.api.main import api_router
from app.core.audit_middleware import AuditLogMiddleware
from app.core.config import settings
from app.core.module_loader import ModuleLoader


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

        # Charger les modules activés
        loaded = ModuleLoader.load_active_modules(session)

        # Enregistrer les routers des modules
        if loaded['routers']:
            print("\n📡 Enregistrement des routers des modules...")
            ModuleLoader.register_module_routers(app)

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
