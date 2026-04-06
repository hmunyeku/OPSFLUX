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
        from sqlalchemy import select, text
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
        from sqlalchemy import func as sqla_func, select
        from app.core.notifications import send_in_app
        from app.event_handlers.core_handlers import _get_admin_user_ids
        from app.models.travelwiz import Voyage, VoyageStop
        from app.services.modules.travelwiz_service import generate_pax_manifest_from_ads

        async with async_session_factory() as db:
            trips_result = await db.execute(
                select(Voyage)
                .join(VoyageStop, VoyageStop.voyage_id == Voyage.id)
                .where(
                    Voyage.entity_id == UUID(str(entity_id)),
                    Voyage.active == True,  # noqa: E712
                    Voyage.status.in_(["planned", "confirmed"]),
                    VoyageStop.active == True,  # noqa: E712
                    VoyageStop.asset_id == UUID(str(site_asset_id)),
                    sqla_func.date(Voyage.scheduled_departure) == start_date,
                )
                .order_by(Voyage.scheduled_departure)
                .limit(1)
            )
            voyage = trips_result.scalar_one_or_none()
            if not voyage:
                logger.info(
                    "ads.approved → no matching voyage found for AdS %s (site=%s, date=%s)",
                    ads_id, site_asset_id, start_date,
                )
                admin_ids = await _get_admin_user_ids(entity_id)
                for admin_id in admin_ids:
                    await send_in_app(
                        db,
                        user_id=admin_id,
                        entity_id=UUID(str(entity_id)),
                        title="Voyage à planifier",
                        body=(
                            f"L'AdS {payload.get('reference', '')} est approuvée mais aucun voyage compatible "
                            f"n'existe pour le {start_date} vers le site demandé."
                        ),
                        category="travelwiz",
                        link="/travelwiz",
                    )
                await db.commit()
                return

            manifest_summary = await generate_pax_manifest_from_ads(
                db,
                trip_id=voyage.id,
                entity_id=UUID(str(entity_id)),
            )

            await db.commit()
            logger.info(
                "ads.approved → %d PAX added to manifest %s for voyage %s",
                manifest_summary["added_count"],
                manifest_summary["manifest_id"],
                voyage.id,
            )
    except Exception:
        logger.exception("Error in on_ads_approved for AdS %s", ads_id)


