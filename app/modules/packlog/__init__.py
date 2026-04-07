"""PackLog module manifest — independent cargo and package operations module.

PackLog now owns its API namespace and backend cargo handlers. Legacy
``travelwiz.cargo.*`` permissions are still accepted as compatibility aliases
until RBAC migration is completed.
"""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="packlog",
    name="PackLog",
    version="1.0.0",
    permissions=[
        "packlog.cargo.read",
        "packlog.cargo.read_all",
        "packlog.cargo.create",
        "packlog.cargo.update",
        "packlog.cargo.receive",
    ],
    roles=[],
    routes_prefix="/api/v1/packlog",
)
