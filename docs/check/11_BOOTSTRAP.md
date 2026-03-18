# OpsFlux — 11_BOOTSTRAP.md
# Plomberie technique : main.py, Module Registration, api.ts, queryClient.ts

> Ce fichier documente le code d'infrastructure qui relie tout ensemble.
> Claude Code implémente ce code au démarrage de P0 — avant tout module.

---

## 1. FastAPI main.py — Complet

```python
# backend/app/main.py

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.core.redis import init_redis
from app.core.middleware.tenant import TenantMiddleware
from app.core.middleware.bu_scope import BUScopeMiddleware
from app.core.middleware.security_headers import SecurityHeadersMiddleware
from app.core.middleware.rate_limit import RateLimitMiddleware
from app.core.module_registry import ModuleRegistry
from app.core.metrics import init_metrics

# ─── Import des routes Core ───────────────────────────────────────
from app.api.routes.core import (
    auth, users, tenants, rbac, notifications,
    search, extrafields, workflow, attachments,
    export, connectors, navigation, preferences,
    bookmarks, recommendations, share_links, ai,
)

# ─── Import des routes Modules ────────────────────────────────────
from app.api.routes.modules import report, pid_pfd, dashboard, assets, tiers

# ─── Import des manifests des modules ─────────────────────────────
from app.modules.report_editor.manifest import MANIFEST as REPORT_MANIFEST
from app.modules.pid_pfd.manifest import MANIFEST as PID_MANIFEST
from app.modules.dashboard.manifest import MANIFEST as DASHBOARD_MANIFEST
from app.modules.asset_registry.manifest import MANIFEST as ASSET_MANIFEST
from app.modules.tiers.manifest import MANIFEST as TIERS_MANIFEST


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup et shutdown de l'application."""
    # ── STARTUP ──────────────────────────────────────────────────
    await init_db()
    await init_redis()

    # Enregistrer tous les modules actifs
    registry = ModuleRegistry()
    for manifest in [REPORT_MANIFEST, PID_MANIFEST, DASHBOARD_MANIFEST,
                     ASSET_MANIFEST, TIERS_MANIFEST]:
        await registry.register(manifest)

    # Démarrer les workers ARQ en développement
    if settings.ENVIRONMENT == "development":
        import asyncio
        from app.workers.settings import start_dev_worker
        asyncio.create_task(start_dev_worker())

    if settings.PROMETHEUS_ENABLED:
        init_metrics(app)

    yield

    # ── SHUTDOWN ─────────────────────────────────────────────────
    # Fermer les connexions DB et Redis
    from app.core.database import close_db
    from app.core.redis import close_redis
    await close_db()
    await close_redis()


app = FastAPI(
    title="OpsFlux API",
    version="1.0.0",
    description="OpsFlux — Plateforme de gestion documentaire Perenco",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
)

# ─── Middlewares (ordre CRITIQUE — de l'extérieur vers l'intérieur) ─

# 1. Hôtes de confiance
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

# 3. Headers de sécurité (CSP, HSTS, X-Frame-Options...)
app.add_middleware(SecurityHeadersMiddleware)

# 4. Rate limiting global
app.add_middleware(RateLimitMiddleware, calls=100, period=60)

# 5. Résolution tenant (injecte request.state.tenant_id)
app.add_middleware(TenantMiddleware)

# 6. BU Scope (injecte request.state.bu_id depuis préférences user)
app.add_middleware(BUScopeMiddleware)


# ─── Routes Core ─────────────────────────────────────────────────

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


# ─── Routes Modules ───────────────────────────────────────────────

app.include_router(report.router,    prefix=f"{API_PREFIX}/documents")
app.include_router(pid_pfd.router,   prefix=f"{API_PREFIX}/pid")
app.include_router(dashboard.router, prefix=f"{API_PREFIX}/dashboards")
app.include_router(assets.router,    prefix=f"{API_PREFIX}/assets")
app.include_router(tiers.router,     prefix=f"{API_PREFIX}/tiers")


# ─── Health check ─────────────────────────────────────────────────

@app.get("/health", include_in_schema=False)
async def health_check():
    return {"status": "ok", "environment": settings.ENVIRONMENT}


# ─── Metrics Prometheus ───────────────────────────────────────────

if settings.PROMETHEUS_ENABLED:
    from prometheus_client import generate_latest
    from fastapi import Response

    @app.get("/metrics", include_in_schema=False)
    async def metrics():
        return Response(generate_latest(), media_type="text/plain")
```

