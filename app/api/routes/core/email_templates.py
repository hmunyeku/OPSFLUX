"""Email template management routes — CRUD, versions, links, preview, availability check.

Admin-level endpoints for configuring email templates per entity.
All templates are entity-scoped (X-Entity-ID header).
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_entity, get_current_user
from app.core.database import get_db
from app.core.email_templates import render_template_string
from app.models.common import (
    EmailTemplate,
    EmailTemplateLink,
    EmailTemplateVersion,
    User,
)
from app.schemas.common import (
    EmailTemplateCheckResponse,
    EmailTemplateCreate,
    EmailTemplateLinkCreate,
    EmailTemplateLinkRead,
    EmailTemplateRead,
    EmailTemplateSummaryRead,
    EmailTemplateUpdate,
    EmailTemplateVersionCreate,
    EmailTemplateVersionRead,
    EmailTemplateVersionUpdate,
    EmailPreviewRequest,
)

router = APIRouter(prefix="/api/v1/email-templates", tags=["email-templates"])


# ── List all templates ─────────────────────────────────────────────────────

@router.get("", response_model=list[EmailTemplateSummaryRead])
async def list_templates(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all email templates for the current entity."""
    result = await db.execute(
        select(EmailTemplate)
        .options(selectinload(EmailTemplate.versions))
        .where(EmailTemplate.entity_id == entity_id)
        .order_by(EmailTemplate.slug)
    )
    templates = result.scalars().all()

    summaries = []
    for t in templates:
        active_langs = list({v.language for v in t.versions if v.is_active})
        summaries.append(
            EmailTemplateSummaryRead(
                id=t.id,
                entity_id=t.entity_id,
                slug=t.slug,
                name=t.name,
                description=t.description,
                object_type=t.object_type,
                enabled=t.enabled,
                created_at=t.created_at,
                updated_at=t.updated_at,
                active_languages=active_langs,
                version_count=len(t.versions),
            )
        )
    return summaries


# ── Get single template (with versions + links) ───────────────────────────

