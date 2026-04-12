"""Asset Registry module manifest."""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="asset_registry",
    name="Asset Registry",
    version="1.0.0",
    permissions=[
        "asset.read",
        "asset.create",
        "asset.update",
        "asset.delete",
        "asset.capacity.manage",
        "asset.hse.manage",
        "asset.import",
        "asset.export",
    ],
    roles=[
        {
            "code": "ASSET_ADMIN",
            "name": "Asset Administrator",
            "permissions": [
                "asset.read",
                "asset.create",
                "asset.update",
                "asset.delete",
                "asset.capacity.manage",
                "asset.hse.manage",
                "asset.import",
                "asset.export",
            ],
        },
    ],
    routes_prefix="/api/v1/asset-registry",
    widgets=[
        {"slug": "asset_map", "name": "Asset Map", "component": "AssetMapWidget"},
        {"slug": "asset_capacity", "name": "Site Capacity", "component": "AssetCapacityWidget"},
    ],
)