---

## 2. Module Registration System

```python
# backend/app/core/module_registry.py

from typing import TypedDict
from app.core.database import get_db
from app.models.core.module_settings import ModuleSettingsDefinition

class ModuleManifest(TypedDict):
    slug: str
    version: str
    depends_on: list[str]
    objects: list[dict]
    permissions: list[str]
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
    Charge les manifests au démarrage de l'application.
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
        """Enregistre un module à partir de son manifest."""
        slug = manifest["slug"]
        self._registered[slug] = manifest

        # Enregistrer les nav items
        for item in manifest.get("menu_items", []):
            self._nav_items.append({**item, "module_slug": slug})

        # Enregistrer les permissions dans le système RBAC
        self._permissions[slug] = manifest.get("permissions", [])
        await self._sync_permissions_to_db(slug, manifest.get("permissions", []))

        # Enregistrer les settings du module
        await self._sync_settings_to_db(slug, manifest.get("settings", []))

        # Enregistrer les templates de notification
        await self._sync_notification_templates(slug, manifest.get("notification_templates", []))

        # Abonner les event handlers du module
        await self._register_event_hooks(slug, manifest)

        print(f"✅ Module registered: {slug} v{manifest.get('version', '?')}")

    def get_nav_items(self, tenant_id: str, user_permissions: list[str]) -> list[dict]:
        """Retourne les nav items filtrés par permissions de l'utilisateur."""
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
        """Retourne toutes les permissions déclarées par tous les modules."""
        all_perms = []
        for perms in self._permissions.values():
            all_perms.extend(perms)
        return list(set(all_perms))

    async def _sync_permissions_to_db(self, module_slug: str, permissions: list[str]):
        """Synchronise les permissions du module en DB (upsert)."""
        async with get_db() as db:
            for perm in permissions:
                existing = await db.execute(
                    select(Permission).where(Permission.key == perm)
                ).scalar_one_or_none()
                if not existing:
                    db.add(Permission(
                        key=perm,
                        module_slug=module_slug,
                        label=perm,
                    ))
            await db.commit()

    async def _sync_settings_to_db(self, module_slug: str, settings_defs: list[dict]):
        """Synchronise les définitions de settings du module en DB."""
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

    async def _sync_notification_templates(self, module_slug: str, templates: list[dict]):
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

    async def _register_event_hooks(self, module_slug: str, manifest: ModuleManifest):
        """Abonne les handlers d'events du module à l'EventBus."""
        from app.services.core.event_bus import subscribe

        # Les modules déclarent leurs handlers dans leur package
        try:
            module_pkg = __import__(
                f"app.modules.{module_slug}.event_handlers",
                fromlist=["HANDLERS"]
            )
            for event_type, handler in getattr(module_pkg, "HANDLERS", {}).items():
                subscribe(event_type, handler)
                print(f"  → EventBus: {module_slug} subscribed to {event_type}")
        except ImportError:
            pass  # Module sans event handlers — normal


# Endpoint qui expose les nav items dynamiques
# app/api/routes/core/navigation.py

from fastapi import APIRouter, Request
from app.core.module_registry import ModuleRegistry

router = APIRouter()

@router.get("/navigation/items")
async def get_nav_items(request: Request):
    """Retourne les items de navigation filtrés par permissions de l'utilisateur."""
    registry = ModuleRegistry()
    user_permissions = await get_user_permissions(
        request.state.user_id,
        request.state.tenant_id,
    )
    items = registry.get_nav_items(request.state.tenant_id, user_permissions)

    # Ajouter les badges (compteurs) en temps réel
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

## 3. Frontend — src/lib/api.ts (instance Axios)

```typescript
// frontend/src/lib/api.ts

import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from "axios"
import { useAuthStore } from "@/stores/authStore"
import { useUIStore } from "@/stores/uiStore"
import { toast } from "@/components/ui/use-toast"

// ─── Instance Axios principale ────────────────────────────────────

const api: AxiosInstance = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
    timeout: 30_000,
    headers: {
        "Content-Type": "application/json",
    },
})

// ─── Intercepteur REQUEST ──────────────────────────────────────────
// Injecte automatiquement : Bearer token + X-Tenant-ID + Accept-Language

