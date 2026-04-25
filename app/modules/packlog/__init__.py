"""PackLog module manifest — independent cargo and package operations module."""

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
