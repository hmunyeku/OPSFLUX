"""PaxLog — Formal signalements (incidents, HSE violations, bans).

Extracted from the monolithic paxlog module. Routes register onto the shared
`router` instance defined in `paxlog/__init__.py`.

`/signalements` is the richer surface on top of the same `pax_incidents` table
that backs `/incidents` (paxlog/incidents.py): it adds the validate / lift /
resolve workflow plus ban-aware PAX re-activation when a temp_ban or
permanent_ban is resolved.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from uuid import UUID

from fastapi import Body, Depends, HTTPException, status
from sqlalchemy import func, or_, select, text
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
from app.models.common import User
from app.models.paxlog import PaxIncident
from app.schemas.paxlog import PaxIncidentRead

from . import _promote_waitlisted_ads_pax_if_capacity_available, router

logger = logging.getLogger(__name__)


@router.get("/signalements")
async def list_signalements(
    pax_id: UUID | None = None,
    asset_id: UUID | None = None,
    severity: str | None = None,
    status_filter: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.read"),
    db: AsyncSession = Depends(get_db),
):
    """List formal signalements (incidents, HSE violations, bans)."""
    query = select(PaxIncident).where(PaxIncident.entity_id == entity_id)

    if pax_id:
        query = query.where(or_(PaxIncident.user_id == pax_id, PaxIncident.contact_id == pax_id))
    if asset_id:
        query = query.where(PaxIncident.asset_id == asset_id)
    if severity:
        query = query.where(PaxIncident.severity == severity)
    if status_filter == "resolved":
        query = query.where(PaxIncident.resolved_at != None)  # noqa: E711
    elif status_filter == "active":
        query = query.where(PaxIncident.resolved_at == None)  # noqa: E711

    query = query.order_by(PaxIncident.created_at.desc())
    return await paginate(db, query, pagination)


@router.post("/signalements", response_model=PaxIncidentRead, status_code=201)
async def create_signalement(
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    company_id: UUID | None = None,
    asset_id: UUID | None = None,
    severity: str = "info",
    description: str = "",
    incident_date: date | None = None,
    ban_start_date: date | None = None,
    ban_end_date: date | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a formal signalement (incident, HSE violation, sanction).

    Ban-like severities can suspend the PAX and immediately impact related AdS.
    """
    from app.services.modules.paxlog_service import create_signalement as svc_create

    if not description:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Description is required",
        )

    result = await svc_create(
        db,
        entity_id=entity_id,
        data={
            "user_id": user_id,
            "contact_id": contact_id,
            "company_id": company_id,
            "asset_id": asset_id,
            "severity": severity,
            "description": description,
            "incident_date": incident_date or date.today(),
            "ban_start_date": ban_start_date,
            "ban_end_date": ban_end_date,
            "recorded_by": current_user.id,
        },
    )

    await record_audit(
        db,
        action="paxlog.signalement.create",
        resource_type="pax_incident",
        resource_id=str(result["id"]),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "severity": severity,
            "user_id": str(user_id) if user_id else None,
            "contact_id": str(contact_id) if contact_id else None,
        },
    )

    # Spec §3.10: when a signalement rejects ADS, freed capacity should
    # trigger waitlist promotion for other waitlisted pax.
    rejected_ads_for_promo: list = result.get("_rejected_ads", [])
    if rejected_ads_for_promo:
        seen_keys: set[UUID] = set()
        for rej_ads in rejected_ads_for_promo:
            key = rej_ads.planner_activity_id or rej_ads.site_entry_asset_id
            if key and key not in seen_keys:
                seen_keys.add(key)
                try:
                    await _promote_waitlisted_ads_pax_if_capacity_available(
                        db,
                        entity_id=entity_id,
                        ads=rej_ads,
                        actor_id=current_user.id,
                    )
                except Exception:
                    logger.warning(
                        "Failed to promote waitlisted pax after signalement for ADS %s",
                        rej_ads.id, exc_info=True,
                    )

    await db.commit()

    incident_result = await db.execute(
        select(PaxIncident).where(PaxIncident.id == result["id"])
    )
    return incident_result.scalar_one()