api.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const authStore = useAuthStore.getState()
        const uiStore = useUIStore.getState()

        // Token JWT
        if (authStore.accessToken) {
            config.headers.Authorization = `Bearer ${authStore.accessToken}`
        }

        // Tenant actif (pour que le backend puisse valider)
        if (uiStore.activeTenantId) {
            config.headers["X-Tenant-ID"] = uiStore.activeTenantId
        }

        // Langue préférée
        config.headers["Accept-Language"] = authStore.user?.language || "fr"

        return config
    },
    (error) => Promise.reject(error)
)

// ─── Intercepteur RESPONSE ─────────────────────────────────────────
// Gestion globale des erreurs + refresh token automatique

let isRefreshing = false
let failedQueue: Array<{ resolve: (token: string) => void; reject: (error: any) => void }> = []

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach(promise => {
        if (error) {
            promise.reject(error)
        } else if (token) {
            promise.resolve(token)
        }
    })
    failedQueue = []
}

api.interceptors.response.use(
    (response) => response,

    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

        // ── 401 → Tenter le refresh token ────────────────────────
        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                // File d'attente : attendre que le refresh soit terminé
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
                // Refresh échoué → déconnecter
                useAuthStore.getState().logout()
                window.location.href = "/login"
                return Promise.reject(refreshError)
            } finally {
                isRefreshing = false
            }
        }

        // ── 403 → Notification permission refusée ──────────────
        if (error.response?.status === 403) {
            toast({
                title: "Accès refusé",
                description: (error.response.data as any)?.detail || "Vous n'avez pas les droits nécessaires.",
                variant: "destructive",
            })
        }

        // ── 404 → Laisser gérer localement (pas de toast global)
        if (error.response?.status === 404) {
            return Promise.reject(error)
        }

        // ── 422 → Erreurs de validation (laisser gérer par le form)
        if (error.response?.status === 422) {
            return Promise.reject(error)
        }

        // ── 500+ → Toast erreur serveur ──────────────────────────
        if (error.response && error.response.status >= 500) {
            toast({
                title: "Erreur serveur",
                description: "Une erreur inattendue s'est produite. L'équipe technique a été notifiée.",
                variant: "destructive",
            })
            // Envoyer à Sentry
            if (window.Sentry) {
                window.Sentry.captureException(error)
            }
        }

        // ── Réseau / timeout ─────────────────────────────────────
        if (!error.response) {
            toast({
                title: "Problème de connexion",
                description: "Impossible de contacter le serveur. Vérifiez votre connexion.",
                variant: "destructive",
            })
        }

        return Promise.reject(error)
    }
)

export default api

// ─── Helpers pour uploads ─────────────────────────────────────────

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

---

## 4. Frontend — src/lib/queryClient.ts (React Query)

```typescript
// frontend/src/lib/queryClient.ts

import { QueryClient, type QueryClientConfig } from "@tanstack/react-query"
import { toast } from "@/components/ui/use-toast"
import { AxiosError } from "axios"

const queryClientConfig: QueryClientConfig = {
    defaultOptions: {
        queries: {
            // Durée pendant laquelle les données sont considérées fraîches
            staleTime: 30_000,          // 30 secondes

            // Durée de cache après que le composant se démonte
            gcTime: 5 * 60 * 1000,      // 5 minutes

            // Retry sur erreur réseau uniquement (pas sur 4xx)
            retry: (failureCount, error) => {
                if (error instanceof AxiosError) {
                    const status = error.response?.status
                    if (status && status >= 400 && status < 500) {
                        return false  // Ne pas retry sur les 4xx
                    }
                }
                return failureCount < 2  // Max 2 retries
            },

            // Délai entre retries
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),

            // Refetch au focus seulement si données > 60s
            refetchOnWindowFocus: (query) => {
                const dataAge = Date.now() - (query.state.dataUpdatedAt || 0)
                return dataAge > 60_000
            },

            // Pas de refetch si offline
            networkMode: "online",
        },

        mutations: {
            // Toast automatique sur erreur mutation (sauf si gérée localement)
            onError: (error) => {
                if (error instanceof AxiosError) {
                    const status = error.response?.status
                    // 422 : géré par le formulaire (pas de toast global)
                    if (status === 422) return
                    // 403 : géré par l'intercepteur Axios
                    if (status === 403) return

                    const message = (error.response?.data as any)?.detail
                        || "Une erreur s'est produite"
                    toast({
                        title: "Erreur",
                        description: message,
                        variant: "destructive",
                    })
                }
            },
            networkMode: "online",
        },
    },
}

export const queryClient = new QueryClient(queryClientConfig)

// ─── Helpers d'invalidation ──────────────────────────────────────

/**
 * Invalide toutes les queries liées à un objet.
 * Appelé après une mutation qui modifie un objet (document, asset, etc.)
 */
export const invalidateObject = (objectType: string, objectId?: string) => {
    if (objectId) {
        queryClient.invalidateQueries({ queryKey: [objectType, objectId] })
    }
    queryClient.invalidateQueries({ queryKey: [objectType] })
}

/**
 * Invalide toutes les queries du tenant courant.
 * Appelé lors d'un switch de tenant.
 */
export const invalidateAllTenantData = () => {
    queryClient.clear()
}
```

