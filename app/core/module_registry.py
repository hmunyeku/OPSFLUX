"""ModuleRegistry — idempotent module registration at startup."""

import logging
from dataclasses import dataclass, field
from typing import Any

from fastapi import APIRouter

logger = logging.getLogger(__name__)


@dataclass
class ModuleManifest:
    slug: str
    name: str
    version: str
    depends_on: list[str] = field(default_factory=list)
    enriches: list[str] = field(default_factory=list)
    roles: list[dict[str, Any]] = field(default_factory=list)
    permissions: list[str] = field(default_factory=list)
    event_subscriptions: list[str] = field(default_factory=list)
    event_publications: list[str] = field(default_factory=list)
    routes_prefix: str = ""
    router: APIRouter | None = None
    settings_definitions: list[dict[str, Any]] = field(default_factory=list)
    widgets: list[dict[str, Any]] = field(default_factory=list)
    mcp_tools: list[dict[str, Any]] = field(default_factory=list)


class ModuleRegistry:
    """Singleton registry for all active modules."""

    _instance: "ModuleRegistry | None" = None
    _modules: dict[str, ModuleManifest]

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._modules = {}
        return cls._instance

    async def register(self, manifest: ModuleManifest) -> None:
        """Register a module (idempotent upsert)."""
        self._modules[manifest.slug] = manifest
        logger.info("ModuleRegistry: registered module '%s' v%s", manifest.slug, manifest.version)

    def is_active(self, slug: str) -> bool:
        return slug in self._modules

    def get_module(self, slug: str) -> ModuleManifest | None:
        return self._modules.get(slug)

    def get_all_modules(self) -> list[ModuleManifest]:
        return list(self._modules.values())

    def get_all_permissions(self) -> list[str]:
        perms = []
        for module in self._modules.values():
            perms.extend(module.permissions)
        return perms

    def get_all_widgets(self) -> list[dict]:
        widgets = []
        for module in self._modules.values():
            widgets.extend(module.widgets)
        return widgets
