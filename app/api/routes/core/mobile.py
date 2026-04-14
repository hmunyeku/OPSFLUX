"""
Mobile API routes — form registry, portal config, bootstrap, sync.

The mobile app is a dynamic core that renders forms described by the server.
These endpoints provide:
  - Bootstrap (single call: user profile + permissions + forms + portals + entities)
  - Form definitions (auto-generated from Pydantic schemas + enrichments)
  - Portal configurations (role-based landing pages)
  - Sync manifest (versions for offline cache invalidation)
"""

from __future__ import annotations

import logging
from uuid import UUID

import hashlib
import json

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user
from app.core.acting_context import resolve_acting_context
from app.core.database import get_db
from app.models.common import Entity, Setting, User
from app.services.mobile.form_definitions import (
    get_all_form_definitions,
    get_portal_definitions,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/mobile", tags=["mobile"])


@router.get("/bootstrap")
async def mobile_bootstrap(
    request: Request,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """
    Single bootstrap call for the mobile app on login.

    Returns everything the mobile app needs in one request:
      - User profile (id, name, email, avatar)
      - Permissions (flat list of permission codes)
      - Available entities (for entity switch)
      - Settings (user + entity level preferences)
      - Enabled modules for this entity
      - Form definitions (all server-defined forms)
      - Portal configurations (role-based landing pages)
    """

    # ── Permissions ────────────────────────────────────────────
    try:
        context = await resolve_acting_context(request, current_user, entity_id, db)
        permissions = sorted(context.permissions)
    except Exception as exc:
        logger.warning("mobile.bootstrap: could not resolve permissions: %s", exc)
        permissions = []

    # ── Entities (only non-deleted, using correct 'active' column) ──
    entities: list[dict] = []
    try:
        entities_result = await db.execute(
            select(Entity).where(Entity.active == True)  # noqa: E712
        )
        for ent in entities_result.scalars().all():
            entities.append({
                "id": str(ent.id),
                "name": ent.name,
                "code": ent.code,
            })
    except Exception as exc:
        logger.warning("mobile.bootstrap: could not load entities: %s", exc)

    # ── User settings (scope='user') ───────────────────────────
    user_settings: dict[str, str] = {}
    try:
        user_settings_result = await db.execute(
            select(Setting).where(
                Setting.scope == "user",
                Setting.scope_id == str(current_user.id),
            )
        )
        for s in user_settings_result.scalars().all():
            user_settings[s.key] = s.value
    except Exception as exc:
        logger.warning("mobile.bootstrap: could not load user settings: %s", exc)

    # ── Entity/tenant settings (non-sensitive) ─────────────────
    entity_settings: dict[str, str] = {}
    try:
        entity_settings_result = await db.execute(
            select(Setting).where(
                Setting.scope.in_(["tenant", "entity"]),
            )
        )
        for s in entity_settings_result.scalars().all():
            if not any(
                s.key.startswith(prefix)
                for prefix in ("integration.", "smtp.", "ldap.", "jwt.", "auth.password")
            ):
                entity_settings[s.key] = s.value
    except Exception as exc:
        logger.warning("mobile.bootstrap: could not load entity settings: %s", exc)

    # ── Active modules ─────────────────────────────────────────
    enabled_modules: list[dict] = []
    try:
        from app.core.module_registry import ModuleRegistry
        registry = ModuleRegistry()
        enabled_modules = [
            {"slug": m.slug, "name": m.name}
            for m in registry.get_all_modules()
        ]
    except Exception as exc:
        logger.warning("mobile.bootstrap: could not load modules: %s", exc)

    # ── Min app version + account status ───────────────────────
    min_app_version = entity_settings.get("mobile.min_app_version")

    # User.active is the flag on the model — no 'status' field exists
    is_active = getattr(current_user, "active", True)
    user_status = "active" if is_active else "deactivated"

    # ── i18n catalog for the user's language ───────────────────
    # Return the full catalog inline so the mobile has it ready offline.
    # Client will compare `hash` and only refetch if changed.
    i18n_payload: dict = {
        "language": (current_user.language or "fr").lower()[:2],
        "namespace": "mobile",
        "hash": "",
        "messages": {},
    }
    try:
        from app.models.common import I18nCatalogMeta, I18nMessage
        lang = i18n_payload["language"]
        meta = (
            await db.execute(
                select(I18nCatalogMeta)
                .where(I18nCatalogMeta.language_code == lang)
                .where(I18nCatalogMeta.namespace == "mobile")
            )
        ).scalar_one_or_none()
        if meta:
            i18n_payload["hash"] = meta.hash
        msgs = (
            await db.execute(
                select(I18nMessage.key, I18nMessage.value)
                .where(I18nMessage.language_code == lang)
                .where(I18nMessage.namespace == "mobile")
            )
        ).all()
        i18n_payload["messages"] = {k: v for k, v in msgs}
    except Exception as exc:
        logger.warning("mobile.bootstrap: could not load i18n catalog: %s", exc)

    # ── Form & portal registries (pure-python, always safe) ────
    try:
        forms = get_all_form_definitions()
    except Exception as exc:
        logger.error("mobile.bootstrap: form generation failed: %s", exc)
        forms = []

    try:
        portals = get_portal_definitions()
    except Exception as exc:
        logger.error("mobile.bootstrap: portal generation failed: %s", exc)
        portals = []

    payload = {
        "user": {
            "id": str(current_user.id),
            "email": current_user.email,
            "first_name": current_user.first_name,
            "last_name": current_user.last_name,
            "display_name": f"{current_user.first_name} {current_user.last_name}".strip() or current_user.email,
            "avatar_url": current_user.avatar_url,
            "default_entity_id": str(current_user.default_entity_id) if current_user.default_entity_id else None,
            "mfa_enabled": bool(current_user.mfa_enabled),
            "status": user_status,
            "language": current_user.language or "fr",
        },
        "permissions": permissions,
        "entities": entities,
        "current_entity_id": str(entity_id),
        "settings": {
            "user": user_settings,
            "entity": entity_settings,
        },
        "modules": enabled_modules,
        "min_app_version": min_app_version,
        "forms": forms,
        "portals": portals,
        "i18n": i18n_payload,
    }

    # ── ETag / If-None-Match ──────────────────────────────────────
    # Cold-start bootstrap is ~43 KB. Mobile cold-starts re-fetch
    # this every time today; exposing an ETag and honoring the
    # standard If-None-Match header lets the client get a 304
    # (zero-byte body) when nothing changed.
    payload_bytes = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()
    etag = '"' + hashlib.sha256(payload_bytes).hexdigest()[:16] + '"'

    inm = (request.headers.get("if-none-match") or "").strip()
    if inm and inm == etag:
        # 304 must NOT include a body.
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": "private, must-revalidate"})

    return JSONResponse(
        content=payload,
        headers={"ETag": etag, "Cache-Control": "private, must-revalidate"},
    )


@router.get("/form-definitions")
async def list_form_definitions(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Return all form definitions (for incremental refresh)."""
    return {
        "forms": get_all_form_definitions(),
    }


@router.get("/portal-config")
async def get_portal_config(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Return portal configurations (for incremental refresh)."""
    return {
        "portals": get_portal_definitions(),
    }


@router.get("/sync-manifest")
async def get_sync_manifest(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """
    Lightweight manifest of all definition hashes — the mobile app calls
    this periodically (every 15 min in background, on app foreground, on
    network reconnect) to detect what changed since the last bootstrap.

    Response shape:
      {
        "bootstrap_hash": "...",        # hash of the entire bootstrap result
        "forms": {form_id: hash},       # per-form hash for partial refresh
        "portals_hash": "...",          # hash of portals payload
        "i18n_hash": "...",             # hash of current user's i18n catalog
        "settings_hash": "...",         # user + entity settings hash
        "permissions_hash": "...",      # user permissions hash
        "lookups_hashes": {},           # per-lookup endpoint hash (future)
        "server_time": "ISO-8601"       # for clock-skew detection
      }
    """
    import hashlib
    import json
    from datetime import UTC, datetime

    def _h(payload) -> str:
        """SHA-256 of a stable JSON serialization."""
        s = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(s.encode()).hexdigest()[:16]

    # Forms — per-form hash so the mobile can do partial refresh
    forms_hashes: dict[str, str] = {}
    forms_payload: list = []
    try:
        forms_payload = get_all_form_definitions()
        for f in forms_payload:
            forms_hashes[f["id"]] = _h(f)
    except Exception:
        pass

    # Portals
    try:
        portals_payload = get_portal_definitions()
        portals_hash = _h(portals_payload)
    except Exception:
        portals_hash = ""

    # Permissions — reuse same resolver as bootstrap for consistency
    permissions: list[str] = []
    try:
        from fastapi import Request as _Request
        # We don't have a Request here; resolve_acting_context needs one.
        # Fall back to direct query on UserGroupRole → Permission.
        from app.models.common import UserGroupRole, UserGroup, UserGroupMember, RolePermission, Permission as PermModel
        result = await db.execute(
            select(PermModel.code)
            .join(RolePermission, RolePermission.permission_code == PermModel.code)
            .join(UserGroupRole, UserGroupRole.role_code == RolePermission.role_code)
            .join(UserGroup, UserGroup.id == UserGroupRole.group_id)
            .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
            .where(UserGroupMember.user_id == current_user.id, UserGroup.active == True)  # noqa: E712
            .distinct()
        )
        permissions = sorted([row[0] for row in result.all()])
    except Exception:
        pass

    # i18n catalog hash for user's language
    user_lang = (current_user.language or "fr").lower()[:2]
    i18n_hash = ""
    try:
        from app.models.common import I18nCatalogMeta
        meta = (
            await db.execute(
                select(I18nCatalogMeta)
                .where(I18nCatalogMeta.language_code == user_lang)
                .where(I18nCatalogMeta.namespace == "mobile")
            )
        ).scalar_one_or_none()
        if meta:
            i18n_hash = meta.hash[:16]
    except Exception:
        pass

    # Settings
    settings_payload: dict = {}
    try:
        user_settings = (
            await db.execute(
                select(Setting).where(
                    Setting.scope == "user",
                    Setting.scope_id == str(current_user.id),
                )
            )
        ).scalars().all()
        entity_settings = (
            await db.execute(
                select(Setting).where(Setting.scope.in_(["tenant", "entity"]))
            )
        ).scalars().all()
        settings_payload = {
            "user": {s.key: s.value for s in user_settings},
            "entity": {
                s.key: s.value
                for s in entity_settings
                if not any(
                    s.key.startswith(p)
                    for p in ("integration.", "smtp.", "ldap.", "jwt.", "auth.password")
                )
            },
        }
    except Exception:
        pass

    # Compute the all-encompassing bootstrap_hash so the mobile can fast-path
    # "nothing changed" without comparing each individual hash.
    aggregate = {
        "forms": forms_hashes,
        "portals": portals_hash,
        "permissions": permissions,
        "i18n": i18n_hash,
        "settings": settings_payload,
    }
    bootstrap_hash = _h(aggregate)

    return {
        "bootstrap_hash": bootstrap_hash,
        "forms": forms_hashes,
        "portals_hash": portals_hash,
        "i18n_hash": i18n_hash,
        "settings_hash": _h(settings_payload),
        "permissions_hash": _h(sorted(permissions)),
        "lookups_hashes": {},  # reserved for future per-endpoint hashes
        "server_time": datetime.now(UTC).isoformat(),
    }
