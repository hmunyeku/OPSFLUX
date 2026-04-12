"""
Mobile API routes — form registry, portal config, sync.

The mobile app is a dynamic core that renders forms described by the server.
These endpoints provide:
  - Form definitions (auto-generated from Pydantic schemas + enrichments)
  - Portal configurations (role-based landing pages)
  - Sync manifest (versions of all definitions for offline cache invalidation)
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user
from app.core.database import get_db
from app.models.common import User
from app.services.mobile.form_definitions import (
    get_all_form_definitions,
    get_portal_definitions,
)

router = APIRouter(prefix="/api/v1/mobile", tags=["mobile"])


@router.get("/form-definitions")
async def list_form_definitions(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """
    Return all form definitions available to the current user.

    The mobile app caches these locally and uses the `version` hash
    to detect when a form has changed (schema or enrichment update).
    Filtering by user permissions happens client-side using the
    `permission` field on each form — the list is not security-sensitive
    since the submit endpoint enforces permissions anyway.
    """
    return {
        "forms": get_all_form_definitions(),
    }


@router.get("/portal-config")
async def get_portal_config(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """
    Return portal configurations for the mobile app.

    Each portal is a role-based landing page. The mobile app
    selects the best portal based on the user's permissions/roles.
    """
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

    The mobile app calls this on startup (or when coming back online)
    to check if any cached form definitions are stale. Only definitions
    whose version hash has changed need to be re-fetched.
    """
    forms = get_all_form_definitions()
    portals = get_portal_definitions()

    return {
        "forms": {f["id"]: f["version"] for f in forms},
        "portals": {p["id"]: p["id"] for p in portals},
    }