@router.post("/signalements/{signalement_id}/resolve", response_model=PaxIncidentRead)
async def resolve_signalement(
    signalement_id: UUID,
    resolution_notes: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.resolve"),
    db: AsyncSession = Depends(get_db),
):
    """Resolve a formal signalement with optional notes."""
    result = await db.execute(
        select(PaxIncident).where(
            PaxIncident.id == signalement_id,
            PaxIncident.entity_id == entity_id,
        )
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise StructuredHTTPException(
            404,
            code="SIGNALEMENT_NOT_FOUND",
            message="Signalement not found",
        )
    if incident.resolved_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce signalement est déjà résolu.",
        )

    incident.resolved_at = func.now()
    incident.resolved_by = current_user.id
    incident.resolution_notes = resolution_notes

    # If PAX was suspended due to a ban, log eligibility for re-activation
    pax_filter = None
    if incident.severity in ("temp_ban", "permanent_ban"):
        if incident.user_id:
            pax_filter = PaxIncident.user_id == incident.user_id
        elif incident.contact_id:
            pax_filter = PaxIncident.contact_id == incident.contact_id

    if pax_filter is not None:
        other_bans = await db.execute(
            select(func.count(PaxIncident.id)).where(
                PaxIncident.entity_id == entity_id,
                pax_filter,
                PaxIncident.id != signalement_id,
                PaxIncident.severity.in_(["temp_ban", "permanent_ban"]),
                PaxIncident.resolved_at == None,  # noqa: E711
            )
        )
        if (other_bans.scalar() or 0) == 0:
            pax_id_str = str(incident.user_id or incident.contact_id)
            logger.info("PAX %s eligible for re-activation after signalement %s resolved", pax_id_str, signalement_id)

    await db.commit()
    await db.refresh(incident)

    await record_audit(
        db,
        action="paxlog.signalement.resolve",
        resource_type="pax_incident",
        resource_id=str(signalement_id),
        user_id=current_user.id,
        entity_id=entity_id,
    )
    await db.commit()

    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="paxlog.signalement.resolved",
        payload={
            "incident_id": str(signalement_id),
            "entity_id": str(entity_id),
            "user_id": str(incident.user_id) if incident.user_id else None,
            "contact_id": str(incident.contact_id) if incident.contact_id else None,
            "severity": incident.severity,
            "resolved_by": str(current_user.id),
        },
    ))

    return incident


@router.post("/signalements/{signalement_id}/validate", response_model=PaxIncidentRead)
async def validate_signalement(
    signalement_id: UUID,
    decision: str | None = None,
    decision_duration_days: int | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.resolve"),
    db: AsyncSession = Depends(get_db),
):
    """Validate a signalement — confirms the decision (ban, warning, etc.)."""
    result = await db.execute(
        select(PaxIncident).where(
            PaxIncident.id == signalement_id,
            PaxIncident.entity_id == entity_id,
        )
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise StructuredHTTPException(
            404,
            code="SIGNALEMENT_NOT_FOUND",
            message="Signalement not found",
        )

    if decision:
        incident.decision = decision
    if decision_duration_days:
        incident.decision_duration_days = decision_duration_days
        incident.decision_end_date = date.today() + timedelta(days=decision_duration_days)

    await db.commit()
    await db.refresh(incident)
    return incident


@router.post("/signalements/{signalement_id}/lift", response_model=PaxIncidentRead)
async def lift_signalement(
    signalement_id: UUID,
    lift_reason: str = Body(..., min_length=1, embed=True),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.resolve"),
    db: AsyncSession = Depends(get_db),
):
    """Lift a signalement — removes the ban/sanction with justification."""
    result = await db.execute(
        select(PaxIncident).where(
            PaxIncident.id == signalement_id,
            PaxIncident.entity_id == entity_id,
        )
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise StructuredHTTPException(
            404,
            code="SIGNALEMENT_NOT_FOUND",
            message="Signalement not found",
        )

    incident.resolved_at = func.now()
    incident.resolved_by = current_user.id
    incident.resolution_notes = f"[LEVEE] {lift_reason}"

    # Re-activate PAX if no other active bans
    if incident.severity in ("temp_ban", "permanent_ban"):
        pax_col = "user_id" if incident.user_id else "contact_id"
        pax_val = str(incident.user_id or incident.contact_id)
        if pax_val:
            other_bans = await db.execute(
                text(
                    f"SELECT COUNT(*) FROM pax_incidents "
                    f"WHERE entity_id = :eid AND {pax_col} = :pax_fk "
                    f"AND id != :sig_id "
                    f"AND severity IN ('temp_ban', 'permanent_ban') "
                    f"AND resolved_at IS NULL"
                ),
                {"eid": str(entity_id), "pax_fk": pax_val, "sig_id": str(signalement_id)},
            )
            if (other_bans.scalar() or 0) == 0:
                table = "users" if incident.user_id else "tier_contacts"
                await db.execute(
                    text(f"UPDATE {table} SET pax_status = 'active' WHERE id = :pid"),
                    {"pid": pax_val},
                )

    await db.commit()
    await db.refresh(incident)

    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="paxlog.signalement.lifted",
        payload={
            "incident_id": str(signalement_id),
            "entity_id": str(entity_id),
            "lifted_by": str(current_user.id),
            "lift_reason": lift_reason,
        },
    ))

    return incident
