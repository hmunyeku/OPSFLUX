"""Module lifecycle service — entity-scoped module activation and runtime filtering."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.module_registry import ModuleRegistry
from app.models.common import Entity
from app.models.dashboard import Dashboard, DashboardTab, UserDashboardTab
from app.services.core.settings_service import get_scoped_setting_row, upsert_scoped_setting

MODULE_DISABLED_SETTING_KEY = "core.modules.disabled"
PROTECTED_MODULES = {"dashboard", "workflow", "users"}
# `users` is declared as widget source_module in the seed catalog
# but it is a CORE feature, not a separately-registered module.
# Without it in the protected list, `filter_widgets_for_entity` →
# `is_module_enabled` returns False (ModuleRegistry has no entry)
# and the Comptes dashboard widgets get silently stripped — the
# "Vue d'ensemble" tab ends up empty even though the tab + 6
# widgets exist in the DB.
MODULE_ALIASES = {
    "asset-registry": "asset_registry",
    "pid-pfd": "pid_pfd",
    "report-editor": "papyrus",
    "report_editor": "papyrus",
}


def normalize_module_slug(slug: str | None) -> str | None:
    if not slug:
        return slug
    return MODULE_ALIASES.get(slug, slug)


async def _load_entity_disabled_modules(db: AsyncSession, entity_id: UUID) -> set[str]:
    row = await get_scoped_setting_row(
        db,
        key=MODULE_DISABLED_SETTING_KEY,
        scope="entity",
        scope_id=str(entity_id),
        include_legacy_fallback=True,
    )
    if row is None or not isinstance(row.value, dict):
        return set()
    payload = row.value.get("v", row.value)
    if not isinstance(payload, list):
        return set()
    return {normalize_module_slug(str(item)) or str(item) for item in payload if isinstance(item, str)}


async def is_module_enabled(db: AsyncSession, entity_id: UUID, slug: str | None) -> bool:
    normalized = normalize_module_slug(slug)
    if not normalized or normalized == "core":
        return True
    if normalized in PROTECTED_MODULES:
        return True
    if ModuleRegistry().get_module(normalized) is None:
        return False
    disabled = await _load_entity_disabled_modules(db, entity_id)
    return normalized not in disabled


def get_widget_source_module(widget_id: str) -> str | None:
    from app.services.modules.dashboard_service import WIDGET_CATALOG, _init_predefined_widgets

    _init_predefined_widgets()
    entry = WIDGET_CATALOG.get(widget_id)
    return normalize_module_slug(entry.source_module) if entry else None


def get_widget_id_from_payload(widget: Any) -> str | None:
    if not isinstance(widget, dict):
        return None
    config = widget.get("config")
    if isinstance(config, dict):
        widget_id = config.get("widget_id")
        if widget_id:
            return str(widget_id)
    widget_id = widget.get("widget_id")
    if widget_id:
        return str(widget_id)
    return None


async def filter_widgets_for_entity(
    db: AsyncSession,
    entity_id: UUID,
    widgets: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    if not widgets:
        return []
    filtered: list[dict[str, Any]] = []
    for widget in widgets:
        if not isinstance(widget, dict):
            continue
        widget_id = get_widget_id_from_payload(widget)
        source_module = get_widget_source_module(str(widget_id)) if widget_id else None
        if source_module and not await is_module_enabled(db, entity_id, source_module):
            continue
        filtered.append(widget)
    return filtered


async def _cleanup_module_widgets(
    db: AsyncSession,
    *,
    entity_id: UUID,
    module_slug: str,
) -> None:
    """Remove widgets belonging to a disabled module from stored dashboards."""
    tabs_result = await db.execute(
        select(DashboardTab).where(DashboardTab.entity_id == entity_id)
    )
    for tab in tabs_result.scalars().all():
        filtered = [
            widget for widget in (tab.widgets or [])
            if get_widget_source_module(get_widget_id_from_payload(widget) or "") != module_slug
        ]
        if filtered != (tab.widgets or []):
            tab.widgets = filtered

    user_tabs_result = await db.execute(
        select(UserDashboardTab).where(UserDashboardTab.entity_id == entity_id)
    )
    for tab in user_tabs_result.scalars().all():
        filtered = [
            widget for widget in (tab.widgets or [])
            if get_widget_source_module(get_widget_id_from_payload(widget) or "") != module_slug
        ]
        if filtered != (tab.widgets or []):
            tab.widgets = filtered

    dashboards_result = await db.execute(
        text("SELECT id, widgets FROM dashboards WHERE entity_id = :entity_id"),
        {"entity_id": entity_id},
    )
    for row in dashboards_result.mappings().all():
        widgets = row.get("widgets") if isinstance(row, dict) else row["widgets"]
        filtered = [
            widget for widget in (widgets or [])
            if get_widget_source_module(get_widget_id_from_payload(widget) or "") != module_slug
        ]
        if filtered != (widgets or []):
            await db.execute(
                text("UPDATE dashboards SET widgets = :widgets WHERE id = :dashboard_id"),
                {"widgets": filtered, "dashboard_id": row["id"]},
            )


async def _ensure_dependents_allow_disable(
    db: AsyncSession,
    *,
    entity_id: UUID,
    module_slug: str,
) -> None:
    registry = ModuleRegistry()
    disabled = await _load_entity_disabled_modules(db, entity_id)
    active_dependents: list[str] = []
    for manifest in registry.get_all_modules():
        dependent_slug = normalize_module_slug(manifest.slug) or manifest.slug
        if dependent_slug == module_slug:
            continue
        if dependent_slug in disabled:
            continue
        deps = {normalize_module_slug(dep) or dep for dep in (manifest.depends_on or [])}
        if module_slug in deps:
            active_dependents.append(dependent_slug)
    if active_dependents:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot disable module while dependents are still enabled: "
                + ", ".join(sorted(active_dependents))
            ),
        )


async def _ensure_dependencies_allow_enable(
    db: AsyncSession,
    *,
    entity_id: UUID,
    module_slug: str,
) -> None:
    manifest = ModuleRegistry().get_module(module_slug)
    if manifest is None:
        raise HTTPException(status_code=404, detail="Module not found")
    missing_dependencies = [
        dep_slug
        for dep_slug in {normalize_module_slug(dep) or dep for dep in (manifest.depends_on or [])}
        if dep_slug not in PROTECTED_MODULES and not await is_module_enabled(db, entity_id, dep_slug)
    ]
    if missing_dependencies:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot enable module while dependencies are disabled: "
                + ", ".join(sorted(missing_dependencies))
            ),
        )


async def _build_module_state(
    db: AsyncSession,
    *,
    entity_id: UUID,
    manifest: Any,
    disabled: set[str],
) -> dict[str, Any]:
    slug = normalize_module_slug(manifest.slug) or manifest.slug
    protected = slug in PROTECTED_MODULES
    depends_on = [normalize_module_slug(dep) or dep for dep in (manifest.depends_on or [])]
    missing_dependencies = [
        dep_slug
        for dep_slug in depends_on
        if dep_slug not in PROTECTED_MODULES and dep_slug in disabled
    ]
    active_dependents: list[str] = []
    registry = ModuleRegistry()
    for dependent_manifest in registry.get_all_modules():
        dependent_slug = normalize_module_slug(dependent_manifest.slug) or dependent_manifest.slug
        if dependent_slug == slug or dependent_slug in disabled:
            continue
        dependent_deps = {
            normalize_module_slug(dep) or dep for dep in (dependent_manifest.depends_on or [])
        }
        if slug in dependent_deps:
            active_dependents.append(dependent_slug)

    enabled = protected or slug not in disabled
    return {
        "slug": slug,
        "name": manifest.name,
        "version": manifest.version,
        "depends_on": depends_on,
        "enabled": enabled,
        "is_protected": protected,
        "missing_dependencies": sorted(set(missing_dependencies)),
        "active_dependents": sorted(set(active_dependents)),
        "can_enable": enabled or not missing_dependencies,
        "can_disable": not protected and not active_dependents,
    }


async def list_modules_for_entity(db: AsyncSession, entity_id: UUID) -> list[dict[str, Any]]:
    entity = await db.scalar(select(Entity).where(Entity.id == entity_id))
    if entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")

    registry = ModuleRegistry()
    disabled = await _load_entity_disabled_modules(db, entity_id)
    modules: list[dict[str, Any]] = []
    for manifest in sorted(registry.get_all_modules(), key=lambda item: item.name.lower()):
        modules.append(
            await _build_module_state(
                db,
                entity_id=entity_id,
                manifest=manifest,
                disabled=disabled,
            )
        )
    return modules


async def set_module_enabled_for_entity(
    db: AsyncSession,
    *,
    entity_id: UUID,
    slug: str,
    enabled: bool,
) -> dict[str, Any]:
    normalized = normalize_module_slug(slug)
    if not normalized:
        raise HTTPException(status_code=400, detail="Module slug is required")
    if ModuleRegistry().get_module(normalized) is None:
        raise HTTPException(status_code=404, detail="Module not found")
    if normalized in PROTECTED_MODULES and not enabled:
        raise HTTPException(status_code=400, detail="This module cannot be disabled")

    disabled = await _load_entity_disabled_modules(db, entity_id)
    if enabled:
        await _ensure_dependencies_allow_enable(db, entity_id=entity_id, module_slug=normalized)
        disabled.discard(normalized)
        await db.execute(
            update(DashboardTab)
            .where(DashboardTab.entity_id == entity_id, DashboardTab.target_module == normalized)
            .values(is_active=True)
        )
    else:
        await _ensure_dependents_allow_disable(db, entity_id=entity_id, module_slug=normalized)
        disabled.add(normalized)
        await db.execute(
            update(DashboardTab)
            .where(DashboardTab.entity_id == entity_id, DashboardTab.target_module == normalized)
            .values(is_active=False)
        )
        await _cleanup_module_widgets(db, entity_id=entity_id, module_slug=normalized)
    await db.flush()
    await upsert_scoped_setting(
        db,
        key=MODULE_DISABLED_SETTING_KEY,
        value={"v": sorted(disabled)},
        scope="entity",
        scope_id=str(entity_id),
    )
    modules = await list_modules_for_entity(db, entity_id)
    for module in modules:
        if module["slug"] == normalized:
            return module
    raise HTTPException(status_code=500, detail="Module state update failed")
