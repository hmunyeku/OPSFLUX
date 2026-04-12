"""Scheduled job — auto-relance multi-imputation project reviewers (spec 3.7).

When an ADS with multiple project imputations is stuck in
``pending_project_review`` because one or more project managers have
not yet responded, this cron periodically:

1. Sends an in-app reminder to each non-responding project manager.
2. Sends a single progress notification to the AdS requester (demandeur)
   listing which PMs still owe a response and whether the requester
   can unblock by dropping an imputation.

Delays are configurable in the OpsFlux administration via
``paxlog.multi_imputation_reminder_delay_hours`` (entity or tenant
scope). Default: 24 hours. The reminder is re-sent at most once per
delay window per PM per ADS (tracked via AdsEvent).

Spec reference:
    §3.7: "En cas de multi-imputation sans programme de séjour:
    validation de tous les chefs de projet associés requise. Un cron
    relance automatiquement les chefs de projet non répondants et
    notifie le demandeur. L'ADS est bloquée jusqu'à obtention de
    toutes les validations. Alternative: le demandeur peut supprimer
    une imputation non validée et relancer la soumission pour
    débloquer le processus."
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.core.notifications import send_in_app
from app.models.common import Setting
from app.models.paxlog import Ads, AdsEvent

logger = logging.getLogger(__name__)

REMINDER_EVENT_TYPE = "multi_imputation_reminder"
REQUESTER_NOTIFICATION_EVENT_TYPE = "multi_imputation_requester_progress"
DEFAULT_DELAY_HOURS = 24
MIN_DELAY_HOURS = 1
MAX_DELAY_HOURS = 720


async def _get_reminder_delay_hours(db: AsyncSession, entity_id: UUID) -> int:
    """Resolve the configurable reminder delay for an entity.

    Falls back to the tenant-scope setting, then to ``DEFAULT_DELAY_HOURS``.
    Persisted via scopedSettingsService.put so the stored JSON shape is
    ``{"v": <N>}`` — we unwrap accordingly.
    """
    result = await db.execute(
        select(Setting).where(
            Setting.key == "paxlog.multi_imputation_reminder_delay_hours",
            Setting.scope.in_(["entity", "tenant"]),
        )
    )
    rows = result.scalars().all()
    entity_setting = next(
        (r for r in rows if r.scope == "entity" and r.scope_id == str(entity_id)),
        None,
    )
    tenant_setting = next(
        (r for r in rows if r.scope == "tenant" and r.scope_id in (None, "")),
        None,
    )
    setting = entity_setting or tenant_setting
    if not setting or not isinstance(setting.value, dict):
        return DEFAULT_DELAY_HOURS
    payload = setting.value.get("v", setting.value)
    try:
        hours = int(payload)
    except (TypeError, ValueError):
        return DEFAULT_DELAY_HOURS
    return max(MIN_DELAY_HOURS, min(MAX_DELAY_HOURS, hours))


async def _last_event_at(
    db: AsyncSession,
    *,
    ads_id: UUID,
    event_type: str,
    project_id: UUID | None = None,
    user_id: UUID | None = None,
) -> datetime | None:
    """Return the most recent created_at for a reminder-event match.

    project_id and user_id are matched against the metadata_json if
    provided (so we can track "last reminder to PM X on project Y").
    """
    result = await db.execute(
        select(AdsEvent.created_at, AdsEvent.metadata_json)
        .where(
            AdsEvent.ads_id == ads_id,
            AdsEvent.event_type == event_type,
        )
        .order_by(AdsEvent.created_at.desc())
    )
    for created_at, metadata in result.all():
        if not isinstance(metadata, dict):
            continue
        if project_id is not None and str(metadata.get("project_id")) != str(project_id):
            continue
        if user_id is not None and str(metadata.get("user_id")) != str(user_id):
            continue
        return created_at
    return None


async def process_multi_imputation_followup() -> dict[str, int]:
    """Relance PMs + notify requester for multi-imputation ADS stuck in pending_project_review.

    Called by the scheduler. Returns a dict with ``pm_reminders_sent``
    and ``requester_notifications_sent`` counts for observability.
    """
    # Imported inline to avoid a circular import at module load time
    from app.api.routes.modules.paxlog import (
        _get_ads_pending_project_review_targets,
    )

    pm_reminders_sent = 0
    requester_notifications_sent = 0

    async with async_session_factory() as db:
        # Fetch all ADS currently stuck in pending_project_review status.
        # We care ONLY about multi-imputation ADS here — single-imputation
        # has no "wait for others" semantics. The _get_ads_pending_
        # project_review_targets helper already filters to pending PMs
        # (those who haven't approved yet).
        ads_rows = await db.execute(
            select(Ads).where(
                Ads.status == "pending_project_review",
                Ads.deleted_at.is_(None),
            )
        )
        stale_ads_list = ads_rows.scalars().all()
        logger.info(
            "paxlog multi_imputation_followup: scanning %d ADS in pending_project_review",
            len(stale_ads_list),
        )

        for ads in stale_ads_list:
            entity_id = ads.entity_id
            delay_hours = await _get_reminder_delay_hours(db, entity_id)
            threshold = datetime.now(UTC) - timedelta(hours=delay_hours)

            # Only relance an ADS that has been in pending_project_review
            # for at least `delay_hours`. We approximate "time since last
            # state change" with updated_at.
            if ads.updated_at and ads.updated_at > threshold:
                continue

            pending_targets = await _get_ads_pending_project_review_targets(db, ads=ads, entity_id=entity_id)
            # Skip single-imputation — no "multi" dimension there.
            if len(pending_targets) < 2:
                continue

            # ── Remind each non-responding PM (rate-limited) ──
            pm_reminded_for_this_ads: list[dict] = []
            for target in pending_targets:
                pm_id_raw = target.get("project_manager_id")
                project_id_raw = target.get("project_id")
                project_name = target.get("project_name") or ""
                if not pm_id_raw or not project_id_raw:
                    continue
                try:
                    pm_id = UUID(str(pm_id_raw)) if not isinstance(pm_id_raw, UUID) else pm_id_raw
                    project_id = UUID(str(project_id_raw)) if not isinstance(project_id_raw, UUID) else project_id_raw
                except (TypeError, ValueError):
                    continue

                last_reminder = await _last_event_at(
                    db,
                    ads_id=ads.id,
                    event_type=REMINDER_EVENT_TYPE,
                    project_id=project_id,
                    user_id=pm_id,
                )
                if last_reminder and last_reminder > threshold:
                    continue

                # Record the reminder (audit trail for rate limiting)
                db.add(
                    AdsEvent(
                        entity_id=entity_id,
                        ads_id=ads.id,
                        event_type=REMINDER_EVENT_TYPE,
                        old_status=ads.status,
                        new_status=ads.status,
                        actor_id=None,
                        metadata_json={
                            "source": "paxlog.multi_imputation_followup",
                            "project_id": str(project_id),
                            "project_name": project_name,
                            "user_id": str(pm_id),
                            "delay_hours": delay_hours,
                        },
                    )
                )
                try:
                    await send_in_app(
                        db,
                        user_id=pm_id,
                        entity_id=entity_id,
                        title="Validation AdS en attente",
                        body=(
                            f"L'AdS {ads.reference} attend votre validation sur le projet "
                            f"« {project_name} ». Merci d'y répondre dès que possible — "
                            f"plusieurs chefs de projet sont concernés et l'AdS est bloquée "
                            f"tant qu'ils n'ont pas tous statué."
                        ),
                        category="paxlog",
                        link=f"/paxlog/ads/{ads.id}",
                        event_type="paxlog.multi_imputation_reminder",
                    )
                except Exception:
                    logger.exception(
                        "Failed to remind PM %s for AdS %s project %s",
                        pm_id,
                        ads.id,
                        project_id,
                    )
                pm_reminders_sent += 1
                pm_reminded_for_this_ads.append(
                    {
                        "user_id": str(pm_id),
                        "project_id": str(project_id),
                        "project_name": project_name,
                    }
                )

            # ── Notify requester of the stuck state (once per delay window) ──
            if pm_reminded_for_this_ads:
                last_requester_notif = await _last_event_at(
                    db,
                    ads_id=ads.id,
                    event_type=REQUESTER_NOTIFICATION_EVENT_TYPE,
                )
                if not last_requester_notif or last_requester_notif <= threshold:
                    db.add(
                        AdsEvent(
                            entity_id=entity_id,
                            ads_id=ads.id,
                            event_type=REQUESTER_NOTIFICATION_EVENT_TYPE,
                            old_status=ads.status,
                            new_status=ads.status,
                            actor_id=None,
                            metadata_json={
                                "source": "paxlog.multi_imputation_followup",
                                "pending_count": len(pm_reminded_for_this_ads),
                                "pending_projects": pm_reminded_for_this_ads,
                                "delay_hours": delay_hours,
                            },
                        )
                    )
                    pending_names = ", ".join(p["project_name"] or "—" for p in pm_reminded_for_this_ads)
                    try:
                        await send_in_app(
                            db,
                            user_id=ads.requester_id,
                            entity_id=entity_id,
                            title="AdS bloquée — validations en attente",
                            body=(
                                f"L'AdS {ads.reference} est bloquée en attente de validation "
                                f"des chefs de projet suivants : {pending_names}. "
                                f"Vous pouvez débloquer en retirant une imputation non validée "
                                f"depuis le panneau de l'AdS."
                            ),
                            category="paxlog",
                            link=f"/paxlog/ads/{ads.id}",
                            event_type="paxlog.multi_imputation_requester_progress",
                        )
                    except Exception:
                        logger.exception(
                            "Failed to notify requester %s for stuck multi-imputation AdS %s",
                            ads.requester_id,
                            ads.id,
                        )
                    requester_notifications_sent += 1

            # Commit per-ADS so a failure on one doesn't roll back the others
            await db.commit()

    logger.info(
        "paxlog multi_imputation_followup done — %d PM reminders, %d requester notifications",
        pm_reminders_sent,
        requester_notifications_sent,
    )
    return {
        "pm_reminders_sent": pm_reminders_sent,
        "requester_notifications_sent": requester_notifications_sent,
    }
