"""Core event handlers — user, workflow, asset, tier, notification events."""

import json
import logging
from uuid import UUID

from app.core.database import async_session_factory
from app.core.events import EventBus, OpsFluxEvent, event_bus

logger = logging.getLogger(__name__)

# ── Idempotency tracking ────────────────────────────────────────────────────
# Stores processed event IDs in memory to avoid duplicate handling within
# a single process lifetime.  For cross-process idempotency the event_store
# table's processed_at column is checked.

_processed_events: set[str] = set()


async def _is_already_processed(event: OpsFluxEvent) -> bool:
    """Check if this event has already been handled (in-memory + DB)."""
    if event.id in _processed_events:
        return True

    # Check event_store.processed_at for cross-process idempotency
    try:
        from sqlalchemy import text

        async with async_session_factory() as db:
            result = await db.execute(
                text(
                    "SELECT processed_at FROM event_store WHERE id = :id"
                ),
                {"id": event.id},
            )
            row = result.first()
            if row and row.processed_at is not None:
                _processed_events.add(event.id)
                return True
    except Exception:
        logger.debug("Idempotency DB check failed for event %s, proceeding", event.id)

    return False


async def _mark_processed(event: OpsFluxEvent, handler_name: str) -> None:
    """Mark an event as processed in event_store and local cache."""
    _processed_events.add(event.id)
    try:
        from datetime import UTC, datetime

        from sqlalchemy import text

        async with async_session_factory() as db:
            await db.execute(
                text(
                    "UPDATE event_store SET processed_at = :now, handler = :handler "
                    "WHERE id = :id"
                ),
                {
                    "now": datetime.now(UTC),
                    "handler": handler_name,
                    "id": event.id,
                },
            )
            await db.commit()
    except Exception:
        logger.debug("Failed to mark event %s as processed in DB", event.id)


# ── Helper: get admin user IDs for an entity ────────────────────────────────

async def _get_admin_user_ids(entity_id: str | UUID) -> list[UUID]:
    """Return user IDs that have an admin role in the given entity."""
    from sqlalchemy import text

    try:
        async with async_session_factory() as db:
            result = await db.execute(
                text(
                    "SELECT DISTINCT ugm.user_id "
                    "FROM user_group_members ugm "
                    "JOIN user_groups ug ON ug.id = ugm.group_id "
                    "JOIN user_group_roles ugr ON ugr.group_id = ug.id "
                    "WHERE ug.entity_id = :entity_id "
                    "AND ugr.role_code IN ('admin', 'super_admin', 'entity_admin') "
                    "AND ug.active = true"
                ),
                {"entity_id": str(entity_id)},
            )
            return [row.user_id for row in result.fetchall()]
    except Exception:
        logger.exception("Failed to fetch admin user IDs for entity %s", entity_id)
        return []


# ═══════════════════════════════════════════════════════════════════════════
# Handler 1: on_user_created
# ═══════════════════════════════════════════════════════════════════════════

