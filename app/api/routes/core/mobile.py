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

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user
from app.core.acting_context import resolve_acting_context
from app.core.database import get_db
from app.models.common import Entity, User
from app.services.mobile.form_definitions import (
    get_all_form_definitions,
    get_portal_definitions,
)

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
      - Form definitions (all server-defined forms)
      - Portal configurations (role-based landing pages)

    This avoids 5 separate API calls on startup and works
    well with offline caching (single cache key to invalidate).
    """
    # Resolve permissions via acting context
    context = await resolve_acting_context(request, current_user, entity_id, db)
    permissions = sorted(context.permissions)

    # Get all entities the user has access to
    entities = []
    if current_user.default_entity_id:
        result = await db.execute(
            select(Entity).where(Entity.id.in_(
                select(Entity.id).where(Entity.archived == False)  # noqa: E712
            ))
        )
        for ent in result.scalars().all():
            entities.append({
                "id": str(ent.id),
                "name": ent.name,
                "code": getattr(ent, "code", None),
            })

    return {
        "user": {
            "id": str(current_user.id),
            "email": current_user.email,
            "first_name": current_user.first_name,
            "last_name": current_user.last_name,
            "display_name": f"{current_user.first_name} {current_user.last_name}",
            "avatar_url": current_user.avatar_url,
            "default_entity_id": str(current_user.default_entity_id) if current_user.default_entity_id else None,
        },
        "permissions": permissions,
        "entities": entities,
        "current_entity_id": str(entity_id),
        "forms": get_all_form_definitions(),
        "portals": get_portal_definitions(),
    }


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
    Lightweight manifest of all definition versions.

    The mobile app calls this periodically (or on reconnect) to check
    if cached form/portal definitions are stale.
    """
    forms = get_all_form_definitions()
    portals = get_portal_definitions()

    return {
        "forms": {f["id"]: f["version"] for f in forms},
        "portals": {p["id"]: p["id"] for p in portals},
    }
