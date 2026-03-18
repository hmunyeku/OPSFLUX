"""Dashboard module manifest."""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="dashboard",
    name="Dashboard",
    version="1.0.0",
    permissions=[
        "dashboard.read",
        "dashboard.customize",
        "dashboard.admin",
    ],
    routes_prefix="/api/v1/dashboard",
)
