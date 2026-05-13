"""Clone RBAC system email templates for a newly-created entity.

Migration 172 seeds the 4 RBAC email templates
(``rbac.delegation.granted|received|revoked|expired``) into every entity
that existed at deploy time. For entities created **after** that
migration ran, this function clones the templates from any existing
seed source so the new tenant immediately has functional templates.

Identification of "system seed" rows relies on
``EmailTemplate.description == 'RBAC system seed'`` (set by migration 172).

The clone operation is **idempotent**: if a slug already exists in the
target entity, it is skipped. Failures for a single slug do not abort
the cloning of the remaining ones -- a warning is logged.
"""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import EmailTemplate, EmailTemplateVersion

logger = logging.getLogger(__name__)


_RBAC_SEED_DESCRIPTION = "RBAC system seed"

# Email template slugs seeded by migration 172. Kept aligned with
# ``alembic/versions/172_rbac_seed_pdf_email_templates.py:_EMAIL_TEMPLATES``.
_RBAC_EMAIL_SLUGS: tuple[str, ...] = (
    "rbac.delegation.granted",
    "rbac.delegation.received",
    "rbac.delegation.revoked",
    "rbac.delegation.expired",
)


async def clone_rbac_email_templates_for_entity(
    db: AsyncSession,
    target_entity_id: UUID,
) -> int:
    """Copy the 4 RBAC system email templates into ``target_entity_id``.

    Returns the number of templates actually cloned. Idempotent: slugs
    already present in the target entity are skipped.

    If no seed source is found (migration 172 has not yet run -- typical
    on a fresh install), the function logs a warning and continues.
    The caller is responsible for ``db.commit()``.
    """
    cloned = 0
    for slug in _RBAC_EMAIL_SLUGS:
        # Skip slugs already present in the target entity.
        existing = await db.execute(
            select(EmailTemplate).where(
                EmailTemplate.entity_id == target_entity_id,
                EmailTemplate.slug == slug,
            )
        )
        if existing.scalar_one_or_none() is not None:
            continue

        # Find any seed source from another entity.
        source_result = await db.execute(
            select(EmailTemplate)
            .where(
                EmailTemplate.slug == slug,
                EmailTemplate.description == _RBAC_SEED_DESCRIPTION,
            )
            .limit(1)
        )
        source_tpl = source_result.scalar_one_or_none()
        if source_tpl is None:
            logger.warning(
                "Cannot clone RBAC email template %s for entity %s: "
                "no seed source found (migration 172 may not have run yet)",
                slug,
                target_entity_id,
            )
            continue

        new_tpl = EmailTemplate(
            entity_id=target_entity_id,
            slug=source_tpl.slug,
            name=source_tpl.name,
            description=source_tpl.description,
            object_type=source_tpl.object_type,
            enabled=source_tpl.enabled,
            variables_schema=source_tpl.variables_schema,
        )
        db.add(new_tpl)
        await db.flush()  # populate new_tpl.id for the version inserts

        versions_result = await db.execute(
            select(EmailTemplateVersion).where(
                EmailTemplateVersion.template_id == source_tpl.id
            )
        )
        for src_version in versions_result.scalars().all():
            new_version = EmailTemplateVersion(
                template_id=new_tpl.id,
                version=src_version.version,
                language=src_version.language,
                subject=src_version.subject,
                body_html=src_version.body_html,
                is_active=src_version.is_active,
                valid_from=src_version.valid_from,
                valid_until=src_version.valid_until,
            )
            db.add(new_version)

        cloned += 1

    if cloned > 0:
        await db.flush()
        logger.info(
            "Cloned %d RBAC email templates into entity %s",
            cloned,
            target_entity_id,
        )

    return cloned
