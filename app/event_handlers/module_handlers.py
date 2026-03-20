"""Inter-module event handlers — Planner, PaxLog, TravelWiz integration.

All notifications use Core services:
- In-app: core.notifications.send_in_app()
- Email:  core.email_templates.render_and_send_email() — configurable via Email Manager
"""

import logging
from datetime import date, datetime, timezone, UTC
from uuid import UUID

from app.core.database import async_session_factory
from app.core.events import EventBus, OpsFluxEvent

logger = logging.getLogger(__name__)


# ── Helper: resolve user email from user_id ──────────────────────────────

async def _get_user_email_and_name(user_id: UUID, db) -> tuple[str | None, str]:
    """Get primary email and display name for a user."""
    from sqlalchemy import text
    result = await db.execute(
        text(
            "SELECT u.email, COALESCE(u.first_name || ' ' || u.last_name, u.email) "
            "FROM users u WHERE u.id = :uid"
        ),
        {"uid": user_id},
    )
    row = result.first()
    return (row[0], row[1]) if row else (None, "")


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_planner_activity_validated
# When a planner activity is validated, notify related modules
# ═══════════════════════════════════════════════════════════════════════════

async def on_planner_activity_validated(event: OpsFluxEvent) -> None:
    """When activity is validated — notify project manager via in-app + email."""
    payload = event.payload
    activity_id = payload.get("activity_id")
    entity_id = payload.get("entity_id")
    asset_id = payload.get("asset_id")
    title = payload.get("title", "")
    reference = payload.get("reference", "")
    validated_by = payload.get("validated_by")
    created_by = payload.get("created_by")

    try:
        # Notify the activity creator that it was validated
        if entity_id and created_by and str(created_by) != str(validated_by):
            from app.core.notifications import send_in_app
            from app.core.email_templates import render_and_send_email

            eid = UUID(str(entity_id))
            uid = UUID(str(created_by))

            async with async_session_factory() as db:
                # In-app notification
                await send_in_app(
                    db,
                    user_id=uid,
                    entity_id=eid,
                    title="Activité validée",
                    body=f"L'activité '{title}' a été validée.",
                    category="planner",
                    link=f"/planner/activities/{activity_id}",
                )

                # Email via configurable template
                email, name = await _get_user_email_and_name(uid, db)
                if email:
                    await render_and_send_email(
                        db,
                        slug="planner.activity.validated",
                        entity_id=eid,
                        language="fr",
                        to=email,
                        variables={
                            "reference": reference,
                            "activity_id": str(activity_id),
                            "title": title,
                            "user": {"first_name": name},
                        },
                    )

                await db.commit()
        logger.info("planner.activity.validated handled: %s", activity_id)
    except Exception:
        logger.exception("Error in on_planner_activity_validated for %s", activity_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_planner_activity_cancelled
# When activity cancelled — mark related AdS as requires_review
# ═══════════════════════════════════════════════════════════════════════════

async def on_planner_activity_cancelled(event: OpsFluxEvent) -> None:
    """When activity is cancelled — mark linked AdS as requires_review."""
    payload = event.payload
    activity_id = payload.get("activity_id")
    entity_id = payload.get("entity_id")

    if not activity_id or not entity_id:
        return

    try:
        from sqlalchemy import select, update
        from app.models.paxlog import Ads

        async with async_session_factory() as db:
            # Find all AdS linked to this planner activity that are not terminal
            result = await db.execute(
                select(Ads).where(
                    Ads.planner_activity_id == UUID(str(activity_id)),
                    Ads.entity_id == UUID(str(entity_id)),
                    Ads.status.notin_(["cancelled", "completed", "rejected"]),
                )
            )
            ads_list = result.scalars().all()

            updated_count = 0
            for ads in ads_list:
                ads.status = "requires_review"
                updated_count += 1

            if updated_count > 0:
                await db.commit()

                # Notify each requester via in-app + email
                from app.core.notifications import send_in_app
                from app.core.email_templates import render_and_send_email

                eid = UUID(str(entity_id))
                for ads in ads_list:
                    try:
                        await send_in_app(
                            db,
                            user_id=ads.requester_id,
                            entity_id=eid,
                            title="AdS nécessite révision",
                            body=f"L'activité planifiée liée à l'AdS {ads.reference} a été annulée. Veuillez réviser votre demande.",
                            category="paxlog",
                            link=f"/paxlog/ads/{ads.id}",
                        )

                        # Email via configurable template
                        email, name = await _get_user_email_and_name(ads.requester_id, db)
                        if email:
                            await render_and_send_email(
                                db,
                                slug="planner.activity.cancelled",
                                entity_id=eid,
                                language="fr",
                                to=email,
                                variables={
                                    "reference": payload.get("reference", ""),
                                    "activity_id": str(activity_id),
                                    "title": payload.get("title", ""),
                                    "user": {"first_name": name},
                                },
                            )
                    except Exception:
                        logger.exception("Failed to notify requester for ads %s", ads.id)
                await db.commit()

            logger.info(
                "planner.activity.cancelled: updated %d AdS to requires_review",
                updated_count,
            )
    except Exception:
        logger.exception("Error in on_planner_activity_cancelled for %s", activity_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_planner_conflict_detected
# When capacity conflict detected — notify DO
# ═══════════════════════════════════════════════════════════════════════════

async def on_planner_conflict_detected(event: OpsFluxEvent) -> None:
    """When capacity conflict detected — notify DO for arbitration."""
    payload = event.payload
    conflict_id = payload.get("conflict_id")
    entity_id = payload.get("entity_id")
    asset_name = payload.get("asset_name", "")
    conflict_date = payload.get("conflict_date", "")
    total_pax = payload.get("total_pax_requested", 0)
    max_capacity = payload.get("max_capacity", 0)

    if not entity_id:
        return

    try:
        from app.core.notifications import send_in_app
        from app.core.email_templates import render_and_send_email
        from app.event_handlers.core_handlers import _get_admin_user_ids

        eid = UUID(str(entity_id))

        # Notify all admins/DO via in-app + email
        admin_ids = await _get_admin_user_ids(entity_id)
        async with async_session_factory() as db:
            for admin_id in admin_ids:
                await send_in_app(
                    db,
                    user_id=admin_id,
                    entity_id=eid,
                    title="Conflit de capacité détecté",
                    body=(
                        f"Site {asset_name} le {conflict_date}: "
                        f"{total_pax} PAX demandés pour une capacité de {max_capacity}. "
                        f"Arbitrage requis."
                    ),
                    category="planner",
                    link=f"/planner/conflicts/{conflict_id}",
                )

                # Email via configurable template
                email, name = await _get_user_email_and_name(admin_id, db)
                if email:
                    await render_and_send_email(
                        db,
                        slug="planner.conflict.detected",
                        entity_id=eid,
                        language="fr",
                        to=email,
                        variables={
                            "conflict_id": str(conflict_id),
                            "asset_name": asset_name,
                            "conflict_date": str(conflict_date),
                            "total_pax_requested": str(total_pax),
                            "max_capacity": str(max_capacity),
                            "user": {"first_name": name},
                        },
                    )

            await db.commit()

        logger.info("planner.conflict.detected: notified %d admins", len(admin_ids))
    except Exception:
        logger.exception("Error in on_planner_conflict_detected for %s", conflict_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_ads_approved
# When AdS is approved — auto-add PAX to TravelWiz manifest
# ═══════════════════════════════════════════════════════════════════════════

async def on_ads_approved(event: OpsFluxEvent) -> None:
    """When AdS approved — find compatible voyage and add PAX to manifest."""
    payload = event.payload
    ads_id = payload.get("ads_id")
    entity_id = payload.get("entity_id")
    site_asset_id = payload.get("site_asset_id")
    start_date_str = payload.get("start_date")
    end_date_str = payload.get("end_date")
    outbound_transport_mode = payload.get("outbound_transport_mode")
    outbound_departure_base_id = payload.get("outbound_departure_base_id")

    if not ads_id or not entity_id or not site_asset_id:
        logger.warning("on_ads_approved: missing required fields")
        return

    try:
        from sqlalchemy import select, and_
        from app.models.paxlog import Ads, AdsPax, PaxProfile
        from app.models.travelwiz import (
            Voyage, VoyageStop, VoyageManifest, ManifestPassenger,
        )

        async with async_session_factory() as db:
            # Load the AdS and its approved PAX
            ads_result = await db.execute(
                select(Ads).where(Ads.id == UUID(str(ads_id)))
            )
            ads = ads_result.scalar_one_or_none()
            if not ads:
                logger.warning("on_ads_approved: AdS %s not found", ads_id)
                return

            pax_result = await db.execute(
                select(AdsPax).where(
                    AdsPax.ads_id == UUID(str(ads_id)),
                    AdsPax.status.in_(["approved", "compliant"]),
                )
            )
            approved_pax = pax_result.scalars().all()
            if not approved_pax:
                logger.info("on_ads_approved: no approved PAX for AdS %s", ads_id)
                return

            # Find a compatible outbound voyage (same destination, within date range)
            # Look for voyages going to the site_asset_id around the start_date
            start_date = ads.start_date
            from datetime import timedelta
            search_start = start_date - timedelta(days=1)
            search_end = start_date + timedelta(days=2)

            voyage_query = (
                select(Voyage)
                .where(
                    Voyage.entity_id == UUID(str(entity_id)),
                    Voyage.status.in_(["planned", "confirmed"]),
                    Voyage.scheduled_departure >= datetime.combine(search_start, datetime.min.time()),
                    Voyage.scheduled_departure <= datetime.combine(search_end, datetime.max.time()),
                    Voyage.active == True,
                )
            )
            if outbound_departure_base_id:
                voyage_query = voyage_query.where(
                    Voyage.departure_base_id == UUID(str(outbound_departure_base_id))
                )

            voyages_result = await db.execute(voyage_query)
            voyages = voyages_result.scalars().all()

            # Find voyage with a stop at the destination asset
            compatible_voyage = None
            for v in voyages:
                # Check if voyage has destination matching site_asset_id
                if str(v.destination_asset_id) == str(site_asset_id):
                    compatible_voyage = v
                    break
                # Also check stops
                stops_result = await db.execute(
                    select(VoyageStop).where(
                        VoyageStop.voyage_id == v.id,
                        VoyageStop.asset_id == UUID(str(site_asset_id)),
                    )
                )
                if stops_result.scalar_one_or_none():
                    compatible_voyage = v
                    break

            if not compatible_voyage:
                logger.info(
                    "on_ads_approved: no compatible voyage found for AdS %s. "
                    "LOG_BASE will need to create one manually.",
                    ads_id,
                )
                # Send notification to LOG_BASE admins
                from app.core.notifications import send_in_app
                from app.event_handlers.core_handlers import _get_admin_user_ids
                admin_ids = await _get_admin_user_ids(entity_id)
                for admin_id in admin_ids:
                    await send_in_app(
                        db,
                        user_id=admin_id,
                        entity_id=UUID(str(entity_id)),
                        title="AdS approuvé — aucun voyage compatible",
                        body=(
                            f"L'AdS {ads.reference} a été approuvé ({len(approved_pax)} PAX) "
                            f"mais aucun voyage compatible n'a été trouvé. "
                            f"Veuillez créer un voyage."
                        ),
                        category="travelwiz",
                        link=f"/travelwiz/voyages",
                    )
                await db.commit()
                return

            # Find or create a PAX manifest for this voyage
            manifest_result = await db.execute(
                select(VoyageManifest).where(
                    VoyageManifest.voyage_id == compatible_voyage.id,
                    VoyageManifest.manifest_type == "pax",
                )
            )
            manifest = manifest_result.scalar_one_or_none()

            if not manifest:
                manifest = VoyageManifest(
                    voyage_id=compatible_voyage.id,
                    manifest_type="pax",
                    status="draft",
                )
                db.add(manifest)
                await db.flush()

            # Add each approved PAX to the manifest
            added_count = 0
            for ads_pax_entry in approved_pax:
                # Check if PAX already in manifest
                existing = await db.execute(
                    select(ManifestPassenger).where(
                        ManifestPassenger.manifest_id == manifest.id,
                        ManifestPassenger.pax_id == ads_pax_entry.pax_id,
                    )
                )
                if existing.scalar_one_or_none():
                    continue

                # Load PAX profile for weight
                pax_profile = await db.get(PaxProfile, ads_pax_entry.pax_id)

                passenger = ManifestPassenger(
                    manifest_id=manifest.id,
                    pax_id=ads_pax_entry.pax_id,
                    ads_pax_id=ads_pax_entry.id,
                    boarding_status="pending",
                    declared_weight=0,  # Will be updated at check-in
                    priority_score=ads_pax_entry.priority_score,
                    standby=False,
                )
                db.add(passenger)
                added_count += 1

            await db.commit()
            logger.info(
                "on_ads_approved: added %d PAX from AdS %s to voyage %s manifest",
                added_count, ads.reference, compatible_voyage.id,
            )

            # Notify requester that transport is being arranged — in-app + email
            from app.core.notifications import send_in_app
            from app.core.email_templates import render_and_send_email

            eid = UUID(str(entity_id))
            await send_in_app(
                db,
                user_id=ads.requester_id,
                entity_id=eid,
                title="Transport en cours d'organisation",
                body=(
                    f"Les {added_count} PAX de l'AdS {ads.reference} ont été "
                    f"ajoutés au manifeste du voyage prévu."
                ),
                category="travelwiz",
                link=f"/travelwiz/voyages/{compatible_voyage.id}",
            )

            # Email via configurable template
            email, name = await _get_user_email_and_name(ads.requester_id, db)
            if email:
                await render_and_send_email(
                    db,
                    slug="ads.approved",
                    entity_id=eid,
                    language="fr",
                    to=email,
                    variables={
                        "reference": ads.reference,
                        "ads_id": str(ads.id),
                        "site_name": str(ads.site_entry_asset_id),
                        "start_date": str(ads.start_date),
                        "end_date": str(ads.end_date),
                        "pax_count": str(added_count),
                        "user": {"first_name": name},
                    },
                )

            await db.commit()

    except Exception:
        logger.exception("Error in on_ads_approved for AdS %s", ads_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_travelwiz_manifest_closed
# When return manifest closed — auto-close linked AdS
# ═══════════════════════════════════════════════════════════════════════════

async def on_travelwiz_manifest_closed(event: OpsFluxEvent) -> None:
    """When return manifest is closed — auto-close linked AdS to 'completed'."""
    payload = event.payload
    manifest_id = payload.get("manifest_id")
    voyage_id = payload.get("voyage_id")
    entity_id = payload.get("entity_id")
    is_return = payload.get("is_return", False)

    if not is_return or not manifest_id or not entity_id:
        return

    try:
        from sqlalchemy import select
        from app.models.paxlog import Ads, AdsPax
        from app.models.travelwiz import ManifestPassenger

        async with async_session_factory() as db:
            # Find all manifest passengers with ads_pax_id links
            result = await db.execute(
                select(ManifestPassenger).where(
                    ManifestPassenger.manifest_id == UUID(str(manifest_id)),
                    ManifestPassenger.ads_pax_id.isnot(None),
                    ManifestPassenger.boarding_status == "boarded",
                )
            )
            passengers = result.scalars().all()

            # Collect unique AdS IDs
            ads_ids_to_close: set[str] = set()
            for p in passengers:
                ads_pax_result = await db.execute(
                    select(AdsPax.ads_id).where(AdsPax.id == p.ads_pax_id)
                )
                ads_id = ads_pax_result.scalar_one_or_none()
                if ads_id:
                    ads_ids_to_close.add(str(ads_id))

            # Close each linked AdS
            closed_count = 0
            for ads_id_str in ads_ids_to_close:
                ads_result = await db.execute(
                    select(Ads).where(
                        Ads.id == UUID(ads_id_str),
                        Ads.status == "in_progress",
                    )
                )
                ads = ads_result.scalar_one_or_none()
                if ads:
                    ads.status = "completed"
                    closed_count += 1

            if closed_count > 0:
                await db.commit()

            logger.info(
                "travelwiz.manifest.closed: auto-closed %d AdS from manifest %s",
                closed_count, manifest_id,
            )
    except Exception:
        logger.exception("Error in on_travelwiz_manifest_closed for manifest %s", manifest_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_compliance_expired
# Notify entity admins when a compliance record expires
# ═══════════════════════════════════════════════════════════════════════════

async def on_compliance_expired(event: OpsFluxEvent) -> None:
    """Notify relevant users when a compliance record expires."""
    payload = event.payload
    record_id = payload.get("record_id")
    entity_id = payload.get("entity_id")

    if not record_id or not entity_id:
        return

    try:
        from app.core.notifications import send_in_app
        from app.event_handlers.core_handlers import _get_admin_user_ids

        admin_ids = await _get_admin_user_ids(entity_id)
        async with async_session_factory() as db:
            for admin_id in admin_ids:
                await send_in_app(
                    db,
                    user_id=admin_id,
                    entity_id=UUID(str(entity_id)),
                    title="Conformité expirée",
                    body=f"Un enregistrement de conformité a expiré (ID: {record_id[:8]}…)",
                    category="conformite",
                    link="/conformite",
                )
            await db.commit()
        logger.info("conformite.record.expired handled: %s", record_id)
    except Exception:
        logger.exception("Error in on_compliance_expired for %s", record_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_project_status_changed
# Notify entity admins when a project status changes
# ═══════════════════════════════════════════════════════════════════════════

async def on_project_status_changed(event: OpsFluxEvent) -> None:
    """Notify project stakeholders when status changes."""
    payload = event.payload
    project_id = payload.get("project_id")
    entity_id = payload.get("entity_id")
    new_status = payload.get("new_status", "unknown")

    if not project_id or not entity_id:
        return

    try:
        from app.core.notifications import send_in_app
        from app.event_handlers.core_handlers import _get_admin_user_ids

        admin_ids = await _get_admin_user_ids(entity_id)
        async with async_session_factory() as db:
            for admin_id in admin_ids:
                await send_in_app(
                    db,
                    user_id=admin_id,
                    entity_id=UUID(str(entity_id)),
                    title="Statut projet modifié",
                    body=f"Le projet est passé au statut : {new_status}",
                    category="projets",
                    link="/projets",
                )
            await db.commit()
        logger.info("project.status.changed handled: %s -> %s", project_id, new_status)
    except Exception:
        logger.exception("Error in on_project_status_changed for %s", project_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_credential_expiring
# Alert when a PAX credential is about to expire
# ═══════════════════════════════════════════════════════════════════════════

async def on_credential_expiring(event: OpsFluxEvent) -> None:
    """Alert when a PAX credential is about to expire."""
    payload = event.payload
    entity_id = payload.get("entity_id")
    days = payload.get("days_remaining", 0)
    type_name = payload.get("type_name", "Certification")

    if not entity_id:
        return

    try:
        from app.core.notifications import send_in_app
        from app.event_handlers.core_handlers import _get_admin_user_ids

        admin_ids = await _get_admin_user_ids(entity_id)
        async with async_session_factory() as db:
            for admin_id in admin_ids:
                await send_in_app(
                    db,
                    user_id=admin_id,
                    entity_id=UUID(str(entity_id)),
                    title=f"{type_name} expire dans {days}j",
                    body=f"Un enregistrement de conformité expire dans {days} jours.",
                    category="conformite",
                    link="/conformite",
                )
            await db.commit()
        logger.info("pax.credential.expiring handled: %s days=%d", entity_id, days)
    except Exception:
        logger.exception("Error in on_credential_expiring for entity %s", entity_id)


# ═══════════════════════════════════════════════════════════════════════════
# Registration
# ═══════════════════════════════════════════════════════════════════════════

async def on_workflow_transition(event: OpsFluxEvent) -> None:
    """Generic FSM transition handler — logs all workflow transitions for observability.

    The FSM service emits 'workflow.transition' on every state change.
    Module-specific events (planner.activity.validated, ads.approved, etc.)
    are handled by dedicated handlers above. This handler provides a
    central audit/observability point.
    """
    payload = event.payload
    entity_type = payload.get("entity_type", "?")
    entity_id = payload.get("entity_id_ref") or payload.get("entity_id", "?")
    from_state = payload.get("from_state", "?")
    to_state = payload.get("to_state", "?")
    actor_id = payload.get("actor_id", "?")
    slug = payload.get("definition_slug", "?")

    logger.info(
        "FSM transition: %s/%s [%s] %s → %s (by %s)",
        slug, entity_type, entity_id, from_state, to_state, actor_id,
    )


def register_module_handlers(event_bus: EventBus) -> None:
    """Register all inter-module event handlers."""
    # Module-specific events
    event_bus.subscribe("planner.activity.validated", on_planner_activity_validated)
    event_bus.subscribe("planner.activity.cancelled", on_planner_activity_cancelled)
    event_bus.subscribe("planner.conflict.detected", on_planner_conflict_detected)
    event_bus.subscribe("ads.approved", on_ads_approved)
    event_bus.subscribe("travelwiz.manifest.closed", on_travelwiz_manifest_closed)
    # Conformite & Projets events
    event_bus.subscribe("conformite.record.expired", on_compliance_expired)
    event_bus.subscribe("project.status.changed", on_project_status_changed)
    event_bus.subscribe("pax.credential.expiring", on_credential_expiring)
    # Generic FSM transition observability
    event_bus.subscribe("workflow.transition", on_workflow_transition)
    logger.info("Inter-module event handlers registered (incl. FSM observer)")