async def on_user_created(event: OpsFluxEvent) -> None:
    """Handle user.created — welcome email, audit log, admin notification."""
    if await _is_already_processed(event):
        logger.debug("Skipping duplicate event %s for on_user_created", event.id)
        return

    payload = event.payload
    user_id = payload.get("user_id")
    user_email = payload.get("email")
    first_name = payload.get("first_name", "")
    last_name = payload.get("last_name", "")
    entity_id = payload.get("entity_id")
    entity_name = payload.get("entity_name", "OpsFlux")
    language = payload.get("language", "fr")

    try:
        # 1. Send welcome email via email_templates
        if user_email and entity_id:
            try:
                from app.core.email_templates import render_and_send_email

                async with async_session_factory() as db:
                    await render_and_send_email(
                        db,
                        slug="welcome",
                        entity_id=UUID(str(entity_id)),
                        language=language,
                        to=user_email,
                        variables={
                            "user": {
                                "first_name": first_name,
                                "last_name": last_name,
                                "email": user_email,
                            },
                            "entity": {"name": entity_name},
                            "login_url": f"{_get_frontend_url()}/login",
                        },
                    )
                logger.info("Welcome email sent to %s", user_email)
            except Exception:
                logger.exception("Failed to send welcome email to %s", user_email)

        # 2. Create audit log entry
        try:
            from app.core.audit import record_audit

            async with async_session_factory() as db:
                await record_audit(
                    db,
                    action="user.created",
                    resource_type="user",
                    resource_id=str(user_id) if user_id else None,
                    entity_id=UUID(str(entity_id)) if entity_id else None,
                    details={
                        "email": user_email,
                        "first_name": first_name,
                        "last_name": last_name,
                    },
                )
                await db.commit()
            logger.info("Audit log created for user.created (user_id=%s)", user_id)
        except Exception:
            logger.exception("Failed to create audit log for user.created")

        # 3. Notify admins in the entity
        if entity_id:
            try:
                from app.core.notifications import send_in_app

                admin_ids = await _get_admin_user_ids(entity_id)
                async with async_session_factory() as db:
                    for admin_id in admin_ids:
                        # Don't notify the user about their own creation
                        if str(admin_id) == str(user_id):
                            continue
                        await send_in_app(
                            db,
                            user_id=admin_id,
                            entity_id=UUID(str(entity_id)),
                            title="Nouvel utilisateur",
                            body=f"{first_name} {last_name} ({user_email}) a rejoint l'entite.",
                            category="info",
                            link=f"/admin/users/{user_id}",
                        )
                    await db.commit()
                logger.info("Admin notifications sent for new user %s", user_id)
            except Exception:
                logger.exception("Failed to notify admins for user.created")

        await _mark_processed(event, "on_user_created")

    except Exception:
        logger.exception("Unhandled error in on_user_created for event %s", event.id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler 2: on_workflow_transition
# ═══════════════════════════════════════════════════════════════════════════

_TERMINAL_STATES = {"approved", "rejected", "completed", "cancelled", "closed"}


async def on_workflow_transition(event: OpsFluxEvent) -> None:
    """Handle workflow.transition — notifications, audit, terminal-state alerts."""
    if await _is_already_processed(event):
        logger.debug("Skipping duplicate event %s for on_workflow_transition", event.id)
        return

    payload = event.payload
    instance_id = payload.get("instance_id")
    from_state = payload.get("from_state")
    to_state = payload.get("to_state")
    actor_id = payload.get("actor_id")
    entity_id = payload.get("entity_id")
    entity_type = payload.get("entity_type", "unknown")
    entity_id_ref = payload.get("entity_id_ref")
    requester_id = payload.get("requester_id")
    next_approver_id = payload.get("next_approver_id")
    workflow_name = payload.get("workflow_name", "Workflow")
    comment = payload.get("comment")

    try:
        # 1. Create audit log entry
        try:
            from app.core.audit import record_audit

            async with async_session_factory() as db:
                await record_audit(
                    db,
                    action="workflow.transition",
                    resource_type="workflow_instance",
                    resource_id=str(instance_id) if instance_id else None,
                    user_id=UUID(str(actor_id)) if actor_id else None,
                    entity_id=UUID(str(entity_id)) if entity_id else None,
                    details={
                        "from_state": from_state,
                        "to_state": to_state,
                        "entity_type": entity_type,
                        "entity_id_ref": entity_id_ref,
                        "comment": comment,
                    },
                )
                await db.commit()
            logger.info(
                "Audit log: workflow transition %s -> %s (instance=%s)",
                from_state, to_state, instance_id,
            )
        except Exception:
            logger.exception("Failed to create audit log for workflow.transition")

        # 2. Notify relevant users (requester, next approver)
        if entity_id:
            from app.core.notifications import send_in_app

            async with async_session_factory() as db:
                # Notify the requester about the state change
                if requester_id and str(requester_id) != str(actor_id):
                    try:
                        await send_in_app(
                            db,
                            user_id=UUID(str(requester_id)),
                            entity_id=UUID(str(entity_id)),
                            title=f"{workflow_name}: {from_state} -> {to_state}",
                            body=f"Votre demande a ete deplacee vers l'etat '{to_state}'.",
                            category="workflow",
                            link=f"/workflows/{instance_id}",
                        )
                    except Exception:
                        logger.exception("Failed to notify requester %s", requester_id)

                # Notify the next approver
                if next_approver_id and str(next_approver_id) != str(actor_id):
                    try:
                        await send_in_app(
                            db,
                            user_id=UUID(str(next_approver_id)),
                            entity_id=UUID(str(entity_id)),
                            title=f"{workflow_name}: action requise",
                            body=f"Une demande attend votre approbation (etat: '{to_state}').",
                            category="workflow",
                            link=f"/workflows/{instance_id}",
                        )
                    except Exception:
                        logger.exception("Failed to notify next approver %s", next_approver_id)

                # 3. If terminal state, notify the creator
                if to_state and to_state.lower() in _TERMINAL_STATES:
                    creator_id = payload.get("creator_id") or requester_id
                    if creator_id and str(creator_id) != str(actor_id):
                        try:
                            status_label = (
                                "approuvee" if to_state.lower() == "approved"
                                else "rejetee" if to_state.lower() == "rejected"
                                else "terminee"
                            )
                            await send_in_app(
                                db,
                                user_id=UUID(str(creator_id)),
                                entity_id=UUID(str(entity_id)),
                                title=f"{workflow_name}: demande {status_label}",
                                body=f"Votre demande a ete {status_label}.",
                                category="workflow",
                                link=f"/workflows/{instance_id}",
                            )
                        except Exception:
                            logger.exception(
                                "Failed to notify creator %s of terminal state", creator_id
                            )

                await db.commit()

        # 4. Execute node-type hooks (notification, system_check, timer)
        to_node_type = payload.get("to_node_type")
        if to_node_type:
            await _execute_node_hooks(
                to_node_type=to_node_type,
                payload=payload,
            )

        await _mark_processed(event, "on_workflow_transition")

    except Exception:
        logger.exception("Unhandled error in on_workflow_transition for event %s", event.id)


async def _execute_node_hooks(
    to_node_type: str,
    payload: dict,
) -> None:
    """Execute hooks when a transition enters a node of a specific type.

    Each node type can trigger side-effects:
      - notification: send in-app + optional email to metadata recipients
      - system_check: emit a "workflow.system_check" event for external validation
      - timer: emit a "workflow.timer_started" event for scheduled follow-up
    """
    instance_id = payload.get("instance_id")
    entity_id = payload.get("entity_id")
    definition_slug = payload.get("definition_slug")
    to_state = payload.get("to_state")
    metadata = payload.get("metadata", {})

    try:
        if to_node_type == "notification":
            # Auto-notify recipients defined in instance metadata
            recipients = metadata.get("notify_users") or []
            if entity_id and recipients:
                from app.core.notifications import send_in_app

                async with async_session_factory() as db:
                    for uid in recipients:
                        try:
                            await send_in_app(
                                db,
                                user_id=UUID(str(uid)),
                                entity_id=UUID(str(entity_id)),
                                title=f"Notification workflow: {definition_slug}",
                                body=f"Le workflow a atteint l'étape '{to_state}'.",
                                category="workflow",
                                link=f"/workflows/{instance_id}",
                            )
                        except Exception:
                            logger.exception(
                                "Node hook notification failed for user %s", uid,
                            )
                    await db.commit()

            logger.info(
                "Node hook [notification]: instance=%s, state=%s, recipients=%d",
                instance_id, to_state, len(recipients),
            )

        elif to_node_type == "system_check":
            # Emit a dedicated event for external systems to validate
            await event_bus.publish(
                OpsFluxEvent(
                    event_type="workflow.system_check",
                    payload={
                        "instance_id": instance_id,
                        "definition_slug": definition_slug,
                        "entity_id": entity_id,
                        "state": to_state,
                        "check_config": metadata.get("system_check_config", {}),
                    },
                )
            )
            logger.info(
                "Node hook [system_check]: emitted event for instance=%s, state=%s",
                instance_id, to_state,
            )

        elif to_node_type == "timer":
            # Emit a timer event — external scheduler can pick this up
            delay_minutes = metadata.get("timer_delay_minutes", 60)
            await event_bus.publish(
                OpsFluxEvent(
                    event_type="workflow.timer_started",
                    payload={
                        "instance_id": instance_id,
                        "definition_slug": definition_slug,
                        "entity_id": entity_id,
                        "state": to_state,
                        "delay_minutes": delay_minutes,
                    },
                )
            )
            logger.info(
                "Node hook [timer]: emitted event for instance=%s, delay=%dmin",
                instance_id, delay_minutes,
            )

    except Exception:
        logger.exception(
            "Node hook execution failed for type=%s, instance=%s",
            to_node_type, instance_id,
        )


# ═══════════════════════════════════════════════════════════════════════════
# Handler 3: on_asset_created
# ═══════════════════════════════════════════════════════════════════════════

async def on_asset_created(event: OpsFluxEvent) -> None:
    """Handle asset.created — audit log, admin notification."""
    if await _is_already_processed(event):
        logger.debug("Skipping duplicate event %s for on_asset_created", event.id)
        return

    payload = event.payload
    asset_id = payload.get("asset_id")
    asset_name = payload.get("name", "")
    asset_code = payload.get("code", "")
    asset_type = payload.get("type", "")
    entity_id = payload.get("entity_id")
    user_id = payload.get("user_id")

    try:
        # 1. Create audit log entry
        try:
            from app.core.audit import record_audit

            async with async_session_factory() as db:
                await record_audit(
                    db,
                    action="asset.created",
                    resource_type="asset",
                    resource_id=str(asset_id) if asset_id else None,
                    user_id=UUID(str(user_id)) if user_id else None,
                    entity_id=UUID(str(entity_id)) if entity_id else None,
                    details={
                        "name": asset_name,
                        "code": asset_code,
                        "type": asset_type,
                    },
                )
                await db.commit()
            logger.info("Audit log created for asset.created (asset_id=%s)", asset_id)
        except Exception:
            logger.exception("Failed to create audit log for asset.created")

        # 2. Notify asset admins in the entity
        if entity_id:
            try:
                from app.core.notifications import send_in_app

                admin_ids = await _get_admin_user_ids(entity_id)
                async with async_session_factory() as db:
                    for admin_id in admin_ids:
                        # Don't notify the creator
                        if str(admin_id) == str(user_id):
                            continue
                        await send_in_app(
                            db,
                            user_id=admin_id,
                            entity_id=UUID(str(entity_id)),
                            title="Nouvel actif créé",
                            body=f"L'actif '{asset_name}' ({asset_code}) de type '{asset_type}' a été créé.",
                            category="asset",
                            link=f"/assets/{asset_id}",
                        )
                    await db.commit()
                logger.info("Admin notifications sent for new asset %s", asset_id)
            except Exception:
                logger.exception("Failed to notify admins for asset.created")

        await _mark_processed(event, "on_asset_created")

    except Exception:
        logger.exception("Unhandled error in on_asset_created for event %s", event.id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler 4: on_tier_created
# ═══════════════════════════════════════════════════════════════════════════

async def on_tier_created(event: OpsFluxEvent) -> None:
    """Handle tier.created — audit log."""
    if await _is_already_processed(event):
        logger.debug("Skipping duplicate event %s for on_tier_created", event.id)
        return

    payload = event.payload
    tier_id = payload.get("tier_id")
    tier_name = payload.get("name", "")
    tier_code = payload.get("code", "")
    tier_type = payload.get("type", "")
    entity_id = payload.get("entity_id")
    user_id = payload.get("user_id")

    try:
        from app.core.audit import record_audit

        async with async_session_factory() as db:
            await record_audit(
                db,
                action="tier.created",
                resource_type="tier",
                resource_id=str(tier_id) if tier_id else None,
                user_id=UUID(str(user_id)) if user_id else None,
                entity_id=UUID(str(entity_id)) if entity_id else None,
                details={
                    "name": tier_name,
                    "code": tier_code,
                    "type": tier_type,
                },
            )
            await db.commit()
        logger.info("Audit log created for tier.created (tier_id=%s)", tier_id)

        await _mark_processed(event, "on_tier_created")

    except Exception:
        logger.exception("Unhandled error in on_tier_created for event %s", event.id)


# ═══════════════════════════════════════════════════════════════════════════
# Handler 5: on_notification_created
# ═══════════════════════════════════════════════════════════════════════════

async def on_notification_created(event: OpsFluxEvent) -> None:
    """Handle notification.created — publish to Redis for WebSocket delivery."""
    if await _is_already_processed(event):
        logger.debug("Skipping duplicate event %s for on_notification_created", event.id)
        return

    payload = event.payload
    user_id = payload.get("user_id")
    notification_id = payload.get("notification_id")
    title = payload.get("title", "")
    body = payload.get("body")
    category = payload.get("category", "info")
    link = payload.get("link")

    if not user_id:
        logger.warning("on_notification_created: missing user_id in payload")
        return

    try:
        from app.core.redis_client import get_redis

        redis = get_redis()
        channel = f"notifications:{user_id}"
        message = json.dumps({
            "notification_id": str(notification_id) if notification_id else None,
            "user_id": str(user_id),
            "title": title,
            "body": body,
            "category": category,
            "link": link,
            "event_id": event.id,
        })
        await redis.publish(channel, message)
        logger.info(
            "Published notification to Redis channel %s (notification_id=%s)",
            channel, notification_id,
        )

        await _mark_processed(event, "on_notification_created")

    except Exception:
        logger.exception(
            "Failed to publish notification to Redis for user %s", user_id
        )


# ── Helper ──────────────────────────────────────────────────────────────────

def _get_frontend_url() -> str:
    """Get the frontend URL from settings."""
    try:
        from app.core.config import settings
        return settings.FRONTEND_URL
    except Exception:
        return "http://localhost:5173"


# ═══════════════════════════════════════════════════════════════════════════
# Registration
# ═══════════════════════════════════════════════════════════════════════════

def register_core_handlers(event_bus: EventBus) -> None:
    """Register all core event handlers on the EventBus."""
    event_bus.subscribe("user.created", on_user_created)
    event_bus.subscribe("workflow.transition", on_workflow_transition)
    event_bus.subscribe("asset.created", on_asset_created)
    event_bus.subscribe("tier.created", on_tier_created)
    event_bus.subscribe("notification.created", on_notification_created)
    logger.info("Core event handlers registered")
