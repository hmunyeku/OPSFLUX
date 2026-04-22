"""Scheduled job — purge abandoned polymorphic staging rows.

Any Create panel across the app uses the staging pattern: before the
parent exists, polymorphic children (attachments, notes, tags, …) are
uploaded with `owner_type='{module}_staging'` + `owner_id=<client UUID>`.
If the user abandons the panel without saving, those rows linger.

This job sweeps EVERY polymorphic table in `POLYMORPHIC_STAGING_MODELS`
for rows with `owner_type LIKE '%_staging'` older than STAGING_TTL_HOURS
and soft-deletes them (or hard-deletes if no soft-delete column).

Runs hourly. Also handles the MOC-specific `inline_image` reconciliation
on saved MOCs (attachments uploaded in an open editor that was closed
without saving).
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy import text
from sqlalchemy import update as sa_update

from app.core.database import async_session_factory
from app.services.core.staging_service import POLYMORPHIC_STAGING_MODELS

logger = logging.getLogger(__name__)

STAGING_TTL_HOURS = 24

# ── MOC-specific: inline_image orphans on saved MOCs ──────────────────────
# Short grace because a PATCH on the MOC would already have run
# `reconcile_inline_images` long before.
INLINE_ORPHAN_TTL_HOURS = 6

_ATTACHMENT_ID_RE = re.compile(
    r'data-attachment-id="([0-9a-f-]{36})"', re.IGNORECASE,
)
_MOC_TEXT_FIELDS = (
    "objectives", "description", "current_situation", "proposed_changes",
    "impact_analysis", "study_conclusion", "hierarchy_review_comment",
    "site_chief_comment", "director_comment", "production_comment",
    "do_execution_comment", "dg_execution_comment",
)


async def cleanup_polymorphic_staging() -> None:
    """Purge all `*_staging` rows older than STAGING_TTL_HOURS across every
    polymorphic table, plus MOC inline_image orphans."""
    logger.debug("polymorphic_staging_cleanup: starting run")
    now = datetime.now(UTC)
    staging_cutoff = now - timedelta(hours=STAGING_TTL_HOURS)

    try:
        async with async_session_factory() as db:
            await db.execute(text("SET search_path TO public"))

            # ── Pass 1: generic staging sweep across all polymorphic tables
            table_counts: dict[str, int] = {}
            for Model in POLYMORPHIC_STAGING_MODELS:
                if not hasattr(Model, "owner_type") or not hasattr(Model, "created_at"):
                    continue
                if hasattr(Model, "deleted_at"):
                    # Soft-delete
                    stmt = (
                        sa_update(Model)
                        .where(
                            Model.owner_type.like("%_staging"),
                            Model.created_at < staging_cutoff,
                            Model.deleted_at.is_(None),
                        )
                        .values(deleted_at=now)
                    )
                else:
                    # No soft-delete column → hard delete
                    stmt = sa_delete(Model).where(
                        Model.owner_type.like("%_staging"),
                        Model.created_at < staging_cutoff,
                    )
                result = await db.execute(stmt)
                moved = result.rowcount or 0
                if moved:
                    table_counts[Model.__tablename__] = moved

            # ── Pass 2: MOC-specific inline_image orphans on saved MOCs
            inline_purged = await _cleanup_moc_inline_orphans(
                db, now=now, cutoff=now - timedelta(hours=INLINE_ORPHAN_TTL_HOURS),
            )

            await db.commit()

            if table_counts or inline_purged:
                logger.info(
                    "polymorphic_staging_cleanup: staging=%s (>%dh), moc_inline_orphans=%d (>%dh)",
                    table_counts or "{}", STAGING_TTL_HOURS,
                    inline_purged, INLINE_ORPHAN_TTL_HOURS,
                )
    except Exception:
        logger.exception("polymorphic_staging_cleanup: unhandled error during run")


async def _cleanup_moc_inline_orphans(db, *, now: datetime, cutoff: datetime) -> int:
    """Soft-delete MOC inline_image attachments no longer referenced in
    the parent MOC's rich-text fields (user opened editor, uploaded, then
    closed without saving → PATCH never fired → reconcile never ran)."""
    from app.models.common import Attachment
    from app.models.moc import MOC

    candidates = (await db.execute(
        select(Attachment).where(
            Attachment.owner_type == "moc",
            Attachment.category == "inline_image",
            Attachment.deleted_at.is_(None),
            Attachment.created_at < cutoff,
        )
    )).scalars().all()

    if not candidates:
        return 0

    by_moc: dict[UUID, list[Attachment]] = {}
    for att in candidates:
        by_moc.setdefault(att.owner_id, []).append(att)

    moc_rows = (await db.execute(
        select(MOC).where(MOC.id.in_(by_moc.keys()))
    )).scalars().all()
    mocs_by_id = {m.id: m for m in moc_rows}

    purged = 0
    for moc_id, atts in by_moc.items():
        moc = mocs_by_id.get(moc_id)
        if moc is None:
            for att in atts:
                att.deleted_at = now
                purged += 1
            continue

        referenced: set[UUID] = set()
        for field in _MOC_TEXT_FIELDS:
            src = getattr(moc, field, None)
            if not src:
                continue
            for m in _ATTACHMENT_ID_RE.finditer(src):
                try:
                    referenced.add(UUID(m.group(1)))
                except ValueError:
                    continue

        for att in atts:
            if att.id not in referenced:
                att.deleted_at = now
                purged += 1
    return purged
