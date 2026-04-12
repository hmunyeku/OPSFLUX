"""Inter-module event handlers — Planner, PaxLog, TravelWiz integration.

All notifications use Core services:
- In-app: core.notifications.send_in_app()
- Email:  core.email_templates.render_and_send_email() — configurable via Email Manager

Event orchestration convention:
- Native business events stay the source of truth when downstream consumers need
  rich domain payloads or product-facing semantics, for example `ads.approved`,
  `planner.activity.cancelled`, `project.status.changed`, or
  `paxlog.mission_notice.modified`.
- `workflow.transition` remains the technical backbone emitted by the FSM for
  observability and generic orchestration.
- `WORKFLOW_SEMANTIC_BRIDGES` is intentionally narrow. It republishes stable
  module-level aliases only for FSM-managed workflows that do not already have a
  sufficiently rich business event layer.
- Do not add a bridge entry when a native domain event already exists and is the
  event consumed by downstream modules; this avoids duplicated side effects.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID

from app.core.database import async_session_factory
from app.core.event_contracts import (
    PROJECT_STATUS_CHANGED_EVENT,
    WORKFLOW_SEMANTIC_BRIDGES,
    WORKFLOW_TRANSITION_EVENT,
)
from app.core.events import EventBus, OpsFluxEvent, event_bus
from app.services.core.fsm_service import fsm_service

logger = logging.getLogger(__name__)


# ── Helper: resolve user email from user_id ──────────────────────────────


async def _get_user_email_and_name(user_id: UUID, db) -> tuple[str | None, str]:
    """Get primary email and display name for a user."""
    from sqlalchemy import text

    result = await db.execute(
        text("SELECT u.email, COALESCE(u.first_name || ' ' || u.last_name, u.email) FROM users u WHERE u.id = :uid"),
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
            from app.core.email_templates import render_and_send_email
            from app.core.notifications import send_in_app

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
                    event_type="planner.activity.validated",
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
        from sqlalchemy import select

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
                from app.core.email_templates import render_and_send_email
                from app.core.notifications import send_in_app

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
                            event_type="planner.activity.cancelled",
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
        from app.core.email_templates import render_and_send_email
        from app.core.notifications import send_in_app
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
                    event_type="planner.conflict.detected",
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


async def on_planner_conflict_resolved(event: OpsFluxEvent) -> None:
    """Notify impacted project managers or activity requesters after arbitration."""
    payload = event.payload
    conflict_id = payload.get("conflict_id")
    entity_id = payload.get("entity_id")
    activity_ids = payload.get("activity_ids") or []
    resolution = payload.get("resolution") or "resolved"
    resolution_note = payload.get("resolution_note") or ""
    asset_name = payload.get("asset_name") or ""
    conflict_date = payload.get("conflict_date") or ""

    if not entity_id or not activity_ids:
        return

    try:
        from app.core.notifications import send_in_app
        from app.models.common import Project
        from app.models.planner import PlannerActivity

        eid = UUID(str(entity_id))
        resolution_labels = {
            "approve_both": "approbation simultanée",
            "reschedule": "replanification",
            "reduce_pax": "réduction du POB",
            "cancel": "annulation",
            "deferred": "report",
        }
        recipient_activity_titles: dict[UUID, list[str]] = {}

        async with async_session_factory() as db:
            for raw_activity_id in activity_ids:
                try:
                    activity_id = UUID(str(raw_activity_id))
                except Exception:
                    continue
                activity = await db.get(PlannerActivity, activity_id)
                if not activity or activity.entity_id != eid or not activity.active:
                    continue

                recipient_id = None
                if activity.project_id:
                    project = await db.get(Project, activity.project_id)
                    if project and project.manager_id:
                        recipient_id = project.manager_id
                if recipient_id is None:
                    recipient_id = activity.submitted_by or activity.created_by
                if recipient_id is None:
                    continue
                recipient_activity_titles.setdefault(recipient_id, []).append(activity.title)

            resolution_label = resolution_labels.get(str(resolution), str(resolution))
            for recipient_id, titles in recipient_activity_titles.items():
                await send_in_app(
                    db,
                    user_id=recipient_id,
                    entity_id=eid,
                    title="Arbitrage Planner rendu",
                    body=(
                        f"Le conflit Planner du {conflict_date} sur {asset_name or 'le site concerné'} "
                        f"a été traité ({resolution_label}). "
                        f"Activités concernées: {', '.join(titles[:3])}"
                        f"{'…' if len(titles) > 3 else ''}."
                        f"{f' Note: {resolution_note}' if resolution_note else ''}"
                    ),
                    category="planner",
                    link=f"/planner/conflicts/{conflict_id}",
                )

            await db.commit()
    except Exception:
        logger.exception("Error in on_planner_conflict_resolved for %s", conflict_id)


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
    return_transport_mode = payload.get("return_transport_mode")
    transport_requested = payload.get("transport_requested")
    outbound_departure_base_id = payload.get("outbound_departure_base_id")

    if not ads_id or not entity_id or not site_asset_id:
        logger.warning("on_ads_approved: missing required fields")
        return

    if transport_requested is None:
        from app.services.modules.paxlog_service import ads_requires_travelwiz_transport

        transport_requested = ads_requires_travelwiz_transport(
            outbound_transport_mode,
            return_transport_mode,
        )

    if not transport_requested:
        logger.info(
            "on_ads_approved: AdS %s does not require TravelWiz transport",
            ads_id,
        )
        return

    try:
        from sqlalchemy import select

        from app.models.paxlog import Ads, AdsPax
        from app.models.travelwiz import (
            ManifestPassenger,
            Voyage,
            VoyageManifest,
            VoyageStop,
        )

        async with async_session_factory() as db:
            # Load the AdS and its approved PAX
            ads_result = await db.execute(select(Ads).where(Ads.id == UUID(str(ads_id))))
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

            voyage_query = select(Voyage).where(
                Voyage.entity_id == UUID(str(entity_id)),
                Voyage.status.in_(["planned", "confirmed"]),
                Voyage.scheduled_departure >= datetime.combine(search_start, datetime.min.time()),
                Voyage.scheduled_departure <= datetime.combine(search_end, datetime.max.time()),
                Voyage.active == True,
            )
            if outbound_departure_base_id:
                voyage_query = voyage_query.where(Voyage.departure_base_id == UUID(str(outbound_departure_base_id)))

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
                        link="/travelwiz/voyages",
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
                # Check if PAX already in manifest (by ads_pax_id to avoid duplicates)
                existing = await db.execute(
                    select(ManifestPassenger).where(
                        ManifestPassenger.manifest_id == manifest.id,
                        ManifestPassenger.ads_pax_id == ads_pax_entry.id,
                    )
                )
                if existing.scalar_one_or_none():
                    continue

                # Resolve PAX name from User or TierContact
                pax_name = ""
                if ads_pax_entry.user_id:
                    from app.models.common import User as UserModel

                    u = await db.get(UserModel, ads_pax_entry.user_id)
                    pax_name = f"{u.first_name} {u.last_name}" if u else ""
                elif ads_pax_entry.contact_id:
                    from app.models.common import TierContact

                    tc = await db.get(TierContact, ads_pax_entry.contact_id)
                    pax_name = f"{tc.first_name} {tc.last_name}" if tc else ""

                passenger = ManifestPassenger(
                    manifest_id=manifest.id,
                    user_id=ads_pax_entry.user_id,
                    contact_id=ads_pax_entry.contact_id,
                    name=pax_name,
                    ads_pax_id=ads_pax_entry.id,
                    boarding_status="pending",
                    declared_weight_kg=0,
                    priority_score=ads_pax_entry.priority_score,
                    standby=False,
                )
                db.add(passenger)
                added_count += 1

            await db.commit()
            logger.info(
                "on_ads_approved: added %d PAX from AdS %s to voyage %s manifest",
                added_count,
                ads.reference,
                compatible_voyage.id,
            )

            # Notify requester that transport is being arranged — in-app + email
            from app.core.email_templates import render_and_send_email
            from app.core.notifications import send_in_app

            eid = UUID(str(entity_id))
            await send_in_app(
                db,
                user_id=ads.requester_id,
                entity_id=eid,
                title="Transport en cours d'organisation",
                body=(f"Les {added_count} PAX de l'AdS {ads.reference} ont été ajoutés au manifeste du voyage prévu."),
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


async def _complete_ads_from_travelwiz_passengers(
    *,
    db,
    passengers,
    manifest_id: str | None,
    voyage_id: str | None,
    source: str,
) -> int:
    from sqlalchemy import select

    from app.models.paxlog import Ads, AdsEvent, AdsPax

    ads_ids_to_close: set[str] = set()
    for passenger in passengers:
        ads_pax_result = await db.execute(select(AdsPax.ads_id).where(AdsPax.id == passenger.ads_pax_id))
        ads_id = ads_pax_result.scalar_one_or_none()
        if ads_id:
            ads_ids_to_close.add(str(ads_id))

    completed_ads_payloads: list[dict[str, str]] = []
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
            old_status = ads.status
            ads.status = "completed"
            db.add(
                AdsEvent(
                    entity_id=ads.entity_id,
                    ads_id=ads.id,
                    event_type="completed",
                    old_status=old_status,
                    new_status="completed",
                    actor_id=None,
                    metadata_json={
                        "source": source,
                        "manifest_id": manifest_id,
                        "voyage_id": voyage_id,
                    },
                )
            )
            completed_ads_payloads.append(
                {
                    "ads_id": str(ads.id),
                    "entity_id": str(ads.entity_id),
                    "reference": ads.reference,
                    "requester_id": str(ads.requester_id),
                    "manifest_id": manifest_id or "",
                    "voyage_id": voyage_id or "",
                }
            )
            closed_count += 1

    if closed_count > 0:
        await db.commit()
        for item in completed_ads_payloads:
            await fsm_service.emit_transition_event(
                entity_type="ads",
                entity_id=item["ads_id"],
                from_state="in_progress",
                to_state="completed",
                actor_id=None,
                workflow_slug="ads-workflow",
                extra_payload={
                    "source": source,
                    "manifest_id": item["manifest_id"] or None,
                    "voyage_id": item["voyage_id"] or None,
                },
            )
            await event_bus.publish(
                OpsFluxEvent(
                    event_type="ads.completed",
                    payload={
                        "ads_id": item["ads_id"],
                        "entity_id": item["entity_id"],
                        "reference": item["reference"],
                        "requester_id": item["requester_id"],
                        "source": source,
                        "manifest_id": item["manifest_id"] or None,
                        "voyage_id": item["voyage_id"] or None,
                    },
                )
            )

    return closed_count


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

        from app.models.travelwiz import ManifestPassenger

        async with async_session_factory() as db:
            result = await db.execute(
                select(ManifestPassenger).where(
                    ManifestPassenger.manifest_id == UUID(str(manifest_id)),
                    ManifestPassenger.ads_pax_id.isnot(None),
                    ManifestPassenger.boarding_status == "boarded",
                )
            )
            passengers = result.scalars().all()
            closed_count = await _complete_ads_from_travelwiz_passengers(
                db=db,
                passengers=passengers,
                manifest_id=str(manifest_id),
                voyage_id=str(voyage_id) if voyage_id else None,
                source="travelwiz.manifest.closed",
            )

            logger.info(
                "travelwiz.manifest.closed: auto-closed %d AdS from manifest %s",
                closed_count,
                manifest_id,
            )
    except Exception:
        logger.exception("Error in on_travelwiz_manifest_closed for manifest %s", manifest_id)


async def on_travelwiz_trip_closed(event: OpsFluxEvent) -> None:
    """When voyage is closed — auto-close linked AdS from boarded passengers on closed pax manifests."""
    payload = event.payload
    voyage_id = payload.get("voyage_id")
    entity_id = payload.get("entity_id")

    if not voyage_id or not entity_id:
        return

    try:
        from sqlalchemy import select

        from app.models.travelwiz import ManifestPassenger, VoyageManifest

        async with async_session_factory() as db:
            manifest_result = await db.execute(
                select(VoyageManifest.id).where(
                    VoyageManifest.voyage_id == UUID(str(voyage_id)),
                    VoyageManifest.manifest_type == "pax",
                    VoyageManifest.status == "closed",
                )
            )
            manifest_ids = list(manifest_result.scalars().all())
            if not manifest_ids:
                return

            passenger_result = await db.execute(
                select(ManifestPassenger).where(
                    ManifestPassenger.manifest_id.in_(manifest_ids),
                    ManifestPassenger.ads_pax_id.isnot(None),
                    ManifestPassenger.boarding_status == "boarded",
                )
            )
            passengers = passenger_result.scalars().all()
            closed_count = await _complete_ads_from_travelwiz_passengers(
                db=db,
                passengers=passengers,
                manifest_id=None,
                voyage_id=str(voyage_id),
                source="travelwiz.trip.closed",
            )

            logger.info(
                "travelwiz.trip.closed: auto-closed %d AdS from voyage %s",
                closed_count,
                voyage_id,
            )
    except Exception:
        logger.exception("Error in on_travelwiz_trip_closed for voyage %s", voyage_id)


async def on_travelwiz_voyage_cancelled_packlog(event: OpsFluxEvent) -> None:
    """Detach PackLog cargo from a cancelled voyage so it can be replanned."""
    payload = event.payload
    voyage_id = payload.get("voyage_id")
    entity_id = payload.get("entity_id")

    if not voyage_id or not entity_id:
        return

    try:
        from sqlalchemy import text

        from app.core.notifications import send_in_app

        async with async_session_factory() as db:
            result = await db.execute(
                text(
                    "UPDATE cargo_items c "
                    "SET manifest_id = NULL, "
                    "    status = CASE "
                    "        WHEN c.status IN ('loaded', 'in_transit') THEN 'ready_for_loading' "
                    "        ELSE c.status "
                    "    END, "
                    "    workflow_status = CASE "
                    "        WHEN c.workflow_status = 'assigned' THEN 'approved' "
                    "        ELSE c.workflow_status "
                    "    END, "
                    "    updated_at = NOW() "
                    "FROM voyage_manifests vm "
                    "LEFT JOIN cargo_requests cr ON cr.id = c.request_id "
                    "WHERE c.manifest_id = vm.id "
                    "  AND vm.voyage_id = :voyage_id "
                    "RETURNING c.id, c.tracking_code, COALESCE(cr.requested_by, c.registered_by) AS notify_user_id"
                ),
                {"voyage_id": voyage_id},
            )
            affected = result.all()

            for cargo_id, tracking_code, notify_user_id in affected:
                if not notify_user_id:
                    continue
                await send_in_app(
                    db,
                    user_id=UUID(str(notify_user_id)),
                    entity_id=UUID(str(entity_id)),
                    title="PackLog — Voyage annulé",
                    body=(f"Le colis {tracking_code} a été retiré d'un voyage annulé et doit être replanifié."),
                    category="packlog",
                    link=f"/packlog/cargo/{cargo_id}",
                )

            await db.commit()
            logger.info(
                "travelwiz.voyage.cancelled: detached %d PackLog cargo items from voyage %s",
                len(affected),
                voyage_id,
            )
    except Exception:
        logger.exception("Error in on_travelwiz_voyage_cancelled_packlog for voyage %s", voyage_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_compliance_rule_changed
# Notify affected users when a compliance rule is created or updated
# ═══════════════════════════════════════════════════════════════════════════


async def _get_affected_user_ids(entity_id: str | UUID, target_type: str, target_value: str | None) -> list[UUID]:
    """Return user IDs affected by a compliance rule based on its target_type.

    - 'all': every active user in the entity
    - 'department': users in the specified department (by department name)
    - 'job_position': users with the specified job_position_id
    """
    from sqlalchemy import text

    eid = str(entity_id)
    try:
        async with async_session_factory() as db:
            if target_type == "all":
                result = await db.execute(
                    text(
                        "SELECT DISTINCT ugm.user_id "
                        "FROM user_group_members ugm "
                        "JOIN user_groups ug ON ug.id = ugm.group_id "
                        "JOIN users u ON u.id = ugm.user_id "
                        "WHERE ug.entity_id = :entity_id "
                        "AND ug.active = true AND u.active = true"
                    ),
                    {"entity_id": eid},
                )
            elif target_type == "department" and target_value:
                result = await db.execute(
                    text(
                        "SELECT DISTINCT ugm.user_id "
                        "FROM user_group_members ugm "
                        "JOIN user_groups ug ON ug.id = ugm.group_id "
                        "JOIN users u ON u.id = ugm.user_id "
                        "JOIN departments d ON d.entity_id = ug.entity_id "
                        "WHERE ug.entity_id = :entity_id "
                        "AND ug.active = true AND u.active = true "
                        "AND d.name = :dept_name"
                    ),
                    {"entity_id": eid, "dept_name": target_value},
                )
            elif target_type == "job_position" and target_value:
                result = await db.execute(
                    text(
                        "SELECT DISTINCT u.id AS user_id "
                        "FROM users u "
                        "JOIN user_group_members ugm ON ugm.user_id = u.id "
                        "JOIN user_groups ug ON ug.id = ugm.group_id "
                        "WHERE ug.entity_id = :entity_id "
                        "AND ug.active = true AND u.active = true "
                        "AND u.job_position_id = CAST(:jp_id AS uuid)"
                    ),
                    {"entity_id": eid, "jp_id": target_value},
                )
            else:
                # Unsupported target_type — fall back to admins only
                from app.event_handlers.core_handlers import _get_admin_user_ids

                return await _get_admin_user_ids(entity_id)

            return [row.user_id for row in result.fetchall()]
    except Exception:
        logger.exception(
            "Failed to fetch affected user IDs for entity %s, target %s/%s", entity_id, target_type, target_value
        )
        return []


async def on_compliance_rule_changed(event: OpsFluxEvent) -> None:
    """Notify affected users when a compliance rule is created or updated,
    and broadcast cache invalidation via Redis pub/sub."""
    payload = event.payload
    rule_id = payload.get("rule_id")
    entity_id = payload.get("entity_id")
    target_type = payload.get("target_type", "all")
    target_value = payload.get("target_value")
    description = payload.get("description", "")

    if not rule_id or not entity_id:
        return

    is_new = event.event_type == "conformite.rule.created"
    action_label = "Nouvelle exigence" if is_new else "Exigence mise à jour"

    try:
        from app.core.email_templates import render_and_send_email
        from app.core.notifications import send_in_app_bulk

        user_ids = await _get_affected_user_ids(entity_id, target_type, target_value)
        if not user_ids:
            logger.info("%s: no affected users for rule %s", event.event_type, rule_id)
            return

        eid = UUID(str(entity_id))
        body_text = f"{action_label} : {description}" if description else action_label

        async with async_session_factory() as db:
            await send_in_app_bulk(
                db,
                user_ids=user_ids,
                entity_id=eid,
                title=f"{action_label} de conformité",
                body=body_text,
                category="conformite",
                link="/conformite",
                event_type="conformite.rule.changed",
            )
            for user_id in user_ids:
                email, name = await _get_user_email_and_name(user_id, db)
                if email:
                    await render_and_send_email(
                        db,
                        slug="conformite.rule.changed",
                        entity_id=eid,
                        language="fr",
                        to=email,
                        variables={
                            "rule_id": str(rule_id),
                            "action_label": action_label,
                            "description": description,
                            "target_type": target_type,
                            "target_value": str(target_value or ""),
                            "user": {"first_name": name},
                        },
                    )
            await db.commit()

        # Broadcast cache invalidation via Redis pub/sub
        from app.core.notification_manager import notification_manager

        await notification_manager.broadcast_to_entity(
            eid,
            {
                "type": "cache_invalidate",
                "data": {
                    "keys": ["compliance-rules", "compliance-records", "pending-verifications", "compliance-kpis"]
                },
            },
        )

        logger.info("%s handled: rule=%s, notified %d users", event.event_type, rule_id, len(user_ids))
    except Exception:
        logger.exception("Error in on_compliance_rule_changed for rule %s", rule_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_compliance_record_verified
# Notify the record owner when their document is verified or rejected
# ═══════════════════════════════════════════════════════════════════════════


async def on_compliance_record_verified(event: OpsFluxEvent) -> None:
    """Notify the record owner (in-app) when their document is verified or rejected."""
    payload = event.payload
    record_type = payload.get("record_type")
    record_id = payload.get("record_id")
    entity_id = payload.get("entity_id")
    is_rejected = "rejected" in event.event_type

    if not record_id or not entity_id:
        return

    try:
        from app.core.notification_manager import broadcast_entity_message
        from app.core.notifications import send_in_app
        from app.models.common import (
            DrivingLicense,
            MedicalCheck,
            SocialSecurity,
            UserPassport,
            UserVaccine,
            UserVisa,
        )
        from app.models.modules.conformite import ComplianceRecord

        MODEL_MAP = {
            "compliance_record": ComplianceRecord,
            "passport": UserPassport,
            "visa": UserVisa,
            "social_security": SocialSecurity,
            "vaccine": UserVaccine,
            "driving_license": DrivingLicense,
            "medical_check": MedicalCheck,
        }

        Model = MODEL_MAP.get(record_type)
        if not Model:
            return

        async with async_session_factory() as db:
            record = await db.get(Model, UUID(str(record_id)))
            if not record:
                return

            # Determine owner user ID
            owner_id = None
            if record_type == "compliance_record":
                if getattr(record, "owner_type", None) == "user":
                    owner_id = getattr(record, "owner_id", None)
            elif record_type == "medical_check":
                owner_id = getattr(record, "owner_id", None)
            else:
                owner_id = getattr(record, "user_id", None)

            if not owner_id:
                return

            action_label = "rejeté" if is_rejected else "vérifié"
            type_labels = {
                "compliance_record": "Conformité",
                "passport": "Passeport",
                "visa": "Visa",
                "social_security": "Sécurité sociale",
                "vaccine": "Vaccin",
                "driving_license": "Permis de conduire",
                "medical_check": "Visite médicale",
            }
            type_label = type_labels.get(record_type, record_type)

            await send_in_app(
                db,
                user_id=owner_id,
                entity_id=UUID(str(entity_id)),
                title=f"Document {action_label}",
                body=f"Votre {type_label} a été {action_label}.",
                category="conformite",
                link="/settings#roles",
                event_type="conformite.record_verified",
            )
            await db.commit()

        # Broadcast cache invalidate so the user's UI refreshes
        await broadcast_entity_message(
            str(entity_id),
            {
                "type": "cache_invalidate",
                "data": {"keys": ["pending-verifications", "verification-history", "compliance-kpis"]},
            },
        )
        logger.info("conformite.record.%s handled: %s", "rejected" if is_rejected else "verified", record_id)
    except Exception:
        logger.exception("Error in on_compliance_record_verified for %s", record_id)


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
        from app.core.email_templates import render_and_send_email
        from app.core.notifications import send_in_app
        from app.event_handlers.core_handlers import _get_admin_user_ids

        admin_ids = await _get_admin_user_ids(entity_id)
        async with async_session_factory() as db:
            record_type = payload.get("record_type") or "compliance"
            record_label = payload.get("record_label") or record_type
            owner_name = payload.get("owner_name") or ""
            for admin_id in admin_ids:
                await send_in_app(
                    db,
                    user_id=admin_id,
                    entity_id=UUID(str(entity_id)),
                    title="Conformité expirée",
                    body=f"Un enregistrement de conformité a expiré (ID: {record_id[:8]}…)",
                    category="conformite",
                    link="/conformite",
                    event_type="conformite.record.expired",
                )
                email, name = await _get_user_email_and_name(admin_id, db)
                if email:
                    await render_and_send_email(
                        db,
                        slug="conformite.record.expired",
                        entity_id=UUID(str(entity_id)),
                        language="fr",
                        to=email,
                        variables={
                            "record_id": str(record_id),
                            "record_type": str(record_type),
                            "record_label": str(record_label),
                            "owner_name": str(owner_name),
                            "user": {"first_name": name},
                        },
                    )
            await db.commit()
        logger.info("conformite.record.expired handled: %s", record_id)
    except Exception:
        logger.exception("Error in on_compliance_expired for %s", record_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_paxlog_ads_in_progress
# When an AdS effectively starts, auto-transition its linked Planner
# activity from validated → in_progress so the arbitration dashboard
# reflects operational reality without the manager intervening.
# ═══════════════════════════════════════════════════════════════════════════


async def on_paxlog_ads_in_progress(event: OpsFluxEvent) -> None:
    """Auto-progress a Planner activity when its first linked AdS starts."""
    payload = event.payload
    ads_id = payload.get("ads_id")
    if not ads_id:
        return

    try:
        from sqlalchemy import select

        from app.models.paxlog import Ads
        from app.models.planner import PlannerActivity

        async with async_session_factory() as db:
            ads_row = (await db.execute(select(Ads).where(Ads.id == UUID(str(ads_id))))).scalar_one_or_none()
            if ads_row is None or ads_row.planner_activity_id is None:
                return

            activity = (
                await db.execute(select(PlannerActivity).where(PlannerActivity.id == ads_row.planner_activity_id))
            ).scalar_one_or_none()
            if activity is None:
                return

            if activity.status in ("validated",):
                activity.status = "in_progress"
                if activity.actual_start is None:
                    activity.actual_start = datetime.now(UTC)
                await db.commit()
                logger.info(
                    "ads.in_progress cascade: planner activity %s validated → in_progress (ads=%s)",
                    activity.id,
                    ads_id,
                )
    except Exception:
        logger.exception("Error in on_paxlog_ads_in_progress for ads=%s", ads_id)


async def on_paxlog_ads_completed(event: OpsFluxEvent) -> None:
    """Auto-complete a linked Planner activity when the AdS is completed."""
    payload = event.payload
    ads_id = payload.get("ads_id")
    entity_id = payload.get("entity_id")
    if not ads_id:
        return

    try:
        from sqlalchemy import select

        from app.models.paxlog import Ads
        from app.models.planner import PlannerActivity

        async with async_session_factory() as db:
            ads_row = (await db.execute(select(Ads).where(Ads.id == UUID(str(ads_id))))).scalar_one_or_none()
            if ads_row is None or ads_row.planner_activity_id is None:
                return

            activity = (
                await db.execute(select(PlannerActivity).where(PlannerActivity.id == ads_row.planner_activity_id))
            ).scalar_one_or_none()
            if activity is None or activity.status in ("completed", "cancelled"):
                return

            activity.status = "completed"
            if activity.actual_end is None:
                activity.actual_end = datetime.now(UTC)
            await db.commit()

            await event_bus.publish(
                OpsFluxEvent(
                    event_type="planner.activity.completed",
                    payload={
                        "activity_id": str(activity.id),
                        "entity_id": str(entity_id or ads_row.entity_id),
                        "asset_id": str(activity.asset_id),
                        "project_id": str(activity.project_id) if activity.project_id else None,
                        "title": activity.title,
                        "source": "ads.completed",
                        "ads_id": str(ads_row.id),
                    },
                )
            )
            logger.info(
                "ads.completed cascade: planner activity %s → completed (ads=%s)",
                activity.id,
                ads_id,
            )
    except Exception:
        logger.exception("Error in on_paxlog_ads_completed for ads=%s", ads_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_project_status_changed
# - Notify entity admins when a project status changes
# - When the project is cancelled, cascade: cancel any linked Planner
#   activities still in a non-terminal state (the existing on_planner_
#   activity_cancelled handler will then cascade further to AdS).
# ═══════════════════════════════════════════════════════════════════════════


async def on_project_status_changed(event: OpsFluxEvent) -> None:
    """Notify project stakeholders and cascade project cancellation to Planner."""
    payload = event.payload
    project_id = payload.get("project_id")
    entity_id = payload.get("entity_id")
    new_status = payload.get("new_status", "unknown")

    if not project_id or not entity_id:
        return

    try:
        from app.core.email_templates import render_and_send_email
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
                    event_type="project.status.changed",
                )
                email, name = await _get_user_email_and_name(admin_id, db)
                if email:
                    await render_and_send_email(
                        db,
                        slug="project.status.changed",
                        entity_id=UUID(str(entity_id)),
                        language="fr",
                        to=email,
                        variables={
                            "project_id": str(project_id),
                            "project_code": str(payload.get("project_code") or ""),
                            "project_name": str(payload.get("project_name") or ""),
                            "old_status": str(payload.get("old_status") or ""),
                            "new_status": str(new_status),
                            "user": {"first_name": name},
                        },
                    )
            await db.commit()
        logger.info("project.status.changed handled: %s -> %s", project_id, new_status)

        # ── Cascade: cancel linked Planner activities on project cancel ──
        if new_status in ("cancelled", "archived"):
            try:
                from sqlalchemy import select

                from app.models.planner import PlannerActivity

                TERMINAL = {"cancelled", "rejected", "completed"}
                async with async_session_factory() as db:
                    activities = (
                        (
                            await db.execute(
                                select(PlannerActivity).where(
                                    PlannerActivity.project_id == UUID(str(project_id)),
                                    ~PlannerActivity.status.in_(list(TERMINAL)),
                                )
                            )
                        )
                        .scalars()
                        .all()
                    )
                    cancelled_count = 0
                    for activity in activities:
                        activity.status = "cancelled"
                        activity.cancelled_at = datetime.now(UTC)
                        cancelled_count += 1
                        # Emit the cancellation event so downstream listeners
                        # (AdS, TravelWiz, notifications) trigger as if the
                        # user had cancelled the activity manually.
                        await event_bus.publish(
                            OpsFluxEvent(
                                event_type="planner.activity.cancelled",
                                payload={
                                    "activity_id": str(activity.id),
                                    "entity_id": str(entity_id),
                                    "reason": f"Projet {new_status}",
                                    "cascade_source": "project.status.changed",
                                },
                            )
                        )
                    if cancelled_count:
                        await db.commit()
                        logger.info(
                            "project.status.changed cascade: cancelled %d Planner activities for project %s",
                            cancelled_count,
                            project_id,
                        )
            except Exception:
                logger.exception(
                    "Error cascading project cancel to Planner activities (project=%s)",
                    project_id,
                )
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
        slug,
        entity_type,
        entity_id,
        from_state,
        to_state,
        actor_id,
    )


async def on_workflow_transition_semantic_bridge(event: OpsFluxEvent) -> None:
    """Republish selected workflow transitions under stable module-level aliases."""
    payload = event.payload or {}
    workflow_slug = payload.get("workflow_slug") or payload.get("definition_slug")
    entity_type = payload.get("entity_type")
    entity_id = payload.get("entity_id_ref") or payload.get("entity_id")
    to_state = payload.get("to_state")
    if not entity_id or not to_state:
        return
    bridge = WORKFLOW_SEMANTIC_BRIDGES.get((str(workflow_slug), str(entity_type)))
    if not bridge:
        return

    state_filter = bridge.get("state_filter")
    if isinstance(state_filter, set) and to_state not in state_filter:
        return

    bridge_payload = dict(payload)
    payload_map = bridge.get("payload_map", {})
    if isinstance(payload_map, dict):
        for target_key, source_key in payload_map.items():
            if source_key == "entity_id":
                bridge_payload[target_key] = entity_id
            else:
                bridge_payload[target_key] = payload.get(str(source_key))

    aliases = bridge.get("aliases", [])
    if isinstance(aliases, list):
        for alias in aliases:
            if not isinstance(alias, str):
                continue
            await event_bus.publish(
                OpsFluxEvent(
                    event_type=alias.format(to_state=to_state),
                    payload=bridge_payload,
                )
            )


async def on_planner_activity_status_sync(event: OpsFluxEvent) -> None:
    """Sync Planner activity status back to source ProjectTask.

    When a PlannerActivity has source_task_id and its status changes,
    mirror the status to the ProjectTask:
      validated → in_progress, in_progress → in_progress,
      cancelled → cancelled
    """
    payload = event.payload
    activity_id = payload.get("activity_id")
    if not activity_id:
        return

    STATUS_MAP = {
        "validated": "in_progress",
        "in_progress": "in_progress",
        "cancelled": "cancelled",
    }

    try:
        from sqlalchemy import select

        from app.models.common import ProjectTask
        from app.models.planner import PlannerActivity

        async with async_session_factory() as db:
            activity = (
                await db.execute(select(PlannerActivity).where(PlannerActivity.id == UUID(str(activity_id))))
            ).scalar_one_or_none()
            if not activity or not activity.source_task_id:
                return

            new_task_status = STATUS_MAP.get(activity.status)
            if not new_task_status:
                return

            task = (
                await db.execute(select(ProjectTask).where(ProjectTask.id == activity.source_task_id))
            ).scalar_one_or_none()
            if not task or task.status == new_task_status:
                return

            task.status = new_task_status
            await db.commit()
            logger.info(
                "Planner→Projets sync: task %s → %s (from activity %s)",
                task.id,
                new_task_status,
                activity_id,
            )
    except Exception:
        logger.exception("Error in on_planner_activity_status_sync for %s", activity_id)


async def on_planner_activity_completed_suggest_task_closure(event: OpsFluxEvent) -> None:
    """Notify project leadership that task closure may be appropriate after AdS completion."""
    payload = event.payload
    activity_id = payload.get("activity_id")
    ads_id = payload.get("ads_id")
    entity_id = payload.get("entity_id")
    if not activity_id or not entity_id:
        return

    try:
        from sqlalchemy import select

        from app.core.notifications import send_in_app
        from app.models.common import Project, ProjectTask
        from app.models.planner import PlannerActivity

        async with async_session_factory() as db:
            activity = (
                await db.execute(select(PlannerActivity).where(PlannerActivity.id == UUID(str(activity_id))))
            ).scalar_one_or_none()
            if not activity or not activity.source_task_id:
                return

            task = (
                await db.execute(select(ProjectTask).where(ProjectTask.id == activity.source_task_id))
            ).scalar_one_or_none()
            if not task or task.status in {"done", "cancelled"}:
                return

            project = await db.get(Project, task.project_id) if task.project_id else None
            recipient_id = None
            if project and project.manager_id:
                recipient_id = project.manager_id
            elif task.assignee_id:
                recipient_id = task.assignee_id
            if recipient_id is None:
                return

            await send_in_app(
                db,
                user_id=recipient_id,
                entity_id=UUID(str(entity_id)),
                title="Cloture de tache a confirmer",
                body=(
                    f"La tache projet '{task.title}' est liee a une activite Planner terminee "
                    f"apres cloture de l'AdS {ads_id or ''}. Verifiez si la tache doit etre cloturee."
                ).strip(),
                category="projets",
                link=f"/projets?task={task.id}",
                event_type="project.task.planner_sync_required",
            )
            await db.commit()
            logger.info(
                "Planner completion suggestion sent for task %s (activity %s)",
                task.id,
                activity_id,
            )
    except Exception:
        logger.exception("Error in on_planner_activity_completed_suggest_task_closure for %s", activity_id)


async def on_project_task_planner_sync_required(event: OpsFluxEvent) -> None:
    """Notify Planner arbiters when a linked project task changed critically."""
    payload = event.payload
    entity_id = payload.get("entity_id")
    project_id = payload.get("project_id")
    task_id = payload.get("task_id")
    task_title = payload.get("task_title") or ""
    project_code = payload.get("project_code") or ""
    changed_fields = payload.get("changed_fields") or []
    planner_activity_count = payload.get("planner_activity_count") or 0
    if not entity_id or not task_id:
        return

    try:
        from sqlalchemy import select

        from app.api.deps import has_user_permission
        from app.core.notifications import send_in_app
        from app.models.common import User

        eid = UUID(str(entity_id))
        async with async_session_factory() as db:
            users = (
                (
                    await db.execute(
                        select(User).where(
                            User.default_entity_id == eid,
                            User.active == True,
                        )
                    )
                )
                .scalars()
                .all()
            )

            recipient_ids: list[UUID] = []
            for user in users:
                if await has_user_permission(user, eid, "planner.activity.validate", db):
                    recipient_ids.append(user.id)

            if not recipient_ids:
                return

            field_labels = {
                "title": "titre",
                "description": "description",
                "start_date": "date de debut",
                "due_date": "date de fin",
                "status": "statut",
            }
            changed_label = (
                ", ".join(field_labels.get(str(field), str(field)) for field in changed_fields) or "donnees critiques"
            )
            title = "Revision Planner suggeree"
            body = (
                f"La tache projet '{task_title}' du projet {project_code or project_id} a change "
                f"({changed_label}). {planner_activity_count} activite(s) Planner liee(s) ont ete resynchronisees. "
                "Une revision d'arbitrage peut etre necessaire."
            )

            for recipient_id in recipient_ids:
                await send_in_app(
                    db,
                    user_id=recipient_id,
                    entity_id=eid,
                    title=title,
                    body=body,
                    category="planner",
                    link=f"/planner?project={project_id}&task={task_id}",
                    event_type="project.task.planner_sync_required",
                )

            await db.commit()
            logger.info(
                "project.task.planner_sync_required: notified %d planner arbiters for task %s",
                len(recipient_ids),
                task_id,
            )
    except Exception:
        logger.exception("Error in on_project_task_planner_sync_required for %s", task_id)


async def on_planner_revision_requested(event: OpsFluxEvent) -> None:
    """Notify the targeted project manager/assignee about a Planner revision request."""
    payload = event.payload
    entity_id = payload.get("entity_id")
    request_id = payload.get("request_id")
    target_user_id = payload.get("target_user_id")
    requester_user_name = payload.get("requester_user_name") or "Planner"
    task_title = payload.get("task_title") or "Tache liee"
    project_code = payload.get("project_code") or payload.get("project_id") or ""
    due_at = payload.get("due_at")
    if not entity_id or not target_user_id:
        return

    try:
        from app.core.notifications import send_in_app

        async with async_session_factory() as db:
            body = (
                f"{requester_user_name} demande votre arbitrage sur la revision Planner "
                f"de '{task_title}' ({project_code})."
            ).strip()
            if due_at:
                body += f" Reponse attendue avant le {due_at[:10]}."
            await send_in_app(
                db,
                user_id=UUID(str(target_user_id)),
                entity_id=UUID(str(entity_id)),
                title="Decision Planner requise",
                body=body,
                category="planner",
                link=f"/planner?revisionRequest={request_id}" if request_id else "/planner",
                event_type="planner.revision.requested",
            )
            await db.commit()
    except Exception:
        logger.exception("Error in on_planner_revision_requested for %s", request_id)


async def on_planner_revision_responded(event: OpsFluxEvent) -> None:
    """Notify the arbiter who requested the Planner revision decision."""
    payload = event.payload
    entity_id = payload.get("entity_id")
    request_id = payload.get("request_id")
    requester_user_id = payload.get("requester_user_id")
    target_user_name = payload.get("target_user_name") or "Le relecteur"
    response = payload.get("response") or "responded"
    response_note = payload.get("response_note")
    if not entity_id or not requester_user_id:
        return

    try:
        from app.core.notifications import send_in_app

        response_labels = {
            "accepted": "a accepte la proposition",
            "counter_proposed": "a soumis une contre-proposition",
        }

        async with async_session_factory() as db:
            body = f"{target_user_name} {response_labels.get(str(response), 'a repondu a la demande')}."
            if response_note:
                body += f" {response_note}"
            await send_in_app(
                db,
                user_id=UUID(str(requester_user_id)),
                entity_id=UUID(str(entity_id)),
                title="Reponse a une revision Planner",
                body=body,
                category="planner",
                link=f"/planner?revisionRequest={request_id}" if request_id else "/planner",
                event_type="planner.revision.responded",
            )
            await db.commit()
    except Exception:
        logger.exception("Error in on_planner_revision_responded for %s", request_id)


async def on_planner_revision_forced(event: OpsFluxEvent) -> None:
    """Notify the targeted reviewer that the Planner decision was forced after expiry."""
    payload = event.payload
    entity_id = payload.get("entity_id")
    request_id = payload.get("request_id")
    target_user_id = payload.get("target_user_id")
    reason = payload.get("reason")
    if not entity_id or not target_user_id:
        return

    try:
        from app.core.notifications import send_in_app

        async with async_session_factory() as db:
            body = "La decision Planner a ete forcee apres echeance."
            if reason:
                body += f" {reason}"
            await send_in_app(
                db,
                user_id=UUID(str(target_user_id)),
                entity_id=UUID(str(entity_id)),
                title="Decision Planner forcee",
                body=body,
                category="planner",
                link=f"/planner?revisionRequest={request_id}" if request_id else "/planner",
                event_type="planner.revision.forced",
            )
            await db.commit()
    except Exception:
        logger.exception("Error in on_planner_revision_forced for %s", request_id)


async def on_planner_activity_validated_bundle(event: OpsFluxEvent) -> None:
    """Execute all side effects attached to planner.activity.validated once."""
    await on_planner_activity_validated(event)
    await on_planner_activity_status_sync(event)


async def on_planner_activity_cancelled_bundle(event: OpsFluxEvent) -> None:
    """Execute all side effects attached to planner.activity.cancelled once."""
    await on_planner_activity_status_sync(event)
    await on_planner_activity_cancelled(event)


async def on_planner_activity_completed_bundle(event: OpsFluxEvent) -> None:
    """Execute all side effects attached to planner.activity.completed once."""
    await on_planner_activity_completed_suggest_task_closure(event)


def register_module_handlers(event_bus: EventBus) -> None:
    """Register all inter-module event handlers."""
    # Planner events
    event_bus.subscribe("planner.activity.validated", on_planner_activity_validated_bundle)
    event_bus.subscribe("planner.activity.cancelled", on_planner_activity_cancelled_bundle)
    event_bus.subscribe("planner.activity.completed", on_planner_activity_completed_bundle)
    event_bus.subscribe("planner.conflict.detected", on_planner_conflict_detected)
    event_bus.subscribe("planner.conflict.resolved", on_planner_conflict_resolved)
    # PaxLog → Planner: when an AdS actually starts, auto-mark the linked
    # planner activity as in_progress so the arbitration dashboard reflects
    # reality without the manager having to move it manually.
    event_bus.subscribe("ads.approved", on_ads_approved)
    event_bus.subscribe("ads.in_progress", on_paxlog_ads_in_progress)
    event_bus.subscribe("ads.completed", on_paxlog_ads_completed)
    event_bus.subscribe("travelwiz.manifest.closed", on_travelwiz_manifest_closed)
    event_bus.subscribe("travelwiz.trip.closed", on_travelwiz_trip_closed)
    event_bus.subscribe("travelwiz.voyage.cancelled", on_travelwiz_voyage_cancelled_packlog)
    event_bus.subscribe("project.task.planner_sync_required", on_project_task_planner_sync_required)
    event_bus.subscribe("planner.revision.requested", on_planner_revision_requested)
    event_bus.subscribe("planner.revision.responded", on_planner_revision_responded)
    event_bus.subscribe("planner.revision.forced", on_planner_revision_forced)
    # Conformite & Projets events
    event_bus.subscribe("conformite.rule.created", on_compliance_rule_changed)
    event_bus.subscribe("conformite.rule.updated", on_compliance_rule_changed)
    event_bus.subscribe("conformite.record.verified", on_compliance_record_verified)
    event_bus.subscribe("conformite.record.rejected", on_compliance_record_verified)
    event_bus.subscribe("conformite.record.expired", on_compliance_expired)
    event_bus.subscribe(PROJECT_STATUS_CHANGED_EVENT, on_project_status_changed)
    event_bus.subscribe("pax.credential.expiring", on_credential_expiring)
    # Generic FSM transition observability
    event_bus.subscribe(WORKFLOW_TRANSITION_EVENT, on_workflow_transition)
    event_bus.subscribe(WORKFLOW_TRANSITION_EVENT, on_workflow_transition_semantic_bridge)
    logger.info("Inter-module event handlers registered (incl. FSM observer)")