async def on_voyage_delayed(event: OpsFluxEvent) -> None:
    """Notify operators and passengers when a voyage enters delayed status."""
    payload = event.payload
    entity_id = payload.get("entity_id")
    voyage_id = payload.get("voyage_id")
    code = payload.get("code", "")
    delay_reason = payload.get("delay_reason") or ""
    delay_hours = payload.get("delay_hours") or 0
    reassign_available = bool(payload.get("reassign_available"))

    if not entity_id or not voyage_id:
        return

    try:
        from sqlalchemy import select
        from app.core.notifications import send_in_app
        from app.core.email_templates import render_and_send_email
        from app.event_handlers.core_handlers import _get_admin_user_ids
        from app.models.travelwiz import ManifestPassenger, VoyageManifest

        eid = UUID(str(entity_id))
        vid = UUID(str(voyage_id))

        async with async_session_factory() as db:
            admin_ids = await _get_admin_user_ids(entity_id)
            for admin_id in admin_ids:
                await send_in_app(
                    db,
                    user_id=admin_id,
                    entity_id=eid,
                    title="Voyage retardé",
                    body=(
                        f"Le voyage {code or voyage_id} est retardé ({delay_hours} h). "
                        f"{'Des alternatives sont disponibles.' if reassign_available else 'Aucune alternative immédiate.'}"
                    ),
                    category="travelwiz",
                    link=f"/travelwiz/voyages/{voyage_id}",
                )

            pax_result = await db.execute(
                select(ManifestPassenger).join(VoyageManifest, ManifestPassenger.manifest_id == VoyageManifest.id).where(
                    VoyageManifest.voyage_id == vid,
                    VoyageManifest.manifest_type == "pax",
                    VoyageManifest.active == True,  # noqa: E712
                    ManifestPassenger.active == True,  # noqa: E712
                )
            )
            notified: set[str] = set()
            for passenger in pax_result.scalars().all():
                recipient_id = passenger.user_id or passenger.contact_id
                if recipient_id is None:
                    continue
                recipient_key = str(recipient_id)
                if recipient_key in notified:
                    continue
                notified.add(recipient_key)
                if passenger.user_id:
                    email, name = await _get_user_email_and_name(passenger.user_id, db)
                    await send_in_app(
                        db,
                        user_id=passenger.user_id,
                        entity_id=eid,
                        title="Voyage retardé",
                        body=f"Le voyage {code or voyage_id} est retardé. {delay_reason}".strip(),
                        category="travelwiz",
                        link=f"/travelwiz/voyages/{voyage_id}",
                    )
                else:
                    email, name = await _get_contact_email_and_name(passenger.contact_id, db)
                if email:
                    await render_and_send_email(
                        db,
                        slug="travelwiz.voyage.delayed",
                        entity_id=eid,
                        language="fr",
                        to=email,
                        variables={
                            "code": code or str(voyage_id),
                            "voyage_id": str(voyage_id),
                            "delay_reason": delay_reason,
                            "delay_hours": str(delay_hours),
                            "reassign_available": "oui" if reassign_available else "non",
                            "user": {"first_name": name},
                        },
                    )
            await db.commit()
    except Exception:
        logger.exception("Error in on_voyage_delayed for voyage %s", voyage_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_planner_activity_modified_tw
# Planner → TravelWiz: put linked manifests in requires_review
# ═══════════════════════════════════════════════════════════════════════════


async def on_planner_activity_modified_tw(event: OpsFluxEvent) -> None:
    """When Planner activity modified — put TravelWiz manifests in requires_review."""
    payload = event.payload
    activity_id = payload.get("activity_id")
    entity_id = payload.get("entity_id")
    title = payload.get("title", "")
    changes = payload.get("changes") or {}

    if not activity_id or not entity_id:
        return

    try:
        from sqlalchemy import text
        from app.core.notifications import send_in_app
        from app.event_handlers.core_handlers import _get_admin_user_ids

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
            manifest_ids = [str(row[0]) for row in affected]

            if manifest_ids:
                change_keys = ", ".join(sorted(changes.keys())) if isinstance(changes, dict) and changes else "planning"
                admin_ids = await _get_admin_user_ids(entity_id)
                for admin_id in admin_ids:
                    await send_in_app(
                        db,
                        user_id=admin_id,
                        entity_id=UUID(str(entity_id)),
                        title="Manifestes à revoir",
                        body=(
                            f"L'activité Planner {title or activity_id} a été modifiée. "
                            f"Manifestes concernés: {', '.join(manifest_ids)}. "
                            f"Champs modifiés: {change_keys}."
                        ),
                        category="travelwiz",
                        link="/travelwiz",
                    )

            await db.commit()
            logger.info(
                "planner.activity.modified → %d TravelWiz manifests → requires_review",
                len(affected),
            )
    except Exception:
        logger.exception("Error in on_planner_activity_modified_tw for %s", activity_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_ads_stay_change_requested
# PaxLog → TravelWiz: when an AdS changes mid-lifecycle, notify impacted manifests
# ═══════════════════════════════════════════════════════════════════════════


async def on_ads_stay_change_requested(event: OpsFluxEvent) -> None:
    """Notify TravelWiz operators when an AdS stay change impacts manifests."""
    payload = event.payload
    ads_id = payload.get("ads_id")
    entity_id = payload.get("entity_id")
    reference = payload.get("reference", "")
    reason = payload.get("reason", "")
    changes = payload.get("changes") or {}

    if not ads_id or not entity_id:
        return

    try:
        from sqlalchemy import select
        from app.core.notifications import send_in_app
        from app.event_handlers.core_handlers import _get_admin_user_ids
        from app.models.travelwiz import ManifestPassenger, VoyageManifest
        from app.models.paxlog import AdsPax

        eid = UUID(str(entity_id))
        aid = UUID(str(ads_id))

        async with async_session_factory() as db:
            manifest_result = await db.execute(
                select(VoyageManifest.id, VoyageManifest.status)
                .join(ManifestPassenger, ManifestPassenger.manifest_id == VoyageManifest.id)
                .join(AdsPax, AdsPax.id == ManifestPassenger.ads_pax_id)
                .where(
                    AdsPax.ads_id == aid,
                    ManifestPassenger.active == True,  # noqa: E712
                    VoyageManifest.active == True,  # noqa: E712
                )
            )
            manifest_rows = manifest_result.all()
            manifest_ids = sorted({str(row[0]) for row in manifest_rows})
            if not manifest_ids:
                logger.info("ads.stay_change_requested → no linked TravelWiz manifest for AdS %s", ads_id)
                return

            change_keys = ", ".join(sorted(changes.keys())) if isinstance(changes, dict) and changes else "dates/purpose"
            admin_ids = await _get_admin_user_ids(entity_id)
            for admin_id in admin_ids:
                await send_in_app(
                    db,
                    user_id=admin_id,
                    entity_id=eid,
                    title="Revue transport requise",
                    body=(
                        f"L'AdS {reference or ads_id} a été modifiée en cours de vie. "
                        f"Manifestes concernés: {', '.join(manifest_ids)}. "
                        f"Champs modifiés: {change_keys}. "
                        f"Motif: {reason or 'non renseigné'}."
                    ),
                    category="travelwiz",
                    link="/travelwiz",
                )

            await db.commit()
            logger.info(
                "ads.stay_change_requested → %d TravelWiz manifests impacted for AdS %s",
                len(manifest_ids),
                ads_id,
            )
    except Exception:
        logger.exception("Error in on_ads_stay_change_requested for %s", ads_id)


async def on_avm_modified(event: OpsFluxEvent) -> None:
    """Notify TravelWiz operators when an AVM with generated AdS changes."""
    payload = event.payload
    avm_id = payload.get("avm_id")
    entity_id = payload.get("entity_id")
    reference = payload.get("reference", "")
    reason = payload.get("reason", "")
    changes = payload.get("changes") or {}

    if not avm_id or not entity_id:
        return

    try:
        from sqlalchemy import select
        from app.core.notifications import send_in_app
        from app.event_handlers.core_handlers import _get_admin_user_ids
        from app.models.paxlog import MissionProgram

        eid = UUID(str(entity_id))
        aid = UUID(str(avm_id))

        async with async_session_factory() as db:
            program_result = await db.execute(
                select(MissionProgram.generated_ads_id)
                .where(
                    MissionProgram.mission_notice_id == aid,
                    MissionProgram.generated_ads_id.is_not(None),
                )
            )
            generated_ads_ids = sorted({str(row[0]) for row in program_result.all() if row[0]})
            if not generated_ads_ids:
                logger.info("paxlog.mission_notice.modified → no generated AdS for AVM %s", avm_id)
                return

            change_keys = ", ".join(sorted(changes.keys())) if isinstance(changes, dict) and changes else "planning"
            admin_ids = await _get_admin_user_ids(entity_id)
            for admin_id in admin_ids:
                await send_in_app(
                    db,
                    user_id=admin_id,
                    entity_id=eid,
                    title="Revue transport AVM requise",
                    body=(
                        f"L'AVM {reference or avm_id} a été modifiée. "
                        f"AdS générées concernées: {', '.join(generated_ads_ids)}. "
                        f"Champs modifiés: {change_keys}. "
                        f"Motif: {reason or 'non renseigné'}."
                    ),
                    category="travelwiz",
                    link="/travelwiz",
                )

            await db.commit()
            logger.info(
                "paxlog.mission_notice.modified → %d generated AdS impacted for AVM %s",
                len(generated_ads_ids),
                avm_id,
            )
    except Exception:
        logger.exception("Error in on_avm_modified for %s", avm_id)


# ═══════════════════════════════════════════════════════════════════════════
# Registration
# ═══════════════════════════════════════════════════════════════════════════


def register_travelwiz_handlers(event_bus: EventBus) -> None:
    """Register all TravelWiz event handlers."""
    # TravelWiz lifecycle
    event_bus.subscribe("travelwiz.voyage.confirmed", on_voyage_confirmed)
    event_bus.subscribe("travelwiz.voyage.delayed", on_voyage_delayed)
    event_bus.subscribe("travelwiz.manifest.validated", on_manifest_validated)

    # PaxLog → TravelWiz (AdS approved → add PAX to manifests)
    event_bus.subscribe("paxlog.ads.approved", on_ads_approved)
    event_bus.subscribe("ads.stay_change_requested", on_ads_stay_change_requested)
    event_bus.subscribe("paxlog.mission_notice.modified", on_avm_modified)

    # Planner → TravelWiz (activity changes → manifests requires_review)
    event_bus.subscribe("planner.activity.modified", on_planner_activity_modified_tw)
    event_bus.subscribe("planner.activity.cancelled", on_planner_activity_modified_tw)

    logger.info("TravelWiz event handlers registered (lifecycle + inter-module)")
