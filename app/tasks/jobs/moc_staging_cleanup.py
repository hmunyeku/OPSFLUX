"""Scheduled job — purge abandoned MOC attachments.

Two related cleanups both tied to the Tiptap-inline image lifecycle:

1. **Staging orphans** — when a user opens the MOC Create panel and uploads
   images but never saves the MOC, the attachments are left with
   owner_type='moc_staging'. Soft-delete any row older than STAGING_TTL_HOURS.

2. **Existing-MOC inline_image orphans** — when a user edits an existing
   MOC, uploads an inline image (owner_type='moc', category='inline_image'),
   then closes the panel without saving (no PATCH fired, so reconcile_inline_images
   never ran), the attachment sits orphaned: not referenced in any rich-text
   field. Scan those and soft-delete if unreferenced AND older than
   INLINE_ORPHAN_TTL_HOURS (short grace window for in-flight editing).

Runs hourly so storage doesn't fill up from abandoned drafts.
"""

import logging
import re
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select, text

from app.core.database import async_session_factory

logger = logging.getLogger(__name__)

STAGING_TTL_HOURS = 24
# Grace window for inline_image orphans on existing MOCs — shorter than
# staging TTL because a PATCH would have rerun reconcile_inline_images
# long before this. 6h is plenty of buffer for in-flight editing.
INLINE_ORPHAN_TTL_HOURS = 6

# Same regex used by moc_service.reconcile_inline_images — keep in sync.
_ATTACHMENT_ID_RE = re.compile(
    r'data-attachment-id="([0-9a-f-]{36})"', re.IGNORECASE,
)

# Rich-text fields on the MOC model that may embed <img data-attachment-id>.
_MOC_TEXT_FIELDS = (
    "objectives", "description", "current_situation", "proposed_changes",
    "impact_analysis", "study_conclusion", "hierarchy_review_comment",
    "site_chief_comment", "director_comment", "production_comment",
    "do_execution_comment", "dg_execution_comment",
)


async def cleanup_moc_staging_attachments() -> None:
    """Cleanup pass #1 — staging rows + #2 — inline_image orphans on MOCs."""
    logger.debug("moc_staging_cleanup: starting run")
    now = datetime.now(UTC)

    try:
        async with async_session_factory() as db:
            await db.execute(text("SET search_path TO public"))

            # ── Pass 1: staging orphans ────────────────────────────────
            staging_cutoff = now - timedelta(hours=STAGING_TTL_HOURS)
            r1 = await db.execute(
                text(
                    "UPDATE attachments "
                    "SET deleted_at = :now "
                    "WHERE owner_type = 'moc_staging' "
                    "AND created_at < :cutoff "
                    "AND deleted_at IS NULL "
                    "RETURNING id"
                ),
                {"now": now, "cutoff": staging_cutoff},
            )
            staging_purged = len(r1.fetchall())

            # ── Pass 2: inline_image orphans on existing MOCs ──────────
            # Import inside the function to avoid slow import at scheduler
            # boot and sidestep any circular-import concerns.
            from app.models.common import Attachment
            from app.models.moc import MOC

            inline_cutoff = now - timedelta(hours=INLINE_ORPHAN_TTL_HOURS)
            candidates = (await db.execute(
                select(Attachment).where(
                    Attachment.owner_type == "moc",
                    Attachment.category == "inline_image",
                    Attachment.deleted_at.is_(None),
                    Attachment.created_at < inline_cutoff,
                )
            )).scalars().all()

            if not candidates:
                await db.commit()
                if staging_purged:
                    logger.info(
                        "moc_staging_cleanup: staging=%d, inline_orphans=0",
                        staging_purged,
                    )
                return

            # Group candidates by MOC id so we load each MOC exactly once.
            by_moc: dict[UUID, list[Attachment]] = {}
            for att in candidates:
                by_moc.setdefault(att.owner_id, []).append(att)

            moc_rows = (await db.execute(
                select(MOC).where(MOC.id.in_(by_moc.keys()))
            )).scalars().all()
            mocs_by_id = {m.id: m for m in moc_rows}

            inline_purged = 0
            for moc_id, atts in by_moc.items():
                moc = mocs_by_id.get(moc_id)
                if moc is None:
                    # Parent MOC gone — every attachment is orphaned.
                    for att in atts:
                        att.deleted_at = now
                        inline_purged += 1
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
                        inline_purged += 1

            await db.commit()

            if staging_purged or inline_purged:
                logger.info(
                    "moc_staging_cleanup: staging=%d (>%dh), inline_orphans=%d (>%dh)",
                    staging_purged, STAGING_TTL_HOURS,
                    inline_purged, INLINE_ORPHAN_TTL_HOURS,
                )
    except Exception:
        logger.exception("moc_staging_cleanup: unhandled error during run")