---

## 5. Frontend — src/App.tsx (Providers et routing)

```tsx
// frontend/src/App.tsx

import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { RouterProvider, createBrowserRouter } from "react-router-dom"
import { Toaster } from "@/components/ui/toaster"
import { queryClient } from "@/lib/queryClient"
import { AppShell } from "@/components/core/AppShell"
import { AuthGuard } from "@/components/core/AuthGuard"

// ─── Pages ───────────────────────────────────────────────────────
import { LoginPage } from "@/pages/core/LoginPage"
import { HomePage } from "@/pages/core/HomePage"
import { SettingsLayout } from "@/pages/core/settings/SettingsLayout"

// Module pages (lazy loaded)
import { lazy } from "react"
const DocumentsPage = lazy(() => import("@/pages/modules/documents"))
const DocumentDetailPage = lazy(() => import("@/pages/modules/documents/[id]"))
const PIDPage = lazy(() => import("@/pages/modules/pid"))
const DashboardsPage = lazy(() => import("@/pages/modules/dashboards"))
const AssetsPage = lazy(() => import("@/pages/modules/assets"))
const TiersPage = lazy(() => import("@/pages/modules/tiers"))

const router = createBrowserRouter([
    // Routes publiques
    { path: "/login", element: <LoginPage /> },
    { path: "/share/:token", element: <SharedObjectPage /> },

    // Routes protégées (AuthGuard vérifie le JWT)
    {
        element: <AuthGuard><AppShell /></AuthGuard>,
        children: [
            { path: "/", element: <HomePage /> },

            // Documents
            { path: "/documents", element: <DocumentsPage /> },
            { path: "/documents/new", element: <DocumentNewPage /> },
            { path: "/documents/:id", element: <DocumentDetailPage /> },

            // PID/PFD
            { path: "/pid", element: <PIDPage /> },
            { path: "/pid/:id", element: <PIDEditorPage /> },

            // Dashboard
            { path: "/dashboards", element: <DashboardsPage /> },
            { path: "/dashboards/:id", element: <DashboardViewPage /> },

            // Assets
            { path: "/assets", element: <AssetsPage /> },
            { path: "/assets/:typeSlug", element: <AssetListPage /> },
            { path: "/assets/:typeSlug/:id", element: <AssetDetailPage /> },

            // Tiers
            { path: "/tiers", element: <TiersPage /> },
            { path: "/tiers/:id", element: <TiersDetailPage /> },

            // Settings
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

## 6. Backend — src/core/config.py (Settings Pydantic)

```python
# backend/app/core/config.py

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import Literal
import secrets

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.dev",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ─── Général ──────────────────────────────────────────────────
    ENVIRONMENT: Literal["development", "staging", "production", "test"] = "development"
    DEBUG: bool = False
    SECRET_KEY: str = secrets.token_hex(32)
    API_BASE_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:5173"
    ALLOWED_HOSTS: list[str] = ["*"]
    ALLOWED_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # ─── PostgreSQL ────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://opsflux:password@localhost:5432/opsflux_dev"

    # ─── Redis ────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ─── Auth SSO ─────────────────────────────────────────────────
    OAUTH2_ISSUER_URL: str = ""
    OAUTH2_CLIENT_ID: str = "opsflux"
    OAUTH2_CLIENT_SECRET: str = ""
    OAUTH2_AUDIENCE: str = "opsflux-api"

    # ─── Storage ──────────────────────────────────────────────────
    STORAGE_BACKEND: Literal["local", "minio", "azure"] = "local"
    STORAGE_LOCAL_PATH: str = "./uploads"
    STORAGE_MAX_FILE_SIZE_MB: int = 50
    MINIO_ENDPOINT: str = ""
    MINIO_ACCESS_KEY: str = ""
    MINIO_SECRET_KEY: str = ""
    MINIO_BUCKET: str = "opsflux"

    # ─── Email ────────────────────────────────────────────────────
    SMTP_HOST: str = "mailhog"
    SMTP_PORT: int = 1025
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_ADDRESS: str = "noreply@opsflux.perenco.com"
    SMTP_FROM_NAME: str = "OpsFlux"
    SMTP_USE_TLS: bool = False

    # ─── IA ───────────────────────────────────────────────────────
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_DEFAULT_MODEL: str = "llama3"
    LITELLM_MASTER_KEY: str = "sk-dev"
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""

    # ─── Hocuspocus (collab RT) ───────────────────────────────────
    HOCUSPOCUS_SECRET: str = "dev-secret"
    HOCUSPOCUS_PORT: int = 1234

    # ─── Monitoring ───────────────────────────────────────────────
    SENTRY_DSN: str = ""
    PROMETHEUS_ENABLED: bool = False
    PROMETHEUS_PORT: int = 9090

    # ─── Map ──────────────────────────────────────────────────────
    MAP_PROVIDER: str = "leaflet_osm"
    GOOGLE_MAPS_API_KEY: str = ""
    MAPBOX_ACCESS_TOKEN: str = ""

    # ─── Dokploy ──────────────────────────────────────────────────
    DOKPLOY_API_URL: str = ""
    DOKPLOY_API_TOKEN: str = ""

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",")]
        return v

    @field_validator("ALLOWED_HOSTS", mode="before")
    @classmethod
    def parse_hosts(cls, v):
        if isinstance(v, str):
            return [h.strip() for h in v.split(",")]
        return v

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def aes_key(self) -> bytes:
        """Clé AES-256 dérivée de SECRET_KEY."""
        import hashlib
        return hashlib.sha256(self.SECRET_KEY.encode()).digest()


