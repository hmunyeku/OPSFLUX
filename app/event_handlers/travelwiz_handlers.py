"""Event handlers for TravelWiz module — voyage and manifest notifications.

All notifications use Core services:
- In-app: core.notifications.send_in_app()
- Email:  core.email_templates.render_and_send_email() — configurable via Email Manager

Event handlers must NEVER send emails directly. All emails go through the
Email Template system so admins can customize content, disable per entity,
and manage templates via the Email Manager UI.
"""

import logging
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


async def _get_contact_email_and_name(contact_id: UUID, db) -> tuple[str | None, str]:
    """Get email and display name for a TierContact (external PAX)."""
    from sqlalchemy import text
    result = await db.execute(
        text(
            "SELECT tc.email, COALESCE(tc.first_name || ' ' || tc.last_name, tc.email) "
            "FROM tier_contacts tc WHERE tc.id = :cid"
        ),
        {"cid": contact_id},
    )
    row = result.first()
    return (row[0], row[1]) if row else (None, "")


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_voyage_confirmed
# When a voyage is confirmed — notify manifest passengers
# ═══════════════════════════════════════════════════════════════════════════


async def on_voyage_confirmed(event: OpsFluxEvent) -> None:
    """When voyage is confirmed — notify manifest PAX via in-app + email."""
    payload = event.payload
    voyage_id = payload.get("voyage_id")
    entity_id = payload.get("entity_id")
    code = payload.get("code", "")
    departure_base = payload.get("departure_base", "")
    destination = payload.get("destination", "")
    scheduled_departure = payload.get("scheduled_departure", "")
    transport_mode = payload.get("transport_mode", "")

    if not entity_id or not voyage_id:
        return

    try:
        from sqlalchemy import select
        from app.core.notifications import send_in_app
        from app.core.email_templates import render_and_send_email
        from app.models.travelwiz import VoyageManifest, ManifestPassenger

        eid = UUID(str(entity_id))
        vid = UUID(str(voyage_id))

        async with async_session_factory() as db:
            # Find all PAX manifest passengers for this voyage
            manifest_result = await db.execute(
                select(VoyageManifest).where(
                    VoyageManifest.voyage_id == vid,
                    VoyageManifest.manifest_type == "pax",
                )
            )
            manifests = manifest_result.scalars().all()

            notified_pax: set[str] = set()
            for manifest in manifests:
                pax_result = await db.execute(
                    select(ManifestPassenger).where(
                        ManifestPassenger.manifest_id == manifest.id,
                        ManifestPassenger.active == True,  # noqa: E712
                    )
                )
                passengers = pax_result.scalars().all()

                for passenger in passengers:
                    # Resolve user_id (internal) or contact_id (external)
                    uid = passenger.user_id
                    contact_id = passenger.contact_id
                    if not uid and not contact_id:
                        continue
                    pax_key = str(uid or contact_id)
                    if pax_key in notified_pax:
                        continue
                    notified_pax.add(pax_key)

                    # Resolve email + name
                    if uid:
                        email, name = await _get_user_email_and_name(uid, db)
                    else:
                        email, name = await _get_contact_email_and_name(contact_id, db)

                    # In-app notification (only for internal users)
                    try:
                        if uid:
                            await send_in_app(
                                db,
                                user_id=uid,
                                entity_id=eid,
                                title="Voyage confirmé",
                                body=(
                                    f"Le voyage {code} ({departure_base} → {destination}) "
                                    f"prévu le {scheduled_departure} est confirmé."
                                ),
                                category="travelwiz",
                                link=f"/travelwiz/voyages/{voyage_id}",
                            )

                        # Email via configurable template
                        if email:
                            await render_and_send_email(
                                db,
                                slug="travelwiz.voyage.confirmed",
                                entity_id=eid,
                                language="fr",
                                to=email,
                                variables={
                                    "code": code,
                                    "voyage_id": str(voyage_id),
                                    "departure_base": departure_base,
                                    "destination": destination,
                                    "scheduled_departure": str(scheduled_departure),
                                    "transport_mode": transport_mode,
                                    "user": {"first_name": name},
                                },
                            )
                    except Exception:
                        logger.exception(
                            "Failed to notify PAX %s for voyage %s", pax_key, voyage_id
                        )

            await db.commit()

        logger.info(
            "travelwiz.voyage.confirmed handled: %s — %d PAX notified",
            code, len(notified_pax),
        )
    except Exception:
        logger.exception("Error in on_voyage_confirmed for voyage %s", voyage_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_manifest_validated
# When a manifest is validated — notify captain + passengers
# ═══════════════════════════════════════════════════════════════════════════


async def on_manifest_validated(event: OpsFluxEvent) -> None:
    """When manifest is validated — notify captain + PAX via in-app + email."""
    payload = event.payload
    manifest_id = payload.get("manifest_id")
    voyage_id = payload.get("voyage_id")
    entity_id = payload.get("entity_id")
    code = payload.get("code", "")
    departure_base = payload.get("departure_base", "")
    destination = payload.get("destination", "")
    scheduled_departure = payload.get("scheduled_departure", "")
    captain_user_id = payload.get("captain_user_id")
    passenger_count = payload.get("passenger_count", 0)

    if not entity_id or not manifest_id:
        return

    try:
        from sqlalchemy import select
        from app.core.notifications import send_in_app
        from app.core.email_templates import render_and_send_email
        from app.models.travelwiz import ManifestPassenger

        eid = UUID(str(entity_id))
        mid = UUID(str(manifest_id))

        async with async_session_factory() as db:
            # 1. Notify captain if provided
            if captain_user_id:
                captain_uid = UUID(str(captain_user_id))
                try:
                    await send_in_app(
                        db,
                        user_id=captain_uid,
                        entity_id=eid,
                        title="Manifeste validé",
                        body=(
                            f"Le manifeste du voyage {code} a été validé. "
                            f"{passenger_count} passagers confirmés."
                        ),
                        category="travelwiz",
                        link=f"/travelwiz/voyages/{voyage_id}/manifests/{manifest_id}",
                    )

                    email, name = await _get_user_email_and_name(captain_uid, db)
                    if email:
                        await render_and_send_email(
                            db,
                            slug="travelwiz.manifest.validated",
                            entity_id=eid,
                            language="fr",
                            to=email,
                            variables={
                                "code": code,
                                "manifest_id": str(manifest_id),
                                "voyage_id": str(voyage_id),
                                "passenger_count": str(passenger_count),
                                "departure_base": departure_base,
                                "destination": destination,
                                "scheduled_departure": str(scheduled_departure),
                                "user": {"first_name": name},
                            },
                        )
                except Exception:
                    logger.exception(
                        "Failed to notify captain %s for manifest %s",
                        captain_user_id, manifest_id,
                    )

            # 2. Notify all passengers on this manifest
            pax_result = await db.execute(
                select(ManifestPassenger).where(
                    ManifestPassenger.manifest_id == mid,
                    ManifestPassenger.active == True,  # noqa: E712
                )
            )
            passengers = pax_result.scalars().all()

            notified_pax: set[str] = set()
            for passenger in passengers:
                # Resolve user_id (internal) or contact_id (external)
                uid = passenger.user_id
                contact_id = passenger.contact_id
                if not uid and not contact_id:
                    continue
                pax_key = str(uid or contact_id)
                if pax_key in notified_pax:
                    continue
                notified_pax.add(pax_key)

                # Resolve email + name
                if uid:
                    email, name = await _get_user_email_and_name(uid, db)
                else:
                    email, name = await _get_contact_email_and_name(contact_id, db)

                try:
                    # In-app notification (only for internal users)
                    if uid:
                        await send_in_app(
                            db,
                            user_id=uid,
                            entity_id=eid,
                            title="Manifeste validé — Embarquement confirmé",
                            body=(
                                f"Le manifeste du voyage {code} a été validé. "
                                f"Votre embarquement est confirmé."
                            ),
                            category="travelwiz",
                            link=f"/travelwiz/voyages/{voyage_id}",
                        )

                    # Email for both internal and external PAX
                    if email:
                        await render_and_send_email(
                            db,
                            slug="travelwiz.manifest.validated",
                            entity_id=eid,
                            language="fr",
                            to=email,
                            variables={
                                "code": code,
                                "manifest_id": str(manifest_id),
                                "voyage_id": str(voyage_id),
                                "passenger_count": str(passenger_count),
                                "departure_base": departure_base,
                                "destination": destination,
                                "scheduled_departure": str(scheduled_departure),
                                "user": {"first_name": name},
                            },
                        )
                except Exception:
                    logger.exception(
                        "Failed to notify PAX %s for manifest %s", pax_key, manifest_id
                    )

            await db.commit()

        logger.info(
            "travelwiz.manifest.validated handled: %s — captain + %d PAX notified",
            code, len(notified_pax),
        )
    except Exception:
        logger.exception("Error in on_manifest_validated for manifest %s", manifest_id)


# ═══════════════════════════════════════════════════════════════════════════
# Registration
# ═══════════════════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_ads_approved
# PaxLog → TravelWiz: when AdS approved, add PAX to matching trip manifests
# ═══════════════════════════════════════════════════════════════════════════


async def on_ads_approved(event: OpsFluxEvent) -> None:
    """When an AdS is approved in PaxLog — auto-add PAX to TravelWiz manifests.

    If transport_requested=True and matching trips exist for the date/asset,
    create manifest entries for each approved PAX.
    """
    payload = event.payload
    ads_id = payload.get("ads_id")
    entity_id = payload.get("entity_id")
    site_asset_id = payload.get("site_asset_id")
    start_date = payload.get("start_date")
    transport_requested = payload.get("transport_requested", False)

    if not ads_id or not entity_id or not transport_requested:
        return

    try:
        from sqlalchemy import text

        async with async_session_factory() as db:
            # Find matching trips (destination = site_asset_id, departure around start_date)
            trips_result = await db.execute(
                text(
                    "SELECT t.id, pm.id as manifest_id "
                    "FROM trips t "
                    "LEFT JOIN pax_manifests pm ON pm.trip_id = t.id "
                    "  AND pm.status IN ('draft', 'pending_validation') "
                    "WHERE t.entity_id = :eid "
                    "AND t.destination_asset_id = :dest "
                    "AND t.departure_datetime::date = :dt "
                    "AND t.status IN ('planned', 'confirmed') "
                    "LIMIT 1"
                ),
                {
                    "eid": str(entity_id),
                    "dest": str(site_asset_id),
                    "dt": start_date,
                },
            )
            trip_row = trips_result.first()
            if not trip_row:
                logger.info(
                    "ads.approved → no matching trip found for AdS %s (site=%s, date=%s)",
                    ads_id, site_asset_id, start_date,
                )
                return

            trip_id, manifest_id = trip_row

            # If no manifest exists yet, we just log — LOG_BASE creates manifests manually
            if not manifest_id:
                logger.info(
                    "ads.approved → trip %s found but no manifest yet. AdS %s PAX pending.",
                    trip_id, ads_id,
                )
                # Notify LOG_BASE that PAX are ready for manifesting
                from app.core.notifications import send_in_app
                from app.event_handlers.core_handlers import _get_admin_user_ids

                admin_ids = await _get_admin_user_ids(entity_id)
                for admin_id in admin_ids:
                    await send_in_app(
                        db,
                        user_id=admin_id,
                        entity_id=UUID(str(entity_id)),
                        title="PAX disponibles pour manifeste",
                        body=(
                            f"L'AdS {payload.get('reference', '')} a été approuvée. "
                            f"Les PAX sont prêts à être ajoutés au manifeste du voyage."
                        ),
                        category="travelwiz",
                        link=f"/travelwiz",
                    )
                await db.commit()
                return

            # Get approved PAX from the AdS
            pax_result = await db.execute(
                text(
                    "SELECT ap.id, ap.user_id, ap.contact_id, ap.priority_score "
                    "FROM ads_pax ap "
                    "WHERE ap.ads_id = :aid "
                    "AND ap.status IN ('compliant', 'approved')"
                ),
                {"aid": str(ads_id)},
            )
            pax_rows = pax_result.all()

            added = 0
            for prow in pax_rows:
                ads_pax_id, ap_user_id, ap_contact_id, priority = prow
                # Check if already in manifest (by ads_pax_id)
                existing = await db.execute(
                    text(
                        "SELECT 1 FROM pax_manifest_entries "
                        "WHERE manifest_id = :mid AND ads_pax_id = :apid"
                    ),
                    {"mid": str(manifest_id), "apid": str(ads_pax_id)},
                )
                if existing.first():
                    continue

                await db.execute(
                    text(
                        "INSERT INTO pax_manifest_entries "
                        "(manifest_id, user_id, contact_id, ads_pax_id, status, priority_score, added_manually) "
                        "VALUES (:mid, :uid, :cid, :apid, 'confirmed', :ps, FALSE)"
                    ),
                    {
                        "mid": str(manifest_id),
                        "uid": str(ap_user_id) if ap_user_id else None,
                        "cid": str(ap_contact_id) if ap_contact_id else None,
                        "apid": str(ads_pax_id),
                        "ps": priority or 0,
                    },
                )
                added += 1

            # Update manifest total
            if added > 0:
                await db.execute(
                    text(
                        "UPDATE pax_manifests SET "
                        "total_pax_confirmed = total_pax_confirmed + :n, "
                        "updated_at = NOW() "
                        "WHERE id = :mid"
                    ),
                    {"mid": str(manifest_id), "n": added},
                )

            await db.commit()
            logger.info(
                "ads.approved → %d PAX added to manifest %s for trip %s",
                added, manifest_id, trip_id,
            )
    except Exception:
        logger.exception("Error in on_ads_approved for AdS %s", ads_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_planner_activity_modified_tw
# Planner → TravelWiz: put linked manifests in requires_review
# ═══════════════════════════════════════════════════════════════════════════


async def on_planner_activity_modified_tw(event: OpsFluxEvent) -> None:
    """When Planner activity modified — put TravelWiz manifests in requires_review."""
    payload = event.payload
    activity_id = payload.get("activity_id")
    entity_id = payload.get("entity_id")

    if not activity_id or not entity_id:
        return

    try:
        from sqlalchemy import text

        async with async_session_factory() as db:
            # Find manifests linked to this activity via AdS → manifest entries
            result = await db.execute(
                text(
                    "UPDATE pax_manifests pm SET status = 'requires_review', "
                    "updated_at = NOW() "
                    "FROM pax_manifest_entries pme "
                    "JOIN ads_pax ap ON ap.id = pme.ads_pax_id "
                    "JOIN ads a ON a.id = ap.ads_id "
                    "WHERE pme.manifest_id = pm.id "
                    "AND a.planner_activity_id = :aid "
                    "AND pm.status IN ('draft', 'pending_validation', 'validated') "
                    "RETURNING pm.id"
                ),
                {"aid": activity_id},
            )
            affected = result.all()
            await db.commit()
            logger.info(
                "planner.activity.modified → %d TravelWiz manifests → requires_review",
                len(affected),
            )
    except Exception:
        logger.exception("Error in on_planner_activity_modified_tw for %s", activity_id)


# ═══════════════════════════════════════════════════════════════════════════
# Registration
# ═══════════════════════════════════════════════════════════════════════════


def register_travelwiz_handlers(event_bus: EventBus) -> None:
    """Register all TravelWiz event handlers."""
    # TravelWiz lifecycle
    event_bus.subscribe("travelwiz.voyage.confirmed", on_voyage_confirmed)
    event_bus.subscribe("travelwiz.manifest.validated", on_manifest_validated)

    # PaxLog → TravelWiz (AdS approved → add PAX to manifests)
    event_bus.subscribe("paxlog.ads.approved", on_ads_approved)

    # Planner → TravelWiz (activity changes → manifests requires_review)
    event_bus.subscribe("planner.activity.modified", on_planner_activity_modified_tw)
    event_bus.subscribe("planner.activity.cancelled", on_planner_activity_modified_tw)

    logger.info("TravelWiz event handlers registered (lifecycle + inter-module)")
