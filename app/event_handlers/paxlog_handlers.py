"""Event handlers for PaxLog module — ADS workflow notifications.

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
from app.core.event_contracts import (
    PROJECT_STATUS_CHANGED_SUBSCRIPTIONS,
    WORKFLOW_TRANSITION_EVENT,
    subscribe_with_aliases,
)
from app.core.events import EventBus, OpsFluxEvent

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


async def _get_user_ids_for_role(role_code: str, entity_id: UUID, db) -> list[UUID]:
    from sqlalchemy import text

    result = await db.execute(
        text(
            "SELECT DISTINCT ugm.user_id "
            "FROM user_group_members ugm "
            "JOIN user_groups ug ON ug.id = ugm.group_id "
            "JOIN user_group_roles ugr ON ugr.group_id = ug.id "
            "WHERE ug.entity_id = :entity_id "
            "AND ugr.role_code = :role_code"
        ),
        {"entity_id": str(entity_id), "role_code": role_code},
    )
    return [UUID(str(row[0])) for row in result.all() if row[0]]


def _ads_workflow_step_label(state: str) -> str | None:
    labels = {
        "pending_initiator_review": "Validation initiateur",
        "pending_project_review": "Validation chef de projet",
        "pending_compliance": "Validation HSE",
        "pending_validation": "Validation finale CDS",
    }
    return labels.get(state)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_ads_submitted
# When an AdS is submitted — notify requester (confirmation) + validators
# ═══════════════════════════════════════════════════════════════════════════


async def on_ads_submitted(event: OpsFluxEvent) -> None:
    """When AdS is submitted — confirm to requester, notify validators via in-app + email."""
    payload = event.payload
    ads_id = payload.get("ads_id")
    entity_id = payload.get("entity_id")
    reference = payload.get("reference", "")
    requester_id = payload.get("requester_id")
    site_name = payload.get("site_name", "")
    start_date = payload.get("start_date", "")
    end_date = payload.get("end_date", "")
    pax_count = payload.get("pax_count", 0)

    if not entity_id or not requester_id:
        return

    try:
        from app.core.email_templates import render_and_send_email
        from app.core.notifications import send_in_app
        from app.event_handlers.core_handlers import _get_admin_user_ids

        eid = UUID(str(entity_id))
        uid = UUID(str(requester_id))

        async with async_session_factory() as db:
            # 1. Confirm to requester — in-app
            await send_in_app(
                db,
                user_id=uid,
                entity_id=eid,
                title="AdS soumise",
                body=f"Votre AdS {reference} a été soumise pour validation.",
                category="paxlog",
                link=f"/paxlog/ads/{ads_id}",
                event_type="ads.submitted",
            )

            # 1b. Confirm to requester — email
            email, name = await _get_user_email_and_name(uid, db)
            if email:
                await render_and_send_email(
                    db,
                    slug="ads.submitted",
                    entity_id=eid,
                    language="fr",
                    to=email,
                    variables={
                        "reference": reference,
                        "ads_id": str(ads_id),
                        "pax_count": str(pax_count),
                        "site_name": site_name,
                        "start_date": str(start_date),
                        "end_date": str(end_date),
                        "user": {"first_name": name},
                    },
                )

            # 2. Notify validators (admins) — in-app
            admin_ids = await _get_admin_user_ids(entity_id)
            for admin_id in admin_ids:
                if str(admin_id) == str(requester_id):
                    continue
                await send_in_app(
                    db,
                    user_id=admin_id,
                    entity_id=eid,
                    title="Nouvelle AdS à valider",
                    body=f"L'AdS {reference} ({pax_count} PAX) a été soumise pour validation.",
                    category="paxlog",
                    link=f"/paxlog/ads/{ads_id}",
                    event_type="ads.submitted",
                )

            await db.commit()

        logger.info("ads.submitted handled: %s (%s)", reference, ads_id)
    except Exception:
        logger.exception("Error in on_ads_submitted for %s", ads_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_ads_rejected
# When an AdS is rejected — notify requester with rejection reason
# ═══════════════════════════════════════════════════════════════════════════


async def on_ads_rejected(event: OpsFluxEvent) -> None:
    """When AdS is rejected — notify requester with reason via in-app + email."""
    payload = event.payload
    ads_id = payload.get("ads_id")
    entity_id = payload.get("entity_id")
    reference = payload.get("reference", "")
    requester_id = payload.get("requester_id")
    rejection_reason = payload.get("rejection_reason", "")

    if not entity_id or not requester_id:
        return

    try:
        from app.core.email_templates import render_and_send_email
        from app.core.notifications import send_in_app

        eid = UUID(str(entity_id))
        uid = UUID(str(requester_id))

        async with async_session_factory() as db:
            # In-app notification
            body_text = f"Votre AdS {reference} a été rejetée."
            if rejection_reason:
                body_text += f"\nMotif : {rejection_reason}"

            await send_in_app(
                db,
                user_id=uid,
                entity_id=eid,
                title="AdS rejetée",
                body=body_text,
                category="paxlog",
                link=f"/paxlog/ads/{ads_id}",
                event_type="ads.rejected",
            )

            # Email via configurable template
            email, name = await _get_user_email_and_name(uid, db)
            if email:
                await render_and_send_email(
                    db,
                    slug="ads.rejected",
                    entity_id=eid,
                    language="fr",
                    to=email,
                    variables={
                        "reference": reference,
                        "ads_id": str(ads_id),
                        "rejection_reason": rejection_reason,
                        "user": {"first_name": name},
                    },
                )

            await db.commit()

        logger.info("ads.rejected handled: %s (%s)", reference, ads_id)
    except Exception:
        logger.exception("Error in on_ads_rejected for %s", ads_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_ads_compliance_failed
# When compliance check detects issues — notify requester
# ═══════════════════════════════════════════════════════════════════════════


async def on_ads_compliance_failed(event: OpsFluxEvent) -> None:
    """When AdS compliance check fails — notify requester about blocked PAX via in-app + email."""
    payload = event.payload
    ads_id = payload.get("ads_id")
    entity_id = payload.get("entity_id")
    reference = payload.get("reference", "")
    requester_id = payload.get("requester_id")
    blocked_pax_count = payload.get("blocked_pax_count", 0)
    total_pax_count = payload.get("total_pax_count", 0)
    issues_summary = payload.get("issues_summary", "")

    if not entity_id or not requester_id:
        return

    try:
        from app.core.email_templates import render_and_send_email
        from app.core.notifications import send_in_app

        eid = UUID(str(entity_id))
        uid = UUID(str(requester_id))

        async with async_session_factory() as db:
            # In-app notification
            await send_in_app(
                db,
                user_id=uid,
                entity_id=eid,
                title="AdS — Non-conformités détectées",
                body=(
                    f"L'AdS {reference} présente des non-conformités : "
                    f"{blocked_pax_count}/{total_pax_count} PAX bloqués. "
                    f"Veuillez régulariser les documents."
                ),
                category="paxlog",
                link=f"/paxlog/ads/{ads_id}",
                event_type="ads.compliance_failed",
            )

            # Email via configurable template
            email, name = await _get_user_email_and_name(uid, db)
            if email:
                await render_and_send_email(
                    db,
                    slug="ads.compliance_failed",
                    entity_id=eid,
                    language="fr",
                    to=email,
                    variables={
                        "reference": reference,
                        "ads_id": str(ads_id),
                        "issues_summary": issues_summary,
                        "blocked_pax_count": str(blocked_pax_count),
                        "total_pax_count": str(total_pax_count),
                        "user": {"first_name": name},
                    },
                )

            await db.commit()

        logger.info("ads.compliance_failed handled: %s (%s)", reference, ads_id)
    except Exception:
        logger.exception("Error in on_ads_compliance_failed for %s", ads_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_ads_cancelled
# When an AdS is cancelled — notify requester + affected PAX
# ═══════════════════════════════════════════════════════════════════════════


async def on_ads_cancelled(event: OpsFluxEvent) -> None:
    """When AdS is cancelled — notify requester + affected PAX via in-app + email."""
    payload = event.payload
    ads_id = payload.get("ads_id")
    entity_id = payload.get("entity_id")
    reference = payload.get("reference", "")
    requester_id = payload.get("requester_id")
    site_name = payload.get("site_name", "")
    start_date = payload.get("start_date", "")
    end_date = payload.get("end_date", "")

    if not entity_id or not requester_id:
        return

    try:
        from app.core.email_templates import render_and_send_email
        from app.core.notifications import send_in_app

        eid = UUID(str(entity_id))
        uid = UUID(str(requester_id))

        async with async_session_factory() as db:
            # Notify requester — in-app
            await send_in_app(
                db,
                user_id=uid,
                entity_id=eid,
                title="AdS annulée",
                body=f"L'AdS {reference} a été annulée.",
                category="paxlog",
                link=f"/paxlog/ads/{ads_id}",
                event_type="ads.cancelled",
            )

            # Notify requester — email
            email, name = await _get_user_email_and_name(uid, db)
            if email:
                await render_and_send_email(
                    db,
                    slug="ads.cancelled",
                    entity_id=eid,
                    language="fr",
                    to=email,
                    variables={
                        "reference": reference,
                        "ads_id": str(ads_id),
                        "site_name": site_name,
                        "start_date": str(start_date),
                        "end_date": str(end_date),
                        "user": {"first_name": name},
                    },
                )

            await db.commit()

        logger.info("ads.cancelled handled: %s (%s)", reference, ads_id)
    except Exception:
        logger.exception("Error in on_ads_cancelled for %s", ads_id)


async def on_ads_workflow_validation_required(event: OpsFluxEvent) -> None:
    """Notify the current assignee when an AdS enters a validation step."""
    payload = event.payload or {}
    if payload.get("entity_type") != "ads":
        return

    ads_id = payload.get("entity_id")
    entity_scope_id = payload.get("entity_scope_id")
    to_state = payload.get("to_state")
    reference = payload.get("reference", "")
    assigned_to = payload.get("assigned_to")
    assigned_role_code = payload.get("assigned_role_code")
    actor_id = payload.get("actor_id")

    workflow_step = _ads_workflow_step_label(str(to_state))
    if not ads_id or not entity_scope_id or not workflow_step:
        return

    try:
        from app.core.email_templates import render_and_send_email
        from app.core.notifications import send_in_app

        eid = UUID(str(entity_scope_id))
        recipients: list[UUID] = []

        async with async_session_factory() as db:
            if assigned_to:
                recipients = [UUID(str(assigned_to))]
            elif assigned_role_code:
                recipients = await _get_user_ids_for_role(str(assigned_role_code), eid, db)

            unique_recipients = [uid for uid in dict.fromkeys(recipients) if str(uid) != str(actor_id)]
            for uid in unique_recipients:
                await send_in_app(
                    db,
                    user_id=uid,
                    entity_id=eid,
                    title="Validation AdS requise",
                    body=f"L'AdS {reference} est en attente de votre validation ({workflow_step}).",
                    category="paxlog",
                    link=f"/paxlog/ads/{ads_id}",
                )
                email, name = await _get_user_email_and_name(uid, db)
                if email:
                    await render_and_send_email(
                        db,
                        slug="workflow.validation_required",
                        entity_id=eid,
                        language="fr",
                        to=email,
                        variables={
                            "document_number": reference,
                            "document_title": f"AdS {reference}",
                            "document_id": str(ads_id),
                            "workflow_step": workflow_step,
                            "user": {"first_name": name},
                        },
                    )

            await db.commit()
    except Exception:
        logger.exception("Error in on_ads_workflow_validation_required for ads %s", ads_id)


# ═══════════════════════════════════════════════════════════════════════════
# Registration
# ═══════════════════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_planner_activity_modified
# Planner → PaxLog: put linked AdS in requires_review status
# ═══════════════════════════════════════════════════════════════════════════


async def on_planner_activity_modified(event: OpsFluxEvent) -> None:
    """When a Planner activity is modified — put linked AdS in requires_review."""
    payload = event.payload
    activity_id = payload.get("activity_id")
    entity_id = payload.get("entity_id")
    title = payload.get("title", "")
    changes = payload.get("changes") or {}

    if not activity_id or not entity_id:
        return

    try:
        from sqlalchemy import text

        from app.models.paxlog import AdsEvent

        async with async_session_factory() as db:
            result = await db.execute(
                text(
                    "UPDATE ads SET status = 'requires_review', "
                    "updated_at = NOW() "
                    "WHERE planner_activity_id = :aid "
                    "AND status IN ('approved', 'in_progress') "
                    "RETURNING id, reference, requester_id"
                ),
                {"aid": activity_id},
            )
            affected = result.all()

            for row in affected:
                ads_id, ref, requester_id = row
                from app.core.notifications import send_in_app

                db.add(
                    AdsEvent(
                        entity_id=UUID(str(entity_id)),
                        ads_id=UUID(str(ads_id)),
                        event_type="planner_activity_modified_requires_review",
                        new_status="requires_review",
                        reason=title or None,
                        metadata_json={
                            "planner_activity_id": str(activity_id),
                            "planner_activity_title": title or None,
                            "changes": changes if isinstance(changes, dict) else {},
                        },
                    )
                )

                await send_in_app(
                    db,
                    user_id=UUID(str(requester_id)),
                    entity_id=UUID(str(entity_id)),
                    title="AdS en révision",
                    body=(
                        f"L'AdS {ref} nécessite une révision suite à la modification de l'activité Planner associée."
                    ),
                    category="paxlog",
                    link=f"/paxlog/ads/{ads_id}",
                )

            await db.commit()
            logger.info(
                "planner.activity.modified → %d AdS set to requires_review",
                len(affected),
            )
    except Exception:
        logger.exception("Error in on_planner_activity_modified for %s", activity_id)


async def on_planner_activity_cancelled(event: OpsFluxEvent) -> None:
    """When Planner activity cancelled — linked AdS → requires_review, notify PAX."""
    payload = event.payload
    activity_id = payload.get("activity_id")
    entity_id = payload.get("entity_id")
    title = payload.get("title", "")

    if not activity_id or not entity_id:
        return

    try:
        from sqlalchemy import text

        from app.models.paxlog import AdsEvent

        async with async_session_factory() as db:
            result = await db.execute(
                text(
                    "UPDATE ads SET status = 'requires_review', "
                    "updated_at = NOW() "
                    "WHERE planner_activity_id = :aid "
                    "AND status NOT IN ('completed', 'cancelled', 'rejected') "
                    "RETURNING id, reference, requester_id"
                ),
                {"aid": activity_id},
            )
            affected = result.all()

            for row in affected:
                ads_id, ref, requester_id = row
                from app.core.notifications import send_in_app

                db.add(
                    AdsEvent(
                        entity_id=UUID(str(entity_id)),
                        ads_id=UUID(str(ads_id)),
                        event_type="planner_activity_cancelled",
                        new_status="requires_review",
                        reason=title or None,
                        metadata_json={
                            "planner_activity_id": str(activity_id),
                            "planner_activity_title": title or None,
                        },
                    )
                )

                await send_in_app(
                    db,
                    user_id=UUID(str(requester_id)),
                    entity_id=UUID(str(entity_id)),
                    title="AdS — Activité Planner annulée",
                    body=(
                        f"L'activité « {title} » associée à l'AdS {ref} a été annulée. Veuillez vérifier cette demande."
                    ),
                    category="paxlog",
                    link=f"/paxlog/ads/{ads_id}",
                )

            await db.commit()
            logger.info(
                "planner.activity.cancelled → %d AdS set to requires_review",
                len(affected),
            )
    except Exception:
        logger.exception("Error in on_planner_activity_cancelled for %s", activity_id)


async def on_planner_activity_modified_avm(event: OpsFluxEvent) -> None:
    """Notify AVM creators when Planner changes impact generated AdS in their mission."""
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

        async with async_session_factory() as db:
            result = await db.execute(
                text(
                    "SELECT DISTINCT mn.id, mn.reference, mn.created_by "
                    "FROM ads a "
                    "JOIN mission_programs mp ON mp.generated_ads_id = a.id "
                    "JOIN mission_notices mn ON mn.id = mp.mission_notice_id "
                    "WHERE a.planner_activity_id = :aid "
                    "AND mn.entity_id = :eid"
                ),
                {"aid": activity_id, "eid": str(entity_id)},
            )
            affected = result.all()
            if not affected:
                return

            change_keys = ", ".join(sorted(changes.keys())) if isinstance(changes, dict) and changes else "planning"
            for avm_id, avm_ref, created_by in affected:
                await send_in_app(
                    db,
                    user_id=UUID(str(created_by)),
                    entity_id=UUID(str(entity_id)),
                    title="AVM impactée par Planner",
                    body=(
                        f"L'activité Planner « {title or activity_id} » a évolué. "
                        f"L'AVM {avm_ref} contient des AdS générées désormais à revoir. "
                        f"Champs impactés: {change_keys}."
                    ),
                    category="paxlog",
                    link=f"/paxlog/avm/{avm_id}",
                )

            await db.commit()
            logger.info(
                "planner.activity.modified/cancelled → %d AVM creators notified",
                len(affected),
            )
    except Exception:
        logger.exception("Error in on_planner_activity_modified_avm for %s", activity_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_travelwiz_manifest_closed
# TravelWiz → PaxLog: update PAX boarding status
# ═══════════════════════════════════════════════════════════════════════════


async def on_travelwiz_manifest_closed(event: OpsFluxEvent) -> None:
    """When TravelWiz closes a manifest — update PAX boarding status in PaxLog."""
    payload = event.payload
    manifest_id = payload.get("manifest_id")
    entity_id = payload.get("entity_id")
    destination_asset_id = payload.get("destination_asset_id")

    if not manifest_id or not entity_id:
        return

    try:
        from sqlalchemy import text

        async with async_session_factory() as db:
            # Update ads_pax where manifest entries are boarded
            await db.execute(
                text(
                    "UPDATE ads_pax ap SET current_onboard = TRUE, "
                    "disembark_asset_id = :dest "
                    "FROM pax_manifest_entries pme "
                    "WHERE pme.ads_pax_id = ap.id "
                    "AND pme.manifest_id = :mid "
                    "AND pme.status = 'boarded' "
                    "AND ap.current_onboard = FALSE"
                ),
                {"mid": str(manifest_id), "dest": str(destination_asset_id) if destination_asset_id else None},
            )
            await db.commit()
            logger.info("travelwiz.manifest.closed → ads_pax boarding updated for %s", manifest_id)
    except Exception:
        logger.exception("Error in on_travelwiz_manifest_closed for %s", manifest_id)


async def on_travelwiz_voyage_cancelled(event: OpsFluxEvent) -> None:
    """When a TravelWiz voyage is cancelled — linked AdS go back to requires_review."""
    payload = event.payload
    entity_id = payload.get("entity_id")
    voyage_id = payload.get("voyage_id")
    code = payload.get("code", "")

    if not entity_id or not voyage_id:
        return

    try:
        from sqlalchemy import text

        from app.models.paxlog import AdsEvent

        async with async_session_factory() as db:
            result = await db.execute(
                text(
                    "UPDATE ads a SET status = 'requires_review', updated_at = NOW() "
                    "WHERE a.status NOT IN ('completed', 'cancelled', 'rejected') "
                    "AND EXISTS ("
                    "  SELECT 1 "
                    "  FROM ads_pax ap "
                    "  JOIN manifest_passengers mp ON mp.ads_pax_id = ap.id "
                    "  JOIN voyage_manifests vm ON vm.id = mp.manifest_id "
                    "  WHERE ap.ads_id = a.id "
                    "    AND vm.voyage_id = :voyage_id"
                    ") "
                    "RETURNING a.id, a.reference, a.requester_id"
                ),
                {"voyage_id": voyage_id},
            )
            affected = result.all()

            for ads_id, reference, requester_id in affected:
                from app.core.notifications import send_in_app

                db.add(
                    AdsEvent(
                        entity_id=UUID(str(entity_id)),
                        ads_id=UUID(str(ads_id)),
                        event_type="travelwiz_voyage_cancelled",
                        new_status="requires_review",
                        reason=code or None,
                        metadata_json={
                            "voyage_id": str(voyage_id),
                            "voyage_code": code or None,
                        },
                    )
                )
                await send_in_app(
                    db,
                    user_id=UUID(str(requester_id)),
                    entity_id=UUID(str(entity_id)),
                    title="AdS — Voyage annulé",
                    body=(
                        f"Le voyage {code or voyage_id} lié à l'AdS {reference} a été annulé. "
                        f"Veuillez vérifier cette demande."
                    ),
                    category="paxlog",
                    link=f"/paxlog/ads/{ads_id}",
                )

            await db.commit()
            logger.info(
                "travelwiz.voyage.cancelled → %d AdS set to requires_review",
                len(affected),
            )
    except Exception:
        logger.exception("Error in on_travelwiz_voyage_cancelled for %s", voyage_id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler: on_project_status_changed
# Projets → PaxLog: warn linked AdS when project cancelled/completed
# ═══════════════════════════════════════════════════════════════════════════


async def on_project_status_changed(event: OpsFluxEvent) -> None:
    """When project cancelled/completed — add warnings to linked AdS."""
    payload = event.payload
    project_id = payload.get("project_id")
    project_code = payload.get("project_code", "")
    new_status = payload.get("new_status")
    entity_id = payload.get("entity_id")

    if new_status not in ("cancelled", "completed"):
        return
    if not project_id or not entity_id:
        return

    try:
        from sqlalchemy import text

        async with async_session_factory() as db:
            result = await db.execute(
                text(
                    "SELECT DISTINCT a.id AS ads_id, a.reference, a.requester_id "
                    "FROM ads a "
                    "LEFT JOIN cost_imputations ci "
                    "ON ci.owner_type = 'ads' "
                    "AND ci.owner_id = a.id "
                    "AND ci.project_id = :pid "
                    "WHERE (a.project_id = :pid OR ci.project_id = :pid) "
                    "AND a.status NOT IN ('completed', 'cancelled', 'rejected')"
                ),
                {"pid": str(project_id)},
            )
            affected = result.all()

            for row in affected:
                ads_id, ref, requester_id = row
                from app.core.notifications import send_in_app

                status_fr = "annulé" if new_status == "cancelled" else "terminé"
                await send_in_app(
                    db,
                    user_id=UUID(str(requester_id)),
                    entity_id=UUID(str(entity_id)),
                    title=f"Projet {project_code} {status_fr}",
                    body=(
                        f"Le projet {project_code} associé à l'AdS {ref} "
                        f"a été {status_fr}. Vérifiez la pertinence de la demande."
                    ),
                    category="paxlog",
                    link=f"/paxlog/ads/{ads_id}",
                )

            await db.commit()
            logger.info(
                "project.status.changed → %d AdS warned (project %s)",
                len(affected),
                project_code,
            )
    except Exception:
        logger.exception("Error in on_project_status_changed for project %s", project_id)


# ═══════════════════════════════════════════════════════════════════════════
# Registration
# ═══════════════════════════════════════════════════════════════════════════


def register_paxlog_handlers(event_bus: EventBus) -> None:
    """Register all PaxLog event handlers."""
    # AdS lifecycle
    event_bus.subscribe("ads.submitted", on_ads_submitted)
    event_bus.subscribe("ads.rejected", on_ads_rejected)
    event_bus.subscribe("ads.compliance_failed", on_ads_compliance_failed)
    event_bus.subscribe("ads.cancelled", on_ads_cancelled)
    event_bus.subscribe(WORKFLOW_TRANSITION_EVENT, on_ads_workflow_validation_required)

    # Planner → PaxLog (activity changes affect AdS)
    event_bus.subscribe("planner.activity.modified", on_planner_activity_modified)
    event_bus.subscribe("planner.activity.cancelled", on_planner_activity_cancelled)
    event_bus.subscribe("planner.activity.modified", on_planner_activity_modified_avm)
    event_bus.subscribe("planner.activity.cancelled", on_planner_activity_modified_avm)

    # TravelWiz → PaxLog (manifest closure updates boarding)
    event_bus.subscribe("travelwiz.manifest.closed", on_travelwiz_manifest_closed)
    event_bus.subscribe("travelwiz.voyage.cancelled", on_travelwiz_voyage_cancelled)

    # Projets → PaxLog (project lifecycle affects AdS)
    subscribe_with_aliases(event_bus, PROJECT_STATUS_CHANGED_SUBSCRIPTIONS, on_project_status_changed)

    logger.info("PaxLog event handlers registered (lifecycle + inter-module)")