@router.get("/{template_id}", response_model=EmailTemplateRead)
async def get_template(
    template_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single email template with all versions and links."""
    result = await db.execute(
        select(EmailTemplate)
        .options(
            selectinload(EmailTemplate.versions),
            selectinload(EmailTemplate.links),
        )
        .where(
            EmailTemplate.id == template_id,
            EmailTemplate.entity_id == entity_id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


# ── Create template ────────────────────────────────────────────────────────

@router.post("", response_model=EmailTemplateRead, status_code=201)
async def create_template(
    body: EmailTemplateCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new email template."""
    # Check slug uniqueness within entity
    existing = await db.execute(
        select(EmailTemplate.id).where(
            EmailTemplate.entity_id == entity_id,
            EmailTemplate.slug == body.slug,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Template with slug '{body.slug}' already exists for this entity",
        )

    template = EmailTemplate(
        entity_id=entity_id,
        slug=body.slug,
        name=body.name,
        description=body.description,
        object_type=body.object_type,
        enabled=body.enabled,
        variables_schema=body.variables_schema,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)

    # Re-fetch with relationships
    result = await db.execute(
        select(EmailTemplate)
        .options(
            selectinload(EmailTemplate.versions),
            selectinload(EmailTemplate.links),
        )
        .where(EmailTemplate.id == template.id)
    )
    return result.scalar_one()


# ── Update template metadata ──────────────────────────────────────────────

@router.put("/{template_id}", response_model=EmailTemplateRead)
async def update_template(
    template_id: UUID,
    body: EmailTemplateUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update template metadata (name, description, enabled, etc.)."""
    result = await db.execute(
        select(EmailTemplate)
        .options(
            selectinload(EmailTemplate.versions),
            selectinload(EmailTemplate.links),
        )
        .where(
            EmailTemplate.id == template_id,
            EmailTemplate.entity_id == entity_id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(template, field, value)

    await db.commit()
    await db.refresh(template)
    return template


# ── Delete template ────────────────────────────────────────────────────────

@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an email template and all its versions/links."""
    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.id == template_id,
            EmailTemplate.entity_id == entity_id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    await db.delete(template)
    await db.commit()


# ── Template versions ─────────────────────────────────────────────────────

@router.get("/{template_id}/versions", response_model=list[EmailTemplateVersionRead])
async def list_versions(
    template_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all versions of a template."""
    # Verify template belongs to entity
    tpl = await db.execute(
        select(EmailTemplate.id).where(
            EmailTemplate.id == template_id,
            EmailTemplate.entity_id == entity_id,
        )
    )
    if not tpl.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Template not found")

    result = await db.execute(
        select(EmailTemplateVersion)
        .where(EmailTemplateVersion.template_id == template_id)
        .order_by(EmailTemplateVersion.language, EmailTemplateVersion.version.desc())
    )
    return result.scalars().all()


@router.post("/{template_id}/versions", response_model=EmailTemplateVersionRead, status_code=201)
async def create_version(
    template_id: UUID,
    body: EmailTemplateVersionCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new version of a template."""
    # Verify template belongs to entity
    tpl = await db.execute(
        select(EmailTemplate.id).where(
            EmailTemplate.id == template_id,
            EmailTemplate.entity_id == entity_id,
        )
    )
    if not tpl.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Template not found")

    # Calculate next version number for this language
    max_version = await db.execute(
        select(func.coalesce(func.max(EmailTemplateVersion.version), 0))
        .where(
            EmailTemplateVersion.template_id == template_id,
            EmailTemplateVersion.language == body.language,
        )
    )
    next_version = max_version.scalar() + 1

    # If activating this version, deactivate others for same language
    if body.is_active:
        await _deactivate_language_versions(db, template_id, body.language)

    version = EmailTemplateVersion(
        template_id=template_id,
        version=next_version,
        language=body.language,
        subject=body.subject,
        body_html=body.body_html,
        is_active=body.is_active,
        valid_from=body.valid_from,
        valid_until=body.valid_until,
        created_by=current_user.id,
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)
    return version


@router.put("/{template_id}/versions/{version_id}", response_model=EmailTemplateVersionRead)
async def update_version(
    template_id: UUID,
    version_id: UUID,
    body: EmailTemplateVersionUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a template version."""
    result = await db.execute(
        select(EmailTemplateVersion).where(
            EmailTemplateVersion.id == version_id,
            EmailTemplateVersion.template_id == template_id,
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    update_data = body.model_dump(exclude_unset=True)

    # If activating, deactivate others for same language
    if update_data.get("is_active"):
        await _deactivate_language_versions(db, template_id, version.language)

    for field, value in update_data.items():
        setattr(version, field, value)

    await db.commit()
    await db.refresh(version)
    return version


@router.post("/{template_id}/versions/{version_id}/activate", response_model=EmailTemplateVersionRead)
async def activate_version(
    template_id: UUID,
    version_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set a version as the active version for its language."""
    result = await db.execute(
        select(EmailTemplateVersion).where(
            EmailTemplateVersion.id == version_id,
            EmailTemplateVersion.template_id == template_id,
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Deactivate others for same language
    await _deactivate_language_versions(db, template_id, version.language)

    version.is_active = True
    await db.commit()
    await db.refresh(version)
    return version


@router.delete("/{template_id}/versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_version(
    template_id: UUID,
    version_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a template version."""
    result = await db.execute(
        select(EmailTemplateVersion).where(
            EmailTemplateVersion.id == version_id,
            EmailTemplateVersion.template_id == template_id,
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    await db.delete(version)
    await db.commit()


# ── Template links ─────────────────────────────────────────────────────────

@router.post("/{template_id}/links", response_model=EmailTemplateLinkRead, status_code=201)
async def add_link(
    template_id: UUID,
    body: EmailTemplateLinkCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Link a template to a specific tier, entity, or object."""
    # Verify template belongs to entity
    tpl = await db.execute(
        select(EmailTemplate.id).where(
            EmailTemplate.id == template_id,
            EmailTemplate.entity_id == entity_id,
        )
    )
    if not tpl.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Template not found")

    link = EmailTemplateLink(
        template_id=template_id,
        link_type=body.link_type,
        link_id=body.link_id,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


@router.delete("/{template_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_link(
    template_id: UUID,
    link_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a template link."""
    result = await db.execute(
        select(EmailTemplateLink).where(
            EmailTemplateLink.id == link_id,
            EmailTemplateLink.template_id == template_id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    await db.delete(link)
    await db.commit()


# ── Availability check (for conditional UI) ────────────────────────────────

@router.get("/check/{slug}", response_model=EmailTemplateCheckResponse)
async def check_template_availability(
    slug: str,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Check if a template is configured and active.

    Used by the frontend to conditionally show/hide action buttons
    (e.g. "Envoyer une invitation" only if user_invitation template exists).
    """
    result = await db.execute(
        select(EmailTemplate)
        .options(selectinload(EmailTemplate.versions))
        .where(
            EmailTemplate.slug == slug,
            EmailTemplate.entity_id == entity_id,
        )
    )
    template = result.scalar_one_or_none()

    if not template:
        return EmailTemplateCheckResponse(available=False)

    active_langs = list({v.language for v in template.versions if v.is_active})

    return EmailTemplateCheckResponse(
        available=template.enabled and len(active_langs) > 0,
        enabled=template.enabled,
        template_id=template.id,
        active_languages=active_langs,
    )


# ── Preview ────────────────────────────────────────────────────────────────

@router.post("/{template_id}/preview")
async def preview_template(
    template_id: UUID,
    body: EmailPreviewRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Preview a rendered template version with sample variables."""
    result = await db.execute(
        select(EmailTemplateVersion).where(
            EmailTemplateVersion.id == body.version_id,
            EmailTemplateVersion.template_id == template_id,
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    subject = render_template_string(version.subject, body.variables)
    body_html = render_template_string(version.body_html, body.variables)

    return {
        "subject": subject,
        "body_html": body_html,
    }


# ── Seed defaults ──────────────────────────────────────────────────────────

@router.post("/seed", status_code=201)
async def seed_default_templates(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Seed default templates for the current entity.

    Idempotent: only creates templates that don't already exist.
    """
    from app.core.email_templates import DEFAULT_TEMPLATES

    created = []
    for tpl_def in DEFAULT_TEMPLATES:
        existing = await db.execute(
            select(EmailTemplate.id).where(
                EmailTemplate.entity_id == entity_id,
                EmailTemplate.slug == tpl_def["slug"],
            )
        )
        if existing.scalar_one_or_none():
            continue

        template = EmailTemplate(
            entity_id=entity_id,
            slug=tpl_def["slug"],
            name=tpl_def["name"],
            description=tpl_def.get("description"),
            object_type=tpl_def.get("object_type", "system"),
            enabled=True,
            variables_schema=tpl_def.get("variables_schema"),
        )
        db.add(template)
        await db.flush()  # Get the ID

        # Create default versions
        for lang, content in tpl_def.get("default_versions", {}).items():
            version = EmailTemplateVersion(
                template_id=template.id,
                version=1,
                language=lang,
                subject=content["subject"],
                body_html=content["body_html"],
                is_active=True,
                created_by=current_user.id,
            )
            db.add(version)

        created.append(tpl_def["slug"])

    await db.commit()
    return {"seeded": created, "count": len(created)}


# ── Helpers ────────────────────────────────────────────────────────────────

async def _deactivate_language_versions(
    db: AsyncSession,
    template_id: UUID,
    language: str,
) -> None:
    """Deactivate all versions of a template for a given language."""
    result = await db.execute(
        select(EmailTemplateVersion).where(
            EmailTemplateVersion.template_id == template_id,
            EmailTemplateVersion.language == language,
            EmailTemplateVersion.is_active == True,  # noqa: E712
        )
    )
    for v in result.scalars():
        v.is_active = False