settings = Settings()
```

---

## 7. Backend — src/core/database.py (Async SQLAlchemy)

```python
# backend/app/core/database.py

from sqlalchemy.ext.asyncio import (
    AsyncSession, AsyncEngine,
    async_sessionmaker, create_async_engine
)
from sqlalchemy.pool import NullPool
from contextlib import asynccontextmanager
from app.core.config import settings

# ─── Engine ───────────────────────────────────────────────────────

def _create_engine() -> AsyncEngine:
    connect_args = {}

    if settings.ENVIRONMENT == "test":
        # Tests : pas de pool, transactions rollback
        return create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            poolclass=NullPool,
        )

    return create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        pool_recycle=3600,
        connect_args=connect_args,
    )

engine: AsyncEngine = _create_engine()

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def init_db():
    """Vérifier la connexion DB au démarrage."""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    print("✅ Database connected")


async def close_db():
    await engine.dispose()


@asynccontextmanager
async def get_db():
    """Context manager pour une session DB."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db_dep() -> AsyncSession:
    """FastAPI Dependency pour les routes."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

---

## 8. Backend — src/core/dependencies.py (FastAPI deps)

```python
# backend/app/api/deps.py

from fastapi import Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db_dep

async def get_db(db: AsyncSession = Depends(get_db_dep)) -> AsyncSession:
    return db

def requires_permission(permission: str):
    """
    Dependency FastAPI vérifiant qu'un user a une permission.
    Usage : @router.post("/", dependencies=[requires_permission("document.create")])
    """
    async def check(request: Request, db: AsyncSession = Depends(get_db)):
        user_id = request.state.user_id
        tenant_id = request.state.tenant_id

        has_perm = await check_user_permission(db, user_id, tenant_id, permission)
        if not has_perm:
            raise HTTPException(
                status_code=403,
                detail=f"Permission requise : {permission}",
            )
    return Depends(check)

def get_current_user(request: Request) -> dict:
    """Retourne les infos de l'utilisateur courant depuis request.state."""
    return {
        "user_id": request.state.user_id,
        "tenant_id": request.state.tenant_id,
        "bu_id": request.state.bu_id,
        "role": request.state.user_role,
    }
```
