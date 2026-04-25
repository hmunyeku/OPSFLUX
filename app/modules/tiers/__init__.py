"""Tiers module manifest."""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="tiers",
    name="Tiers",
    version="1.0.0",
    permissions=[
        "tier.read",
        "tier.create",
        "tier.update",
        "tier.delete",
        "tier.contact.manage",
        "tier.portal.manage",
        "tier.import",
        "tier.export",
    ],
    roles=[
        {"code": "TIER_ADMIN", "name": "Tiers Administrator"},
    ],
    routes_prefix="/api/v1/tiers",
)
