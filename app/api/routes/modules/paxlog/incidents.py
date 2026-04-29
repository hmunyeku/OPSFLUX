"""PaxLog — PAX incidents (signalements with severity, ban management).

Extracted from the monolithic paxlog module. Routes register onto the shared
`router` instance defined in `paxlog/__init__.py`.

The incident creation flow is delegated to `paxlog_service.create_signalement`
which owns the business logic (auto-reject linked AdS on permanent_ban, etc.).
This module wraps it with the route concerns: pagination, audit logging,
waitlist promotion when AdS capacity is freed.
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_entity,
    get_current_user,
    require_permission,
)
from app.core.audit import record_audit
from app.core.database import get_db
from app.core.errors import StructuredHTTPException
from app.core.pagination import PaginationParams, paginate
from app.models.common import Tier, TierContact, User
from app.models.paxlog import PaxGroup, PaxIncident
from app.schemas.common import PaginatedResponse
from app.schemas.paxlog import (
    PaxIncidentCreate,
    PaxIncidentRead,
    PaxIncidentResolve,
)

from . import (
    _incident_row_to_read,
    _promote_waitlisted_ads_pax_if_capacity_available,
    router,
)

logger = logging.getLogger(__name__)


@router.get("/incidents", response_model=PaginatedResponse[PaxIncidentRead])
async def list_incidents(
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    active_only: bool = True,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.read"),
    db: AsyncSession = Depends(get_db),
):
    """List PAX incidents."""
    query = select(PaxIncident).where(PaxIncident.entity_id == entity_id)
    if user_id:
        query = query.where(PaxIncident.user_id == user_id)
    if contact_id:
        query = query.where(PaxIncident.contact_id == contact_id)
    if active_only:
        query = query.where(PaxIncident.resolved_at == None)  # noqa: E711
    query = query.order_by(PaxIncident.created_at.desc())
    return await paginate(db, query, pagination)


@router.post("/incidents", response_model=PaxIncidentRead, status_code=201)
async def create_incident(
    body: PaxIncidentCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.create"),
    db: AsyncSession = Depends(get_db),
):
    """Record a PAX incident."""
    from app.services.modules.paxlog_service import create_signalement as svc_create

    result = await svc_create(
        db,
        entity_id=entity_id,
        data={
            "user_id": body.user_id,
            "contact_id": body.contact_id,
            "company_id": body.company_id,
            "pax_group_id": body.pax_group_id,
            "asset_id": body.asset_id,
            "severity": body.severity,
            "description": body.description,
            "incident_date": body.incident_date,
            "ban_start_date": body.ban_start_date,
            "ban_end_date": body.ban_end_date,
            "category": body.category,
            "decision": body.decision,
            "decision_duration_days": body.decision_duration_days,
            "recorded_by": current_user.id,
        },
    )

    # Commit polymorphic children staged during the Create panel
    # (evidence photos, reports, witness statements…).
    if body.staging_ref:
        from app.services.core.staging_service import commit_staging_children
        await commit_staging_children(
            db,
            staging_owner_type="pax_incident_staging",
            final_owner_type="pax_incident",
            staging_ref=body.staging_ref,
            final_owner_id=result["id"],
            uploader_id=current_user.id,
            entity_id=entity_id,
        )

    await record_audit(
        db,
        action="paxlog.incident.create",
        resource_type="pax_incident",
        resource_id=str(result["id"]),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "severity": body.severity,
            "user_id": str(body.user_id) if body.user_id else None,
            "contact_id": str(body.contact_id) if body.contact_id else None,
            "company_id": str(body.company_id) if body.company_id else None,
            "pax_group_id": str(body.pax_group_id) if body.pax_group_id else None,
        },
    )

    # Spec §3.10: when a signalement rejects ADS, freed capacity should
    # trigger waitlist promotion for other waitlisted pax on the same
    # planner activity / site.
    rejected_ads_for_promotion: list = result.get("_rejected_ads", [])
    if rejected_ads_for_promotion:
        seen_keys: set[UUID] = set()
        for rejected_ads in rejected_ads_for_promotion:
            key = rejected_ads.planner_activity_id or rejected_ads.site_entry_asset_id
            if key and key not in seen_keys:
                seen_keys.add(key)
                try:
                    await _promote_waitlisted_ads_pax_if_capacity_available(
                        db,
                        entity_id=entity_id,
                        ads=rejected_ads,
                        actor_id=current_user.id,
                    )
                except Exception:
                    logger.warning(
                        "Failed to promote waitlisted pax after signalement rejection of ADS %s",
                        rejected_ads.id, exc_info=True,
                    )

    await db.commit()

    incident_result = await db.execute(
        select(
            PaxIncident,
            User.first_name.label("user_first_name"),
            User.last_name.label("user_last_name"),
            TierContact.first_name.label("contact_first_name"),
            TierContact.last_name.label("contact_last_name"),
            Tier.name.label("company_name"),
            PaxGroup.name.label("group_name"),
            literal(None).label("asset_name"),
        )
        .outerjoin(User, User.id == PaxIncident.user_id)
        .outerjoin(TierContact, TierContact.id == PaxIncident.contact_id)
        .outerjoin(Tier, Tier.id == PaxIncident.company_id)
        .outerjoin(PaxGroup, PaxGroup.id == PaxIncident.pax_group_id)
        .where(PaxIncident.id == result["id"], PaxIncident.entity_id == entity_id)
    )
    row = incident_result.first()
    if not row:
        raise StructuredHTTPException(
            404,
            code="INCIDENT_NOT_FOUND",
            message="Incident not found",
        )

    logger.info("PAX incident created (%s) by %s", body.severity, current_user.id)
    return _incident_row_to_read(row)


@router.patch("/incidents/{incident_id}/resolve", response_model=PaxIncidentRead)
async def resolve_incident(
    incident_id: UUID,
    body: PaxIncidentResolve,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.resolve"),
    db: AsyncSession = Depends(get_db),
):
    """Resolve an active PAX incident."""
    result = await db.execute(
        select(PaxIncident).where(
            PaxIncident.id == incident_id,
            PaxIncident.entity_id == entity_id,
        )
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise StructuredHTTPException(
            404,
            code="INCIDENT_NOT_FOUND",
            message="Incident not found",
        )
    if incident.resolved_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cet incident est déjà résolu.",
        )

    incident.resolved_at = func.now()
    incident.resolved_by = current_user.id
    incident.resolution_notes = body.resolution_notes
    await db.commit()
    await db.refresh(incident)
    return incident
