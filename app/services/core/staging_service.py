"""Generic polymorphic staging commit.

Pattern: when a user opens a Create panel, the frontend generates a
client-side UUID (`staging_ref`) and any polymorphic child (attachment,
note, tag, imputation, address, phone, …) it uploads before the parent
exists is stored with `owner_type='{module}_staging'` + `owner_id=<ref>`.

On successful create of the parent, the endpoint calls
`commit_staging_children(...)` which SQL-UPDATEs every matching row
to `owner_type=<final_type>` + `owner_id=<new_parent_id>`. Row ids are
preserved, so any URL embedded in rich-text (e.g.
`/api/v1/attachments/<id>/download`) stays valid without rewriting.

Orphans (panels abandoned without saving) are swept by the hourly
`polymorphic_staging_cleanup` cron job.
"""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import (
    Address,
    Attachment,
    ContactEmail,
    CostImputation,
    ExternalReference,
    LegalIdentifier,
    Note,
    OpeningHour,
    Phone,
    SocialNetwork,
    Tag,
)

logger = logging.getLogger(__name__)


# Every polymorphic child table that has the owner_type / owner_id pair
# and might be pre-populated by a Create panel. Extend this list as new
# polymorphic tables come online.
#
# Tables intentionally excluded:
#   - compliance_records: specific lifecycle (not user-populated in Create panels)
#   - project_comments:   created after project exists (collaboration)
#   - custom_field_values: bound to a type definition, not free-form
#   - medical_checks / passports / etc.: user-specific sub-models
POLYMORPHIC_STAGING_MODELS = (
    Attachment,
    Note,
    Tag,
    CostImputation,
    ExternalReference,
    Address,
    ContactEmail,
    Phone,
    SocialNetwork,
    OpeningHour,
    LegalIdentifier,
)


async def commit_staging_children(
    db: AsyncSession,
    *,
    staging_owner_type: str,     # e.g. "moc_staging"
    final_owner_type: str,       # e.g. "moc"
    staging_ref: UUID,           # client-generated UUID used during Create
    final_owner_id: UUID,        # freshly-created parent row id
    uploader_id: UUID,           # current_user.id (anti-hijack guard)
    entity_id: UUID,             # tenant scope
) -> dict[str, int]:
    """Re-target every polymorphic child from staging → real owner.

    Restricted to rows uploaded by the current user in the current entity
    so one user can't hijack another user's staging ref by guessing UUIDs.

    Returns a dict of `{tablename: rowcount}` for every table that had
    at least one row moved.
    """
    counts: dict[str, int] = {}
    for Model in POLYMORPHIC_STAGING_MODELS:
        if not hasattr(Model, "owner_type") or not hasattr(Model, "owner_id"):
            continue
        stmt = (
            sa_update(Model)
            .where(
                Model.owner_type == staging_owner_type,
                Model.owner_id == staging_ref,
            )
            .values(owner_type=final_owner_type, owner_id=final_owner_id)
        )
        # Anti-hijack: only the uploader's own rows get moved.
        if hasattr(Model, "uploaded_by") and uploader_id is not None:
            stmt = stmt.where(Model.uploaded_by == uploader_id)
        elif hasattr(Model, "created_by") and uploader_id is not None:
            stmt = stmt.where(Model.created_by == uploader_id)

        # Tenant scope.
        if hasattr(Model, "entity_id") and entity_id is not None:
            stmt = stmt.where(Model.entity_id == entity_id)

        # Ignore soft-deleted rows.
        if hasattr(Model, "deleted_at"):
            stmt = stmt.where(Model.deleted_at.is_(None))

        result = await db.execute(stmt)
        moved = result.rowcount or 0
        if moved:
            counts[Model.__tablename__] = moved

    if counts:
        await db.flush()
        logger.info(
            "commit_staging_children: %s → %s (ref=%s): %s",
            staging_owner_type, final_owner_type, staging_ref, counts,
        )
    return counts
