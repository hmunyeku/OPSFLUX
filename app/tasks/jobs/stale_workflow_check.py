"""Scheduled job — check for stale workflow instances.

Runs every 6 hours. Sends reminder notifications when a workflow instance
stays too long in its current state:
- uses the state SLA stored by the FSM when available
- falls back to a generic stale threshold otherwise
"""

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import text

from app.core.database import async_session_factory

logger = logging.getLogger(__name__)

STALE_THRESHOLD_DAYS = 7
TERMINAL_STATES = {"approved", "rejected", "completed", "cancelled", "closed"}


async def check_stale_workflows() -> None:
    """Find and alert on stale workflow instances."""
    logger.debug("stale_workflow_check: starting run")

    try:
        now = datetime.now(UTC)
        cutoff = now - timedelta(days=STALE_THRESHOLD_DAYS)

        async with async_session_factory() as db:
            # Find workflow instances in non-terminal states that haven't been
            # updated (no transition) for more than STALE_THRESHOLD_DAYS.
            # We check updated_at on the instance or the latest transition time.
            result = await db.execute(
                text(
                    "SELECT wi.id AS instance_id, wi.current_state, "
                    "wi.entity_type, wi.entity_id_ref, wi.updated_at, "
                    "wi.workflow_definition_id, wi.metadata AS instance_metadata, "
                    "wd.name AS workflow_name, wd.slug AS workflow_slug, "
                    "( "
                    "   SELECT wt.actor_id FROM workflow_transitions wt "
                    "   WHERE wt.instance_id = wi.id "
                    "   ORDER BY wt.created_at DESC LIMIT 1 "
                    ") AS last_actor_id "
                    "FROM workflow_instances wi "
                    "JOIN workflow_definitions wd ON wd.id = wi.workflow_definition_id "
                    "WHERE wi.updated_at < :cutoff "
                    "AND wi.current_state NOT IN :terminal_states"
                ),
                {
                    "cutoff": cutoff,
                    "terminal_states": tuple(TERMINAL_STATES),
                },
            )
            rows = result.fetchall()

            if not rows:
                logger.debug("stale_workflow_check: no stale workflows found")
                return

            logger.info("stale_workflow_check: found %d stale workflow instances", len(rows))

            from app.core.notifications import send_in_app

            for row in rows:
                instance_id = row.instance_id
                current_state = row.current_state
                workflow_name = row.workflow_name or "Workflow"
                last_actor_id = row.last_actor_id
                entity_type = row.entity_type
                entity_id_ref = row.entity_id_ref

                # Determine who to notify: the last actor, or the instance
                # creator/requester (from metadata if available)
                notify_user_ids = set()

                if last_actor_id:
                    notify_user_ids.add(str(last_actor_id))

                # Try to extract requester/creator from instance metadata
                instance_metadata = row.instance_metadata
                if instance_metadata and isinstance(instance_metadata, dict):
                    for key in ("requester_id", "creator_id", "assigned_to"):
                        val = instance_metadata.get(key)
                        if val:
                            notify_user_ids.add(str(val))

                if not notify_user_ids:
                    logger.debug(
                        "stale_workflow_check: no users to notify for instance %s",
                        instance_id,
                    )
                    continue

                # Determine the entity_id for the notification.
                # We need to look it up from the workflow context.
                entity_id = None
                if instance_metadata and isinstance(instance_metadata, dict):
                    entity_id = instance_metadata.get("entity_id")

                # If no entity_id in metadata, try to look it up from the
                # referenced entity
                if not entity_id:
                    entity_id = await _resolve_entity_id(db, entity_type, entity_id_ref)

                if not entity_id:
                    logger.debug(
                        "stale_workflow_check: cannot determine entity_id for instance %s, skipping notifications",
                        instance_id,
                    )
                    continue

                due_at = _resolve_due_at(row.instance_metadata, row.updated_at)
                if due_at and due_at > now:
                    continue

                days_stale = (now - row.updated_at).days

                for uid_str in notify_user_ids:
                    try:
                        await send_in_app(
                            db,
                            user_id=UUID(uid_str),
                            entity_id=UUID(str(entity_id)),
                            title=f"{workflow_name}: demande en attente",
                            body=(
                                f"L'instance de workflow est a l'etat '{current_state}' "
                                f"depuis {days_stale} jours. Veuillez prendre action."
                            ),
                            category="workflow",
                            link=f"/workflows/{instance_id}",
                        )
                    except Exception:
                        logger.exception(
                            "stale_workflow_check: failed to notify user %s for instance %s",
                            uid_str,
                            instance_id,
                        )

            await db.commit()
            logger.info("stale_workflow_check: notifications sent for stale workflows")

    except Exception:
        logger.exception("stale_workflow_check: unhandled error during check run")


def _resolve_due_at(instance_metadata: dict | None, updated_at: datetime) -> datetime:
    if instance_metadata and isinstance(instance_metadata, dict):
        due_at_raw = instance_metadata.get("current_state_due_at")
        if isinstance(due_at_raw, str):
            try:
                due_at = datetime.fromisoformat(due_at_raw.replace("Z", "+00:00"))
                if due_at.tzinfo is None:
                    due_at = due_at.replace(tzinfo=UTC)
                return due_at
            except ValueError:
                pass
    return updated_at + timedelta(days=STALE_THRESHOLD_DAYS)


async def _resolve_entity_id(db, entity_type: str, entity_id_ref: str) -> str | None:
    """Attempt to resolve the entity_id from the referenced entity."""
    # Map entity types to their tables
    type_to_table = {
        "asset": "assets",
        "tier": "tiers",
        "user": "users",
    }
    table = type_to_table.get(entity_type)
    if not table:
        return None

    # For users, the entity_id is default_entity_id
    entity_col = "default_entity_id" if entity_type == "user" else "entity_id"

    try:
        result = await db.execute(
            text(f"SELECT {entity_col} FROM {table} WHERE id = :id"),
            {"id": entity_id_ref},
        )
        row = result.first()
        return str(getattr(row, entity_col)) if row else None
    except Exception:
        logger.debug(
            "stale_workflow_check: failed to resolve entity_id from %s.%s",
            table,
            entity_id_ref,
        )
        return None
