"""Event handlers for Papyrus and PID/PFD modules.

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


# ═══════════════════════════════════════════════════════════════════════════
# Helper: resolve user email from user_id
# ═══════════════════════════════════════════════════════════════════════════


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
# Papyrus: document.submitted
# ═══════════════════════════════════════════════════════════════════════════


async def on_document_submitted(event: OpsFluxEvent) -> None:
    """When a document is submitted for review — notify reviewers via in-app + email template."""
    payload = event.payload
    document_id = payload.get("document_id")
    entity_id = payload.get("entity_id")
    title = payload.get("title", "")
    number = payload.get("number", "")
    submitted_by = payload.get("submitted_by")
    comment = payload.get("comment")

    if not entity_id:
        return

    try:
        from app.core.notifications import send_in_app
        from app.core.email_templates import render_and_send_email
        from app.event_handlers.core_handlers import _get_admin_user_ids

        admin_ids = await _get_admin_user_ids(entity_id)
        eid = UUID(str(entity_id))

        async with async_session_factory() as db:
            for admin_id in admin_ids:
                if str(admin_id) == str(submitted_by):
                    continue

                # In-app notification
                await send_in_app(
                    db,
                    user_id=admin_id,
                    entity_id=eid,
                    title="Document soumis pour validation",
                    body=f"Le document {number} «{title}» a été soumis pour validation.",
                    category="papyrus",
                    link=f"/documents/{document_id}",
                    event_type="document.submitted",
                )

                # Email via configurable Email Template system
                email, name = await _get_user_email_and_name(admin_id, db)
                if email:
                    await render_and_send_email(
                        db,
                        slug="workflow.validation_required",
                        entity_id=eid,
                        language="fr",
                        to=email,
                        variables={
                            "document_number": number,
                            "document_title": title,
                            "document_id": str(document_id),
                            "workflow_step": "Soumission",
                            "comment": comment or "",
                            "user": {"first_name": name},
                        },
                    )

            await db.commit()

        logger.info("document.submitted handled: %s (%s)", number, document_id)
    except Exception:
        logger.exception("Error in on_document_submitted for %s", document_id)


# ═══════════════════════════════════════════════════════════════════════════
# Papyrus: document.approved
# ═══════════════════════════════════════════════════════════════════════════


async def on_document_approved(event: OpsFluxEvent) -> None:
    """When a document is approved — notify the author via in-app + email template."""
    payload = event.payload
    document_id = payload.get("document_id")
    entity_id = payload.get("entity_id")
    title = payload.get("title", "")
    number = payload.get("number", "")
    created_by = payload.get("created_by")
    approved_by = payload.get("approved_by")

    if not entity_id or not created_by:
        return

    try:
        from app.core.notifications import send_in_app
        from app.core.email_templates import render_and_send_email

        eid = UUID(str(entity_id))

        if str(created_by) != str(approved_by):
            async with async_session_factory() as db:
                uid = UUID(str(created_by))

                # In-app notification
                await send_in_app(
                    db,
                    user_id=uid,
                    entity_id=eid,
                    title="Document approuvé",
                    body=f"Le document {number} «{title}» a été approuvé.",
                    category="papyrus",
                    link=f"/documents/{document_id}",
                    event_type="document.approved",
                )

                # Email via configurable template
                email, name = await _get_user_email_and_name(uid, db)
                if email:
                    await render_and_send_email(
                        db,
                        slug="workflow.approved",
                        entity_id=eid,
                        language="fr",
                        to=email,
                        variables={
                            "document_number": number,
                            "document_title": title,
                            "document_id": str(document_id),
                            "user": {"first_name": name},
                        },
                    )

                await db.commit()

        logger.info("document.approved handled: %s (%s)", number, document_id)
    except Exception:
        logger.exception("Error in on_document_approved for %s", document_id)


# ═══════════════════════════════════════════════════════════════════════════
# Papyrus: document.rejected
# ═══════════════════════════════════════════════════════════════════════════


async def on_document_rejected(event: OpsFluxEvent) -> None:
    """When a document is rejected — notify the author with reason via in-app + email template."""
    payload = event.payload
    document_id = payload.get("document_id")
    entity_id = payload.get("entity_id")
    title = payload.get("title", "")
    number = payload.get("number", "")
    created_by = payload.get("created_by")
    reason = payload.get("reason", "")

    if not entity_id or not created_by:
        return

    try:
        from app.core.notifications import send_in_app
        from app.core.email_templates import render_and_send_email

        eid = UUID(str(entity_id))
        uid = UUID(str(created_by))

        async with async_session_factory() as db:
            body_text = f"Le document {number} «{title}» a été rejeté."
            if reason:
                body_text += f"\nMotif: {reason}"

            # In-app notification
            await send_in_app(
                db,
                user_id=uid,
                entity_id=eid,
                title="Document rejeté",
                body=body_text,
                category="papyrus",
                link=f"/documents/{document_id}",
                event_type="document.rejected",
            )

            # Email via configurable template
            email, name = await _get_user_email_and_name(uid, db)
            if email:
                await render_and_send_email(
                    db,
                    slug="workflow.rejected",
                    entity_id=eid,
                    language="fr",
                    to=email,
                    variables={
                        "document_number": number,
                        "document_title": title,
                        "document_id": str(document_id),
                        "rejection_reason": reason,
                        "user": {"first_name": name},
                    },
                )

            await db.commit()

        logger.info("document.rejected handled: %s (%s)", number, document_id)
    except Exception:
        logger.exception("Error in on_document_rejected for %s", document_id)


# ═══════════════════════════════════════════════════════════════════════════
# Papyrus: document.published
# ═══════════════════════════════════════════════════════════════════════════


async def on_document_published(event: OpsFluxEvent) -> None:
    """When a document is published — distribute via in-app + email template system."""
    payload = event.payload
    document_id = payload.get("document_id")
    entity_id = payload.get("entity_id")
    title = payload.get("title", "")
    number = payload.get("number", "")
    distribution_list_ids = payload.get("distribution_list_ids", [])

    if not entity_id:
        return

    try:
        from sqlalchemy import select
        from app.models.papyrus_document import DistributionList
        from app.core.notifications import send_in_app
        from app.core.email_templates import render_and_send_email

        eid = UUID(str(entity_id))

        async with async_session_factory() as db:
            all_recipients: list[dict] = []

            if distribution_list_ids:
                for dl_id in distribution_list_ids:
                    result = await db.execute(
                        select(DistributionList).where(
                            DistributionList.id == UUID(str(dl_id)),
                            DistributionList.entity_id == eid,
                            DistributionList.is_active == True,  # noqa: E712
                        )
                    )
                    dl = result.scalar_one_or_none()
                    if dl and dl.recipients:
                        all_recipients.extend(dl.recipients)

            # In-app notifications to internal recipients
            notified_user_ids: set[str] = set()
            for recipient in all_recipients:
                user_id = recipient.get("user_id")
                if user_id and user_id not in notified_user_ids:
                    try:
                        await send_in_app(
                            db,
                            user_id=UUID(user_id),
                            entity_id=eid,
                            title="Nouveau document publié",
                            body=f"Le document {number} «{title}» a été publié.",
                            category="papyrus",
                            link=f"/documents/{document_id}",
                            event_type="document.published",
                        )
                        notified_user_ids.add(user_id)
                    except Exception:
                        logger.exception("Failed to notify user %s", user_id)

            # Email notifications via configurable Email Template system
            emailed: set[str] = set()
            for recipient in all_recipients:
                email = recipient.get("email")
                if not email or email in emailed:
                    continue
                try:
                    await render_and_send_email(
                        db,
                        slug="document.published",
                        entity_id=eid,
                        language="fr",
                        to=email,
                        variables={
                            "document_number": number,
                            "document_title": title,
                            "document_id": str(document_id),
                            "role": recipient.get("role", "cc"),
                        },
                    )
                    emailed.add(email)
                except Exception:
                    logger.exception("Failed to send email to %s", email)

            await db.commit()

        logger.info(
            "document.published handled: %s — %d in-app, %d emails, %d dist lists",
            number, len(notified_user_ids), len(emailed), len(distribution_list_ids),
        )
    except Exception:
        logger.exception("Error in on_document_published for %s", document_id)


# ═══════════════════════════════════════════════════════════════════════════
# PID/PFD: pid.equipment.synced
# ═══════════════════════════════════════════════════════════════════════════


async def on_pid_equipment_synced(event: OpsFluxEvent) -> None:
    """When PID XML→DB sync completes — log equipment changes for audit."""
    payload = event.payload
    pid_id = payload.get("pid_id")
    pid_number = payload.get("pid_number", "?")
    stats = payload.get("stats", {})

    logger.info(
        "pid.equipment.synced: PID %s (%s) — %d equipment, %d lines, %d connections",
        pid_number, pid_id,
        stats.get("equipment", 0),
        stats.get("lines", 0),
        stats.get("connections", 0),
    )


# ═══════════════════════════════════════════════════════════════════════════
# PID/PFD: pid.afc.validated
# ═══════════════════════════════════════════════════════════════════════════


async def on_pid_afc_validated(event: OpsFluxEvent) -> None:
    """When AFC validation completes — notify project team if errors found."""
    payload = event.payload
    pid_id = payload.get("pid_id")
    pid_number = payload.get("pid_number", "?")
    entity_id = payload.get("entity_id")
    is_valid = payload.get("is_valid", True)
    error_count = payload.get("error_count", 0)
    warning_count = payload.get("warning_count", 0)

    if is_valid or not entity_id:
        logger.info("pid.afc.validated: PID %s — PASS", pid_number)
        return

    try:
        from app.core.notifications import send_in_app
        from app.event_handlers.core_handlers import _get_admin_user_ids

        eid = UUID(str(entity_id))
        admin_ids = await _get_admin_user_ids(entity_id)

        async with async_session_factory() as db:
            for admin_id in admin_ids:
                await send_in_app(
                    db,
                    user_id=admin_id,
                    entity_id=eid,
                    title="Validation AFC — Erreurs détectées",
                    body=(
                        f"Le PID {pid_number} n'a pas passé la validation AFC: "
                        f"{error_count} erreur(s), {warning_count} avertissement(s)."
                    ),
                    category="pid_pfd",
                    link=f"/pid/{pid_id}/validate-afc",
                )
            await db.commit()

        logger.info(
            "pid.afc.validated: PID %s — FAIL (%d errors, %d warnings)",
            pid_number, error_count, warning_count,
        )
    except Exception:
        logger.exception("Error in on_pid_afc_validated for PID %s", pid_id)


# ═══════════════════════════════════════════════════════════════════════════
# Registration
# ═══════════════════════════════════════════════════════════════════════════


def register_report_pid_handlers(event_bus: EventBus) -> None:
    """Register all Papyrus and PID/PFD event handlers."""
    # Papyrus events
    event_bus.subscribe("document.submitted", on_document_submitted)
    event_bus.subscribe("document.approved", on_document_approved)
    event_bus.subscribe("document.rejected", on_document_rejected)
    event_bus.subscribe("document.published", on_document_published)
    # PID/PFD events
    event_bus.subscribe("pid.equipment.synced", on_pid_equipment_synced)
    event_bus.subscribe("pid.afc.validated", on_pid_afc_validated)
    logger.info("Papyrus + PID/PFD event handlers registered")

